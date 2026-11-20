/**
 * 样本高频词组统计（DEC-2026-1120-06）：中文免分词，拼接样本后按非中文字符/字母切段，
 * 段内统计 2/3 字 n-gram 频次（gram 跨标点/空白/数字不成词）。count≥minCount(默认3) 才入选；
 * 排序 count 降序、同 count 长 gram 优先；入选长 gram 后剔除其完全包含的短 gram；截 top(默认20)。
 */

/** 高频词组统计默认参数：入选门槛 count≥3、截 top 20（DEC-2026-1120-06 卡面钉值）。 */
const DEFAULT_MIN_COUNT = 3;
const DEFAULT_TOP = 20;

/** 按非中文（汉字）/非字母字符切段：标点、空白、数字等一律作分隔，杜绝跨段成词。 */
function splitSegments(samples: string[]): string[] {
  const segments: string[] = [];
  for (const s of samples) {
    for (const seg of s.split(/[^A-Za-z一-鿿]+/)) {
      if (seg !== '') segments.push(seg);
    }
  }
  return segments;
}

/** 程序统计样本高频词组（纯函数，确定性）：返回 { term, count }[]，按 count 降序。 */
export function computeFreqGrams(samples: string[], opts?: { minCount?: number; top?: number }): Array<{ term: string; count: number }> {
  const minCount = opts?.minCount ?? DEFAULT_MIN_COUNT;
  const top = opts?.top ?? DEFAULT_TOP;
  const counts = new Map<string, number>();
  for (const seg of splitSegments(samples)) {
    for (let n = 2; n <= 3; n++) {
      for (let i = 0; i + n <= seg.length; i++) {
        const gram = seg.slice(i, i + n);
        counts.set(gram, (counts.get(gram) ?? 0) + 1);
      }
    }
  }
  // count≥minCount；排序 count 降序 → 同 count 长 gram 优先 → term 字典序兜底（确定性）
  const candidates = [...counts.entries()]
    .filter(([, c]) => c >= minCount)
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  // 入选长 gram 后剔除其完全包含的短 gram；截 top
  const kept: Array<{ term: string; count: number }> = [];
  for (const [term, count] of candidates) {
    if (kept.some((k) => k.term.includes(term))) continue;
    kept.push({ term, count });
    if (kept.length >= top) break;
  }
  return kept;
}

/** 高频词组统计 → 分析输入参考块（每行「词组×次数」；无入选词组返回 undefined，prompt 不加块）。 */
export function buildFreqBlock(samples: string[]): string | undefined {
  const grams = computeFreqGrams(samples);
  return grams.length > 0 ? `【样本高频词组统计（程序统计，供参考）】\n${grams.map((g) => `${g.term}×${g.count}`).join('\n')}` : undefined;
}
