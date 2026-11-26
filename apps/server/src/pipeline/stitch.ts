/** 顶格续写接缝去重（DEC-2026-1126-07）：相邻段后缀-前缀最长重叠裁剪，上限 maxOverlapTrim 字；
 * 无重叠原样拼接；完整重叠超上限时不误裁、原样拼接（宁可留重复，不做半截裁剪）。 */
export function stitchSegments(segments: string[], maxOverlapTrim = 40): string {
  if (segments.length === 0) return '';
  let joined = segments[0];
  for (let i = 1; i < segments.length; i++) {
    const next = segments[i];
    // 只探测到「上限+1」：命中即说明完整重叠超上限，按约定不裁剪。
    const probe = Math.min(joined.length, next.length, maxOverlapTrim + 1);
    let overlap = 0;
    for (let n = probe; n > 0; n--) {
      if (joined.endsWith(next.slice(0, n))) {
        overlap = n;
        break;
      }
    }
    joined += overlap > 0 && overlap <= maxOverlapTrim ? next.slice(overlap) : next;
  }
  return joined;
}
