import { describe, expect, it } from 'vitest';
import { computeFreqGrams } from '../../src/style/freq';

describe('computeFreqGrams 高频词组统计（DEC-2026-1120-06）', () => {
  it('计数正确：重复文本 2/3 字 gram 频次与入选剔除钉值', () => {
    // '甲乙丙丁' 重复 3 次：2-gram 甲乙/乙丙/丙丁 各 3 次，3-gram 甲乙丙/乙丙丁 各 3 次
    const r = computeFreqGrams(['甲乙丙丁甲乙丙丁甲乙丙丁']);
    expect(r).toEqual([
      { term: '乙丙丁', count: 3 },
      { term: '甲乙丙', count: 3 },
    ]);
  });

  it('标点切分不成词：gram 不跨标点/空白/数字', () => {
    const r = computeFreqGrams(['青云剑诀，青云剑诀！青云剑诀。']);
    // 3×「青云剑诀」段内统计：长 gram 优先入选后剔除其包含的短 gram
    expect(r).toEqual([
      { term: '云剑诀', count: 3 },
      { term: '青云剑', count: 3 },
    ]);
    // 数字与空白当分隔：两侧不成词
    const mixed = computeFreqGrams(['风起风落 风起风落7风起风落']);
    for (const g of mixed) {
      expect(g.term.includes(' ') || /\d/.test(g.term)).toBe(false);
    }
  });

  it('count<3 剔除；minCount 可覆盖', () => {
    expect(computeFreqGrams(['甲乙', '甲乙'])).toEqual([]);
    expect(computeFreqGrams(['甲乙', '甲乙'], { minCount: 2 })).toEqual([{ term: '甲乙', count: 2 }]);
  });

  it('包含剔除：长 gram 入选后其完全包含的短 gram 不再入选（即便同 count）', () => {
    // 3×「青云诀」：青云/云诀（2 字）与青云诀（3 字）均 count 3，长 gram 优先 → 短 gram 被剔除
    const r = computeFreqGrams(['青云诀青云诀青云诀']);
    expect(r).toEqual([{ term: '青云诀', count: 3 }]);
  });

  it('top 截断钉值：22 个独立高频词组只取前 20，默认 top=20', () => {
    // 22 个互不相同的 2 字 gram，各自连写 3 次 → 各 count 3；跨界 gram count<3 不干扰
    const grams: string[] = [];
    for (let i = 0; i < 22; i++) {
      const a = String.fromCodePoint(0x4e00 + i * 2);
      const b = String.fromCodePoint(0x4e00 + i * 2 + 1);
      grams.push(`${a}${b}`);
    }
    const samples = grams.map((g) => g + g + g);
    const r = computeFreqGrams(samples);
    expect(r).toHaveLength(20);
    expect(r.every((g) => g.count === 3)).toBe(true);
    // count 全相等且等长 → 按 term 字典序升序兜底，前 20 = 字典序最小的 20 个
    const sorted = [...grams].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)).slice(0, 20);
    expect(r.map((g) => g.term)).toEqual(sorted);
    expect(r.some((g) => g.term === grams[20] || g.term === grams[21])).toBe(false);
    // top 可覆盖
    expect(computeFreqGrams(samples, { top: 2 })).toHaveLength(2);
  });

  it('多样本独立切段：gram 不跨样本边界', () => {
    // 「云青云」跨样本拼接会成词，但分样本统计不得出现
    const r = computeFreqGrams(['云青', '青云', '青云', '青云']);
    expect(r.every((g) => g.term !== '云青')).toBe(true);
    expect(r).toEqual([{ term: '青云', count: 3 }]);
  });
});
