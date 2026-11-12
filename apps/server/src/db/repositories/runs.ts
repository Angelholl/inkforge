import { randomUUID } from 'node:crypto';
import type { RunStatus, StepName, StepStatus } from '@inkforge/shared';
import type { Database } from '../open';

export interface Run {
  id: string;
  bookId: string;
  mode: 'generate' | 'continue';
  status: RunStatus;
  chapterScope: { from: number; to: number };
  skipFailures: boolean;
  salvagePartial: boolean;
  maxRounds: number;
  createdAt: string;
  startedAt?: string;
  endedAt?: string;
  error?: string;
}

export interface RunStep {
  id: string;
  runId: string;
  chapterId: string;
  step: StepName;
  attempt: number;
  status: StepStatus;
  leaseOwner?: string;
  heartbeatAt?: string;
  startedAt?: string;
  endedAt?: string;
  error?: string;
  outputVersionId?: string;
  outputJson?: object;
}

interface RunRow {
  id: string;
  book_id: string;
  mode: string;
  status: string;
  chapter_scope_json: string;
  skip_failures: number;
  salvage_partial: number;
  max_rounds: number;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
  error: string | null;
}

interface StepRow {
  id: string;
  run_id: string;
  chapter_id: string;
  step: string;
  attempt: number;
  status: string;
  lease_owner: string | null;
  heartbeat_at: string | null;
  started_at: string | null;
  ended_at: string | null;
  error: string | null;
  output_version_id: string | null;
  output_json: string | null;
}

function toRun(r: RunRow): Run {
  return {
    id: r.id,
    bookId: r.book_id,
    mode: r.mode as Run['mode'],
    status: r.status as RunStatus,
    chapterScope: JSON.parse(r.chapter_scope_json) as { from: number; to: number },
    skipFailures: r.skip_failures === 1,
    salvagePartial: r.salvage_partial === 1,
    maxRounds: r.max_rounds,
    createdAt: r.created_at,
    startedAt: r.started_at ?? undefined,
    endedAt: r.ended_at ?? undefined,
    error: r.error ?? undefined,
  };
}

function toStep(r: StepRow): RunStep {
  return {
    id: r.id,
    runId: r.run_id,
    chapterId: r.chapter_id,
    step: r.step as StepName,
    attempt: r.attempt,
    status: r.status as StepStatus,
    leaseOwner: r.lease_owner ?? undefined,
    heartbeatAt: r.heartbeat_at ?? undefined,
    startedAt: r.started_at ?? undefined,
    endedAt: r.ended_at ?? undefined,
    error: r.error ?? undefined,
    outputVersionId: r.output_version_id ?? undefined,
    outputJson: r.output_json ? (JSON.parse(r.output_json) as object) : undefined,
  };
}

export function createRun(
  db: Database,
  input: { bookId: string; mode: 'generate' | 'continue'; chapterScope: { from: number; to: number }; maxRounds?: number; skipFailures?: boolean; salvagePartial?: boolean },
): Run {
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    'INSERT INTO runs(id, book_id, mode, chapter_scope_json, skip_failures, salvage_partial, max_rounds, created_at) VALUES(?,?,?,?,?,?,?,?)',
  ).run(id, input.bookId, input.mode, JSON.stringify(input.chapterScope), input.skipFailures === false ? 0 : 1, input.salvagePartial === false ? 0 : 1, input.maxRounds ?? 2, now);
  return getRun(db, id)!;
}

export function getRun(db: Database, runId: string): Run | undefined {
  const row = db.prepare('SELECT * FROM runs WHERE id = ?').get(runId) as RunRow | undefined;
  return row ? toRun(row) : undefined;
}

export function updateRunStatus(db: Database, runId: string, status: RunStatus, patch?: { startedAt?: string; endedAt?: string; error?: string }): void {
  const run = getRun(db, runId);
  if (!run) return;
  db.prepare('UPDATE runs SET status=?, started_at=?, ended_at=?, error=? WHERE id=?').run(
    status,
    patch?.startedAt ?? run.startedAt ?? null,
    patch?.endedAt ?? run.endedAt ?? null,
    patch?.error ?? run.error ?? null,
    runId,
  );
}

export function appendStep(db: Database, input: { runId: string; chapterId: string; step: StepName; attempt: number }): RunStep {
  const id = randomUUID();
  db.prepare('INSERT INTO run_steps(id, run_id, chapter_id, step, attempt, status) VALUES(?,?,?,?,?,?)').run(
    id,
    input.runId,
    input.chapterId,
    input.step,
    input.attempt,
    'queued',
  );
  return getStep(db, id)!;
}

export function getStep(db: Database, stepId: string): RunStep | undefined {
  const row = db.prepare('SELECT * FROM run_steps WHERE id = ?').get(stepId) as StepRow | undefined;
  return row ? toStep(row) : undefined;
}

export function markStep(
  db: Database,
  stepId: string,
  patch: Partial<{ status: StepStatus; startedAt: string; endedAt: string; error: string; outputVersionId: string; outputJson: object; heartbeatAt: string; leaseOwner: string }>,
): void {
  const step = getStep(db, stepId);
  if (!step) return;
  db.prepare(
    'UPDATE run_steps SET status=?, started_at=?, ended_at=?, error=?, output_version_id=?, output_json=?, heartbeat_at=?, lease_owner=? WHERE id=?',
  ).run(
    patch.status ?? step.status,
    patch.startedAt ?? step.startedAt ?? null,
    patch.endedAt ?? step.endedAt ?? null,
    patch.error ?? step.error ?? null,
    patch.outputVersionId ?? step.outputVersionId ?? null,
    patch.outputJson ? JSON.stringify(patch.outputJson) : (step.outputJson ? JSON.stringify(step.outputJson) : null),
    patch.heartbeatAt ?? step.heartbeatAt ?? null,
    patch.leaseOwner ?? step.leaseOwner ?? null,
    stepId,
  );
}

export function listSteps(db: Database, runId: string): RunStep[] {
  return (db.prepare('SELECT * FROM run_steps WHERE run_id = ? ORDER BY rowid').all(runId) as StepRow[]).map(toStep);
}

export function listRunsByBook(db: Database, bookId: string): Run[] {
  return (db.prepare('SELECT * FROM runs WHERE book_id = ? ORDER BY created_at DESC').all(bookId) as RunRow[]).map(toRun);
}

// ── 租约与恢复（T17）──

const STEP_ORDER: Record<StepName, number> = { draft: 0, qc: 1, rewrite: 2, summarize: 3, finalize: 4 };

/** 事务内 claim：最早活跃 run（queued/running 按创建序）→ 其 (chapter_no, 步序, attempt) 最早的 queued step → inflight+租约。 */
export function claimNextStep(db: Database, workerId: string): RunStep | null {
  const tx = db.transaction((): RunStep | null => {
    const runs = db
      .prepare("SELECT * FROM runs WHERE status IN ('queued','running') ORDER BY created_at, rowid")
      .all() as RunRow[];
    for (const r of runs) {
      const rows = db
        .prepare("SELECT * FROM run_steps WHERE run_id = ? AND status = 'queued'")
        .all(r.id) as StepRow[];
      if (rows.length === 0) continue;
      rows.sort((a, b) => {
        const cnA = (db.prepare('SELECT chapter_no FROM chapters WHERE id = ?').get(a.chapter_id) as { chapter_no: number }).chapter_no;
        const cnB = (db.prepare('SELECT chapter_no FROM chapters WHERE id = ?').get(b.chapter_id) as { chapter_no: number }).chapter_no;
        if (cnA !== cnB) return cnA - cnB;
        const ord = STEP_ORDER[a.step as StepName] - STEP_ORDER[b.step as StepName];
        if (ord !== 0) return ord;
        return a.attempt - b.attempt;
      });
      const target = rows[0];
      const now = new Date().toISOString();
      db.prepare("UPDATE run_steps SET status='inflight', lease_owner=?, heartbeat_at=?, started_at=? WHERE id=?").run(workerId, now, now, target.id);
      return getStep(db, target.id)!;
    }
    return null;
  });
  return tx();
}

/** 心跳：owner 不匹配则 no-op。 */
export function heartbeatStep(db: Database, stepId: string, workerId: string): void {
  db.prepare("UPDATE run_steps SET heartbeat_at = ? WHERE id = ? AND lease_owner = ? AND status = 'inflight'").run(
    new Date().toISOString(),
    stepId,
    workerId,
  );
}

/** inflight 且心跳超时 → queued + attempt+1，清租约；返回接管数。 */
export function takeoverStaleSteps(db: Database, staleMs = 30000): number {
  const cutoff = new Date(Date.now() - staleMs).toISOString();
  const rows = db
    .prepare("SELECT id, attempt FROM run_steps WHERE status = 'inflight' AND (heartbeat_at IS NULL OR heartbeat_at < ?)")
    .all(cutoff) as Array<{ id: string; attempt: number }>;
  const tx = db.transaction(() => {
    for (const r of rows) {
      db.prepare("UPDATE run_steps SET status='queued', attempt=attempt+1, lease_owner=NULL, heartbeat_at=NULL WHERE id=?").run(r.id);
    }
  });
  tx();
  return rows.length;
}

/** 断点判定：最后 done 步的下一序；无 queued → null。 */
export function resumePoint(db: Database, runId: string, chapterId: string): StepName | null {
  const rows = listSteps(db, runId).filter((s) => s.chapterId === chapterId);
  const has = (step: StepName) => rows.some((r) => r.step === step && r.status === 'done');
  // 完成只认 finalize done 行（pending 不得代理已完成）
  if (rows.some((r) => r.step === 'finalize' && r.status === 'done')) return null;
  if (!has('draft')) return 'draft'; // 全新章或 draft 未完成
  if (!has('qc')) return 'qc';
  const lastQc = rows.filter((r) => r.step === 'qc' && r.status === 'done').at(-1)!;
  const gate = (lastQc.outputJson as { gate?: { action?: string } } | undefined)?.gate?.action;
  if (gate === 'rewrite') return 'rewrite';
  if (has('rewrite') && gate !== 'pass') return 'qc';
  if (gate === 'pass') {
    return has('summarize') ? 'finalize' : 'summarize';
  }
  // needs_human / 未知 gate：重跑质检（finalize 幂等保证收敛）
  return 'qc';
}
