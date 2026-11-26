import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ChapterBlueprint, RunEvent, StepName, StyleAxis, StyleDimension, StyleTermDto } from '@inkforge/shared';
import type { Database } from '../db/open';
import * as booksRepo from '../db/repositories/books';
import * as chaptersRepo from '../db/repositories/chapters';
import * as continuityRepo from '../db/repositories/continuity';
import * as ftsRepo from '../db/repositories/fts';
import * as runsRepo from '../db/repositories/runs';
import type { RunStep } from '../db/repositories/runs';
import { assembleContext, draftSlots } from '../context/assembler';
import type { AppConfig } from '../config';
import type { CompletionResult, LlmProvider } from '../llm/types';
import { hashPrompt } from '../llm/hash';
import { renderCharacterCards, renderDraft, renderHardRules, renderRewrite, renderStitchContinuation, renderTaskSummaryBlock } from '../prompts/render';
import { loadCliches, loadLandingWords, runL0Checks } from '../quality/l0';
import { resolveLandingWordsPath } from '../quality/landing-words';
import { runL1Qc } from '../quality/l1';
import { decideGate, type L1Report } from '../quality/gate';
import { readScoreThreshold } from '../settings';
import { buildRewriteSlots, chooseRewriteMode } from './rewrite';
import { createPartialFlusher } from './partial';
import { estimateOutputBudget, sumSlotBudget } from './budget';
import { stitchSegments } from './stitch';
import { filterRosterForChapter } from './roster';
import { getLatestProfile, type StyleSample } from '../style/distill';
import { renderFreqTermsBlock, renderStyleBlock, renderStyleDimsBlock } from '../style/inject';
import { loadStyleBundle, mergeStyleProfiles, type MergedStyleProfile } from '../style/merge';
import { computeStyleMetrics, type StyleMetrics } from '../style/metrics';
import { runSummarizeStep } from './summarize';

const CLIQUES_PATH = process.env.INKFORGE_CLIQUES_PATH ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '../../config/quality/cliches.default.txt');

export interface RunOutcome {
  status: 'done' | 'needs_human' | 'failed';
  finalVersionId?: string;
  rounds: number;
}

type PipelineRole = 'drafter' | 'qc' | 'rewriter' | 'summarizer';

interface RoleProviders {
  drafter: LlmProvider;
  qc: LlmProvider;
  rewriter: LlmProvider;
  summarizer: LlmProvider;
  /** 分账标签：该角色走的 provider 名（local|cloud），写入 step output_json 与版本 params */
  labels?: Partial<Record<PipelineRole, 'local' | 'cloud'>>;
}

export interface PipelineDeps {
  db: Database;
  provider: LlmProvider;
  /** T31 角色路由装配；缺省时全角色用 provider（向后兼容） */
  providers?: RoleProviders;
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

/** 顶格续写回路（DEC-2026-1126-07）：首调 finishReason==='length' 时，以已写全文＋续写指令追加调用，
 * 最多追加 3 段；自然收尾即停。finishReason 记首调值（触发判定的那一次），段数记实际拼接段数。 */
async function runStitchLoop(
  first: CompletionResult,
  continueWith: (writtenSoFar: string) => Promise<CompletionResult>,
  maxExtraSegments = 3,
): Promise<{ text: string; finishReason: string; segments: number }> {
  let result = first;
  let text = first.text;
  let segments = 1;
  const finishReason = first.finishReason;
  while (result.finishReason === 'length' && segments <= maxExtraSegments) {
    result = await continueWith(text);
    text = stitchSegments([text, result.text]);
    segments++;
  }
  return { text, finishReason, segments };
}

/** 单章管线：draft → qc → (rewrite → qc)×n → finalize（summarize 由 T20 插入）。
 * resumeFrom：该步之前已 done 的步直接跳过，draft 已有版本则复用不重生成（T17）。 */
export async function runChapterPipeline(
  deps: PipelineDeps,
  args: { runId: string; bookId: string; chapterNo: number; signal?: AbortSignal; resumeFrom?: StepName },
): Promise<RunOutcome> {
  const { db, config, emit } = deps;
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
  const landingWords = loadLandingWords(resolveLandingWordsPath());
  const model = config.providers.local.model;
  const runRow = runsRepo.getRun(db, args.runId);
  const runMode = runRow?.mode ?? 'generate';
  const maxRounds = runRow?.maxRounds ?? config.quality.maxRounds;
  // B3：入库分阈值可入库覆盖；每章管线开始读一次 → run 内逐章生效、单章中途不变（改值无需重启）
  const scoreThreshold = readScoreThreshold(db) ?? config.quality.scoreThreshold;

  const fallback = deps.provider;
  const roleProvider = (role: PipelineRole): LlmProvider => deps.providers?.[role] ?? fallback;
  const roleLabel = (role: PipelineRole): 'local' | 'cloud' => deps.providers?.labels?.[role] ?? 'local';
  const snapshot = continuityRepo.getContinuitySnapshot(db, args.bookId, args.chapterNo);
  const continuityText = continuityRepo.renderSnapshotText(snapshot);
  const prevTexts: string[] = [];
  for (let n = args.chapterNo - 1; n >= Math.max(1, args.chapterNo - 3); n--) {
    const prevChapter = chaptersRepo.getChapter(db, args.bookId, n);
    if (!prevChapter) continue;
    const cur = prevChapter.currentVersionId ? chaptersRepo.getVersion(db, prevChapter.currentVersionId) : undefined;
    if (cur) prevTexts.push(cur.content);
  }
  // continue 续写：以锚点前文为声线基准启用 style_drift（经既有 softMajor 门控，零新增放行）
  // DEC-2026-1117-04 裁决②③：素材统一走 loadStyleBundle + mergeStyleProfiles（continue 亦注入；
  // 快照优先/回落 live 行逻辑整体收编进 loadStyleBundle；binding 缺关联表时按主镜像合成）
  const binding = booksRepo.getBookStyleBinding(db, args.bookId)
    ?? (book.styleProfileId ? { primaryProfileId: book.styleProfileId, auxProfileIds: [], dimsSource: {}, weights: {} } : null);
  const bundle = binding ? loadStyleBundle(db, { styleProfileId: book.styleProfileId, styleSnapshotJson: book.styleSnapshotJson }) : undefined;
  const merged: MergedStyleProfile | undefined = bundle ? mergeStyleProfiles(bundle, args.chapterNo) : undefined;
  // generate+绑定档案：voice-match 基准取混合档案主 metrics 快照（空串/坏 JSON 回落主档案现行 metrics_json 再容错 → undefined，B6）
  let boundProfileMetrics: StyleMetrics | undefined;
  if (merged && runMode === 'generate') {
    try {
      boundProfileMetrics = JSON.parse(merged.primaryMetricsJson) as StyleMetrics;
    } catch {
      boundProfileMetrics = undefined;
    }
    if (!boundProfileMetrics) {
      const profile = getLatestProfile(db, merged.primaryProfileId);
      try {
        boundProfileMetrics = profile ? (JSON.parse(profile.metrics_json) as StyleMetrics) : undefined;
      } catch {
        boundProfileMetrics = undefined;
      }
    }
  }
  const voiceRefMetrics = runMode === 'continue' && prevTexts.length > 0 ? computeStyleMetrics(prevTexts.join('\n')) : boundProfileMetrics;
  const hardRules = renderHardRules(targetChars);

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
    // ── 风格注入素材（book 绑定档案时；0.1 挂机路径恒无档案 → 跳过）──
    // DEC-2026-1117-04 裁决③：删除 `runMode !== 'continue'` 注入门——续写亦注入混合风格；
    // dims/axes/rules/terms/samples 全部走合并形态（与现单档案同形流入既有槽）
    let styleRulesText = '';
    let styleTerms: StyleTermDto[] = [];
    let styleFreqTermsText = ''; // DEC-2026-1125-03①：高频词常注槽文本（不受 fewShot 开关门控）
    let styleDims: Record<StyleDimension, string> | undefined;
    let styleAxes: Record<StyleAxis, number> | undefined;
    let styleSamples: StyleSample[] = [];
    let styleSampleIds: string[] = [];
    if (merged) {
      styleRulesText = merged.rulesText;
      styleTerms = merged.terms;
      styleFreqTermsText = renderFreqTermsBlock(merged.freqTerms, config.budgets.draft.freqTerms);
      styleDims = merged.dims;
      // merged.axes 为 Partial 形态（merge 第 4 步 P 空不写入）；renderStyleDimsBlock 内部逐轴 typeof 守卫，Partial 安全
      styleAxes = merged.axes as Record<StyleAxis, number>;
      styleSamples = merged.samples;
      styleSampleIds = styleSamples.map((x) => x.id);
    }
    // B1：七维六轴画像文本与 fewShot 块提前装配（draft 与 full 重写共用同一块；targeted 补 styleRules+styleDims+fewShot 精简槽，DEC-2026-1122-03①）
    const styleDimsText = styleDims && styleAxes ? renderStyleDimsBlock(styleDims, styleAxes, config.budgets.draft.styleDims) : '';
    // B4 裁决④：fewShot 块受逐书开关控制（默认关）；styleSamples 采集、styleSampleIds 记录、抄用检测（:289 referenceTexts）一概不看开关；绑定默认开由 DEC-2026-1122-03③ 落地
    const fewShotBlock =
      book.styleFewshotOn && styleSamples.length > 0
        ? renderStyleBlock('', styleSamples, config.budgets.draft.fewShot, styleTerms)
        : undefined;

    // ── draft（复用或新建）──
    if (resumeFrom && resumeFrom !== 'draft' && doneCount('draft') > 0) {
      const draftRow = priorSteps.find((s) => s.step === 'draft' && s.status === 'done')!;
      const v = chaptersRepo.getVersion(db, draftRow.outputVersionId!)!;
      currentVersion = { id: v.id, content: v.content };
    } else {
      ensureStep('draft', 1);
      throwIfAborted();
      const draftFlusher = createPartialFlusher(db, inflightRef.current!.id);
      const roster = filterRosterForChapter(
        // 0009 下线：写第 X 章时已下线（第N章起下线，X>=N）的角色不进人物卡槽，防写手让其再登场
        booksRepo.listActiveCharacters(db, args.bookId, args.chapterNo),
        blueprintText(blueprint),
      );
      const charactersText = renderCharacterCards(roster.cards);
      const draftAssembled = assembleContext(
        draftSlots(
          {
            hardRules,
            worldview: book.description,
            characters: charactersText || undefined,
            styleDims: styleDimsText || undefined,
            styleRules: styleRulesText || undefined,
            freqTerms: styleFreqTermsText || undefined,
            blueprint: blueprintText(blueprint),
            continuity: continuityText,
            prevTail: prevTexts.length > 0 ? prevTexts[0] : '',
            fewShot: fewShotBlock,
            task: renderDraft({ chapterNo: args.chapterNo, targetChars, worldview: '', blueprint }) + (runMode === 'continue' ? '\n前文腔调优先，文风档案作质感参照。' : '') + renderTaskSummaryBlock({ mustHaveBeats: blueprint.mustHaveBeats, styleRulesText: styleRulesText, landingWords }),
          },
          config.budgets.draft,
        ),
        totalBudget,
      );
      const draftComplete = (user: string) =>
        roleProvider('drafter').complete({
          system: draftAssembled.system,
          user,
          temperature: 0.9,
          topP: 0.9,
          maxOutputTokens: estimateOutputBudget(targetChars, sumSlotBudget({ ...config.budgets.draft }), config.providers.local),
          timeoutMs: config.timeouts.draft,
          meta: { step: 'draft', chapterNo: args.chapterNo },
          signal,
          onDelta: (t) => {
            emit({ type: 'step.delta', runId: args.runId, chapterNo: args.chapterNo, step: 'draft', text: t, ts: now() });
            deps.onPartial?.(t);
            draftFlusher.push(t);
          },
        }).finally(() => draftFlusher.flush());
      const draftFirst = await draftComplete(draftAssembled.user);
      const draftStitched = await runStitchLoop(draftFirst, (written) => draftComplete(renderStitchContinuation(written)));
      const draftStitchJson = draftStitched.segments > 1 ? { stitchSegments: draftStitched.segments } : {};
      const draftVersion = chaptersRepo.appendChapterVersion(db, {
        chapterId: chapter.id,
        kind: 'draft',
        content: draftStitched.text,
        runId: args.runId,
        promptHash: hashPrompt(draftAssembled.system, draftAssembled.user),
        model,
        params: { usage: draftFirst.usage, provider: roleLabel('drafter'), finishReason: draftStitched.finishReason, ...draftStitchJson },
        styleSampleIds,
      });
      const rosterWarnJson = roster.warning ? { warnings: [roster.warning] } : {};
      finishStep('draft', 1, {
        outputVersionId: draftVersion.id,
        outputJson: { usage: draftFirst.usage, provider: roleLabel('drafter'), finishReason: draftStitched.finishReason, ...draftStitchJson, ...rosterWarnJson },
      });
      draftFlusher.discard();
      currentVersion = { id: draftVersion.id, content: draftVersion.content };
    }

    // ── qc / rewrite 循环 ──
    let finalOutcome: 'done' | 'needs_human' = 'done';
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
        voiceRefMetrics,
        // 抄用检测接线（B6）：generate 模式以本次注入的 few-shot 样本为参考文本
        referenceTexts: runMode === 'generate' && styleSamples.length > 0 ? styleSamples.map((s) => s.text) : undefined,
        cliches,
        landingWords,
      });
      const l1: L1Report = await runL1Qc(
        { provider: roleProvider('qc'), config, hardRules },
        {
          draft: currentVersion.content,
          blueprintText: blueprintText(blueprint),
          continuityText,
          round: rounds,
          chapterNo: args.chapterNo,
          signal,
        },
      );
      const gate = decideGate({ l0, l1, roundsUsed: rounds, prevOverall }, { scoreThreshold, minGain: config.quality.minGain, maxRounds });
      finishStep('qc', qcAttempt, { outputVersionId: currentVersion.id, outputJson: { l0, l1, gate, usageProvider: roleLabel('qc') } });
      chaptersRepo.setVersionParams(db, currentVersion.id, { overall: l1.overall });
      if (!roundVersions.some((rv) => rv.id === currentVersion.id)) roundVersions.push({ id: currentVersion.id, overall: l1.overall ?? -1 });

      if (gate.action === 'pass') break;
      if (gate.action === 'needs_human') {
        finalOutcome = 'needs_human';
        break;
      }
      // gate.action === 'rewrite' → 轮数已由 decideGate 保证未满
      rounds++;
      const rewriteStep = ensureStep('rewrite', rounds + 1);
      const rwAttempt = rewriteStep.attempt;
      throwIfAborted();
      const rwFlusher = createPartialFlusher(db, inflightRef.current!.id);
      const mode = chooseRewriteMode(l0, l1);
      const clicheFix = l0.clicheHits.length > 0 ? `以下套话句必须整句删除或改写（不得保留原句式）：${l0.clicheHits.map((h) => `「${h}」`).join('、')}。` : '';
      const echoFix = l0.checks.find((c) => c.name === 'echo_20gram' && !c.pass) ? '正文与前文存在 20 字以上连续复文，必须彻底改写复文段，不得换皮复用。' : '';
      const landingPreserve = blueprint.mustHaveBeats.length > 0 ? '蓝图必含节拍（含关键词）不得在修订中丢失，缺失必须补写。' : '';
      // D-A（DEC-2026-1122-03①）：few-shot 样本仅供腔调与尺度参照，prompt 层防逐字搬运（plagiarism 检查器零改动）
      const fewShotGuard = fewShotBlock ? '范例片段仅供腔调与尺度参照，不得复用其中连续 15 字以上的原文（去空白比对，plagiarism 闸门硬拦）。' : '';
      const taskInstruction =
        mode === 'targeted'
          ? `仅修复所列问题，其余内容保持原样；输出前清点正文字数，必须落在 ${Math.round(targetChars * 0.9)}-${Math.round(targetChars * 1.1)} 字之间（绝对上限 ${Math.round(targetChars * 1.2)} 字）；章尾不得与前文章尾段落复现；${fewShotGuard}${echoFix}${clicheFix}${landingPreserve}直接输出修订后的完整章节正文。`
          : `按硬规则与蓝图整章重写，消除全部所列问题；输出前清点正文字数，必须落在 ${Math.round(targetChars * 0.9)}-${Math.round(targetChars * 1.1)} 字之间（绝对上限 ${Math.round(targetChars * 1.2)} 字）；章尾不得与前文章尾段落复现；${fewShotGuard}${echoFix}${clicheFix}${landingPreserve}直接输出完整章节正文。`;
      const taskText = renderRewrite({ findings: l1.findings, taskInstruction }) + renderTaskSummaryBlock({ mustHaveBeats: blueprint.mustHaveBeats, styleRulesText: styleRulesText, landingWords });
      const rwSlots =
        mode === 'targeted'
          ? buildRewriteSlots(
              {
                original: currentVersion.content,
                findings: l1.findings,
                factBaselineText: continuityText,
                mode,
                taskInstruction: taskText,
                hardRules,
                styleRules: styleRulesText || undefined,
                styleDims: styleDimsText || undefined,
                freqTerms: styleFreqTermsText || undefined,
                fewShot: fewShotBlock,
              },
              config.budgets.rewrite,
            )
          : buildRewriteSlots(
              {
                original: currentVersion.content,
                findings: l1.findings,
                factBaselineText: continuityText,
                mode,
                taskInstruction: taskText,
                hardRules,
                worldview: book.description,
                blueprint: blueprintText(blueprint),
                continuity: continuityText,
                prevTail: prevTexts.length > 0 ? prevTexts[0] : '',
                styleRules: styleRulesText || undefined,
                styleDims: styleDimsText || undefined,
                freqTerms: styleFreqTermsText || undefined,
                fewShot: fewShotBlock,
                draftBudgets: config.budgets.draft,
              },
              config.budgets.rewrite,
            );
      const rwAssembled = assembleContext(rwSlots, totalBudget);
      const rewriteComplete = (user: string) =>
        roleProvider('rewriter').complete({
          system: rwAssembled.system,
          user,
          temperature: 0.7,
          topP: 0.9,
          maxOutputTokens: estimateOutputBudget(targetChars, sumSlotBudget({ ...config.budgets.rewrite }), config.providers.local),
          timeoutMs: config.timeouts.rewrite,
          meta: { step: 'rewrite', chapterNo: args.chapterNo, round: rounds },
          signal,
          onDelta: (t) => {
            emit({ type: 'step.delta', runId: args.runId, chapterNo: args.chapterNo, step: 'rewrite', text: t, ts: now() });
            deps.onPartial?.(t);
            rwFlusher.push(t);
          },
        }).finally(() => rwFlusher.flush());
      const rwFirst = await rewriteComplete(rwAssembled.user);
      const rwStitched = await runStitchLoop(rwFirst, (written) => rewriteComplete(renderStitchContinuation(written)));
      const rwStitchJson = rwStitched.segments > 1 ? { stitchSegments: rwStitched.segments } : {};
      const revised = chaptersRepo.appendChapterVersion(db, {
        chapterId: chapter.id,
        kind: 'revised',
        content: rwStitched.text,
        runId: args.runId,
        promptHash: hashPrompt(rwAssembled.system, rwAssembled.user),
        model,
        parentVersionId: currentVersion.id,
        params: { usage: rwFirst.usage, round: rounds, provider: roleLabel('rewriter'), finishReason: rwStitched.finishReason, ...rwStitchJson },
      });
      finishStep('rewrite', rwAttempt, {
        outputVersionId: revised.id,
        outputJson: { usage: rwFirst.usage, round: rounds, provider: roleLabel('rewriter'), finishReason: rwStitched.finishReason, ...rwStitchJson },
      });
      rwFlusher.discard();
      currentVersion = { id: revised.id, content: revised.content };
      prevOverall = l1.overall;
    }
    // ── finalize 同规则先选 best：overall 最大、相等取追加序后者 ──
    const best = roundVersions.reduce((b, v) => (v.overall >= b.overall ? v : b), roundVersions[0]);
    // ── summarize（T20）：摘要必须取 finalize 将落指针的 best 版正文 ──
    try {
      ensureStep('summarize', 1);
      throwIfAborted();
      await runSummarizeStep({ db, provider: roleProvider('summarizer'), config, emit }, {
        runId: args.runId,
        chapterId: chapter.id,
        chapterNo: args.chapterNo,
        bookId: args.bookId,
        finalContent: chaptersRepo.getVersion(db, best.id)!.content,
        signal,
      });
      finishStep('summarize', 1, {});
    } catch (e) {
      if (finalOutcome === 'done') throw e;
      runsRepo.markStep(db, inflightRef.current!.id, { status: 'failed', endedAt: now(), error: (e as Error).message });
      inflightRef.current = null;
    }
    return finalize(db, chapter.id, best, finalOutcome, args, emit);
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
  best: { id: string; overall: number },
  outcome: 'done' | 'needs_human',
  args: { runId: string; bookId: string; chapterNo: number },
  emit: (e: RunEvent) => void,
): RunOutcome {
  // 幂等：同章已有 finalize 行则复用（不重 appendStep，消除重入 UNIQUE 冲突）
  const existingFin = runsRepo.listSteps(db, args.runId).find((s) => s.chapterId === chapterId && s.step === 'finalize');
  const finAttempt = existingFin ? existingFin.attempt : 1;
  if (existingFin) {
    runsRepo.markStep(db, existingFin.id, { status: 'done', endedAt: now(), outputVersionId: best.id });
  } else {
    const finStep = runsRepo.appendStep(db, { runId: args.runId, chapterId, step: 'finalize', attempt: 1 });
    runsRepo.markStep(db, finStep.id, { status: 'done', endedAt: now(), outputVersionId: best.id });
  }
  emit({ type: 'step.status', runId: args.runId, chapterNo: args.chapterNo, step: 'finalize', attempt: finAttempt, status: 'inflight', ts: now() });
  chaptersRepo.setCurrentVersion(db, chapterId, best.id);
  const content = chaptersRepo.getVersion(db, best.id)!.content;
  ftsRepo.syncFts(db, chapterId, content);
  chaptersRepo.setChapterStatus(db, chapterId, outcome === 'done' ? 'done' : 'needs_human');
  emit({ type: 'step.status', runId: args.runId, chapterNo: args.chapterNo, step: 'finalize', attempt: finAttempt, status: 'done', ts: now() });
  // run 层语义：本章处理完毕即 done（needs_human 是章状态，由章节行承载）
  emit({ type: 'run.status', runId: args.runId, status: 'done', ts: now() });
  const rounds = runsRepo.listSteps(db, args.runId).filter((s) => s.chapterId === chapterId && s.step === 'rewrite' && s.status === 'done').length;
  return { status: outcome, finalVersionId: best.id, rounds };
}
