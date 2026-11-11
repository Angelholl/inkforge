/** 正文字数统计：去除全部空白字符后计数（与模型目标字数口径一致）。 */
export function countChars(s: string): number {
  return s.replace(/\s/g, '').length;
}
