import { createHash } from 'node:crypto';
import type { Database } from './db/open';
import type { LlmProvider } from './llm/types';
import { sampleReferenceText } from './style/sample';

const SPECTRUM_INSTRUCTION = `你是长篇人物分析师。阅读参考文本的抽样片段，把书中角色蒸馏为匿名化的人物原型，输出两部分：
ROLE: <定位标签>: <光谱特性>
（3-16 条。定位标签=性别+叙事功能序号，如「男角色A」「女角色B」「尊长C」「反派D」；光谱特性=性格光谱、行事动机、关系功能。）
NAMES: <原文出现的角色名列表，顿号分隔>
【硬性禁令】ROLE 行严禁出现原文人名、地名、专有名词，只能用定位标签指代。除 ROLE/NAMES 行外不要任何其他内容。
【抽样片段开始】`;

export interface SpectrumDraft {
  name: string;
  sourcePath: string;
  sourceHash: string;
  structure: string[];
}

/** 脱敏校验：ROLE 行命中任一原文角色名即违规，返回命中的名字。
 *  匹配口径：2 字名查整名；≥3 字名查整名及其 ≥3 字连续子串（防「林静如」子串「静如」误杀文学措辞）。 */
export function findNameLeak(roleLine: string, names: string[]): string | undefined {
  for (const name of names) {
    const n = name.trim();
    if (n.length < 2) continue;
    if (roleLine.includes(n)) return n;
    for (let len = n.length - 1; len >= 3; len--) {
      for (let i = 0; i + len <= n.length; i++) {
        if (roleLine.includes(n.slice(i, i + len))) return n;
      }
    }
  }
  return undefined;
}

function parseRoleLines(text: string): { roles: string[]; names: string[] } {
  const roles: string[] = [];
  let names: string[] = [];
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (t.startsWith('ROLE:')) {
      const v = t.slice(5).trim();
      if (v !== '') roles.push(v);
    } else if (t.startsWith('NAMES:')) {
      names = t.slice(6).split(/[、,，;；\s]+/).map((s) => s.trim()).filter((s) => s !== '');
    }
  }
  return { roles, names };
}

/** 人物光谱蒸馏（DEC-2026-1120-09）：单轮 LLM 抽样拆解 ROLE/NAMES 行协议；NAMES 不入库，仅作程序脱敏兜底校验。
 * 脱敏违规→自动重蒸一次；再违规→throw（错误信息含违规行与命中的名字）。 */
export async function analyzeSpectrum(
  deps: { db: Database; provider: LlmProvider },
  input: { name: string; text: string },
): Promise<SpectrumDraft> {
  const source = input.text;
  if (source.replace(/\s/g, '').length < 200) {
    throw new Error('样本为空或不足 200 字，禁止蒸馏');
  }
  const sourceHash = createHash('sha256').update(source).digest('hex');
  const sourcePath = `inline:${sourceHash.slice(0, 8)}`;
  const baseReq = (user: string) => ({
    system: '你是长篇小说的人物分析师。',
    user,
    temperature: 0.3,
    topP: 0.9,
    maxOutputTokens: 4096,
    timeoutMs: 900000,
    meta: { step: 'summarize' as const },
  });
  // 抽样：sampleReferenceText 8×2000（与剧情蒸馏同一口径，≈1.6 万字/次）
  const segments = sampleReferenceText(source, { segmentChars: 2000, maxSegments: 16 });
  const prompt = `${SPECTRUM_INSTRUCTION}\n${segments.join('\n----\n')}\n【抽样片段结束】`;

  const attempt = async (): Promise<{ roles: string[]; names: string[] }> => {
    const res = await deps.provider.complete(baseReq(prompt));
    const { roles, names } = parseRoleLines(res.text);
    // 条数钳制 3-16：少于 3 条视同蒸馏失败；多于 16 条截断
    if (roles.length < 3) throw new Error('人物光谱蒸馏失败：ROLE 行不足 3 条');
    return { roles: roles.slice(0, 16), names };
  };

  const first = await attempt();
  const leak1 = first.roles.map((r) => ({ r, hit: findNameLeak(r, first.names) })).find((x) => x.hit);
  let result = first;
  if (leak1) {
    // 自动重蒸一次（程序脱敏兜底）
    result = await attempt();
    const leak2 = result.roles.map((r) => ({ r, hit: findNameLeak(r, result.names) })).find((x) => x.hit);
    if (leak2) {
      throw new Error(`人物光谱蒸馏失败：脱敏校验未通过，违规行「${leak2.r}」命中原文角色名「${leak2.hit}」`);
    }
  }
  return { name: input.name, sourcePath, sourceHash, structure: result.roles };
}
