import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config';
import { buildApp } from '../../src/app';
import { createMockProvider } from '../../src/llm/mock';
import { openDb, type Database } from '../../src/db/open';
import type { LlmProvider } from '../../src/llm/types';

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

  it('outline-suggest：人物卡与大纲文本注入 planner 上下文', async () => {
    const captured: Array<{ system: string; user: string }> = [];
    const capturingPlanner: LlmProvider = {
      complete: async (req) => {
        captured.push({ system: req.system, user: req.user });
        return { text: OUTLINE_TEXT, usage: { promptTokens: 0, completionTokens: 0 }, finishReason: 'stop' };
      },
    };
    const app2 = await buildApp({
      config: loadConfig({ STRATA_BASE_URL: 'http://127.0.0.1:47831/v1', STRATA_API_KEY: 'strata', STRATA_MODEL: 'iq3_xxs', INKFORGE_DATA_DIR: dir }),
      provider: createMockProvider({ draft: { text: 'x' }, qc: { text: '' }, summarize: { text: 'y' } }),
      plannerProvider: capturingPlanner,
      db,
      inlineQueue: true,
    });
    try {
      const created = await app2.inject({
        method: 'POST',
        url: '/api/books',
        payload: {
          title: '卡槽注入测书',
          description: '修真大陆，宗门林立。',
          outline: '第一卷：草原崛起；第二卷：夺回王城',
          characters: [{ name: '张三', baseSetting: '{"身份":"主角"}' }],
        },
      });
      expect(created.statusCode).toBe(201);
      const book2Id = (created.json() as { id: string }).id;
      const r = await app2.inject({ method: 'POST', url: `/api/books/${book2Id}/outline-suggest`, payload: { chapterCount: 2 } });
      expect(r.statusCode).toBe(200);
      expect(captured.length).toBe(1);
      expect(captured[0].user).toContain('【人物卡】张三');
      expect(captured[0].user).toContain('身份: 主角');
      expect(captured[0].user).toContain('草原崛起');
      expect(captured[0].user).toContain('修真大陆，宗门林立。');
    } finally {
      await app2.close();
    }
  });
});
