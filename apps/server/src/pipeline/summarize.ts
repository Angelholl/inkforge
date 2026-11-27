import { randomUUID } from 'node:crypto';
import { parseSummary } from '../llm/plainproto';
import { renderSummarize } from '../prompts/render';
import type { Database } from '../db/open';
import type { AppConfig } from '../config';
import type { LlmProvider } from '../llm/types';
import type { RunEvent } from '@inkforge/shared';
import { collapseWhitespace, BRACKET_TAG_RE } from '@inkforge/shared';
import { upsertChapterSummary, upsertCharacterState, getContinuitySnapshot, resolveForeshadowing, listForeshadowings } from '../db/repositories/continuity';
import { listActiveCharacters, listCharacters } from '../db/repositories/books';

export interface SummaryPayload {
  summary: string;
  beats: string[];
  openThreads: string[];
  characterDeltas: Array<{ name: string; stateJson: string }>;
}

export const SUMMARIZE_ROSTER_CAP = 50; // 钉值（owner 已拍板 2026-11-27，测试引常量）

/** generate 侧只读上下文：名册取写章在场口径，伏笔取 collapseWhitespace(description)，两清单各自独立截断。 */
export function collectSummarizeContext(db: Database, bookId: string, chapterNo: number): {
  roster: string[]; rosterTruncated: boolean; foreshadowTitles: string[]; foreshadowTruncated: boolean;
} {
  const rosterAll = listActiveCharacters(db, bookId, chapterNo).map((c) => c.name);
  const titlesAll = listForeshadowings(db, bookId).map((f) => collapseWhitespace(f.description));
  return {
    roster: rosterAll.slice(0, SUMMARIZE_ROSTER_CAP),
    rosterTruncated: rosterAll.length > SUMMARIZE_ROSTER_CAP,
    foreshadowTitles: titlesAll.slice(0, SUMMARIZE_ROSTER_CAP),
    foreshadowTruncated: titlesAll.length > SUMMARIZE_ROSTER_CAP,
  };
}

export class SummarizeParseError extends Error {
  constructor(public errors: string[]) {
    super(`summarize 解析失败: ${errors.join('; ')}`);
  }
}

/** LLM 生成 + 解析，零写库。 */
export async function generateSummarize(
  deps: { provider: LlmProvider; config: AppConfig },
  input: {
    chapterNo: number;
    finalContent: string;
    roster: string[];
    rosterTruncated: boolean;
    foreshadowTitles: string[];
    foreshadowTruncated: boolean;
    signal?: AbortSignal;
  },
): Promise<SummaryPayload> {
  const { provider, config } = deps;
  const res = await provider.complete({
    system: '你是小说连续性管理员。严格按输出格式作答。',
    user: renderSummarize({
      chapterNo: input.chapterNo,
      content: input.finalContent,
      roster: input.roster,
      rosterTruncated: input.rosterTruncated,
      foreshadowTitles: input.foreshadowTitles,
      foreshadowTruncated: input.foreshadowTruncated,
    }),
    temperature: 0.3,
    topP: 0.9,
    maxOutputTokens: config.providers.local.maxOutput,
    timeoutMs: config.timeouts.summarize,
    meta: { step: 'summarize', chapterNo: input.chapterNo },
    signal: input.signal,
  });
  const parsed = parseSummary(res.text);
  if (parsed.summary === '') {
    throw new SummarizeParseError(parsed.errors);
  }
  return {
    summary: parsed.summary,
    beats: parsed.beats,
    openThreads: parsed.openThreads,
    characterDeltas: parsed.characterDeltas,
  };
}

/** 单事务四段齐写：摘要 upsert → STATE 浅合并 → THREADS 比对（含已回收同名伏笔）。 */
export function commitSummarize(
  db: Database, bookId: string, chapterNo: number, payload: SummaryPayload,
): void {
  db.transaction(() => {
    // ① 摘要
    upsertChapterSummary(db, {
      bookId,
      chapterNo,
      summary: payload.summary,
      beats: payload.beats,
      openThreads: payload.openThreads,
    });

    // ② STATE：与该角色前一章 state 浅合并
    const snapshot = getContinuitySnapshot(db, bookId, chapterNo);
    const prevStates = new Map(snapshot.characters.map((c) => [c.name, c.state as Record<string, unknown>]));
    const characters = listCharacters(db, bookId);
    const idByName = new Map(characters.map((c) => [c.name, c.id]));
    for (const delta of payload.characterDeltas) {
      let incoming: unknown;
      try {
        incoming = JSON.parse(delta.stateJson);
      } catch {
        // STATE 行 JSON 非法：跳过该行（下一章快照仍可用上一章状态）
        continue;
      }
      if (incoming === null || typeof incoming !== 'object' || Array.isArray(incoming)) {
        // JSON.parse 成功但非纯对象：抛错，整事务回滚
        throw new Error(`STATE 行非纯对象: ${delta.stateJson}`);
      }
      const merged = { ...(prevStates.get(delta.name) ?? {}), ...incoming };
      const charId = idByName.get(delta.name);
      if (charId) upsertCharacterState(db, { characterId: charId, chapterNo, state: merged });
    }

    // ③ THREADS：与全书同名伏笔比对（D2 含已回收），命中 [planted] 不重复埋
    const open = listForeshadowings(db, bookId);
    const openByDesc = new Map(open.map((f) => [collapseWhitespace(f.description), f]));
    for (const raw of payload.openThreads) {
      const tagMatch = BRACKET_TAG_RE.exec(raw);
      if (!tagMatch) continue;
      const [, tag, desc] = tagMatch;
      const descNorm = collapseWhitespace(desc);
      const hit = openByDesc.get(descNorm);
      if (hit && (tag === 'resolved' || tag === 'advanced')) {
        resolveForeshadowing(db, hit.id, chapterNo, tag);
      } else if (!hit && tag === 'planted') {
        db.prepare('INSERT INTO foreshadowings(id, book_id, description, planted_ch, status, created_at) VALUES(?,?,?,?,?,?)').run(
          randomUUID(),
          bookId,
          descNorm,
          chapterNo,
          'open',
          new Date().toISOString(),
        );
      }
    }
  })();
}

/** 组合壳：generate → commit；失败语义不区分，直通抛错（chapter.ts 不改）。 */
export async function runSummarizeStep(
  deps: { db: Database; provider: LlmProvider; config: AppConfig; emit: (e: RunEvent) => void },
  input: { runId: string; chapterId: string; chapterNo: number; bookId: string; finalContent: string; signal?: AbortSignal },
): Promise<void> {
  const { db, provider, config } = deps;
  const context = collectSummarizeContext(db, input.bookId, input.chapterNo);
  const payload = await generateSummarize(
    { provider, config },
    {
      chapterNo: input.chapterNo,
      finalContent: input.finalContent,
      ...context,
      signal: input.signal,
    },
  );
  commitSummarize(db, input.bookId, input.chapterNo, payload);
}
