import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config';
import { buildApp } from '../../src/app';
import { openDb } from '../../src/db/open';
import { createDefaultMockProvider, createMockProvider } from '../../src/llm/mock';
import { upsertBlueprint } from '../../src/db/repositories/chapters';
import type { CompletionRequest, LlmProvider } from '../../src/llm/types';

// 行文样：GOAL/BEATS/HOOK 协议（parseBlueprint 兼容；mustHaveBeats 恒 []——确定性叠加不靠模型）
const BLUEPRINT_TEXT = `GOAL: 主角与房东初次正面撞接
BEATS:
- 门口对峙
- 借口周旋
HOOK: 门内传来第二个人声`;

const TREE = {
  volumes: [
    {
      title: '卷一', body: '', seq: 1,
      stages: [{ title: '开局', body: '', seq: 1, cards: [{ title: '第一夜', body: 'H（撞见场：房东×阿美）', seq: 1, chapterFrom: 1, chapterTo: 2 }] }],
    },
  ],
};

describe('blueprint-suggest 大纲卡注入与确定性叠加（DEC-2026-1120-10）', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let bookId: string;
  const plannerCalls: CompletionRequest[] = [];

  beforeAll(async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkforge-bp-suggest-'));
    const config = loadConfig({
      STRATA_BASE_URL: 'http://127.0.0.1:47831/v1', STRATA_API_KEY: 'strata', STRATA_MODEL: 'iq3_xxs',
      INKFORGE_DATA_DIR: path.join(dir, 'srv'),
    });
    const plannerInner = createMockProvider({ summarize: { text: BLUEPRINT_TEXT } });
    const plannerProvider: LlmProvider = {
      async complete(req) { plannerCalls.push(req); return plannerInner.complete(req); },
    };
    const db = openDb(path.join(config.dataDir, 'inkforge.db'));
    app = await buildApp({ config, provider: createDefaultMockProvider(), plannerProvider, db, inlineQueue: true });
    // 书籍简介 300 字：task 内容（协议行 ~210 + 简介 300 + 尾部两行）≈570 字 > 旧 300 预算，用于钉 800 预算断言
    const created = await app.inject({ method: 'POST', url: '/api/books', payload: { title: '蓝图卡测书', description: '介'.repeat(300) } });
    bookId = (created.json() as { id: string }).id;
    const put = await app.inject({ method: 'PUT', url: `/api/books/${bookId}/outline-tree`, payload: { tree: TREE } });
    expect(put.statusCode).toBe(200);
  });

  afterAll(async () => { await app.close(); });

  it('命中章：task 侧注入【本章大纲卡】+ 响应蓝图确定性带落地格 mustHaveBeats（含 grade）', async () => {
    const sug = await app.inject({ method: 'POST', url: `/api/books/${bookId}/blueprint-suggest`, payload: { chapterNo: 1 } });
    expect(sug.statusCode).toBe(200);
    const plannerReq = plannerCalls[plannerCalls.length - 1];
    expect(plannerReq.user).toContain('【本章大纲卡】');
    expect(plannerReq.user).toContain('第1-2章 第一夜：H（撞见场：房东×阿美）');
    const bp = (sug.json() as { blueprint: { mustHaveBeats: Array<{ text: string; keywords: string[]; grade?: string }> } }).blueprint;
    expect(bp.mustHaveBeats).toEqual([{ text: 'H（撞见场：房东×阿美）', keywords: ['撞见场', '房东', '阿美'], grade: 'H' }]);
  });

  it('未命中章（chapterNo=9）：不注入大纲卡槽、不叠加 mustHaveBeats', async () => {
    const sug = await app.inject({ method: 'POST', url: `/api/books/${bookId}/blueprint-suggest`, payload: { chapterNo: 9 } });
    expect(sug.statusCode).toBe(200);
    const plannerReq = plannerCalls[plannerCalls.length - 1];
    expect(plannerReq.user).not.toContain('【本章大纲卡】');
    expect((sug.json() as { blueprint: { mustHaveBeats: unknown[] } }).blueprint.mustHaveBeats).toEqual([]);
  });

  it('task 预算 800：renderBlueprintTask 尾部（连续性摘要行）不再被截断', async () => {
    await app.inject({ method: 'POST', url: `/api/books/${bookId}/blueprint-suggest`, payload: { chapterNo: 2 } });
    const req = plannerCalls[plannerCalls.length - 1];
    // 旧 300 预算时 task 槽 head 截断会把尾部两行切掉；800 预算下尾行存活
    expect(req.user).toContain('【连续性摘要】（无）');
    expect(req.user).toContain('【书籍简介】介介介');
  });
});

describe('PUT blueprint 保存保留既有 mustHaveBeats（DEC-2026-1120-10 防洗掉）', () => {
  let app2: Awaited<ReturnType<typeof buildApp>>;
  let bookId2: string;

  beforeAll(async () => {
    const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'inkforge-bp-put-'));
    const config2 = loadConfig({
      STRATA_BASE_URL: 'http://127.0.0.1:47831/v1', STRATA_API_KEY: 'strata', STRATA_MODEL: 'iq3_xxs',
      INKFORGE_DATA_DIR: path.join(dir2, 'srv'),
    });
    const db2 = openDb(path.join(config2.dataDir, 'inkforge.db'));
    app2 = await buildApp({ config: config2, provider: createDefaultMockProvider(), db: db2, inlineQueue: true });
    const created = await app2.inject({ method: 'POST', url: '/api/books', payload: { title: '蓝图保留测书' } });
    bookId2 = (created.json() as { id: string }).id;
    upsertBlueprint(db2, {
      bookId: bookId2,
      chapterNo: 1,
      title: '第1章',
      blueprint: { goal: 'g', beats: [], mustHaveBeats: [{ text: 'X（场景一）', keywords: ['场景一'], grade: 'H' }], bannedTopics: [] },
    });
  });

  afterAll(async () => { await app2.close(); });

  const savedBeats = async (): Promise<Array<{ text: string; keywords: string[]; grade?: string }>> => {
    const book = (await app2.inject({ method: 'GET', url: `/api/books/${bookId2}` })).json() as {
      chapters: Array<{ blueprint: { mustHaveBeats: Array<{ text: string; keywords: string[]; grade?: string }> } }>;
    };
    return book.chapters[0].blueprint.mustHaveBeats;
  };

  it('建议缺 mustHaveBeats → 预填（含 grade）保留', async () => {
    const put = await app2.inject({
      method: 'PUT',
      url: `/api/books/${bookId2}/chapters/1/blueprint`,
      payload: { title: '第1章', blueprint: { goal: 'g2', beats: ['b'], mustHaveBeats: [], bannedTopics: [] } },
    });
    expect(put.statusCode).toBe(200);
    expect(await savedBeats()).toEqual([{ text: 'X（场景一）', keywords: ['场景一'], grade: 'H' }]);
  });

  it('建议带新增条目 → 并集；重复 text（trim 变体）不重且预填 grade 存活', async () => {
    const put = await app2.inject({
      method: 'PUT',
      url: `/api/books/${bookId2}/chapters/1/blueprint`,
      payload: {
        title: '第1章',
        blueprint: {
          goal: 'g3',
          beats: [],
          mustHaveBeats: [{ text: 'Y（场景二）', keywords: ['场景二'] }, { text: ' X（场景一） ', keywords: ['场景一'] }],
          bannedTopics: [],
        },
      },
    });
    expect(put.statusCode).toBe(200);
    expect(await savedBeats()).toEqual([
      { text: 'X（场景一）', keywords: ['场景一'], grade: 'H' },
      { text: 'Y（场景二）', keywords: ['场景二'] },
    ]);
  });
});
