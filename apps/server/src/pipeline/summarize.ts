import { randomUUID } from 'node:crypto';
import { parseSummary } from '../llm/plainproto';
import { renderSummarize } from '../prompts/render';
import type { Database } from '../db/open';
import type { AppConfig } from '../config';
import type { LlmProvider } from '../llm/types';
import type { RunEvent } from '@inkforge/shared';
import { upsertChapterSummary, upsertCharacterState, getContinuitySnapshot, resolveForeshadowing, listForeshadowings } from '../db/repositories/continuity';
import { listCharacters } from '../db/repositories/books';

/** THREADS 归一化：trim + 压缩空白。 */
function normalizeThread(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/** summarize 步：摘要/节拍落库；STATE 与前章浅合并；THREADS 匹配伏笔（resolved/advanced/planted）。 */
export async function runSummarizeStep(
  deps: { db: Database; provider: LlmProvider; config: AppConfig; emit: (e: RunEvent) => void },
  input: { runId: string; chapterId: string; chapterNo: number; bookId: string; finalContent: string; signal?: AbortSignal },
): Promise<void> {
  const { db, provider, config } = deps;
  const res = await provider.complete({
    system: '你是小说连续性管理员。严格按输出格式作答。',
    user: renderSummarize({ chapterNo: input.chapterNo, content: input.finalContent }),
    temperature: 0.3,
    topP: 0.9,
    maxOutputTokens: config.providers.local.maxOutput,
    timeoutMs: config.timeouts.summarize,
    meta: { step: 'summarize', chapterNo: input.chapterNo },
    signal: input.signal,
  });
  const parsed = parseSummary(res.text);
  if (parsed.summary === '') {
    throw new Error(`summarize 解析失败: ${parsed.errors.join('; ')}`);
  }
  upsertChapterSummary(db, {
    bookId: input.bookId,
    chapterNo: input.chapterNo,
    summary: parsed.summary,
    beats: parsed.beats,
    openThreads: parsed.openThreads,
  });

  // STATE：与该角色前一章 state 浅合并
  const snapshot = getContinuitySnapshot(db, input.bookId, input.chapterNo);
  const prevStates = new Map(snapshot.characters.map((c) => [c.name, c.state as Record<string, unknown>]));
  const characters = listCharacters(db, input.bookId);
  const idByName = new Map(characters.map((c) => [c.name, c.id]));
  for (const delta of parsed.characterDeltas) {
    try {
      const incoming = JSON.parse(delta.stateJson) as Record<string, unknown>;
      const merged = { ...(prevStates.get(delta.name) ?? {}), ...incoming };
      const charId = idByName.get(delta.name);
      if (charId) upsertCharacterState(db, { characterId: charId, chapterNo: input.chapterNo, state: merged });
    } catch {
      // STATE 行 JSON 非法：跳过（下一章快照仍可用上一章状态）
    }
  }

  // THREADS：归一化后与 open foreshadowings 精确匹配
  const open = listForeshadowings(db, input.bookId).filter((f) => f.status !== 'resolved');
  const openByDesc = new Map(open.map((f) => [normalizeThread(f.description), f]));
  for (const raw of parsed.openThreads) {
    const tagMatch = /^\[(planted|advanced|resolved)\]\s*(.+)$/.exec(raw);
    if (!tagMatch) continue;
    const [, tag, desc] = tagMatch;
    const descNorm = normalizeThread(desc);
    const hit = openByDesc.get(descNorm);
    if (hit && (tag === 'resolved' || tag === 'advanced')) {
      resolveForeshadowing(db, hit.id, input.chapterNo, tag);
    } else if (!hit && tag === 'planted') {
      db.prepare('INSERT INTO foreshadowings(id, book_id, description, planted_ch, status, created_at) VALUES(?,?,?,?,?,?)').run(
        randomUUID(),
        input.bookId,
        descNorm,
        input.chapterNo,
        'open',
        new Date().toISOString(),
      );
    }
  }
}
