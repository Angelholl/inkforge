import { DIMENSIONS, type BeatRequirement, type ChapterBlueprint, type Finding, type OutlineCardDto, type OutlineTreeDto } from '@inkforge/shared';

const LENGTH_RULE = (target: number) => `字数目标 ${target} 字，允许偏差 ±20%。`;

/** 硬规则三行：长度带 0.9-1.1 + 字数自检 + 套话禁令 + 纯正文输出。 */
export function renderHardRules(targetChars: number): string {
  return [
    '【硬规则】',
    `1. 正文字数硬约束：以 ${targetChars} 字为目标写作，落在 ${Math.round(targetChars * 0.9)} 至 ${Math.round(targetChars * 1.1)} 字之间；${Math.round(targetChars * 1.2)} 字为绝对上限，超过视为废稿。写完正文后清点一遍字数，超出区间必须自行删改到区间内再输出。`,
    '2. 严禁套话句式，包括但不限于：「不是…而是…」「这一刻，他明白了」「空气仿佛凝固」「宛如」。',
    '3. 直接输出正文，不要任何标题、解释或元信息。',
  ].join('\n');
}

/** draft 步任务段：含世界观要点、章节蓝图（goal/beats/mustHave/banned）与硬性要求。 */
export function renderDraft(input: { chapterNo: number; targetChars: number; worldview: string; blueprint: ChapterBlueprint }): string {
  const lines = [
    `【任务】撰写第 ${input.chapterNo} 章正文。${LENGTH_RULE(input.targetChars)}`,
    `【世界观要点】${input.worldview.slice(0, 100)}`,
    `【本章目标】${input.blueprint.goal}`,
    ...input.blueprint.beats.map((b, i) => `【节拍 ${i + 1}】${b}`),
    ...input.blueprint.mustHaveBeats.map((m) => `【必含节拍】${m.text}${m.grade !== undefined ? `（落地·${m.grade}级须显性词）` : ''}${m.keywords.length > 0 ? `（须出现关键词：${m.keywords.join('、')}）` : ''}`),
    ...(input.blueprint.bannedTopics.length > 0 ? [`【禁区】本章不得涉及：${input.blueprint.bannedTopics.join('；')}`] : []),
  ];
  return lines.join('\n');
}

/**
 * 人物卡渲染：每卡一块「【人物卡】姓名 + 设定行」。
 * baseSetting 为 JSON 对象 → 逐 entry「k: v」以「；」连接；'{}' → 仅名字行；非法 JSON → trim 后原文。
 * 空数组返回空串（调用方据此跳过 characters 槽）。
 */
export function renderCharacterCards(cards: Array<{ name: string; baseSetting: string }>): string {
  const blocks = cards.map((c) => {
    let setting = '';
    const raw = (c.baseSetting ?? '').trim();
    if (raw && raw !== '{}') {
      try {
        const obj = JSON.parse(raw) as Record<string, unknown>;
        if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
          setting = Object.entries(obj)
            .map(([k, v]) => `${k}: ${String(v)}`)
            .join('；');
        } else {
          setting = raw;
        }
      } catch {
        setting = raw;
      }
    }
    return setting ? `【人物卡】${c.name}\n${setting}` : `【人物卡】${c.name}`;
  });
  return blocks.join('\n');
}

/** qc 步输出协议块：评审任务 + 七维度清单 + 输出格式与示例 + 负约束。不嵌入正文（正文由槽承载）。 */
export function renderQcTask(): string {
  return [
    `【评审任务】请逐项检查以下七个维度，找出正文中存在的问题：`,
    ...DIMENSIONS.map((d) => `- ${d}`),
    `【文风贴合评准】该维以本书文风档案的规则与范例方向为基准：档案要求高直白度或高露骨度时，露骨直白的表达即为贴合；不得以「过于直白」「应改含蓄」为由出 finding 或压低 OVERALL。`,
    `【输出格式】第一行输出 OVERALL: <1-10 整数>（整体评分）；若存在问题，随后每个问题输出一块，块间以单独一行 --- 分隔，每块恰好四行：`,
    `SEVERITY: blocker|major|minor`,
    `DIMENSION: <维度名，取自上述七维度之一>`,
    `QUOTE: <从正文中原样摘录的引文>`,
    `COMMENT: <一句评审意见>`,
    `【OVERALL 锚点】1=废稿：复文、套话或剧情硬伤密集，无法修复；5=不合格：存在多项 major，人物或逻辑明显失真，须整章大改；8=可入库：至多个别 minor 瑕疵，节奏、人物与对话符合蓝图；10=范文级：无可指摘，可作展示样章。`,
    `示例：`,
    `OVERALL: 6`,
    `---`,
    `SEVERITY: major`,
    `DIMENSION: 示例维度`,
    `QUOTE: 示例引文`,
    `COMMENT: 示例评审意见`,
    `不要输出 JSON、markdown 代码块或任何解释；QUOTE 必须从正文原样摘录，不超过 30 字；无问题则只输出 OVERALL 行。`,
  ].join('\n');
}

/** rewrite 步修订指令：findings 清单嵌入。 */
export function renderRewrite(input: { findings: Finding[]; taskInstruction: string }): string {
  return [
    `【需修复的问题清单】`,
    ...input.findings.map(
      (f, i) => `${i + 1}. [${f.severity}]（${f.dimension}）引文：${f.quote}——${f.comment}`,
    ),
    `【修订要求】${input.taskInstruction}`,
    `【输出格式】直接输出修订后的完整章节正文，不要任何解释或标记。`,
  ].join('\n');
}

/** 显性词池贪心预算（D-C，DEC-2026-1122-03②）：词池作用=可执行词清单非全量字典，不得挤压任务协议（task 槽 800）。 */
export const LANDING_POOL_BUDGET_CHARS = 300;

/** task 槽尾部 recency 摘要块（DEC-2026-1120-10）：必含节拍文本+关键词（带 grade 显示落地分级）、文风铁则（rulesText 前 3 非空行）、
 *  显性词参考（落地词池，DEC-2026-1122-03②：H∪L 池随 grade 选池、300 字符贪心、居块末位让位铁则 D-D）。
 *  块全空返回 ''——无蓝图硬要求且无档案的书零污染。签名不动 renderDraft/renderRewrite（contract.test 钉其形态）。 */
export function renderTaskSummaryBlock(input: { mustHaveBeats: BeatRequirement[]; styleRulesText?: string; landingWords?: { h: string[]; l: string[] } }): string {
  const parts: string[] = [];
  if (input.mustHaveBeats.length > 0) {
    parts.push([
      '【本章硬要求】',
      ...input.mustHaveBeats.map(
        (m) => `· ${m.text}${m.grade !== undefined ? `（落地·${m.grade}级须显性词）` : ''}${m.keywords.length > 0 ? `（须出现关键词：${m.keywords.join('、')}）` : ''}`,
      ),
    ].join('\n'));
  }
  const ironRules = (input.styleRulesText ?? '').split('\n').map((l) => l.trim()).filter((l) => l !== '').slice(0, 3);
  if (ironRules.length > 0) {
    parts.push(['【文风铁则】', ...ironRules].join('\n'));
  }
  const gradeH = input.mustHaveBeats.some((m) => m.grade === 'H');
  const gradeL = input.mustHaveBeats.some((m) => m.grade === 'L');
  const lw = input.landingWords;
  const poolRaw = gradeH ? [...(lw?.h ?? []), ...(lw?.l ?? [])] : lw?.l ?? [];
  if ((gradeH || gradeL) && poolRaw.length > 0) {
    // 贪心：逐词 '、' 连接，超预算且已收词即停（至少收 1 词，D-C）
    let acc = '';
    for (const cand of poolRaw) {
      const next = acc ? `${acc}、${cand}` : cand;
      if (next.length > LANDING_POOL_BUDGET_CHARS && acc !== '') break;
      acc = next;
    }
    const hitRule = gradeH
      ? 'H级场景至少使用 1 个 H 池词或 2 个不同 L 池词；L级场景至少 1 个 L 池词。整章自然分布，不得堆砌单句。'
      : 'L级场景至少 1 个 L 池词。整章自然分布，不得堆砌单句。';
    parts.push([`【显性词参考】`, `落地词池（${gradeH ? 'H∪L' : 'L'}）：${acc}`, hitRule].join('\n'));
  }
  return parts.join('\n\n');
}

/** summarize 步指令：四段输出协议。 */
export function renderSummarize(input: { chapterNo: number; content: string }): string {
  return [
    `【待摘要正文开始】`,
    input.content,
    `【待摘要正文结束】`,
    `【输出格式】严格遵循：`,
    `SUMMARY: <不超过 120 字的本章梗概>`,
    `BEATS:`,
    `- <节拍 1>`,
    `THREADS:`,
    `- [planted] <新埋伏笔> 或 [advanced] <推进的既有伏笔> 或 [resolved] <回收的伏笔>`,
    `STATE:`,
    `角色名={"位置":"...","持有":[...]}`,
  ].join('\n');
}

function headExcerpt(text: string, n: number): string {
  return text.length > n ? `${text.slice(0, n)}…` : text;
}

function tailExcerpt(text: string, n: number): string {
  return text.length > n ? `…${text.slice(-n)}` : text;
}

/**
 * planner 蓝图任务段：行协议 + 负约束 + 书籍简介/上一章末尾/连续性摘录。
 * 协议与负约束前置，保证 task 槽 300 字预算内不被截断；context 全量由 continuity/prevTail 槽承载。
 */
export function renderBlueprintTask(args: {
  chapterNo: number;
  bookTitle: string;
  prevTail: string;
  continuityText: string;
}): string {
  return [
    `【任务】为第 ${args.chapterNo} 章拟蓝图。书名《${args.bookTitle}》。`,
    `【输出格式】`,
    `GOAL: 一句话本章目标`,
    `BEATS: 每行一条 2-4 节拍`,
    `HOOK: 结尾钩子一句`,
    `LANDING: 本章落地格，形态为 H（场景）或 L（场景），场景写具体人物事件`,
    `不要输出 JSON、markdown 代码块或任何解释；不要复述前文情节；每行前缀必须为 GOAL:/BEATS 条目/HOOK:/LANDING: 之一`,
    `【上一章末尾摘录】${tailExcerpt(args.prevTail, 30) || '（无）'}`,
    `【连续性摘要】${headExcerpt(args.continuityText, 30) || '（无）'}`,
  ].join('\n');
}

/**
 * planner 全书蓝图任务段（入口 B）：每章一块行协议 + 负约束。
 * 世界观走独立 worldview 槽（budgets.outline.worldview），任务段只承载协议保证不被截断。
 */
export function renderOutlineTask(args: { bookTitle: string; chapterCount: number }): string {
  return [
    `【任务】为《${args.bookTitle}》拟全书蓝图，共 ${args.chapterCount} 章（第 1..${args.chapterCount} 章，每章一块，章号连续）。`,
    `【输出格式】每章以「# 章号」行开头，块内：`,
    `GOAL: 一句话本章目标`,
    `BEATS: 每行一条 2-4 节拍`,
    `HOOK: 结尾钩子一句`,
    `不要输出 JSON、markdown 代码块或任何解释；不要复述世界观原文；每块必须含 GOAL/BEATS/HOOK 三行。`,
  ].join('\n');
}

/** 三级大纲树任务段：行协议 + 滚动卡区间要求 + 负约束。协议行前置保证 task 槽预算内不被截断。 */
export function renderOutlineTreeTask(args: { bookTitle: string; chapterCount: number }): string {
  return [
    `【任务】为《${args.bookTitle}》拟三级大纲树：卷 → 阶段 → 滚动执行卡，全书共 ${args.chapterCount} 章。`,
    `【滚动卡要求】每卡覆盖一段连续章号（如 第1-4章），全部卡的区间须连续铺满第 1..${args.chapterCount} 章。`,
    `【输出格式】行协议，每行前缀必须是 VOLUME:/STAGE:/CARD:/BODY: 之一：`,
    `VOLUME: <卷题>`,
    `BODY: <卷级说明>`,
    `STAGE: <阶段题>`,
    `BODY: <阶段级说明>`,
    `CARD: 第<a>-<b>章 <卡题>`,
    `BODY: <该卡写作要点>`,
    `STAGE 挂最近一个 VOLUME 之下，CARD 挂最近一个 STAGE 之下；每卷至少一个阶段，每阶段至少一张卡；不要输出 JSON、markdown 代码块或任何解释。`,
  ].join('\n');
}

/** 已有三级树缩进单行摘要（suggest 注入防重复生成/保持上层延续）。 */
export function renderOutlineTreeBrief(tree: OutlineTreeDto): string {
  const lines: string[] = [];
  for (const v of tree.volumes) {
    lines.push(`卷${v.seq}: ${v.title}`);
    for (const s of v.stages) {
      lines.push(`  阶段${s.seq}: ${s.title}`);
      for (const c of s.cards) {
        const range = c.chapterFrom !== null && c.chapterTo !== null ? `第${c.chapterFrom}-${c.chapterTo}章 ` : '';
        lines.push(`    卡: ${range}${c.title}`);
      }
    }
  }
  return lines.join('\n');
}

/** outline-check 用卡安排清单（含章号区间的卡），body 为空时不带冒号。 */
export function renderOutlineCardSchedule(cards: OutlineCardDto[]): string {
  return cards
    .map((c) => {
      const range = c.chapterTo !== null ? `第${c.chapterFrom}-${c.chapterTo}章` : `第${c.chapterFrom}章起`;
      return c.body ? `${range} ${c.title}：${c.body}` : `${range} ${c.title}`;
    })
    .join('\n');
}

/** outline-check 任务段：近 3 章摘要 vs 卡安排语义复核，自由文本报告。 */
export function renderOutlineCheckTask(args: { summariesText: string; cardsText: string }): string {
  return [
    `【任务】对照「近 3 章摘要」与「大纲卡安排」，指出正文实际进展相对大纲安排的偏离：未按卡推进、章号跳跃、情节与卡安排冲突、节奏失衡。`,
    `【输出格式】直接输出复核报告（分条列出；完全贴合则输出「无偏离」），不要 JSON、markdown 代码块或任何解释。`,
    `【近 3 章摘要】`,
    args.summariesText,
    `【大纲卡安排】`,
    args.cardsText,
  ].join('\n');
}
