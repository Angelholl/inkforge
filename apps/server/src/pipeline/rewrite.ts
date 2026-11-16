import type { Finding } from '@inkforge/shared';
import { draftSlots, type ContextSlot } from '../context/assembler';
import type { AppConfig } from '../config';
import type { L0Report } from '../quality/l0';
import type { L1Report } from '../quality/gate';

/**
 * l0.hardFail || blocker ≥1 || L0 不通过检查项 ≥3 → full（整章重生成）；否则 targeted（定点修订）。
 */
export function chooseRewriteMode(l0: L0Report, l1: L1Report): 'targeted' | 'full' {
  if (l0.hardFail) return 'full';
  if (l1.findings.some((f) => f.severity === 'blocker')) return 'full';
  if (l0.checks.filter((c) => !c.pass).length >= 3) return 'full';
  return 'targeted';
}

export interface RewriteSlotsInput {
  original: string;
  findings: Finding[];
  factBaselineText: string;
  mode: 'targeted' | 'full';
  taskInstruction: string;
  hardRules?: string;
  // full 模式复用 draft 装配素材（槽名集与 draftSlots 一致）
  worldview?: string;
  styleRules?: string;
  styleDims?: string;
  blueprint?: string;
  continuity?: string;
  prevTail?: string;
  fewShot?: string;
  draftBudgets?: AppConfig['budgets']['draft'];
}

export function buildRewriteSlots(input: RewriteSlotsInput, budgets: AppConfig['budgets']['rewrite']): ContextSlot[] {
  if (input.mode === 'full') {
    if (!input.draftBudgets) throw new Error('full 模式需要 draftBudgets');
    return draftSlots(
      {
        hardRules: input.hardRules ?? '',
        worldview: input.worldview ?? '',
        styleRules: input.styleRules,
        styleDims: input.styleDims,
        blueprint: input.blueprint ?? '',
        continuity: input.continuity ?? '',
        prevTail: input.prevTail ?? '',
        fewShot: input.fewShot,
        task: input.taskInstruction,
      },
      input.draftBudgets,
    );
  }
  const actionable = input.findings.filter((f) => f.severity === 'blocker' || f.severity === 'major');
  const findingsText =
    actionable.length > 0
      ? actionable.map((f, i) => `${i + 1}. [${f.severity}]（${f.dimension}）引文：${f.quote}——${f.comment}`).join('\n')
      : '（无 blocker/major）';
  const slots: ContextSlot[] = [
    { name: 'hardRules', content: input.hardRules ?? '', budgetChars: budgets.hardRules, stable: true, keep: 'head' },
  ];
  // B1：targeted 重写同样注入风格精简槽（有值才插，紧随 hardRules，stable 进 system）
  if (input.styleRules && input.styleRules.length > 0) {
    slots.push({ name: 'styleRules', content: input.styleRules, budgetChars: budgets.styleRules, stable: true, keep: 'head' });
  }
  slots.push(
    { name: 'original', content: input.original, budgetChars: budgets.original, stable: false, keep: 'head' },
    { name: 'findings', content: findingsText, budgetChars: budgets.findings, stable: false, keep: 'head' },
    { name: 'factBaseline', content: input.factBaselineText, budgetChars: budgets.factBaseline, stable: false, keep: 'head' },
    { name: 'task', content: input.taskInstruction, budgetChars: budgets.task, stable: false, keep: 'head' },
  );
  return slots;
}
