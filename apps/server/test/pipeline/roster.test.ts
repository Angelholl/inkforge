import { describe, expect, it } from 'vitest';
import type { CharacterCard } from '../../src/db/repositories/books';
import { filterRosterForChapter } from '../../src/pipeline/roster';

// 事故形状自持夹具：六张与本章正文无交集的卡（只用名字，不带任何库内正文）。
const cards: CharacterCard[] = ['阿美', '阿泰', '赵启帆', '马春桃', '群像甲', '群像乙'].map((name, i) => ({
  id: `card-${i}`,
  name,
  baseSetting: '{}',
  offlineFromChapter: null,
  aliases: [],
}));

const blueprint = (goal: string, beats: string[] = []): string =>
  JSON.stringify({ goal, beats, mustHaveBeats: [], bannedTopics: [] });

describe('filterRosterForChapter（人物卡注入护栏）', () => {
  it('零命中：全量注入且给出 warning（防抽空保险丝）', () => {
    const out = filterRosterForChapter(cards, blueprint('本章推进主线', ['夜谈']));
    expect(out.cards).toEqual(cards);
    expect(out.warning).toBe('蓝图未匹配任何人物卡，已全量注入');
  });

  it('点名某卡：只注入该卡且无 warning', () => {
    const out = filterRosterForChapter(cards, blueprint('赵启帆在本章登场'));
    expect(out.cards.map((c) => c.name)).toEqual(['赵启帆']);
    expect(out.warning).toBeUndefined();
  });

  it('空蓝图 JSON：全量注入且无 warning', () => {
    expect(filterRosterForChapter(cards, '{}')).toEqual({ cards });
    expect(filterRosterForChapter(cards, '')).toEqual({ cards });
  });
});
