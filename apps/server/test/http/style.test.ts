import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config';
import { buildApp } from '../../src/app';
import { createMockProvider } from '../../src/llm/mock';
import { openDb, type Database } from '../../src/db/open';
import type { DistillJobDto, DistillStyleDraftDto } from '@inkforge/shared';

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

  it('PUT style-fewshot：默认关 → 开 → 绑定/解绑都归零；非法 body 400、未知书 404', async () => {
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

    // 绑定归零
    await app.inject({ method: 'PUT', url: `/api/books/${book.id}/style`, payload: { profileId: pid } });
    const g2 = await app.inject({ method: 'GET', url: `/api/books/${book.id}` });
    expect((g2.json() as { styleFewshotOn: boolean }).styleFewshotOn).toBe(false);

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
});
