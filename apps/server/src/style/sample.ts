/** 采样：按 segmentChars 分块，超 maxSegments 按索引均匀取；确定性。 */
export function sampleReferenceText(text: string, opts?: { segmentChars?: number; maxSegments?: number }): string[] {
  const segmentChars = opts?.segmentChars ?? 20000;
  const maxSegments = opts?.maxSegments ?? 20;
  const blocks: string[] = [];
  for (let i = 0; i < text.length; i += segmentChars) {
    const b = text.slice(i, i + segmentChars);
    if (b.trim() !== '') blocks.push(b);
  }
  if (blocks.length <= maxSegments) return blocks;
  const picked: string[] = [];
  for (let i = 0; i < maxSegments; i++) {
    picked.push(blocks[Math.floor((i * blocks.length) / maxSegments)]);
  }
  return picked;
}

/** few-shot 滑窗均匀取（count 段，每段 minChars-maxChars），确定性。 */
export function pickFewShotSamples(text: string, opts?: { count?: number; minChars?: number; maxChars?: number }): string[] {
  const count = opts?.count ?? 12;
  const minChars = opts?.minChars ?? 200;
  const maxChars = opts?.maxChars ?? 400;
  const clean = text;
  if (clean.length < minChars) return [];
  const windows: string[] = [];
  for (let i = 0; i + minChars <= clean.length && windows.length < 1000; i += minChars) {
    const w = clean.slice(i, Math.min(i + maxChars, clean.length));
    if (w.trim() !== '') windows.push(w);
  }
  if (windows.length === 0) return [];
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    out.push(windows[Math.floor((i * windows.length) / count)]);
  }
  return out;
}
