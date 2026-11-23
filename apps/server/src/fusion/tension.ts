/**
 * LLM 张力对照行协议（融合门 Task-03；规格 docs/design/proposal-2026-11-23-import-reconcile.md v3.1 §3.5）。
 * 纯函数：构造 prompt（截断常量模块内定值，不动 config）+ 解析协议行（非法行丢弃并计数）。
 * canned 文本中性仿形，内容无关：模块不引用任何具体设定集文本。
 */

/** 截断常量：模块内定值（冲击 #7 存证——不进 config、不随环境漂移）。 */
const HEAD_EXCERPT_CHARS = 2000; // description / outline
const BOUND_RULES_CHARS = 800; // 已绑 style rulesText
const BOUND_STRUCTURE_CHARS = 600; // 已绑 planner structure
const CANDIDATE_CHARS = 400; // 候选 rulesText / structure
const LIST_CAP = 8; // bound / candidates 各列表上限
const ROWS_CAP = 20; // 解析产出行数上限

/** 同 shared TensionRowDto 五键（entry / mdSide / profileSide / nature / suggestion）。 */
export interface TensionRow {
  entry: string;
  mdSide: string;
  profileSide: string;
  nature: '拉扯' | '冗余' | '缺口';
  suggestion: string;
}

const TENSION_PREFIX = 'TENSION:';
const NATURES = ['拉扯', '冗余', '缺口'] as const;

/** 沿 render.ts headExcerpt 形态：超长截前 n 字并附省略号。 */
function headExcerpt(text: string, n: number): string {
  return text.length > n ? `${text.slice(0, n)}…` : text;
}

function capList<T>(items: T[]): { items: T[]; truncated: boolean } {
  return { items: items.slice(0, LIST_CAP), truncated: items.length > LIST_CAP };
}

function truncateNote(truncated: boolean): string {
  return truncated ? `（超额截断至 ${LIST_CAP} 条）` : '';
}

/**
 * 行协议：TENSION: <条目> | <MD 侧> | <档案侧> | <性质: 拉扯|冗余|缺口> | <建议偏向>
 * 协议行 + 负约束前置（仿 renderBlueprintTask :160-179 结构），描述/大纲/已绑/候选四段随后。
 */
export function buildTensionPrompt(args: {
  description: string;
  outline: string;
  boundStyles: Array<{ name: string; rulesText: string }>;
  boundPlanner: Array<{ kind: 'plot' | 'spectrum' | 'imitation'; name: string; structure: string }>;
  candidateStyles: Array<{ name: string; rulesText: string }>;
  candidatePlanner: Array<{ kind: 'plot' | 'spectrum' | 'imitation'; name: string; structure: string }>;
}): string {
  const boundStyles = capList(args.boundStyles);
  const boundPlanner = capList(args.boundPlanner);
  const candidateStyles = capList(args.candidateStyles);
  const candidatePlanner = capList(args.candidatePlanner);

  return [
    '【任务】对照描述/大纲产物与已绑及候选档案，列出张力对清单。',
    '【输出格式】每行一条协议行，冒号后五段以竖线分隔：',
    'TENSION: <条目> | <MD 侧> | <档案侧> | <性质: 拉扯|冗余|缺口> | <建议偏向>',
    `【负约束】不要输出 JSON、markdown 代码块或任何解释；不要复述原文整段；每行前缀必须为 ${TENSION_PREFIX}；性质必须为拉扯/冗余/缺口三者之一。`,
    `【描述】${headExcerpt(args.description, HEAD_EXCERPT_CHARS) || '（无）'}`,
    `【大纲】${headExcerpt(args.outline, HEAD_EXCERPT_CHARS) || '（无）'}`,
    `【已绑文风】${truncateNote(boundStyles.truncated)}`,
    ...boundStyles.items.map((s) => `- ${s.name}: ${headExcerpt(s.rulesText, BOUND_RULES_CHARS) || '（无）'}`),
    `【已绑参考档案】${truncateNote(boundPlanner.truncated)}`,
    ...boundPlanner.items.map((p) => `- ${p.kind}/${p.name}: ${headExcerpt(p.structure, BOUND_STRUCTURE_CHARS) || '（无）'}`),
    `【候选文风】${truncateNote(candidateStyles.truncated)}`,
    ...candidateStyles.items.map((s) => `- ${s.name}: ${headExcerpt(s.rulesText, CANDIDATE_CHARS) || '（无）'}`),
    `【候选参考档案】${truncateNote(candidatePlanner.truncated)}`,
    ...candidatePlanner.items.map((p) => `- ${p.kind}/${p.name}: ${headExcerpt(p.structure, CANDIDATE_CHARS) || '（无）'}`),
  ].join('\n');
}

/**
 * 逐行匹配 TENSION: 协议行；字段数非 5 或性质词不在枚举 → 该行丢弃 invalid++；
 * 其余非协议行忽略不计；rows cap 20（超额合法行静默丢弃，不计 invalid）。
 */
export function parseTensionRows(text: string): { rows: TensionRow[]; invalid: number } {
  const rows: TensionRow[] = [];
  let invalid = 0;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line.startsWith(TENSION_PREFIX)) continue;
    const parts = line.slice(TENSION_PREFIX.length).split('|').map((p) => p.trim());
    if (parts.length !== 5) {
      invalid++;
      continue;
    }
    const [entry, mdSide, profileSide, nature, suggestion] = parts as [string, string, string, string, string];
    if (!NATURES.includes(nature as (typeof NATURES)[number])) {
      invalid++;
      continue;
    }
    if (rows.length < ROWS_CAP) {
      rows.push({ entry, mdSide, profileSide, nature: nature as TensionRow['nature'], suggestion });
    }
  }
  return { rows, invalid };
}
