import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RunEvent, StepName } from '@inkforge/shared';
import type { Database } from '../db/open';
import * as booksRepo from '../db/repositories/books';
import * as chaptersRepo from '../db/repositories/chapters';
import * as continuityRepo from '../db/repositories/continuity';
import * as runsRepo from '../db/repositories/runs';
import { assembleContext, draftSlots } from '../context/assembler';
import type { AppConfig } from '../config';
import type { CompletionRequest, LlmProvider } from '../llm/types';
import { hashPrompt } from '../llm/hash';
import { renderDraft, renderRewrite } from '../prompts/render';
import { loadCliches, runL0Checks } from '../quality/l0';
import { runL1Qc } from '../quality/l1';
import { decideGate, type L1Report } from '../quality/gate';
import { buildRewriteSlots, chooseRewriteMode } from './rewrite';

const CLIQUES_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../config/quality/cliches.default.txt');

export interface RunOutcome {
  status: 'done' | 'needs_human' | 'failed';
  finalVersionId?: string;
  rounds: number;
}

export interface PipelineDeps {
  db: Database;
  provider: LlmProvider;
  config: AppConfig;
  emit: (e: RunEvent) => void;
  onPartial?: (text: string) => void;
}

function now(): string {
  return new Date().toISOString();
}

function makeAbort(): Error {
  const e = new Error('This operation was aborted');
  e.name = 'AbortError';
  return e;
}

function blueprintText(bp: NonNullable<ReturnType<typeof chaptersRepo.getChapter>['blueprint']>): string {
  return JSON.stringify(bp);
}

/** 单章管线：draft → qc → (rewrite → qc)×n → finalize（summarize 由 T20 插入）。 */
export async function runChapterPipeline(deps: PipelineDeps, args: { runId: string; bookId: string; chapterNo: number; signal?: AbortSignal }): Promise<RunOutcome> {
  const { db, provider, config, emit } = deps;
  const signal = args.signal;
  const throwIfAborted = () => {
    if (signal?.aborted) throw makeAbort();
  };
  const chapter = chaptersRepo.getChapter(db, args.bookId, args.chapterNo);
  if (!chapter || !chapter.blueprint) throw new Error(`chapter ${args.chapterNo} missing blueprint`);
  const book = booksRepo.getBook(db, args.bookId);
  if (!book) throw new Error('book not found');
  const blueprint = chapter.blueprint;
  const targetChars = chapter.targetChars;
  const cliches = loadCliches(CLIQUES_PATH);
  const model = config.providers.local.model;
  // 轮数上限取 run 行（每 run 可覆盖），缺省回退 config
  const runRow = runsRepo.getRun(db, args.runId);
  const maxRounds = runRow?.maxRounds ?? config.quality.maxRounds;

  const snapshot = continuityRepo.getContinuitySnapshot(db, args.bookId, args.chapterNo);
  const continuityText = continuityRepo.renderSnapshotText(snapshot);
  const prevTexts: string[] = [];
  for (let n = args.chapterNo - 1; n >= Math.max(1, args.chapterNo - 3); n--) {
    const prevChapter = chaptersRepo.getChapter(db, args.bookId, n);
    if (!prevChapter) continue;
    const cur = prevChapter.currentVersionId ? chaptersRepo.getVersion(db, prevChapter.currentVersionId) : undefined;
    if (cur) prevTexts.push(cur.content);
  }
  const hardRules = [
    '【硬规则】',
    `1. 正文字数目标 ${targetChars} 字，允许偏差 ±20%。`,
    '2. 禁止套话句式（如"不是A而是B""这一刻，他明白了""空气仿佛凝固"）。', 
    '3. 直接输出正文，不要任何标题、解释或元信息。',
  ].join('\n');

  emit({ type: 'run.status', runId: args.runId, status: 'running', ts: now() });
  chaptersRepo.setChapterStatus(db, chapter.id, 'drafting');

  const totalBudget = config.providers.local.contextWindow - config.providers.local.maxOutput - 500;
  let rounds = 0;
  let currentVersion!: { id: string; content: string };
  const roundVersions: Array<{ id: string; overall: number }> = [];
  let inflight: { id: string; step: StepName; attempt: number } | null = null;

  try {
    // ── draft ──
    const draftStep = runsRepo.appendStep(db, { runId: args.runId, chapterId: chapter.id, step: 'draft', attempt: 1 });
    emit({ type: 'step.status', runId: args.runId, chapterNo: args.chapterNo, step: 'draft', attempt: 1, status: 'inflight', ts: now() });
    runsRepo.markStep(db, draftStep.id, { status: 'inflight', startedAt: now() });
    inflight = { id: draftStep.id, step: 'draft', attempt: 1 };
    throwIfAborted();
    const draftAssembled = assembleContext(
      draftSlots(
        {
          hardRules,
          worldview: book.description,
          blueprint: blueprintText(blueprint),
          continuity: continuityText,
          prevTail: prevTexts.length > 0 ? prevTexts[0] : '',
          task: renderDraft({ chapterNo: args.chapterNo, targetChars, worldview: '', blueprint }),
        },
        config.budgets.draft,
      ),
      totalBudget,
    );
    const draftReq: CompletionRequest = {
      system: draftAssembled.system,
      user: draftAssembled.user,
      temperature: 0.9,
      topP: 0.9,
      maxOutputTokens: config.providers.local.maxOutput,
      timeoutMs: config.timeouts.draft,
      meta: { step: 'draft', chapterNo: args.chapterNo },
      signal,
      onDelta: (t) => {
        emit({ type: 'step.delta', runId: args.runId, chapterNo: args.chapterNo, step: 'draft', text: t, ts: now() });
        deps.onPartial?.(t);
      },
    };
    const draftRes = await provider.complete(draftReq);
    const draftVersion = chaptersRepo.appendChapterVersion(db, {
      chapterId: chapter.id,
      kind: 'draft',
      content: draftRes.text,
      runId: args.runId,
      promptHash: hashPrompt(draftAssembled.system, draftAssembled.user),
      model,
      params: { usage: draftRes.usage },
    });
    runsRepo.markStep(db, draftStep.id, { status: 'done', endedAt: now(), outputVersionId: draftVersion.id });
    emit({ type: 'step.status', runId: args.runId, chapterNo: args.chapterNo, step: 'draft', attempt: 1, status: 'done', ts: now() });
    inflight = null;
    currentVersion = { id: draftVersion.id, content: draftVersion.content };

    // ── qc / rewrite 循环 ──
    let prevOverall: number | null | undefined = undefined;
      for (;;) {
      chaptersRepo.setChapterStatus(db, chapter.id, 'in_qc');
      const qcStep = runsRepo.appendStep(db, { runId: args.runId, chapterId: chapter.id, step: 'qc', attempt: rounds + 1 });
      emit({ type: 'step.status', runId: args.runId, chapterNo: args.chapterNo, step: 'qc', attempt: rounds + 1, status: 'inflight', ts: now() });
      runsRepo.markStep(db, qcStep.id, { status: 'inflight', startedAt: now() });
      inflight = { id: qcStep.id, step: 'qc', attempt: rounds + 1 };
      throwIfAborted();
      const l0 = runL0Checks({
        draft: currentVersion.content,
        targetChars,
        prevTexts,
        blueprint,
        continuity: { characters: snapshot.characters },
        cliches,
      });
      const l1: L1Report = await runL1Qc(
        { provider, config, hardRules },
        {
          draft: currentVersion.content,
          blueprintText: blueprintText(blueprint),
          continuityText,
          round: rounds,
          chapterNo: args.chapterNo,
          signal,
        },
      );
      const gate = decideGate({ l0, l1, roundsUsed: rounds, prevOverall }, { ...config.quality, maxRounds });
      runsRepo.markStep(db, qcStep.id, { status: 'done', endedAt: now(), outputJson: { l0, l1, gate } });
      emit({ type: 'step.status', runId: args.runId, chapterNo: args.chapterNo, step: 'qc', attempt: rounds + 1, status: 'done', ts: now() });
      inflight = null;
      chaptersRepo.setVersionParams(db, currentVersion.id, { overall: l1.overall });
      roundVersions.push({ id: currentVersion.id, overall: l1.overall ?? -1 });

      if (gate.action === 'pass') break;
      if (gate.action === 'needs_human') {
        return finalize(db, chapter.id, roundVersions, 'needs_human', args, emit);
      }
      // gate.action === 'rewrite' → 轮数已由 decideGate 保证未满
      rounds++;
      const rewriteStep = runsRepo.appendStep(db, { runId: args.runId, chapterId: chapter.id, step: 'rewrite', attempt: rounds + 1 });
      emit({ type: 'step.status', runId: args.runId, chapterNo: args.chapterNo, step: 'rewrite', attempt: rounds + 1, status: 'inflight', ts: now() });
      runsRepo.markStep(db, rewriteStep.id, { status: 'inflight', startedAt: now() });
      inflight = { id: rewriteStep.id, step: 'rewrite', attempt: rounds + 1 };
      throwIfAborted();
      const mode = chooseRewriteMode(l0, l1);
      const taskInstruction = renderRewrite({
        findings: l1.findings,
        taskInstruction:
          mode === 'targeted'
            ? '仅修复所列问题，其余内容保持原样；直接输出修订后的完整章节正文。'
            : '按硬规则与蓝图整章重写，消除全部所列问题；直接输出完整章节正文。',
      });
      const rwSlots =
        mode === 'targeted'
          ? buildRewriteSlots(
              { original: currentVersion.content, findings: l1.findings, factBaselineText: continuityText, mode, taskInstruction, hardRules },
              config.budgets.rewrite,
            )
          : buildRewriteSlots(
              {
                original: currentVersion.content,
                findings: l1.findings,
                factBaselineText: continuityText,
                mode,
                taskInstruction,
                hardRules,
                worldview: book.description,
                blueprint: blueprintText(blueprint),
                continuity: continuityText,
                prevTail: prevTexts.length > 0 ? prevTexts[0] : '',
                draftBudgets: config.budgets.draft,
              },
              config.budgets.rewrite,
            );
      const rwAssembled = assembleContext(rwSlots, totalBudget);
      const rwRes = await provider.complete({
        system: rwAssembled.system,
        user: rwAssembled.user,
        temperature: 0.7,
        topP: 0.9,
        maxOutputTokens: config.providers.local.maxOutput,
        timeoutMs: config.timeouts.rewrite,
        meta: { step: 'rewrite', chapterNo: args.chapterNo, round: rounds },
        signal,
        onDelta: (t) => {
          emit({ type: 'step.delta', runId: args.runId, chapterNo: args.chapterNo, step: 'rewrite', text: t, ts: now() });
          deps.onPartial?.(t);
        },
      });
      const revised = chaptersRepo.appendChapterVersion(db, {
        chapterId: chapter.id,
        kind: 'revised',
        content: rwRes.text,
        runId: args.runId,
        promptHash: hashPrompt(rwAssembled.system, rwAssembled.user),
        model,
        parentVersionId: currentVersion.id,
        params: { usage: rwRes.usage, round: rounds },
      });
      runsRepo.markStep(db, rewriteStep.id, { status: 'done', endedAt: now(), outputVersionId: revised.id });
      emit({ type: 'step.status', runId: args.runId, chapterNo: args.chapterNo, step: 'rewrite', attempt: rounds + 1, status: 'done', ts: now() });
      inflight = null;
      currentVersion = { id: revised.id, content: revised.content };
      prevOverall = l1.overall;
    }
    return finalize(db, chapter.id, roundVersions, 'done', args, emit);
  } catch (e) {
    const err = e as Error;
    if (inflight) {
      runsRepo.markStep(db, inflight.id, { status: 'failed', endedAt: now(), error: err.message });
      emit({ type: 'step.status', runId: args.runId, chapterNo: args.chapterNo, step: inflight.step, attempt: inflight.attempt, status: 'failed', ts: now() });
    }
    emit({ type: 'run.status', runId: args.runId, status: 'failed', ts: now() });
    throw err;
  }
}

function finalize(
  db: Database,
  chapterId: string,
  roundVersions: Array<{ id: string; overall: number }>,
  outcome: 'done' | 'needs_human',
  args: { runId: string; bookId: string; chapterNo: number },
  emit: (e: RunEvent) => void,
): RunOutcome {
  // 最佳版本：overall 最大者（相等取新 = 追加序在后）
  let best = roundVersions[0];
  for (const v of roundVersions.slice(1)) {
    if (v.overall >= best.overall) best = v;
  }
  const finStep = runsRepo.appendStep(db, { runId: args.runId, chapterId, step: 'finalize', attempt: 1 });
  emit({ type: 'step.status', runId: args.runId, chapterNo: args.chapterNo, step: 'finalize', attempt: 1, status: 'inflight', ts: now() });
  chaptersRepo.setCurrentVersion(db, chapterId, best.id);
  const content = chaptersRepo.getVersion(db, best.id)!.content;
  chaptersRepo.setChapterStatus(db, chapterId, outcome === 'done' ? 'done' : 'needs_human');
  runsRepo.markStep(db, finStep.id, { status: 'done', endedAt: now(), outputVersionId: best.id });
  emit({ type: 'step.status', runId: args.runId, chapterNo: args.chapterNo, step: 'finalize', attempt: 1, status: 'done', ts: now() });
  // run 层语义：本章处理完毕即 done（needs_human 是章状态，由章节行承载）
  emit({ type: 'run.status', runId: args.runId, status: 'done', ts: now() });
  return { status: outcome, finalVersionId: best.id, rounds: roundVersions.length - 1 };
}
