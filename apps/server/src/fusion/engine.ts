/**
 * A 类剥节引擎（融合门 Task-02；规格 docs/design/proposal-2026-11-23-import-reconcile.md v3.1 §2/§3.5）。
 * 纯函数、零 LLM、零落库、内容无关：只看「消费节清单」与载体文本，不做内容猜测；
 * 只产候选与预览，剥除绝不回流解析输入（N1），同输入重跑逐字节一致（N3）。
 * 下方「规则 N」逐条对应计划 Task-02「判定规则」1–7。
 */

export interface FusionCarriers {
  /** listCharacters 的 base_setting JSON 串拼接 */
  charactersText: string;
  /** books.outline */
  outlineText: string;
  /** chapters 蓝图 goal 拼接 */
  blueprintGoalsText: string;
  /** listForeshadowings 的 description 拼接 */
  foreshadowingsText: string;
  /** 本书已绑 style 档案 style_sources.text 拼接 */
  styleSourcesText: string;
}

/** 同 shared FusionAClassRowDto 六键（heading / verdict / preset / removable / strippableLines / residualLines）。 */
export interface FusionAClassRow {
  heading: string;
  verdict: 'fully-carried' | 'partially-carried' | 'not-carried';
  preset: 'strip' | 'keep';
  removable: boolean;
  strippableLines: string[];
  residualLines: string[];
}

export interface FusionAClassResult {
  rows: FusionAClassRow[];
  previewDescription: string;
  headWindowWarn: boolean;
}

/** 规则 1：归一化 = 去全部空白字符；空行不参与判定。 */
function normLine(s: string): string {
  return s.replace(/\s+/g, '');
}

/** 规则 2：五类载体各自归一化后作为命中底本。 */
function carrierNorms(carriers: FusionCarriers): string[] {
  return [
    carriers.charactersText,
    carriers.outlineText,
    carriers.blueprintGoalsText,
    carriers.foreshadowingsText,
    carriers.styleSourcesText,
  ].map(normLine);
}

/**
 * 片段级承载判定：仅对 consumedHeadings 中的节产行（载体驱动，无节表、无内容猜测）。
 * 节的行由调用方以 refineForDescription(节原文) 精炼后传入，与 description 同形。
 */
export function computeFusionRows(input: {
  description: string;
  sections: Array<{ heading: string; lines: string[] }>;
  consumedHeadings: string[];
  carriers: FusionCarriers;
}): FusionAClassResult {
  const { description, sections, consumedHeadings, carriers } = input;
  const consumed = new Set(consumedHeadings);
  const norms = carrierNorms(carriers);

  // 规则 5（N4 头窗保护双保险）：首标题行之前的行（H1 题名行 + 定位句 blockquote）恒不可剥。
  // 精炼文标题行保留题面（settings-import.ts:121），故按题面 trim 全等找首节定位界。
  const headingTexts = new Set(sections.map((s) => s.heading));
  const descLines = description.split('\n');
  const firstHeadingIdx = descLines.findIndex((l) => headingTexts.has(l.trim()));
  const headNorms = new Set<string>();
  if (firstHeadingIdx > 0) {
    for (let i = 0; i < firstHeadingIdx; i++) {
      const n = normLine(descLines[i] ?? '');
      if (n !== '') headNorms.add(n);
    }
  }

  const rows: FusionAClassRow[] = [];
  for (const sec of sections) {
    if (!consumed.has(sec.heading)) continue; // 清单未命中 → 不产行
    const strippableLines: string[] = [];
    const residualLines: string[] = [];
    for (const line of sec.lines) {
      const n = normLine(line);
      if (n === '') continue; // 规则 1：空行不参与
      // 规则 2：归一化后作为子串出现在任一载体即「承载」。
      // 规则 4：标签行（如「**X**：一句话」）解析器有意跳过不成卡 → 天然不承载 → 残段保留。
      const carried = norms.some((c) => c.includes(n));
      if (carried && !headNorms.has(n)) strippableLines.push(line);
      else residualLines.push(line);
    }

    // 规则 3：全部参与行承载=fully；部分=partially；零=not-carried 且 removable=false。
    // 规则 4：仅 fully-carried 预置 strip，其余 keep（残段不剥）。
    const verdict: FusionAClassRow['verdict'] =
      strippableLines.length === 0
        ? 'not-carried'
        : residualLines.length === 0
          ? 'fully-carried'
          : 'partially-carried';
    rows.push({
      heading: sec.heading,
      verdict,
      preset: verdict === 'fully-carried' ? 'strip' : 'keep',
      removable: strippableLines.length > 0,
      strippableLines,
      residualLines,
    });
  }

  // 规则 7：预览 = 按当前 preset 合成的剥除稿。
  const stripHeadings = rows
    .filter((r) => r.preset === 'strip' && r.removable)
    .map((r) => r.heading);
  // 未消费节本身无可剥行，但可能夹在所选节之间：以空 stub 把它们一并作为段尾边界交给
  // applyStripping，防跨节同文本短行被误删；stub 不进产出的 rows（不产行钉）。
  const boundaryRows: FusionAClassRow[] = sections
    .filter((s) => !consumed.has(s.heading))
    .map((s) => ({
      heading: s.heading,
      verdict: 'not-carried',
      preset: 'keep',
      removable: false,
      strippableLines: [],
      residualLines: [],
    }));
  const previewDescription = applyStripping(description, [...rows, ...boundaryRows], stripHeadings);

  // 规则 6：planner task 头窗约 90 字；剥除稿前 90 字与原前 90 字不同则显式示警。
  const headWindowWarn = previewDescription.slice(0, 90) !== description.slice(0, 90);
  return { rows, previewDescription, headWindowWarn };
}

/**
 * 规则 7（限段删除，主审对码修正 11-24）：按标题行定位节段，只删该段内命中该节 strippableLines 的行。
 * 标题行（trim 全等）与下一标题行（H2/H3 同法）或文末为段界；标题行本身与段外行逐字节保留。
 * 尾处理与 refineForDescription 同形，确定性钉（N3）。
 */
export function applyStripping(
  description: string,
  rows: FusionAClassRow[],
  stripHeadings: string[],
): string {
  const lines = description.split('\n');
  const headingSet = new Set(rows.map((r) => r.heading));
  const headingIdx = lines
    .map((l, i) => (headingSet.has(l.trim()) ? i : -1))
    .filter((i) => i >= 0);

  const drop = new Set<number>();
  for (const heading of stripHeadings) {
    const row = rows.find((r) => r.heading === heading);
    if (!row) continue;
    // 定位所选节标题行；找不到锚点则整节跳过（安全侧：宁可不剥，不误删段外行）。
    const start = headingIdx.find((i) => lines[i]?.trim() === heading);
    if (start === undefined) continue;
    const end = headingIdx.find((i) => i > start) ?? lines.length;
    const strippable = new Set(row.strippableLines.map(normLine).filter((n) => n !== ''));
    for (let i = start + 1; i < end; i++) {
      if (strippable.has(normLine(lines[i] ?? ''))) drop.add(i);
    }
  }

  return lines
    .filter((_, i) => !drop.has(i))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
