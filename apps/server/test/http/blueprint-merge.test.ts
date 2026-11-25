import { describe, expect, it } from 'vitest';
import type { ChapterBlueprint } from '@inkforge/shared';
import { mergeSeedIntoBlueprint } from '../../src/http/blueprint-merge';

const MODEL: ChapterBlueprint = {
  goal: '模型目标',
  beats: ['甲', '乙'],
  mustHaveBeats: [{ text: '模型硬要求', keywords: ['模'], grade: 'H' }],
  bannedTopics: ['禁题1'],
};

describe('mergeSeedIntoBlueprint（FB-F4-2，DEC-2026-1125-03）', () => {
  it('确定性合并：seed.beats 置前/去重、goal seed 优先、mustHaveBeats 并集（R-F4-2）', () => {
    const seed = {
      goal: '手写目标',
      beats: ['甲'],
      mustHaveBeats: [{ text: ' 甲 ', keywords: ['手'], grade: 'L' as const }],
    };
    const merged = mergeSeedIntoBlueprint(seed, MODEL);
    // seed.beats 原样置前；模型补充按 trim 全等去重追加 → 甲重复被去、乙保留
    expect(merged.beats).toEqual(['甲', '乙']);
    // goal 非空以 seed 为准
    expect(merged.goal).toBe('手写目标');
    // mustHaveBeats：seed 条目按 trim 全等并集置前 + 模型追加（与 routes PUT 同口径），grade 随条目保留
    expect(merged.mustHaveBeats).toEqual([
      { text: '甲', keywords: ['手'], grade: 'L' },
      { text: '模型硬要求', keywords: ['模'], grade: 'H' },
    ]);
    // bannedTopics 不在合并范围，保持 model 侧
    expect(merged.bannedTopics).toEqual(['禁题1']);
  });

  it('seed 缺省/全空 → 恒等返回 model 的深拷贝形态，不抛异常', () => {
    const clone = mergeSeedIntoBlueprint(undefined, MODEL);
    expect(clone).toEqual(MODEL);
    expect(clone).not.toBe(MODEL);
    expect(clone.beats).not.toBe(MODEL.beats);
    const empty = mergeSeedIntoBlueprint({}, MODEL);
    expect(empty).toEqual(MODEL);
  });

  it('seed.keywords 缺省 → 补 []；输入不被就地修改', () => {
    const seedBeats = ['丙'];
    const seed = { beats: seedBeats, mustHaveBeats: [{ text: '无键硬要求' }] };
    const model = { ...MODEL, beats: [...seedBeats] };
    const merged = mergeSeedIntoBlueprint(seed, model);
    expect(merged.beats).toEqual(['丙']); // 模型同串被去重，无追加
    expect(merged.mustHaveBeats[0]).toEqual({ text: '无键硬要求', keywords: [], grade: undefined });
    expect(model.beats).toEqual(['丙']);
    expect(MODEL.beats).toEqual(['甲', '乙']);
  });
});
