import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config';
import { buildApp } from '../../src/app';
import { createDefaultMockProvider } from '../../src/llm/mock';
import { openDb, type Database } from '../../src/db/open';

// DEC-2026-1120-02：章级删除（依赖序清理 + 删前快照 + 活动 run 409 + runs 头保留）
let dir: string;
let db: Database;
let app: Awaited<ReturnType<typeof buildApp>>;
let bookId: string;
let ch1Id: string;

const count = (sql: string, ...args: (string | number)[]): number => (db.prepare(sql).get(...args) as { n: number }).n;
const now = () => new Date().toISOString();

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkforge-chapters-delete-'));
  const config = loadConfig({ STRATA_BASE_URL: 'http://127.0.0.1:47831/v1', STRATA_API_KEY: 'strata', STRATA_MODEL: 'iq3_xxs', INKFORGE_DATA_DIR: dir });
  db = openDb(path.join(config.dataDir, 'inkforge.db'));
  app = await buildApp({ config, provider: createDefaultMockProvider(), db, inlineQueue: true });
  const created = await app.inject({ method: 'POST', url: '/api/books', payload: { title: '删章测试书' } });
  bookId = (created.json() as { id: string }).id;
  for (const no of [1, 2, 3]) {
    const bp = await app.inject({
      method: 'PUT',
      url: `/api/books/${bookId}/chapters/${no}/blueprint`,
      payload: { title: `第${no}章`, blueprint: { goal: '推进主线', beats: [], mustHaveBeats: [], bannedTopics: [] }, targetChars: 500 },
    });
    expect(bp.statusCode).toBe(200);
  }
  ch1Id = (db.prepare('SELECT id FROM chapters WHERE book_id = ? AND chapter_no = 1').get(bookId) as { id: string }).id;
  // 章 1 全套关联：版本 / FTS / 摘要 / 人物状态 / done run + step + partial_output
  db.prepare(
    "INSERT INTO chapter_versions(id, chapter_id, kind, content, word_count, params_json, style_sample_ids_json, created_at) VALUES('cv1', ?, 'draft', '正文一', 3, '{}', '[]', ?)",
  ).run(ch1Id, now());
  db.prepare('INSERT INTO chapter_fts(chapter_id, content) VALUES(?, ?)').run(ch1Id, '正文一');
  db.prepare(
    'INSERT INTO chapter_summaries(id, book_id, chapter_no, summary, beats_json, open_threads_json, created_at) VALUES(?,?,?,?,?,?,?)',
  ).run('cs1', bookId, 1, '摘要一', '[]', '[]', now());
  db.prepare('INSERT INTO characters(id, book_id, name, base_setting, created_at) VALUES(?,?,?,?,?)').run('char-x', bookId, '张三', '{}', now());
  db.prepare('INSERT INTO character_states(id, character_id, chapter_no, state_json, created_at) VALUES(?,?,?,?,?)').run('cst1', 'char-x', 1, '{}', now());
  db.prepare("INSERT INTO runs(id, book_id, mode, status, chapter_scope_json, created_at) VALUES('r-done', ?, 'generate', 'done', '{\"from\":1,\"to\":1}', ?)").run(bookId, now());
  db.prepare("INSERT INTO run_steps(id, run_id, chapter_id, step, attempt, status) VALUES('rs1', 'r-done', ?, 'draft', 1, 'done')").run(ch1Id);
  db.prepare('INSERT INTO partial_outputs(run_step_id, content, updated_at) VALUES(?, ?, ?)').run('rs1', '半成品', now());
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

describe('删章（DEC-2026-1120-02）', () => {
  it('成功删除：ok、该章关联行全清、runs 头保留、同章 2/3 不受累、快照落盘', async () => {
    const r = await app.inject({ method: 'DELETE', url: `/api/books/${bookId}/chapters/1` });
    expect(r.statusCode).toBe(200);
    expect((r.json() as { ok: boolean }).ok).toBe(true);
    expect(count('SELECT COUNT(*) AS n FROM chapters WHERE book_id = ? AND chapter_no = 1', bookId)).toBe(0);
    expect(count('SELECT COUNT(*) AS n FROM chapters WHERE book_id = ?', bookId)).toBe(2); // 章 2/3 不受累
    expect(count('SELECT COUNT(*) AS n FROM chapter_versions WHERE id = ?', 'cv1')).toBe(0);
    expect(count('SELECT COUNT(*) AS n FROM chapter_fts WHERE chapter_id = ?', ch1Id)).toBe(0);
    expect(count('SELECT COUNT(*) AS n FROM chapter_summaries WHERE book_id = ? AND chapter_no = 1', bookId)).toBe(0);
    expect(count('SELECT COUNT(*) AS n FROM character_states WHERE chapter_no = 1')).toBe(0);
    expect(count('SELECT COUNT(*) AS n FROM run_steps WHERE id = ?', 'rs1')).toBe(0);
    expect(count('SELECT COUNT(*) AS n FROM partial_outputs WHERE run_step_id = ?', 'rs1')).toBe(0);
    expect(count('SELECT COUNT(*) AS n FROM runs WHERE id = ?', 'r-done')).toBe(1); // runs 头保留
    expect(fs.readdirSync(path.join(dir, 'backups', bookId)).length).toBeGreaterThan(0); // 快照落盘
  });

  it('未知书 / 未知章 → 404；章号非法 → 400', async () => {
    const badBook = await app.inject({ method: 'DELETE', url: '/api/books/nope/chapters/1' });
    expect(badBook.statusCode).toBe(404);
    const badChapter = await app.inject({ method: 'DELETE', url: `/api/books/${bookId}/chapters/99` });
    expect(badChapter.statusCode).toBe(404);
    const badNo = await app.inject({ method: 'DELETE', url: `/api/books/${bookId}/chapters/0` });
    expect(badNo.statusCode).toBe(400);
  });

  it('活动 run 覆盖该章 → 409 run-active；run 终态后同章可删', async () => {
    db.prepare("INSERT INTO runs(id, book_id, mode, status, chapter_scope_json, created_at) VALUES('r-live', ?, 'generate', 'queued', '{\"from\":2,\"to\":3}', ?)").run(bookId, now());
    const denied = await app.inject({ method: 'DELETE', url: `/api/books/${bookId}/chapters/2` });
    expect(denied.statusCode).toBe(409);
    const body = denied.json() as { reason: string; runId: string; runStatus: string };
    expect(body.reason).toBe('run-active');
    expect(body.runId).toBe('r-live');
    expect(body.runStatus).toBe('queued');
    db.prepare("UPDATE runs SET status = 'cancelled' WHERE id = 'r-live'").run();
    const ok = await app.inject({ method: 'DELETE', url: `/api/books/${bookId}/chapters/2` });
    expect(ok.statusCode).toBe(200);
  });
});
