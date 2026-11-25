import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config';
import { buildApp } from '../src/app';
import { createMockProvider } from '../src/llm/mock';
import { migrate } from '../src/db/migrate';
import { openDb, type Database } from '../src/db/open';
import { analyzePlot } from '../src/plot';
import { savePlotProfile, getPlotProfile, deletePlotProfile, listPlotProfiles } from '../src/db/repositories/plot';
import { createBook, setBookPlotProfile, getBook } from '../src/db/repositories/books';
import type { CompletionRequest, LlmProvider } from '../src/llm/types';

// DEC-2026-1120-03：剧情蒸馏（analyzePlot + 剧情档案库 + 书绑定注入 planner）
const PLOT_TEXT = `PLOT: 开篇以失踪信物立钩子。
PLOT: 第一卷单线复仇推进。
PLOT: 第二卷引入宿敌线双线交织。
PLOT: 每卷末以身份揭示收束。
PLOT: 高潮前安排一次全线挫败。
PLOT: 结局回收开篇信物完成闭环。`;

const BLUEPRINT_TEXT = `# 1
GOAL: 少年出发寻物
BEATS:
- 告别村落
- 初遇同伴
HOOK: 信物微光再现`;

const SAMPLE = '山川草木皆有意。'.repeat(60) + '少年负匣而行。'.repeat(40);

let db: Database;
let dir: string;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkforge-plot-'));
  db = openDb(path.join(dir, 't.db'));
  migrate(db);
});

afterAll(() => {
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

describe('analyzePlot（剧情蒸馏）', () => {
  it('PLOT 行解析：6 条结构行、hash/sourcePath 命名沿仿写先例', async () => {
    const provider = createMockProvider({ summarize: { text: PLOT_TEXT } });
    const draft = await analyzePlot({ db, provider }, { name: '剧情A', text: SAMPLE });
    expect(draft.structure).toHaveLength(6);
    expect(draft.structure[0]).toBe('开篇以失踪信物立钩子。');
    expect(draft.sourceHash).toHaveLength(64);
    expect(draft.sourcePath.startsWith('inline:')).toBe(true);
    expect(draft.name).toBe('剧情A');
  });

  it('无 PLOT 行 → 抛「剧情蒸馏失败：缺少 PLOT 行」', async () => {
    const provider = createMockProvider({ summarize: { text: '本书剧情紧凑，无行协议输出。' } });
    await expect(analyzePlot({ db, provider }, { name: '剧情B', text: SAMPLE })).rejects.toThrow('剧情蒸馏失败：缺少 PLOT 行');
  });

  it('去空白不足 200 字 → 抛错禁止蒸馏', async () => {
    const provider = createMockProvider({ summarize: { text: PLOT_TEXT } });
    await expect(analyzePlot({ db, provider }, { name: '剧情C', text: '太短。' })).rejects.toThrow('不足 200 字');
  });
});

describe('剧情档案库（repo）', () => {
  it('save/list/get/delete 全链：delete 解绑 books.plot_profile_id', () => {
    const book = createBook(db, { title: '剧情绑测书' });
    const { id } = savePlotProfile(db, { name: '剧情A', sourcePath: 'inline:abcd1234', sourceHash: 'a'.repeat(64), structure: ['钩子', '收束'] });
    const listed = listPlotProfiles(db);
    expect(listed).toHaveLength(1);
    expect(listed[0].structure).toEqual(['钩子', '收束']);
    setBookPlotProfile(db, book.id, id);
    expect(getBook(db, book.id)!.plotProfileId).toBe(id);
    expect(getPlotProfile(db, id)!.name).toBe('剧情A');
    expect(deletePlotProfile(db, id)).toBe(true);
    expect(getPlotProfile(db, id)).toBeUndefined();
    expect(getBook(db, book.id)!.plotProfileId).toBeNull(); // 解绑防悬挂
    expect(deletePlotProfile(db, id)).toBe(false);
  });
});

describe('剧情蒸馏 HTTP 层', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let bookId: string;
  const plannerCalls: CompletionRequest[] = [];

  beforeAll(async () => {
    const config = loadConfig({ STRATA_BASE_URL: 'http://127.0.0.1:47831/v1', STRATA_API_KEY: 'strata', STRATA_MODEL: 'iq3_xxs', INKFORGE_DATA_DIR: path.join(dir, 'srv') });
    const plannerInner = createMockProvider({ summarize: { text: BLUEPRINT_TEXT } });
    const plannerProvider: LlmProvider = {
      async complete(req) {
        plannerCalls.push(req);
        return plannerInner.complete(req);
      },
    };
    const db2 = openDb(path.join(config.dataDir, 'inkforge.db'));
    app = await buildApp({
      config,
      provider: createMockProvider({ summarize: { text: PLOT_TEXT } }), // analyze 走主 provider
      plannerProvider, // blueprint-suggest planner 注入缝（缺省 createRoleProvider 指向真实 STRATA 地址会挂死）
      db: db2,
      inlineQueue: true,
    });
    const created = await app.inject({ method: 'POST', url: '/api/books', payload: { title: '剧情注入测书' } });
    bookId = (created.json() as { id: string }).id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('analyze→save→bind→blueprint-suggest 注入【剧情参考】全链', async () => {
    const an = await app.inject({ method: 'POST', url: '/api/plot-profiles/analyze', payload: { name: '剧情H', text: SAMPLE } });
    expect(an.statusCode).toBe(200);
    const draft = (an.json() as { draft: { name: string; structure: string[] } }).draft;
    expect(draft.structure).toHaveLength(6);

    const saved = await app.inject({ method: 'POST', url: '/api/plot-profiles', payload: { draft } });
    expect(saved.statusCode).toBe(201);
    const pid = (saved.json() as { id: string }).id;

    const bound = await app.inject({ method: 'PUT', url: `/api/books/${bookId}/plot`, payload: { profileId: pid } });
    expect(bound.statusCode).toBe(200);
    expect((bound.json() as { plotProfileId: string }).plotProfileId).toBe(pid);

    const sug = await app.inject({ method: 'POST', url: `/api/books/${bookId}/blueprint-suggest`, payload: { chapterNo: 1 } });
    expect(sug.statusCode).toBe(200);
    const plannerReq = plannerCalls[plannerCalls.length - 1];
    expect(plannerReq.user).toContain('【剧情参考】');
    expect(plannerReq.user).toContain('开篇以失踪信物立钩子。');
  });

  it('plotReference 预算 1500，超 600 尾部存活（R-F3-2，DEC-2026-1125-03）', async () => {
    const longLine = '剧情线甲：' + '长'.repeat(880) + '尾部存活标';
    const saved = await app.inject({ method: 'POST', url: '/api/plot-profiles', payload: { draft: { name: '长剧情', sourcePath: 'inline:f3test', sourceHash: 'b'.repeat(64), structure: [longLine] } } });
    expect(saved.statusCode).toBe(201);
    const pid = (saved.json() as { id: string }).id;
    const bound = await app.inject({ method: 'PUT', url: `/api/books/${bookId}/plot`, payload: { profileId: pid } });
    expect(bound.statusCode).toBe(200);
    const sug = await app.inject({ method: 'POST', url: `/api/books/${bookId}/blueprint-suggest`, payload: { chapterNo: 1 } });
    expect(sug.statusCode).toBe(200);
    const req = plannerCalls[plannerCalls.length - 1];
    expect(req.user).toContain('【剧情参考】');
    expect(req.user).toContain('尾部存活标'); // 旧预算 600 head 截断丢该标记=红；1500 存活=绿
  });

  it('解绑（profileId=null）与未知档案 404', async () => {
    const listed = await app.inject({ method: 'GET', url: '/api/plot-profiles' });
    expect((listed.json() as Array<{ id: string }>)[0].id).toBeTruthy();
    const un = await app.inject({ method: 'PUT', url: `/api/books/${bookId}/plot`, payload: { profileId: null } });
    expect(un.statusCode).toBe(200);
    expect((un.json() as { plotProfileId: string | null }).plotProfileId).toBeNull();
    const bad = await app.inject({ method: 'PUT', url: `/api/books/${bookId}/plot`, payload: { profileId: 'nope' } });
    expect(bad.statusCode).toBe(404);
    const delUnknown = await app.inject({ method: 'DELETE', url: '/api/plot-profiles/nope' });
    expect(delUnknown.statusCode).toBe(404);
  });

  it('BR：GET /api/plot-profiles 逐条带 boundBooks（绑定书反查）', async () => {
    const created = await app.inject({ method: 'POST', url: '/api/books', payload: { title: '剧情绑定反查书' } });
    expect(created.statusCode).toBe(201);
    const boundBookId = (created.json() as { id: string }).id;

    // 一个未绑档案 + 一个被绑档案，按 id 精确断言（created_at 同毫秒并列不依赖列表序）
    const unboundSaved = await app.inject({
      method: 'POST',
      url: '/api/plot-profiles',
      payload: { draft: { name: '剧情未绑', sourcePath: 'inline:br1-unbound', sourceHash: 'c'.repeat(64), structure: ['未绑结构'] } },
    });
    expect(unboundSaved.statusCode).toBe(201);
    const unboundId = (unboundSaved.json() as { id: string }).id;

    const saved = await app.inject({
      method: 'POST',
      url: '/api/plot-profiles',
      payload: { draft: { name: '剧情已绑', sourcePath: 'inline:br1-bound', sourceHash: 'd'.repeat(64), structure: ['已绑结构'] } },
    });
    expect(saved.statusCode).toBe(201);
    const pid = (saved.json() as { id: string }).id;

    const bound = await app.inject({ method: 'PUT', url: `/api/books/${boundBookId}/plot`, payload: { profileId: pid } });
    expect(bound.statusCode).toBe(200);

    const listed = (await app.inject({ method: 'GET', url: '/api/plot-profiles' })).json() as Array<{
      id: string;
      boundBooks?: Array<{ id: string; title: string }>;
    }>;
    expect(listed.find((p) => p.id === pid)!.boundBooks).toEqual([{ id: boundBookId, title: '剧情绑定反查书' }]);
    expect(listed.find((p) => p.id === unboundId)!.boundBooks).toEqual([]);
  });
});
