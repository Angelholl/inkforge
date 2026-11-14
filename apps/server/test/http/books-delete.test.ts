import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RunDto } from '@inkforge/shared';
import { loadConfig } from '../../src/config';
import { buildApp } from '../../src/app';
import { createDefaultMockProvider } from '../../src/llm/mock';
import { openDb, type Database } from '../../src/db/open';

let dir: string;
let db: Database;
let app: Awaited<ReturnType<typeof buildApp>>;
let bookId: string;

/** 按书聚合计数（覆盖经 chapters/runs/characters 中转的关联表）。 */
function countByBook(sql: string): number {
  return (db.prepare(sql).get(bookId) as { n: number }).n;
}

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkforge-books-delete-'));
  const config = loadConfig({ STRATA_BASE_URL: 'http://127.0.0.1:47831/v1', STRATA_API_KEY: 'strata', STRATA_MODEL: 'iq3_xxs', INKFORGE_DATA_DIR: dir });
  db = openDb(path.join(config.dataDir, 'inkforge.db'));
  app = await buildApp({ config, provider: createDefaultMockProvider(), db, inlineQueue: true });

  const created = await app.inject({
    method: 'POST',
    url: '/api/books',
    payload: { title: '删书测试书', characters: [{ name: '张三' }] },
  });
  expect(created.statusCode).toBe(201);
  bookId = (created.json() as { id: string }).id;

  const imported = await app.inject({
    method: 'POST',
    url: `/api/books/${bookId}/import-original`,
    payload: { chapters: [{ title: '第一章 山门', content: '少年抬头望向远方，山风掠过松林，影子被夕阳拉得很长。' }] },
  });
  expect(imported.statusCode).toBe(201);

  const bp = await app.inject({
    method: 'PUT',
    url: `/api/books/${bookId}/chapters/2/blueprint`,
    payload: { title: '第二章', blueprint: { goal: '推进主线', beats: ['进镇'], mustHaveBeats: [], bannedTopics: [] }, targetChars: 500 },
  });
  expect(bp.statusCode).toBe(200);

  // 真实 generate 产 runs/run_steps/chapter_versions/summaries（mock 内联队列）
  const gen = await app.inject({ method: 'POST', url: `/api/books/${bookId}/chapters/2/generate`, payload: {} });
  expect(gen.statusCode).toBe(202);
  const runId = (gen.json() as { runId: string }).runId;
  let run: RunDto | null = null;
  for (let i = 0; i < 100; i++) {
    await new Promise((r) => setTimeout(r, 100));
    const rr = await app.inject({ method: 'GET', url: `/api/runs/${runId}` });
    run = rr.json() as RunDto;
    if (run.status === 'done' || run.status === 'failed') break;
  }
  expect(run?.status).toBe('done');

  // 流水线可能不产的工件直插补齐（伏笔无手动 CRUD 入口；partial 按真实 step 补一行）
  db.prepare(
    "INSERT INTO foreshadowings(id, book_id, description, planted_ch, advanced_json, status, created_at) VALUES('fs-del-1', ?, '玉佩来历', 1, '[]', 'open', ?)",
  ).run(bookId, new Date().toISOString());
  const characterId = (db.prepare('SELECT id FROM characters WHERE book_id = ? LIMIT 1').get(bookId) as { id: string }).id;
  db.prepare(
    "INSERT INTO character_states(id, character_id, chapter_no, state_json, created_at) VALUES('cs-del-1', ?, 1, '{}', ?)",
  ).run(characterId, new Date().toISOString());
  const stepId = (db.prepare('SELECT id FROM run_steps WHERE run_id = ? LIMIT 1').get(runId) as { id: string }).id;
  db.prepare(
    "INSERT OR IGNORE INTO partial_outputs(run_step_id, content, updated_at) VALUES(?, '残稿片段', ?)",
  ).run(stepId, new Date().toISOString());
  // 全局工件（风格档案不入书级联）直插一行，删书后须原样保留
  db.prepare(
    "INSERT INTO style_profiles(id, name, source_path, source_hash, version, rules_json, samples_json, metrics_json, created_at) VALUES('sp-del-1', '公版档案', 'inline:abcd1234', 'h', 1, '{}', '[]', '{}', ?)",
  ).run(new Date().toISOString());
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
    /* Windows 锁瞬态 */
  }
});

describe('DELETE /api/books/:bookId', () => {
  it('删书级联：200 后 book 404，全部关联表清零', async () => {
    // 删除前各表确有数据（级联断言非空过）
    expect(countByBook('SELECT COUNT(*) AS n FROM chapters WHERE book_id = ?')).toBeGreaterThan(0);
    expect(countByBook('SELECT COUNT(*) AS n FROM chapter_versions v JOIN chapters c ON c.id = v.chapter_id WHERE c.book_id = ?')).toBeGreaterThan(0);
    expect(countByBook('SELECT COUNT(*) AS n FROM chapter_fts f JOIN chapters c ON c.id = f.chapter_id WHERE c.book_id = ?')).toBeGreaterThan(0);
    expect(countByBook('SELECT COUNT(*) AS n FROM runs WHERE book_id = ?')).toBeGreaterThan(0);
    expect(countByBook('SELECT COUNT(*) AS n FROM run_steps s JOIN runs r ON r.id = s.run_id WHERE r.book_id = ?')).toBeGreaterThan(0);
    expect(countByBook('SELECT COUNT(*) AS n FROM partial_outputs p JOIN run_steps s ON s.id = p.run_step_id JOIN runs r ON r.id = s.run_id WHERE r.book_id = ?')).toBeGreaterThan(0);
    expect(countByBook('SELECT COUNT(*) AS n FROM chapter_summaries WHERE book_id = ?')).toBeGreaterThan(0);
    expect(countByBook('SELECT COUNT(*) AS n FROM characters WHERE book_id = ?')).toBeGreaterThan(0);
    expect(countByBook('SELECT COUNT(*) AS n FROM character_states cs JOIN characters c ON c.id = cs.character_id WHERE c.book_id = ?')).toBeGreaterThan(0);
    expect(countByBook('SELECT COUNT(*) AS n FROM foreshadowings WHERE book_id = ?')).toBeGreaterThan(0);

    const r = await app.inject({ method: 'DELETE', url: `/api/books/${bookId}` });
    expect(r.statusCode).toBe(200);
    expect(r.json() as { ok: boolean }).toEqual({ ok: true });

    expect(await app.inject({ method: 'GET', url: `/api/books/${bookId}` }).then((x) => x.statusCode)).toBe(404);
    expect(countByBook('SELECT COUNT(*) AS n FROM chapters WHERE book_id = ?')).toBe(0);
    expect(countByBook('SELECT COUNT(*) AS n FROM chapter_versions v JOIN chapters c ON c.id = v.chapter_id WHERE c.book_id = ?')).toBe(0);
    expect(countByBook('SELECT COUNT(*) AS n FROM chapter_fts f JOIN chapters c ON c.id = f.chapter_id WHERE c.book_id = ?')).toBe(0);
    expect(countByBook('SELECT COUNT(*) AS n FROM runs WHERE book_id = ?')).toBe(0);
    expect(countByBook('SELECT COUNT(*) AS n FROM run_steps s JOIN runs r ON r.id = s.run_id WHERE r.book_id = ?')).toBe(0);
    expect(countByBook('SELECT COUNT(*) AS n FROM partial_outputs p JOIN run_steps s ON s.id = p.run_step_id JOIN runs r ON r.id = s.run_id WHERE r.book_id = ?')).toBe(0);
    expect(countByBook('SELECT COUNT(*) AS n FROM chapter_summaries WHERE book_id = ?')).toBe(0);
    expect(countByBook('SELECT COUNT(*) AS n FROM characters WHERE book_id = ?')).toBe(0);
    expect(countByBook('SELECT COUNT(*) AS n FROM character_states cs JOIN characters c ON c.id = cs.character_id WHERE c.book_id = ?')).toBe(0);
    expect(countByBook('SELECT COUNT(*) AS n FROM foreshadowings WHERE book_id = ?')).toBe(0);
    // 全局工件不受牵连：风格档案原样保留
    expect((db.prepare("SELECT COUNT(*) AS n FROM style_profiles WHERE id = 'sp-del-1'").get() as { n: number }).n).toBe(1);
  });

  it('书不存在 → 404', async () => {
    const r = await app.inject({ method: 'DELETE', url: '/api/books/no-such-book' });
    expect(r.statusCode).toBe(404);
  });

  it('存在 running run → 409，取消后可删', async () => {
    const created = await app.inject({ method: 'POST', url: '/api/books', payload: { title: '409 守卫书' } });
    const guardId = (created.json() as { id: string }).id;
    db.prepare(
      "INSERT INTO runs(id, book_id, mode, status, chapter_scope_json, skip_failures, salvage_partial, max_rounds, created_at) VALUES('guard-run-1', ?, 'generate', 'running', '[1,1]', 1, 1, 2, ?)",
    ).run(guardId, new Date().toISOString());

    const conflict = await app.inject({ method: 'DELETE', url: `/api/books/${guardId}` });
    expect(conflict.statusCode).toBe(409);

    db.prepare("UPDATE runs SET status = 'cancelled' WHERE id = 'guard-run-1'").run();
    const ok = await app.inject({ method: 'DELETE', url: `/api/books/${guardId}` });
    expect(ok.statusCode).toBe(200);
  });
});
