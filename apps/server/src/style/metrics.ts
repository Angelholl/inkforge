export interface StyleMetrics {
  medianSentenceLen: number;
  p90SentenceLen: number;
  dialogueRatio: number;
  uniqueCharRatio: number;
}

function countChars(s: string): number {
  return s.replace(/\s/g, '').length;
}

/** 句切分 /[。！？；\n]+/；对话比=引号内字符数/countChars；去重字符比=去重字符数/countChars。 */
export function computeStyleMetrics(text: string): StyleMetrics {
  const sentences = text.split(/[。！？；\n]+/).filter((s) => s.trim() !== '');
  const lens = sentences.map((s) => s.length).sort((a, b) => a - b);
  const pick = (p: number) => (lens.length === 0 ? 0 : lens[Math.min(lens.length - 1, Math.floor(lens.length * p))]);
  const total = countChars(text);
  const inQuotes = [...text.matchAll(/[“"]([^”"]*)[”"]/g)].reduce((acc, m) => acc + m[1].length, 0);
  const unique = new Set(text.replace(/\s/g, '')).size;
  return {
    medianSentenceLen: pick(0.5),
    p90SentenceLen: pick(0.9),
    dialogueRatio: total === 0 ? 0 : inQuotes / total,
    uniqueCharRatio: total === 0 ? 0 : unique / total,
  };
}

/** style_drift 判定：|draft−基准|/基准 ≤0.4 → pass；基准 0 跳过；返回超带项数。 */
export function driftOverBandItems(draft: string, ref: StyleMetrics): number {
  const cur = computeStyleMetrics(draft);
  let over = 0;
  const check = (c: number, b: number) => {
    if (b === 0) return;
    if (Math.abs(c - b) / b > 0.4) over++;
  };
  check(cur.medianSentenceLen, ref.medianSentenceLen);
  check(cur.p90SentenceLen, ref.p90SentenceLen);
  check(cur.dialogueRatio, ref.dialogueRatio);
  check(cur.uniqueCharRatio, ref.uniqueCharRatio);
  return over;
}
