import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from '../../src/db/migrate';
import { openDb, type Database } from '../../src/db/open';
import { appendStep, createRun, markStep } from '../../src/db/repositories/runs';
import { hashPrompt } from '../../src/llm/hash';
import type { StepName } from '@inkforge/shared';

let db: Database;
let dir: string;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkforge-runs-'));
  db = openDb(path.join(dir, 't.db'));
  migrate(db);
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

describe('runs 仓储', () => {
  it('createRun 默认值（skip_failures=1 salvage_partial=1 max_rounds=2）', () => {
    const now = new Date().toISOString();
    db.prepare("INSERT INTO books(id, title, created_at, updated_at) VALUES('b1','书',?,?)").run(now, now);
    const run = createRun(db, { bookId: 'b1', mode: 'generate', chapterScope: { from: 1, to: 3 } });
    expect(run.skipFailures).toBe(true);
    expect(run.salvagePartial).toBe(true);
    expect(run.maxRounds).toBe(2);
    expect(run.status).toBe('queued');
    expect(run.chapterScope).toEqual({ from: 1, to: 3 });
  });

  it('appendStep/markStep 状态往返；重复 (run,chapter,step,attempt) 抛 UNIQUE', () => {
    const NOW = new Date().toISOString();
    db.prepare("INSERT INTO chapters(id, book_id, chapter_no, created_at) VALUES('c1','b1',1,?)").run(NOW);
    const run = createRun(db, { bookId: 'b1', mode: 'generate', chapterScope: { from: 1, to: 1 } });
    const step = appendStep(db, { runId: run.id, chapterId: 'c1', step: 'draft', attempt: 1 });
    expect(step.status).toBe('queued');
    markStep(db, step.id, { status: 'inflight', startedAt: NOW });
    markStep(db, step.id, { status: 'done', endedAt: NOW, outputJson: { gate: 'pass' } });
    const after = db.prepare('SELECT status, output_json FROM run_steps WHERE id = ?').get(step.id) as { status: string; output_json: string };
    expect(after.status).toBe('done');
    expect(JSON.parse(after.output_json)).toEqual({ gate: 'pass' });
    expect(() => appendStep(db, { runId: run.id, chapterId: 'c1', step: 'draft' as StepName, attempt: 1 })).toThrowError(/UNIQUE constraint failed/);
  });

  it('hashPrompt 同输入同哈希、异输入异哈希', () => {
    expect(hashPrompt('a', 'b')).toBe(hashPrompt('a', 'b'));
    expect(hashPrompt('a', 'b')).not.toBe(hashPrompt('a', 'c'));
  });
});
