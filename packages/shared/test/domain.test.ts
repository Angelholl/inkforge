import { describe, expect, it } from 'vitest';
import { CHAPTER_KINDS, countChars } from '../src/index';

describe('shared/domain', () => {
  it('CHAPTER_KINDS 深等于钉死序列', () => {
    expect([...CHAPTER_KINDS]).toEqual(['original', 'draft', 'revised', 'final', 'manual_edit']);
  });

  it('countChars 去空白计数', () => {
    // 计划 T00 钉值 10 为算术笔误：他推开门。(5) + 雨停了。(4) = 9（2026-11-11 执行修正记录）
    expect(countChars('他推开门。\n雨停了。')).toBe(9);
    expect(countChars('')).toBe(0);
    expect(countChars('a b\tc')).toBe(3);
  });
});
