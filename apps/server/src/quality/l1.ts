import { assembleContext, type ContextSlot } from '../context/assembler';
import { pickBudgetProfile, type AppConfig } from '../config';
import { parseFindings } from '../llm/plainproto';
import { renderQc } from '../prompts/render';
import type { LlmProvider, CompletionRequest } from '../llm/types';
import type { L1Report } from './gate';

const REPAIR_HEADER = '【解析失败重试】上一轮输出无法解析，错误如下：';

function repairPrompt(errors: string[]): string {
  return `${REPAIR_HEADER}\n${errors.map((e, i) => `${i + 1}. ${e}`).join('\n')}\n请严格按【输出格式】重新输出整段评审结果。`;
}

function qcSlots(input: { draft: string; blueprintText: string; continuityText: string; hardRules: string }): ContextSlot[] {
  return [
    { name: 'hardRules', content: input.hardRules, budgetChars: 0, stable: true, keep: 'head' }, // budget 后填
    { name: 'draft', content: input.draft, budgetChars: 0, stable: false, keep: 'head' },
    { name: 'blueprint', content: input.blueprintText, budgetChars: 0, stable: false, keep: 'head' },
    { name: 'continuity', content: input.continuityText, budgetChars: 0, stable: false, keep: 'head' },
  ];
}

/** L1 引用证据质检：送审整章 → 解析 → quote 校验 → 解析失败修复重试一次。 */
export async function runL1Qc(
  deps: { provider: LlmProvider; config: AppConfig; hardRules?: string },
  input: { draft: string; blueprintText: string; continuityText: string; round: number; chapterNo?: number },
): Promise<L1Report> {
  const { config, provider } = deps;
  const profile = pickBudgetProfile(config.providers.local.contextWindow);
  const b = profile === 'draft8k' ? config.budgets.qc8k : config.budgets.qc;
  const slots = qcSlots({
    draft: input.draft,
    blueprintText: input.blueprintText,
    continuityText: input.continuityText,
    hardRules: deps.hardRules ?? '',
  });
  slots[0].budgetChars = b.hardRules;
  slots[1].budgetChars = b.draft;
  slots[2].budgetChars = b.blueprint;
  slots[3].budgetChars = b.continuity;
  const assembled = assembleContext(slots, config.providers.local.contextWindow - config.providers.local.maxOutput - 500);
  const baseReq = (user: string): CompletionRequest => ({
    system: assembled.system,
    user,
    temperature: 0.2,
    topP: 0.9,
    maxOutputTokens: config.providers.local.maxOutput,
    timeoutMs: config.timeouts.qc,
    meta: { step: 'qc', chapterNo: input.chapterNo, round: input.round },
  });

  const firstUser = `${assembled.user}`;
  const first = parseFindings((await provider.complete(baseReq(firstUser))).text);

  let report = first;
  let repaired = false;
  if (first.errors.length > 0) {
    repaired = true;
    const second = parseFindings((await provider.complete(baseReq(`${firstUser}\n\n${repairPrompt(first.errors)}`))).text);
    report = second.errors.length > 0 ? first : second;
  }

  // 引用证据校验：quote 必须是 draft 子串，否则丢弃
  let invalidQuotes = 0;
  const findings = [];
  for (const f of report.findings) {
    if (input.draft.includes(f.quote)) findings.push(f);
    else invalidQuotes++;
  }
  return { findings, invalidQuotes, overall: report.overall, parseErrors: report.errors, repaired };
}
