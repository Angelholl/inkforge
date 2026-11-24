# 实现计划：生成前融合确认门可读性改造（fusion gate readability）

> **目标：** 门内所有 UUID 一律换成档案名（`profileNames` 查名，缺失回落 id 前 8 位灰字）；全门文案从工程腔换成白话（副标题/张力横幅/A 类剥节/文风配方/planner 三行/fewshot 行/底部开关/错误回显共 9 区块）；风格行四选砍成三选（删「剥 MD 文本」假选项）；服务端 GET 组装 `binding.profileNames`、confirm 支持可选 `fingerprint` 陈旧守卫（不一致 → 409 零写）；标题区滚动 sticky。功能语义零变化：不动指纹算法与 gen_gate 存储、不改 confirm applied/skipped 语义、不新增写入口。
> **架构：** 服务端（卡 A）在既有 GET gate 组装处（`routes.ts` show 分支）用现成 repository 查名填 `profileNames`（不参与指纹，`fingerprint.ts` 零改动）；confirm 守卫放路由层、事务之外（`applyFusionConfirm` 单事务语义与签名零改动）。前端（卡 B）只动门组件与门 helper 两个文件；页面调用方（`BookDetailPage.tsx:1060`、`NewBookIdeaPage.tsx:334`）零改动。
> **规格：** 文案与结构真值=owner 2026-11-24 拍板（本计划「文案真值表」逐条落点行号已读码核实）；上游机制规格=`docs/design/proposal-2026-11-23-import-reconcile.md` v3.1 §3.5 门四钉（触发指纹/可见降级/批量事务/书级开关，全部不变）。执行卡：`docs/design/card-2026-11-24-fg-a-server.md`、`docs/design/card-2026-11-24-fg-b-web.md`。

## 全局约束

1. **两卡串行，卡 A 先**；同工作树 ≤1 卡；执行者只 commit 不 push；永不 `--no-verify`、永不 `git add -A`；提交 Conventional 前缀+中文描述，正文 `verify:` 实测结果 + `Refs:` 本计划文件名。
2. **不动指纹算法与 gen_gate 存储结构**：`apps/server/src/fusion/fingerprint.ts` 与 `InjectionFace` 七键零改动；`profileNames` 不入指纹（改档案名不得触发重弹——有具名测试钉死）；migration/NSIS 零改动。
3. **不改 confirm 既有 applied/skipped 语义**：`apply.ts` 的 `ConfirmDecisions`/`ConfirmOutcome`/事务边界零改动；`fingerprint` 陈旧守卫在路由层事务启动之前完成（不一致即 409 返回，不进事务、不写库）。
4. **shared 类型向后兼容**：`FusionGateConfirmBody.fingerprint` 可选；`FusionGateReportDto.binding.profileNames` 必填但可为空对象 `{}`（旧 stub/旧客户端不受影响；zod confirm schema 对未知键不收不影响旧 body）。
5. **测试基线只增不减**：全量基线=开工当日实跑（最近存证 2026-11-24 ≥725，见 `docs/design/card-2026-11-24-txt02-flattened-forms.md:18`）；执行者开工先复跑 `pnpm test` 记起点（执行时主审实测填进完成通知），收口逐包计数 ≥ 起点。
6. **验证链硬序**：`pnpm lint` 零输出 → 定向测试 → 全量 `pnpm test` → `pnpm typecheck` 全 workspace 0 错 → `pnpm deadcode` 零新增告警。任一环失败即停。工具链=repo 根 pnpm（根 `package.json:14-17`：`test`=`pnpm -r --if-present run test`、`typecheck`、`lint`）。
7. **测试红→绿**：既有钉值用例的文案随迁属"先红后绿"——先改断言钉新文案跑红，再改组件跑绿；既有断言只许按文案真值表更新钉值，禁删用例。
8. **GUI 未验证（owner 真实测试）**：卡 B 提交信息注明；GUI 点位清单见 Task-03。

## 冲击清单（既有钉值用例，逐条复核）

| # | 文件:位置 | 钉住的旧语义 | 本计划影响 | 处置 |
|---|---|---|---|---|
| 1 | `apps/web/src/components/FusionGateDialog.test.tsx:73,75,77-78,80-81,83,85,109,124,137` | 旧文案与 aria-label（「剥 MD 文本：X」「大纲卡落地格恒优先…」「剧情档案：绑/不绑」「不再提示（当前注入面不变时）」「逐节剥除组合请用书籍设置世界观框手改」「本次未做张力对照」「张力对照分析中」） | 全部换成新文案 → 必破 | Task-02 先红后绿：断言按文案真值表更新钉值，逐条改跑红再实现跑绿 |
| 2 | `apps/web/src/components/FusionGateDialog.test.tsx:32-39`（fixture binding） | 无 `profileNames` 键 | DTO 必填新键 | Task-02 fixture 增 `profileNames` 钉值 |
| 3 | `apps/web/src/pages/BookDetailPage.test.tsx:47-62`（GATE_SHOW_REPORT fixture，binding 在 :54-61） | 无 `profileNames` 键 | 运行时组件对缺失键已防御（`profileNames?.[id]`），但 fixture 应如实 | Task-02 随迁：binding 增 `profileNames: {}` |
| 4 | `apps/web/src/pages/BookDetailPage.test.tsx:524,542,543,551` | 书详情自身「文风示例注入」面板文案 | **零影响**（本计划不改书详情面板；门内 fewshot 行是另一处文案） | 回归锚：必须保持绿，证明未误改面板；列此存证 |
| 5 | `apps/server/test/http/fusion-gate.test.ts:86`（analyze 的整对象 `toEqual`） | analyze 响应形状 | **零影响**（analyze 响应不含 binding，本计划不触 analyze 路由） | 存证；GET/confirm 全部断言为 `toMatchObject`/子字段 `toEqual`，响应增 `profileNames` 键不撞精确相等（已核 :258-373） |
| 6 | `apps/web/src/pages/NewBookIdeaPage.test.tsx:30` | gate stub 为 `{action:'pass'}` 直通形态，无 dialog 渲染 | **零影响** | 存证；`FusionGateConfirmBody` 增可选键、`binding` 仅 show 形态渲染，直通路径不触 |

## 文案真值表（owner 拍板 + 落点已核实；planner 只核实了〈…〉占位，未改任何语义）

| # | 区块（组件现行行号） | 新文案（钉值，不得改字） |
|---|---|---|
| 1 | 副标题 `FusionGateDialog.tsx:86` | 「下面列出这次生成会喂给 AI 的参考资料，以及可以调整的地方。点「确认并开始生成」会保存你的调整并开始生成；点「取消」不保存任何改动。」 |
| 2a | 降级横幅 `:91` | 「这次没有做正文与档案的冲突对照（不影响生成）」 |
| 2b | 分析中 `:94` | 「正在对照正文与档案…」 |
| 3a | A 类节标题 `:117` | 「正文里残留的设定片段」 |
| 3b | A 类空状态 `:119` | 「这次没有需要从正文移除的片段。」 |
| 3c | 行勾选 aria `:130` | `移除片段：${row.heading}` |
| 3d | verdict 三态白话 `:136`（映射表，替代裸 `{row.verdict}`） | fully-carried→「档案里已有，移除不丢内容」；partially-carried→「档案只覆盖一部分，移除可能丢内容」；not-carried→「档案里没有，建议保留」 |
| 3e | 不可剥 `:137` | 「（这段动不了）」 |
| 3f | 勾选后提示 `:139` | 「想逐段自由取舍，请到书详情页「设定」节的「世界观与剧情大纲」面板直接改正文。」 |
| 4a | style 节标题 `:149` | 「文风配方（当前绑定）」 |
| 4b | 无绑定态 `:151` | 「这本书还没绑定文风档案，生成时不会参考文风档案。」 |
| 4c | 有绑定首行 `:154-157` | 「主参考《名》＋辅助《名》《名》」（名=`nameOf(id)`）；下方灰字占比行：weights 非空→「占比：《名》 60、《名》 40」（按主→辅顺序列 weights 值）；weights 为空对象→「（旧绑定：按贡献维数计权）」 |
| 4d | 风格选择四选→三选 `:160-165` | 删 `strip`；「保持现状」「调整各档案占比」「逐维度选跟随哪本档案」 |
| 4e | 选项 aria `:175` | `文风调整：${label}` |
| 4f | 选中项下方一行灰字解释 | weights 选中→「数字越大越像那本档案」；dims 选中→「为每个风格维度单独指定跟随哪本档案」；keep 无解释行 |
| 4g | 滑条行标签/aria `:185/:191` | 标签=`nameOf(id)`；aria=`占比：${nameOf(id)}` |
| 4h | 维度行标签/aria/option `:203/:207/:211-213` | 标签=dim 键原文（dimsSource 键=STYLE_DIMENSIONS 中文标签，`packages/shared/src/api.ts:400`，书详情高级设置 `BookDetailPage.tsx:278` 同源在用，无需映射表）；aria=`跟随：${dim}`；option 文本=`nameOf(id)`（value 仍 id） |
| 5a | planner 节标题 `:226` | 「大纲阶段参考的档案」 |
| 5b | 附注 `:227` | 「这里只决定"写大纲"时参考什么；成文风格由上面的文风配方决定，正文写法仍以大纲卡为准。」 |
| 5c | 三行 label `:31-35` | 保留「剧情档案/光谱档案/仿写档案」，绑定行在其后显示「《nameOf(id)》」 |
| 5d | radio 文案/aria `:238,:241,:249,:252` | 「作为参考」/「不作为参考」；aria=`${row.label}：作为参考` / `${row.label}：不作为参考` |
| 5e | 无绑定行 | 显示「未绑定{row.label}」（如「未绑定光谱档案」），该行两个 radio 禁用（busy 禁用语义叠加不变） |
| 5f | 组级一行说明（`ul` 后新增灰字行） | 「选「不作为参考」= 永久解除这本书与该档案的绑定，之后每次生成都不再参考它；要重新绑定，请到「蒸馏」页里对应档案的绑定框。」（2026-11-24 主审亲持精简：入口三节全名与绑定框占位名的读码存证见下方证据条 #2，屏上不再堆七八十字） |
| 6 | fewshot 行 `:260` | 「文风示例注入：{开\|关}（这里只能看，要开关请到书详情页「风格」节的「风格档案」面板）」 |
| 7 | 底部 suppress `:273,:278` | 「以后生成前不再弹这个确认（参考资料一有变动还会再提醒）」（checkbox aria-label 同文） |
| 8a | 错误回显 generic `:263-265` | 「保存失败：{error}。这次什么都没改、也没开始生成，可以再试一次，或点取消离开。」（role=alert 保留） |
| 8b | 409 stale（fusionGate.ts 映射后整句替换 8a） | 「这本书的参考资料刚在别处被改动，本次确认的内容已经过期。请点取消，再重新点生成，门会刷新。」 |
| 9 | 标题区 sticky | h2「生成前融合确认」+副标题（#1）在对话框滚动容器内 sticky 固定 |
| 10 | 按钮 `:281-286` | 不变：「取消」「确认并开始生成」 |

**〈占位〉核实证据（全部读码确认）**
- #3f「改正文/世界观的面板」：`apps/web/src/pages/BookDetailPage.tsx:17`（书详情节导航 label「设定」，锚 `sec-worldview`）+ `:753`（CardHeader「世界观与剧情大纲」）+ `:755-770`（`aria-label="世界观"` textarea 经 `saveMeta` 写 `book.description`）。
- #5f「三类档案绑定入口」：`apps/web/src/App.tsx:55`（rail 导航「蒸馏」→ `/distill`）+ `apps/web/src/pages/DistillPage.tsx:49`（h1「蒸馏工作台」）+ `:74-76`（渲染 StyleProfilesSection/PlotProfilesSection/SpectrumProfilesSection）+ `apps/web/src/pages/PlotProfilesSection.tsx:18`（节标题「剧情蒸馏（剧情档案）」）+ `apps/web/src/pages/SpectrumProfilesSection.tsx:18`（「人物光谱蒸馏（人物光谱档案）」）+ `apps/web/src/pages/ImitationProfilesSection.tsx:104`（「仿写档案（拆解仿写）」，嵌在 StyleProfilesSection `:541` 内、同页渲染）+ `apps/web/src/components/DistillProfilesShell.tsx:283-287` 与 `apps/web/src/pages/ImitationProfilesSection.tsx:136-139`（绑定下拉占位「（选择要绑定的书）」）。BookDetailPage 无三类档案重绑 UI（已核全文件 CardHeader 清单）。
- #6「文风绑定面板」：`apps/web/src/pages/BookDetailPage.tsx:21`（节导航 label「风格」，锚 `sec-style`）+ `:900`（CardHeader「风格档案」）+ `:912-932`（「文风示例注入」checkbox 所在）。
- 维度中文名：`packages/shared/src/api.ts:400` `STYLE_DIMENSIONS = ['节奏','对话','描写','情感基调','尺度','写作特点','特色词汇','章节结构'] as const`——dimsSource 键即此中文标签本体，显示时无需查表。

---

## Task-01 卡 fg-a-server：shared DTO + GET profileNames + confirm 陈旧指纹 409 守卫 + 服务端先红后绿

**目标**：GET show 响应 `binding` 增 `profileNames`（id→名，查不到不进 map，不入指纹）；confirm body 可带 `fingerprint`，与当下注入面指纹不一致 → 409 零写；不带维持现行为。

**文件**
- Modify `packages/shared/src/fusion.ts:36-43`（binding 增 `profileNames`）、`:53-66`（confirm body 增 `fingerprint?`）
- Modify `apps/server/src/http/schemas.ts:366-407`（`fusionGateConfirmSchema` 增 `fingerprint: z.string().min(1).optional()`）
- Modify `apps/server/src/http/routes.ts:1355-1370`（GET show 组装 `profileNames`）、`:1373-1387`（confirm 守卫）
- Test Modify `apps/server/test/http/fusion-gate.test.ts`（gate/confirm describe 末尾追加 5 用例）
- 零改动存证：`apps/server/src/fusion/fingerprint.ts`、`apps/server/src/fusion/apply.ts`（守卫在路由层事务外；`ConfirmDecisions` 不含 `fingerprint`，routes 解构剥离后才传 apply）

**接口**
- Produces（`packages/shared/src/fusion.ts`）：
  - `FusionGateReportDto.binding` 增：`/** 档案 id→展示名（style 主辅 + plot/spectrum/imitation 已绑 id；查不到的 id 不进 map）。不入指纹。 */ profileNames: Record<string, string>`
  - `FusionGateConfirmBody` 增：`/** GET 响应原样回传；服务端与当下注入面指纹比对，不一致 → 409 零写。可选=旧客户端兼容。 */ fingerprint?: string`
- Produces（routes.ts GET show）：`binding` 对象增 `profileNames` 键；收集顺序=styleBinding 主档→辅档（`SELECT name FROM style_profiles WHERE id = ?`，表同 `routes.ts:1302` 先例）→ `plotRepo.getPlotProfile(db,id)?.name`（`plot.ts:44`）→ `spectrumRepo.getSpectrumProfile(db,id)?.name`（`spectrum.ts:44`）→ `imitationRepo.getImitationProfile(db,id)?.name`（`imitation.ts:61`）；三个 planner id 取 `book.plotProfileId/spectrumProfileId/imitationProfileId` 非空者。imports 已齐（`routes.ts:17,29,33,34`），零新增 import。
- Produces（routes.ts confirm）：`const { fingerprint: clientFp, ...decisions } = parsed;`；`clientFp !== undefined && clientFp !== injectionFaceFingerprint(face)` → `reply.code(409).send({ error: '...', reason: 'stale-fingerprint' })`（错误体形状沿本仓先例 `routes.ts:1437-1441` 的 `{ error, reason }`）；否则 `applyFusionConfirm(db, bookId, decisions, face)` 原样。
- Consumes（Task-02 卡 B）：`report.binding.profileNames`（`Record<string,string>`）与 `FusionGateConfirmBody.fingerprint?: string` 的上述精确签名。

**步骤**
- [ ] 1. 基线锚：`pnpm -F @inkforge/server exec vitest run test/http/fusion-gate.test.ts` → 全绿，记用例数（现 13，执行时实测填）。
- [ ] 2. 先红：fusion-gate.test.ts gate/confirm describe 末尾追加 5 用例（断言全文见卡 A）→ 跑定向 → 5 例红（`profileNames` undefined、409 缺失）。
- [ ] 3. `packages/shared/src/fusion.ts` 两处增字段（含上述注释）→ `pnpm -F @inkforge/shared test` 全绿（类型面由步骤 8 `pnpm typecheck` 兜底核对）。
- [ ] 4. `schemas.ts` confirm schema 增 `fingerprint: z.string().min(1).optional()` → `pnpm lint` 零输出。
- [ ] 5. `routes.ts` GET show：组装 `profileNames`（按接口块顺序与查表）→ `binding` 对象加键。
- [ ] 6. `routes.ts` confirm：解构剥离 + 守卫 409（先 `buildInjectionFace(bookId, book)` 提出 `face` 复用给守卫与 apply）。
- [ ] 7. 跑定向 `pnpm -F @inkforge/server exec vitest run test/http/fusion-gate.test.ts` → 13 旧 + 5 新全绿（先红后绿闭环）。
- [ ] 8. `pnpm typecheck` 0 错、`pnpm lint` 零输出 → commit（只 commit 不 push）。

**验收**：新 5 用例全绿且各自先红留痕；`git show --stat HEAD` 文件集 = 4 文件不越界；全量 `pnpm test` 逐包 ≥ 基线。

---

## Task-02 卡 fg-b-web（依赖 Task-01 的 DTO）：门文案白话化 + 档案名渲染 + 三选 + 409 文案 + sticky

**目标**：按文案真值表 #1-#9 全量改造门组件；`nameOf(id)` = `report.binding.profileNames?.[id] ?? id 前 8 位`（回落灰字、`title`=完整 id）；`fusionGate.ts` confirm 请求体回传 `report.fingerprint`、409 映射 stale 文案；先红后绿更新全部旧钉。

**文件**
- Modify `apps/web/src/components/FusionGateDialog.tsx`（docblock `:6-16`、`StyleChoice :28`、`buildBody :59-80`、各区块 `:82-296`，逐条落点见文案真值表）
- Modify `apps/web/src/fusionGate.ts:53-69`（onConfirm 回传 fingerprint + catch 409 映射 + generic 错误走 `apiErrorText`）
- Test Modify `apps/web/src/components/FusionGateDialog.test.tsx`（fixture `:32-39` + 旧钉 9 处 + 新增 6 用例）
- Test Modify `apps/web/src/pages/BookDetailPage.test.tsx:47-62`（仅 fixture binding 增 `profileNames: {}`）
- 零改动存证：`apps/web/src/pages/BookDetailPage.tsx`、`apps/web/src/pages/NewBookIdeaPage.tsx`、`apps/web/src/pages/NewBookIdeaPage.test.tsx`、`apps/web/src/api/client.ts`（`apiErrorText:76` 已有，直接复用）

**接口**
- Consumes（来自 Task-01）：`report.binding.profileNames: Record<string, string>`（可为 `{}`，运行时可能缺键须 `?.` 防御）；`FusionGateConfirmBody.fingerprint?: string`；`report.fingerprint: string`（回传源）。
- Produces（FusionGateDialog.tsx）：
  - `const VERDICT_LABELS: Record<FusionAClassRowDto['verdict'], string>`（文案真值表 #3d）
  - `function nameOf(id: string): string`（`binding.profileNames?.[id] ?? id.slice(0, 8)`）；回落时元素加 `title={id}`（完整 UUID）；`profileNames[id]` 命中时同样 `title={id}`（悬停可见原 id）
  - `StyleChoice = 'keep' | 'weights' | 'dims'`（`strip` 删除）；`buildBody`：`description` 触发条件只剩 `Object.values(stripped).some(Boolean)`；确认体恒带 `body.fingerprint = report.fingerprint`
- Produces（fusionGate.ts）：
  - `export const STALE_GATE_MESSAGE = '这本书的参考资料刚在别处被改动，本次确认的内容已经过期。请点取消，再重新点生成，门会刷新。'`（文案单一来源，组件 import 用于判等渲染整句）
  - onConfirm：`body.fingerprint = report.fingerprint` 后再发；catch：`/→ 409:/.test(e instanceof Error ? e.message : '')` → `error: STALE_GATE_MESSAGE`；否则 `error: apiErrorText(e)`（409 判据锚=`client.ts:71` 抛错格式 `${method} ${url} → ${status}: ${body}`）

**步骤**
- [ ] 1. 基线锚：`pnpm -F @inkforge/web test` → 全绿记数（执行时实测填）。
- [ ] 2. 先红（钉值随迁）：FusionGateDialog.test.tsx 按文案真值表更新 9 处旧钉（:73→`移除片段：文风节`、:75→#5b 附注、:77-78→`剧情档案：作为参考/不作为参考`、:80-81→#6 新括注、:83→#3f、:85/:109→#7、:124/:137→`移除片段：…`、:93→#2a、:97→#2b）→ 跑 web 定向 → 旧钉红。
- [ ] 3. fixture `:32-39` binding 增 `profileNames: { sp1: '示例主档案', sp2: '示例辅档案', pp1: '示例剧情档案', ip1: '示例仿写档案' }`；BookDetailPage.test.tsx `:54-61` binding 增 `profileNames: {}`。
- [ ] 4. 组件 docblock（:6-16）改写：剥 MD 四选已删（description 仅由片段勾选触发）、档案名来源、409 文案映射。
- [ ] 5. `nameOf` + `VERDICT_LABELS` + `STALE_GATE_MESSAGE` import 落地；副标题（#1）与 sticky 头部包裹（#9：h2+副标题包 `sticky top-0 z-10 -mx-5 -mt-5 bg-surface px-5 pb-2 pt-5`，滚动容器=`:84` overflow-y-auto div）。
- [ ] 6. #2a/#2b 横幅与分析中文案替换。
- [ ] 7. A 类区块（#3a-#3f）：节标题/空状态/aria/verdict 映射/不可剥/勾选提示逐条替换。
- [ ] 8. style 区块（#4a-#4h）：节标题/无绑定/首行《名》+占比行/三选/aria/解释行/滑条名/维度 option 名；`StyleChoice` 删 `strip`，`buildBody` description 条件收窄、恒带 `body.fingerprint = report.fingerprint`。
- [ ] 9. planner 区块（#5a-#5f）：节标题/附注/行内《名》/radio 文案与 aria/无绑定行禁用/组级说明。
- [ ] 10. fewshot（#6）、suppress（#7）、错误回显（#8a，stale 判等整句渲染）三处替换。
- [ ] 11. 新增 6 用例（断言全文见卡 B）：档案名替代 UUID、缺失回落 id 前 8 位、未绑定行 radio 禁用、三选无「剥 MD 文本」、409 文案渲染、planner 行《名》。
- [ ] 12. `pnpm -F @inkforge/web test` → 全绿（旧钉更新+6 新例）；`pnpm typecheck` 0 错、`pnpm lint` 零输出 → commit（提交信息注明「GUI 未验证（owner 真实测试）」）。

**验收**：真值表 #1-#9 逐条可在 diff 中指认；`git show --stat HEAD` 文件集 = 4 文件不越界；全量 `pnpm test` 逐包 ≥ 基线。

---

## Task-03 验证链收口（主审）

- [ ] 1. `pnpm lint` 零输出；`pnpm typecheck` 全 workspace 0 错。
- [ ] 2. `pnpm test` → 逐包计数 ≥ 开工实测基线（只增不减；终值执行时填）。
- [ ] 3. `pnpm deadcode`（knip）→ 零新增告警（新导出仅 `STALE_GATE_MESSAGE`，消费方=FusionGateDialog）。
- [ ] 4. `git diff` 逐文件安全扫：零秘密、`fingerprint.ts`/`apply.ts`/`gen_gate` 零改动确认、两卡文件集不越界。
- [ ] 5. GUI 未验证点位（owner 真实测试）：门全 9 区块新文案、档案名显示与悬停 title、profileNames 缺失回落灰字、未绑定 planner 行禁用、三选交互（占比/维度滑条与下拉）、勾选片段→confirm body 含 description+fingerprint、409 场景（别处改动后再确认）显示 stale 文案、sticky 标题滚动、错误重试与取消。

## 自审五查（就地修讫）

1. **规格覆盖**：owner 拍板 A1-A4/B1-B10 逐条映射——A1→Task-01 步 3；A2→步 5；A3→步 6（409 形状沿 `routes.ts:1437` `{error,reason}` 先例）；A4→步 2/7 五用例；B1-B8→文案真值表 #1-#8（卡 B 步 5-10）；B9→#9 sticky（步 5）；B10→旧钉随迁+6 新例（步 2/11）。占位三处均已核实为真实界面名称（证据表），无残留〈…〉。——**覆盖完整**。
2. **步骤唯一性**：每任务步骤均为单动作+可核对结果（命令+期望红/绿）；无 TBD；不确定量（基线数）标「执行时实测填」非空话。——**通过**。
3. **类型一致**：`profileNames: Record<string,string>` 必填可空对象、`fingerprint?: string` 可选——shared 单点定义，zod schema/routes/组件/测试四层同源；`ConfirmDecisions` 不含 fingerprint 由解构剥离钉死；卡 B 对 `profileNames?.[id]` 运行时防御（旧 stub 兼容）。——**通过**。
4. **咬人输入**：profileNames 查不到（档案被删）→ 不进 map → 前端回落 id 前 8 位（A2 收集过滤 + B 新例 2 钉）；改名 → 指纹不变不重弹（A4 具名例）；并发改动 → 409 零写（A4 stale 例 + B 409 文案例）；旧客户端不带 fingerprint → 现行为不变（schema optional + 存证 #5/#6）。——**通过**。
5. **比例**：净增/改 ~200 行（shared +6、routes +25、schemas +1、dialog 改 ~80、fusionGate +10、测试 +120）；计划 3 任务，两执行卡粒度与既有卡面（card-txt02 形态）一致；篇幅与代码量级匹配，无抄代码段。——**通过**。

---

## 完成记录（2026-11-24 收口，主审）

**通道与提交：** 两卡均走 opencode/hy4-flash-free（限时窗内、非禁入型），契约都 exit0、无 flags、零轮转（FG-A 300s、FG-B 661s）；FG-A 执行者跑完链未 commit 即收工，由主审代提交。commit 链：`2affe94`（Task-01）→ `b46fd7b`（Task-02）→ `250688e`（主审直修①-④）→ `2245340`（主审直修⑤）。

**主审直修五枚（各带先红后绿留痕）：**
1. 只有主档、无辅档时首行悬空「＋辅助」→ 条件渲染（红 1 例）。
2. 占比行在 weights 缺 id 时印 `undefined` → 回落滑条默认值 1；并改为**仅选中「调整各档案占比」时该行才跟随草稿**，选「保持现状」时显示将要生效的快照值（避免看着改了其实没存）。
3. 张力区块漏在文案真值表外：节标题「张力对照」→「正文与档案的冲突对照」，行标签「MD 侧 / 档案侧」→「正文里 / 档案里」。
4. 文首窗口提示「开头若干行不参与剥节」→「正文开头若干行受保护，勾选移除也不会动它们，请留意。」
5. Spec 轴判半做（卡 B Produces 钉死「profileNames 命中时同样 `title={id}`」，首行与占比行的《名》漏）→ 新增 `muted()` / `nameEl()` 单点，顺带并掉 Standards 气味③（双查 profileNames）；DOM 由整串模板改为《名》span，测试断言相应改走 `container.textContent` 并新钉 `getAllByTitle('sp1') ≥ 2`。

**双轴 code-review（base `6d88111`）处置：** Standards 零硬违规，三气味——①409 靠 `/→ 409:/` 文案判类：失配时并非静默，会降级成「保存失败：+服务端中文错」，判 Minor 记挂账；②fingerprint 在 `buildBody` 与 `fusionGate` 各赋一次：有意双层兜底（传输层保证任何 body 生产者都带指纹、组件层自证本次所见），保留并记挂账；③profileNames 双查：已由直修⑤并掉。Spec 一处半做（title 覆盖，直修⑤已修）；一处无害超规格（占比行实时值=直修②配套）；张力/文首白话经 DEC-2026-1124-03 裁决 3 授权，非 creep。

**测试终账：** **748**（server 571 / web 175 / shared 2）。轨迹：开工基线 733 → 卡 A 后 738 → 卡 B 后 744 → 直修①-④ 后 748（直修⑤为断言重构未增例）——只增不减。`pnpm lint` 0、`pnpm typecheck` 全 workspace 0、`pnpm deadcode`(knip) 0、四枚提交秘密扫零命中。

**挂账（backlog）：** a) 409 分类宜走结构化信号（client 抛错对象带 `status`/服务端 `reason`）而非文案正则——涉全链路错误面，另批处理；b) 陈旧守卫只覆盖 confirm 瞬间的注入面指纹，门内 `previewDescription`/aClass 预览在长悬停后同样可能过期，未纳入；c) 承 DEC-2026-1124-01 旧挂账（门内逐节组合剥除、向导内嵌、书设置清洗入口、B 类 LLM 裁决、解析器申报 carriedLines）。

**GUI 未验证（owner 真实测试，批次收口一次做）十点位：** ①门内所有档案位置显示《名》、悬停出完整 UUID；②档案被删/查不到名时回落 id 前 8 位灰字；③只有主档的书不再出现悬空「＋辅助」；④未绑定的 planner 行显示「未绑定X档案」且两 radio 禁用；⑤三选交互——滑条按名、选「调整占比」时占比行数字跟随、逐维度下拉按名；⑥勾片段→保存剥除稿，取消勾→不写 description；⑦门开着时去别处改绑定再点确认→见「这本书的参考资料刚在别处被改动…」且库未变；⑧标题区滚动时固定；⑨张力行显示「正文里/档案里」、文首窗口提示为新白话句；⑩确认退出后书籍设置面板的绑定与门内选择一致（持久写语义）。
