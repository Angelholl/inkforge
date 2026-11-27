import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config';
import { buildApp } from '../../src/app';
import { createDefaultMockProvider, createMockProvider } from '../../src/llm/mock';
import { openDb, type Database } from '../../src/db/open';
import type { SettingsImportDraftDto } from '@inkforge/shared';
import type { CompletionRequest, CompletionResult, LlmProvider } from '../../src/llm/types';

// 中性仿形设定集（DEC-2026-1120-04 全局约束：原 MD 不进仓库，夹具全中性占位）
const COMPENDIUM = `# 《导入示例书》都市群像长篇 · 扩写设定集

> 定位一句话：都市日常群像连载，主角为恒定中心。

## 1. 原文解剖

### 1.9 悬置线清单

1. 对窗的一双眼睛；2. 未完成的拜访。

## 3. 世界观

### 3.1 时空统一

虚构港市临海市，年代约 2003，通讯为市话与简讯。

## 4. 规则体系

1. **借口律**：每场戏必须有社会可接受的借口。
2. **观众律**：每场戏至少一双眼睛。

## 5. 人物圣经

**主角（沈真真，26）**
连锁公司业务员；性格黏人爽利、记账精。

**配角周（周仲良，52，中介）**
二房东中介；油腔谈判。

## 6. 总大纲

### 卷一 《起点》（第 1–2 章）

1. **第一夜**（开场悬念前置）
2. **坦白局**（框架确立）

## 9. 文风与语言规范

- **两种叙述声**：丈夫腔（第一人称、自嘲、统计幽默、接双关的梗）与主角腔（内窥、娇嗔、羞耻与快感的同步记账）交替推进，构成全书双声部结构。
- **荤而不悲**：全书无人因欲望哭到崩溃，高潮戏的余韵一律接日常流水，正常化斜坡是文风纪律，情绪表达克制而温暖。
- **语体分级**：主叙保留直露系笔法，插章与女性线章节改半隐系行话库，语体差本身就是群像视角差，行话随场景域切换。
- **时代道具清单**：市话、呼叫器、简讯、VCD、胶片相机、纸验孕条、机车与时刻表，悬念的物理基础全部依赖年代道具支撑。
`;

const STYLE_ANALYSIS_TEXT = [
  'DIM: 结构与节奏: 中长段为主，事件推进平稳；事件即章，末段必留钩子',
  'DIM: 语言与描写: 双关与行话密度高；生活流垫层厚',
  'DIM: 情感基调: 谐谑温暖',
  'DIM: 叙述方式: 统计式幽默与记账式旁白',
  'DIM: 特色词汇: 行话库随场景域切换',
  'AXIS: 叙述温度: 60',
  'AXIS: 语言密度: 55',
  'AXIS: 叙述者姿态: 50',
  'AXIS: 节奏: 60',
  'AXIS: 幽默: 70',
  'AXIS: 情绪表达: 45',
  'RULES: 每章末段必留新变量钩子',
  'TERMS: 墨炉: 本机写作工具名',
].join('\n');

interface Harness {
  dir: string;
  db: Database;
  app: Awaited<ReturnType<typeof buildApp>>;
}

async function makeApp(canned: string): Promise<Harness> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkforge-settings-import-'));
  const config = loadConfig({
    STRATA_BASE_URL: 'http://127.0.0.1:47831/v1',
    STRATA_API_KEY: 'strata',
    STRATA_MODEL: 'iq3_xxs',
    INKFORGE_DATA_DIR: dir,
  });
  const db = openDb(path.join(config.dataDir, 'inkforge.db'));
  const app = await buildApp({
    config,
    provider: createDefaultMockProvider(),
    summarizerProvider: createDefaultMockProvider(),
    plannerProvider: createMockProvider({ summarize: { text: canned } }),
    db,
    inlineQueue: true,
  });
  return { dir, db, app };
}

function teardown(h: Harness): void {
  h.app.close().catch(() => undefined);
  try {
    h.db.close();
  } catch {
    /* ignore */
  }
  try {
    fs.rmSync(h.dir, { recursive: true, force: true });
  } catch {
    /* Windows 锁瞬态 */
  }
}

async function previewDraft(app: Harness['app'], content: string): Promise<SettingsImportDraftDto> {
  const r = await app.inject({ method: 'POST', url: '/api/settings-import/preview', payload: { content } });
  expect(r.statusCode).toBe(200);
  return r.json() as SettingsImportDraftDto;
}

describe('POST /api/settings-import/preview', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await makeApp(STYLE_ANALYSIS_TEXT);
  });
  afterAll(() => teardown(h));

  it('中性夹具 → 草稿形态（纯解析无库操作）', async () => {
    const d = await previewDraft(h.app, COMPENDIUM);
    expect(d.title).toBe('导入示例书');
    expect(d.description).toContain('借口律');
    expect(d.characters.map((c) => c.name)).toEqual(['主角', '配角周']);
    expect(d.outlineTree.volumes).toHaveLength(1);
    expect(d.outlineItems.map((i) => i.chapterNo)).toEqual([1, 2]);
    expect(d.foreshadowings).toHaveLength(2);
    expect(d.styleSection).toContain('两种叙述声');
    expect(d.importStyle).toBe(true);
    expect(d.warnings).toEqual([]);
  });

  it('空 content → 400', async () => {
    const r = await h.app.inject({ method: 'POST', url: '/api/settings-import/preview', payload: { content: '' } });
    expect(r.statusCode).toBe(400);
  });
});

describe('POST /api/settings-import/apply（文风分析成功 canned）', () => {
  let h: Harness;
  let bookId: string;
  beforeAll(async () => {
    h = await makeApp(STYLE_ANALYSIS_TEXT);
  });
  afterAll(() => teardown(h));

  it('事务建书+大纲树+伏笔+归档+风格档案绑定', async () => {
    const draft = await previewDraft(h.app, COMPENDIUM);
    const r = await h.app.inject({ method: 'POST', url: '/api/settings-import/apply', payload: { content: COMPENDIUM, draft } });
    expect(r.statusCode).toBe(201);
    const res = r.json() as { bookId: string; sourcePath: string; styleProfileId: string | null; warnings: string[]; counts: Record<string, number> };
    bookId = res.bookId;
    expect(res.warnings).toEqual([]);
    expect(res.counts).toEqual({ characters: 2, volumes: 1, stages: 1, cards: 2, foreshadowings: 2 });
    expect(fs.existsSync(res.sourcePath)).toBe(true);
    expect(fs.readFileSync(res.sourcePath, 'utf8')).toBe(COMPENDIUM);

    const book = (await h.app.inject({ method: 'GET', url: `/api/books/${bookId}` })).json() as {
      title: string;
      description: string;
      outline: string;
      styleBinding: { primaryProfileId: string } | null;
    };
    expect(book.title).toBe('导入示例书');
    expect(book.description).toContain('借口律');
    expect(book.outline).toContain('卷一 《起点》');
    expect(book.styleBinding?.primaryProfileId).toBe(res.styleProfileId);

    const chars = (await h.app.inject({ method: 'GET', url: `/api/books/${bookId}/characters` })).json() as Array<{ name: string }>;
    expect(chars.map((c) => c.name)).toEqual(['主角', '配角周']);

    const tree = (await h.app.inject({ method: 'GET', url: `/api/books/${bookId}/outline-tree` })).json() as {
      tree: { volumes: Array<{ stages: Array<{ cards: unknown[] }> }> };
    };
    expect(tree.tree.volumes[0].stages[0].cards).toHaveLength(2);

    const fsItems = (await h.app.inject({ method: 'GET', url: `/api/books/${bookId}/foreshadowings` })).json() as Array<{ plantedCh: number }>;
    expect(fsItems).toHaveLength(2);
    expect(fsItems.every((f) => f.plantedCh === 1)).toBe(true);

    const profiles = (await h.app.inject({ method: 'GET', url: '/api/style-profiles' })).json() as Array<{ name: string }>;
    expect(profiles.some((p) => p.name === '导入示例书·文风规范')).toBe(true);
  });

  it('文风节 <200 字 → 跳过+warning，书仍建成', async () => {
    const draft = await previewDraft(h.app, COMPENDIUM);
    const r = await h.app.inject({
      method: 'POST',
      url: '/api/settings-import/apply',
      payload: { content: COMPENDIUM, draft: { ...draft, title: '短文风书', styleSection: '太短', importStyle: true } },
    });
    expect(r.statusCode).toBe(201);
    const res = r.json() as { styleProfileId: string | null; warnings: string[] };
    expect(res.styleProfileId).toBe(null);
    expect(res.warnings.some((w) => w.includes('不足 200 字'))).toBe(true);
  });

  it('importStyle=false → 静默跳过', async () => {
    const draft = await previewDraft(h.app, COMPENDIUM);
    const r = await h.app.inject({
      method: 'POST',
      url: '/api/settings-import/apply',
      payload: { content: COMPENDIUM, draft: { ...draft, title: '关文风书', importStyle: false } },
    });
    expect(r.statusCode).toBe(201);
    const res = r.json() as { styleProfileId: string | null; warnings: string[] };
    expect(res.styleProfileId).toBe(null);
    expect(res.warnings).toEqual([]);
  });

  it('缺 title → 400；空 content → 400', async () => {
    const draft = await previewDraft(h.app, COMPENDIUM);
    const noTitle = await h.app.inject({
      method: 'POST',
      url: '/api/settings-import/apply',
      payload: { content: COMPENDIUM, draft: { ...draft, title: '' } },
    });
    expect(noTitle.statusCode).toBe(400);
    const noContent = await h.app.inject({
      method: 'POST',
      url: '/api/settings-import/apply',
      payload: { content: '', draft },
    });
    expect(noContent.statusCode).toBe(400);
  });
});

describe('POST /api/settings-import/apply（文风分析失败 canned）', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await makeApp('');
  });
  afterAll(() => teardown(h));

  it('LLM 失败不回滚建书：书+树+伏笔在库，风格档案零行，warning 呈现', async () => {
    const draft = await previewDraft(h.app, COMPENDIUM);
    const r = await h.app.inject({ method: 'POST', url: '/api/settings-import/apply', payload: { content: COMPENDIUM, draft } });
    expect(r.statusCode).toBe(201);
    const res = r.json() as { bookId: string; styleProfileId: string | null; warnings: string[] };
    expect(res.styleProfileId).toBe(null);
    expect(res.warnings.some((w) => w.includes('文风节导入风格档案失败'))).toBe(true);

    const book = await h.app.inject({ method: 'GET', url: `/api/books/${res.bookId}` });
    expect(book.statusCode).toBe(200);
    const profiles = (await h.app.inject({ method: 'GET', url: '/api/style-profiles' })).json() as unknown[];
    expect(profiles).toEqual([]);
  });
});

describe('POST /api/settings-import/apply（归档失败降级，2026-11-20 审计回归）', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await makeApp('');
    // data/imports 位置预置同名普通文件 → mkdir/writeFile 必失败
    fs.writeFileSync(path.join(h.dir, 'imports'), 'not a directory');
  });
  afterAll(() => teardown(h));

  it('归档失败 → 仍 201 建书 + warning + sourcePath null（阻断「500 后重试→重复建书」路径）', async () => {
    const draft = await previewDraft(h.app, COMPENDIUM);
    const r = await h.app.inject({
      method: 'POST',
      url: '/api/settings-import/apply',
      payload: { content: COMPENDIUM, draft: { ...draft, title: '归档降级书', importStyle: false } },
    });
    expect(r.statusCode).toBe(201);
    const res = r.json() as { bookId: string; sourcePath: string | null; warnings: string[] };
    expect(res.sourcePath).toBe(null);
    expect(res.warnings.some((w) => w.includes('归档失败'))).toBe(true);

    // 书真实在库（201 而非 500，owner 重试不再建重复书）
    const book = await h.app.inject({ method: 'GET', url: `/api/books/${res.bookId}` });
    expect(book.statusCode).toBe(200);
    expect((book.json() as { title: string }).title).toBe('归档降级书');
    // imports 占位文件未被破坏（无半成品目录/空壳文件）
    expect(fs.statSync(path.join(h.dir, 'imports')).isFile()).toBe(true);
  });
});

// 重叠语义=跨卡重复章号首卡胜（解析器原生形态：「N-M **题**」行系阶段行非卡，夹具修订裁决 2026-11-20）
const LANDING_COMPENDIUM = `# 《落地测试书》· 扩写设定集

> 定位一句话：落地格解析与章骨架落库测试。

## 6. 总大纲

**阶段A 「开局」**（2003）
| 章 | 标题 | 线 | 落地 |
| --- | --- | --- | --- |
| 1 | 第一夜 | L10 | H（撞见场：房东×阿美） |
| 2 | 坦白局 | L10 | L（框架确立） |
| 3 | 借宿 | L4 | H |
| 4 | 客房事件 | L4 | |

**阶段B 「重叠」**（2004）
| 章 | 标题 | 线 | 落地 |
| --- | --- | --- | --- |
| 10 | 重叠卡A | L1 | H（场景甲：甲×乙） |
| 10 | 重叠卡B | L1 | H（场景乙：甲×乙） |
| 11 | 章十一 | L1 | L（场景丙） |
`;

describe('POST /api/settings-import/apply 落章骨架（DEC-2026-1120-10）', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await makeApp('');
  });
  afterAll(() => teardown(h));

  it('逐章表+重叠区间 → chapters 行 title/goal/mustHaveBeats(含 grade)/status 钉值，无关键词落地格 fail-open warning', async () => {
    const draft = await previewDraft(h.app, LANDING_COMPENDIUM);
    const r = await h.app.inject({ method: 'POST', url: '/api/settings-import/apply', payload: { content: LANDING_COMPENDIUM, draft } });
    expect(r.statusCode).toBe(201);
    const res = r.json() as { bookId: string; warnings: string[] };
    // 唯一 warning：卡「借宿」落地格「H」解析不出关键词（第 4 章无格不警、无格卡与被覆盖章不重复警）
    expect(res.warnings).toHaveLength(1);
    expect(res.warnings[0]).toContain('借宿');
    expect(res.warnings[0]).toContain('未解析出可靠关键词');

    const book = (await h.app.inject({ method: 'GET', url: `/api/books/${res.bookId}` })).json() as {
      chapters: Array<{ chapterNo: number; title: string; status: string; blueprint: { goal: string; mustHaveBeats: Array<{ text: string; keywords: string[]; grade?: string }> } }>;
    };
    expect(book.chapters.map((c) => c.chapterNo)).toEqual([1, 2, 3, 4, 10, 11]);
    expect(book.chapters.every((c) => c.status === 'planned')).toBe(true);
    const ch1 = book.chapters[0];
    expect(ch1.title).toBe('第一夜');
    expect(ch1.blueprint.goal).toBe('H（撞见场：房东×阿美）');
    expect(ch1.blueprint.mustHaveBeats).toEqual([{ text: 'H（撞见场：房东×阿美）', keywords: ['撞见场', '房东', '阿美'], grade: 'H' }]);
    expect(book.chapters[1].blueprint.mustHaveBeats).toEqual([{ text: 'L（框架确立）', keywords: ['框架确立'], grade: 'L' }]);
    expect(book.chapters[2].blueprint).toEqual({ goal: 'H', beats: [], mustHaveBeats: [], bannedTopics: [] });
    // 跨卡重复章号首卡胜：ch10 归重叠卡A（重叠卡B 让位不落章）
    expect(book.chapters[4]).toMatchObject({ title: '重叠卡A', blueprint: { goal: 'H（场景甲：甲×乙）', mustHaveBeats: [{ text: 'H（场景甲：甲×乙）', keywords: ['场景甲'], grade: 'H' }] } });
    expect(book.chapters.some((c) => c.title === '重叠卡B')).toBe(false);
    expect(book.chapters[5]).toMatchObject({ title: '章十一', blueprint: { mustHaveBeats: [{ text: 'L（场景丙）', keywords: ['场景丙'], grade: 'L' }] } });
  });
});

// 勾选才写 mandate（DEC-2026-1122-01 Task-04）：apply 事务内与建书同生共死；不带字段零写入=新书 null
describe('POST /api/settings-import/apply 勾选落地策略（DEC-2026-1122-01 Task-04）', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await makeApp('');
  });
  afterAll(() => teardown(h));

  it('apply 带 landingMandate:{enabled:true,heavyEveryN:3} → 书 landingMandate 钉值 {mode:\'cadence\',heavyEveryN:3}', async () => {
    const draft = await previewDraft(h.app, LANDING_COMPENDIUM);
    const r = await h.app.inject({
      method: 'POST',
      url: '/api/settings-import/apply',
      payload: { content: LANDING_COMPENDIUM, draft, landingMandate: { enabled: true, heavyEveryN: 3 } },
    });
    expect(r.statusCode).toBe(201);
    const { bookId } = r.json() as { bookId: string };
    const book = (await h.app.inject({ method: 'GET', url: `/api/books/${bookId}` })).json() as { landingMandate: unknown };
    expect(book.landingMandate).toEqual({ mode: 'cadence', heavyEveryN: 3 });
  });

  it('apply 不带 landingMandate → 新书 landingMandate null（enabled=false 零写入）', async () => {
    const draft = await previewDraft(h.app, LANDING_COMPENDIUM);
    const r = await h.app.inject({
      method: 'POST',
      url: '/api/settings-import/apply',
      payload: { content: LANDING_COMPENDIUM, draft },
    });
    expect(r.statusCode).toBe(201);
    const { bookId } = r.json() as { bookId: string };
    const book = (await h.app.inject({ method: 'GET', url: `/api/books/${bookId}` })).json() as { landingMandate: unknown };
    expect(book.landingMandate).toBeNull();
  });
});

// ── T8 精炼端点（refinerProvider 注入缝 + 独立临时库，零连主库）──
function okRefine(text: string): CompletionResult {
  return { text, usage: { promptTokens: 0, completionTokens: 0 }, finishReason: 'stop' };
}

function makeRefineProvider(
  handler: (req: CompletionRequest, index: number) => CompletionResult,
): { provider: LlmProvider; calls: CompletionRequest[] } {
  const calls: CompletionRequest[] = [];
  const provider: LlmProvider = {
    async complete(req) {
      const index = calls.length;
      calls.push(req);
      return handler(req, index);
    },
  };
  return { provider, calls };
}

async function makeRefineApp(contextWindow: number, refinerProvider: LlmProvider): Promise<Harness> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkforge-settings-refine-'));
  const config = loadConfig({
    STRATA_BASE_URL: 'http://127.0.0.1:47831/v1',
    STRATA_API_KEY: 'strata',
    STRATA_MODEL: 'iq3_xxs',
    INKFORGE_DATA_DIR: dir,
  });
  config.providers.local.contextWindow = contextWindow;
  const db = openDb(path.join(config.dataDir, 'inkforge.db'));
  const app = await buildApp({
    config,
    provider: createDefaultMockProvider(),
    refinerProvider,
    db,
  });
  return { dir, db, app };
}

describe('POST /api/settings-import/refine', () => {
  it('refine → 200 description ≤20000 且 mock 调用恰 1 次', async () => {
    const { provider, calls } = makeRefineProvider(() => okRefine('摘'.repeat(30000)));
    const h = await makeRefineApp(524288, provider);
    try {
      const r = await h.app.inject({
        method: 'POST',
        url: '/api/settings-import/refine',
        payload: { content: '甲'.repeat(12000) },
      });
      expect(r.statusCode).toBe(200);
      const body = r.json() as { description: string; truncated: boolean };
      expect(body.description.length).toBeLessThanOrEqual(20000);
      expect(body.truncated).toBe(true);
      expect(calls.length).toBe(1);
    } finally {
      teardown(h);
    }
  });

  it('contextWindow 小 → 502 含 reason=refine-context-too-small', async () => {
    const { provider } = makeRefineProvider(() => okRefine('摘'.repeat(10)));
    const h = await makeRefineApp(8192, provider);
    try {
      const r = await h.app.inject({
        method: 'POST',
        url: '/api/settings-import/refine',
        payload: { content: '甲'.repeat(12000) },
      });
      expect(r.statusCode).toBe(502);
      const body = r.json() as { error: string; reason: string };
      expect(body.error).toBe('refine failed');
      expect(body.reason).toBe('refine-context-too-small');
    } finally {
      teardown(h);
    }
  });

  it('provider error → 502 可读 error，不降级不写库', async () => {
    const { provider } = makeRefineProvider(() => {
      throw new Error('boom');
    });
    const h = await makeRefineApp(524288, provider);
    try {
      const r = await h.app.inject({
        method: 'POST',
        url: '/api/settings-import/refine',
        payload: { content: '甲'.repeat(12000) },
      });
      expect(r.statusCode).toBe(502);
      const body = r.json() as { error: string; reason: string };
      expect(body.error).toBe('refine failed');
      expect(body.reason).toBe('boom');
      const row = h.db.prepare('SELECT COUNT(*) AS n FROM books').get() as { n: number };
      expect(row.n).toBe(0);
    } finally {
      teardown(h);
    }
  });

  it('分块中途某段 mock 报错 → 重试一次成功后 200（原 refine-map-failed 语义更新）', async () => {
    const { provider } = makeRefineProvider((_req, index) => {
      if (index === 2) throw new Error('boom');
      return okRefine('摘'.repeat(10));
    });
    const h = await makeRefineApp(65536, provider);
    try {
      const r = await h.app.inject({
        method: 'POST',
        url: '/api/settings-import/refine',
        payload: { content: '甲'.repeat(40475) },
      });
      expect(r.statusCode).toBe(200);
      const body = r.json() as { description: string; truncated: boolean };
      expect(body.description).toBe('摘'.repeat(10));
      expect(body.truncated).toBe(false);
    } finally {
      teardown(h);
    }
  });

  it('分块某段空输出 → 重试一次成功后 200（原 refine-map-empty 语义更新）', async () => {
    const { provider } = makeRefineProvider((_req, index) => okRefine(index === 1 ? '' : '摘'.repeat(10)));
    const h = await makeRefineApp(65536, provider);
    try {
      const r = await h.app.inject({
        method: 'POST',
        url: '/api/settings-import/refine',
        payload: { content: '甲'.repeat(40475) },
      });
      expect(r.statusCode).toBe(200);
      const body = r.json() as { description: string; truncated: boolean };
      expect(body.description).toBe('摘'.repeat(10));
      expect(body.truncated).toBe(false);
    } finally {
      teardown(h);
    }
  });

  it('真 socket：延迟 provider 应答期间连接未断 → 200（回归 close 挂点，收口黑盒实证）', async () => {
    const slow: LlmProvider = {
      async complete() {
        await new Promise((resolve) => setTimeout(resolve, 300));
        return okRefine('乙'.repeat(300));
      },
    };
    const h = await makeRefineApp(524288, slow);
    try {
      await h.app.listen({ port: 0, host: '127.0.0.1' });
      const port = (h.app.server.address() as { port: number }).port;
      const r = await fetch(`http://127.0.0.1:${port}/api/settings-import/refine`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: '甲'.repeat(12000) }),
      });
      expect(r.status).toBe(200);
      const body = (await r.json()) as { description: string; truncated: boolean };
      expect(body.description).toBe('乙'.repeat(300));
      expect(body.truncated).toBe(false);
    } finally {
      teardown(h);
    }
  });
});
