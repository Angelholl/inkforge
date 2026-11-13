import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config';
import { buildApp } from '../../src/app';
import { createMockProvider } from '../../src/llm/mock';
import { openDb, type Database } from '../../src/db/open';

const OUTLINE_TEXT = [
  '# 1',
  'GOAL: 少年踏上旅途',
  'BEATS:',
  '- 告别村落',
  '- 初遇同伴',
  'HOOK: 身后炊烟散尽',
  '# 2',
  'GOAL: 入城遇阻',
  'BEATS:',
  '- 守卫盘查',
  '- 贵人相助',
  'HOOK: 贵人身份成谜',
].join('\n');

let dir: string;
let db: Database;
let app: Awaited<ReturnType<typeof buildApp>>;
let bookId: string;

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkforge-outline-'));
  const config = loadConfig({ STRATA_BASE_URL: 'http://127.0.0.1:47831/v1', STRATA_API_KEY: 'strata', STRATA_MODEL: 'iq3_xxs', INKFORGE_DATA_DIR: dir });
  db = openDb(path.join(config.dataDir, 'inkforge.db'));
  app = await buildApp({
    config,
    provider: createMockProvider({ summarize: { text: OUTLINE_TEXT } }),
    summarizerProvider: createMockProvider({ summarize: { text: OUTLINE_TEXT } }),
    plannerProvider: createMockProvider({ summarize: { text: OUTLINE_TEXT } }),
    db,
    inlineQueue: true,
  });
  const created = await app.inject({ method: 'POST', url: '/api/books', payload: { title: '入口B蓝图测试书', description: '修真大陆，少年逆天改命。' } });
  expect(created.statusCode).toBe(201);
  bookId = (created.json() as { id: string }).id;
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

describe('POST /api/books/:bookId/outline-suggest', () => {
  it('outline-suggest：注入 mock planner → 200 且两章蓝图逐章 goal 非空', async () => {
    const r = await app.inject({ method: 'POST', url: `/api/books/${bookId}/outline-suggest`, payload: { chapterCount: 2 } });
    expect(r.statusCode).toBe(200);
    const body = r.json() as { outline: Array<{ chapterNo: number; blueprint: { goal: string; beats: string[] } }>; source: string };
    expect(body.source).toBe('llm');
    expect(body.outline).toHaveLength(2);
    expect(body.outline[0].chapterNo).toBe(1);
    expect(body.outline[0].blueprint.goal).toBe('少年踏上旅途');
    expect(body.outline[0].blueprint.beats.length).toBeGreaterThan(0);
    expect(body.outline[1].chapterNo).toBe(2);
    expect(body.outline[1].blueprint.goal).toBe('入城遇阻');
  });

  it('outline-suggest：不存在 bookId → 404；chapterCount=0 → 400', async () => {
    const missing = await app.inject({ method: 'POST', url: '/api/books/no-such-book/outline-suggest', payload: { chapterCount: 2 } });
    expect(missing.statusCode).toBe(404);
    const bad = await app.inject({ method: 'POST', url: `/api/books/${bookId}/outline-suggest`, payload: { chapterCount: 0 } });
    expect(bad.statusCode).toBe(400);
  });
});
