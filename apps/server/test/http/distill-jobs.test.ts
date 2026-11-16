import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config';
import { buildApp } from '../../src/app';
import { createMockProvider } from '../../src/llm/mock';
import { openDb, type Database } from '../../src/db/open';
import { failStaleDistillJobs } from '../../src/style/distill-job';
import type { DistillJobDto, DistillStyleDraftDto } from '@inkforge/shared';

let dir: string;
let db: Database;
let app: Awaited<ReturnType<typeof buildApp>>;

const SAMPLE_TEXT = '山风掠过松林，少年抬头望向远方。他说：“路还长。”夜色深沉，灯火摇曳。'.repeat(6);

const ANALYSIS_TEXT = `DIM: 节奏: 短句为主，段落 3-6 行。
DIM: 对话: 对话占比约三成，多短对答。
AXIS: 叙述温度: 72
AXIS: 语言密度: 55
RULES: 平均句长 10-20 字。
RULES: 对话占比 20%-40%。`;

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkforge-distill-jobs-'));
  const config = loadConfig({
    STRATA_BASE_URL: 'http://127.0.0.1:47831/v1',
    STRATA_API_KEY: 'strata',
    STRATA_MODEL: 'iq3_xxs',
    INKFORGE_DATA_DIR: dir,
  });
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

/** 轮询 job 到终态（mock provider 即时返回，20ms 步进足够）。 */
async function waitJob(jobId: string, timeoutMs = 30000): Promise<DistillJobDto> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const r = await app.inject({ method: 'GET', url: `/api/style-profiles/jobs/${jobId}` });
    expect(r.statusCode).toBe(200);
    const job = r.json() as DistillJobDto;
    if (job.status === 'done' || job.status === 'failed') return job;
    if (Date.now() > deadline) throw new Error(`job 未收敛：${JSON.stringify(job)}`);
    await new Promise((res) => setTimeout(res, 20));
  }
}

async function startDistill(name: string, text = SAMPLE_TEXT): Promise<string> {
  const r = await app.inject({ method: 'POST', url: '/api/style-profiles/distill', payload: { name, text } });
  expect(r.statusCode).toBe(202);
  const { jobId } = r.json() as { jobId: string };
  expect(typeof jobId).toBe('string');
  return jobId;
}

async function saveProfile(name: string, draft: DistillStyleDraftDto, text = SAMPLE_TEXT): Promise<{ profileId: string; version: number }> {
  const r = await app.inject({
    method: 'POST',
    url: '/api/style-profiles',
    payload: { name, text, analysis: draft.analysis, samples: draft.samples, evaluation: draft.evaluation },
  });
  expect(r.statusCode).toBe(201);
  return r.json() as { profileId: string; version: number };
}

const profileCount = (): number => (db.prepare('SELECT COUNT(*) AS n FROM style_profiles').get() as { n: number }).n;
const sourceRow = (hash: string): { text: string; name: string } | undefined =>
  db.prepare('SELECT text, name FROM style_sources WHERE source_hash = ?').get(hash) as { text: string; name: string } | undefined;

describe('蒸馏后台化与同源重蒸（B5，DEC-2026-1116-01 反馈⑤）', () => {
  it('POST distill → 202 {jobId} 且此刻不入库；轮询到 done 得 result 并带整篇原文', async () => {
    const before = profileCount();
    const jobId = await startDistill('后台体');
    expect(profileCount()).toBe(before); // 202 只登记 job，模型还没跑完就更不该入库
    const job = await waitJob(jobId);
    expect(job.status).toBe('done');
    expect(job.progress).toBe(100);
    expect(job.error).toBeNull();
    expect(job.result).not.toBeNull();
    const analysis = (job.result as DistillStyleDraftDto).analysis;
    expect(Object.keys(analysis.dims).length).toBeGreaterThan(0);
    expect(analysis.dims['节奏']).toBeTruthy();
    // 重蒸后「确认入库」要用的整篇原文随 result 一并回给前端
    expect((job.result as DistillStyleDraftDto).sourceText).toBe(SAMPLE_TEXT);
    expect(profileCount()).toBe(before); // 蒸馏本身永不自动入库（确认门）
  }, 60000);

  it('入库后 style_sources 按 hash 留存整篇原文，同文再入库不重复', async () => {
    const draft = await (async () => {
      const jobId = await startDistill('留存体');
      return (await waitJob(jobId)).result as DistillStyleDraftDto;
    })();
    const { profileId } = await saveProfile('留存体', draft);
    const hash = (db.prepare('SELECT source_hash FROM style_profiles WHERE id = ?').get(profileId) as { source_hash: string }).source_hash;
    const row = sourceRow(hash);
    expect(row).toBeTruthy();
    expect(row!.text).toBe(SAMPLE_TEXT);
    expect(row!.text.replace(/\s/g, '').length).toBeGreaterThan(200);
    expect(row!.name).toBe('留存体');

    await saveProfile('留存体改名', draft);
    const rows = db.prepare('SELECT COUNT(*) AS n FROM style_sources WHERE source_hash = ?').get(hash) as { n: number };
    expect(rows.n).toBe(1); // ON CONFLICT DO NOTHING：同 hash 只留一份
  }, 60000);

  it('redistill 已留存档案 → 202 → done → 确认入库后同 hash version=2，且 job 记 base_profile_id', async () => {
    // 独占文本 → 独占 source_hash，version 计数不被前两个用例的同源档案污染
    const text = `${SAMPLE_TEXT}重蒸篇独有尾段。`;
    const draft = await (async () => {
      const jobId = await startDistill('重蒸体', text);
      return (await waitJob(jobId)).result as DistillStyleDraftDto;
    })();
    const { profileId, version } = await saveProfile('重蒸体', draft, text);
    expect(version).toBe(1);

    const r = await app.inject({ method: 'POST', url: `/api/style-profiles/${profileId}/redistill` });
    expect(r.statusCode).toBe(202);
    const { jobId } = r.json() as { jobId: string };
    const job = await waitJob(jobId);
    expect(job.status).toBe('done');
    expect((db.prepare('SELECT base_profile_id AS b FROM distill_jobs WHERE id = ?').get(jobId) as { b: string }).b).toBe(profileId);

    const res = job.result as DistillStyleDraftDto;
    // 前端手里没有整篇原文：靠 result.sourceText 回灌，才能走同一条确认入库
    const second = await saveProfile('重蒸体', res, res.sourceText ?? SAMPLE_TEXT);
    expect(second.profileId).not.toBe(profileId);
    expect(second.version).toBe(2);
    const hash = (db.prepare('SELECT source_hash FROM style_profiles WHERE id = ?').get(second.profileId) as { source_hash: string }).source_hash;
    expect(hash).toBe((db.prepare('SELECT source_hash FROM style_profiles WHERE id = ?').get(profileId) as { source_hash: string }).source_hash);
  }, 60000);

  it('redistill 未留存原文的档案 → 409；未知档案 → 404', async () => {
    const now = new Date().toISOString();
    db.prepare(
      'INSERT INTO style_profiles(id, name, source_path, source_hash, version, rules_json, samples_json, metrics_json, created_at) VALUES(?,?,?,?,?,?,?,?,?)',
    ).run('sp-nosrc', '无原文档案', 'inline:deadbeef', 'hash-不在-sources', 1, '{"rulesText":"","dims":{},"axes":{},"terms":[]}', '[]', '{}', now);
    const r = await app.inject({ method: 'POST', url: '/api/style-profiles/sp-nosrc/redistill' });
    expect(r.statusCode).toBe(409);
    expect((r.json() as { error: string }).error).toContain('原文未留存');
    const miss = await app.inject({ method: 'POST', url: '/api/style-profiles/no-such-profile/redistill' });
    expect(miss.statusCode).toBe(404);
  });

  it('failStaleDistillJobs 把 queued/running 置 failed 且 error=server restarted，不动 done', () => {
    const now = new Date().toISOString();
    const ins = (id: string, status: string): void => {
      db.prepare('INSERT INTO distill_jobs(id, status, progress, stage, created_at, updated_at) VALUES(?,?,?,?,?,?)').run(
        id,
        status,
        status === 'done' ? 100 : 30,
        status,
        now,
        now,
      );
    };
    ins('j-queued', 'queued');
    ins('j-running', 'running');
    ins('j-done', 'done');

    failStaleDistillJobs(db);

    const rows = db.prepare('SELECT id, status, error FROM distill_jobs WHERE id IN (?,?,?) ORDER BY id').all('j-done', 'j-queued', 'j-running') as Array<{
      id: string;
      status: string;
      error: string | null;
    }>;
    expect(rows.map((r) => [r.id, r.status])).toEqual([
      ['j-done', 'done'],
      ['j-queued', 'failed'],
      ['j-running', 'failed'],
    ]);
    expect(rows.filter((r) => r.id !== 'j-done').every((r) => r.error === 'server restarted')).toBe(true);
  });
});
