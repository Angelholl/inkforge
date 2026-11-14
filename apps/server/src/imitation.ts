import { createHash } from 'node:crypto';
import type { OutlineItemDto } from '@inkforge/shared';
import type { Database } from './db/open';
import type { LlmProvider } from './llm/types';
import { parseOutline } from './llm/plainproto';
import { repairPrompt } from './quality/l1';
import { computeStyleMetrics } from './style/metrics';
import { pickFewShotSamples, sampleReferenceText } from './style/sample';
import { RULES_INSTRUCTION } from './style/analysis';

const STRUCTURE_INSTRUCTION = `你是长篇结构分析师。阅读参考文本的抽样片段，输出该书整体叙事结构的拆解，格式为多行 STRUCTURE 行：
STRUCTURE: <一条结构判断>
每条须指向可复用的骨架事实，例如：开篇钩子类型、卷级目标推进方式、多线交织节奏、高潮布局、收束方式。输出 5-8 条，按叙事先后排序，不要其他内容。
【抽样片段开始】`;

const BLUEPRINT_INSTRUCTION = (chapterCount: number) => `你是长篇策划编辑。基于上述结构拆解与文风规则，反推一份 ${chapterCount} 章的章节蓝图，供后续按章仿写展开。
【输出格式】每章以「# 章号」行开头，块内：
GOAL: 一句话本章目标
BEATS: 每行一条 2-4 节拍
HOOK: 结尾钩子一句
不要输出 JSON、markdown 代码块或任何解释；每块必须含 GOAL/BEATS/HOOK 三行，章号连续覆盖第 1..${chapterCount} 章。`;

export interface ImitationDraft {
  name: string;
  sourcePath: string;
  sourceHash: string;
  structure: string[];
  style: { rulesText: string };
  blueprint: OutlineItemDto[];
  metrics: Record<string, number | string>;
}

/** 拆解仿写三段分析（Pagekin 式）：①结构（8×2000 抽样→STRUCTURE 5-8 行）②文风（复用 RULES 蒸馏指令）
 *  ③蓝图反推（# 章号块协议，parseOutline 校验+一次修复重试）。draft 不入库；文本为空抛错。 */
export async function analyzeImitation(
  deps: { db: Database; provider: LlmProvider },
  input: { name: string; text: string; chapterCount: number },
): Promise<ImitationDraft> {
  const source = input.text;
  if (source.replace(/\s/g, '').length < 200) {
    throw new Error('样本为空或不足 200 字，禁止拆解');
  }
  const sourceHash = createHash('sha256').update(source).digest('hex');
  const sourcePath = `inline:${sourceHash.slice(0, 8)}`;
  const baseReq = (user: string) => ({
    system: '你是长篇小说的结构分析师与策划编辑。',
    user,
    temperature: 0.3,
    topP: 0.9,
    maxOutputTokens: 4096,
    timeoutMs: 900000,
    meta: { step: 'summarize' as const },
  });

  // ① 结构拆解：sampleReferenceText 8×2000（≈1.6 万字/次，本地 tok/s 实测可承受）
  const segments = sampleReferenceText(source, { segmentChars: 2000, maxSegments: 8 });
  const structRes = await deps.provider.complete(
    baseReq(`${STRUCTURE_INSTRUCTION}\n${segments.join('\n----\n')}\n【抽样片段结束】`),
  );
  const structure = structRes.text
    .split('\n')
    .filter((l) => l.trim().startsWith('STRUCTURE:'))
    .map((l) => l.trim().slice(10).trim())
    .filter((l) => l !== '')
    .slice(0, 8);
  if (structure.length === 0) throw new Error('结构拆解失败：缺少 STRUCTURE 行');

  // ② 文风规则：与蒸馏同一 RULES 指令（B1 七维六轴落地后切 analyzeStyle，接口对齐）
  const styleRes = await deps.provider.complete(
    baseReq(`${RULES_INSTRUCTION}\n${pickFewShotSamples(source).join('\n----\n')}\n【样本结束】`),
  );
  const rulesText = styleRes.text
    .split('\n')
    .filter((l) => l.trim().startsWith('RULES:'))
    .map((l) => l.trim().slice(6).trim())
    .filter((l) => l !== '')
    .join('\n');

  // ③ 蓝图反推：# 章号块协议，parseOutline(chapterCount) 校验 + 一次修复重试
  const bpUser = BLUEPRINT_INSTRUCTION(input.chapterCount);
  const first = parseOutline((await deps.provider.complete(baseReq(bpUser))).text, input.chapterCount);
  let report = first;
  if (first.errors.length > 0) {
    report = parseOutline(
      (await deps.provider.complete(baseReq(`${bpUser}\n\n${repairPrompt(first.errors)}`))).text,
      input.chapterCount,
    );
  }
  if (report.errors.length > 0) {
    throw new Error(`蓝图反推失败: ${report.errors.join('；')}`);
  }

  return {
    name: input.name,
    sourcePath,
    sourceHash,
    structure,
    style: { rulesText },
    blueprint: report.outline,
    metrics: { ...computeStyleMetrics(source) },
  };
}
