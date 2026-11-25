import type { AppConfig } from '../config';
import type { Database } from '../db/open';
import type { LlmProvider } from '../llm/types';
import type { ChapterBlueprint } from '@inkforge/shared';
import * as chaptersRepo from '../db/repositories/chapters';

export interface BatchBlueprintDeps {
  db: Database;
  config: AppConfig;
  plannerProvider: LlmProvider;
  suggestOnce: (chapterNo: number) => Promise<ChapterBlueprint>;
}

/** FB-F5-1（DEC-2026-1125-03）：续写书批量蓝图建议——仅无蓝图章、按章号升序逐章串行（禁 Promise.all），
 *  单章失败记 items 继续不中断整批；只落蓝图不 createRun、不写正文（critic 锁边界）。 */
export async function batchBlueprintSuggest(
  deps: BatchBlueprintDeps,
  input: { bookId: string },
): Promise<{ generated: number; failed: number; items: Array<{ chapterNo: number; ok: boolean; error?: string }> }> {
  const targets = chaptersRepo.listChapters(deps.db, input.bookId).filter((c) => !c.blueprint); // listChapters 已按 chapter_no 升序
  const items: Array<{ chapterNo: number; ok: boolean; error?: string }> = [];
  let generated = 0;
  let failed = 0;
  for (const ch of targets) {
    try {
      const blueprint = await deps.suggestOnce(ch.chapterNo);
      chaptersRepo.upsertBlueprint(deps.db, { bookId: input.bookId, chapterNo: ch.chapterNo, title: ch.title, blueprint, targetChars: ch.targetChars });
      items.push({ chapterNo: ch.chapterNo, ok: true });
      generated++;
    } catch (e) {
      items.push({ chapterNo: ch.chapterNo, ok: false, error: String((e as Error).message ?? e) });
      failed++;
    }
  }
  return { generated, failed, items };
}
