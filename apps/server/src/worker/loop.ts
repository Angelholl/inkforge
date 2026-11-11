import type { Database } from '../db/open';
import type { AppConfig } from '../config';
import type { LlmProvider } from '../llm/types';
import type { RunEvent } from '@inkforge/shared';
import { claimNextStep, heartbeatStep, resumePoint } from '../db/repositories/runs';
import { getRun } from '../db/repositories/runs';
import { getChapterById } from '../db/repositories/chapters';
import { runChapterPipeline } from '../pipeline/chapter';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** worker 主循环：claim → 心跳 interval → 执行管线剩余步；无任务 sleep 500ms。 */
export async function workerLoop(deps: { db: Database; provider: LlmProvider; config: AppConfig; workerId: string; emit: (e: RunEvent) => void; signal?: AbortSignal }): Promise<void> {
  const { db, workerId, signal } = deps;
  const heartbeatMs = Number(process.env.INKFORGE_TEST_HEARTBEAT_MS ?? 10000);
  for (;;) {
    if (signal?.aborted) return;
    const step = claimNextStep(db, workerId);
    if (!step) {
      await sleep(500);
      continue;
    }
    const hb = setInterval(() => heartbeatStep(db, step.id, workerId), heartbeatMs);
    try {
      const run = getRun(db, step.runId);
      const chapter = getChapterById(db, step.chapterId);
      if (!run || !chapter) continue;
      const resume = resumePoint(db, step.runId, step.chapterId) ?? step.step;
      await runChapterPipeline(deps, { runId: step.runId, bookId: run.bookId, chapterNo: chapter.chapterNo, signal, resumeFrom: resume });
    } catch {
      // 步级失败已在管线内标记；循环继续
    } finally {
      clearInterval(hb);
    }
  }
}
