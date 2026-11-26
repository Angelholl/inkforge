import type { CharacterCard } from '../db/repositories/books';

/** 零命中保险丝的固定提示文案：蓝图没点名任何卡时仍全量注入，避免误抽空人物槽。 */
export const ZERO_MATCH_WARNING = '蓝图未匹配任何人物卡，已全量注入';

/**
 * 判断蓝图是否为空：空白串、非对象/空对象，或目标与节拍字段均为空。
 * 空蓝图尚未填内容，不应因「零命中」而报 warning 干扰排查。
 */
function isEmptyBlueprint(text: string): boolean {
  const raw = text.trim();
  if (!raw) return true;
  try {
    const bp = JSON.parse(raw) as Record<string, unknown> | null;
    if (!bp || typeof bp !== 'object' || Array.isArray(bp) || Object.keys(bp).length === 0) return true;
    const goal = typeof bp.goal === 'string' ? bp.goal.trim() : '';
    const beats = Array.isArray(bp.beats) ? bp.beats.length : 0;
    const mustHave = Array.isArray(bp.mustHaveBeats) ? bp.mustHaveBeats.length : 0;
    return goal === '' && beats === 0 && mustHave === 0;
  } catch {
    // 非 JSON 文本按原文处理，不当作空蓝图。
    return false;
  }
}

/**
 * 人物卡注入护栏：只注入 name 出现在蓝图全文里的卡。
 * 零命中且蓝图非空 → 全量注入并附 warning（防抽空）；空蓝图 → 全量注入、无 warning。
 */
export function filterRosterForChapter(
  cards: CharacterCard[],
  blueprintText: string,
): { cards: CharacterCard[]; warning?: string } {
  if (isEmptyBlueprint(blueprintText)) return { cards };
  const matched = cards.filter((card) => blueprintText.includes(card.name));
  if (matched.length === 0) return { cards, warning: ZERO_MATCH_WARNING };
  return { cards: matched };
}
