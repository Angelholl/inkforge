import { describe, expect, it } from 'vitest';
import { stitchSegments } from '../../src/pipeline/stitch';

// DEC-2026-1126-07：顶格续写接缝去重——相邻段后缀-前缀最长重叠裁剪，上限 40 字；不重叠原样拼接。
describe('stitchSegments（DEC-2026-1126-07）', () => {
  it('重叠 ≤40 字：接缝最长重叠被裁剪，不丢字不重复', () => {
    expect(stitchSegments(['甲乙丙丁', '丙丁戊己'])).toBe('甲乙丙丁戊己');
    const overlap = '接缝'.repeat(20); // 恰好 40 字，等于上限
    expect(stitchSegments([`甲${overlap}`, `${overlap}乙`])).toBe(`甲${overlap}乙`);
  });

  it('无重叠：原样拼接', () => {
    expect(stitchSegments(['甲乙', '丙丁'])).toBe('甲乙丙丁');
    expect(stitchSegments(['甲', '乙', '丙'])).toBe('甲乙丙');
  });

  it('超 40 字公共段：不误裁，完整公共段保留两次（返回原文）', () => {
    const shared = '重'.repeat(41);
    expect(stitchSegments([`甲${shared}`, `${shared}乙`])).toBe(`甲${shared}${shared}乙`);
  });
});
