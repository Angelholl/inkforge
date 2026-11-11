import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ChapterBlueprint, RunEvent, StepName } from '@inkforge/shared';
import type { Database } from '../db/open';
import * as booksRepo from '../db/repositories/books';
import * as chaptersRepo from '../db/repositories/chapters';
import * as continuityRepo from '../db/repositories/continuity';
import * as ftsRepo from '../db/repositories/fts';
import * as runsRepo from '../db/repositories/runs';
import type { RunStep } from '../db/repositories/runs';
import { assembleContext, draftSlots } from '../context/assembler';
import type { AppConfig } from '../config';
import type { LlmProvider } from '../llm/types';
import { hashPrompt } from '../llm/hash';
import { renderDraft, renderRewrite } from '../prompts/render';
import { loadCliches, runL0Checks } from '../quality/l0';
import { runL1Qc } from '../quality/l1';
import { decideGate, type L1Report } from '../quality/gate';
import { buildRewriteSlots, chooseRewriteMode } from './rewrite';
import { createPartialFlusher } from './partial';
import { runSummarizeStep } from './summarize';

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

function blueprintText(bp: ChapterBlueprint): string {
  return JSON.stringify(bp);
}

/** 单章管线：draft → qc → (rewrite → qc)×n → finalize（summarize 由 T20 插入）。
 * resumeFrom：该步之前已 done 的步直接跳过，draft 已有版本则复用不重生成（T17）。 */
export async function runChapterPipeline(
  deps: PipelineDeps,
  args: { runId: string; bookId: string; chapterNo: number; signal?: AbortSignal; resumeFrom?: StepName },
): Promise<RunOutcome> {
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
    `1. 正文字数硬约束：正文必须写在 ${Math.round(targetChars * 0.8)} 至 ${Math.round(targetChars * 1.2)} 字之间（目标 ${targetChars} 字）。超过上限视为废稿。`,
    '2. 严禁套话句式，包括但不限于：「不是…而是…」「这一刻，他明白了」「空气仿佛凝固」「宛如」。',
    '3. 直接输出正文，不要任何标题、解释或元信息。',
  ].join('\n');

  emit({ type: 'run.status', runId: args.runId, status: 'running', ts: now() });
  chaptersRepo.setChapterStatus(db, chapter.id, 'drafting');

  const totalBudget = config.providers.local.contextWindow - config.providers.local.maxOutput - 500;
  const priorSteps = runsRepo.listSteps(db, args.runId).filter((s) => s.chapterId === chapter.id);
  const resumeFrom = args.resumeFrom ?? null;
  const doneCount = (step: StepName) => priorSteps.filter((s) => s.step === step && s.status === 'done').length;
  const inflightRef: { current: { id: string; step: StepName; attempt: number } | null } = { current: null };

  /** 取 queued 行复用（崩溃续跑）或按 attempt 规则新建，置 inflight。 */
  const ensureStep = (step: StepName, preferredAttempt: number): RunStep => {
    const rows = runsRepo.listSteps(db, args.runId).filter((s) => s.chapterId === chapter.id && s.step === step);
    const active = rows.find((r) => r.status === 'queued' || r.status === 'inflight');
    if (active) {
      emit({ type: 'step.status', runId: args.runId, chapterNo: args.chapterNo, step, attempt: active.attempt, status: 'inflight', ts: now() });
      runsRepo.markStep(db, active.id, { status: 'inflight', startedAt: now() });
      inflightRef.current = { id: active.id, step, attempt: active.attempt };
      return active;
    }
    const maxAttempt = rows.reduce((m, r) => Math.max(m, r.attempt), 0);
    const attempt = Math.max(maxAttempt + 1, preferredAttempt);
    const row = runsRepo.appendStep(db, { runId: args.runId, chapterId: chapter.id, step, attempt });
    emit({ type: 'step.status', runId: args.runId, chapterNo: args.chapterNo, step, attempt, status: 'inflight', ts: now() });
    runsRepo.markStep(db, row.id, { status: 'inflight', startedAt: now() });
    inflightRef.current = { id: row.id, step, attempt };
    return row;
  };
  const finishStep = (step: StepName, attempt: number, patch: { outputVersionId?: string; outputJson?: object }) => {
    const row = inflightRef.current;
    if (row && row.step === step) {
      runsRepo.markStep(db, row.id, { status: 'done', endedAt: now(), ...patch });
      emit({ type: 'step.status', runId: args.runId, chapterNo: args.chapterNo, step, attempt: row.attempt, status: 'done', ts: now() });
      inflightRef.current = null;
    }
  };

  let rounds = doneCount('rewrite');
  const lastQcDone = priorSteps.filter((s) => s.step === 'qc' && s.status === 'done').at(-1);
  let prevOverall: number | null | undefined =
    lastQcDone && resumeFrom ? ((lastQcDone.outputJson as { l1?: { overall?: number } } | undefined)?.l1?.overall ?? undefined) : undefined;
  const roundVersions: Array<{ id: string; overall: number }> = [];
  // 恢复时把既往轮次的 overall 计入最佳版本比较
  if (resumeFrom) {
    for (const r of priorSteps.filter((s) => s.status === 'done' && s.outputVersionId && ['draft', 'rewrite'].includes(s.step))) {
      const v = chaptersRepo.getVersion(db, r.outputVersionId!);
      const overall = (v?.params as { overall?: number } | undefined)?.overall;
      if (v && overall != null) roundVersions.push({ id: v.id, overall });
    }
  }
  let currentVersion!: { id: string; content: string };

  try {
    // ── draft（复用或新建）──
    if (resumeFrom && resumeFrom !== 'draft' && doneCount('draft') > 0) {
      const draftRow = priorSteps.find((s) => s.step === 'draft' && s.status === 'done')!;
      const v = chaptersRepo.getVersion(db, draftRow.outputVersionId!)!;
      currentVersion = { id: v.id, content: v.content };
    } else {
      ensureStep('draft', 1);
      throwIfAborted();
      const draftFlusher = createPartialFlusher(db, inflightRef.current!.id);
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
      const draftRes = await provider.complete({
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
          draftFlusher.push(t);
        },
      }).finally(() => draftFlusher.flush());
      const draftVersion = chaptersRepo.appendChapterVersion(db, {
        chapterId: chapter.id,
        kind: 'draft',
        content: draftRes.text,
        runId: args.runId,
        promptHash: hashPrompt(draftAssembled.system, draftAssembled.user),
        model,
        params: { usage: draftRes.usage },
      });
      finishStep('draft', 1, { outputVersionId: draftVersion.id });
      draftFlusher.discard();
      currentVersion = { id: draftVersion.id, content: draftVersion.content };
    }

    // ── qc / rewrite 循环 ──
    for (;;) {
      chaptersRepo.setChapterStatus(db, chapter.id, 'in_qc');
      const qcStep = ensureStep('qc', rounds + 1);
      const qcAttempt = qcStep.attempt;
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
      finishStep('qc', qcAttempt, { outputJson: { l0, l1, gate } });
      chaptersRepo.setVersionParams(db, currentVersion.id, { overall: l1.overall });
      if (!roundVersions.some((rv) => rv.id === currentVersion.id)) roundVersions.push({ id: currentVersion.id, overall: l1.overall ?? -1 });

      if (gate.action === 'pass') break;
      if (gate.action === 'needs_human') {
        return finalize(db, chapter.id, roundVersions, 'needs_human', args, emit);
      }
      // gate.action === 'rewrite' → 轮数已由 decideGate 保证未满
      rounds++;
      const rewriteStep = ensureStep('rewrite', rounds + 1);
      const rwAttempt = rewriteStep.attempt;
      throwIfAborted();
      const rwFlusher = createPartialFlusher(db, inflightRef.current!.id);
      const mode = chooseRewriteMode(l0, l1);
      const clicheFix = l0.clicheHits.length > 0 ? `以下套话句必须整句删除或改写（不得保留原句式）：${l0.clicheHits.map((h) => `「${h}」`).join('、')}。` : '';
      const taskInstruction = renderRewrite({
        findings: l1.findings,
        taskInstruction:
          mode === 'targeted'
            ? `仅修复所列问题，其余内容保持原样；若正文超长必须压缩到 ${Math.round(targetChars * 0.8)}-${Math.round(targetChars * 1.2)} 字；${clicheFix}直接输出修订后的完整章节正文。`
            : `按硬规则与蓝图整章重写，消除全部所列问题；正文必须写在 ${Math.round(targetChars * 0.8)}-${Math.round(targetChars * 1.2)} 字之间；${clicheFix}直接输出完整章节正文。`,
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
          rwFlusher.push(t);
        },
      }).finally(() => rwFlusher.flush());
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
      finishStep('rewrite', rwAttempt, { outputVersionId: revised.id });
      rwFlusher.discard();
      currentVersion = { id: revised.id, content: revised.content };
      prevOverall = l1.overall;
    }
    // ── summarize（T20）──
    ensureStep('summarize', 1);
    throwIfAborted();
    await runSummarizeStep({ db, provider, config, emit }, {
      runId: args.runId,
      chapterId: chapter.id,
      chapterNo: args.chapterNo,
      bookId: args.bookId,
      finalContent: currentVersion.content,
      signal,
    });
    finishStep('summarize', 1, {});
    return finalize(db, chapter.id, roundVersions, 'done', args, emit);
  } catch (e) {
    const err = e as Error;
    if (inflightRef.current) {
      runsRepo.markStep(db, inflightRef.current.id, { status: 'failed', endedAt: now(), error: err.message });
      emit({
        type: 'step.status',
        runId: args.runId,
        chapterNo: args.chapterNo,
        step: inflightRef.current.step,
        attempt: inflightRef.current.attempt,
        status: 'failed',
        ts: now(),
      });
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
  ftsRepo.syncFts(db, chapterId, content);
  chaptersRepo.setChapterStatus(db, chapterId, outcome === 'done' ? 'done' : 'needs_human');
  runsRepo.markStep(db, finStep.id, { status: 'done', endedAt: now(), outputVersionId: best.id });
  emit({ type: 'step.status', runId: args.runId, chapterNo: args.chapterNo, step: 'finalize', attempt: 1, status: 'done', ts: now() });
  // run 层语义：本章处理完毕即 done（needs_human 是章状态，由章节行承载）
  emit({ type: 'run.status', runId: args.runId, status: 'done', ts: now() });
  return { status: outcome, finalVersionId: best.id, rounds: roundVersions.length - 1 };
}
