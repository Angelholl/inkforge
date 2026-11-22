# 显性度注入修复（四方向） 实现计划

**目标：** 修复「源书露骨密度 113–179/万字 → 生成正文 revised 仅 43.4/万字」的改写回路衰减：①改写端喂 few-shot 样本+QC 评准防含蓄化（主因）；②H/L 落地词池进 prompt，把「须显性词」变成可执行词清单；③few-shot 绑定默认开、重绑不再静默归零；④蒸馏加「尺度」维。四方向对症同一病根：露骨度载体（样本/词池/尺度画像）只进了 draft 端，改写端与蒸馏端全线缺失。

**架构：** 全部在既有槽位/开关/词表设施上做增量接线，零 DB 迁移——
- ① targeted 重写槽补 `styleDims`/`fewShot`（full 模式早已透传，chapter.ts:350-351；主因精确定位=QC 仅 major 时走 targeted，此时改写端零样本零画像，chapter.ts:332-336）；`renderQcTask` 加静态文风贴合评准线；rewrite 任务指令加防抄护栏（D-A 决断：plagiarism 检查器零改动）。
- ② `renderTaskSummaryBlock`（draft 与 rewrite task 共用单点，chapter.ts:240/:330）渲染【显性词参考】块，300 字符贪心预算（D-C 决断），落块尾、文风铁则之后（D-D 决断：铁则不得被词池挤出）；词表装载零改动（landing-words.ts 不动，chapter.ts:90 已按 run 装载）。
- ③ `books.ts` 两处绑定路径 `style_fewshot_on` 归零改置 1（解绑保持 0，D-B 决断）；列 DEFAULT 0 不动；UI 文案同步。
- ④ `STYLE_DIMENSIONS` 七→八维（「尺度」插「情感基调」后）；蒸馏指令八维+露骨用词证据要求；存量档案=owner UI 手动重蒸（saveStyleProfile 同 source_hash version+1），不写批量重蒸脚本（档案个位数、UI 单次即可、避免无人 review 的批量写）。

**规格：** docs/decision-log.md **DEC-2026-1122-03**（占位待归档：owner 2026-11-22 晚拍板四方向「全做」）；背景实测（23 露骨词/万字同口径）：源书 113–179；仙家档案 rules 文本 177.7（内含高硬规则）；ch1 版本链 draft 242 → revised 43.4（改写回路砍 3-5 倍）。

## 事实基线与修正（对本卡面背景的复核结果）

- **修正①：** 「rewriter 槽只透传 styleRules、不透传 few-shot（targeted/target 模式）」不准确——targeted 模式只透传 styleRules（chapter.ts:333-336）；**target/full 模式已透传 styleDims+fewShot**（chapter.ts:350-351，fewShotBlock 同一变量）。主因=常规 QC 结果（仅 major）走 targeted，改写端零样本零画像；full 模式的暴露另有病因（QC findings 方向压含蓄+温度 0.7），由任务 07 评准线对症。
- **修正②：** 「revised 版本 style_sample_ids_json=[] 证明改写端没吃样本」——该字段是记账字段：`appendChapterVersion` 的 revised 落库（chapter.ts:372-381）从不传 styleSampleIds，draft 才传（:269）。它不构成 prompt 内容证据；真正证据=rewrite prompt 装配处 targeted 分支无 fewShot 槽。
- 其余行号复核一致：books.ts:123/:144（归零 SQL）、BookDetailPage.tsx:897-921（开关区块，hint 文案在 :918-920）、l0.ts:104-114（hasLongCopy）/:178-197（beat_coverage 词表 AND 层）、render.ts:90-107（renderTaskSummaryBlock；「须显性词」标签另在 renderDraft:22）、domain.ts:3-11（QC 七维含「文风贴合」）、analysis.ts:15-22（蒸馏七维）、merge.ts:36-37+distill.ts:40-41（freqTerms 仅展示）、api.ts:400（STYLE_DIMENSIONS）、config.ts:101-112（槽预算 1600/1000/2500）、rewrite 温度 0.7（chapter.ts:360）vs draft 0.9（:249）。
- plagiarism 覆盖面（D-A 查证）：`runL0Checks` 在 QC 循环**每轮**以 `currentVersion.content` 为对象（chapter.ts:283-294），首轮=draft、重写轮=revised（:384 currentVersion=revised）→ **draft 与 revised 全查**；referenceTexts=注入样本，不看 fewshot 开关（:290-292，generate 模式）。

### 设计决断记录（owner 授权本计划定断，执行时不得擅改）

- **D-A plagiarism 定断：** 检查器零改动（≥15 连续字对 draft 与 revised 全程硬拦）。防「改写端吃样本后被误咬」走 prompt 护栏：注入 fewShot 时任务指令追加「不得复用其中连续 15 字以上原文」。理由：查抄是防逐字搬运底线；误咬失败形态=hardFail→full 重写→maxRounds=2 封顶→needs_human，可见非静默，owner 可裁决样本摘录方式。
- **D-B 重绑语义定断（最小惊讶）：** 绑定/重绑 → `style_fewshot_on=1`（绑定档案的意图即吃档案，few-shot 是档案主载体）；解绑 → 0（无档案时开关无意义）；手动关闭被尊重直至下次重绑；新建未绑定书保持列默认 0（不做迁移）。
- **D-C 词池预算定断：** 常量 `LANDING_POOL_BUDGET_CHARS = 300`，贪心填充（H 池在前 L 池在后、'、'连接、至少收 1 词、超预算即停）。依据：l0 AND 层仅要求「≥1 H 词或 ≥2 不同 L 词」（l0.ts:191-192），词池作用=可执行词清单非全量字典；task 槽预算 800（config.ts:111/:135），硬要求块+词池不得挤压任务协议。
- **D-D 词池/铁则次序定断（critic 条件 2，主模型 2026-11-22 裁决=顺序对调+双钉，未选预算 800→1100）：** 【显性词参考】块渲染在【文风铁则】**之后**、块末位。依据：task 槽 keep:'head' 从尾截，词池（辅助可执行清单，l0 闸门仍兜底）须先于文风铁则（每书风格核心）让位。钉法双保险：任务 08 契约测试次序断言 + 任务 09 管线 4 节拍挤压断言。

## 全局约束

- 测试基线 **636**（server 480 + web 154 + shared 2，cb82be9 后 `pnpm -r test` 全绿实测，主会话 2026-11-22 23:00）只增不减。
- 每卡验收命令**必含 typecheck**；全链=lint→定向→全量→typecheck→knip。
- **1301 纪律：** 卡面与测试夹具不得抄录真实露骨词——词表语义抽象化（[H]=插入交合类、[L]=口类）；夹具中性词沿 l0.test 先例（玉佩光/铜镜摇/窗棂摇，l0.test.ts:182/:242）；不得读 `apps/server/data/**` 与用户真实词表 `~/.inkforge/landing-words.txt`。
- **禁入卡型=数据库迁移/核心路由重构：** 零 SQL 迁移（style_fewshot_on 列已存在，DEFAULT 0 不动——默认开由绑定路径写入而非列默认；尺度维落 rules_json.dims JSON 不加列）。若执行中论证必须迁移→停手单列成卡，标注走 ZCode 通道不走 hy4。
- 执行卡派 opencode/hy4-flash-free（限时窗内）；卡面自足；执行者只 commit 不 push；同工作树 ≤1 卡，按任务序串行（03→04→05、07→08、10→11 为强依赖）。
- GUI 变更卡（任务 03）提交信息注明「GUI 未验证（owner 真实测试）」；点位清单进收口。
- 本批不发版；无新资源文件（默认词表/模板/NSIS 均不涉及）。
- 词表装载语义不动：空表/缺失=fail-open；`resolveLandingWordsPath`/`parseLandingWordsText`/`loadLandingWords` 签名零改动，landing-words.ts 本批零改动。
- 抄用检测语义不动（见 D-A）；l0 全部检查项与 gate/chooseRewriteMode 逻辑零改动。

---

## 任务 01 [方向③] 绑定路径 few-shot 默认开（repo 层）

**文件：** Modify `apps/server/src/db/repositories/books.ts`；Modify `apps/server/test/db/repositories.test.ts`。

**根因：** setBookStyleProfile（books.ts:115-129，SQL :123）与 setBookStyleBinding（:141-175，SQL :144）无条件 `style_fewshot_on = 0`（B4 裁决④「新绑定默认关」）——重绑静默吃掉用户开着的开关，且绑定后默认关=改写端/draft 端样本注入被双重门控。

**接口（Produces）：**
```ts
// setBookStyleProfile(db, bookId, profileId: string | null, snapshot?) —— 签名不变
//   SQL 改：style_fewshot_on = ?（参数化），值 = profileId === null ? 0 : 1
// setBookStyleBinding(db, bookId, binding: StyleBinding | null, snapshotJson: string | null) —— 签名不变
//   SQL 改：style_fewshot_on = ?（参数化），值 = binding ? 1 : 0
// 两处注释 B4 裁决④ → DEC-2026-1122-03③（绑定/重绑置 1、解绑置 0、列 DEFAULT 0 不动）
```

**步骤：**
- [ ] 测试先红：repositories.test.ts:213 用例改名「setBookStyleBinding/getBookStyleBinding 往返：主辅行+dims 映射+绑定默认开 fewshot」；:215 `booksRepo.setBookFewshot(db, bid, true)` 改为 `setBookFewshot(db, bid, false)`（先手动关，证明绑定强制置 1，断言更有力）；:220 `expect(b.styleFewshotOn).toBe(false)` → `toBe(true)`。:250 解绑用例不动（:253 binding=null → :258 `toBe(false)` 仍成立=解绑置 0 语义留痕）
- [ ] books.ts :121-128：绑定前算 `const fewshotOn = profileId === null ? 0 : 1;`，SQL 改 `..., style_fewshot_on = ?, ...` 五参（profileId, snapshotJson, fewshotOn, ts, bookId），注释改 DEC-2026-1122-03③——绿
- [ ] books.ts :141-149：同式 `const fewshotOn = binding ? 1 : 0;`，SQL 同改，:131 函数 doc 注释同步（「重绑/解绑均归零」→「绑定/重绑置 1、解绑置 0」）
- [ ] 验收：`pnpm --filter @inkforge/server test -- test/db/repositories.test.ts` 绿 + `pnpm --filter @inkforge/server typecheck` 0 错
- [ ] 已知连锁（不修，任务 02 接）：`test/http/style.test.ts` 与 `test/pipeline/continue.test.ts` 此时预期红

## 任务 02 [方向③] 绑定语义翻转的测试改钉（http + continue 管线）

**文件：** Modify `apps/server/test/http/style.test.ts`；Modify `apps/server/test/pipeline/continue.test.ts`。依赖：任务 01。

**步骤：**
- [ ] style.test.ts:290 用例改名「PUT style-fewshot：默认关 → 开 → 绑定/重绑置 1、解绑归零；非法 body 400、未知书 404」；:302-305 绑定后 GET 断言 `styleFewshotOn` `toBe(false)` → `toBe(true)`（重绑归零→置 1 的语义翻转留痕：断言行尾注释改 DEC-2026-1122-03③）；:308-311 解绑段断言 `toBe(false)` 保持；:322 用例名「…fewshot 归零」→「…fewshot 置 1」，:344-345 `expect(row.style_fewshot_on).toBe(0)` → `toBe(1)`——先红后绿（任务 01 已绿本体，此处改钉即绿）
- [ ] continue.test.ts:87 `setBookStyleProfile(db, bookId, 'mock-profile')` 之后追加一行 `setBookFewshot(db, bookId, false);`（setBookFewshot 已在该文件 :124 使用过，import 已存在）；:59 用例名括注「fewshot 关不注入范例片段」语义保持（显式关=off 分支覆盖不丢）；:116 `expect(draft.user).not.toContain('【范例片段】')` 保持绿
- [ ] 验收：`pnpm --filter @inkforge/server test -- test/http/style.test.ts` 绿 + `pnpm --filter @inkforge/server test -- test/pipeline/continue.test.ts` 绿 + `pnpm --filter @inkforge/server typecheck` 0 错

## 任务 03 [方向③] UI 文案同步（toast + 开关说明）

**文件：** Modify `apps/web/src/pages/BookDetailPage.tsx`；Modify `apps/web/src/pages/BookDetailPage.test.tsx`。依赖：任务 01（语义真值源）。

**改动点：**
- BookDetailPage.tsx:486 绑定 toast：`'风格档案已绑定；绑定保存后文风示例开关已归零'` → `'风格档案已绑定；文风示例注入已默认开启（可手动关闭）'`；:485 行注释「保存成功显性化 fewshot 归零，不静默」→「保存成功显性化 fewshot 默认开，不静默」
- BookDetailPage.tsx:918-920 开关 hint：`关闭后不向写手注入范文片段；抄用检测仍以绑定样本为参考，不随开关关闭。新绑定默认关。` → `新绑定/重绑默认开启；关闭后不向写手注入范文片段；抄用检测仍以绑定样本为参考，不随开关关闭。`
- BookDetailPage.test.tsx:111 桩注释「模拟服务端归零语义」→「模拟服务端绑定默认开语义」；:437 用例内 :448 `expect(cb.checked).toBe(false); // 绑定即归零（服务端语义），所以此刻未勾` → `expect(cb.checked).toBe(true); // 绑定默认开（DEC-2026-1122-03③ 服务端语义）`（桩在 PUT 绑定后回读 fewshot=true，与真实服务端一致）
- BookDetailPage.test.tsx 新增用例「绑定成功 toast 显性化默认开启」：沿该文件 bindStyle mock 形态触发绑定成功 → `await screen.findByText('风格档案已绑定；文风示例注入已默认开启（可手动关闭）')` 断言非空——先红

**步骤：**
- [ ] 测试先红（新用例 + :448 翻转）
- [ ] 实现两处文案——绿
- [ ] 验收：`pnpm --filter @inkforge/web test` 绿 + `pnpm --filter @inkforge/web typecheck` 0 错；**GUI 未验证（owner 真实测试）**，提交信息注明

## 任务 04 [方向①] targeted 重写槽补 styleDims/fewShot（config + rewrite.ts）

**文件：** Modify `apps/server/src/config.ts`；Modify `apps/server/src/pipeline/rewrite.ts`。

**接口（Produces）：**
```ts
// config.ts RewriteBudgets（:37-44）追加两键：
//   styleDims: number; fewShot: number;
// BUDGETS_REWRITE（:129-136）追加：styleDims: 1600, fewShot: 2500   ← 与 draft 槽对齐（config.ts:106/:110）
// rewrite.ts buildRewriteSlots targeted 分支（:58-71）styleRules 槽之后插入：
//   if (input.styleDims && input.styleDims.length > 0)
//     slots.push({ name: 'styleDims', content: input.styleDims, budgetChars: budgets.styleDims, stable: true,  keep: 'head' });
//   if (input.fewShot)
//     slots.push({ name: 'fewShot',   content: input.fewShot,   budgetChars: budgets.fewShot,   stable: false, keep: 'head' });
// RewriteSlotsInput（:17-33）已有 styleDims?/fewShot? 字段，零改动；full 分支（:36-52）零改动
```

**步骤：**
- [ ] config.ts：RewriteBudgets 接口加两键；BUDGETS_REWRITE 加 `styleDims: 1600, fewShot: 2500`（行尾注释 DEC-2026-1122-03①：targeted 补画像与样本槽，预算对齐 draft）
- [ ] rewrite.ts：targeted 分支插入两段条件槽（位置=styleRules push 之后、original push 之前）；:61 注释「B1：targeted 重写同样注入风格精简槽」补「；styleDims/fewShot 同（DEC-2026-1122-03①）」
- [ ] 验收：`pnpm --filter @inkforge/server typecheck` 0 错 + `pnpm --filter @inkforge/server exec vitest run test/pipeline/rewrite.test.ts` 中既有 targeted 槽名集断言（:61/:104）预期红——**两断言改钉在任务 06**（04→05→06 强依赖串行，卡间红线预期）

## 任务 05 [方向①] chapter.ts 接线：targeted 入参 + 防抄护栏

**文件：** Modify `apps/server/src/pipeline/chapter.ts`。依赖：任务 04。

**改动点：**
- :332-336 targeted 分支 `buildRewriteSlots` 入参对象补两键：`styleDims: styleDimsText || undefined, fewShot: fewShotBlock`（与 full 分支 :350-351 同源同变量，fewShotBlock 仍受 style_fewshot_on 门控 :210-213）
- :323 附近（clicheFix/echoFix 声明区）加护栏常量：
  `const fewShotGuard = fewShotBlock ? '范例片段仅供腔调与尺度参照，不得复用其中连续 15 字以上的原文（去空白比对，plagiarism 闸门硬拦）。' : '';`
- :328 targeted 与 :329 full 两条 taskInstruction 模板串：`${echoFix}${clicheFix}${landingPreserve}` → `${fewShotGuard}${echoFix}${clicheFix}${landingPreserve}`（两条都加：full 模式任务 05 前就吃样本，护栏补历史缺口）
- 注释同步：:207 「targeted 只补 styleRules 精简槽」→「targeted 补 styleRules+styleDims+fewShot 精简槽（DEC-2026-1122-03①）」；:209 B4 注释尾补「；绑定默认开由 DEC-2026-1122-03③ 落地」

**步骤：**
- [ ] 三处代码改动 + 两处注释（逐字对照上方改动点）
- [ ] 验收：`pnpm --filter @inkforge/server typecheck` 0 错（集成断言在任务 06）

## 任务 06 [方向①] 改写端测试（槽装配 + 管线集成）

**文件：** Modify `apps/server/test/pipeline/rewrite.test.ts`；Modify `apps/server/test/pipeline/chapter.test.ts`。依赖：任务 04、05。

**步骤：**
- [ ] rewrite.test.ts:49 用例改名「targeted 未传 styleDims/fewShot → 槽名集维持精简集」，:61 断言 `['hardRules','original','findings','factBaseline','task']` 保持（兜底证不传不插、零回归）；:91 styleRules 用例 :104 断言保持
- [ ] rewrite.test.ts 新增用例「targeted 传入 styleDims+fewShot → 双槽插 styleRules 后」：入参补 `styleDims: '【文风画像】\n· 尺度：高直白度', fewShot: '【范例片段】\n样本'` → 断言槽名集精确等于 `['hardRules','styleRules','styleDims','fewShot','original','findings','factBaseline','task']`；`slots.find(s=>s.name==='styleDims')!.stable===true` 且 `budgetChars===1600`；`slots.find(s=>s.name==='fewShot')!.stable===false` 且 `budgetChars===2500`——先红，任务 04 实现后绿
- [ ] chapter.test.ts:276 用例改名「重写轮（targeted 关 fewshot）：rewrite system 含 styleRules 精简槽+文风画像、无范例片段（DEC-2026-1122-03①）」——**此用例含计划外翻钉（critic 条件 1）**：夹具 boundProfileBook('b') 走裸 SQL :229 不经绑定路径，fs=0 → fewShotBlock=undefined 不变；但 styleDimsText 不受 fs 门控（chapter.ts:208 只判 dims&&axes，夹具 rules_json 带非空 dims+axes）→ 任务 05 接线后 targeted system 新增 stable styleDims 槽（assembler.ts:29）→ 既有 :296 `expect(rw.system).not.toContain('【文风画像】')` 必红。改钉：:295 `toContain('【风格规则】')` 保持；:296 → `expect(rw.system).toContain('【文风画像】')`；勿改共享夹具（:257/:302 用例依赖现状 dims 内容）
- [ ] chapter.test.ts 新增用例「重写轮（targeted 开 fewshot）：rewrite user 含【范例片段】且 system 含【文风画像】（DEC-2026-1122-03①）」：`boundProfileBook('tfew')` + `db.prepare('UPDATE books SET style_fewshot_on = 1 WHERE id = ?').run(bid)`（沿 :259 先例）+ 沿 :279-290 同款 majorQc mock → 断言 `rw.system).toContain('【文风画像】')`、`rw.user).toContain('【范例片段】')`、`rw.user).toContain('不得复用其中连续 15 字以上的原文')`（护栏断言）——先红，任务 05 后绿
- [ ] chapter.test.ts:302 注释改钉：「不动 style_fewshot_on：迁移 DEFAULT 0 = 默认关（B4 裁决④）」→「夹具裸 SQL 置 style_profile_id 不经绑定路径 → 保持列默认 0；绑定即置 1 由 repositories/style 测试钉（DEC-2026-1122-03③）」；:304 断言 `toBe(0)` 保持
- [ ] 验收：`pnpm --filter @inkforge/server test -- test/pipeline` 全绿 + `pnpm --filter @inkforge/server typecheck` 0 错

## 任务 07 [方向①] QC 文风贴合评准线（render.ts + contract）

**文件：** Modify `apps/server/src/prompts/render.ts`；Modify `apps/server/test/prompts/contract.test.ts`。

**改动点：** renderQcTask（render.ts:57-76）维度清单行（:60）之后、【输出格式】行（:61）之前插入一行静态评准（无槽位/无预算变化，books 无档案时为中性方向指引）：
`【文风贴合评准】该维以本书文风档案的规则与范例方向为基准：档案要求高直白度或高露骨度时，露骨直白的表达即为贴合；不得以「过于直白」「应改含蓄」为由出 finding 或压低 OVERALL。`
（1301 纪律：全句零真实露骨词。）

**步骤：**
- [ ] contract.test.ts 先红：新增用例「renderQcTask：文风贴合评准线钉死方向（DEC-2026-1122-03①）」——`const out = renderQcTask();` 断言 `toContain('【文风贴合评准】')`、`toContain('露骨直白的表达即为贴合')`、`toContain('不得以「过于直白」')`；既有 :41-44 「不嵌入正文」用例保持绿
- [ ] render.ts 实现插行——绿
- [ ] 验收：`pnpm --filter @inkforge/server test -- test/prompts` 绿 + `pnpm --filter @inkforge/server typecheck` 0 错

## 任务 08 [方向②] 显性词池进 renderTaskSummaryBlock（render.ts + contract）

**文件：** Modify `apps/server/src/prompts/render.ts`；Modify `apps/server/test/prompts/contract.test.ts`。依赖：任务 07（同文件串行）。

**接口（Produces）：**
```ts
export const LANDING_POOL_BUDGET_CHARS = 300; // 词池贪心预算（D-C）
// renderTaskSummaryBlock input 追加可选键（结构化类型，不 import quality 层）：
//   landingWords?: { h: string[]; l: string[] }
// 渲染规则（插在【文风铁则】part 之后、块末位——D-D 定断）：
//   const gradeH = mustHaveBeats.some(m => m.grade === 'H');
//   const gradeL = mustHaveBeats.some(m => m.grade === 'L');
//   有 landingWords 且 (gradeH || gradeL) 且词池非空 才产出；pool = gradeH ? [...h, ...l] : l（与 l0.ts:184 H 判定池同构）
//   贪心：acc 逐词 '、' 连接，cand.length > 300 且 acc 非空即停（至少收 1 词）
//   产出三行块：【显性词参考】\n落地词池（H∪L|L）：<acc>\n<命中口径句>
//   命中口径句：gradeH → 'H级场景至少使用 1 个 H 池词或 2 个不同 L 池词；L级场景至少 1 个 L 池词。整章自然分布，不得堆砌单句。'
//              否则   → 'L级场景至少 1 个 L 池词。整章自然分布，不得堆砌单句。'
//   无 landingWords / 无 grade 条目 / 词池空 → 不产出（零污染，fail-open 镜像 l0.ts:180-186）
```

**步骤：**
- [ ] contract.test.ts 先红，新增六例（夹具词全中性）：① grade H + `{h:['玉佩光'], l:['铜镜摇','窗棂摇']}` → contains '【显性词参考】'、'落地词池（H∪L）：玉佩光、铜镜摇、窗棂摇'、'2 个不同 L 池词'；② 仅 grade L → 词池段不含 '玉佩光' 且含 '窗棂摇'；③ 不传 landingWords（既有 :160-169 用例形态）→ not contains '【显性词参考】'（向后兼容回归钉）；④ 预算截断：`{h: Array.from({length:120}, (_,i)=>\`玉光甲${i}\`), l: []}` → 提取 '落地词池' 行冒号后段 `acc`，断言 `acc.length <= 300` 且 `acc.startsWith('玉光甲0')` 且 acc 含 '、'（多词）；⑤ 词池全空 `{h:[],l:[]}` + grade H → not contains '【显性词参考】'；⑥ 次序钉（D-D）：与①同输入 → `out.indexOf('【文风铁则】') < out.indexOf('【显性词参考】')`（词池块末位）
- [ ] render.ts 实现常量+签名扩展+渲染逻辑（逐字对照接口块）——绿
- [ ] 验收：`pnpm --filter @inkforge/server test -- test/prompts` 绿 + `pnpm --filter @inkforge/server typecheck` 0 错

## 任务 09 [方向②] chapter.ts 词池接线 + 管线断言

**文件：** Modify `apps/server/src/pipeline/chapter.ts`；Modify `apps/server/test/pipeline/chapter.test.ts`。依赖：任务 05（chapter.ts 串行）、任务 08。

**步骤：**
- [ ] chapter.ts :240 draft：`renderTaskSummaryBlock({ mustHaveBeats: blueprint.mustHaveBeats, styleRulesText: styleRulesText })` → 追加 `landingWords`（属性简写；变量 :90 已装载，零新增 I/O）
- [ ] chapter.ts :330 rewrite：`renderTaskSummaryBlock({ mustHaveBeats: blueprint.mustHaveBeats, styleRulesText: styleRulesText })` → 同式追加 `landingWords`（改写端同吃词池=改写不丢显性词）
- [ ] chapter.test.ts 先红新增用例「grade H 章 + 用户词表 → draft 与 rewrite task 均含【显性词参考】（DEC-2026-1122-03②）」：**新 describe 块追加在文件末尾**（beforeAll 设 env、afterAll 删 env，防同文件先行/后续用例受 env 污染）；beforeAll 内 `process.env.INKFORGE_LANDING_WORDS_USER_PATH = path.join(mkdtempSync(...), 'landing-words.txt')` 写夹具 `[H]\n玉佩光\n[L]\n窗棂摇\n`（**必须走 USER_PATH env**：resolveLandingWordsPath 用户路径优先级最高，防开发机 `~/.inkforge/landing-words.txt` 真词表窜入夹具）；书蓝图 mustHaveBeats 带 `grade:'H'`（沿 :484 用例形态）→ 断言 `draft.user).toContain('【显性词参考】')`、`draft.user).toContain('玉佩光')`，一轮 rewrite 后 `rw.user` 同两断言——先红，接线后绿
- [ ] chapter.test.ts 新增挤压钉用例（D-D，先红）：同新 describe 块再加一例「4 节拍+词表：task 槽截尾保铁则」——蓝图拼 4 条 mustHaveBeats（每条 text 约 150 字、grade 混合，令硬要求+铁则+词池合计超 task 槽 800）→ 断言 `draft.user).toContain('【文风铁则】')`（词池居末先让位，铁则不得被挤出）；词池行是否存活不作断言（闸门兜底，可接受截断）——接线后绿
- [ ] 回归核对：既有 :484-503 用例（无词表 env 时）——开发机若存在用户词表，grade H 书的 draft.user 可能多出【显性词参考】块；逐条核对 :491-493 全为 toContain 语义（多块不破坏）、:503 `not.toContain('【本章硬要求】')` 的书无 grade 条目不触发词池——两用例无需改钉，跑绿确认
- [ ] 验收：`pnpm --filter @inkforge/server test -- test/pipeline/chapter.test.ts` 绿 + `pnpm --filter @inkforge/server typecheck` 0 错

## 任务 10 [方向④] 尺度维：STYLE_DIMENSIONS 七→八 + 蒸馏指令

**文件：** Modify `packages/shared/src/api.ts`；Modify `apps/server/src/style/analysis.ts`。

**改动点：**
- api.ts:400：`export const STYLE_DIMENSIONS = ['节奏', '对话', '描写', '情感基调', '尺度', '写作特点', '特色词汇', '章节结构'] as const;`（「尺度」插「情感基调」后，语义同簇；行尾注释补「八维，尺度=直白度/性描写尺度（DEC-2026-1122-03④）」）。下游自动适配零改动：parseAnalysis 白名单守卫（plainproto.ts:363 includes）+ 缺维补 ''（:404）、renderStyleDimsBlock 空守卫（inject.ts:60 `(dims[d] ?? '')`）、normalizeDimsSource 循环（merge.ts:69）、UI 绑定面板循环（BookDetailPage.tsx:107/:126/:194）、analysis.test.ts:53（LENGTH 断言）、style-snapshot.test.ts:27（fromEntries）、styleProfileCreateSchema dims=z.record 泛型校验（schemas.ts:139）
- analysis.ts ANALYSIS_INSTRUCTION（:15-22）：:16 DIM 行改 `DIM: <维度>: <一段描述>（八维：节奏、对话、描写、情感基调、尺度、写作特点、特色词汇、章节结构，每维一行）`；DIM 行下新增指导行：`（尺度维=直白度与性描写尺度的画像：写明该样本的直白程度与用词尺度，须引用样本原文露骨用词作证据，每条证据不超过 10 字；样本无相关内容则写「低尺度，淡笔带过」。）`（1301 纪律：指令零真实露骨词）

**存量档案策略（写死，不做卡）：** 旧档案 rules_json.dims 无「尺度」键 → 渲染端跳过该行=零行为变化；owner 在 UI 手动重蒸（saveStyleProfile 同 source_hash version+1 不可变新行，analysis.ts:95-98），本批不写批量重蒸脚本——论证：档案数个位数、重蒸=UI 单次 LLM 调用、批量脚本引入无人 review 的批量写不可取。

**步骤：**
- [ ] api.ts 八维数组+注释
- [ ] analysis.ts 指令两处（DIM 行八维 + 尺度指导行）
- [ ] 验收：`pnpm --filter @inkforge/shared test` 绿 + `pnpm --filter @inkforge/shared typecheck` 0 错 + `pnpm --filter @inkforge/server test -- test/style` 绿（analysis.test.ts:53 八=八自动过、inject-blocks/merge 用例 fromEntries 自动覆盖）；`test/http/distill-template.test.ts` 此时预期红（:105 七维文案钉）——改钉在任务 11

## 任务 11 [方向④] 尺度维测试改钉（server + web）

**文件：** Modify `apps/server/test/http/distill-template.test.ts`；Modify `apps/web/src/pages/BookDetailPage.test.tsx`。依赖：任务 10、任务 03（同 web 测试文件串行）。

**步骤：**
- [ ] distill-template.test.ts:105 断言 `'七维：节奏、对话、描写、情感基调、写作特点、特色词汇、章节结构'` → `'八维：节奏、对话、描写、情感基调、尺度、写作特点、特色词汇、章节结构'`；同用例若还有其它指令片段断言，按任务 10 新指令文本逐字同步——绿
- [ ] BookDetailPage.test.tsx 三处 dimsSource 七键对象补第 8 键：:652 用例名「勾 2 档案保存 → PUT body 为 1 主 1 辅 + 七键 dimsSource + weights 均分」→「…八键 dimsSource…」；:672 期望对象加 `尺度: 'p1'`；:800 期望对象加 `尺度: 'p1'`（绑定面板组件遍历 STYLE_DIMENSIONS 自动出第八行，组件零改动）
- [ ] 全文件 grep 自查：`grep -n "七维\|七键\|尺度" apps/web/src/pages/BookDetailPage.test.tsx apps/server/test/http/distill-template.test.ts apps/web/src/components/StyleProfilesSection.test.tsx` 无残留旧口径（「尺度」命中应仅为新增断言/键；StyleProfilesSection.test 若命中「七维」用例名文案则同步改「八维」，纯文案零逻辑）
- [ ] 验收：`pnpm --filter @inkforge/server test -- test/http/distill-template` 绿 + `pnpm --filter @inkforge/web test` 绿 + `pnpm typecheck` 0 错

---

## 收口（主审亲执）

- [ ] 验证链全序：`pnpm lint` → 各卡定向测试 → `pnpm -r test` 全量（**≥636 只增不减**，新增用例合计 ≥12：repositories/style/continue 为翻转改钉不计数、web toast +1、rewrite 槽装配 +1、chapter +3（fewshot 开重写轮+词表接线轮+D-D 挤压钉）、contract QC评准 +1 与词池 +6（含⑥次序钉））→ `pnpm typecheck` → `pnpm deadcode`（knip 零新增）→ diff 秘密扫描零新增
- [ ] code-review 两轴（本批必超 3 文件）：产物轴=四方向逐条对症（① targeted 槽+评准线+护栏、② 词池两接线点、③ 绑定置 1 两函数+文案、④ 八维+指令）与 1301 纪律（全 diff 无真实露骨词、夹具全中性词）；流程轴=先红后绿留痕完整、B4 裁决④→DEC-2026-1122-03③ 的语义翻转在测试名/注释留痕、任务间强依赖（03→04→05→06、07→08、10→11）未乱序
- [ ] 提交五步：secret 扫描→commit（Conventional+中文描述；正文 `verify:` 全链结果+`Refs: DEC-2026-1122-03`；任务 03 提交注明「GUI 未验证（owner 真实测试）」）→三查→push 前远程核对→push 后 ls-remote 复核；执行者只 commit，push 主审亲执；永不 `--no-verify`、永不 `git add -A`
- [ ] DEC-2026-1122-03 归档 docs/decision-log.md：四方向拍板 + D-A/B/C 三定断全文 + 存量档案重蒸策略（owner UI 手动）+ 观测验收线
- [ ] GUI 点位清单（owner 真实测试，进完成通知）：①绑定档案 → toast「文风示例注入已默认开启（可手动关闭）」；②开关区说明显示「新绑定/重绑默认开启…」；③手动关→重绑→开关自动回开；④绑定面板维度选择出现第 8 行「尺度」；⑤设置页词表编辑保存后，新生成 run 的 draft/rewrite prompt 含【显性词参考】（run 详情 prompt_hash 变化侧证）
- [ ] 观测验收（owner 实测口径，非卡验收线）：重跑《少年阿磊》ch1（勾蒸馏档案+词表含 H 池），同口径 23 词密度：revised 相对 draft 衰减应从 43.4/242≈0.18 显著回升（建议观测目标 revised ≥100/万字或 ≥draft 的 60%，owner 实测定夺）；若仍含蓄化，残留病灶排查序=QC 评准线是否被模型忽略→full 模式 rewrite 温度→蒸馏档案尺度维缺失（未重蒸）

## 自审五查（计划落盘前已执行）

1. **规格覆盖：** owner 四方向逐一有卡（③=任务 01-03、①=任务 04-07、②=任务 08-09、④=任务 10-11）；主会话三项授权定断（plagiarism/词表预算/重绑语义）落 D-A/B/C 并进 DEC 归档清单——全覆盖。
2. **步骤唯一可写：** 每卡步骤为单执行者在单工作树可独立勾选的原子动作；无「视情况」「酌情」字样；两处「预期红跨卡」均标注强依赖序与红线归属卡。
3. **类型一致：** RewriteBudgets 加键后 BUDGETS_REWRITE 同卡补值（无可选键半态）；renderTaskSummaryBlock 新参为可选结构化类型，两调用点同批改（任务 09）否则 typecheck 不过——签名与消费端同批落。
4. **隐含输入类五类各配一测：** 环境输入（词表 env）→任务 09 USER_PATH 夹具+开发机真词表防窜；存量数据（旧档案无尺度键）→任务 10 下游守卫论证；失败注入（词池空/超预算）→任务 08 用例④⑤；重复操作（重绑覆盖手动关）→任务 01 :215 先关后绑；边界（300 字符贪心至少 1 词）→任务 08 用例④ startsWith 断言。
5. **比例：** 11 卡合计约 16 文件、每卡 1-2 文件；测试改动与产品改动约 6:10，符合「修 bug 必带回归测试且基线只增不减」。
