# 输出预算与续写拼接回路 实现计划

**目标：** 让 6000 字级长章在本地模型上能真正写完（自适应输出预算＋顶格截断检测＋续写拼接），并堵住人物卡注入污染这道帮凶。
**架构：** 新增两个纯函数模块（budget.ts / stitch.ts）+ 一个 roster 过滤器，全部挂在既有 pipeline/chapter.ts 调用点上；finishReason 从 provider 层贯通到落库 JSON；不动 DB schema、不动 shared 类型、不动 gate/L0 语义。
**规格：** docs/design/card-2026-11-26-output-budget-plan.md（根因与四项拍板 D1–D4 全在卡面，本计划从它论证）。

## 全局约束

- 测试基线 server 840 / web 201 **只增不减**；修 bug/改默认值必带先红后绿回归测试。
- Conventional 前缀＋中文提交正文含 verify: 行；执行者只 commit 不 push。
- T1/T2/T3 均触碰 `apps/server/src/pipeline/chapter.ts` → **同工作树串行执行**（文件互斥硬约束），顺序 T1→T2→T3。
- 本批无前端改动 → web-gui-tester 豁免，提交信息注明「GUI 未验证（无前端改动）」。
- 已决不入代码卡：D4 模型切 iq3_s（owner 已改 ~/.inkforge/config.json STRATA_MODEL，实测在线 n_ctx=393216）；本书补三张主角卡＋ch2–6 批跑 summarize＝owner UI 操作。
- 不做运行期 /models 探测：config local contextWindow 硬编码 524288 与 iq3_s 实际 393216 的差异，在现实用量（prompt ~10k＋输出预算 ≤50k）下永不触顶，clamp 用 config 值即可；此判断在 budget.ts 注释留痕。

## 任务 T1：自适应输出预算（D1）

**文件：** Create `apps/server/src/pipeline/budget.ts` / Test `apps/server/test/pipeline/budget.test.ts`
**接口：** Consumes: chapter.targetChars（chapter.ts:88 已有）、provider.promptTokensEstimate=各槽预算和（BUDGETS_DRAFT/BUDGETS_REWRITE 现有值求和）。Produces: `estimateOutputBudget(targetChars: number, promptTokensEstimate: number, provider: ProviderConfig): number`，T2 的续写调用也用它。
**钉死值：** TOKENS_PER_CHAR=4.0（实测 iq3_xxs≈3.3，跨档留安全余量）；MARGIN_TOKENS=2048；PROMPT_RESERVE_TOKENS=4096；CEILING_TOKENS=512000（owner 拍板上限）；下限 floor=1024。公式：`min(CEILING, ceil(targetChars×4.0)+MARGIN, provider.contextWindow − promptTokensEstimate − PROMPT_RESERVE)`，结果 clamp ≥floor。
**调用点改动：** chapter.ts:254 与 :379 的 `maxOutputTokens: config.providers.local.maxOutput` → `estimateOutputBudget(targetChars, <槽预算和>, config.providers[providerName])`（provider 名从现有变量取，cloud 同走此函数）。ProviderConfig 形状与 loadConfig 默认值不动（test/config.test.ts:29/:108 钉值零改动）。
**步骤：**
- [ ] 写失败测试 budget.test.ts：①6000字/local→结果≈26112（>8192，证明修复）；②小目标300字→小于8192（省资源）；③窗口被 prompt 吃满→clamp 到 floor=1024；④CEILING 生效：targetChars=200000→512000。跑 `pnpm vitest run test/pipeline/budget.test.ts` 确认红。
- [ ] 实现 budget.ts（纯函数＋常量表），同命令转绿。
- [ ] chapter.ts 两处调用点接线；跑 `pnpm vitest run test/pipeline/ test/config.test.ts` 全绿（既有 mock 测试 usage 不含 token 换算，应零波及）。
- [ ] 全量 `pnpm -C apps/server test` ≥840 只增不减。commit。

## 任务 T2：finishReason 落库＋顶格续写拼接回路（D2）

**文件：** Modify `apps/server/src/llm/mock.ts`、`apps/server/src/pipeline/chapter.ts` / Create `apps/server/src/pipeline/stitch.ts`、`apps/server/test/pipeline/stitch.test.ts`
**接口：** Consumes: provider 返回的 finishReason（types.ts:19 已有，anthropic.ts:75/:109-128 已采集——现状全 src 零消费即本卡要修的洞）。Produces: `stitchSegments(segments: string[], maxOverlapTrim = 40): string`（接缝去重＝后缀-前缀最长重叠裁剪，上限 40 字）；mock.ts MockStepBehavior 文本行为新增可选字段 `finishReason?: string`（默认 'end_turn'，现有测试零波及）。
**触发语义：** 生成调用返回 finishReason==='length'（OpenAI-compat /v1 的顶格值；Strata 即此通道）→ 以已写全文＋续写指令再发起调用（render.ts 新增 `renderStitchContinuation(writtenSoFar: string): string`，指令钉死：「从断点直接续写正文，禁止重复已写内容、禁止总结」），最多追加 **3 段**；拼接用 stitchSegments；自然收尾（end_turn）即停。整篇仍只过一次既有 L0/QC/gate（语义零改动）。
**落库（无迁移）：** draft/rewrite 版本 params_json 增 `finishReason`、`stitchSegments`（段数，未触发时缺省不写）；对应 run_steps.output_json 同步带上。gate action 判定逻辑不动——字数带 [4800,7200] 在预算修好后单发可达，rewrite 空转问题随 T1 自然消解。
**步骤：**
- [ ] 失败测试 stitch.test.ts：①stitchSegments 重叠 40 字内正确裁剪；②无重叠原样拼接；③超 40 字公共段不误裁（返回原文）。红→实现→绿。
- [ ] mock.ts 加 finishReason 覆盖字段（默认值路径跑一个断言）；chapter.test.ts 新增管线测试：draft 步 behavior.sequence=[{text:seg1,finishReason:'length'},{text:seg2,finishReason:'end_turn'}]，qc 用现有 qcPassText → 断言落库版本内容=seg1+裁剪后 seg2、draft 步恰两次调用、params_json.finishReason='length'＋stitchSegments=2。红→实现 chapter.ts 回路→绿。
- [ ] 既有 no-stitch 路径（default mock 全 end_turn）零行为变化：chapter.test.ts/continue.test.ts/generate-drift.test.ts/rewrite.test.ts 全绿即回归证明。
- [ ] 全量 ≥840+新增只增不减。commit。

## 任务 T3：characters 槽护栏（D3）

**文件：** Create `apps/server/src/pipeline/roster.ts` / Modify `apps/server/src/pipeline/chapter.ts:226-229` / Test `apps/server/test/pipeline/roster.test.ts`
**接口：** Consumes: booksRepo.listActiveCharacters 现有返回＋chapter.blueprint_json 字符串（T1/T2 后 chapter.ts 现场）。Produces: `filterRosterForChapter(cards: CharacterCard[], blueprintText: string): { cards: CharacterCard[]; warning?: string }`。
**钉死规则：** 卡 name 出现在蓝图 JSON 全文（goal/beats/mustHaveBeats 拼串）才注入；**零命中→全量注入并记 warning**「蓝图未匹配任何人物卡，已全量注入」（防抽空的保险丝——事故现场正是六张无关卡全体误注）；无新 shared 类型、无 GUI 面改动。warning 落 draft 步 run_steps.output_json（自由 JSON 通道）。
**决策留痕：** 「蓝图关键人物缺卡」不做中文人名抽取（不可靠），该检测已由 L1 QC「人物一致」blocker 通道覆盖（事故中它抓到了赵启帆/马春桃张冠李戴）——本卡只修注入侧。
**步骤：**
- [ ] 失败测试 roster.test.ts：①fixture=六张群像卡＋第7章蓝图（阿美/阿泰零命中）→全量＋warning 字符串存在；②蓝图点名「赵启帆」→仅注入该卡、无 warning；③空蓝图 JSON→全量无 warning。红→实现→绿。
- [ ] chapter.ts:226-229 接线（renderCharacterCards 入参换成过滤结果，warning push 进 draft output_json）；管线级测试补一条断言 warning 入库。
- [ ] 全量 ≥840+新增只增不减。commit。

## 任务 T4：批次收口验收（owner 真实测试点位，agent 不代跑）

前置＝T1–T3 卡级验证链各自跑绿。owner UI 操作后重跑第 7 章，读数点：
- [ ] 补主角/阿美/阿泰人物卡；ch2–6 批跑 summarize（现仅 ch1/ch7 两行）。
- [ ] 模型=iq3_s 重跑 ch7：字数落 [4800,7200]、结尾自然收束非半截句、正文人名=主角/阿美/阿泰（卡片名零渗入）、params_json.finishReason 可见且 stitchSegments 未触发（预算够）。
- [ ] L1「重复度」「人物一致」无 blocker/major；gate 不再 needs_human。

## 自审五查记录

规格覆盖：D1→T1、D2→T2、D3→T3、D4＋数据面→T4，四项拍板各有承接 ✓。步骤唯一可写：钉死值全部内嵌 ✓。类型一致：estimateOutputBudget/stitchSegments/filterRosterForChapter 前后引用一致 ✓。咬人输入五类各配测：小预算短章(T1②)、接缝重复(T2①③)、护栏抽空保险丝(T3①)、mock finishReason 默认路径(T2 mock步)、窗口吃满 clamp(T1③) ✓。比例：计划不超卡面两倍 ✓。
