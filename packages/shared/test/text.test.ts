import { describe, expect, it } from 'vitest';
import { BRACKET_TAG_RE, collapseWhitespace, countChars } from '../src/text';

describe('countChars', () => {
  it('空串与纯空白（含全角空格）计数为 0', () => {
    expect(countChars('')).toBe(0);
    expect(countChars(' \t\r\n\u3000')).toBe(0);
  });
  it('去全部空白后计数', () => {
    expect(countChars('甲 乙\n丙')).toBe(3);
    expect(countChars('abc')).toBe(3);
  });
});

describe('collapseWhitespace', () => {
  it('空串与纯空白归一为空串', () => {
    expect(collapseWhitespace('')).toBe('');
    expect(collapseWhitespace(' \t\r\n\u3000 ')).toBe('');
  });
  it('连续混合空白（tab/换行/全角空格）压成单空格', () => {
    expect(collapseWhitespace('甲\t乙\n  丙\u3000丁')).toBe('甲 乙 丙 丁');
  });
  it('首尾空白去除', () => {
    expect(collapseWhitespace('  甲乙  ')).toBe('甲乙');
  });
  it('无空白串原样返回', () => {
    expect(collapseWhitespace('甲乙丙')).toBe('甲乙丙');
  });
});

describe('BRACKET_TAG_RE', () => {
  it('合法标签行匹配，多空白分隔时 m[1]=resolved、m[2]=描述', () => {
    const m = BRACKET_TAG_RE.exec('[resolved]   甲乙');
    expect(m).not.toBeNull();
    expect(m![1]).toBe('resolved');
    expect(m![2]).toBe('甲乙');
  });
  it('有标签无描述段不匹配', () => {
    expect(BRACKET_TAG_RE.test('[planted]')).toBe(false);
  });
  it('未收录标签值不匹配', () => {
    expect(BRACKET_TAG_RE.test('[frozen] 甲')).toBe(false);
  });
  it('零空白分隔（标签紧贴描述）仍匹配', () => {
    const m = BRACKET_TAG_RE.exec('[planted]甲乙');
    expect(m![1]).toBe('planted');
    expect(m![2]).toBe('甲乙');
  });
});
