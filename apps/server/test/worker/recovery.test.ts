import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config';
import { migrate } from '../../src/db/migrate';
import { openDb, type Database } from '../../src/db/open';
import { createBook } from '../../src/db/repositories/books';
import { upsertBlueprint, appendChapterVersion, setCurrentVersion, getChapterById } from '../../src/db/repositories/chapters';
import { appendStep, claimNextStep, createRun, heartbeatStep, listSteps, markStep, takeoverStaleSteps, updateRunStatus } from '../../src/db/repositories/runs';
import { workerLoop } from '../../src/worker/loop';
import { createDefaultMockProvider, makeMockDraft } from '../../src/llm/mock';
import type { ChapterBlueprint } from '@inkforge/shared';

const BP: ChapterBlueprint = { goal: 'g', beats: [], mustHaveBeats: [], bannedTopics: [] };
const config = loadConfig({ STRATA_BASE_URL: 'http://x', STRATA_API_KEY: 'k', STRATA_MODEL: 'm' });

let db: Database;
let dir: string;
let bookId: string;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkforge-rec-'));
  db = openDb(path.join(dir, 't.db'));
  migrate(db);
  bookId = createBook(db, { title: '恢复测试书' }).id;
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
    /* ignore */
  }
});

function seedChapter(no: number): string {
  const ch = upsertBlueprint(db, { bookId, chapterNo: no, title: `第${no}章`, blueprint: BP, targetChars: 500 });
  return ch.id;
}

function seedRun(chapterIds: string[], status: 'queued' | 'running' = 'running'): string {
  const run = createRun(db, { bookId, mode: 'generate', chapterScope: { from: 1, to: chapterIds.length } });
  if (status === 'running') updateRunStatus(db, run.id, 'running', { startedAt: new Date().toISOString() });
  return run.id;
}

describe('takeoverStaleSteps', () => {
  it('心跳超时接管 → queued + attempt+1；新心跳行与 done 行不动', () => {
    const chId = seedChapter(1);
    const runId = seedRun([chId]);
    const stale = appendStep(db, { runId, chapterId: chId, step: 'draft', attempt: 1 });
    markStep(db, stale.id, { status: 'inflight', startedAt: new Date().toISOString(), leaseOwner: 'w1', heartbeatAt: new Date(Date.now() - 60000).toISOString() });
    const fresh = appendStep(db, { runId, chapterId: chId, step: 'qc', attempt: 1 });
    markStep(db, fresh.id, { status: 'inflight', startedAt: new Date().toISOString(), leaseOwner: 'w1', heartbeatAt: new Date().toISOString() });
    const done = appendStep(db, { runId, chapterId: chId, step: 'finalize', attempt: 1 });
    markStep(db, done.id, { status: 'done', endedAt: new Date().toISOString() });
    const n = takeoverStaleSteps(db, 30000);
    expect(n).toBe(1);
    const rows = listSteps(db, runId);
    const staleRow = rows.find((r) => r.id === stale.id)!;
    expect(staleRow.status).toBe('queued');
    expect(staleRow.attempt).toBe(2);
    expect(staleRow.leaseOwner).toBeUndefined();
    expect(rows.find((r) => r.id === fresh.id)!.status).toBe('inflight');
    expect(rows.find((r) => r.id === done.id)!.status).toBe('done');
    updateRunStatus(db, runId, 'cancelled'); // 终态防跨测试 claim 污染
  });
});

describe('claimNextStep + heartbeatStep', () => {
  it('FIFO：两 run 各 2 章按创建序与章序 claim；owner 不匹配心跳 no-op', () => {
    const ch1 = seedChapter(2);
    const ch2 = seedChapter(3);
    const runA = seedRun([ch1, ch2]);
    const ch3 = seedChapter(4);
    const runB = seedRun([ch3]);
    for (const chId of [ch1, ch2]) appendStep(db, { runId: runA, chapterId: chId, step: 'draft', attempt: 1 });
    appendStep(db, { runId: runB, chapterId: ch3, step: 'draft', attempt: 1 });

    const c1 = claimNextStep(db, 'w1')!;
    expect(c1.runId).toBe(runA);
    expect(c1.chapterId).toBe(ch1);
    const c2 = claimNextStep(db, 'w1')!;
    expect(c2.chapterId).toBe(ch2);
    const c3 = claimNextStep(db, 'w2')!;
    expect(c3.runId).toBe(runB);
    expect(claimNextStep(db, 'w2')).toBeNull(); // 无 queued

    const before = (db.prepare('SELECT heartbeat_at FROM run_steps WHERE id = ?').get(c1.id) as { heartbeat_at: string }).heartbeat_at;
    heartbeatStep(db, c1.id, 'wrong-owner');
    const after = (db.prepare('SELECT heartbeat_at FROM run_steps WHERE id = ?').get(c1.id) as { heartbeat_at: string }).heartbeat_at;
    expect(after).toBe(before);
    heartbeatStep(db, c1.id, 'w1');
    const after2 = (db.prepare('SELECT heartbeat_at FROM run_steps WHERE id = ?').get(c1.id) as { heartbeat_at: string }).heartbeat_at;
    expect(after2).not.toBe(before);
    updateRunStatus(db, runA, 'cancelled');
    updateRunStatus(db, runB, 'cancelled');
  });
});

describe('resumePoint + workerLoop 断点续跑', () => {
  it('draft done + partial → resumePoint qc；workerLoop 续跑后 draft 版本数仍 1 且 qc done', async () => {
    const chId = seedChapter(5);
    const runId = seedRun([chId]);
    // 种子：draft done（有版本）
    const draftStep = appendStep(db, { runId, chapterId: chId, step: 'draft', attempt: 1 });
    const v = appendChapterVersion(db, { chapterId: chId, kind: 'draft', content: makeMockDraft(5) });
    markStep(db, draftStep.id, { status: 'done', endedAt: new Date().toISOString(), outputVersionId: v.id });
    setCurrentVersion(db, chId, v.id);
    appendStep(db, { runId, chapterId: chId, step: 'qc', attempt: 1 }); // queued
    expect((await import('../../src/db/repositories/runs')).resumePoint(db, runId, chId)).toBe('qc');

    // partial_outputs 存在
    db.prepare('INSERT INTO partial_outputs(run_step_id, content, updated_at) VALUES(?,?,?)').run(draftStep.id, '残稿', new Date().toISOString());

    const loopSignal = new AbortController();
    const loop = workerLoop({ db, provider: createDefaultMockProvider(), config, workerId: 'w-test', emit: () => {}, signal: loopSignal.signal });
    // 等 qc+finalize 完成
    const deadline = Date.now() + 10000;
    for (;;) {
      const steps = listSteps(db, runId);
      const qc = steps.find((s) => s.step === 'qc')!;
      if (qc.status === 'done') break;
      if (Date.now() > deadline) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    loopSignal.abort();
    await loop;
    const versions = (db.prepare('SELECT COUNT(*) AS n FROM chapter_versions WHERE chapter_id = ?').get(chId) as { n: number }).n;
    expect(versions).toBe(1); // draft 复用未重生成
    const qcRow = listSteps(db, runId).find((s) => s.step === 'qc')!;
    expect(qcRow.status).toBe('done');
    const finRow = listSteps(db, runId).find((s) => s.step === 'finalize')!;
    expect(finRow.status).toBe('done');
    expect(getChapterById(db, chId)!.status).toBe('done');
  }, 30000);
});
