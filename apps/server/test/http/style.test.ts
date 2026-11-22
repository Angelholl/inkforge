import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config';
import { buildApp } from '../../src/app';
import { createMockProvider } from '../../src/llm/mock';
import { openDb, type Database } from '../../src/db/open';
import type { DistillJobDto, DistillStyleDraftDto } from '@inkforge/shared';
import { DIM_SOURCE_COEXIST } from '@inkforge/shared';

let dir: string;
let db: Database;
let app: Awaited<ReturnType<typeof buildApp>>;

const SAMPLE_TEXT =
  '山风掠过松林，少年抬头望向远方。他说：“路还长。”夜色深沉，灯火摇曳。'.repeat(6);

const ANALYSIS_TEXT = `DIM: 节奏: 短句为主，段落 3-6 行。
DIM: 对话: 对话占比约三成，多短对答。
AXIS: 叙述温度: 72
AXIS: 语言密度: 55
RULES: 平均句长 10-20 字。
RULES: 对话占比 20%-40%。`;

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkforge-style-http-'));
  const config = loadConfig({ STRATA_BASE_URL: 'http://127.0.0.1:47831/v1', STRATA_API_KEY: 'strata', STRATA_MODEL: 'iq3_xxs', INKFORGE_DATA_DIR: dir });
  db = openDb(path.join(config.dataDir, 'inkforge.db'));
  app = await buildApp({
    config,
    provider: createMockProvider({ draft: { text: '样章。' }, qc: { text: '' }, summarize: { text: '摘要。' } }),
    summarizerProvider: createMockProvider({ summarize: { text: ANALYSIS_TEXT } }),
    db,
    inlineQueue: true,
  });
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

/** 轮询后台蒸馏 job 到终态并取草稿（mock provider 即时返回，20ms 步进足够）。 */
async function waitDistillJob(jobId: string, timeoutMs = 30000): Promise<DistillStyleDraftDto> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const g = await app.inject({ method: 'GET', url: `/api/style-profiles/jobs/${jobId}` });
    expect(g.statusCode).toBe(200);
    const job = g.json() as DistillJobDto;
    if (job.status === 'done') return job.result as DistillStyleDraftDto;
    if (job.status === 'failed') throw new Error(`蒸馏 job 失败：${job.error}`);
    if (Date.now() > deadline) throw new Error(`蒸馏 job 未收敛：${JSON.stringify(job)}`);
    await new Promise((res) => setTimeout(res, 20));
  }
}

/** B5 后台化：POST 只登记 job 回 202，草稿从 job 轮询取；helper 对外形状不变，故各调用点无需改动。 */
async function distill(name = '山风体'): Promise<DistillStyleDraftDto> {
  const r = await app.inject({ method: 'POST', url: '/api/style-profiles/distill', payload: { name, text: SAMPLE_TEXT } });
  expect(r.statusCode).toBe(202);
  return waitDistillJob((r.json() as { jobId: string }).jobId);
}

describe('蒸馏两步流（DEC-2026-1115-04 #7 确认门）', () => {
  it('distill → 202 登记 job，轮询到 done 得 draft（七维六轴+样本）且不入库', async () => {
    const draft = await distill();
    expect(draft.analysis.dims['节奏']).toBe('短句为主，段落 3-6 行。');
    expect(draft.analysis.axes['叙述温度']).toBe(72);
    expect(draft.analysis.rules.length).toBeGreaterThan(0);
    expect(draft.samples.length).toBeGreaterThan(0);
    const n = db.prepare('SELECT COUNT(*) AS n FROM style_profiles').get() as { n: number };
    expect(n.n).toBe(0);
  });

  it('distill 参数校验：temperature 越界 / maxSegments 越界 / 空样本 → 400；zod 400 人话化（回归 owner 反馈）', async () => {
    const t1 = await app.inject({ method: 'POST', url: '/api/style-profiles/distill', payload: { name: 'x', text: SAMPLE_TEXT, temperature: 2 } });
    expect(t1.statusCode).toBe(400);
    const t2 = await app.inject({ method: 'POST', url: '/api/style-profiles/distill', payload: { name: 'x', text: SAMPLE_TEXT, maxSegments: 25 } });
    expect(t2.statusCode).toBe(400);
    const t3 = await app.inject({ method: 'POST', url: '/api/style-profiles/distill', payload: { name: '空白', text: '   \n  ' } });
    expect(t3.statusCode).toBe(400);
    expect((t3.json() as { error: string }).error).toBe('样本为空，禁止蒸馏');
    // 空名 → 400 且错误体是人话（「请求参数不合法：name: …」），不再是 zod issue 原始 JSON
    const t4 = await app.inject({ method: 'POST', url: '/api/style-profiles/distill', payload: { name: '', text: SAMPLE_TEXT } });
    expect(t4.statusCode).toBe(400);
    const err = (t4.json() as { error: string }).error;
    expect(err).toContain('请求参数不合法');
    expect(err).toContain('name');
    expect(err).not.toContain('[{');
  });

  it('create → 201 入库：list 可见 inline 前缀与 metrics；同文二存 version+1 旧行不变', async () => {
    const draft = await distill('山风体');
    const r = await app.inject({
      method: 'POST',
      url: '/api/style-profiles',
      payload: { name: '山风体', text: SAMPLE_TEXT, analysis: draft.analysis, samples: draft.samples },
    });
    expect(r.statusCode).toBe(201);
    const { profileId, version } = r.json() as { profileId: string; version: number };
    expect(version).toBe(1);

    const list = await app.inject({ method: 'GET', url: '/api/style-profiles' });
    const rows = list.json() as Array<{ id: string; name: string; version: number; metrics: Record<string, unknown>; sourcePath: string }>;
    const row = rows.find((x) => x.id === profileId)!;
    expect(row.name).toBe('山风体');
    expect(row.sourcePath.startsWith('inline:')).toBe(true);
    expect(row.sourcePath.length).toBe(15);
    expect(Object.keys(row.metrics).length).toBeGreaterThan(0);

    // 同文二存 → version 2，旧行 rules_json 逐字节不变
    const draft2 = await distill('山风体');
    const r2 = await app.inject({
      method: 'POST',
      url: '/api/style-profiles',
      payload: { name: '山风体', text: SAMPLE_TEXT, analysis: draft2.analysis, samples: draft2.samples },
    });
    expect((r2.json() as { version: number }).version).toBe(2);
    const rowsOld = db.prepare('SELECT rules_json FROM style_profiles WHERE id = ?').get(profileId) as { rules_json: string };
    const rowsAll = db.prepare('SELECT rules_json FROM style_profiles ORDER BY version').all() as Array<{ rules_json: string }>;
    expect(rowsAll[0].rules_json).toBe(rowsOld.rules_json);
  });

  it('maxSegments 收敛 few-shot 采样量：count=4 → draft.samples ≤4', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/style-profiles/distill',
      payload: { name: '收敛', text: SAMPLE_TEXT.repeat(20), maxSegments: 4 },
    });
    expect(r.statusCode).toBe(202); // B5 后台化：只登记 job
    const draft = await waitDistillJob((r.json() as { jobId: string }).jobId);
    expect(draft.samples.length).toBeLessThanOrEqual(4);
    expect(draft.samples.length).toBeGreaterThan(0);
  });

  it('create 守卫：坏 analysis 形状 → 400；空 samples → 400；<200 字 → 400', async () => {
    const draft = await distill('守卫测');
    const badAnalysis = await app.inject({
      method: 'POST',
      url: '/api/style-profiles',
      payload: { name: 'x', text: SAMPLE_TEXT, analysis: { dims: '不是对象', axes: {}, rules: [] }, samples: ['样本'] },
    });
    expect(badAnalysis.statusCode).toBe(400);
    const noSamples = await app.inject({
      method: 'POST',
      url: '/api/style-profiles',
      payload: { name: 'x', text: SAMPLE_TEXT, analysis: draft.analysis, samples: [] },
    });
    expect(noSamples.statusCode).toBe(400);
    const short = await app.inject({
      method: 'POST',
      url: '/api/style-profiles',
      payload: { name: 'x', text: '太短', analysis: draft.analysis, samples: ['样本'] },
    });
    expect(short.statusCode).toBe(400);
  });
});

describe('档案详情端点（DEC-2026-1120-08 查看细节）', () => {
  async function newProfileForDetail(name: string): Promise<string> {
    const draft = await distill(name);
    const r = await app.inject({
      method: 'POST',
      url: '/api/style-profiles',
      payload: { name, text: SAMPLE_TEXT, analysis: draft.analysis, samples: draft.samples },
    });
    expect(r.statusCode).toBe(201);
    return (r.json() as { profileId: string }).profileId;
  }

  it('GET /:id 命中 → 200 完整 dto：list 字段 + analysis(dims/axes/rules/terms/freqTerms) + sourcePath', async () => {
    const pid = await newProfileForDetail('详情命中档');
    const r = await app.inject({ method: 'GET', url: `/api/style-profiles/${pid}` });
    expect(r.statusCode).toBe(200);
    const d = r.json() as {
      id: string;
      name: string;
      version: number;
      createdAt: string;
      metrics: Record<string, unknown>;
      sourcePath: string;
      analysis: { dims: Record<string, string>; axes: Record<string, number>; rules: string[]; terms: unknown[]; freqTerms: unknown[] };
    };
    expect(d.id).toBe(pid);
    expect(d.name).toBe('详情命中档');
    expect(d.version).toBeGreaterThanOrEqual(1); // SAMPLE_TEXT 各用例共用 → 同 hash 版本族递增
    expect(typeof d.createdAt).toBe('string');
    expect(d.sourcePath.startsWith('inline:')).toBe(true);
    expect(d.analysis.dims['节奏']).toBe('短句为主，段落 3-6 行。');
    expect(d.analysis.axes['叙述温度']).toBe(72);
    expect(d.analysis.rules).toEqual(['平均句长 10-20 字。', '对话占比 20%-40%。']);
    expect(d.analysis.terms).toEqual([]);
    expect(d.analysis.freqTerms).toEqual([]);

    expect((await app.inject({ method: 'DELETE', url: `/api/style-profiles/${pid}` })).statusCode).toBe(200);
  });

  it('GET /:id 不存在 → 404', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/style-profiles/no-such-detail-id' });
    expect(r.statusCode).toBe(404);
  });

  it('旧档案兜底：rules_json 无 freqTerms/terms 键 → []；无 metrics selfScore → 无 evaluation 键；静态段不被 :id 吞', async () => {
    const pid = await newProfileForDetail('旧格式档');
    // 模拟旧档案：剥掉 freqTerms/terms 键
    const row = db.prepare('SELECT rules_json FROM style_profiles WHERE id = ?').get(pid) as { rules_json: string };
    const old = JSON.parse(row.rules_json) as Record<string, unknown>;
    delete old.freqTerms;
    delete old.terms;
    db.prepare('UPDATE style_profiles SET rules_json = ? WHERE id = ?').run(JSON.stringify(old), pid);

    const r = await app.inject({ method: 'GET', url: `/api/style-profiles/${pid}` });
    expect(r.statusCode).toBe(200);
    const d = r.json() as { analysis: { freqTerms: unknown[]; terms: unknown[] }; evaluation?: unknown };
    expect(d.analysis.freqTerms).toEqual([]);
    expect(d.analysis.terms).toEqual([]);
    expect('evaluation' in d).toBe(false);

    // 静态段不被 :id 吞（Fastify 静态优先）：versions / jobs 仍可达
    expect((await app.inject({ method: 'GET', url: `/api/style-profiles/${pid}/versions` })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/style-profiles/jobs/not-a-job' })).statusCode).toBe(404);

    expect((await app.inject({ method: 'DELETE', url: `/api/style-profiles/${pid}` })).statusCode).toBe(200);
  });
});

describe('档案删除与逐书文风示例开关（B4 裁决②④，DEC-2026-1116-01）', () => {
  async function newProfile(name: string): Promise<string> {
    const draft = await distill(name);
    const r = await app.inject({
      method: 'POST',
      url: '/api/style-profiles',
      payload: { name, text: SAMPLE_TEXT, analysis: draft.analysis, samples: draft.samples },
    });
    expect(r.statusCode).toBe(201);
    return (r.json() as { profileId: string }).profileId;
  }

  async function newBook(title: string): Promise<{ id: string; title: string }> {
    const r = await app.inject({ method: 'POST', url: '/api/books', payload: { title } });
    expect(r.statusCode).toBe(201);
    return r.json() as { id: string; title: string };
  }

  const profileRow = (id: string): number => (db.prepare('SELECT COUNT(*) AS n FROM style_profiles WHERE id = ?').get(id) as { n: number }).n;

  it('DELETE 未绑定档案 → 200 且行消失', async () => {
    const pid = await newProfile('删得掉的');
    expect(profileRow(pid)).toBe(1);
    const r = await app.inject({ method: 'DELETE', url: `/api/style-profiles/${pid}` });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ ok: true });
    expect(profileRow(pid)).toBe(0);
  });

  it('DELETE 被绑定档案 → 409 且回绑定书列表，档案行不删；解绑后才可删', async () => {
    const pid = await newProfile('删不掉的');
    const book = await newBook('绑定这本书');
    const bind = await app.inject({ method: 'PUT', url: `/api/books/${book.id}/style`, payload: { profileId: pid } });
    expect(bind.statusCode).toBe(200);

    const r = await app.inject({ method: 'DELETE', url: `/api/style-profiles/${pid}` });
    expect(r.statusCode).toBe(409);
    const body = r.json() as { error: string; books: Array<{ id: string; title: string }> };
    expect(body.error).toContain('已被书绑定');
    expect(body.books.some((b) => b.id === book.id && b.title === '绑定这本书')).toBe(true);
    expect(profileRow(pid)).toBe(1); // 拒删：行仍在，绝不静默解绑

    await app.inject({ method: 'PUT', url: `/api/books/${book.id}/style`, payload: { profileId: null } });
    const r2 = await app.inject({ method: 'DELETE', url: `/api/style-profiles/${pid}` });
    expect(r2.statusCode).toBe(200);
    expect(profileRow(pid)).toBe(0);
  });

  it('DELETE 不存在的档案 → 404', async () => {
    const r = await app.inject({ method: 'DELETE', url: '/api/style-profiles/no-such-profile' });
    expect(r.statusCode).toBe(404);
  });

  it('PUT style-fewshot：默认关 → 开 → 绑定/重绑置 1、解绑归零；非法 body 400、未知书 404', async () => {
    const pid = await newProfile('开关试验档');
    const book = await newBook('开关试验书');
    // GET /api/books/:bookId 走 {...book} 展开 → 新字段自动透出
    const g0 = await app.inject({ method: 'GET', url: `/api/books/${book.id}` });
    expect((g0.json() as { styleFewshotOn: boolean }).styleFewshotOn).toBe(false); // 迁移 DEFAULT 0
    const on = await app.inject({ method: 'PUT', url: `/api/books/${book.id}/style-fewshot`, payload: { on: true } });
    expect(on.statusCode).toBe(200);
    expect(on.json()).toEqual({ ok: true, styleFewshotOn: true });
    const g1 = await app.inject({ method: 'GET', url: `/api/books/${book.id}` });
    expect((g1.json() as { styleFewshotOn: boolean }).styleFewshotOn).toBe(true);

    // 绑定置 1
    await app.inject({ method: 'PUT', url: `/api/books/${book.id}/style`, payload: { profileId: pid } });
    const g2 = await app.inject({ method: 'GET', url: `/api/books/${book.id}` });
    expect((g2.json() as { styleFewshotOn: boolean }).styleFewshotOn).toBe(true); // 重绑归零→置 1 的语义翻转留痕（DEC-2026-1122-03③）

    // 解绑同样归零
    await app.inject({ method: 'PUT', url: `/api/books/${book.id}/style-fewshot`, payload: { on: true } });
    await app.inject({ method: 'PUT', url: `/api/books/${book.id}/style`, payload: { profileId: null } });
    const g3 = await app.inject({ method: 'GET', url: `/api/books/${book.id}` });
    expect((g3.json() as { styleFewshotOn: boolean }).styleFewshotOn).toBe(false);

    const bad = await app.inject({ method: 'PUT', url: `/api/books/${book.id}/style-fewshot`, payload: { on: 'yes' } });
    expect(bad.statusCode).toBe(400);
    const miss = await app.inject({ method: 'PUT', url: '/api/books/no-such-book/style-fewshot', payload: { on: true } });
    expect(miss.statusCode).toBe(404);

    const cleanup = await app.inject({ method: 'DELETE', url: `/api/style-profiles/${pid}` });
    expect(cleanup.statusCode).toBe(200); // 解绑后档案可删，不给后面的用例留脏引用
  });

  it('多绑 body：1 主 2 辅 + dimsSource 落库，GET 回显 styleBinding，fewshot 置 1', async () => {
    const p1 = await newProfile('多绑主档');
    const p2 = await newProfile('多绑辅档甲');
    const p3 = await newProfile('多绑辅档乙');
    const book = await newBook('多绑书');

    // 绑定置 1（DEC-2026-1122-03③ 语义经 setBookStyleBinding 保持）
    await app.inject({ method: 'PUT', url: `/api/books/${book.id}/style-fewshot`, payload: { on: true } });
    const bind = await app.inject({
      method: 'PUT',
      url: `/api/books/${book.id}/style`,
      payload: { primaryProfileId: p1, auxProfileIds: [p2, p3], dimsSource: { ['对话']: p2, ['节奏']: p3 } },
    });
    expect(bind.statusCode).toBe(200);
    expect((bind.json() as { ok: boolean; styleProfileId: string }).styleProfileId).toBe(p1);

    const g = (await app.inject({ method: 'GET', url: `/api/books/${book.id}` })).json() as {
      styleProfileId: string;
      styleBinding: { primaryProfileId: string; auxProfileIds: string[]; dimsSource: Record<string, string> };
    };
    expect(g.styleProfileId).toBe(p1);
    expect(g.styleBinding).toEqual({ primaryProfileId: p1, auxProfileIds: [p2, p3], dimsSource: { ['对话']: p2, ['节奏']: p3 }, weights: {} });
    const row = db.prepare('SELECT style_fewshot_on FROM books WHERE id = ?').get(book.id) as { style_fewshot_on: number };
    expect(row.style_fewshot_on).toBe(1); // 绑定/重绑置 1（DEC-2026-1122-03③）

    // 清理：解绑 + 删三档案，不留脏引用
    await app.inject({ method: 'PUT', url: `/api/books/${book.id}/style`, payload: { profileId: null } });
    for (const pid of [p1, p2, p3]) {
      expect((await app.inject({ method: 'DELETE', url: `/api/style-profiles/${pid}` })).statusCode).toBe(200);
    }
  });

  it('共存哨兵（DEC-2026-1118-03）：dimsSource 值=__coexist__ 放行落库回显；未勾选档案值仍 400', async () => {
    const p1 = await newProfile('共存主档');
    const p2 = await newProfile('共存辅档');
    const book = await newBook('共存书');

    const bind = await app.inject({
      method: 'PUT',
      url: `/api/books/${book.id}/style`,
      payload: { primaryProfileId: p1, auxProfileIds: [p2], dimsSource: { ['特色词汇']: DIM_SOURCE_COEXIST } },
    });
    expect(bind.statusCode).toBe(200);
    const g = (await app.inject({ method: 'GET', url: `/api/books/${book.id}` })).json() as {
      styleBinding: { dimsSource: Record<string, string> };
    };
    expect(g.styleBinding.dimsSource['特色词汇']).toBe(DIM_SOURCE_COEXIST);

    // 哨兵放行不放宽其余校验：越权 id 照旧 400
    const bad = await app.inject({
      method: 'PUT',
      url: `/api/books/${book.id}/style`,
      payload: { primaryProfileId: p1, dimsSource: { ['对话']: 'no-such-profile' } },
    });
    expect(bad.statusCode).toBe(400);

    await app.inject({ method: 'PUT', url: `/api/books/${book.id}/style`, payload: { profileId: null } });
    for (const pid of [p1, p2]) {
      expect((await app.inject({ method: 'DELETE', url: `/api/style-profiles/${pid}` })).statusCode).toBe(200);
    }
  });

  it('多绑校验矩阵：超 4 档案/主不在勾选/维度来源越权/未知维度/主辅重复 → 400 人话', async () => {
    const p1 = await newProfile('矩阵主档');
    const p2 = await newProfile('矩阵辅档甲');
    const p3 = await newProfile('矩阵辅档乙');
    const p4 = await newProfile('矩阵辅档丙');
    const p5 = await newProfile('矩阵辅档丁');
    const book = await newBook('矩阵书');

    const cases: Array<{ payload: Record<string, unknown>; msg: string }> = [
      { payload: { primaryProfileId: p1, auxProfileIds: [p2, p3, p4, p5] }, msg: '风格档案最多绑定 4 个' },
      { payload: { auxProfileIds: [p2] }, msg: '必须显式指定主风格' },
      { payload: { primaryProfileId: p1, dimsSource: { ['对话']: p2 } }, msg: '维度来源必须在已勾选档案中' },
      { payload: { primaryProfileId: p1, dimsSource: { ['语感']: p1 } }, msg: '未知风格维度' },
      { payload: { primaryProfileId: p1, auxProfileIds: [p1] }, msg: '主风格不可重复勾选' },
    ];
    for (const c of cases) {
      const r = await app.inject({ method: 'PUT', url: `/api/books/${book.id}/style`, payload: c.payload });
      expect(r.statusCode, `payload ${JSON.stringify(c.payload)} 应 400`).toBe(400);
      const err = (r.json() as { error: string }).error;
      expect(err).toContain('请求参数不合法');
      expect(err, `payload ${JSON.stringify(c.payload)} 应含文案「${c.msg}」`).toContain(c.msg);
    }

    for (const pid of [p1, p2, p3, p4, p5]) {
      expect((await app.inject({ method: 'DELETE', url: `/api/style-profiles/${pid}` })).statusCode).toBe(200);
    }
  });

  it('legacy body {profileId} 兼容：等价单主七维全主，bundle v2 落库；辅档案被绑书 409 拦删', async () => {
    const p1 = await newProfile('遗留主档');
    const p2 = await newProfile('遗留辅档');
    const b1 = await newBook('遗留单绑书');
    const bind = await app.inject({ method: 'PUT', url: `/api/books/${b1.id}/style`, payload: { profileId: p1 } });
    expect(bind.statusCode).toBe(200);

    const g = (await app.inject({ method: 'GET', url: `/api/books/${b1.id}` })).json() as {
      styleBinding: { primaryProfileId: string; auxProfileIds: string[]; dimsSource: Record<string, string> };
      styleSnapshotJson: string;
    };
    expect(g.styleBinding).toEqual({ primaryProfileId: p1, auxProfileIds: [], dimsSource: {}, weights: {} }); // 七键缺省=全主，消费方归一
    const snap = JSON.parse(g.styleSnapshotJson) as { v: number };
    expect(snap.v).toBe(2);

    // 辅档案被另一本书绑定 → DELETE 409（新并查覆盖关联表行）
    const b2 = await newBook('辅档绑定书');
    const bind2 = await app.inject({
      method: 'PUT',
      url: `/api/books/${b2.id}/style`,
      payload: { primaryProfileId: p1, auxProfileIds: [p2] },
    });
    expect(bind2.statusCode).toBe(200);
    const del = await app.inject({ method: 'DELETE', url: `/api/style-profiles/${p2}` });
    expect(del.statusCode).toBe(409);
    const body = del.json() as { error: string; books: Array<{ id: string; title: string }> };
    expect(body.error).toContain('已被书绑定');
    expect(body.books.some((x) => x.id === b2.id)).toBe(true);

    await app.inject({ method: 'PUT', url: `/api/books/${b1.id}/style`, payload: { profileId: null } });
    await app.inject({ method: 'PUT', url: `/api/books/${b2.id}/style`, payload: { profileId: null } });
    for (const pid of [p1, p2]) {
      expect((await app.inject({ method: 'DELETE', url: `/api/style-profiles/${pid}` })).statusCode).toBe(200);
    }
  });

  it('weights 校验矩阵：和≠100/键集多余/键集缺失/值 0/辅内部重复/解绑带 weights → 400 人话', async () => {
    const p1 = await newProfile('比例矩阵主档');
    const p2 = await newProfile('比例矩阵辅档');
    const p3 = await newProfile('比例矩阵未勾档');
    const book = await newBook('比例矩阵书');

    const cases: Array<{ payload: Record<string, unknown>; msg: string | null }> = [
      { payload: { primaryProfileId: p1, auxProfileIds: [p2], weights: { [p1]: 60, [p2]: 39 } }, msg: '比例之和必须为 100' },
      { payload: { primaryProfileId: p1, auxProfileIds: [p2], weights: { [p1]: 50, [p2]: 40, [p3]: 10 } }, msg: '比例键集必须恰为基准档案与辅档案全集' },
      { payload: { primaryProfileId: p1, auxProfileIds: [p2, p3], weights: { [p1]: 60, [p2]: 40 } }, msg: '比例键集必须恰为基准档案与辅档案全集' },
      { payload: { primaryProfileId: p1, auxProfileIds: [p2], weights: { [p1]: 0, [p2]: 100 } }, msg: null }, // 值 0：zod int().min(1) 内建文案
      { payload: { primaryProfileId: p1, auxProfileIds: [p2, p2] }, msg: '辅档案不可重复勾选' }, // D4 回归：此前落库撞 UNIQUE 出 500
      { payload: { profileId: null, weights: { [p1]: 100 } }, msg: '解绑请求不得携带绑定字段' },
    ];
    for (const c of cases) {
      const r = await app.inject({ method: 'PUT', url: `/api/books/${book.id}/style`, payload: c.payload });
      expect(r.statusCode, `payload ${JSON.stringify(c.payload)} 应 400`).toBe(400);
      const err = (r.json() as { error: string }).error;
      expect(err).toContain('请求参数不合法');
      if (c.msg) expect(err, `payload ${JSON.stringify(c.payload)} 应含文案「${c.msg}」`).toContain(c.msg);
    }

    for (const pid of [p1, p2, p3]) {
      expect((await app.inject({ method: 'DELETE', url: `/api/style-profiles/${pid}` })).statusCode).toBe(200);
    }
  });

  it('weights 成功路径：回显带 weights+快照 mergeVersion=2 带 weights；legacy body 快照无 weights 键', async () => {
    const p1 = await newProfile('比例成功主档');
    const p2 = await newProfile('比例成功辅档');
    const b1 = await newBook('比例成功书');
    const bind = await app.inject({
      method: 'PUT',
      url: `/api/books/${b1.id}/style`,
      payload: { primaryProfileId: p1, auxProfileIds: [p2], weights: { [p1]: 60, [p2]: 40 } },
    });
    expect(bind.statusCode).toBe(200);

    const g = (await app.inject({ method: 'GET', url: `/api/books/${b1.id}` })).json() as {
      styleBinding: { primaryProfileId: string; auxProfileIds: string[]; dimsSource: Record<string, string>; weights: Record<string, number> };
      styleSnapshotJson: string;
    };
    expect(g.styleBinding).toEqual({ primaryProfileId: p1, auxProfileIds: [p2], dimsSource: {}, weights: { [p1]: 60, [p2]: 40 } });
    const snap = JSON.parse(g.styleSnapshotJson) as { v: number; mergeVersion: number; weights: Record<string, number> };
    expect(snap.v).toBe(2);
    expect(snap.mergeVersion).toBe(2);
    expect(snap.weights).toEqual({ [p1]: 60, [p2]: 40 });

    // legacy body {profileId}：新快照 mergeVersion=2 但无 weights 键（空权重不写键），回显 weights={}
    const b2 = await newBook('比例legacy书');
    const bind2 = await app.inject({ method: 'PUT', url: `/api/books/${b2.id}/style`, payload: { profileId: p1 } });
    expect(bind2.statusCode).toBe(200);
    const g2 = (await app.inject({ method: 'GET', url: `/api/books/${b2.id}` })).json() as {
      styleBinding: { weights: Record<string, number> };
      styleSnapshotJson: string;
    };
    expect(g2.styleBinding.weights).toEqual({});
    const snap2 = JSON.parse(g2.styleSnapshotJson) as { mergeVersion: number; weights?: Record<string, number> };
    expect(snap2.mergeVersion).toBe(2);
    expect('weights' in snap2).toBe(false);

    // 清理：解绑两书 + 删档案，不留脏引用
    await app.inject({ method: 'PUT', url: `/api/books/${b1.id}/style`, payload: { profileId: null } });
    await app.inject({ method: 'PUT', url: `/api/books/${b2.id}/style`, payload: { profileId: null } });
    for (const pid of [p1, p2]) {
      expect((await app.inject({ method: 'DELETE', url: `/api/style-profiles/${pid}` })).statusCode).toBe(200);
    }
  });
});
