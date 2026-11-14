import type { Database } from '../db/open';
import type { AppConfig } from '../config';
import type { LlmProvider } from '../llm/types';
import { backupBook } from '../db/backup';
import { getRun, resumePoint, updateRunStatus, listSteps, takeoverStaleSteps } from '../db/repositories/runs';
import { getChapter, setChapterStatus } from '../db/repositories/chapters';
import { runChapterPipeline } from '../pipeline/chapter';
import { runPolishChapter } from '../pipeline/polish';
import { keepSystemAwake } from '../power';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export interface QueueDeps {
  db: Database;
  provider: LlmProvider;
  config: AppConfig;
  emit: (e: never) => void;
}

/**
 * concurrency=1 队列：取最早 queued/running run → backupBook → 逐章顺序执行（章内复用 resumePoint）。
 * pause：run.status='paused' → 当前章完成后退出（不 abort 当前请求）；/resume 置 queued 后继续。
 * cancel：轮询到 cancelled → abort 当前章 → run cancelled，剩余章节无 step 行。
 * 章失败（provider 重试耗尽）→ 章 needs_human → skip_failures=1 时继续下一章，run 最终 done。
 */
export async function runQueueLoop(deps: QueueDeps, signal?: AbortSignal): Promise<void> {
  const { db } = deps;
  const staleMs = Number(process.env.INKFORGE_STALE_MS ?? 30000);
  for (;;) {
    if (signal?.aborted) return;
    takeoverStaleSteps(db, staleMs); // 周期性接管死亡 worker 的 inflight 步
    const row = db
      .prepare("SELECT id FROM runs WHERE status IN ('queued','running') ORDER BY created_at, rowid LIMIT 1")
      .get() as { id: string } | undefined;
    if (!row) {
      await sleep(500);
      continue;
    }
    await processRun(deps, row.id);
  }
}

async function processRun(deps: QueueDeps, runId: string): Promise<void> {
  const { db, provider, config } = deps;
  const run = getRun(db, runId)!;
  if (run.status === 'queued') {
    backupBook(db, run.bookId, `${config.dataDir}/backups/${run.bookId}`);
    updateRunStatus(db, runId, 'running', { startedAt: new Date().toISOString() });
  }
  const ac = new AbortController();
  // cancel 轮询：服务侧把 run 置 cancelled → 本地 abort 当前章（pause 不 abort）
  const poll = setInterval(() => {
    const cur = getRun(db, runId);
    if (!cur || cur.status === 'cancelled') ac.abort();
  }, 400);
  keepSystemAwake(true); // 活跃章阻止睡眠
  try {
    for (let no = run.chapterScope.from; no <= run.chapterScope.to; no++) {
      if (ac.signal.aborted) break;
      const chapter = getChapter(db, run.bookId, no);
      if (!chapter || !chapter.blueprint) continue;
      if (run.kind === 'polish') {
        // 批量校对（B10）：按 kind 分支，无 resumePoint 概念（本章一遍三 pass）
        try {
          await runPolishChapter({ db, provider, config, emit: () => {} }, { runId, bookId: run.bookId, chapterNo: no, signal: ac.signal });
        } catch (e) {
          const aborted = ac.signal.aborted || (e as Error).name === 'AbortError';
          if (aborted) break;
          setChapterStatus(db, chapter.id, 'needs_human');
          if (!run.skipFailures) {
            updateRunStatus(db, runId, 'failed', { endedAt: new Date().toISOString(), error: (e as Error).message });
            return;
          }
          continue;
        }
        const curPolish = getRun(db, runId)!;
        if (curPolish.status === 'paused' || curPolish.status === 'cancelled') break;
        continue;
      }
      const resume = resumePoint(db, runId, chapter.id);
      if (!resume) continue; // 本章已完成
      try {
        await runChapterPipeline({ db, provider, config, emit: () => {} }, { runId, bookId: run.bookId, chapterNo: no, signal: ac.signal, resumeFrom: resume });
      } catch (e) {
        const aborted = ac.signal.aborted || (e as Error).name === 'AbortError';
        if (aborted) break;
        // 章失败：章 needs_human；skip_failures=1 → 继续下一章
        setChapterStatus(db, chapter.id, 'needs_human');
        if (!run.skipFailures) {
          updateRunStatus(db, runId, 'failed', { endedAt: new Date().toISOString(), error: (e as Error).message });
          return;
        }
        continue;
      }
      const cur = getRun(db, runId)!;
      if (cur.status === 'paused' || cur.status === 'cancelled') break;
    }
    const cur = getRun(db, runId)!;
    if (cur.status === 'running') {
      updateRunStatus(db, runId, 'done', { endedAt: new Date().toISOString() });
    }
  } finally {
    clearInterval(poll);
    keepSystemAwake(false); // 空闲恢复
    void listSteps;
  }
}
