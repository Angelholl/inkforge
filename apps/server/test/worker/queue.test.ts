import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { RunDto } from '@inkforge/shared';
import { loadConfig } from '../../src/config';
import { migrate } from '../../src/db/migrate';
import { openDb, type Database } from '../../src/db/open';
import { createBook } from '../../src/db/repositories/books';
import { upsertBlueprint, getChapter } from '../../src/db/repositories/chapters';
import { createRun, getRun, updateRunStatus, listSteps } from '../../src/db/repositories/runs';
import { runQueueLoop } from '../../src/worker/queue';
import { createDefaultMockProvider, createMockProvider, makeMockDraft } from '../../src/llm/mock';
import type { ChapterBlueprint } from '@inkforge/shared';

const BP: ChapterBlueprint = { goal: 'g', beats: [], mustHaveBeats: [], bannedTopics: [] };
let db: Database;
let dir: string;
const configWithDir = () =>
  loadConfig({ STRATA_BASE_URL: 'http://x', STRATA_API_KEY: 'k', STRATA_MODEL: 'm', INKFORGE_DATA_DIR: dir });

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkforge-queue-'));
  db = openDb(path.join(dir, 't.db'));
  migrate(db);
});

/** 每场景独立建书（避免跨场景章节状态污染） */
function makeBook(): string {
  const id = createBook(db, { title: `队列书-${Math.random().toString(36).slice(2, 8)}` }).id;
  for (let no = 1; no <= 3; no++) {
    upsertBlueprint(db, { bookId: id, chapterNo: no, title: `第${no}章`, blueprint: BP, targetChars: 500 });
  }
  return id;
}

const signals: AbortController[] = [];
function startLoop(provider: unknown): void {
  const ac = new AbortController();
  signals.push(ac);
  void runQueueLoop({ db, provider: provider as never, config: configWithDir(), emit: () => {} }, ac.signal);
}

afterEach(async () => {
  for (const ac of signals) ac.abort(); // 每场景独占队列，防前场景循环抢跑
  signals.length = 0;
  await new Promise((r) => setTimeout(r, 700));
});

afterAll(async () => {
  for (const ac of signals) ac.abort();
  await new Promise((r) => setTimeout(r, 600)); // 让循环退出
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

function pollRun(runId: string, want: string[], timeoutMs: number): Promise<RunDto> {
  return (async () => {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const run = getRun(db, runId)!;
      if (want.includes(run.status)) return run;
      if (Date.now() > deadline) return run;
      await new Promise((r) => setTimeout(r, 100));
    }
  })();
}

describe('runQueueLoop', () => {
  it('场景一：3 章 mock 全过 → run done、章序执行正确', async () => {
    const bookId = makeBook();
    const run = createRun(db, { bookId, mode: 'generate', chapterScope: { from: 1, to: 3 } });
    startLoop(createDefaultMockProvider());
    const done = await pollRun(run.id, ['done'], 20000);
    expect(done.status).toBe('done');
    const chapters = [1, 2, 3].map((no) => getChapter(db, bookId, no)!);
    for (const ch of chapters) expect(ch.status).toBe('done');
    const steps = listSteps(db, run.id).filter((s) => s.step === 'draft');
    const started = steps.map((s) => new Date(s.startedAt!).getTime());
    expect(started).toEqual([...started].sort((a, b) => a - b)); // 章序递增
    const backups = fs.readdirSync(path.join(dir, 'backups', bookId));
    expect(backups.length).toBeGreaterThanOrEqual(1);
  }, 30000);

  it('场景二：ch2 draft 注入 http_500 → skip_failures=1 → run done、ch2 needs_human、ch3 done', async () => {
    const bookId = makeBook();
    const run = createRun(db, { bookId, mode: 'generate', chapterScope: { from: 1, to: 3 } });
    // 自定义 provider：ch2 的 draft 抛 ProviderError，其余走默认 mock
    const mod = await import('../../src/llm/mock');
    const fallback = mod.createDefaultMockProvider();
    const custom = {
      async complete(req: { meta: { chapterNo?: number; step: string } }) {
        if (req.meta.step === 'draft' && req.meta.chapterNo === 2) {
          const e = new Error('mock injected error: http_500');
          e.name = 'ProviderError';
          throw e;
        }
        return fallback.complete(req as never);
      },
    } as never;
    startLoop(custom);
    const done = await pollRun(run.id, ['done', 'failed'], 20000);
    expect(done.status).toBe('done'); // skip_failures=1 继续
    expect(getChapter(db, bookId, 2)!.status).toBe('needs_human');
    expect(getChapter(db, bookId, 3)!.status).toBe('done');
  }, 30000);

  it('场景三：ch2 进行中 cancel → run cancelled、ch3 无 step 行、被中止 step failed', async () => {
    const bookId = makeBook();
    const run = createRun(db, { bookId, mode: 'generate', chapterScope: { from: 1, to: 3 } });
    const slow = createMockProvider({
      draft: { textFn: (m) => makeMockDraft(m.chapterNo ?? 1), chunks: 40, chunkDelayMs: 150 },
      qc: { text: 'OVERALL: 9' },
      rewrite: { text: 'OVERALL: 9' },
      summarize: { text: 'SUMMARY: x' },
    });
    startLoop(slow);
    // 等 ch2 draft inflight
    const deadline = Date.now() + 15000;
    let ch2StepId: string | null = null;
    while (Date.now() < deadline) {
      const steps = listSteps(db, run.id);
      const ch2 = steps.find((s) => s.step === 'draft' && s.chapterId === getChapter(db, bookId, 2)!.id);
      if (ch2 && ch2.status === 'inflight') {
        ch2StepId = ch2.id;
        break;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(ch2StepId).not.toBeNull();
    updateRunStatus(db, run.id, 'cancelled'); // 服务侧 cancel 语义
    // 等 ch2 draft step 落 failed（abort 传播 ≤400ms 轮询 + chunk 粒度）
    const failDeadline = Date.now() + 8000;
    let failed = false;
    while (Date.now() < failDeadline) {
      const st = listSteps(db, run.id).find((x) => x.id === ch2StepId)!;
      if (st.status === 'failed') {
        failed = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(failed).toBe(true);
    const fin = getRun(db, run.id)!;
    expect(fin.status).toBe('cancelled');
    const steps = listSteps(db, run.id);
    const ch3Steps = steps.filter((s) => s.chapterId === getChapter(db, bookId, 3)!.id);
    expect(ch3Steps.length).toBe(0);
  }, 30000);

  it('场景四：pause 于 ch1 进行中 → ch1 完成后 paused、ch2 未启动；resume 后继续', async () => {
    const bookId = makeBook();
    const run = createRun(db, { bookId, mode: 'generate', chapterScope: { from: 1, to: 3 } });
    const slow = createMockProvider({
      draft: { textFn: (m) => makeMockDraft(m.chapterNo ?? 1), chunks: 30, chunkDelayMs: 120 },
      qc: { text: 'OVERALL: 9' },
      rewrite: { text: 'OVERALL: 9' },
      summarize: { text: 'SUMMARY: x' },
    });
    startLoop(slow);
    // ch1 draft inflight 时 pause（不 abort 当前章）
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      const steps = listSteps(db, run.id);
      const ch1 = steps.find((s) => s.step === 'draft' && s.chapterId === getChapter(db, bookId, 1)!.id);
      if (ch1 && ch1.status === 'inflight') break;
      await new Promise((r) => setTimeout(r, 100));
    }
    updateRunStatus(db, run.id, 'paused');
    await pollRun(run.id, ['paused'], 15000);
    const ch2Steps = listSteps(db, run.id).filter((s) => s.chapterId === getChapter(db, bookId, 2)!.id);
    expect(ch2Steps.length).toBe(0); // ch2 未启动
    // resume
    updateRunStatus(db, run.id, 'queued');
    await pollRun(run.id, ['done'], 30000);
    expect(getChapter(db, bookId, 3)!.status).toBe('done');
  }, 60000);
});
