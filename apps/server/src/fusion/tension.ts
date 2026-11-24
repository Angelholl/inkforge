/**
 * LLM 张力对照行协议（融合门 Task-03；规格 docs/design/proposal-2026-11-23-import-reconcile.md v3.1 §3.5）。
 * 纯函数：构造 prompt（截断常量模块内定值，不动 config）+ 解析协议行（非法行丢弃并计数）。
 * canned 文本中性仿形，内容无关：模块不引用任何具体设定集文本。
 */
import { LEGACY_DIM_ALIAS, STYLE_DIMENSIONS, type StyleDimension } from '@inkforge/shared';

/** 截断常量：模块内定值（冲击 #7 存证——不进 config、不随环境漂移）。 */
const HEAD_EXCERPT_CHARS = 2000; // description / outline
const BOUND_RULES_CHARS = 800; // 已绑 style rulesText
const BOUND_STRUCTURE_CHARS = 600; // 已绑 planner structure
const CANDIDATE_CHARS = 400; // 候选 rulesText / structure
const LIST_CAP = 8; // bound / candidates 各列表上限
const ROWS_CAP = 20; // 解析产出行数上限

/** 同 shared TensionRowDto 六键 + 协议层原始档案名（profileName 不透出响应，留给 routes 映射）。 */
export interface TensionRow {
  entry: string;
  mdSide: string;
  profileSide: string;
  nature: '拉扯' | '冗余' | '缺口';
  suggestion: string;
  lever: 'dim' | 'weights' | 'none';
  /** lever='dim' 时必有：∈ STYLE_DIMENSIONS 六维名（兼容旧名与视角/人称/POV 折算） */
  dim?: string;
  /** 占比类原始档案名，映射到 id 留给 routes 层 */
  profileName?: string;
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
 * 行协议：TENSION: <条目> | <MD 侧> | <档案侧> | <性质: 拉扯|冗余|缺口> | <建议偏向> | <落点>
 * 协议行 + 落点写法 + 负约束前置（仿 renderBlueprintTask :160-179 结构），描述/大纲/已绑/候选四段随后。
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
    '【输出格式】每行一条协议行，冒号后六段以竖线分隔：',
    'TENSION: <条目> | <MD 侧> | <档案侧> | <性质: 拉扯|冗余|缺口> | <建议偏向> | <落点>',
    '【落点写法】维度=<六维名，兼容旧八维名与 视角/人称/POV> / 占比=<档案名> / 门外（无法对应到具体维度或档案时写 门外）；模型给空或给不认的写法一律视为门外。',
    `【负约束】不要输出 JSON、markdown 代码块或任何解释；不要复述原文整段；每行前缀必须为 ${TENSION_PREFIX}；性质必须为拉扯/冗余/缺口三者之一；落点只能是 维度=六维名（兼容旧名与视角/人称/POV）/占比=档案名/门外 三种写法之一。`,
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

/** 落点维度名折算：新六维名原样 / 旧八维名经别名 / 视角词归并「叙述方式」；其余不认。 */
const LANDING_VIEWPOINT_WORDS = ['视角', '人称', 'POV', 'pov', '视点'];
function foldDimName(raw: string): StyleDimension | undefined {
  if ((STYLE_DIMENSIONS as readonly string[]).includes(raw)) return raw as StyleDimension;
  const alias = LEGACY_DIM_ALIAS[raw];
  if (alias) return alias as StyleDimension;
  return LANDING_VIEWPOINT_WORDS.includes(raw) ? '叙述方式' : undefined;
}

/**
 * 落点归一化：只认 维度=/占比= 两类前缀；模型给空或给不认的写法一律视为门外。
 */
function normalizeLanding(landing: string): Pick<TensionRow, 'lever' | 'dim' | 'profileName'> {
  const value = landing.trim();
  if (!value) return { lever: 'none' };
  if (value.startsWith('维度=')) {
    const dim = foldDimName(value.slice('维度='.length).trim());
    return dim ? { lever: 'dim', dim } : { lever: 'none' };
  }
  if (value.startsWith('占比=')) {
    const profileName = value.slice('占比='.length).trim();
    return profileName ? { lever: 'weights', profileName } : { lever: 'none' };
  }
  return { lever: 'none' };
}

/**
 * 逐行匹配 TENSION: 协议行；5 段兼容旧格式（落点缺省门外）、6 段取末段为落点；
 * 其余段数（含建议文本内含竖线致 >6）或性质词不在枚举 → 该行丢弃 invalid++；
 * 其余非协议行忽略不计；rows cap 20（超额合法行静默丢弃，不计 invalid）。
 */
export function parseTensionRows(text: string): { rows: TensionRow[]; invalid: number } {
  const rows: TensionRow[] = [];
  let invalid = 0;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line.startsWith(TENSION_PREFIX)) continue;
    const parts = line.slice(TENSION_PREFIX.length).split('|').map((p) => p.trim());
    if (parts.length !== 5 && parts.length !== 6) {
      invalid++;
      continue;
    }
    const landing = parts.length === 6 ? parts[5]! : '门外';
    const [entry, mdSide, profileSide, nature, suggestion] = parts as [string, string, string, string, string];
    if (!NATURES.includes(nature as (typeof NATURES)[number])) {
      invalid++;
      continue;
    }
    if (rows.length < ROWS_CAP) {
      rows.push({
        entry,
        mdSide,
        profileSide,
        nature: nature as TensionRow['nature'],
        suggestion,
        ...normalizeLanding(landing),
      });
    }
  }
  return { rows, invalid };
}
