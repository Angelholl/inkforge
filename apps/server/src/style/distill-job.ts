import { randomUUID } from 'node:crypto';
import type { AppConfig } from '../config';
import type { Database } from '../db/open';
import type { LlmProvider } from '../llm/types';
import type { DistillStyleDraftDto } from '@inkforge/shared';
import { analyzeStyle } from './analysis';
import { pickFewShotAndHeldOut } from './sample';
import { buildFreqBlock } from './freq';

/** 进程重启后把上次没跑完的 job 一律判失败（轮询端点不会永远挂着 running）。 */
export function failStaleDistillJobs(db: Database): void {
  db.prepare("UPDATE distill_jobs SET status = 'failed', error = 'server restarted', updated_at = ? WHERE status IN ('queued','running')").run(
    new Date().toISOString(),
  );
}

export interface DistillJobRow {
  id: string;
  status: 'queued' | 'running' | 'done' | 'failed';
  progress: number;
  stage: string;
  error: string | null;
  result_json: string | null;
  base_profile_id: string | null;
}

export function createDistillJob(db: Database, baseProfileId: string | null): string {
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare('INSERT INTO distill_jobs(id, status, progress, stage, base_profile_id, created_at, updated_at) VALUES(?,?,?,?,?,?,?)').run(
    id,
    'queued',
    0,
    'queued',
    baseProfileId,
    now,
    now,
  );
  return id;
}

export function getDistillJob(db: Database, jobId: string): DistillJobRow | undefined {
  return db
    .prepare('SELECT id, status, progress, stage, error, result_json, base_profile_id FROM distill_jobs WHERE id = ?')
    .get(jobId) as DistillJobRow | undefined;
}

function setJob(
  db: Database,
  jobId: string,
  patch: { status?: DistillJobRow['status']; progress?: number; stage?: string; error?: string; resultJson?: DistillStyleDraftDto },
): void {
  const sets: string[] = [];
  const args: (string | number)[] = [];
  if (patch.status !== undefined) {
    sets.push('status = ?');
    args.push(patch.status);
  }
  if (patch.progress !== undefined) {
    sets.push('progress = ?');
    args.push(patch.progress);
  }
  if (patch.stage !== undefined) {
    sets.push('stage = ?');
    args.push(patch.stage);
  }
  if (patch.error !== undefined) {
    sets.push('error = ?');
    args.push(patch.error);
  }
  if (patch.resultJson !== undefined) {
    sets.push('result_json = ?');
    args.push(JSON.stringify(patch.resultJson));
  }
  sets.push('updated_at = ?');
  args.push(new Date().toISOString());
  db.prepare(`UPDATE distill_jobs SET ${sets.join(', ')} WHERE id = ?`).run(...args, jobId);
}

/** 后台蒸馏：四里程碑进度（0 创建 → 20 sampling → 30 analyzing → 100 done）；异常整枚置 failed。 */
export async function runDistillJob(
  deps: { db: Database; provider: LlmProvider; config: AppConfig; getTemplate: () => string },
  jobId: string,
  input: { name: string; text: string; maxSegments?: number; temperature?: number },
): Promise<void> {
  const { config } = deps;
  void config; // 计划签名保留 config（当前 analyzeStyle 不吃它），不删参
  try {
    setJob(deps.db, jobId, { status: 'running', progress: 20, stage: 'sampling' });
    const { fewShot, heldOut } = pickFewShotAndHeldOut(input.text, { count: input.maxSegments });
    setJob(deps.db, jobId, { progress: 30, stage: 'analyzing' });
    const { analysis, evaluation } = await analyzeStyle(
      { provider: deps.provider },
      {
        sourceText: input.text,
        samples: fewShot,
        heldOut,
        temperature: input.temperature,
        instruction: deps.getTemplate() || undefined,
        // 高频词组统计参考块（DEC-2026-1120-06），与 CLI 蒸馏路径同语义
        freqBlock: buildFreqBlock(fewShot),
      },
    );
    // sourceText 一并留档：重蒸出来的草稿要能走同一条「确认入库」（前端手里没有整篇原文）
    setJob(deps.db, jobId, {
      status: 'done',
      progress: 100,
      stage: 'done',
      resultJson: { analysis, samples: fewShot, evaluation, sourceText: input.text },
    });
  } catch (e) {
    setJob(deps.db, jobId, { status: 'failed', error: (e as Error).message });
  }
}
