import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Database } from '../db/open';
import type { AppConfig } from '../config';
import type { LlmProvider } from '../llm/types';
import type { StyleTermDto } from '@inkforge/shared';
import { assembleContext } from '../context/assembler';
import * as chaptersRepo from '../db/repositories/chapters';
import * as runsRepo from '../db/repositories/runs';
import * as booksRepo from '../db/repositories/books';
import { getLatestProfile } from '../style/distill';
import type { StyleMetrics } from '../style/metrics';
import { loadStyleBundle, mergeStyleProfiles } from '../style/merge';
import { runL0Checks, loadCliches } from '../quality/l0';

const CLIQUES_PATH = process.env.INKFORGE_CLIQUES_PATH ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '../../config/quality/cliches.default.txt');

/** 三阶段校对（MirrorNovel 编辑引擎对标）：结构重构 → 风格一致 → 去 AI 化；每 pass 一次 provider 调用（step='rewrite'，attempt=pass 序号）。 */
const POLISH_PASSES = [
  { name: '结构重构', instruction: '对以下章节做结构重构：梳理事件顺序与因果链，合并冗余场景，保留全部关键情节与信息点，不新增情节。' },
  { name: '风格一致', instruction: '对以下章节做风格一致性校对：对齐绑定文风档案的句长、对话占比、叙事人称与用词习惯，逐段修正偏离处。' },
  { name: '去 AI 化', instruction: '对以下章节去 AI 化：删除套话句式（如「不是…而是…」「空气仿佛凝固」），把模板化表达替换为具体细节，使口吻自然。' },
] as const;

/** L0 基准素材（DEC-2026-1117-04 裁决②：走合并档案，与 chapter.ts 同构）：
 *  binding=getBookStyleBinding ?? 主镜像合成 → loadStyleBundle（快照优先回落 live 行）→ mergeStyleProfiles。
 *  terms=merged.terms；referenceTexts=merged.samples 直取 text（轮转已在 merge 第 7 步完成，不再二次轮转；空数组→undefined）；
 *  voiceRefMetrics=主档案 metrics 快照（空串/坏 JSON 回落 getLatestProfile(主) 现行 metrics_json 再容错 → undefined）。
 *  merged 为 undefined（未绑定/无档案行）→ 三值维持空缺省。 */
export function polishBenchmarks(
  db: Database,
  book: { id: string; styleProfileId: string | null; styleSnapshotJson: string | null },
  chapterNo: number,
): { voiceRefMetrics: StyleMetrics | undefined; referenceTexts: string[] | undefined; terms: StyleTermDto[] } {
  let voiceRefMetrics: StyleMetrics | undefined;
  let referenceTexts: string[] | undefined;
  let terms: StyleTermDto[] = [];
  if (!book.styleProfileId) return { voiceRefMetrics, referenceTexts, terms };
  const binding = booksRepo.getBookStyleBinding(db, book.id)
    ?? { primaryProfileId: book.styleProfileId, auxProfileIds: [], dimsSource: {}, weights: {} };
  const bundle = binding ? loadStyleBundle(db, { styleProfileId: book.styleProfileId, styleSnapshotJson: book.styleSnapshotJson }) : undefined;
  const merged = bundle ? mergeStyleProfiles(bundle, chapterNo) : undefined;
  if (!merged) return { voiceRefMetrics, referenceTexts, terms };
  terms = merged.terms;
  const texts = merged.samples.map((s) => s.text);
  if (texts.length > 0) referenceTexts = texts;
  try {
    voiceRefMetrics = JSON.parse(merged.primaryMetricsJson) as StyleMetrics;
  } catch {
    voiceRefMetrics = undefined;
  }
  if (!voiceRefMetrics) {
    const profile = getLatestProfile(db, merged.primaryProfileId);
    try {
      voiceRefMetrics = profile ? (JSON.parse(profile.metrics_json) as StyleMetrics) : undefined;
    } catch {
      voiceRefMetrics = undefined;
    }
  }
  return { voiceRefMetrics, referenceTexts, terms };
}

/** 批量校对单章：三章 pass 顺序改写 → 单个 revised 版本（不移动 current 指针，人工采用）；
 *  L0 基准=绑定档案（persona 快照优先）metrics + few-shot 3 段样本；结果记 params.l0。 */
export async function runPolishChapter(
  deps: { db: Database; provider: LlmProvider; config: AppConfig; emit?: (e: never) => void },
  args: { runId: string; bookId: string; chapterNo: number; signal?: AbortSignal },
): Promise<void> {
  const { db, config } = deps;
  const signal = args.signal;
  const throwIfAborted = () => {
    if (signal?.aborted) throw new Error('aborted');
  };
  const chapter = chaptersRepo.getChapter(db, args.bookId, args.chapterNo);
  if (!chapter || !chapter.blueprint) return;
  const v0 = chapter.currentVersionId ? chaptersRepo.getVersion(db, chapter.currentVersionId) : undefined;
  if (!v0) return; // 无正文的章不校对

  // L0 基准素材：绑定档案走合并档案（与 chapter 同构），损坏 JSON 容错
  const book = booksRepo.getBook(db, args.bookId);
  const { voiceRefMetrics, referenceTexts, terms } = book
    ? polishBenchmarks(db, book, args.chapterNo)
    : { voiceRefMetrics: undefined, referenceTexts: undefined, terms: [] as StyleTermDto[] };

  let content = v0.content;
  for (const [i, pass] of POLISH_PASSES.entries()) {
    throwIfAborted();
    const attempt = i + 1;
    const step = runsRepo.appendStep(db, { runId: args.runId, chapterId: chapter.id, step: 'rewrite', attempt });
    runsRepo.markStep(db, step.id, { status: 'inflight', startedAt: new Date().toISOString(), leaseOwner: 'polish' });
    const taskText = `${pass.instruction}${terms.length > 0 ? `\n【术语表】\n${terms.map((t) => `${t.term}：${t.note}`).join('\n')}` : ''}\n【输出格式】直接输出校对后的完整章节正文，不要任何解释或标记。`;
    const slots = [
      { name: 'hardRules', content: '', budgetChars: 300, stable: true, keep: 'head' as const },
      { name: 'original', content: content, budgetChars: 6000, stable: false, keep: 'head' as const },
      { name: 'task', content: taskText, budgetChars: 800, stable: false, keep: 'head' as const },
    ];
    const assembled = assembleContext(slots, config.providers.local.contextWindow - config.providers.local.maxOutput - 500);
    const res = await deps.provider.complete({
      system: assembled.system,
      user: assembled.user,
      temperature: 0.5,
      topP: 0.9,
      maxOutputTokens: config.providers.local.maxOutput,
      timeoutMs: config.timeouts.rewrite,
      meta: { step: 'rewrite', chapterNo: args.chapterNo },
      signal,
    });
    content = res.text;
    runsRepo.markStep(db, step.id, {
      status: 'done',
      endedAt: new Date().toISOString(),
      outputJson: { polishPass: pass.name, pass: attempt, usage: res.usage },
    });
  }

  // 终稿 L0（基准=快照 metrics + few-shot referenceTexts）；结果记 params.l0，不设门（校对为尽力而为）
  const l0 = runL0Checks({
    draft: content,
    targetChars: chapter.targetChars,
    prevTexts: [],
    blueprint: chapter.blueprint,
    continuity: { characters: [] },
    voiceRefMetrics,
    referenceTexts,
    cliches: loadCliches(CLIQUES_PATH),
  });
  chaptersRepo.appendChapterVersion(db, {
    chapterId: chapter.id,
    kind: 'revised',
    content,
    runId: args.runId,
    model: config.providers.local.model,
    parentVersionId: v0.id,
    params: { polish: true, passes: POLISH_PASSES.length, l0 },
  });
  // 不移动 current 指针：校对产物供人工比对采用
}
