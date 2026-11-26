# 实现计划：绑定迁书页 + 蒸馏页只读徽标 + 蓝图散文直输扩写（BR）

- 日期：2026-11-26。计划真值源=本文；行号=2026-11-26 工作树快照，施工漂移时以锚点文本/函数名定位，不以行号硬依赖。
- 本计划只写精确文件路径、行号、字面量、测试名与断言、可执行步骤，**不含实现代码 diff**；本批唯一计划落盘文件=本文。
- 触发=owner 两条实测反馈（§0.2）+ owner 追加第五项拍板（D5 仿写统一口径，2026-11-26）；五项拍板（§0.1）已锁死不得更改；server 后端存储与注入链路**本批不动**。
- 执行序 **BR-1 → BR-2 → BR-3 → BR-4 → BR-5 → BR-6 → BR-7a → BR-7b**（先立书页入口、后摘蒸馏页入口，全程不出现绑定无入口窗口；BR-7b 卡内绿步亦先立书页仿写条、后摘蒸馏页仿写控件，两动作同卡一提交原子落）；同工作树 ≤1 卡串行。
- GUI 归 owner 真实测试，延批次收口一次做；§4 附表列实测点位清单（供收口呈报），agent 只保证卡级验证链跑绿，**计划内无自动化 GUI 目验步骤**。
- 验收硬命令见 §6；自审五查留痕见 §7。

## 0. 决策与反馈（Decisions，DEC ID 归档时填）

### 0.1 五项拍板（不得更改）

| # | 拍板内容 | 承接任务 |
| --- | --- | --- |
| D1 | 书页绑定控件形态=各归各区：人物卡分区顶部加「人物光谱档案」绑定条；世界观与剧情大纲分区的剧情大纲文本框旁加「剧情档案」绑定条；样式对齐现有 StyleBindPanel（select+保存绑定/解绑按钮组合）；风格面板本身不动 | BR-2 |
| D2 | 蒸馏页删绑定控件保列表：三张卡（风格/剧情/光谱）保留新增/编辑/删除/指纹（structure 行/版本/查看/自评/重新蒸馏），去掉绑定下拉和按钮；卡片行上加只读徽标显示该档案当前绑在哪本书 | BR-1（数据）+BR-3/BR-4（UI） |
| D3 | 风格在蒸馏页的绑定入口一并摘掉——三类统一「列表归蒸馏页、绑定归书页」，绑定唯一入口=书页 | BR-4（守护断言钉死，见 §2.4.6 现状核实） |
| D4 | 蓝图散文：非 JSON 草稿不再拒绝，作为新字段 `draftText` 发给 blueprint-suggest，由 LLM 扩写成完整蓝图 JSON 回填文本框；合法 JSON 仍走现有结构化 seed 确定性合并路径 | BR-5（server）+BR-6（web） |
| D5 | 仿写并入统一口径：四类档案（风格/剧情/光谱/仿写）全部「列表归蒸馏页、绑定归书页」——书页风格档案区（sec-style）加「仿写档案」绑定条；蒸馏页仿写卡删绑定下拉/按钮保列表管理+只读徽标 boundBooks；server list 反查同款扩 imitation | BR-7a（server）+BR-7b（web） |

- DEC ID 留空：`DEC-2026-1126-__`（归档 `docs/decision-log.md` 时填；五条对应 DEC-2026-1126-01..05，序号即 D1..D5）。
- D5 出处：owner 2026-11-26 追加拍板第五项——前四项呈报原文「书页绑定控件各归各区」等的「等」字覆盖仿写档案，仿写不再留待后续批次；原 §2.4.5「仿写零触碰、留 owner 定夺」条款就此作废。
- 历史一致性：docs/plans/2026-11-13-web-four-tab-shell.md:56-58 D5「绑定是每书上下文动作，绑定 UI 留在书详情页」——与本批方向一致，无冲突条目。

### 0.2 owner 反馈原文要旨

1. **反馈一**：剧情档案、人物光谱档案的绑定不应在「蒸馏」页做，应像风格档案一样在小说书页绑定（书页已有世界观与剧情大纲卡片、人物卡分区）。
2. **反馈二**：蓝图编辑卡片直输纯中文散文草稿时，点「基于已有草稿扩展」报红字「当前蓝图草稿不是合法 JSON，无法作为扩展种子」被拒；owner 裁定：对直接输入文字的用户，「直输草稿→AI 扩写」才是正确方式。

## 1. 目标

1. **绑定迁书页（D1）**：BookDetailPage 新增两条单选绑定条——剧情条挂「世界观与剧情大纲」卡片剧情大纲 textarea 旁（`BookDetailPage.tsx:818-825` 之后）、光谱条挂人物卡分区顶部（`:844` p-4 容器内 `<ul>` 前）；样式与交互对齐 StyleBindPanel 的 select+「保存绑定」（primary）+「解绑」（secondary）组合（`:311-316`）；保存/解绑走既有 PUT `/api/books/:bookId/plot`（`routes.ts:1164`）与 `PUT /api/books/:bookId/spectrum`（`routes.ts:1203`），后端零改动。
2. **蒸馏页摘绑定+加徽标（D2/D3）**：DistillProfilesShell 删绑定函数/下拉/按钮/books 查询与 DistillApi.bind+listBooks、DistillLabels 四键；plot/spectrum 分区配置同步瘦身；三卡行加只读徽标 `已绑定：《书名》…`（数据来自 server list 端点新增 `boundBooks`，§2.3）；风格卡与仿写区边界见 §2.4（仿写已并入 D5，见 §3.7）。
3. **server 最小加法**：三 list 端点（`GET /api/style-profiles` `routes.ts:919-931`、`GET /api/plot-profiles` `:1156`、`GET /api/spectrum-profiles` `:1195`）响应逐条附 `boundBooks: Array<{id,title}>`（已核实现状**无**此数据，plot/spectrum 走 books 镜像列反查、style 走 book_style_profiles 关联表反查）；共享 `BookDto` 补 `plotProfileId` 类型（服务端 `books.ts:51` toBook 早已回传，类型面缺口）。
4. **蓝图散文扩写（D4）**：`BlueprintSuggestBody` 增可选 `draftText`；schema（`routes.ts:65`，**注意：blueprint-suggest schema 内联在 routes.ts，schemas.ts 无此项**）加 `draftText: z.string().min(1).max(20000).optional()`；suggestBlueprintCore 注入「散文草稿」planner 槽（budget 3000，head 截断+warning）；web `suggest()` 改：合法 JSON→seed 确定性合并（现路不动）、解析失败→原文作 `draftText` 发送、空草稿→就地提示不发请求；`红字拒绝文案 :468 整体删除`。
5. **测试面**：server 新增 6 例（BR-1 三例+BR-5 两例+BR-7a 一例）；web 新增 8 例（BR-2 三例+BR-4 一例+BR-6 两例+BR-7b 两例）、改写 2 例（plot/spectrum 绑定例随功能迁移，断言不减）、随迁 1 例（R-F2-4 指引文本）；既有 R-F4-3（`BookDetailPage.test.tsx:411-435`）「默认按钮不传 seed」语义**逐字不动**。基线=执行者开工实跑记录（§4.1），只增不减。
6. **仿写统一口径（D5）**：`GET /api/imitation-profiles`（`routes.ts:1117`）逐条附 `boundBooks`（复用 BR-1 `listBooksBoundToProfile`，kind 扩 `'imitation'`→镜像列 `books.imitation_profile_id`，迁移 0005、无新迁移）；BookDetailPage sec-style 风格档案区 fewshot 块（`:1005-1030`）后加第三条 `ProfileBindBar`（复用 BR-2 组件），保存/解绑走既有 `PUT /api/books/:bookId/imitation`（`routes.ts:1125-1135`，零改动）；蒸馏页 `ImitationProfilesSection` 删绑定下拉/按钮/bind 函数/books 查询，卡行加同款只读徽标；融合门重绑指引（`FusionGateDialog.tsx:418`）改指书页绑定条（BR-3 摘除蒸馏页绑定框后已失实；全库无测试钉此串，已核）。

## 2. 架构

### 2.1 决策 → 任务映射

| 拍板（§0.1） | 钉死字面量 / 行为 | 任务 |
| --- | --- | --- |
| D1 剧情条位置 | 剧情大纲 textarea `:818-825` 后、保存设定按钮 `:826` 前 | BR-2 |
| D1 光谱条位置 | 人物卡 `<div className="p-4">` `:844` 内、`<ul>` `:845` 前（分区顶部） | BR-2 |
| D1 控件形态 | `ProfileBindBar`：select（aria-label=`${label}绑定`）+「保存绑定」primary+「解绑」secondary+当前绑定文案 | BR-2 |
| D2 删绑定 | DistillApi 删 `bind/listBooks`、DistillLabels 删 `chooseBookMsg/boundMsg/bindFailMsg/bindLabelPrefix` 四键 | BR-3 |
| D2 只读徽标 | `已绑定：` + `《title》` 拼接；无绑定不渲染 | BR-3/BR-4 |
| D3 风格唯一入口 | 蒸馏页风格分区无绑定控件=守护断言（现无入口，钉死不回潮） | BR-4 |
| D4 字段名 | `draftText`（shared `BlueprintSuggestBody` + `routes.ts:65` schema 同名） | BR-5/BR-6 |
| D4 槽形态 | planner 槽 `name:'draftText'`、`budgetChars:3000`、`stable:false`、`keep:'head'`，插在 prevTail 与 task 之间 | BR-5 |
| D4 空草稿 | `蓝图草稿为空：请先填写蓝图 JSON 或章节草稿文字`，不发请求 | BR-6 |
| D5 仿写统一 | 四类全走「列表归蒸馏页、绑定归书页」；仿写绑定条挂 sec-style fewshot 块 `:1005-1030` 后；蒸馏页仿写卡无绑定控件；融合门 `:418` 指引改指书页 | BR-7a/BR-7b |

### 2.2 锚点表（只读实读；行号快照，改前；#31-39 为 D5 追加时同日快照核实）

| # | 锚点 | 现状（改前） | 处置 |
| --- | --- | --- | --- |
| 1 | `apps/web/src/pages/BookDetailPage.tsx:113-319` | StyleBindPanel 组件（多选融合面板）；`:992-1003` 挂载于 sec-style | **零改动**（D1「风格面板本身不动」）；BR-2 的 ProfileBindBar 只对齐其 select+按钮样式 |
| 2 | 同上 `:552-560` | `bindStyle` → `api.bindStyle` → PUT `/api/books/:bookId/style`，成功 `void refetch()` | 复制该 handler 形态为 `bindPlotProfile`/`bindSpectrumProfile`（BR-2） |
| 3 | 同上 `:807-832` | sec-worldview：世界观 textarea `:810-817` + 剧情大纲 textarea `:818-825` + 保存设定 `:826-830` | 剧情大纲 textarea 后插剧情绑定条（BR-2） |
| 4 | 同上 `:842-963` | sec-characters：`CardHeader 人物卡` `:843`、`p-4` `:844`、`<ul>` `:845`；实例化按钮 `:950-959` 消费 `book.spectrumProfileId`；指引文案 `:961` `请先在「光谱档案」页绑定档案` | p-4 顶部插光谱绑定条（BR-2）；指引文案随迁改 `请先在上方绑定人物光谱档案`（BR-2；蒸馏页绑定入口已删，旧指引指向不存在入口） |
| 5 | 同上 `:347-352` | `useQuery`：book 4s 轮询 `:347`、style-profiles `:348`、characters `:349` | 旁增 `['plot-profiles']`/`['spectrum-profiles']` 两查询（BR-2） |
| 6 | 同上 `:460-482` | `suggest()`：useSeed→JSON.parse 成功传 seed、失败 `:468` 红字 `当前蓝图草稿不是合法 JSON，无法作为扩展种子` 中止 | 空草稿 guard；解析失败改发 `draftText`；成功消息分叉（BR-6）；`:468` 文案删除（全库无测试钉它，已核） |
| 7 | 同上 `:1113-1118` | 「AI 建议蓝图」（不传 seed）+「基于已有草稿扩展」（useSeed）两按钮 | 按钮零改动（BR-6 只改 suggest 内部） |
| 8 | `apps/web/src/components/DistillProfilesShell.tsx:89-95` | `DistillApi{analyze,save,remove,bind,listBooks}` | 删 `bind`+`listBooks`（BR-3） |
| 9 | 同上 `:97-128` | `DistillLabels` 含 `chooseBookMsg:123/boundMsg:124/bindFailMsg:125/bindLabelPrefix:126` | 删四键（BR-3） |
| 10 | 同上 `:146-157` | books 查询 `:146` + `bindBook` state `:157` | 随绑定 UI 一并删（BR-3） |
| 11 | 同上 `:225-242` | `bind` 函数（选择校验→api.bind→boundMsg） | 删（BR-3） |
| 12 | 同上 `:281-298` | 卡片行绑定 select+「绑定」按钮 | 删；`:259` sourcePath span 后加只读徽标（BR-3） |
| 13 | `apps/web/src/pages/PlotProfilesSection.tsx:10-16` | `api={analyze,save,remove,bind:api.bindPlot,listBooks:api.listBooks}` | 删 bind/listBooks；`:44-47` 四 label 键删（BR-3） |
| 14 | `apps/web/src/pages/SpectrumProfilesSection.tsx:10-16` | 同上（bindSpectrum） | 同上（BR-3） |
| 15 | `apps/web/src/pages/StyleProfilesSection.tsx:284-324` | 风格卡行：名称+版本/时间/句长中位数/自评+重新蒸馏/版本/查看/删除；**无绑定控件**（D3 现状核实） | `:291` 行尾加只读徽标（BR-4）；另加守护断言钉死无绑定入口 |
| 16 | 同上 `:547` | 挂载 `ImitationProfilesSection`（仿写分区，自带绑定下拉） | 挂载点零改动；分区内部绑定 UI 处置移交 BR-7b（D5 并入，见 §3.7） |
| 17 | `apps/web/src/api/client.ts:184-188/:197-201/:272-273` | `bindPlot`/`bindSpectrum`/`bindStyle` 全为 PUT | **零改动**（书页直接复用） |
| 18 | `packages/shared/src/api.ts:219-227` | `BlueprintSuggestBody{chapterNo,seed?}` | 增 `draftText?: string`（BR-5） |
| 19 | 同上 `:9-27` | `BookDto` 含 `spectrumProfileId:20`（FB-F2-3 补齐）但**缺 `plotProfileId`** | 增 `plotProfileId?: string \| null`（BR-1；注释沿 :19-20 spectrumProfileId 先例） |
| 20 | 同上 `:339-346/:573-579/:598-605` | `StyleProfileDto`/`PlotProfileDto`/`SpectrumProfileDto` | 各增 `boundBooks?: Array<{ id: string; title: string }>`（BR-1） |
| 21 | `apps/server/src/http/routes.ts:65` | `blueprintSuggestSchema` 内联（**不在 schemas.ts**） | 增 `draftText: z.string().min(1).max(20000).optional()`（BR-5） |
| 22 | 同上 `:424-432` | 单章 POST → `suggestBlueprintCore(bookId, body.chapterNo, body.seed)` | 调用增传 `body.draftText`（BR-5） |
| 23 | 同上 `:434-452` | batch 端点 `:444` 调 `suggestBlueprintCore` 不带 seed | **零改动**（批量不吃 draftText） |
| 24 | 同上 `:454-502` | core：plotBrief `:467-472`/spectrumBrief `:473-478`/worldview `:490`/slots `:492-502`（task 槽 `:501` 最后） | 增 draftTextBrief + 槽（插 prevTail `:500` 与 task `:501` 之间）（BR-5） |
| 25 | 同上 `:522-524` | `warnings`（worldview 超限文案先例） | 并列 `散文草稿超 3000 字，planner 草稿槽已按 head 截断`（BR-5） |
| 26 | 同上 `:557-558` | `mergeSeedIntoBlueprint(seed, blueprint)`（FB-F4-2 确定性合并） | **零改动**（合法 JSON 路径原样保留） |
| 27 | 同上 `:919-931/:1156/:1195` | 三 list 端点响应无 boundBooks（已核实） | 逐条附 boundBooks（BR-1） |
| 28 | `apps/server/src/db/repositories/books.ts:103-105` | `listBooks` | 旁增 `listBooksBoundToProfile`（BR-1） |
| 29 | `apps/server/src/fusion/apply.ts:84-96` | confirm 事务可写 plot/spectrum 绑定 | **零改动**（守） |
| 30 | 迁移 0010/0012/0013 | book_style_profiles 关联表 / books.plot_profile_id / books.spectrum_profile_id | **零改动**；本批无新迁移 |
| 31 | `apps/web/src/pages/ImitationProfilesSection.tsx:13/:15/:23/:83-100/:132-149` | books 查询/books 变量/bindBook state/bind 函数/绑定 select（aria-label=`绑定书-${p.name}`）+「绑定」按钮 | 五处全删（BR-7b）；`:115` sourcePath span 后加只读徽标（BR-7b） |
| 32 | 同上 `:104-158` | 仿写分区独立渲染列表卡（自带 `<ul>`，**不经 DistillProfilesShell/ProfilesListShell**） | 列表卡结构/表单/文件选择/删除 L2 零改动（BR-3 壳瘦身不触及本文件，BR-7b 卡内等价处置） |
| 33 | `apps/web/src/pages/StyleProfilesSection.tsx:547` | `<ImitationProfilesSection />` 挂载 | 挂载点零改动 |
| 34 | `apps/web/src/pages/BookDetailPage.tsx:992-1032/:710` | sec-style（StyleBindPanel `:995-1003`+fewshot 块 `:1005-1030`，p-4 闭合 `:1031`）；`:710` 顶部「仿写已绑」chip | fewshot 块 `:1030` 后、p-4 闭合 `:1031` 前插仿写绑定条（BR-7b）；chip 保留（状态展示非绑定入口） |
| 35 | `apps/web/src/components/FusionGateDialog.tsx:418` | 重绑指引「要重新绑定，请到「蒸馏」页里对应档案的绑定框」 | 文案改指书页分区绑定条（BR-7b；BR-3 摘除蒸馏页绑定框后已失实；grep 全库无测试钉此串，已核；同文件 :385「去蒸馏页改档案」文案不受影响——列表管理仍在蒸馏页） |
| 36 | `apps/server/src/http/routes.ts:1117/:1125-1135` | GET `/api/imitation-profiles` 直返 `listImitationProfiles`；PUT 绑定路由+404 守卫齐备 | GET 改 map 附 boundBooks（BR-7a）；PUT **零改动** |
| 37 | `packages/shared/src/api.ts:553-559/:18` | `ImitationProfileDto` 五键；`BookDto.imitationProfileId` **已在**（与 plotProfileId 类型缺口不同，已核） | ImitationProfileDto 增 `boundBooks?`（BR-7a）；BookDto 零改动 |
| 38 | `apps/server/src/db/repositories/books.ts:216`、迁移 0005（0005_round4_scope.sql:36） | `setBookImitation`/`books.imitation_profile_id` 镜像列（plot 0012/spectrum 0013 先例源头） | **零改动**；本批无新迁移 |
| 39 | `apps/server/src/fusion/apply.ts:98-103` | confirm 事务可写 imitation 绑定（`setBookImitation`） | **零改动**（守） |

### 2.3 改后数据流

- **绑定**：书页 ProfileBindBar 选择档案 →「保存绑定」→ `api.bindPlot/bindSpectrum`（PUT，body `{profileId}` 或 `{profileId:null}` 解绑）→ books 镜像列落库（后端不动）→ `void refetch()` 4s 轮询回存 `book.plotProfileId/spectrumProfileId` → 绑定条当前绑定文案与「实例化人物卡」禁用态联动。蒸馏页卡片徽标数据：list 端点 → `listBooksBoundToProfile` 反查（style=关联表 JOIN，plot/spectrum=镜像列）→ `boundBooks` 字段 → 三卡行只读渲染。仿写同构（BR-7）：书页 sec-style 条 `api.bindImitation` → `books.imitation_profile_id` 落库 → 绑定条回显与顶部「仿写已绑」chip（`:710`）同源联动；蒸馏页仿写卡徽标数据来自 GET `/api/imitation-profiles` 的 `boundBooks`（kind `'imitation'` 镜像列反查）。
- **散文扩写**：蓝图 textarea 直输中文 → 点「基于已有草稿扩展」→ trim 空守卫；JSON.parse 失败 → `{chapterNo, draftText: 原文}` POST → schema 校验 → draftText 槽（3000 head 截断+超限 warning）进 planner user → LLM 按 GOAL/BEATS/HOOK/LANDING 协议产出 → 前端整体回填 textarea + 消息 `已按散文草稿扩写为第 N 章蓝图…`。合法 JSON 仍走 seed→mergeSeedIntoBlueprint 确定性合并（:558），默认「AI 建议蓝图」按钮恒 `{chapterNo}`（R-F4-3 钉死）。

### 2.4 范围与红线（逐项锁死）

1. **写白名单**（每卡源文件 ≤3，shared 纯类型文件与测试另计）：`packages/shared/src/api.ts`、`apps/server/src/db/repositories/books.ts`、`apps/server/src/http/routes.ts`、新增 `apps/web/src/components/ProfileBindBar.tsx`、`apps/web/src/pages/BookDetailPage.tsx`、`apps/web/src/components/DistillProfilesShell.tsx`、`apps/web/src/pages/PlotProfilesSection.tsx`、`apps/web/src/pages/SpectrumProfilesSection.tsx`、`apps/web/src/pages/StyleProfilesSection.tsx`、`apps/web/src/pages/ImitationProfilesSection.tsx`（BR-7b）、`apps/web/src/components/FusionGateDialog.tsx`（仅 :418 一行文案，BR-7b）。
2. **禁改**：四个 PUT 绑定路由（`routes.ts:872/:1125-1135/:1164/:1203`）与 `plotBindSchema/spectrumBindSchema/imitationBindSchema`；`mergeSeedIntoBlueprint`（`blueprint-merge.ts`）与 seed 合并语义；`fusion/apply.ts`；`routes.ts:462-464/:495` imitation 注入与槽预算 600、`:467-478` plot/spectrum 注入与槽预算 1500；`book_style_profiles`/`books.plot_profile_id`/`books.spectrum_profile_id`/`books.imitation_profile_id` 存储面（无新迁移）；`StyleBindPanel` 组件本体与挂载（`BookDetailPage.tsx:113-319/:992-1003`）；人物卡 CRUD 与 409 语义；`renderCharacterCards`；批量端点 `:434-452`（不吃 draftText）；`apps/server/data/**`；融合门确认机制与张力把手（DEC-2026-1124-01/03/04，仅 :418 指引文案例外）。
3. **R-F4-3 语义钉死**（DEC-2026-1125-03）：默认「AI 建议蓝图」按钮不传 seed/draftText；`BookDetailPage.test.tsx:411-435` 用例零改动且保持绿。
4. **徽标只读**：徽标 span 无任何 onClick/表单控件；绑定动作只存在于书页 ProfileBindBar（剧情/光谱/仿写三类）与风格 StyleBindPanel。
5. **仿写分区并入（D5）**：`ImitationProfilesSection`（挂在 StyleProfilesSection:547）由原「零触碰」改为 BR-7b 处置——删绑定 UI（books 查询/bindBook state/bind 函数/select+按钮）保列表+徽标；该分区不经 DistillProfilesShell，故不走 BR-3 壳瘦身通道，BR-7b 卡内等价处置；owner 2026-11-26 追加拍板（§0.1 D5），原「留 owner 后续批次定夺」条款作废。
6. **D3 现状核实**：蒸馏页风格卡今日已无绑定入口（grep 全文仅 409 删除保护文案 :311 与 :223-228 错误文案命中「绑定」）；D3 落地为 BR-4 守护断言（断言风格分区无绑定 select/按钮），非删除动作。
7. draftText 与 seed 前端互斥（同一 suggest 调用二选一）；server schema 不加 refine（两键独立可选，最小面）；空串/超 20000 字 draftText 由 zod 400 兜底，**禁 500**。
8. **融合门边界**：FusionGateDialog 的 planner 行「作为参考/不作为参考」属生成前确认门机制（DEC-2026-1124-01/03/04），非蒸馏页绑定入口，本批零机制改动；仅 `:418` 重绑指引文案随绑定迁址改指书页（BR-3 摘框后已失实）；同文件 `:385`「去蒸馏页改档案」文案不动（档案列表管理仍在蒸馏页，语义不变）。

### 2.5 受牵连测试处置表（三态齐；不许净减）

| # | 测试文件:行 | 钉的值 | 处置 | 任务 |
| --- | --- | --- | --- | --- |
| T1 | `apps/web/src/pages/PlotProfilesSection.test.tsx:175-195` | 绑定书下拉→PUT `/api/books/b1/plot` `{profileId:'pp1'}`+已绑定消息 | **改写**：断言无绑定 select/按钮 + 徽标 `已绑定：《测试书》`（PUT 断言随功能迁移入 BR-2 新例，不净减） | BR-3 |
| T2 | `apps/web/src/pages/SpectrumProfilesSection.test.tsx:134-154` | 同上（spectrum） | **改写**：同 T1 口径 | BR-3 |
| T3 | `apps/web/src/components/DistillProfilesShell.test.tsx:47-61` | 双壳 file input id 隔离三例 | **不动**（守；shell 改动不触碰 file input 路径） | BR-3 守 |
| T4 | `apps/web/src/pages/DistillPage.test.tsx:44/:57` | 模板编辑+表单渲染 | **不动**（守；删 books 查询不影响渲染断言） | BR-3 守 |
| T5 | `apps/web/src/pages/StyleProfilesSection.test.tsx:594-617` | 删除 409 被书绑定拒绝+人话书名列表 | **不动**（守；删除保护语义不变） | BR-4 守 |
| T6 | `apps/web/src/pages/BookDetailPage.test.tsx:411-435`（R-F4-3） | seed 请求体+默认按钮不传 seed | **不动**（守；散文分支不得触碰该例） | BR-6 守 |
| T7 | 同上 `:575-606/:970-1011` | StyleBindPanel 解绑/已绑初值/多选保存 | **不动**（守；风格面板不动） | BR-2 守 |
| T8 | 同上 `:481-496`（R-F2-4） | 指引文本 `请先在「光谱档案」页绑定档案` | **随迁**：指引文本改后断言同步改（`请先在上方绑定人物光谱档案`），禁用+不静默隐藏断言保留 | BR-2 |
| T9 | `apps/server/test/http/blueprint-suggest.test.ts:80-87`（R-F4-1） | seed 畸形 400/合法 200 | **不动**（守；schema 只增可选键不破坏） | BR-5 守 |
| T10 | `apps/server/test/plot.test.ts:158-168`、`spectrum.test.ts:250-257` | 解绑/404 分支+list id 字段级断言 | **不动**（守；加字段不破坏字段级断言） | BR-1 守 |
| T11 | `apps/server/test/http/fusion-gate.test.ts`、`blueprint-merge.test.ts` | 融合门指纹/seed 合并 | **不动**（守；后端存储与注入链路不动） | 全批守 |
| T12 | `apps/web/src/pages/ImitationProfilesSection.test.tsx`（6 例） | 列表渲染/删除 L2 两例/前置校验两例/章数钳制/文件选择 | **不动**（守；六例均不钉绑定 UI；stubFetch 的 `/api/books` stub 在 books 查询删除后成无害残留，零断言） | BR-7b 守 |
| T13 | `apps/server/test/http/imitation.test.ts:86-96/:98-120` | list 字段级断言+绑定 404 守卫/字段往返/解绑 | **不动**（守；list 响应加 `boundBooks` 键不破坏字段级断言；PUT 路由零改动） | BR-7a 守 |

## 3. 规格（钉死的实现决定）

### 3.1 server 徽标数据链（BR-1）

- `packages/shared/src/api.ts`：
  - `BookDto`（:9-27）在 `spectrumProfileId:20` 后增 `plotProfileId?: string | null`，注释形态沿 :19-20 先例（「服务端 toBook 早已回传，web 类型面缺失」）；
  - `StyleProfileDto:339-346`、`PlotProfileDto:573-579`、`SpectrumProfileDto:598-605` 各增 `boundBooks?: Array<{ id: string; title: string }>;`（可选，零夹具冲击）。
- `apps/server/src/db/repositories/books.ts` 在 `listBooks:103-105` 后新增：
  `export function listBooksBoundToProfile(db: Database, kind: 'style' | 'plot' | 'spectrum', profileId: string): Array<{ id: string; title: string }>`
  - `kind==='style'`：`SELECT DISTINCT b.id, b.title FROM books b JOIN book_style_profiles m ON m.book_id = b.id WHERE m.profile_id = ? ORDER BY b.created_at DESC`（0010 关联表=引用真相，含辅档命中）；
  - 其余：列名=`plot_profile_id`/`spectrum_profile_id` 二选一（kind 固定字面量映射，**无用户输入拼接**），`SELECT id, title FROM books WHERE <列> = ? ORDER BY created_at DESC`。
- `apps/server/src/http/routes.ts`：
  - `GET /api/style-profiles` `:919-931`：`rows.map` 返回对象增 `boundBooks: booksRepo.listBooksBoundToProfile(db, 'style', r.id)`；
  - `GET /api/plot-profiles` `:1156` 改为 `plotRepo.listPlotProfiles(db).map((p) => ({ ...p, boundBooks: booksRepo.listBooksBoundToProfile(db, 'plot', p.id) }))`；
  - `GET /api/spectrum-profiles` `:1195` 同形（kind `'spectrum'`）。
  - 仓库层 `listPlotProfiles/listSpectrumProfiles` 返回形状**不动**（`plot.test.ts:80/:129` 直调仓库的既有断言不受影响）。

### 3.2 书页 ProfileBindBar + 双条挂载（BR-2）

- 新增 `apps/web/src/components/ProfileBindBar.tsx`（默认导出，约 30 行）：
  - Props：`{ label: string; profiles: Array<{ id: string; name: string }>; boundId: string | null | undefined; onBind: (profileId: string | null) => void }`；
  - 本地 `sel` state 初值 `boundId ?? ''`，`useEffect` 在 `boundId` 变化时重置 `sel`（绑定后 4s 轮询回存驱动回显）；
  - 渲染：`<span className="text-sm font-medium">{label}</span>` + `<select className={selectBase} aria-label={`${label}绑定`}>`（`value={sel}`；首项 `value=""` 文本 `（未绑定）`；其余 `p.name`）+ `<Button variant="primary" disabled={!sel || sel === boundId} onClick={() => onBind(sel)}>保存绑定</Button>` + `<Button variant="secondary" disabled={!boundId} onClick={() => onBind(null)}>解绑</Button>`（按钮变体与无 size 用法**逐字对齐 StyleBindPanel :311-316**）+ 行尾 `<span className="text-xs text-faint">{boundId ? `当前绑定：${boundName ?? '（档案已删除）'}` : '未绑定'}</span>`；
  - import 仅 `useEffect/useState`、`Button`（`./ui`）、`selectBase`（`./Field`）。
- `BookDetailPage.tsx`：
  - `:348` style-profiles 查询后旁增两查询：`['plot-profiles']→api.listPlotProfiles`、`['spectrum-profiles']→api.listSpectrumProfiles`（均 `refetchInterval: 5000`，沿 :348 形态）；
  - `bindStyle:552-560` 后并列两 handler，逐字镜像其 try/catch/refetch 形态：
    - `bindPlotProfile(profileId: string | null)`：`api.bindPlot(bookId, profileId)` → 消息 `profileId===null ? '剧情档案已解绑' : '剧情档案已绑定；AI 建议蓝图时将注入该剧情参考'` → `void refetch()`；catch `setMsg(\`剧情档案绑定失败：${apiErrorText(e)}\`)`；
    - `bindSpectrumProfile(profileId: string | null)`：`api.bindSpectrum(bookId, profileId)` → `'人物光谱档案已解绑'` / `'人物光谱档案已绑定；AI 建议蓝图时将注入该人物光谱参考'`；catch `人物光谱档案绑定失败：…`；
  - sec-worldview：`:825`（剧情大纲 textarea 闭合）与 `:826`（保存设定 div）之间插 `<ProfileBindBar label="剧情档案" profiles={Array.isArray(plotProfiles) ? plotProfiles : []} boundId={book?.plotProfileId ?? null} onBind={(id) => void bindPlotProfile(id)} />`；
  - sec-characters：`:844` `<div className="p-4">` 之后、`<ul>:845` 之前插 `<ProfileBindBar label="人物光谱档案" profiles={Array.isArray(spectrumProfiles) ? spectrumProfiles : []} boundId={book?.spectrumProfileId ?? null} onBind={(id) => void bindSpectrumProfile(id)} />`；
  - `:961` 指引文案改 `请先在上方绑定人物光谱档案`（id `instantiate-hint` 与 `aria-describedby` 结构不动）。

### 3.3 蒸馏页共享壳瘦身 + 徽标（BR-3）

- `DistillProfilesShell.tsx`：
  - `DistillApi:89-95` 删 `bind`、`listBooks` 两键；`BookLike:79-82` 若无残余引用一并删；
  - `DistillLabels:97-128` 删 `chooseBookMsg:123`、`boundMsg:124`、`bindFailMsg:125`、`bindLabelPrefix:126` 四键（interface 与类型推导同步）；
  - `:146` books useQuery、`:157` `bindBook` state、`:225-242` `bind` 函数、`:281-298` 绑定 select+按钮 JSX 全删；
  - `DistillProfileBase:84-87` 增 `boundBooks?: Array<{ id: string; title: string }>;`；
  - 卡片行 `:259`（sourcePath span）后加只读徽标：`{p.boundBooks && p.boundBooks.length > 0 && (<span className="text-xs text-primary-strong">已绑定：{p.boundBooks.map((b) => `《${b.title}》`).join('')}</span>)}`。
- `PlotProfilesSection.tsx:10-16`：api 对象删 `bind: api.bindPlot, listBooks: api.listBooks` 两行；labels 删 `:44-47` 四键（chooseBookMsg/boundMsg/bindFailMsg/bindLabelPrefix）。
- `SpectrumProfilesSection.tsx:10-16/:44-47`：同形处置（bindSpectrum）。

### 3.4 风格卡徽标 + D3 守护（BR-4）

- `StyleProfilesSection.tsx` 卡片行 `:291`（metrics span 闭合）后加与 §3.3 同款徽标 span（`p.boundBooks && p.boundBooks.length > 0` 守卫，文案逐字相同）。
- 本卡不改任何逻辑；守护断言见 §3.6 R-BR4-1。

### 3.5 蓝图散文 draftText（BR-5/BR-6）

- `packages/shared/src/api.ts:219-227`：`BlueprintSuggestBody` 增 `draftText?: string;`（与 `seed` 平级可选）。
- `routes.ts:65`：schema 末尾并列 `draftText: z.string().min(1).max(20000).optional()`（空串/超长由 parseBody 统一 400，禁 500）。
- `suggestBlueprintCore:454` 签名增第 4 参 `draftText?: string`；`:430` 调用改 `suggestBlueprintCore(bookId, body.chapterNo, body.seed, body.draftText)`；batch `:444` 调用**不动**。
- 注入（`:490` worldviewBrief 后并列）：
  `const draftTextBrief = draftText?.trim() ? \`【散文草稿】用户已为本章写好草稿，请保留其情节走向与要点，扩写为本章完整蓝图（GOAL/BEATS/HOOK/LANDING）：\n${draftText}\` : '';`
  槽（插在 `:500` prevTail 与 `:501` task 之间）：`...(draftTextBrief ? [{ name: 'draftText', content: draftTextBrief, budgetChars: 3000, stable: false, keep: 'head' as const }] : [])`。
- `:524` warning 并列：`if ((draftText?.length ?? 0) > 3000) warnings.push('散文草稿超 3000 字，planner 草稿槽已按 head 截断');`
- web `BookDetailPage.tsx` `suggest():460-482` 改：
  - 入口增空守卫：`const raw = blueprintText.trim(); if (raw === '') { setMsg('蓝图草稿为空：请先填写蓝图 JSON 或章节草稿文字'); return; }`；
  - `JSON.parse(raw)` 成功 → 现有 seed 路逐字不动；
  - 失败 catch 分支 → `body = { chapterNo, draftText: blueprintText };`（原文非 trim 副本）+ 本地标记 `proseMode = true`；
  - 成功回填后消息分叉：`proseMode ? \`已按散文草稿扩写为第 ${chapterNo} 章蓝图，可编辑后点「保存蓝图」\` : \`已填入第 ${chapterNo} 章蓝图建议，可编辑后点「保存蓝图」\``；
  - `:468` 红字文案与 return 一并删除（全库无测试钉它，已核：grep `合法 JSON` 仅 :468 一处命中）。

### 3.6 回归测试清册（先红后绿；名+断言钉死）

**BR-1（server，+3）**
1. `R-BR1-1`（新增，`apps/server/test/plot.test.ts`）`it('BR：GET /api/plot-profiles 逐条带 boundBooks（绑定书反查）', …)`：POST 建书→保存剧情档案→PUT `/api/books/:id/plot` `{profileId}`→GET `/api/plot-profiles` 断言 `listed[0].boundBooks` `toEqual([{ id: bookId, title: '…' }])`；未绑定第二档案 `boundBooks` `toEqual([])`。旧无字段→红。
2. `R-BR1-2`（新增，`apps/server/test/spectrum.test.ts`）同形：PUT `/spectrum` 后 GET `/api/spectrum-profiles` 断言 `boundBooks` 含书。旧无字段→红。
3. `R-BR1-3`（新增，`apps/server/test/http/style.test.ts`）`it('BR：GET /api/style-profiles 带 boundBooks（关联表反查，主辅都命中）', …)`：按该文件既有建档夹具造 1 主 1 辅两档案→PUT `/api/books/:id/style` 多选绑定→GET list 断言两档案 `boundBooks` 均含该书（**辅档也命中=关联表反查语义钉死**）。旧无字段→红。

**BR-2（web，+3；随迁 T8）**
4. `R-BR2-1`（新增，`BookDetailPage.test.tsx`）`it('BR：剧情绑定条——选择档案保存 → PUT /api/books/b1/plot {profileId}，消息+当前绑定回显', …)`：stub `/api/plot-profiles` 返回 `[{ id: 'pp1', name: '剧情甲', sourcePath: 'x', structure: [], createdAt: '…' }]`；`getByLabelText('剧情档案绑定')` 选 `pp1`→点「保存绑定」→断言 PUT body `{profileId:'pp1'}`（**迁移承接 T1 的 PUT 断言**）+ `findByText(/剧情档案已绑定/)`。旧无控件→红。
5. `R-BR2-2`（新增，同文件）`it('BR：光谱绑定条——保存 → PUT /api/books/b1/spectrum {profileId}，人物卡分区顶部可见', …)`：同形断言 `{profileId:'sp1'}`（**迁移承接 T2 的 PUT 断言**）。旧无控件→红。
6. `R-BR2-3`（新增，同文件）`it('BR：绑定条解绑 → PUT {profileId:null}；已绑书回显当前档案名', …)`：book 夹具 `plotProfileId:'pp1'`（列表 stub 同步给该档案）→断言「当前绑定：剧情甲」在场→选「（未绑定）」→「解绑」→PUT body `{profileId:null}`。旧无控件→红。
7. `T8 随迁`：`:495` 断言文本改 `/请先在上方绑定人物光谱档案/`（禁用+不静默隐藏两断言逐字保留）。

**BR-3（web，2 例改写）**
8. `R-BR3-1`（改写，`PlotProfilesSection.test.tsx` :175-195 原绑定例）`it('BR：蒸馏页剧情卡无绑定控件，徽标只读显示已绑定书', …)`：list stub 带 `boundBooks:[{ id:'b1', title:'测试书' }]`→断言 `queryByLabelText(/绑定书-/)` 为 null、`queryByRole('button', { name: '绑定' })` 为 null、`getByText(/已绑定：《测试书》/)` 在场；徽标元素无 select/button（只读钉死）。旧 UI 在场→红。
9. `R-BR3-2`（改写，`SpectrumProfilesSection.test.tsx` :134-154 原绑定例）同形（人物光谱）。旧 UI 在场→红。

**BR-4（web，+1）**
10. `R-BR4-1`（新增，`StyleProfilesSection.test.tsx`）`it('BR：风格卡徽标显示已绑定书；蒸馏页风格分区无任何绑定入口（D3 守护）', …)`：list stub 带 `boundBooks`→`getByText(/已绑定：《样本之书》/)`；同时 `within(section)` 断言 `queryByLabelText(/绑定书-/)` 与 `queryByRole('button', { name: '保存绑定' })` 均 null。旧无徽标→红。

**BR-5（server，+2）**
11. `R-BR5-1`（新增，`apps/server/test/http/blueprint-suggest.test.ts`）`it('BR：draftText 进 schema 且注入 planner user；空串 400（D4）', …)`：POST `{chapterNo:1, draftText:'主角夜探旧宅，发现密室'}`→200 且捕获 plannerReq.user 含 `【散文草稿】` 与原文；`{chapterNo:1, draftText:''}`→400。旧 schema 无键被剥离→断言 planner user 不含原文→红。
12. `R-BR5-2`（新增，同文件）`it('BR：draftText 超 3000 head 截断 + warning 可观测', …)`：draftText=`'甲'.repeat(2995)+'头部存活标'+'乙'.repeat(20)+'尾部牺牲标'`（总长>3000）→断言 user 含 `头部存活标` 不含 `尾部牺牲标`、响应 `warnings` 含 `散文草稿超 3000 字`。旧无槽→截断断言红。

**BR-6（web，+2）**
13. `R-BR6-1`（新增，`BookDetailPage.test.tsx`）`it('BR：直输中文散文点「基于已有草稿扩展」→ 发 draftText 不发 seed，回填蓝图+扩写消息', …)`：textarea 输入 `主角夜探旧宅，发现密室与旧信`→点按钮→断言 POST body `{chapterNo:…, draftText:…}` 且 `seed` undefined→stub 回蓝图→textarea 值变 JSON、消息含 `已按散文草稿扩写`。旧红字拒绝路径→请求不发→红。
14. `R-BR6-2`（新增，同文件）`it('BR：空草稿点扩展 → 就地提示不发请求', …)`：textarea 置空→点按钮→断言 `/blueprint-suggest` 调用数不增+`getByText(/蓝图草稿为空/)`。旧路径发请求→红。

**BR-7a（server，+1）**
15. `R-BR7-1`（新增，`apps/server/test/http/imitation.test.ts`）`it('BR：GET /api/imitation-profiles 逐条带 boundBooks（绑定书反查）', …)`：自持夹具（追加于文件末位，前序 delete 例已清空档案表）——POST `/api/imitation-profiles` `{draft}` 两存（同 hash 得 v1/v2 两行）→POST `/api/books` 建书→PUT `/api/books/:id/imitation` `{profileId: v1 行 id}`→GET `/api/imitation-profiles` 断言 v1 行 `boundBooks` `toEqual([{ id: bookId, title: '…' }])`、v2 行 `toEqual([])`。旧无字段→红。

**BR-7b（web，+2）**
16. `R-BR7-2`（新增，`BookDetailPage.test.tsx`）`it('BR：仿写绑定条——选择档案保存 → PUT /api/books/b1/imitation {profileId}，消息+当前绑定回显', …)`：stub `/api/imitation-profiles` 返回 `[{ id: 'ip1', name: '拆解甲', version: 1, sourcePath: 'x', createdAt: '…' }]`；书夹具带 `imitationProfileId:'ip1'` 时「当前绑定：拆解甲」在场；`getByLabelText('仿写档案绑定')` 选 `ip1`→点「保存绑定」→断言 PUT body `{profileId:'ip1'}`+`findByText(/仿写档案已绑定/)`。旧无控件→红。
17. `R-BR7-3`（新增，`ImitationProfilesSection.test.tsx`）`it('BR：蒸馏页仿写卡无绑定控件，徽标只读显示已绑定书', …)`：沿该文件既有 stubFetch 形态，PROFILE 夹具加 `boundBooks:[{ id:'b1', title:'测试书' }]` 键（其余六例不断言该键，零干扰）→断言 `queryByLabelText(/绑定书-/)` 为 null、`queryByRole('button', { name: '绑定' })` 为 null、`getByText(/已绑定：《测试书》/)` 在场；徽标元素无 select/button（只读钉死）。旧 UI 在场→红。

- 计数：server +6（R-BR1-1/2/3、R-BR5-1/2、R-BR7-1）；web 新增 +8（R-BR2-1/2/3、R-BR4-1、R-BR6-1/2、R-BR7-2/3）、改写 2（R-BR3-1/2，断言净增）、随迁 1（T8）。基线只增不减：server N0→≥N0+6、web W0→≥W0+8（N0/W0 执行者 A0 实跑记录，§4.1）。

### 3.7 仿写统一口径（BR-7a/BR-7b）

- **BR-7a（server 反查，复用 BR-1 通道，不另造轮子）**：
  - `packages/shared/src/api.ts` `ImitationProfileDto:553-559` 增 `boundBooks?: Array<{ id: string; title: string }>;`（可选，零夹具冲击）；
  - `apps/server/src/db/repositories/books.ts` `listBooksBoundToProfile`（BR-1 新增；执行序保证 BR-1 先落）kind 联合类型扩 `'imitation'`、列名映射补 `imitation_profile_id`（镜像列，SQL 与 plot/spectrum 同形：`SELECT id, title FROM books WHERE imitation_profile_id = ? ORDER BY created_at DESC`）；
  - `apps/server/src/http/routes.ts:1117` 改 `imitationRepo.listImitationProfiles(db).map((p) => ({ ...p, boundBooks: booksRepo.listBooksBoundToProfile(db, 'imitation', p.id) }))`；
  - 仓库层 `listImitationProfiles` 返回形状**不动**（`http/imitation.test.ts:86-96` 字段级断言不受影响）；PUT 绑定路由 `:1125-1135` 与 `imitationBindSchema` 零改动；无新迁移（imitation_profile_id 在 0005）。
- **BR-7b（web 双端，绿步卡内先立后破）**：
  - `BookDetailPage.tsx`：`:348` 查询族（BR-2 落地后含 plot/spectrum 两行）旁增 `['imitation-profiles']→api.listImitationProfiles`（`refetchInterval: 5000`）；handler 族（BR-2 后含 bindPlotProfile/bindSpectrumProfile）旁增 `bindImitationProfile(profileId: string | null)`：`api.bindImitation(bookId, profileId)` → 消息 `仿写档案已绑定；AI 建议蓝图时将注入该结构拆解` / `仿写档案已解绑` → `void refetch()`；catch `仿写档案绑定失败：${apiErrorText(e)}`；sec-style p-4 容器内 fewshot 块 `:1005-1030` 之后、p-4 闭合 `:1031` 之前插 `<div className="mt-2 border-t border-line pt-2"><ProfileBindBar label="仿写档案" profiles={Array.isArray(imitationProfiles) ? imitationProfiles : []} boundId={book?.imitationProfileId ?? null} onBind={(id) => void bindImitationProfile(id)} /></div>`（分隔形态沿 fewshot 块 `:1006` 先例；StyleBindPanel 与 fewshot 块零触碰）；
  - `ImitationProfilesSection.tsx`：删 `:13` books useQuery、`:15` books 变量、`:23` bindBook state、`:83-100` bind 函数、`:132-149` 绑定 select+「绑定」按钮 JSX（`useQuery` import 保留——`:12` imitation-profiles 查询仍用）；`:115` sourcePath span 后加只读徽标（字面量与 §3.3 徽标逐字相同：`{p.boundBooks && p.boundBooks.length > 0 && (<span className="text-xs text-primary-strong">已绑定：{p.boundBooks.map((b) => `《${b.title}》`).join('')}</span>)}`）；分区标题/列表卡结构/表单/文件选择/删除 L2 零改动；
  - `FusionGateDialog.tsx:418`：`要重新绑定，请到「蒸馏」页里对应档案的绑定框。` → `要重新绑定，请到书详情页对应分区的绑定条（剧情／人物光谱／仿写）。`（一行文案，其余零触碰）。

## 4. 全局约束

1. **基线记录（A0）**：开工先实跑 `pnpm test`（server 计数 N0）与 `pnpm --filter @inkforge/web test`（web 计数 W0）并记入执行记录；此后只增不减，收口 N≥N0+6、W≥W0+8。
2. **验证链硬序**（任一环失败即停回报，不得跳环）：定向测试（先红后绿）→ server/web 相关文件定向全绿 → `pnpm test` 全量（计数达标）→ `pnpm typecheck` → `pnpm lint`。工具链=项目现有配置（vitest 等），不引入新依赖。
3. **执行纪律**：同工作树 ≤1 卡串行，序 BR-1→BR-2→BR-3→BR-4→BR-5→BR-6→BR-7a→BR-7b（先立书页入口后摘蒸馏页入口；BR-7b 绿步卡内先立书页仿写条、后摘蒸馏页仿写控件，两动作同卡一提交原子落，无绑定无入口窗口）；每卡一次提交、只 commit 不 push，提交信息带 `verify:`（定向测试结果+基线数+「GUI 未验证」标注）与 `Refs: docs/plans/2026-11-26-bind-relocation-prose-draft.md`；永不 `--no-verify`、永不 `git add -A`。
4. **卡粒度**：每步 2-5 分钟、一步一动作+可核对结果；任务自带测试循环（红/绿/守三步）；无占位符、无「处理边界情况」类死行；每卡源文件 ≤3（shared 纯类型文件与测试另计）。
5. **GUI 实测一律延到批次收口由 owner 一次做**（点位清单见下）；agent 不安排任何自动化 GUI 目验步骤。
6. **写白名单**仅 §2.4.1；卡外问题即停回报；读大文件沿项目既有工具纪律。

### 附：GUI 实测点位清单（供 owner 收口呈报；本批不执行）

| 点位 | 操作 | 期望现象 |
| --- | --- | --- |
| 书详情·设定区（剧情大纲框旁） | 「剧情档案」条选档案→保存绑定；再解绑 | 消息「剧情档案已绑定/已解绑」；当前绑定文案回显；AI 建议蓝图注入【剧情参考】行为不变 |
| 书详情·人物卡分区顶部 | 「人物光谱档案」条绑定/解绑；未绑定点「实例化人物卡」 | 绑定消息+当前绑定回显；未绑时实例化按钮禁用+指引文案为「请先在上方绑定人物光谱档案」 |
| 书详情·风格档案区（仿写条） | 「仿写档案」条选档案→保存绑定；再解绑 | 消息「仿写档案已绑定/已解绑」；当前绑定文案回显；顶部「仿写已绑」chip 联动；AI 建议蓝图注入【结构拆解】行为不变 |
| 蒸馏页三卡 | 目检风格/剧情/光谱卡 | 无绑定下拉与按钮；卡片行徽标「已绑定：《书》」与书页绑定状态一致；蒸馏表单/预览/入库/删除/指纹展示不受影响 |
| 蒸馏页·仿写卡 | 目检仿写档案列表卡 | 只剩列表管理：无绑定下拉与按钮；卡行徽标「已绑定：《书》」与书页绑定状态一致；拆解分析/草稿预览/确认入库/删除/文件选择不受影响 |
| 书详情·蓝图编辑 | 直输纯中文散文→点「基于已有草稿扩展」 | 不再红字；回填完整蓝图 JSON+「已按散文草稿扩写…」消息 |
| 书详情·蓝图编辑（对照） | 合法 JSON 草稿→扩展；空草稿→扩展；默认「AI 建议蓝图」 | JSON 走 seed 合并（手写 beats 置前）；空草稿就地提示不发请求；默认按钮不带任何种子 |
| 融合门（回归） | 触发门/确认 | 指纹与行为同旧（本批未触碰注入面与确认机制）；planner 行「不作为参考」后重绑指引文案指向书详情页分区绑定条 |

## 5. 任务表（文件 / Interfaces / checkbox 步骤串）

### BR-1 server 徽标数据链（R-BR1-1/2/3）

- **文件**：改 `packages/shared/src/api.ts`（:9-27 BookDto、:339-346、:573-579、:598-605）；`apps/server/src/db/repositories/books.ts`（:103-105 后）；`apps/server/src/http/routes.ts`（:919-931、:1156、:1195）；测 `apps/server/test/plot.test.ts`、`test/spectrum.test.ts`、`test/http/style.test.ts`。
- **Interfaces / 接口**：Consumes=既有 `book_style_profiles` 关联表（0010）与 books 镜像列（0012/0013）；Produces=`booksRepo.listBooksBoundToProfile(db, kind, profileId): Array<{id,title}>`（新增导出）、三 list 端点响应逐条附 `boundBooks`、`BookDto.plotProfileId`、三档案 DTO `boundBooks?`。`listPlotProfiles/listSpectrumProfiles` 仓库签名与返回形状**不变**。
- **步骤**：
  - [ ] BR-1-S1（红，3-4 min）：按 §3.6 R-BR1-1/2/2/3 在三测试文件各加一例（plot/spectrum 沿各文件既有建档+PUT 夹具；style 沿 style.test.ts 既有建档夹具，一主一辅）；跑 `pnpm --filter @inkforge/server test -- test/plot.test.ts test/spectrum.test.ts test/http/style.test.ts -t 'boundBooks'`，核对结果=**3 红**（响应无 boundBooks）。
  - [ ] BR-1-S2（绿，4-5 min）：按 §3.1 加 DTO 键、repo helper、三端点 map；重跑 S1 命令核对=3 绿；随后跑 `pnpm --filter @inkforge/server test -- test/plot.test.ts test/spectrum.test.ts test/http/style.test.ts` 全量核对既有例零回归（T10 守）。
  - [ ] BR-1-S3（守，2 min）：`git diff -- apps/server/src/db/migrations` 输出为空（无新迁移）；`grep -n "listBooksBoundToProfile" apps/server/src/db/repositories/books.ts apps/server/src/http/routes.ts` 核对=定义 1 处+调用 3 处。

### BR-2 书页双绑定条（R-BR2-1/2/3 + T8 随迁）

- **文件**：新增 `apps/web/src/components/ProfileBindBar.tsx`；改 `apps/web/src/pages/BookDetailPage.tsx`（:348 后、:552-560 后、:825/:844 两挂点、:961 指引）；测 `apps/web/src/pages/BookDetailPage.test.tsx`。
- **Interfaces / 接口**：Consumes=`api.bindPlot/bindSpectrum`（client.ts:184/:197，零改动）、`api.listPlotProfiles/listSpectrumProfiles`（:181/:194）、`book.plotProfileId/spectrumProfileId`（BR-1 类型）；Produces=`ProfileBindBar` 默认导出组件、`bindPlotProfile/bindSpectrumProfile` 两个页内 handler。PUT 路由与 schema 零改动。
- **步骤**：
  - [ ] BR-2-S1（红，3-4 min）：按 §3.6 R-BR2-1/2/3 加三例（stub list 端点；R-BR2-3 用 `plotProfileId:'pp1'` 书夹具）、按 T8 改 :495 指引断言文本；跑 `pnpm --filter @inkforge/web test -- BookDetailPage.test.tsx -t 'BR：'`，核对结果=**3 红**（无绑定条控件）。
  - [ ] BR-2-S2（绿，4-5 min）：按 §3.2 新建 ProfileBindBar、加两查询两 handler、挂两条、改指引文案；重跑 S1 命令核对=3 绿；跑 `pnpm --filter @inkforge/web test -- BookDetailPage.test.tsx` 全量核对 R-F4-3/:575/:970/:481 既有例仍绿（T7/T8 守）。
  - [ ] BR-2-S3（守，2 min）：`grep -n "ProfileBindBar" apps/web/src/pages/BookDetailPage.tsx` 核对=import 1+挂载 2；`git diff -- apps/web/src/pages/BookDetailPage.tsx | grep -c "StyleBindPanel"` 核对风格面板区块零触碰（diff 仅新增行）。

### BR-3 蒸馏页共享壳瘦身 + 徽标（R-BR3-1/2）

- **文件**：改 `apps/web/src/components/DistillProfilesShell.tsx`；`apps/web/src/pages/PlotProfilesSection.tsx`；`apps/web/src/pages/SpectrumProfilesSection.tsx`；测 `PlotProfilesSection.test.tsx`、`SpectrumProfilesSection.test.tsx`。
- **Interfaces / 接口**：Consumes=`DistillProfileBase.boundBooks?`（本卡新增键）；Produces=`DistillApi` 删 bind/listBooks、`DistillLabels` 删四键、卡片行只读徽标。`ProfilesListShell`、analyze/save/remove/草稿预览/file input 路径零改动。
- **步骤**：
  - [ ] BR-3-S1（红，3 min）：按 §3.6 R-BR3-1/2 改写两例（list stub 加 boundBooks；断言无绑定控件+徽标在场）；跑 `pnpm --filter @inkforge/web test -- PlotProfilesSection.test.tsx SpectrumProfilesSection.test.tsx -t 'BR：'`，核对结果=**2 红**（旧绑定控件在场/无徽标）。
  - [ ] BR-3-S2（绿，4-5 min）：按 §3.3 删 bind 函数/state/books 查询/下拉按钮/接口键/labels 四键，加 DistillProfileBase.boundBooks 与徽标 span，两 Section 配置瘦身；重跑 S1 命令核对=2 绿；跑 `pnpm --filter @inkforge/web test -- PlotProfilesSection.test.tsx SpectrumProfilesSection.test.tsx DistillProfilesShell.test.tsx DistillPage.test.tsx` 核对 file input 三例与蒸馏页两例零回归（T3/T4 守）。
  - [ ] BR-3-S3（守，2 min）：`grep -n "bindBook\|api.bind\|listBooks\|chooseBookMsg\|boundMsg\|bindFailMsg\|bindLabelPrefix" apps/web/src/components/DistillProfilesShell.tsx apps/web/src/pages/PlotProfilesSection.tsx apps/web/src/pages/SpectrumProfilesSection.tsx` 核对=**零命中**；`grep -n "已绑定" apps/web/src/components/DistillProfilesShell.tsx` 核对=徽标渲染 1 处。

### BR-4 风格卡徽标 + D3 守护（R-BR4-1）

- **文件**：改 `apps/web/src/pages/StyleProfilesSection.tsx`（:291 行尾）；测 `apps/web/src/pages/StyleProfilesSection.test.tsx`。
- **Interfaces / 接口**：Consumes=`StyleProfileDto.boundBooks?`（BR-1 类型）；Produces=卡片行只读徽标 span（与 BR-3 同款字面量）。卡内其余按钮/面板零改动。
- **步骤**：
  - [ ] BR-4-S1（红，2-3 min）：按 §3.6 R-BR4-1 加一例（该文件既有 list stub 加 boundBooks）；跑 `pnpm --filter @inkforge/web test -- StyleProfilesSection.test.tsx -t 'BR：'`，核对结果=**1 红**（无徽标）。
  - [ ] BR-4-S2（绿，2-3 min）：按 §3.4 加徽标 span；重跑 S1 命令核对=1 绿；跑 `pnpm --filter @inkforge/web test -- StyleProfilesSection.test.tsx` 全量核对 409 删除保护例等零回归（T5 守）。
  - [ ] BR-4-S3（守，2 min）：`grep -n "绑定" apps/web/src/pages/StyleProfilesSection.tsx` 核对=仅 :311 删除确认警示与 409 文案两处既有命中，无新增绑定控件行；`git diff -- apps/web/src/pages/ImitationProfilesSection.tsx` 输出为空（BR-7b 执行前仿写仍零触碰，§2.4.5→D5；执行序保证本卡先于 BR-7b，时点 diff 为空即守）。

### BR-5 蓝图散文 draftText·server（R-BR5-1/2）

- **文件**：改 `packages/shared/src/api.ts`（:219-227）；`apps/server/src/http/routes.ts`（:65、:430、:454、:490 后、:500/:501 间、:524）；测 `apps/server/test/http/blueprint-suggest.test.ts`。
- **Interfaces / 接口**：Consumes=`blueprintSuggestSchema`（zod）、planner 槽机制（stable=false 进 user）；Produces=`BlueprintSuggestBody.draftText?`、`suggestBlueprintCore(bookId, chapterNo, seed?, draftText?)`、`draftText` 槽与超限 warning。batch 端点、mergeSeedIntoBlueprint、expectsLanding 判定零改动。
- **步骤**：
  - [ ] BR-5-S1（红，3 min）：按 §3.6 R-BR5-1/2 加两例；跑 `pnpm --filter @inkforge/server test -- test/http/blueprint-suggest.test.ts -t 'BR：'`，核对结果=**2 红**（schema 剥离 draftText→user 无原文；无槽→无截断）。
  - [ ] BR-5-S2（绿，4 min）：按 §3.5 加类型键、schema 键、core 第 4 参与调用、draftTextBrief+槽+warning；重跑 S1 命令核对=2 绿；跑 `pnpm --filter @inkforge/server test -- test/http/blueprint-suggest.test.ts test/http/blueprint-merge.test.ts test/http/blueprint-batch.test.ts` 核对 R-F4-1/合并/批量既有例零回归（T9 守）。
  - [ ] BR-5-S3（守，2 min）：`grep -n "draftText" apps/server/src/http/routes.ts packages/shared/src/api.ts` 核对=schema 1+core 签名/调用/brief/槽/warning 各 1、shared 1；`git diff -- apps/server/src/http/routes.ts` 目视 :434-452 batch 段零改动。

### BR-6 蓝图散文·web（R-BR6-1/2）

- **文件**：改 `apps/web/src/pages/BookDetailPage.tsx`（:460-482）；测 `apps/web/src/pages/BookDetailPage.test.tsx`。
- **Interfaces / 接口**：Consumes=`BlueprintSuggestBody.draftText`（BR-5）；Produces=suggest() 三分支（空守卫/seed 原路/draftText 散文路）+ 消息分叉；按钮区 :1113-1118 与 api.suggestBlueprint 调用形态零改动。
- **步骤**：
  - [ ] BR-6-S1（红，2-3 min）：按 §3.6 R-BR6-1/2 加两例；跑 `pnpm --filter @inkforge/web test -- BookDetailPage.test.tsx -t 'BR：直输中文散文|BR：空草稿'`，核对结果=**2 红**（旧路径红字拒绝不发请求→断言落空）。
  - [ ] BR-6-S2（绿，3-4 min）：按 §3.5 改 suggest()（守卫+catch 分支改 draftText+消息分叉+删 :468 红字）；重跑 S1 命令核对=2 绿；跑 `pnpm --filter @inkforge/web test -- BookDetailPage.test.tsx` 全量核对 R-F4-3 :411-435 逐字不动仍绿（T6 守，**本步禁改该例**）。
  - [ ] BR-6-S3（守，2 min）：`grep -n "合法 JSON" apps/web/src/pages/BookDetailPage.tsx` 核对=**零命中**（红字文案已删）；`grep -n "useSeed: true" apps/web/src/pages/BookDetailPage.tsx` 核对=仅「基于已有草稿扩展」按钮 1 处。

### BR-7a server 仿写 boundBooks 反查（R-BR7-1）

- **文件**：改 `packages/shared/src/api.ts`（:553-559，纯类型另计）；`apps/server/src/db/repositories/books.ts`（listBooksBoundToProfile kind 扩枚举+列名映射）；`apps/server/src/http/routes.ts`（:1117）；测 `apps/server/test/http/imitation.test.ts`。
- **Interfaces / 接口**：Consumes=BR-1 `listBooksBoundToProfile`（执行序保证已存在）与 `books.imitation_profile_id` 镜像列（0005）；Produces=`ImitationProfileDto.boundBooks?`、GET `/api/imitation-profiles` 响应逐条附 `boundBooks`。PUT 绑定路由/`imitationBindSchema`/仓库 list 返回形状/迁移零改动。
- **步骤**：
  - [ ] BR-7a-S1（红，2-3 min）：按 §3.6 R-BR7-1 在 `test/http/imitation.test.ts` 末位加一例（自持夹具：两存 draft+建书+PUT）；跑 `pnpm --filter @inkforge/server test -- test/http/imitation.test.ts -t 'BR：'`，核对结果=**1 红**（响应无 boundBooks）。
  - [ ] BR-7a-S2（绿，3-4 min）：按 §3.7 加 DTO 键、kind 扩 `'imitation'` 与列名映射、`:1117` map；重跑 S1 命令核对=1 绿；跑 `pnpm --filter @inkforge/server test -- test/http/imitation.test.ts test/imitation.test.ts` 全量核对既有例零回归（T13 守）。
  - [ ] BR-7a-S3（守，2 min）：`git diff -- apps/server/src/db/migrations` 输出为空（无新迁移）；`grep -n "listBooksBoundToProfile" apps/server/src/db/repositories/books.ts apps/server/src/http/routes.ts` 核对=定义 1 处+调用 4 处（style/plot/spectrum/imitation）。

### BR-7b web 仿写双端统一（R-BR7-2/3）

- **文件**：改 `apps/web/src/pages/BookDetailPage.tsx`（查询族+handler 族+sec-style 挂点，锚点见 §2.2#34）；`apps/web/src/pages/ImitationProfilesSection.tsx`（五删一增，§3.7）；`apps/web/src/components/FusionGateDialog.tsx`（:418 文案一行）；测 `apps/web/src/pages/BookDetailPage.test.tsx`、`apps/web/src/pages/ImitationProfilesSection.test.tsx`。
- **Interfaces / 接口**：Consumes=`ProfileBindBar`（BR-2 组件，零改动）、`api.bindImitation`（client.ts:171-172，零改动）、`api.listImitationProfiles`（:168）、`ImitationProfileDto.boundBooks?`（BR-7a 类型）、`book.imitationProfileId`（shared:18 已有）；Produces=书页仿写绑定条+`bindImitationProfile` handler、蒸馏页仿写卡瘦身+只读徽标、融合门指引新文案。
- **步骤**：
  - [ ] BR-7b-S1（红，3-4 min）：按 §3.6 R-BR7-2/3 加两例；跑 `pnpm --filter @inkforge/web test -- BookDetailPage.test.tsx ImitationProfilesSection.test.tsx -t 'BR：'`，核对结果=**2 红**（书页无仿写条/蒸馏页旧绑定控件在场）。
  - [ ] BR-7b-S2（绿，4-5 min）：按 §3.7 顺序落码——先书页（查询+handler+挂条，立）后蒸馏页（删五处绑定 UI+加徽标，破）+门文案；重跑 S1 命令核对=2 绿；跑 `pnpm --filter @inkforge/web test -- BookDetailPage.test.tsx ImitationProfilesSection.test.tsx` 全量核对既有例零回归（T12 守；R-F4-3/StyleBindPanel 例不触，T6/T7 守）。
  - [ ] BR-7b-S3（守，2 min）：`grep -n "bindBook\|api.bindImitation\|绑定书-" apps/web/src/pages/ImitationProfilesSection.tsx` 核对=**零命中**；`grep -n "已绑定" apps/web/src/pages/ImitationProfilesSection.tsx` 核对=徽标渲染 1 处（删除确认文案「已绑定书将自动解绑」不计入——按行核对）；`git diff -- apps/web/src/components/FusionGateDialog.tsx` 核对=仅 :418 指引文案一行变更。

## 6. 验收（项目根目录执行）

1. **基线与计数**：server `pnpm test` 全绿且计数 ≥N0+6；web `pnpm --filter @inkforge/web test` 全绿且计数 ≥W0+8；两基线数与执行记录一致，无删例（`git log --numstat` 抽查测试文件仅 + 行）。
2. **定向链**：`pnpm --filter @inkforge/server test -- test/plot.test.ts test/spectrum.test.ts test/http/style.test.ts test/http/blueprint-suggest.test.ts test/http/imitation.test.ts` 全绿；`pnpm --filter @inkforge/web test -- BookDetailPage.test.tsx PlotProfilesSection.test.tsx SpectrumProfilesSection.test.tsx StyleProfilesSection.test.tsx ImitationProfilesSection.test.tsx DistillProfilesShell.test.tsx DistillPage.test.tsx` 全绿。
3. **静态**：`pnpm typecheck`、`pnpm lint` 全绿。
4. **禁改面抽查**：`git diff -- apps/server/src/db/migrations apps/server/src/fusion` 输出为空；`git diff -- apps/web/src/components/FusionGateDialog.tsx` 仅 :418 指引文案一行；`grep -n "draftText" apps/server/src/http/routes.ts` 命中且 batch 段无 draftText；`grep -c "mergeSeedIntoBlueprint" apps/server/src/http/routes.ts` 与改前持平（1 import 调用不变）。
5. **红线复述**：R-F4-3 默认按钮不传 seed/draftText 的既有用例原样在库且绿；四个 PUT 绑定路由（style/plot/spectrum/imitation）零 diff；StyleBindPanel 组件零 diff。
6. **GUI**：本批不执行；§4 附表点位清单随收口呈报 owner，提交信息 `verify:` 含「GUI 未验证」。

## 7. 自审五查（写完计划即执行，逐条打勾留痕；2026-11-26 D5 追加后复审更新）

- [x] **规格覆盖** — 五项拍板逐条映射 §0.1/§2.1/任务：D1→BR-2、D2→BR-1/3/4、D3→BR-4 守护、D4→BR-5/6、D5→BR-7a/7b；§3.6 十七例（新增 14+改写 2+随迁 1）均带测试名与断言；改前锚点 39 条逐条有处置（§2.2，含 D5 追加核实 9 条）；受牵连测试 T1-T13 三态齐（§2.5）。
- [x] **步骤唯一可写** — 各卡落点唯一：BR-1=api.ts 四 DTO/books.ts helper/routes.ts 三端点；BR-2=新组件+BookDetailPage 四处；BR-3=Shell 六删一增+两 Section 配置；BR-4=一行徽标；BR-5=schema/调用/签名/brief/槽/warning；BR-6=suggest() 单函数；BR-7a=api.ts 一键/books.ts kind 扩/routes.ts :1117 map；BR-7b=BookDetailPage 三处+ImitationProfilesSection 五删一增+FusionGateDialog 一行文案。禁改面（§2.4.2）显式排除四 PUT 路由（含 imitation）、mergeSeedIntoBlueprint、fusion/apply、StyleBindPanel、批量端点、R-F4-3 用例（仿写分区已并入 D5 写面，不再是禁改项）。
- [x] **类型一致** — 无破坏性签名改动：`listBooksBoundToProfile`/`ProfileBindBar` 为新增；`listPlotProfiles/listSpectrumProfiles` 返回形状不变（boundBooks 在路由层 map 附加）；`listBooksBoundToProfile` kind 扩 `'imitation'`（联合类型加宽不破坏既有调用）；`suggestBlueprintCore` 增可选第 4 参（batch 调用不破坏）；`BlueprintSuggestBody`/三档案 DTO/`ImitationProfileDto`/BookDto 只加可选键（imitationProfileId 已在）；`DistillApi/DistillLabels` 删键的破坏面=仅 Plot/SpectrumProfilesSection 两处消费点（同卡内同步改）；ImitationProfilesSection 删 books 查询/bindBook 为组件内部状态，无外部消费方（typecheck 兜底）。
- [x] **隐含输入类** — 已纳入：空草稿守卫（不发请求）、JSON 合法但非对象（如纯数字）仍走 seed 路由 400（现状语义保留）、draftText 超 3000 head 截断+warning（沿 worldview 先例）、draftText 空串/超 20000→zod 400 禁 500、style 徽标辅档命中（关联表反查语义）、boundId 指向已删档案回显「（档案已删除）」、4s 轮询与绑定条 sel 回显共振（useEffect 重置）、先立后破执行序防绑定无入口窗口（BR-7b 卡内同序原子落）、R-F2-4 指引文本随迁移（旧文本指向已删入口）、T1/T2 PUT 断言迁移防净减、仿写绑定条回显与顶部「仿写已绑」chip 同源联动（book.imitationProfileId 单源）、ImitationProfilesSection 不经共享壳（BR-3 瘦身不覆盖，BR-7b 卡内等价处置）、既有 imitation 测试 stub 的 `/api/books` 残留零断言无害（T12 守）、R-BR7-1 自持夹具规避文件内用例顺序耦合（前序 delete 例清空档案表）、融合门 :418 指引随 BR-3/BR-7b 失实修正（无测试钉串，已核；:385「去蒸馏页改档案」语义不变不动）。
- [x] **比例** — 8 卡对 11 处写面（1 新增组件+10 修改文件），每卡 3 步（红/绿/守）共 24 步均 2-5 min；server 最小加法单列 BR-1/BR-5/BR-7a 三卡，前端五卡；规格/约束/任务/验收/自审五段职责不重叠。
