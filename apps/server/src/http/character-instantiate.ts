import type { CharacterInstantiateDraftDto } from '@inkforge/shared';
import type { Database } from '../db/open';
import type { LlmProvider } from '../llm/types';
import * as booksRepo from '../db/repositories/books';
import { getSpectrumProfile } from '../db/repositories/spectrum';

// FB-F2-2（DEC-2026-1125-03）：光谱档案→AI 实例化人物卡。行协议禁 JSON（DEC-2026-1111-01 红线）；
// baseSetting=JSON 对象字符串是字段值形态，不等于输出 JSON 协议。草稿层审阅后才走既有 POST /characters 入库（409 语义不动）。
const INSTRUCTION = `你是长篇人物架构师。依据以下「人物光谱原型」行为本书实例化具体人物卡，每张卡两块：
NAME: <姓名>
BASE: <单行 JSON 对象字符串（外形/腔调/动机/叙事功能等键值）>
卡间空一行。不要输出 JSON 文档、markdown 代码块或任何解释；每行必须保留 NAME:/BASE: 前缀。
【光谱原型开始】`;

/** 解析行协议：BASE 须为 plain object（非数组非 null），否则该卡丢弃记 warning；
 *  钉死顺序=校验→截断(maxCards)→重名（批内+既有，草稿层标 warning 不落库）。对无标记行输出恒 0 卡。 */
export function parseInstantiateOutput(raw: string, existingNames: Set<string>, maxCards: number): CharacterInstantiateDraftDto {
  const warnings: string[] = [];
  const blocks: Array<{ name?: string; base?: string }> = [];
  let cur: { name?: string; base?: string } | null = null;
  for (const line of raw.replace(/\r\n/g, '\n').split('\n')) {
    const t = line.trim();
    const mn = /^NAME\s*[:：]\s*(.*)$/.exec(t);
    if (mn) {
      cur = { name: mn[1].trim() };
      continue;
    }
    const mb = /^BASE\s*[:：]\s*(.*)$/.exec(t);
    if (mb && cur) {
      cur.base = mb[1].trim();
      blocks.push(cur);
      cur = null;
    }
  }
  const valid: Array<{ name: string; obj: Record<string, unknown> }> = [];
  blocks.forEach((b, i) => {
    if (!b.name) return; // 无 NAME 前缀的孤儿 BASE 跳过（计划未钉死，不计 warning）
    let obj: unknown;
    try {
      obj = JSON.parse(b.base ?? '');
    } catch {
      obj = undefined;
    }
    if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
      warnings.push(`第${i + 1}张卡 baseSetting 非 JSON 对象字符串，已跳过`);
      return;
    }
    valid.push({ name: b.name, obj: obj as Record<string, unknown> });
  });
  if (valid.length > maxCards) {
    valid.length = maxCards;
    warnings.push(`单次最多 ${maxCards} 张，已截取前 ${maxCards} 张`);
  }
  const seen = new Set(existingNames);
  const cards: Array<{ name: string; baseSetting: string }> = [];
  for (const c of valid) {
    if (seen.has(c.name)) {
      warnings.push(`人物卡「${c.name}」重名，已跳过`);
      continue;
    }
    seen.add(c.name);
    cards.push({ name: c.name, baseSetting: JSON.stringify(c.obj) });
  }
  return { cards, warnings };
}

export async function instantiateCharacters(
  deps: { db: Database; provider: LlmProvider },
  input: { bookId: string; maxCards: number },
): Promise<CharacterInstantiateDraftDto> {
  const book = booksRepo.getBook(deps.db, input.bookId)!; // 调用方已验存在且已绑定
  const p = getSpectrumProfile(deps.db, book.spectrumProfileId!);
  if (!p) throw new Error('光谱档案不存在');
  const prompt = `${INSTRUCTION}\n${p.structure.join('\n')}\n【光谱原型结束】`;
  const res = await deps.provider.complete({
    system: '你是长篇小说的人物架构师。',
    user: prompt,
    temperature: 0.3,
    topP: 0.9,
    maxOutputTokens: 4096,
    timeoutMs: 900000,
    meta: { step: 'summarize' as const },
  });
  const existing = new Set(booksRepo.listCharacters(deps.db, input.bookId).map((c) => c.name));
  return parseInstantiateOutput(res.text, existing, input.maxCards);
}
