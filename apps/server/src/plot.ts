import { createHash } from 'node:crypto';
import type { Database } from './db/open';
import type { LlmProvider } from './llm/types';
import { sampleReferenceText } from './style/sample';

const PLOT_INSTRUCTION = `你是长篇剧情分析师。阅读参考文本的抽样片段，输出该书剧情结构的拆解，格式为多行 PLOT 行：
PLOT: <一条剧情骨架判断>
每条须指向可复用的剧情事实，例如：开篇钩子类型、卷级目标推进方式、多线交织节奏、高潮布局、收束方式、可复用桥段。输出 5-10 条，按叙事先后排序，不要其他内容。
【抽样片段开始】`;

export interface PlotDraft {
  name: string;
  sourcePath: string;
  sourceHash: string;
  structure: string[];
}

/** 剧情蒸馏（DEC-2026-1120-03）：单轮 LLM 抽样拆解，PLOT 行协议；与 analyzeImitation 结构段同构（不含文风/蓝图反推）。draft 不入库。 */
export async function analyzePlot(
  deps: { db: Database; provider: LlmProvider },
  input: { name: string; text: string },
): Promise<PlotDraft> {
  const source = input.text;
  if (source.replace(/\s/g, '').length < 200) {
    throw new Error('样本为空或不足 200 字，禁止蒸馏');
  }
  const sourceHash = createHash('sha256').update(source).digest('hex');
  const sourcePath = `inline:${sourceHash.slice(0, 8)}`;
  const baseReq = (user: string) => ({
    system: '你是长篇小说的剧情分析师。',
    user,
    temperature: 0.3,
    topP: 0.9,
    maxOutputTokens: 4096,
    timeoutMs: 900000,
    meta: { step: 'summarize' as const },
  });
  // 抽样：sampleReferenceText 8×2000（与仿写结构拆解同一口径，≈1.6 万字/次）
  const segments = sampleReferenceText(source, { segmentChars: 2000, maxSegments: 8 });
  const res = await deps.provider.complete(baseReq(`${PLOT_INSTRUCTION}\n${segments.join('\n----\n')}\n【抽样片段结束】`));
  const structure = res.text
    .split('\n')
    .filter((l) => l.trim().startsWith('PLOT:'))
    .map((l) => l.trim().slice(5).trim())
    .filter((l) => l !== '')
    .slice(0, 10);
  if (structure.length === 0) throw new Error('剧情蒸馏失败：缺少 PLOT 行');
  return { name: input.name, sourcePath, sourceHash, structure };
}
