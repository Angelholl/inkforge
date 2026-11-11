import type { StyleSample } from './distill';

/** 每章轮换选样：startIdx=(chapterNo-1) mod len 循环取 count 段。 */
export function pickStyleSamples(samples: StyleSample[], chapterNo: number, count = 3): StyleSample[] {
  if (samples.length === 0) return [];
  const startIdx = (chapterNo - 1) % samples.length;
  const out: StyleSample[] = [];
  for (let i = 0; i < Math.min(count, samples.length); i++) {
    out.push(samples[(startIdx + i) % samples.length]);
  }
  return out;
}

/** 风格块渲染：规则行 + 样本文本；超预算截断。 */
export function renderStyleBlock(rulesText: string, samples: StyleSample[], budgetChars = 1200): string {
  const parts = [`【文风规则】\n${rulesText}`, ...samples.map((s) => `【范例片段】\n${s.text}`)];
  const full = parts.join('\n\n');
  return full.length <= budgetChars ? full : full.slice(0, budgetChars);
}
