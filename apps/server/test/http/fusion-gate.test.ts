import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config';
import { buildApp } from '../../src/app';
import { openDb } from '../../src/db/open';
import { createDefaultMockProvider, createMockProvider, type MockScript } from '../../src/llm/mock';
import type { CompletionRequest, LlmProvider } from '../../src/llm/types';

// 中性仿形 canned 文本（自造占位，禁引 v6 真实文本）
const TENSION_TEXT = [
  'TENSION: 描写密度 | 设定集主张详尽铺陈 | 档案规则偏好留白 | 拉扯 | 偏向档案规则',
  'TENSION: 场景推进 | 大纲卡要求强情节 | 档案规则要求慢节奏 | 冗余 | 保持现状',
].join('\n');

const EXPECTED_ROWS = [
  {
    entry: '描写密度',
    mdSide: '设定集主张详尽铺陈',
    profileSide: '档案规则偏好留白',
    nature: '拉扯',
    suggestion: '偏向档案规则',
  },
  {
    entry: '场景推进',
    mdSide: '大纲卡要求强情节',
    profileSide: '档案规则要求慢节奏',
    nature: '冗余',
    suggestion: '保持现状',
  },
];

// FG-03 只建 analyze describe；FG-04 将在同文件追加 gate/confirm describe（勿预建）
describe('POST /api/books/:bookId/fusion-gate/analyze（Task-03；可见降级钉）', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let bookId: string;
  let emptyBookId: string;
  const plannerCalls: CompletionRequest[] = [];
  let summarizeScript: NonNullable<MockScript['summarize']> = { text: TENSION_TEXT };

  // plannerProvider 缝形态沿 blueprint-suggest.test.ts:40-44：mock 包裹 + 记录调用
  const plannerProvider: LlmProvider = {
    async complete(req) {
      plannerCalls.push(req);
      return createMockProvider({ summarize: summarizeScript }).complete(req);
    },
  };

  beforeAll(async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkforge-fusion-gate-'));
    const config = loadConfig({
      STRATA_BASE_URL: 'http://127.0.0.1:47831/v1',
      STRATA_API_KEY: 'strata',
      STRATA_MODEL: 'iq3_xxs',
      INKFORGE_DATA_DIR: path.join(dir, 'srv'),
    });
    const db = openDb(path.join(config.dataDir, 'inkforge.db'));
    app = await buildApp({ config, provider: createDefaultMockProvider(), plannerProvider, db, inlineQueue: true });
    const created = await app.inject({
      method: 'POST',
      url: '/api/books',
      payload: { title: '张力对照测书', description: '描述：示例设定简介。', outline: '大纲：示例卷一。' },
    });
    bookId = (created.json() as { id: string }).id;
    const empty = await app.inject({ method: 'POST', url: '/api/books', payload: { title: '空书' } });
    emptyBookId = (empty.json() as { id: string }).id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('planner mock 输出两行合法协议 → 200 { rows 钉值, degraded: false }', async () => {
    summarizeScript = { text: TENSION_TEXT };
    const res = await app.inject({
      method: 'POST',
      url: `/api/books/${bookId}/fusion-gate/analyze`,
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ rows: EXPECTED_ROWS, degraded: false });
    const req = plannerCalls[plannerCalls.length - 1]!;
    expect(req.meta.step).toBe('summarize');
    expect(req.timeoutMs).toBe(120000);
    expect(req.user).toContain('【描述】描述：示例设定简介。');
  });

  it('planner mock 输出垃圾文 → 200 { rows: [], degraded: true, degradeReason 非空 }', async () => {
    summarizeScript = { text: '这是一段自由文本，没有任何 TENSION 协议行。' };
    const res = await app.inject({
      method: 'POST',
      url: `/api/books/${bookId}/fusion-gate/analyze`,
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { rows: unknown[]; degraded: boolean; degradeReason?: string };
    expect(body.rows).toEqual([]);
    expect(body.degraded).toBe(true);
    expect(body.degradeReason).toBeTruthy();
  });

  it('planner mock complete 抛错 → 200 degraded: true（不 500/不阻断）', async () => {
    summarizeScript = { error: 'http_500', afterMs: 0 };
    const res = await app.inject({
      method: 'POST',
      url: `/api/books/${bookId}/fusion-gate/analyze`,
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { rows: unknown[]; degraded: boolean; degradeReason?: string };
    expect(body.rows).toEqual([]);
    expect(body.degraded).toBe(true);
    expect(body.degradeReason).toBeTruthy();
  });

  it('无绑无候选空书 → 200 { rows: [], degraded: true }（无对照面即降级）', async () => {
    // 即便 mock 仍能产出合法行，无对照面也须诚实降级、不凭空造张力行
    summarizeScript = { text: TENSION_TEXT };
    const before = plannerCalls.length;
    const res = await app.inject({
      method: 'POST',
      url: `/api/books/${emptyBookId}/fusion-gate/analyze`,
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ rows: [], degraded: true });
    expect(plannerCalls.length).toBe(before);
  });
});
