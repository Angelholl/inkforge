/** 正文字数统计：去除全部空白字符后计数（与模型目标字数口径一致）。 */
export function countChars(s: string): number {
  return s.replace(/\s/g, '').length;
}

/** 空白归一：连续空白压成单个空格并去首尾；server summarize / web 详情页双端共用。 */
export function collapseWhitespace(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/** 方括号标签行匹配：三个固定标签值加空白分隔的描述段（禁加 g 标志以免 lastIndex 带状态）；server summarize / web 详情页双端共用。 */
export const BRACKET_TAG_RE: RegExp = /^\[(planted|advanced|resolved)\]\s*(.+)$/;
