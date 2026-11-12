import { DIMENSIONS, type ChapterBlueprint, type Finding } from '@inkforge/shared';

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
    ...input.blueprint.mustHaveBeats.map((m) => `【必含节拍】${m.text}（须出现关键词：${m.keywords.join('、')}）`),
    ...(input.blueprint.bannedTopics.length > 0 ? [`【禁区】本章不得涉及：${input.blueprint.bannedTopics.join('；')}`] : []),
  ];
  return lines.join('\n');
}

/** qc 步送审段：七维度 + 输出协议 + 待审正文全文嵌入。 */
export function renderQc(input: { draft: string; blueprint: ChapterBlueprint; continuityText: string }): string {
  return [
    `【待审正文开始】`,
    input.draft,
    `【待审正文结束】`,
    `【本章目标】${input.blueprint.goal}`,
    `【连续性基线】${input.continuityText || '（无）'}`,
    `【评审维度】（逐项检查）：`,
    ...DIMENSIONS.map((d) => `- ${d}`),
    `【输出格式】第一行 OVERALL: <1-10 整数>；随后每个问题一块，块间以单独一行 --- 分隔，每块四行：`,
    `SEVERITY: blocker|major|minor`,
    `DIMENSION: <维度名>`,
    `QUOTE: <从正文中原样摘录的引文>`,
    `COMMENT: <一句评审意见>`,
    `无问题则只输出 OVERALL 行。`,
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
