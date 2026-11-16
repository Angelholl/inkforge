import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config';
import { buildApp } from '../../src/app';
import { createDefaultMockProvider } from '../../src/llm/mock';
import { openDb, type Database } from '../../src/db/open';
import { setCurrentVersion } from '../../src/db/repositories/chapters';

// B2 裁决①（DEC-2026-1116-01）：章节版本硬删 + 删前快照 + 墓碑
let dir: string;
let db: Database;
let app: Awaited<ReturnType<typeof buildApp>>;
let bookId: string;
let chapterId: string;

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkforge-versions-delete-'));
  const config = loadConfig({ STRATA_BASE_URL: 'http://127.0.0.1:47831/v1', STRATA_API_KEY: 'strata', STRATA_MODEL: 'iq3_xxs', INKFORGE_DATA_DIR: dir });
  db = openDb(path.join(config.dataDir, 'inkforge.db'));
  app = await buildApp({ config, provider: createDefaultMockProvider(), db, inlineQueue: true });

  const created = await app.inject({ method: 'POST', url: '/api/books', payload: { title: '删除测试书' } });
  expect(created.statusCode).toBe(201);
  bookId = (created.json() as { id: string }).id;
  const bp = await app.inject({
    method: 'PUT',
    url: `/api/books/${bookId}/chapters/1/blueprint`,
    payload: { title: '第一章', blueprint: { goal: '推进主线', beats: [], mustHaveBeats: [], bannedTopics: [] }, targetChars: 500 },
  });
  expect(bp.statusCode).toBe(200);
  chapterId = (db.prepare('SELECT id FROM chapters WHERE book_id = ? AND chapter_no = 1').get(bookId) as { id: string }).id;
});

afterAll(async () => {
  await app.close();
  try {
    db.close();
  } catch {
    /* ignore */
  }
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

function addVersion(kind: 'draft' | 'revised', opts: { parent?: string; runId?: string } = {}): string {
  const id = `v-${Math.random().toString(36).slice(2)}`;
  db.prepare(
    'INSERT INTO chapter_versions(id, chapter_id, parent_version_id, kind, content, word_count, run_id, params_json, style_sample_ids_json, created_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
  ).run(id, chapterId, opts.parent ?? null, kind, `正文-${id}`, 4, opts.runId ?? null, '{}', '[]', new Date().toISOString());
  return id;
}

function addRunReferencing(status: 'queued' | 'running' | 'paused' | 'done', versionId: string): void {
  const runId = `r-${Math.random().toString(36).slice(2)}`;
  db.prepare("INSERT INTO runs(id, book_id, mode, status, chapter_scope_json, created_at) VALUES(?,?, 'generate', ?, '{\"from\":1,\"to\":1}', ?)").run(
    runId,
    bookId,
    status,
    new Date().toISOString(),
  );
  db.prepare("INSERT INTO run_steps(id, run_id, chapter_id, step, attempt, status, output_version_id) VALUES(?,?,?,'draft',1,'done',?)").run(
    `rs-${runId}`,
    runId,
    chapterId,
    versionId,
  );
}

function versionRow(id: string): { id: string } | undefined {
  return db.prepare('SELECT id FROM chapter_versions WHERE id = ?').get(id) as { id: string } | undefined;
}

function del(versionId: string) {
  return app.inject({ method: 'DELETE', url: `/api/versions/${versionId}` });
}

describe('DELETE /api/versions/:versionId（B2 硬删四步）', () => {
  it('迁移 0006 在场：墓碑表列集恰为 7 列且不含 content', () => {
    const cols = (db.prepare("SELECT name FROM pragma_table_info('chapter_version_tombstones')").all() as Array<{ name: string }>)
      .map((r) => r.name)
      .sort();
    expect(cols).toEqual(['chapter_id', 'created_at', 'deleted_at', 'id', 'kind', 'run_id', 'word_count']);
  });

  it('current 版本拒删：409 reason=current 且原行仍在', async () => {
    const v = addVersion('draft');
    setCurrentVersion(db, chapterId, v);
    const r = await del(v);
    expect(r.statusCode).toBe(409);
    const body = r.json() as { error: string; reason: string };
    expect(body.reason).toBe('current');
    expect(body.error).toContain('当前版本不可删除');
    expect(versionRow(v)).toBeDefined();
  });

  it.each(['queued', 'running', 'paused'] as const)('活 run（%s）引用拒删：409 reason=run-active 且附 runStatus', async (status) => {
    const v = addVersion('draft');
    addRunReferencing(status, v);
    const r = await del(v);
    expect(r.statusCode).toBe(409);
    const body = r.json() as { error: string; reason: string; runStatus: string };
    expect(body.reason).toBe('run-active');
    expect(body.runStatus).toBe(status);
    expect(versionRow(v)).toBeDefined();
  });

  it('done run 引用放行：200 且版本行消失', async () => {
    const v = addVersion('draft');
    addRunReferencing('done', v);
    const r = await del(v);
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ ok: true });
    expect(versionRow(v)).toBeUndefined();
  });

  it('有子版本：删父得 200 且子行 parent_version_id 置 NULL（不级联删子）', async () => {
    const v1 = addVersion('draft');
    const v2 = addVersion('revised', { parent: v1 });
    setCurrentVersion(db, chapterId, v2);
    const r = await del(v1);
    expect(r.statusCode).toBe(200);
    const parent = (db.prepare('SELECT parent_version_id AS p FROM chapter_versions WHERE id = ?').get(v2) as { p: string | null }).p;
    expect(parent).toBeNull();
    expect(versionRow(v2)).toBeDefined();
  });

  it('无引用删除：留墓碑（元数据同原行、不存正文）+ 删前 -predelete- 快照落盘', async () => {
    const v = addVersion('draft');
    const before = db.prepare('SELECT kind, word_count, created_at FROM chapter_versions WHERE id = ?').get(v) as {
      kind: string;
      word_count: number;
      created_at: string;
    };
    const r = await del(v);
    expect(r.statusCode).toBe(200);
    expect(versionRow(v)).toBeUndefined();
    const tomb = db.prepare('SELECT * FROM chapter_version_tombstones WHERE id = ?').get(v) as Record<string, unknown>;
    expect(tomb).toMatchObject({ id: v, chapter_id: chapterId, kind: before.kind, word_count: before.word_count, created_at: before.created_at });
    expect(typeof tomb.deleted_at).toBe('string');
    expect('content' in tomb).toBe(false);
    const snaps = fs.readdirSync(path.join(dir, 'backups', bookId)).filter((f) => f.includes('-predelete-'));
    expect(snaps.length).toBeGreaterThanOrEqual(1);
  });

  it('不存在的版本 404', async () => {
    const r = await del('no-such-version');
    expect(r.statusCode).toBe(404);
    expect(r.json()).toMatchObject({ error: 'not found' });
  });

  it('GET /api/versions/:versionId/qc 回读 qc 步明细（l0/l1/gate 逐 attempt），版本不存在 404', async () => {
    const v = addVersion('draft');
    const runId = `r-qc-${Math.random().toString(36).slice(2)}`;
    db.prepare("INSERT INTO runs(id, book_id, mode, status, chapter_scope_json, created_at) VALUES(?,?, 'generate', 'done', '{\"from\":1,\"to\":1}', ?)").run(
      runId,
      bookId,
      new Date().toISOString(),
    );
    db.prepare("INSERT INTO run_steps(id, run_id, chapter_id, step, attempt, status, output_version_id, output_json) VALUES(?,?,?,'qc',1,'done',?,?)").run(
      `rs-${runId}`,
      runId,
      chapterId,
      v,
      JSON.stringify({ l0: { checks: [], hardFail: false }, l1: { overall: 7, findings: [] }, gate: { action: 'rewrite', reasons: ['overall 7 < 8'] } }),
    );
    const r = await app.inject({ method: 'GET', url: `/api/versions/${v}/qc` });
    expect(r.statusCode).toBe(200);
    const body = r.json() as { attempts: Array<{ attempt: number; l1: { overall: number }; gate: { action: string; reasons: string[] } }> };
    expect(body.attempts).toHaveLength(1);
    expect(body.attempts[0]).toMatchObject({ attempt: 1, l1: { overall: 7 }, gate: { action: 'rewrite', reasons: ['overall 7 < 8'] } });
    const nf = await app.inject({ method: 'GET', url: '/api/versions/no-such-version/qc' });
    expect(nf.statusCode).toBe(404);
  });

  it('版本列表去 content 并包壳 currentVersionId', async () => {
    const v = addVersion('draft');
    setCurrentVersion(db, chapterId, v);
    const r = await app.inject({ method: 'GET', url: `/api/books/${bookId}/chapters/1/versions` });
    expect(r.statusCode).toBe(200);
    const body = r.json() as { currentVersionId: string | null; versions: Array<{ id: string; content?: string }> };
    expect(body.currentVersionId).toBe(v);
    expect(body.versions.some((x) => x.id === v)).toBe(true);
    expect(body.versions.every((x) => !('content' in x))).toBe(true);
  });
});
