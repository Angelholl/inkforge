import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseSelfEval } from '../../src/llm/plainproto';
import { loadConfig } from '../../src/config';
import { buildApp } from '../../src/app';
import { createMockProvider } from '../../src/llm/mock';
import { openDb, type Database } from '../../src/db/open';
import type { DistillStyleDraftDto } from '@inkforge/shared';

const SAMPLE_TEXT = '山风掠过松林，少年抬头望向远方。他说：“路还长。”夜色深沉，灯火摇曳。'.repeat(20);
const ANALYSIS_TEXT = `DIM: 节奏: 短句为主。
AXIS: 叙述温度: 60
RULES: 平均句长 10-20 字。`;
const SELF_EVAL_TEXT = `SCORE: 4
REASON: 句长与对话占比贴合，但段落节奏略平。
SCORE: 12
REASON: 第二段术语习惯完全一致。`;

let dir: string;
let db: Database;
let app: Awaited<ReturnType<typeof buildApp>>;

/** B5 后台化：POST 只登记 job 回 202 → 轮询到 done 取草稿。 */
async function waitDistillDraft(jobId: string, timeoutMs = 30000): Promise<DistillStyleDraftDto> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const g = await app.inject({ method: 'GET', url: `/api/style-profiles/jobs/${jobId}` });
    expect(g.statusCode).toBe(200);
    const job = g.json() as { status: string; error: string | null; result: DistillStyleDraftDto | null };
    if (job.status === 'done') return job.result as DistillStyleDraftDto;
    if (job.status === 'failed') throw new Error(`蒸馏 job 失败：${job.error}`);
    if (Date.now() > deadline) throw new Error(`job 未收敛：${job.status}`);
    await new Promise((res) => setTimeout(res, 20));
  }
}

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkforge-selfeval-'));
  const config = loadConfig({ STRATA_BASE_URL: 'http://127.0.0.1:47831/v1', STRATA_API_KEY: 'strata', STRATA_MODEL: 'iq3_xxs', INKFORGE_DATA_DIR: dir });
  db = openDb(path.join(config.dataDir, 'inkforge.db'));
  app = await buildApp({
    config,
    provider: createMockProvider({ draft: { text: 'x' }, qc: { text: '' }, summarize: { text: 'y' } }),
    // DF-3：ANALYSIS_TEXT 短文本触发逐维缺口反馈重试一次，队列补一份同文供第二次解析；自评取第三份，断言语义不变
    summarizerProvider: createMockProvider({ summarize: { sequence: [{ text: ANALYSIS_TEXT }, { text: ANALYSIS_TEXT }, { text: SELF_EVAL_TEXT }] } }),
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

describe('蒸馏自评（held-out SCORE/REASON）', () => {
  it('parseSelfEval：成对取、钳制 1-5、孤儿 REASON 记 error、缺行 evaluation=[]', () => {
    const r = parseSelfEval(SELF_EVAL_TEXT);
    expect(r.evaluation).toEqual([
      { score: 4, reason: '句长与对话占比贴合，但段落节奏略平。' },
      { score: 5, reason: '第二段术语习惯完全一致。' }, // 12 钳制为 5
    ]);
    expect(r.errors).toEqual([]);

    const orphan = parseSelfEval('REASON: 无分可依\n没有标记的一行');
    expect(orphan.evaluation).toEqual([]);
    expect(orphan.errors.some((e) => e.includes('REASON 无对应 SCORE'))).toBe(true);
    expect(parseSelfEval('SCORE: abc').evaluation).toEqual([{ score: 1, reason: '' }]);
    expect(parseSelfEval('SCORE: 0\nREASON: 低分').evaluation).toEqual([{ score: 1, reason: '低分' }]);
    expect(parseSelfEval('没有标记').evaluation).toEqual([]);
  });

  it('distill→create 链路：draft.evaluation 两段（钳制后）→ create 入库 metrics_json 含 selfScore/selfReason → list 可见', async () => {
    const d = await app.inject({ method: 'POST', url: '/api/style-profiles/distill', payload: { name: '自评测', text: SAMPLE_TEXT } });
    expect(d.statusCode).toBe(202);
    const draft = await waitDistillDraft((d.json() as { jobId: string }).jobId);
    expect(draft.evaluation).toEqual([
      { score: 4, reason: '句长与对话占比贴合，但段落节奏略平。' },
      { score: 5, reason: '第二段术语习惯完全一致。' },
    ]);

    const c = await app.inject({
      method: 'POST',
      url: '/api/style-profiles',
      payload: { name: '自评测', text: SAMPLE_TEXT, analysis: draft.analysis, samples: draft.samples, evaluation: draft.evaluation },
    });
    expect(c.statusCode).toBe(201);
    const profileId = (c.json() as { profileId: string }).profileId;

    const list = await app.inject({ method: 'GET', url: '/api/style-profiles' });
    const row = (list.json() as Array<{ id: string; metrics: Record<string, number | string> }>).find((x) => x.id === profileId)!;
    expect(row.metrics.selfScore).toBe(4);
    expect(row.metrics.selfReason).toBe('句长与对话占比贴合，但段落节奏略平。');
  });
});
