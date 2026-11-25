import type { BeatRequirement, BlueprintSuggestBody, ChapterBlueprint } from '@inkforge/shared';

/** FB-F4-2（DEC-2026-1125-03）：蓝图 seed 确定性合并——不赌模型遵循度，手写内容服务端直保。
 *  seed.beats 原样置前、模型补充按 trim 全等去重追加；goal 非空以 seed 为准；
 *  mustHaveBeats=seed 条目按 text.trim() 全等并集置前+模型追加（与 routes PUT :392-402 同口径），grade 随条目保留；
 *  bannedTopics 不在合并范围保持 model 侧。对 undefined/空 seed 恒等返回深拷贝，不抛异常、不就地修改输入。 */
export function mergeSeedIntoBlueprint(seed: BlueprintSuggestBody['seed'], model: ChapterBlueprint): ChapterBlueprint {
  const clone = structuredClone(model);
  if (!seed) return clone;
  const seedBeats = seed.beats ?? [];
  clone.beats = [...seedBeats, ...clone.beats.filter((b) => !seedBeats.some((s) => s.trim() === b.trim()))];
  if (seed.goal?.trim()) clone.goal = seed.goal;
  if (seed.mustHaveBeats && seed.mustHaveBeats.length > 0) {
    const seedEntries: BeatRequirement[] = seed.mustHaveBeats.map((m) => ({ text: m.text.trim(), keywords: m.keywords ?? [], grade: m.grade }));
    const keys = new Set(seedEntries.map((e) => e.text.trim()));
    clone.mustHaveBeats = [...seedEntries, ...clone.mustHaveBeats.filter((m) => !keys.has(m.text.trim()))];
  }
  return clone;
}
