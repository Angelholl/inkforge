import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config';
import { buildApp } from '../../src/app';
import { openDb, type Database } from '../../src/db/open';
import { createMockProvider } from '../../src/llm/mock';
import type { LlmProvider } from '../../src/llm/types';

const SAMPLE_TEXT = '山风掠过松林，少年抬头望向远方。他说：“路还长。”夜色深沉，灯火摇曳。'.repeat(20);
const ANALYSIS_TEXT = `DIM: 节奏: 短句为主。
AXIS: 叙述温度: 60
RULES: 平均句长 10-20 字。`;
const CUSTOM_TEMPLATE = '你是武侠文风专家。侧重兵器描写与江湖气，输出 DIM/AXIS/RULES 行。';

let dir: string;
let db: Database;
let app: Awaited<ReturnType<typeof buildApp>>;
let captured: string[] = [];

/** B5 后台化：POST 只登记 job 回 202，模型调用在 job 里异步跑 → 先轮询到终态，captured 才完整。 */
async function waitJob(jobId: string, timeoutMs = 30000): Promise<{ status: string; result: { samples: string[] } | null }> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const g = await app.inject({ method: 'GET', url: `/api/style-profiles/jobs/${jobId}` });
    expect(g.statusCode).toBe(200);
    const job = g.json() as { status: string; result: { samples: string[] } | null };
    if (job.status === 'done' || job.status === 'failed') return job;
    if (Date.now() > deadline) throw new Error(`job 未收敛：${job.status}`);
    await new Promise((res) => setTimeout(res, 20));
  }
}

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkforge-tpl-'));
  const config = loadConfig({ STRATA_BASE_URL: 'http://127.0.0.1:47831/v1', STRATA_API_KEY: 'strata', STRATA_MODEL: 'iq3_xxs', INKFORGE_DATA_DIR: dir });
  db = openDb(path.join(config.dataDir, 'inkforge.db'));
  const capturing: LlmProvider = {
    complete: async (req) => {
      captured.push(req.user);
      return { text: ANALYSIS_TEXT, usage: { promptTokens: 0, completionTokens: 0 }, finishReason: 'stop' };
    },
  };
  app = await buildApp({
    config,
    provider: createMockProvider({ draft: { text: 'x' }, qc: { text: '' }, summarize: { text: 'y' } }),
    summarizerProvider: capturing,
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

describe('蒸馏模板（app_meta.distill_template）', () => {
  it('GET 默认空串 → PUT 保存 → GET 回读；PUT 空串恢复默认', async () => {
    const g1 = await app.inject({ method: 'GET', url: '/api/settings/distill-template' });
    expect(g1.json()).toEqual({ template: '' });

    const p1 = await app.inject({ method: 'PUT', url: '/api/settings/distill-template', payload: { template: CUSTOM_TEMPLATE } });
    expect(p1.statusCode).toBe(200);
    const g2 = await app.inject({ method: 'GET', url: '/api/settings/distill-template' });
    expect(g2.json()).toEqual({ template: CUSTOM_TEMPLATE });

    const p2 = await app.inject({ method: 'PUT', url: '/api/settings/distill-template', payload: { template: '' } });
    expect(p2.statusCode).toBe(200);
    const g3 = await app.inject({ method: 'GET', url: '/api/settings/distill-template' });
    expect(g3.json()).toEqual({ template: '' });

    const bad = await app.inject({ method: 'PUT', url: '/api/settings/distill-template', payload: { template: 123 } });
    expect(bad.statusCode).toBe(400);
  });

  it('distill 接模板：已存模板进 prompt（默认模板不出场）', async () => {
    await app.inject({ method: 'PUT', url: '/api/settings/distill-template', payload: { template: CUSTOM_TEMPLATE } });
    captured = [];
    const r = await app.inject({ method: 'POST', url: '/api/style-profiles/distill', payload: { name: '模板测', text: SAMPLE_TEXT } });
    expect(r.statusCode).toBe(202);
    await waitJob((r.json() as { jobId: string }).jobId);
    expect(captured[0]).toContain(CUSTOM_TEMPLATE);
    expect(captured[0]).not.toContain('八维：节奏、对话'); // 默认指令被模板覆盖
    // 样本段仍拼接在模板后
    expect(captured[0]).toContain('山风掠过松林');
  });

  it('distill 空串模板 → 回落默认指令（含八维六轴说明与尺度维指导行）', async () => {
    await app.inject({ method: 'PUT', url: '/api/settings/distill-template', payload: { template: '' } });
    captured = [];
    const r = await app.inject({ method: 'POST', url: '/api/style-profiles/distill', payload: { name: '默认测', text: SAMPLE_TEXT } });
    expect(r.statusCode).toBe(202);
    await waitJob((r.json() as { jobId: string }).jobId);
    expect(captured[0]).toContain('六维：语言与描写、特色词汇、结构与节奏、情感基调、尺度、叙述方式');
    expect(captured[0]).toContain('心理距离'); // DM-2 叙述方式定向要求
    expect(captured[0]).toContain('对话腔'); // DM-2 语言与描写定向要求
    expect(captured[0]).toContain('尺度维=直白度与性描写尺度的画像'); // DEC-2026-1122-03④ 露骨用词证据要求
    expect(captured[0]).toContain('六轴：叙述温度、语言密度、叙述者姿态、节奏、幽默、情绪表达');
    expect(captured[0]).toContain('每维不少于 70 字');
    expect(captured[0]).toContain('证据词仅作建议');
  });

  it('distill 接参数：temperature/maxSegments 合法值通过（maxSegments 收敛采样）', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/style-profiles/distill',
      payload: { name: '参数测', text: SAMPLE_TEXT, temperature: 0.5, maxSegments: 6 },
    });
    expect(r.statusCode).toBe(202);
    const job = await waitJob((r.json() as { jobId: string }).jobId);
    const draft = job.result as { samples: string[] };
    expect(draft.samples.length).toBeLessThanOrEqual(6);
    expect(draft.samples.length).toBeGreaterThan(0);
  });

  it('distill 自定义模板（不含量条）仍触发逐维下限重试并产出 warning（DF-5 不变量）', async () => {
    await app.inject({ method: 'PUT', url: '/api/settings/distill-template', payload: { template: CUSTOM_TEMPLATE } });
    captured = [];
    const r = await app.inject({ method: 'POST', url: '/api/style-profiles/distill', payload: { name: '模板不变量测', text: SAMPLE_TEXT } });
    expect(r.statusCode).toBe(202);
    const job = await waitJob((r.json() as { jobId: string }).jobId);
    expect(job.status).toBe('done');
    // ① 首轮 prompt=自定义模板，默认指令六维清单不出场（模板整表替换 instruction）
    expect(captured[0]).toContain(CUSTOM_TEMPLATE);
    expect(captured[0]).not.toContain('六维：语言与描写、特色词汇、结构与节奏、情感基调、尺度、叙述方式');
    // ② 第二次解析调用确实发生，user 段带逐维缺口反馈（模板不含「70 字」仍照常校验）
    expect(captured.length).toBeGreaterThanOrEqual(2);
    expect(captured[1]).toContain('低于下限70字');
    // ③ result 透传 warning（重试后仍不足 → warnings 非空）
    const result = job.result as { samples: string[]; warnings?: string[] } | null;
    expect(result?.warnings?.length).toBeGreaterThan(0);
  });
});
