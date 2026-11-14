import type { AppConfig } from '../config';

export interface ContextSlot {
  name: string;
  content: string;
  budgetChars: number;
  stable: boolean;
  keep: 'head' | 'tail';
}

export interface AssembledPrompt {
  system: string;
  user: string;
  slotReport: Array<{ name: string; requestedChars: number; usedChars: number; truncated: boolean }>;
}

/** 单槽超预算即截断：head 取前 N 字符、tail 取后 N 字符。 */
function applySlot(slot: ContextSlot): { content: string; truncated: boolean } {
  if (slot.content.length <= slot.budgetChars) {
    return { content: slot.content, truncated: false };
  }
  return {
    content: slot.keep === 'head' ? slot.content.slice(0, slot.budgetChars) : slot.content.slice(-slot.budgetChars),
    truncated: true,
  };
}

/**
 * 槽位装配：stable 槽依序拼 system（KV cache 前缀），volatile 槽依序拼 user，段间 \n\n。
 * 全槽 used 合计超出 totalBudgetChars 时按最大 volatile 槽迭代收缩 10%（确定性）。
 */
export function assembleContext(slots: ContextSlot[], totalBudgetChars: number): AssembledPrompt {
  const applied = slots.map((s) => ({ slot: s, ...applySlot(s) }));
  const sum = () => applied.reduce((acc, a) => acc + a.content.length, 0);
  while (sum() > totalBudgetChars) {
    const target = applied
      .filter((a) => !a.slot.stable && a.content.length > 0)
      .sort((x, y) => y.content.length - x.content.length)[0];
    if (!target) break;
    const nextLen = Math.floor(target.content.length * 0.9);
    target.content = nextLen > 0 ? target.content.slice(0, nextLen) : '';
    target.truncated = true;
  }
  const system = applied
    .filter((a) => a.slot.stable && a.content.length > 0)
    .map((a) => a.content)
    .join('\n\n');
  const user = applied
    .filter((a) => !a.slot.stable && a.content.length > 0)
    .map((a) => a.content)
    .join('\n\n');
  return {
    system,
    user,
    slotReport: applied.map((a) => ({
      name: a.slot.name,
      requestedChars: a.slot.content.length,
      usedChars: a.content.length,
      truncated: a.truncated,
    })),
  };
}

/** draft 槽序（钉死）：stable=hardRules/worldview/(characters)/styleRules；volatile=blueprint/continuity/prevTail(tail)/fewShot/task。 */
export function draftSlots(
  input: {
    hardRules: string;
    worldview: string;
    characters?: string;
    styleRules?: string;
    blueprint: string;
    continuity: string;
    prevTail: string;
    fewShot?: string;
    task: string;
  },
  budgets: AppConfig['budgets']['draft'],
): ContextSlot[] {
  const slots: ContextSlot[] = [
    { name: 'hardRules', content: input.hardRules, budgetChars: budgets.hardRules, stable: true, keep: 'head' },
    { name: 'worldview', content: input.worldview, budgetChars: budgets.worldview, stable: true, keep: 'head' },
  ];
  if (input.characters && input.characters.length > 0) {
    slots.push({ name: 'characters', content: input.characters, budgetChars: budgets.characters, stable: true, keep: 'head' });
  }
  if (input.styleRules && input.styleRules.length > 0) {
    slots.push({ name: 'styleRules', content: input.styleRules, budgetChars: budgets.styleRules, stable: true, keep: 'head' });
  }
  slots.push(
    { name: 'blueprint', content: input.blueprint, budgetChars: budgets.blueprint, stable: false, keep: 'head' },
    { name: 'continuity', content: input.continuity, budgetChars: budgets.continuity, stable: false, keep: 'head' },
  );
  if (input.prevTail && input.prevTail.length > 0) {
    slots.push({ name: 'prevTail', content: input.prevTail, budgetChars: budgets.prevTail, stable: false, keep: 'tail' });
  }
  if (input.fewShot && input.fewShot.length > 0) {
    slots.push({ name: 'fewShot', content: input.fewShot, budgetChars: budgets.fewShot, stable: false, keep: 'head' });
  }
  slots.push({ name: 'task', content: input.task, budgetChars: budgets.task, stable: false, keep: 'head' });
  return slots;
}
