# 实现计划：风格维度八并六 + 存量读时别名（style dims merge）

- 日期：2026-11-24。计划真值源=本文（writing-plans 纪律）；执行卡四张 DM-1..DM-4 见 `docs/design/card-2026-11-24-dm-*.md`（§6 任务板）。
- 决策引用：owner 2026-11-24 两条拍板（①维度 8→6，最保守档；旧「叙述视角」取消、不保留旧名，「叙述方式」明确吸收 视角/人称/POV/心理距离；②存量数据不重写不迁移不重蒸，读时别名映射，同组两旧维文本按旧表序拼接去重「；」连接）。决策号归档由主模型收口时补录 decision-log。
- 前置批次：DEC-2026-1124-03（融合门白话化，已推 f6b7906）、DEC-2026-1124-04（张力行三选把手，计划 `docs/plans/2026-11-24-tension-levers.md`，TL-1..TL-4）。**本批全部卡在 TL-4 之后串行**（同工作树 ≤1 卡）；与 TL 卡重叠的文件（shared/api.ts、shared/fusion.ts、tension.ts、schemas.ts、BookDetailPage.tsx、FusionGateDialog.tsx）行号以 TL 合入后为准。

## 1. 目标

1. `STYLE_DIMENSIONS` 由八维并为六维，新序：**语言与描写、特色词汇、结构与节奏、情感基调、尺度、叙述方式**。
2. 映射钉死：`语言与描写`=对话+描写；`特色词汇`=特色词汇；`结构与节奏`=节奏+章节结构；`情感基调`=情感基调；`尺度`=尺度；`叙述方式`=写作特点（并显式吸收 视角/人称/POV/心理距离）。
3. 存量不重写：五份已有风格档案的维度文本（存于 `style_profiles.rules_json` 的 `dims` 键，非 `structure_json`——见 §2.3 调研修正）与书籍快照 `style_snapshot_json`、绑定行 `dims_json` 中的旧八维键**不改写不迁移不重蒸**，全部读时别名归一。
4. 写路径只产六维：PUT style、fusion confirm、门内/设置页下拉、蒸馏 DIM 行协议、张力落点校验全部按新六维（旧名读时折算容忍）。
5. 测试基线只增不减：开工先 `pnpm test` 实跑记数（最近存证 748 = 571 + 175 + 2，以本轮实跑为准）。

## 2. 架构与数据流（改前现状；行号=2026-11-24 工作树实读，漂移以实际为准）

### 2.1 维度常量与消费面

```
packages/shared/src/api.ts:400  STYLE_DIMENSIONS（八维 as const）
  :401  STYLE_AXES（六轴，轴名「节奏」保留不动——与维名「节奏」退役无关）
  :404  DIM_SOURCE_COEXIST（TL-2 在其旁加 DIM_SOURCE_NONE='__none__'）
  :409  type StyleDimension = (typeof STYLE_DIMENSIONS)[number]（六维化自动收窄）
  :418  StyleAnalysisDto.dims: Record<StyleDimension, string>
  :316-322 StyleBindingDto（DM-1 增 legacySplits?）
消费面（常量驱动，改表即随）：
  apps/server/src/style/merge.ts:69(normalizeDimsSource)、:191(逐维来源判定)、:237(legacy 计权)
  apps/server/src/style/inject.ts:60(renderStyleDimsBlock 空文本跳维——零改动)
  apps/server/src/llm/plainproto.ts:366(未知维度报错)、:424(缺省补空串)
  apps/server/src/http/schemas.ts:106 / :388(dimsSource 键 ∈ 维度表——自定义校验读常量，零改动)
  apps/server/src/fusion/tension.ts:90(落点校验——需加折算)
  apps/web/src/pages/BookDetailPage.tsx:109,128,162,175,188,196,278(常量驱动——零逻辑改动)
  apps/web/src/pages/StyleProfilesSection.tsx:350,471(常量驱动——零逻辑改动)
```

### 2.2 读/写数据流

```
写：PUT /api/books/:id/style（routes.ts:836-859）或 fusion confirm（apply.ts:61-80）
  → zod 校验 dimsSource 键 ∈ 维度表（schemas.ts:103-111 / :385-393，读常量自动六维）
  → contentFromProfileRow（merge.ts:119-127，rules_json → dims/axes/terms）→ buildStyleBundle（merge.ts:76-95）
  → setBookStyleBinding 双写（books.ts:148-185，dims_json/weights_json + books.style_snapshot_json）
读：生成/润色 chapter.ts:113-116 / polish.ts:38-43
  → getBookStyleBinding（books.ts:187-199，dims_json → dimsSource）【DM-1 接 mapLegacyDimSource】
  → loadStyleBundle（merge.ts:169-177：快照 parseStyleBundle 优先，回落 live 行 contentFromProfileRow）【DM-1 接归一】
  → mergeStyleProfiles（merge.ts:179-358：:191-223 逐维判定、:193 COEXIST 分支、:207 未知值回落主档；六轴 :225-260、样本席位 :307-353 —— 算法零改动）
  → renderStyleDimsBlock（inject.ts:58-73，:60 空文本跳维）
档案展示：GET /api/style-profiles/:id（routes.ts:890-928，:898-912 rules_json → analysis.dims）【DM-1 接归一】
融合门：GET /fusion-gate（routes.ts:1304 binding 经 getBookStyleBinding）+ fingerprint.ts:9-23（face 含 styleBinding 整对象）
```

### 2.3 调研修正（owner 题干 vs 实测）

- owner 题干称风格档案维度存于「structure_json」。实测：`style_profiles` 表无 structure_json 列，维度文本存于 **`rules_json` 的 `dims` 键**（建表 `apps/server/src/db/migrations/0001_core.sql:40-44`；落库 `apps/server/src/style/analysis.ts:86-108` 注释+INSERT；读出 `merge.ts:119-127 contentFromProfileRow`、`routes.ts:898-912`）。库中名为 structure_json 的列属 imitation/plot/spectrum 表（`db/repositories/imitation.ts:12`、`plot.ts:10`、`spectrum.ts:10`），内容为字符串数组、不含风格维度键，**无需任何处理**。本计划按实测落点接线，语义与 owner 拍板一致（读时别名、不改数据）。

## 3. 规格（钉死，不得另起设计）

### 3.1 shared 六维表与别名（DM-1）

- `STYLE_DIMENSIONS` 改为 `['语言与描写','特色词汇','结构与节奏','情感基调','尺度','叙述方式'] as const`（此序即新表序）；`:399-404` 相邻注释同步（六维 + 并档决策 + 旧名读时别名说明）。
- 新增 `export const LEGACY_DIM_GROUPS: Record<StyleDimension, readonly string[]>`（新维 → 该组旧维名，**按旧表序**排列；旧表序=退役常量序 节奏→对话→描写→情感基调→尺度→写作特点→特色词汇→章节结构）：
  `{ 语言与描写:['对话','描写'], 特色词汇:['特色词汇'], 结构与节奏:['节奏','章节结构'], 情感基调:['情感基调'], 尺度:['尺度'], 叙述方式:['写作特点'] }`
  （owner 题干括号内旧表序与退役常量序在本批三组内的相对序**完全一致**：语言与描写=对话→描写、结构与节奏=节奏→章节结构，无歧义，按退役常量序钉。）
- 新增 `export const LEGACY_DIM_ALIAS: Record<string, string>`：八旧名→六新名，恒等项写全（节奏→结构与节奏、对话→语言与描写、描写→语言与描写、情感基调→情感基调、尺度→尺度、写作特点→叙述方式、特色词汇→特色词汇、章节结构→结构与节奏）。恰 8 键，不含 视角/人称/POV（它们从来不是维名，折算只在张力落点做，见 3.4）。
- 新增纯函数 `export function mergeLegacyDimTexts(structure: Record<string, string>): Record<string, string>`（钉）：
  1. 返回恒含六新键（无文本=''）。
  2. 对每新维：若 `structure` 中**新键本身**有非空文本 → 新键优先原样保留（trim），该组旧键不再并入（防双重拼接）；否则按 `LEGACY_DIM_GROUPS[newDim]` 旧表序逐键取 `(structure[old] ?? '').trim()`，空串丢弃、全等段去重、余段按序「；」连接。
  3. 非字符串值按 '' 处理；未知键（非六新名且非八旧名）忽略（两个函数都只按已知键表取值，天然忽略）。
- 新增纯函数 `export function mapLegacyDimSource(dimsSource: Record<string, string>, primaryProfileId: string): DimsSourceMapping`，返回形状 `export interface DimsSourceMapping { dimsSource: Record<string, string>; splits: Record<string, string> }`（钉）：
  1. `dimsSource`：输入键 ∈ 新六名 → 原样带走；∈ 旧八名 → 经 `LEGACY_DIM_ALIAS` 归组折算；其余键忽略。输出**不补全六键**（只含出现过的键；调用方缺键回落主档语义既有）。
  2. 组内折算取值：组内仅一旧键有值→取该值；多键同值→取该值；多键异值→优先级 `DIM_SOURCE_COEXIST('__coexist__')` > `DIM_SOURCE_NONE('__none__'，TL-2 产物)` > `primaryProfileId`。
  3. `splits`：仅当组内两旧键**值不一致且被迫折算**时记 `splits[新维] = '旧结构里这一组原本分开跟随档案（节奏/章节结构），重蒸该档案后可再分开'`（键名按组内实有旧键、以旧表序「/」连接；文案钉死供 UI 灰字直用）。单键/同值不记。
  4. 两函数确定性（同输入同输出）、不抛、不碰 IO。

### 3.2 读时接线（DM-1；禁改算法本体）

- `contentFromProfileRow`（merge.ts:119-127）：`:122` dims 取值后包 `mergeLegacyDimTexts`（读出即六维；消费方=apply.ts:70、routes.ts:350/:849、merge.ts:175 全部受益，冻结路径自动产六维快照）。
- `parseStyleBundle`（merge.ts:129-166）：V1 路径 `:155` dims 包 `mergeLegacyDimTexts`；V2 路径 `:164` 逐 profile 的 dims 包 `mergeLegacyDimTexts`（浅拷贝新对象，不改入参）；`:144` dimsSource 在两处 return 前经 `mapLegacyDimSource(dimsSource, primaryProfileId).dimsSource` 归一。
- `getBookStyleBinding`（books.ts:187-199）：`:196` `JSON.parse(primary.dims_json)` 后经 `mapLegacyDimSource(..., primary.profile_id)`；返回对象 `dimsSource` 用归一值；`splits` 非空时追加 `legacySplits: splits` 键（空则不带，防 fingerprint face 无谓抖动）。`StyleBinding` 接口（books.ts:139-146）增可选 `legacySplits?: Record<string, string>`；`setBookStyleBinding` 双写形状**零改动**（仍只写 dims_json/weights_json）。
- `StyleBindingDto`（shared/api.ts:316-322）增可选 `legacySplits?: Record<string, string>`（GET /books :384 与融合门 binding routes.ts:1304 整对象透传，前端零额外接线即可读）。
- routes.ts 档案详情 `:907`：`dims: mergeLegacyDimTexts((rulesData.dims ?? {}) as Record<string, string>)`；`:836` 注释「七维全主」措辞随改。
- **零改动红线**：六轴加权（merge.ts:225-260）、样本席位（merge.ts:307-353）、merge 逐维判定/回落逻辑（:186-223）、inject.ts、fingerprint.ts、apply.ts、books.ts 双写、`apps/server/data/**` 全部不动；不做任何 UPDATE/数据脚本。

### 3.3 写路径与蒸馏协议（DM-2）

- `schemas.ts` 两处 dim 键校验（:106/:388）是**自定义校验读常量**（非 z.enum、非字面量，实测代码：`if (!(STYLE_DIMENSIONS as readonly string[]).includes(dim))`）→ 随常量自动六维，**零改动**；旧维名写路径自动 400「未知风格维度」。
- `plainproto.ts:366`：报错文案随表更新为 `未知维度: ${name}（现行六维：语言与描写、特色词汇、结构与节奏、情感基调、尺度、叙述方式）`；`:424` 缺省补空串循环读常量自动六维，零改动。DIM 行**只认新六维名**（旧名行记 errors 不并入——蒸馏是写路径，规格钉严格；存量档案靠读时别名兜底）。
- `analysis.ts:15-24` 默认蒸馏模板六维化并加两句定向要求：`语言与描写` 注明含对话腔与描写腔（对话占比与腔调 + 描写密度与手法）；`叙述方式` 明确覆盖 叙述视角（第一/第三人称）、人称与 POV 落点、心理距离（贴身内窥/旁观疏离）与心理描写手法；`:17` 尺度维注释行原样保留。
- 覆盖面注记（不改数据）：`app_meta.distill_template` 存量自定义模板若仍指示旧八维名，重蒸时旧名 DIM 行记 errors 并丢弃（缺行补 ''，解析不抛），属预期；不迁移模板数据，用户自改模板即恢复。

### 3.4 张力落点兼容（DM-3）

- `tension.ts` 落点 `维度=X` 校验（:88-93）改经折算纯函数 `foldDimName(raw): StyleDimension | undefined`（模块内私有，确定性）：raw ∈ 新六名 → 原样；∈ `LEGACY_DIM_ALIAS` → 折算新名；∈ `['视角','人称','POV','pov','视点']` → `'叙述方式'`；其余 → undefined（lever='none'，行保留现状语义）。`叙述视角` 不在折算表（旧名取消）。
- prompt 落点写法行（:67-68）改为：`维度=<六维名，兼容旧八维名与 视角/人称/POV>`；`【负约束】` 行同句同步；`:24` TensionRow.dim 注释同步。`shared/fusion.ts:28` 注释「八维名」同步。
- `parseTensionRows` 段数/性质/cap 语义零改动。

### 3.5 UI（DM-4）

- `BookDetailPage.tsx` 高级设置（:275-305）与 `FusionGateDialog.tsx` 逐维下拉（:231-254）读值经归一自动显六组（binding.dimsSource 已是新键）；两者在 dims 区块尾部依据 `binding.legacySplits` 渲染行下灰字提示（键即新维名、值即 3.1 钉死文案；无 legacySplits 不渲染）。StyleBindPanel props binding 内联类型（BookDetailPage.tsx:119）与 FusionGateDialog 消费面补可选键读取。
- `StyleProfilesSection.tsx:349/:470` 标签「七维」→「六维」；`:474` `维度-${dim}` aria-label 已随常量六维化（DM-1 随迁其测试断言）。
- 写路径天然只产新键：下拉 option/保存逻辑读常量（BookDetailPage :109/:162/:175/:188/:196），旧库数据归一后可正常回显与再保存。
- 门内哨兵 option 由 TL-4 交付（前置已合入），六组与哨兵共存即本卡回归断言。

### 3.6 快照形状演进与指纹（预期现象，不当 bug 修）

- confirm/PUT 再次冻结时经 contentFromProfileRow 产六维快照；旧快照旧键自然淘汰，无迁移代码。
- fingerprint.ts:9-23 face 含 styleBinding 整对象（含 dimsSource 与新增 legacySplits）→ 归一后旧书首次过门时 face 变化 → 指纹不一致门重弹一次。属预期，写进计划存证，不修。
- `getBookStyleBinding` 无容错包裹（`:196` JSON.parse 坏 JSON 会抛）——现状即如此，本批不新增容错（卡外问题即停回报）。

## 4. 冲击清单（grep 实测；「处置」列 = 随迁/接线/新例/不动）

### 4.1 生产代码

| # | 位置 | 现状 | 处置（卡） |
| --- | --- | --- | --- |
| 1 | packages/shared/src/api.ts:400 | 八维 as const | 改六维 + 注释（DM-1） |
| 2 | packages/shared/src/api.ts:306-313,399-404 | 注释「七维/八维」措辞 | 措辞随改（DM-1） |
| 3 | packages/shared/src/api.ts:316-322 | StyleBindingDto 无 legacySplits | 增可选键（DM-1） |
| 4 | packages/shared/src/fusion.ts:28 | 注释「∈ STYLE_DIMENSIONS 八维名」 | 措辞随改（DM-3） |
| 5 | apps/server/src/style/merge.ts:119-127 | contentFromProfileRow dims 原样 | 接 mergeLegacyDimTexts（DM-1） |
| 6 | apps/server/src/style/merge.ts:144,155,164-165 | parseStyleBundle dimsSource/dims 原样 | 接两归一函数（DM-1） |
| 7 | apps/server/src/style/merge.ts:1-18,33-39,66-74 | 注释「七维」；normalizeDimsSource（无生产调用方，TL 计划已注记） | 注释随改；函数零改动（DM-1） |
| 8 | apps/server/src/db/repositories/books.ts:139-146,187-199 | 读出原样；接口无 legacySplits | 接 mapLegacyDimSource + 可选键；双写 :148-185 不动（DM-1） |
| 9 | apps/server/src/http/routes.ts:836 | 注释「七维全主」 | 措辞随改（DM-1） |
| 10 | apps/server/src/http/routes.ts:898-912 | 详情 dims 原样回 | 接 mergeLegacyDimTexts（DM-1） |
| 11 | apps/server/src/http/schemas.ts:106,388 | 自定义校验读常量 | 不动，自动六维（DM-1 复核项） |
| 12 | apps/server/src/style/inject.ts:60 | 读常量渲染 | 不动（—） |
| 13 | apps/server/src/llm/plainproto.ts:366 | 报错文案「未知维度: X」 | 文案随表更新（DM-2） |
| 14 | apps/server/src/llm/plainproto.ts:424 | 缺省补空串读常量 | 不动（DM-2 复核项） |
| 15 | apps/server/src/style/analysis.ts:15-24 | 默认模板八维行 | 六维化 + 两句定向要求（DM-2） |
| 16 | apps/server/src/fusion/tension.ts:24,67-68,85-99 | 落点只认八维名、prompt 写八维 | 折算 + 文案（DM-3） |
| 17 | apps/server/src/fusion/fingerprint.ts:9-23 | face 含 styleBinding | 不动；legacySplits 入 face 属预期抖动（§3.6） |
| 18 | apps/web/src/pages/BookDetailPage.tsx:104-111,119-204,275-305 | 常量驱动 + 无分裂提示 | 逻辑零改动 + 灰字提示（DM-4） |
| 19 | apps/web/src/components/FusionGateDialog.tsx:231-254 | 逐维下拉读 binding 键 | 零逻辑改动 + 灰字提示（DM-4；哨兵 option=TL-4 已交付） |
| 20 | apps/web/src/pages/StyleProfilesSection.tsx:349,470 | 标签「七维」 | 改「六维」（DM-4） |
| 21 | apps/web/src/components/DistillProfilesShell.tsx:15 | 注释「七维编辑表单」 | 不改（注释指向剥离事实，非钉值）（—） |

### 4.2 测试（钉旧名/钉长度/钉 prompt 文案；全部禁删用例、只改钉值）

| # | 位置 | 现状钉点 | 处置（卡） |
| --- | --- | --- | --- |
| 22 | apps/server/test/style/merge.test.ts:52-65,84-90,158-165,246-258,294-295,350-360,407-408,517,549 | 字面量 写作特点/章节结构/节奏/对话/描写 键与期望值 | 随迁（DM-1） |
| 23 | apps/server/test/style/merge.test.ts:14,44,72,199,222-223,238,360,521,525,534-541,561 | 常量驱动/含 COEXIST | 不动或个别字面量随迁（DM-1 实跑定） |
| 24 | apps/server/test/style/analysis.test.ts:50-51,54,61-66,73,103,113 | dims['节奏'/'对话'/'描写'] 钉值 | 随迁（DM-1；:58 axes['节奏'] 为轴名不动） |
| 25 | apps/server/test/style/inject-blocks.test.ts:6-7,26,35 | 常量驱动 | 不动（—） |
| 26 | apps/server/test/llm/plainproto.test.ts:198 | `DIM: 节奏:` 夹具 | 随迁（DM-1）；新例归 DM-2 |
| 27 | apps/server/test/http/style.test.ts:19-24,77,199 | ANALYSIS_TEXT 八维 DIM 行 + dims['节奏'] 断言 | 随迁（DM-1） |
| 28 | apps/server/test/http/style.test.ts:333,343,374,395 | dimsSource['对话'/'节奏'] | 随迁（DM-1）；:362/:368 特色词汇、:396 '语感' 原样合法 |
| 29 | apps/server/test/http/style.test.ts（新增例） | — | 新例：旧维名 '写作特点' 键 → 400 未知风格维度（DM-1）；详情归一/旧名 DIM 行锁定（DM-1/DM-2 见卡） |
| 30 | apps/server/test/pipeline/chapter.test.ts:214,374,392,402,414-415 | 八维 dims 夹具 + 辅档 trio dimsSource + prompt 文本断言 | 随迁（键换文本留，:414-415 文本断言不受影响）（DM-1） |
| 31 | apps/server/test/pipeline/polish.test.ts:151,169,179 | trio 写作特点/特色词汇/章节结构 | 随迁（DM-1） |
| 32 | apps/server/test/http/distill-jobs.test.ts:18-19,104 | DIM 节奏/对话 行 + dims['节奏'] | 随迁（DM-1） |
| 33 | apps/server/test/http/distill-template.test.ts:105 | 断言 prompt 含「八维：节奏、对话、…」 | DM-2 随迁六维 + 新增定向要求断言（DM-2） |
| 34 | apps/server/test/http/settings-import.test.ts:56-72 | STYLE_ANALYSIS_TEXT 七行旧名 DIM | 随迁为五行新名（DM-1） |
| 35 | apps/server/test/http/style-snapshot.test.ts:15 | `DIM: 节奏: 短句为主。` | 随迁 结构与节奏（DM-1） |
| 36 | apps/server/test/db/repositories.test.ts:218,226 | dimsSource {对话:'pB'} 往返 | 随迁 + 新例（旧键落行读出新键 + splits）（DM-1） |
| 37 | apps/server/test/fusion/tension.test.ts:7,84,91,122 | 维度=尺度 等（仍六维合法） | 不动（—） |
| 38 | apps/server/test/fusion/tension.test.ts:63-64 | `维度=视角` → lever:none | 翻转为折算 dim:'叙述方式'（DM-3） |
| 39 | apps/server/test/fusion/tension.test.ts（新增例） | — | 新例：旧名/视角/人称/POV/pov 折算、叙述视角/描写密度仍 none（DM-3） |
| 40 | apps/server/test/fusion/fingerprint.test.ts:9,29 | dimsSource 键名 '对白'（任意键，非维度表语义） | 不动（注记）（—） |
| 41 | apps/web/src/pages/BookDetailPage.test.tsx:741-786,806-828,871-889 | 八键 dimsSource 断言 + 维度来源-对话/节奏 label | 随迁六键/六 label（DM-1） |
| 42 | apps/web/src/pages/BookDetailPage.test.tsx（新增例） | — | 新例：legacySplits 灰字提示在场/不在场（DM-4） |
| 43 | apps/web/src/components/FusionGateDialog.test.tsx:34,148-160,186,216,227 | {节奏:'sp1'} + 跟随：节奏 label | 随迁（DM-1）；哨兵共存+灰字新例（DM-4） |
| 44 | apps/web/src/pages/NewBookPage.test.tsx:267-276 | hasLength(8) + 「八维」措辞 | 随迁 6 + 措辞（DM-1） |
| 45 | apps/web/src/pages/StyleProfilesSection.test.tsx:27 | dims 夹具八键 | 随迁六键（DM-1） |
| 46 | apps/web/src/pages/StyleProfilesSection.test.tsx:196,220,588 | 功能性 aria-label 断言 `维度-节奏`（生产端 :474 常量生成，翻表即红） | 随迁 `维度-结构与节奏`（DM-1） |
| 47 | apps/web/src/pages/StyleProfilesSection.test.tsx:180,195,570,582 | 「七维」仅出现在用例标题/注释，非断言 | 不随迁；DM-4 在 :570 用例内新增 `getByText('六维')` 真断言锁行为（DM-4） |
| 48 | packages/shared/test/domain.test.ts | 无维度钉点 | 不动（—） |
| 49 | apps/server/test/http/fusion-gate.test.ts | dimsSource 均为 {} 或以 id 为键 | 不动（DM-3 视需要加折算 example） |

随迁映射速查（写卡/施工共用）：`节奏→结构与节奏`、`对话→语言与描写`、`描写→语言与描写`、`写作特点→叙述方式`、`章节结构→结构与节奏`、`情感基调/尺度/特色词汇→恒等`；同夹具内组内两文本并存时合成一键、文本以「；」连接（如 `{对话:'甲',描写:'乙'}` → `{语言与描写:'甲；乙'}`）；断言文本一律保留原文只换键名；轴名 `节奏`（STYLE_AXES）与蓝图协议 `DIMENSION:` 行（plainproto.test.ts:7-58）**不是**维度名，一律不动。

## 5. 全局约束

1. 四卡**串行** DM-1 → DM-2 → DM-3 → DM-4，同工作树 ≤1 卡；执行者只 commit 不 push。
2. 禁改（越界即停）：`apps/server/src/fusion/apply.ts`、`apps/server/src/fusion/fingerprint.ts`、`apps/server/src/db/repositories/books.ts` 的 setBookStyleBinding 双写形状（:148-185）、merge.ts 六轴（:225-260）与样本席位（:307-353）及逐维判定/回落逻辑（:186-223）本体、`apps/server/src/style/inject.ts`、`apps/server/data/**` 与一切真实库数据（无 UPDATE、无迁移脚本）。
3. 测试基线只增不减：开工实跑 `pnpm test` 记数（最近存证 748），每卡收口比较只增；禁删用例，旧钉值只随迁。
4. 验证链硬序：`pnpm lint` → 定向测试 → `pnpm test` 全量 → `pnpm typecheck` → `pnpm deadcode`；任一环失败即停回报，不得跳环。
5. 读 >4KB 文件用 `C:/Users/57850/.zcode/tools/pointer_tools.py` 的 pointerize/read_pointer/read_diff_only；卡外问题即停回报主模型，不得自行扩大改动面。
6. 每卡一次提交：Conventional 前缀 + 中文描述；正文带 `verify:`（验证结果+基线数）与 `Refs: docs/plans/2026-11-24-style-dims-merge.md`；永不 `--no-verify`；永不 `git add -A`。
7. 行号为 2026-11-24 实读（TL 批合入后可能漂移）；施工时以锚点注释/唯一匹配文本定位，卡面已注「以实际为准」。

## 6. 任务板

| ID | 卡面文件 | 范围 | 操作类型（文件 × 动作） | 依赖 |
| --- | --- | --- | --- | --- |
| DM-1 | `docs/design/card-2026-11-24-dm-1-dims-core.md` | shared+server | Modify：`packages/shared/src/api.ts:306-322,399-404`；Modify：`apps/server/src/style/merge.ts:1-18,119-127,129-166`；Modify：`apps/server/src/db/repositories/books.ts:139-146,187-199`；Modify：`apps/server/src/http/routes.ts:836,898-912`；新增：`packages/shared/test/style-dims.test.ts`；随迁+新例：冲击清单 #22-36,41,43-46 列测试文件 | TL-1..TL-4 已合入（DIM_SOURCE_NONE/哨兵放行/门内把手；行号以合入后为准） |
| DM-2 | `docs/design/card-2026-11-24-dm-2-distill-protocol.md` | server | Modify：`apps/server/src/llm/plainproto.ts:366`；Modify：`apps/server/src/style/analysis.ts:15-24`；Modify：`apps/server/test/http/distill-template.test.ts:105`；新例：plainproto.test/analysis.test/style.test | DM-1 |
| DM-3 | `docs/design/card-2026-11-24-dm-3-tension-fold.md` | server+shared | Modify：`apps/server/src/fusion/tension.ts:6,24,67-68,85-99`；Modify：`packages/shared/src/fusion.ts:28`；Modify：`apps/server/test/fusion/tension.test.ts:63-64`+新例 | DM-1 |
| DM-4 | `docs/design/card-2026-11-24-dm-4-web-dims-ui.md` | web | Modify：`apps/web/src/pages/BookDetailPage.tsx:113-139,275-305`；Modify：`apps/web/src/components/FusionGateDialog.tsx:231-254`；Modify：`apps/web/src/pages/StyleProfilesSection.tsx:349,470`；新例：BookDetailPage.test/FusionGateDialog.test/StyleProfilesSection.test（六维标签真断言） | DM-1（串行 DM-2/DM-3 之后） |

### 跨卡总验收

1. shared/test/style-dims.test.ts 全绿：`mergeLegacyDimTexts({节奏:'甲',章节结构:'甲'})` → `结构与节奏:'甲'`（去重）；`{对话:'甲',描写:'乙'}` → `语言与描写:'甲；乙'`；`{写作特点:' 丙 ',视角:'丁'}` → `叙述方式:'丙'`（trim+未知键忽略）；`mapLegacyDimSource({节奏:'pB',章节结构:'__coexist__'},'pA')` → `{dimsSource:{结构与节奏:'__coexist__'},splits:{}}`；`{节奏:'pB',章节结构:'pC'}` → dimsSource `{结构与节奏:'pA'}` 且 splits 带钉死文案。
2. 旧八维快照经 loadStyleBundle → mergeStyleProfiles 后 `merged.dims` 六键非空（语言与描写含「；」拼接文本）且进 prompt（chapter 链断言）。
3. 旧维名 PUT dimsSource（如 `{写作特点:'p2'}`）→ 400「未知风格维度」；新六名 PUT/confirm 200。
4. `维度=写作特点` → `{lever:'dim',dim:'叙述方式'}`；`维度=视角` 同；`维度=描写密度`/`维度=叙述视角` 仍 none。
5. 新蒸档案 prompt 含「六维」清单与 叙述方式/语言与描写 定向要求；旧名 DIM 行 → errors 含「现行六维」。
6. 设置页/门内显示六组下拉；`legacySplits` 在场 → 灰字「旧结构里这一组原本分开跟随档案（…），重蒸该档案后可再分开」；不在场 → 不渲染；档案详情面板标签显示「六维」。
7. `pnpm test` ≥ 开工基线只增；typecheck/deadcode 零新增告警。

## 7. 接口块（逐卡 Consumes/Produces）

- **DM-1** Consumes：TL-2 `DIM_SOURCE_NONE='__none__'`（shared/api.ts；mapLegacyDimSource 优先级引用）。Produces：
  - `packages/shared/src/api.ts`：`STYLE_DIMENSIONS = ['语言与描写','特色词汇','结构与节奏','情感基调','尺度','叙述方式'] as const`；`LEGACY_DIM_GROUPS: Record<StyleDimension, readonly string[]>`；`LEGACY_DIM_ALIAS: Record<string, string>`（恰 8 键）；`mergeLegacyDimTexts(structure: Record<string, string>): Record<string, string>`；`interface DimsSourceMapping { dimsSource: Record<string,string>; splits: Record<string,string> }`；`mapLegacyDimSource(dimsSource: Record<string,string>, primaryProfileId: string): DimsSourceMapping`；`StyleBindingDto.legacySplits?: Record<string,string>`。
  - `merge.ts`：contentFromProfileRow/parseStyleBundle 读值恒六维（签名不变、行为扩）。
  - `books.ts`：`StyleBinding.legacySplits?: Record<string,string>`；getBookStyleBinding 返回归一 dimsSource（+非空 legacySplits）。
- **DM-2** Consumes：DM-1 六维表。Produces：parseAnalysis 对非六维名记 `未知维度: X（现行六维：…）`；默认蒸馏模板产出六维 DIM 行（含 叙述方式=视角/人称/POV/心理距离、语言与描写=对话腔+描写腔 定向句）。
- **DM-3** Consumes：DM-1 `LEGACY_DIM_ALIAS`。Produces：`tension.ts` 私有 `foldDimName(raw: string): StyleDimension | undefined`；`parseTensionRows` 落点折算行为（签名不变）。
- **DM-4** Consumes：DM-1 `StyleBindingDto.legacySplits` 与归一 binding；TL-4 门内哨兵 option。Produces：设置页/门内 dims 区块灰字提示渲染（数据=legacySplits，文案=DM-1 钉死值）；档案详情「六维」标签。

## 8. 风险与预期现象（存证，不当 bug 修）

1. 指纹抖动：归一 + legacySplits 入 face → 旧书首次过门重弹一次（§3.6）。
2. `app_meta.distill_template` 存量旧模板：重蒸旧名行记 errors 丢弃，不迁移数据（§3.3）。
3. 读时别名只影响读值：五份存量档案与旧快照库内字节零变化（禁改数据红线验证点=施工后对 `apps/server/data/**` 零 diff）。
4. `getBookStyleBinding` 坏 JSON 会抛——现状既有行为，不新增容错。

## 9. 自审五查（写完计划与四卡后执行；发现即就地修，结论回填此处）

1. **基点核实**：全部 `文件:行号` 本轮实读。修正记录：owner 题干「structure_json」实测为 `rules_json.dims`（§2.3 已修）；「叙述视角」实测全仓代码/测试无该维名字面量（仅张力落点语义承接，tension.test:63 现钉 `维度=视角`→none），已修为「叙述视角 不在折算表」（§3.4/验收 4）；routes.ts:1268 system 文案只写「六段竖线」不含八维措辞，无需改（初稿误列，已删）。
2. **接口一致**：四卡 Consumes/Produces 与 §3 逐签名对齐；DM-2/DM-3 均只 Consumes DM-1（shared 常量/别名），无交叉；DM-4 Consumes DM-1 DTO+TL-4 哨兵。已核。
3. **步骤可核对**：四卡步骤均 2-5 分钟粒度、每步一个动作+可核对结果、无 TBD；DM-1 的全仓随迁以 typecheck 红→定向红→grep 白名单三重核对收口，避免「漏改静默绿」。就地修：自审中发现 `StyleProfilesSection.test.tsx:196/:220/:588` 的 `维度-节奏` 为功能性 aria-label 断言（生产端 :474 常量生成），DM-1 翻表即红——已从「归 DM-4 措辞」改为 DM-1 D12 随迁（卡面与冲击清单 #46 同步）；「七维」在该文件仅出现于用例标题/注释非断言，DM-4 原拟「随迁七维断言」不成立，已改为新增 `getByText('六维')` 真断言（冲击清单 #47、DM-4 A4 同步）；DM-1 卡 E1 有一处笔误句（`语言与写入`），已重写卡面全文修正为 `语言与描写` 断言；DM-2 卡 A3 初稿红驱动不成立（旧文案也含「未知维度」），已改钉「现行六维」字样为红驱动。已修。
4. **先红后绿**：DM-1 新例（B1/E1/E2/E3）先红后实现；D 组属「钉值换绑」非新用例，红来源=typecheck/测试红清单，已在卡内注明；DM-2/DM-3/DM-4 各红例均先于实现且红驱动明确（文案字样/提示文本/标签文本）。已核。
5. **红线与副作用**：算法本体/apply/fingerprint/books 双写/数据目录零改动逐卡入约束；knip 对新导出（mergeLegacyDimTexts/mapLegacyDimSource/LEGACY_DIM_ALIAS/LEGACY_DIM_GROUPS）在 DM-1 当卡即有生产消费方（merge.ts/books.ts/routes.ts），不挂 deadcode（先例=normalizeDimsSource 现状仅测试引用仍过 knip）；legacySplits 只在非空时写入返回对象，防 fingerprint face 无谓抖动。已核。

## 执行完成记录（2026-11-25 凌晨收口，主审）

**通道与提交：** 四卡均走 opencode/hy4-flash-free（限时窗内、非禁入型），契约全部 exit0、无 flags、零轮转（DM-1 2536s / DM-2 966s / DM-3 519s / DM-4 646s）。提交：DM-1=`a281f9b`（执行者按纪律停 F4 卡外红未提交，主审直修后代提交）、DM-2=`ffb3e95`、DM-3=`0362ef8`、DM-4=`6ef6471`（执行者自提交，正文均含红绿留痕+verify+Refs；DM-4 注明 GUI 未验证）。

**主审直修一枚：** `fusion-gate.test.ts:560/572` 两行 `['对话']→['语言与描写']` 钉随迁。根因=planner 冲击清单 §4.2 #49 把该文件标「不动」但它实钉旧键 dimsSource——六维翻表后 schemas（红线禁改）自动拒旧键返 400，而 DM-1 卡面 F4 要求该文件绿。裁决小修级主审改（同 TL-1 直修类），已记入 DM-1 提交正文。

**执行者适配记账（均正确）：** ①DM-1 卡面 E2 夹具自相矛盾（组内两旧键同值 'pC' 却断言记 splits——同值不记），执行者按计划 §3.1 语义改异值保住「折主档+splits」双断言；②polish 随迁按实际文件 `test/http/polish.test.ts`（卡面 §1/D7 与计划 §4.2 #31 的 `pipeline/` 路径系笔误，行号 151/169/179 吻合）；③DM-4 两例夹具 splits 文案「（写作特点/视角）」系卡面 A2 原样钉——真实 `mapLegacyDimSource` 只对多旧键组（语言与描写/结构与节奏）产 splits，叙述方式为单键组实际不产；UI 对值直出渲染，不影响行为，informational 存证。

**planner 勘误两处入档：** 计划 §4.2 #31（pipeline/polish 路径）、§4.2 #49（fusion-gate 误标不动）。后续批次的冲击清单须把「钉 dimsSource 旧键/维名」的 server 测试文件全部纳入 grep 面。

**测试终账：** **799**（server 598 / web 190 / shared 11）。轨迹：781（TL-4 收口）→ 789（DM-1：shared 8→11 别名三例+server/web 随迁净 +5 新例）→ 793（DM-2：server +4）→ 796（DM-3：server +3）→ 799（DM-4：web +3）。只增不减，每环主审亲跑复核；D13 双 grep 白名单外零命中；`apps/server/data/**` 全程零 diff（不重写存量红线实证）。

**预期现象（§3.6/§8 存证，勿当 bug）：** 归一后 dimsSource+legacySplits 入指纹 face → 旧书首次过门指纹不一致门重弹一次；存量自定义 `distill_template` 若仍指示旧八维名，重蒸时旧名 DIM 行记 errors 丢弃、缺行补空串，解析不抛，用户自改模板即恢复。

**交 owner 实测点位（本批部分）：** ①设置页高级设置六组维度下拉；②旧结构书在设置页与门内逐维面板见「旧结构里这一组原本分开跟随档案（…），重蒸该档案后可再分开」灰字、新书无；③档案详情面板标签「六维」；④旧维名书门内逐维下拉回显归一值不悬空、首次过门重弹一次；⑤旧维名 PUT（如 `{写作特点:'p2'}`）→ 400。
