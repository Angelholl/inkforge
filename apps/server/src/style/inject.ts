import { STYLE_AXES, STYLE_DIMENSIONS, type StyleAxis, type StyleDimension, type StyleTermDto } from '@inkforge/shared';
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

/** 风格块渲染（DEC-2026-1120-10）：规则行 + 范例片段 + 术语段（terms 截 5 条、置于尾部）；超预算 head 截断时先牺牲术语。rulesText 去空白为空时不产出【文风规则】空头（B1 修保留）。 */
export function renderStyleBlock(rulesText: string, samples: StyleSample[], budgetChars = 1200, terms?: StyleTermDto[]): string {
  const parts: string[] = [];
  if (rulesText.trim().length > 0) {
    parts.push(`【文风规则】\n${rulesText}`);
  }
  parts.push(...samples.map((s) => `【范例片段】\n${s.text}`));
  if (terms && terms.length > 0) {
    parts.push(`【术语表】\n${terms.slice(0, 5).map((t) => `${t.term}：${t.note}`).join('\n')}`);
  }
  const full = parts.join('\n\n');
  return full.length <= budgetChars ? full : full.slice(0, budgetChars);
}

/** 高频词常注块（DEC-2026-1125-03①）：独立渲染不并入 renderStyleBlock；空数组返回空串；超预算 head 截断。 */
export function renderFreqTermsBlock(freqTerms: StyleTermDto[], budgetChars = 600): string {
  if (freqTerms.length === 0) return '';
  const full = `【高频词】\n${freqTerms.map((t) => `${t.term}：${t.note}`).join('\n')}`;
  return full.length <= budgetChars ? full : full.slice(0, budgetChars);
}

/** 六轴语义句映射表（B1 钉死，写手禁改写；值 <40 取 low、>60 取 high、40-60 视为中性不注入）。 */
export const AXIS_GUIDES: Record<StyleAxis, { low: string; high: string }> = {
  叙述温度: {
    low: '叙述温度偏冷：保持克制旁观的笔调，少用感叹与情绪形容词，情感经动作与细节自然透出。',
    high: '叙述温度偏热：笔调贴近人物内心，允许直白的情绪抒发与氛围渲染，语感热烈。',
  },
  语言密度: {
    low: '语言密度偏低：短句为主，用词平白晓畅，避免长句、从句嵌套与生僻书面语。',
    high: '语言密度偏高：多用长句与修饰层叠，词汇书面化，意象稠密，读感绵密。',
  },
  叙述者姿态: {
    low: '叙述者姿态疏离：以旁观视角叙述，不进入人物内心，评价性议论保持克制。',
    high: '叙述者姿态贴身：紧贴视角人物的感知与心理，叙述语气随人物情绪起伏。',
  },
  节奏: {
    low: '节奏偏缓：场景从容展开，多用静态描写与心理铺陈，允许放慢情节推进。',
    high: '节奏偏快：场景切换干脆，以动作与对话推进，压缩铺陈直取冲突。',
  },
  幽默: {
    low: '幽默感低：整体笔调严肃，避免插科打诨、玩笑式比喻与轻佻语。',
    high: '幽默感高：允许俏皮比喻、反讽与轻松调侃，沉重段落可被化解。',
  },
  情绪表达: {
    low: '情绪表达内敛：情感靠留白与细节暗示，避免直接点破人物感受。',
    high: '情绪表达外放：情感直接抒发，允许大喜大悲的浓烈笔触。',
  },
};

/** 七维画像 + 六轴锚点语义块（B1）：dims 非空行逐维列出，六轴只注入落入低/高带的语义句并附值；全空返回空串，超预算头部截断。 */
export function renderStyleDimsBlock(dims: Record<StyleDimension, string>, axes: Record<StyleAxis, number>, budgetChars?: number): string {
  const parts: string[] = [];
  const dimLines = STYLE_DIMENSIONS.filter((d) => (dims[d] ?? '').trim().length > 0).map((d) => `· ${d}：${(dims[d] ?? '').trim()}`);
  if (dimLines.length > 0) {
    parts.push(['【文风画像】', ...dimLines].join('\n'));
  }
  const axisLines = STYLE_AXES.filter((a) => typeof axes[a] === 'number' && (axes[a] < 40 || axes[a] > 60)).map(
    (a) => `· ${a}：${axes[a] < 40 ? AXIS_GUIDES[a].low : AXIS_GUIDES[a].high}（值 ${axes[a]}）`,
  );
  if (axisLines.length > 0) {
    parts.push(['【六轴锚点】', ...axisLines].join('\n'));
  }
  if (parts.length === 0) return '';
  const full = parts.join('\n\n');
  return budgetChars != null && full.length > budgetChars ? full.slice(0, budgetChars) : full;
}
