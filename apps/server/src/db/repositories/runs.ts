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
  // rowid = 插入序（started_at 有 NULL 会扰动排序）
  return (db.prepare('SELECT * FROM run_steps WHERE run_id = ? ORDER BY rowid').all(runId) as StepRow[]).map(toStep);
}

export function listRunsByBook(db: Database, bookId: string): Run[] {
  return (db.prepare('SELECT * FROM runs WHERE book_id = ? ORDER BY created_at DESC').all(bookId) as RunRow[]).map(toRun);
}
