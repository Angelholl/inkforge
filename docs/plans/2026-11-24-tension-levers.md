# 实现计划：融合门张力行三选把手（tension levers）

- 日期：2026-11-24。计划真值源=本文（writing-plans 纪律）；执行卡四张见 `docs/design/card-2026-11-24-tl-1-protocol.md` 等（见 §5 任务板）。
- 决策引用：owner 2026-11-24 拍板（每行「不动/偏正文/偏档案」三选、持久生效、占比类一步 ±20、"偏档案"用模型点名当默认+行旁下拉可改；并入本批、补完不发版，v0.2.5 待 owner 实测后另启）。decision-critic 评议=有条件支持，HIGH_RISK=weights 把手作用面窄 → 已处置：保留把手+行下灰字当场标注效果范围+灰字指引回配方区「调整各档案占比」滑条。
- 上批：DEC-2026-1124-03（融合门白话化）已推 f6b7906。

## 1. 目标

1. 张力行协议由 5 段扩为 6 段（末段「落点」），解析出 `lever: 'dim' | 'weights' | 'none'`，占比类在服务端映射到该书已绑档案 id。
2. 引擎新增七维「不采用」哨兵 `DIM_SOURCE_NONE`：该维不采用任何档案风格、按正文与设定走；不参与六轴加权与样本席位之外的任何回落。
3. 校验放行：`dimsSource` 值允许哨兵（dim 键仍须 ∈ 八维）；confirm 侧 `weights: {}` 放行（legacy 按贡献维数计权）；设置页下拉回退（哨兵可回显可再选）。
4. 门内张力行每行三选把手：与配方区共用同一份 `dimsSource`/`weights` state，确认后经既有 styleBinding 落盘链持久生效。
5. 测试基线只增不减：起点=开工日本轮实跑（最近存证 748 = 571 + 175 + 2）。

## 2. 架构与数据流（改前现状；行号=2026-11-24 工作树实读，漂移以实际为准）

```
LLM 张力行（tension.ts prompt :59-61 钉 5 段；解析 :79-100）
  → POST /fusion-gate/analyze（routes.ts:1170-1283；system 文案 :1260 亦写死「五段竖线」）
  → 门组件 FusionGateDialog（张力区块 :113-129 现只读；配方区 :163-257；buildBody :72-94）
  → POST /fusion-gate/confirm（routes.ts:1395-1413；schema fusionGateConfirmSchema schemas.ts:366-409）
  → applyFusionConfirm（apply.ts:61-81；:77 weights {}→undefined）
  → buildStyleBundle（merge.ts:76-95；:90 dimsSource 原样冻结进快照、:92 空 weights 不写键）
  → setBookStyleBinding 双写（books.ts:148-179）
  → 生成/润色链读快照 loadStyleBundle → mergeStyleProfiles（七维来源判定 merge.ts:191-223；
     :193-206 共存分支；:207 越权值静默回落主档 ←【红线 1，哨兵分支必须插在此前】）
  → inject.ts renderStyleDimsBlock :58-73（:60 空串维自动跳行 → 哨兵维='' 即天然不进 prompt）
```

- 六轴加权 merge.ts:225-243（weights 路径非法/缺键=0、legacy=贡献维数+主保底 1）；样本席位最大余数法 :307-353（行号以实际为准）。weights 只影响六轴与样本，不改 dims/rules/terms 文本。
- 指纹 `fingerprint.ts:9-23` 含 dimsSource/weights → 哨兵与 {} 都会换指纹（写后落新指纹，行为正确，无需改）。
- `normalizeDimsSource`（merge.ts:67-74）无生产调用方（仅测试引用），不动。
- 校验现状：styleBind dimsSource 值 ∈ 档案∪COEXIST 于 schemas.ts:108；confirm 同规则 :390；weights 键集恰等绑定全集且 Σ=100 于 :112-121 / :394-401。zod v4（server package.json :20，^4.6.7）`z.record` 形状本身允许 `{}`，拒绝只来自 superRefine → 放行 {} 的最小改动=superRefine 空对象分支。
- 设置侧：BookDetailPage 高级八维下拉 :275-303（共存 option :299）；回填 :126-130、失勾重映射 :162、保存 :193-204。GET /api/books/:bookId 经 `...bookRest` 透出 styleSnapshotJson（routes.ts:381-384），回显断言面可用。
- 消费链锚点：chapter.ts:113-116（binding+bundle+merge）、:201-208（renderStyleDimsBlock）；polish.ts:38-43（polishBenchmarks 同链）。

### 红线复核结论（critic 点名两条）

| 红线 | 结论 | 证据 |
| --- | --- | --- |
| ① merge.ts:207 `validIds.has(raw) ? raw : primaryProfileId` 对非哨兵未知值静默回落主档，`__none__` 会主档化 | **成立（真断点）** | `apps/server/src/style/merge.ts:207`：`'__none__'` 为非空串且 ∉ validIds → 三元走 false 支 → `src = primaryProfileId`。哨兵分支必须插在 :206（COEXIST continue 之后）与 :207 之前 |
| ② BookDetailPage 回填/重映射把哨兵吞成主档 | **不成立（不吞）** | `BookDetailPage.tsx:128` `binding?.dimsSource?.[d] ?? binding?.primaryProfileId ?? ''`——`??` 只跳过 null/undefined，`'__none__'` 原样保留；:162 失勾重映射三条件（=p.id / =primary 且未 touched / =COEXIST 且余档<2）对 `'__none__'` 全不命中 → 保留；:196 `dims[d] \|\| primary`——哨兵为真值串 → 保留。但 :284 select 的 option 列表无哨兵项 → **值悬空显示空白**，须由 TL-3 步骤补 option（非吞值，纯回显缺口） |

### 占位名称核实（写死进卡面文案，证据 path:line）

| 占位 | 核实结果 | 证据 |
| --- | --- | --- |
| 〈改文风档案的入口页名〉 | 顶部导航「蒸馏」页 → 页内「风格档案」区 | `apps/web/src/App.tsx:55`（RailLink label=蒸馏 → /distill）、`apps/web/src/pages/DistillPage.tsx:74`、`apps/web/src/pages/StyleProfilesSection.tsx:275`（h2「风格档案」） |
| 〈改正文的面板名〉 | 书详情页「设定」节的「世界观与剧情大纲」面板 | `apps/web/src/pages/BookDetailPage.tsx:17`（nav label=设定）、`:753`（CardHeader title=世界观与剧情大纲）；门内既有同款措辞 `FusionGateDialog.tsx:155` |
| 〈书籍设置里风格绑定面板的真实名称〉 | 书详情页「风格」节的「风格档案」面板 | `apps/web/src/pages/BookDetailPage.tsx:21`（nav label=风格）、`:899-900`（sec-style + CardHeader title=风格档案）；门内既有同款措辞 `FusionGateDialog.tsx:305` |

## 3. 规格（钉死，不得另起设计）

### 3.1 张力行协议（TL-1）

- prompt 协议行变 6 段：`TENSION: <条目> | <MD 侧> | <档案侧> | <性质: 拉扯|冗余|缺口> | <建议偏向> | <落点>`；prompt 内写明落点三类写法：`维度=<八维名>` / `占比=<档案名>` / `门外`；模型给空或给不认的写法一律视为 `门外`。
- 解析器 `parseTensionRows` 段数双收：5 段（旧格式）→ 落点缺省 `门外`；6 段 → 末段为落点；其余段数（含 >6，即建议文本内含竖线）→ 丢行计 invalid（现状语义保持）。ROWS_CAP=20 静默丢、nature 词表校验、单行失败只丢该行、全无有效行由 routes 置 degraded——全部不变。
- 落点归一化在 tension.ts 内完成（识别前缀）：
  - `维度=X`：X trim 后 ∈ `STYLE_DIMENSIONS` → `{ lever:'dim', dim:X }`；否则 `lever:'none'`。
  - `占比=Y`：Y trim 非空 → `{ lever:'weights', profileName:Y }`；空 → `lever:'none'`。
  - 空串/其余任何写法 → `lever:'none'`。
- 服务端映射（routes.ts analyze 组装处，:1279 响应前）：占比类仅在**该书已绑集合（主+辅）**内按名精确匹配（两侧 trim）；命中唯一 → `profileId`；未命中、同名多义、或该书无 styleBinding → `lever='none'`（行保留）。响应不透出 `profileName`（DTO 只带 `profileId`）。
- routes.ts:1260 system 硬规则文案同步「五段竖线」→「六段竖线」（planner 补钉 P-3）。

### 3.2 引擎哨兵（TL-2）

- `packages/shared/src/api.ts:404` 旁增 `export const DIM_SOURCE_NONE = '__none__';`，注释写明：该维不采用任何档案风格、按正文与设定走；不参与六轴加权与样本席位之外的回落。
- `merge.ts` 在 COEXIST 分支（:193-206）之后、:207 回落之前插入独立分支：`raw === DIM_SOURCE_NONE → dims[dim]=''; contributors[dim]=[]; continue;`。六轴（:225-243）与样本席位（:307-353）算法零改动——哨兵维不记贡献，legacy 计权自然少计一维；加权路径该维本来就不产贡献。
- 注入层零改动：merge 产出 `dims[dim]=''` → `inject.ts:60` dimLines 对空串跳行 → 该维画像行不进 prompt（chapter.ts:208 消费面不变）。

### 3.3 校验放行与设置侧（TL-3）

- `schemas.ts:108` 与 `:390` 的 src 允许集加 `DIM_SOURCE_NONE`（dim 键仍须 ∈ 八维）。
- confirm 侧 `:394-401` weights 规则放行空对象 `{}`（语义=legacy 按贡献维数计权、不动权重）；styleBind 侧 `:112-121` 同步放行（同一语义，防两处规则漂移）。形状：zod v4 下 `z.record(z.string(), z.number().int().min(1))`（:70 / :375）已收 `{}`，最小改动=superRefine 首分支 `Object.keys(v.weights).length === 0 → 跳过键集/Σ 校验`；执行时先实跑验证，若版本行为不符再按 `z.union([现有规则, z.object({})])` 包形（planner 补钉 P-4）。
- 落盘链已天然消化 `{}`：PUT style routes.ts:841/:857、confirm apply.ts:77 均 `Object.keys(weights).length > 0 ? weights : undefined`；`buildStyleBundle` merge.ts:92 空 weights 不写键（快照与 legacy 逐字节同形）。**apply.ts、fingerprint.ts、books.ts 双写、merge 六轴/席位算法均不改。**
- 设置页：`BookDetailPage.tsx:299` 旁增哨兵 option（**无条件渲染**——与共存不同，单档案也可「不采用」）；回填/失勾重映射/保存路径零改动（红线②复核结论：不吞，见 §2）。

### 3.4 门内三选与 nudge（TL-4）

- shared 纯函数：`export function nudgeWeights(weights: Record<string, number>, id: string, delta: number): Record<string, number>`。语义钉：
  1. 空 map 或 `id` ∉ 键集 → 返回浅拷贝原值（legacy 不动 / 非绑定 id 不变）。
  2. 目标值 = `weights[id] + delta`，钳位到 `[1, 100 − (档数−1)]`（其余每档下限 1）。
  3. 其余档按现有值比例分摊 `100 − 目标值`：`raw_k = 余额 × w_k / Σ其余w`，floor 后按小数余数降序（平手按对象键插入序先手）逐档补 1，每档下限 1，总和恒 100。
  4. 输入契约：各值为 ≥1 整数（调用方=门内 state 与绑定快照，滑条/校验均保证）；函数内不救非法输入。
- 门内交互（行级，与配方区共用 `dimsSource`/`weights` state，**不得另开草稿**）：
  - `lever==='dim'`：三选 radio（aria-label `冲突裁决：<entry>：不动|偏正文|偏档案`）+ 档案下拉（仅「偏档案」时渲染；aria-label `冲突档案：<entry>`；默认 `row.profileId`，缺失回落主档 id；选项=绑定档案名 + 「不采用档案风格（按正文走）」哨兵项）。选「偏档案」→ `dimsSource[row.dim]=所选 id`；「偏正文」→ `=DIM_SOURCE_NONE`；「不动」→ 还原该行施加前该维值。
  - `lever==='weights'`：三选；「偏档案」→ `weights = nudgeWeights(weights, row.profileId, +20)`；「偏正文」→ −20；「不动」→ 还原该行施加前 weights。行下灰字（HIGH_RISK 处置）：「这条只改六轴画像与样本配比，不改各档案的文风规则文本；要精调请回上面「调整各档案占比」滑条。」若快照 weights 为空（legacy）→ 该组控件禁用 + 灰字「这本书按贡献维数计权，占比调整不可用」。
  - `lever==='none'`：无控件，灰字「这条门里没有对应旋钮：要去顶部导航「蒸馏」页的「风格档案」区改档案，或到书详情页「设定」节的「世界观与剧情大纲」面板改正文。」
  - 区块尾汇总：M>0 →「本次 <N> 条冲突里，<M> 条可以在门里直接裁决。」；M=0 →「本次 <N> 条冲突都只能在门外解决（改文风档案或改正文）。」（N=rows.length，M=lever!=='none' 且控件可用的行数）
  - 区块说明行（常驻）：「选「偏正文」=该维度以后不再采用档案风格，按你的正文与设定写；选「偏档案」=该维度以后跟随你指定的那本档案。两者都会**永久**改变这本书的文风绑定，要改回去请到书详情页「风格」节的「风格档案」面板。」
  - 「施加前快照」钉：每行首次从「不动」切到偏X时，把当前行作用域值存入本行 ref（dim 行按维、weights 行存整份 map 副本）；切回「不动」→ 写回本行 ref（该行从未施加则无操作）。多行互不干扰（各回滚各的写入）。
- buildBody 钉：提交条件扩为 `styleChoice!=='keep' || dimsSource/weights 相对挂载快照有任何差异`；命中且 `binding.styleBinding` 存在 → 四键恒取当前 state（初值即快照，未改时与旧逻辑等价；weights 原本空且未被改动 → 提交 `{}`）；恒带 `body.fingerprint`（现状 :92 已有）。
- 书未绑定（`binding.styleBinding === null`）时 dim/weights 行一律按 none 类渲染（无控件+灰字）——confirm schema 钉 primaryProfileId 必填、无绑定无从组 styleBinding（planner 补钉 P-1）。

## 4. 全局约束

1. 四卡**串行** TL-1 → TL-2 → TL-3 → TL-4，同工作树 ≤1 卡。
2. 禁改：`apps/server/src/fusion/apply.ts`、`apps/server/src/fusion/fingerprint.ts`、`apps/server/src/style/merge.ts` 的六轴（:225-243）与样本席位（:307-353）算法、`apps/server/src/db/repositories/books.ts` 双写形状、confirm applied/skipped 语义（undefined=不动）。
3. shared 新增均向后兼容：`TensionRowDto.lever` 必填但 analyze 响应唯一消费者是门前端（同仓同版）；`nudgeWeights` 为新导出（TL-4 当卡即有消费方，不挂 deadcode）。
4. 测试基线只增不减：开工先 `pnpm test` 实跑记数（最近存证 748 = 571 + 175 + 2），收口比较只增。
5. 验证链硬序：`pnpm lint` → 定向测试 → `pnpm test` 全量 → `pnpm typecheck` → `pnpm deadcode`；任一环失败即停回报，不得跳环。
6. 每卡一次提交：Conventional 前缀 + 中文描述；正文带 `verify:`（验证结果+基线数）与 `Refs: docs/plans/2026-11-24-tension-levers.md`；**只 commit 不 push**；**永不 `--no-verify`**；**永不 `git add -A`**。
7. 禁读 `apps/server/data/**`、词表文件、真实书稿文本；测试夹具一律中性仿形自造。
8. 行号为 2026-11-24 实读；若施工时漂移，以锚点注释/唯一匹配文本定位，卡面标注「以实际为准」。

## 5. 任务板

| ID | 卡面文件 | 范围 | 操作类型（文件 × 动作） | 依赖 |
| --- | --- | --- | --- | --- |
| TL-1 | `docs/design/card-2026-11-24-tl-1-protocol.md` | server+shared | Modify：`packages/shared/src/fusion.ts:20-26`；Modify：`apps/server/src/fusion/tension.ts:15-22,40-73,75-100`；Modify：`apps/server/src/http/routes.ts:1188-1197,1260,1268-1279`；Modify：`apps/server/test/fusion/tension.test.ts`；Modify：`apps/server/test/http/fusion-gate.test.ts` | 无（首卡） |
| TL-2 | `docs/design/card-2026-11-24-tl-2-merge-sentinel.md` | server+shared | Modify：`packages/shared/src/api.ts:403-404`；Modify：`apps/server/src/style/merge.ts:19,5-6,191-207`；Modify：`apps/server/test/style/merge.test.ts`；Modify：`apps/server/test/pipeline/chapter.test.ts`；Modify：`apps/server/test/http/polish.test.ts` | 无（与 TL-1 独立，串行排第 2） |
| TL-3 | `docs/design/card-2026-11-24-tl-3-validate-settings.md` | server+web | Modify：`apps/server/src/http/schemas.ts:2,103-111,112-121,385-401`；Modify：`apps/web/src/pages/BookDetailPage.tsx:299`；Modify：`apps/server/test/http/style.test.ts`；Modify：`apps/server/test/http/fusion-gate.test.ts`；Modify：`apps/web/src/pages/BookDetailPage.test.tsx` | Consumes TL-2 `DIM_SOURCE_NONE` |
| TL-4 | `docs/design/card-2026-11-24-tl-4-gate-ui.md` | web+shared | Modify：`packages/shared/src/fusion.ts`（增 nudgeWeights）；Modify：`apps/web/src/components/FusionGateDialog.tsx:41-94,113-129,231-254`；新增：`packages/shared/test/fusion.test.ts`；Modify：`apps/web/src/components/FusionGateDialog.test.tsx` | Consumes TL-1 DTO + TL-2 哨兵 + TL-3 放行语义 |

### 验收标准（每卡细目见卡面；此处为跨卡总验收）

1. analyze 响应每行带 `lever`；样例输入 `TENSION: 尺度张力 | 正文直白 | 档案含蓄 | 拉扯 | 偏向档案 | 维度=尺度` → `{lever:'dim', dim:'尺度'}`；`…| 占比=仙家`（仙家=已绑主档名）→ `{lever:'weights', profileId:'<主档id>'}`；旧 5 段行 → `{lever:'none'}`；建议段含 `|` 致 7 段 → 丢行计 invalid。
2. `dimsSource: { 特色词汇: '__none__' }` 落库回显、merge 后该维 `dims['特色词汇']===''`、prompt 无该维画像行；非八维键照旧 400。
3. confirm `weights:{}` → 200 applied 且快照无 weights 键（legacy）；`weights:{p1:50}`（Σ≠100）照旧 400。
4. 门内：dim 行「偏正文」确认后 `styleBinding.dimsSource[dim]='__none__'` 持久落库；weights 行 ±20 后 Σ=100；三态切换互不串行；GUI 本批未黑盒验证（owner 真实测试），提交信息注明。

## 6. 接口块（逐卡 Consumes/Produces）

- **TL-1** Consumes：无。Produces：
  - `packages/shared/src/fusion.ts`：`TensionRowDto` 增 `lever: 'dim'|'weights'|'none'`（必填）、`dim?: string`、`profileId?: string`。
  - `apps/server/src/fusion/tension.ts`：`TensionRow` 增 `lever`/`dim?`/`profileName?`；`parseTensionRows(text: string): { rows: TensionRow[]; invalid: number }` 签名不变、行为扩双收。
  - analyze 响应 `FusionTensionDto.rows: TensionRowDto[]`（形状升级）。
- **TL-2** Consumes：TL-1？（**否，独立**——不依赖 lever/DTO，仅 shared 常量新增）。Produces：`packages/shared/src/api.ts` `export const DIM_SOURCE_NONE = '__none__'`；merge 行为：`dimsSource[dim]=DIM_SOURCE_NONE → dims[dim]=''`。
- **TL-3** Consumes：TL-2 的常量名 `DIM_SOURCE_NONE`（精确签名 `export const DIM_SOURCE_NONE: '__none__'`，值即哨兵字面量）→ **必须先合入 TL-2**。Produces：schemas 放行面（dimsSource 值含哨兵；`weights: {}` 合法）。
- **TL-4** Consumes：TL-1 的 `TensionRowDto{ lever; dim?; profileId? }`（analyze 响应行三键）；TL-2 的 `DIM_SOURCE_NONE`；TL-3 的 confirm weights 放行 `{}` 语义 → **必须先合入 TL-1、TL-2、TL-3**。Produces：`packages/shared/src/fusion.ts` `export function nudgeWeights(weights: Record<string, number>, id: string, delta: number): Record<string, number>`（语义钉见 §3.4）。

## 7. 基线与验证链

- 基线命令（开工实跑记数）：`pnpm test`（根 package.json:14，`pnpm -r --if-present run test` → server + web + shared 三包 vitest）。最近存证 748 = 571（server）+ 175（web）+ 2（shared）。
- 定向命令模板：`pnpm -F @inkforge/server exec vitest run test/<路径>`；`pnpm -F @inkforge/web exec vitest run src/<路径>`；`pnpm -F @inkforge/shared exec vitest run test/<路径>`。
- 收口链：`pnpm lint` → 定向 → `pnpm test`（≥748 只增）→ `pnpm typecheck` → `pnpm deadcode`。

## 8. planner 补钉透明区（设计钉外，主模型可否决）

| ID | 补钉 | 理由（证据） | 落点 |
| --- | --- | --- | --- |
| P-1 | 书未绑定（`binding.styleBinding===null`）时，dim/weights 行按 none 类渲染 | confirm schema 钉 `primaryProfileId` 必填（schemas.ts:372），无绑定无从组 styleBinding；buildBody 现有 :79 守卫同款 | TL-4 步骤 D3 |
| P-2 | 配方区逐维 select（FusionGateDialog :235-251）补哨兵 option | TL-3 放行后快照 dimsSource 可含 `'__none__'`（BookDetailPage 或张力行写入），:240 `value` 匹配不到 option → 显示空白悬空 | TL-4 步骤 D7 |
| P-3 | routes.ts:1260 system 硬规则「五段竖线分隔」同步改「六段」 | 设计只点了 tension.ts prompt；此处在 routes.ts，漏改则 prompt 与 system 自相矛盾 | TL-1 步骤 E1 |
| P-4 | zod v4 `z.record` 已收 `{}`，放行改动落点=superRefine 空对象分支；设计钉的 `z.union` 包形仅作实跑不符时后备 | server zod ^4.6.7（package.json:20）；拒绝来自 superRefine（:112-121/:394-401），不在形状层 | TL-3 步骤 B6 |

## 9. 自审五查（写完计划与四卡后执行；发现即就地修）

1. **基点核实**：全部 `文件:行号` 经本轮实读核对。差异已修：张力区块 :107-122→:113-129、配方区 :156-240→:163-257、buildBody :65-87→:72-94、schemas :106-119→:103-121、routes degraded :1268-1277 精确到 :1269-1277。GET book 响应经 `...bookRest` 透出 styleSnapshotJson（routes.ts:381-384）已补证。已修。
2. **接口一致**：四卡 Consumes/Produces 与 §3 规格逐签名对齐；TL-2 独立、TL-3 Consumes TL-2 常量、TL-4 Consumes TL-1/2/3，已显式钉序（初稿 TL-2 误标依赖 TL-1，已改为独立）。已修。
3. **步骤可核对**：各卡步骤均 2-5 分钟粒度、每步一个动作+可核对结果；无 TBD；占位三处已核实写实。就地修：删 TL-1 初稿空步 A2（"cd 无需"非动作步）；TL-1 C2 import 补 `type StyleDimension`（normalizeLanding 收窄所需）；TL-1 验收样例「恰八键」错述改为 none 行六键整对象（none 行无可选键，八键为 DTO 全集上界）。已修。
4. **测试先红后绿**：每卡测试均先于实现。就地修：TL-3 初稿 web 实现（C）排在 web 测试（D）前，已重排为「C 测试先红 → D 实现转绿」；TL-2 初稿 chapter/polish 红例排在 merge 分支之后（写时即绿、红证据缺失），已重排为「B 全部红例（merge+chapter+polish 三文件）→ C 一次转绿」。另：`占比=不存在档案` 降 none 归 routes 层测试（parser 不识档案名），已从 tension.test 清单挪到 fusion-gate.test，防执行者写错红测试位置。TL-2 对照组夹具初稿「特色词汇:'pB' 且 pB 有文本」与实验组权重不等（2:1 vs 1:1），axes/samples 全等断言数学不成立——已改为「pB 该维文本为空」的等贡献对照组（merge :198 空文本跳贡献，与哨兵零贡献同权）。已修。
5. **红线与副作用**：merge.ts:207 时序（先哨兵后回落）、apply/fingerprint/books 不越界、deadcode 对新导出的挂空风险（nudgeWeights 同卡即消费；DIM_SOURCE_NONE 在 TL-2 内已被 merge.ts 消费）、GUI 未验证标注（TL-4 头部+约束+提交正文三处）——均已入卡面约束。已修。

## 执行完成记录（2026-11-24 收口，主审）

**通道与提交：** 四卡均走 opencode/hy4-flash-free（限时窗内、非禁入型），契约全部 exit0、无 flags、零轮转（TL-1 696s / TL-2 500s / TL-3 711s / TL-4 698s）。提交：TL-1=`6591ffc`（执行者按纪律停 F4 卡外红未提交，主审补 web 夹具直修后代提交）、TL-2=`022b408`（执行者自提交）、TL-3=`b1dfde5`（执行者自提交 `69350fa`，主审 amend 补「GUI 未验证（owner 真实测试）」标注）、TL-4=`989ab33`（执行者自提交，正文含双标注与 verify）。

**主审直修两枚（留痕）：** ①TL-1 验收时 web 张力夹具补 `lever:'none'` 一行（DTO 必填键跨卡耦合，同 FG-A 类）；②TL-3 提交正文 amend 补 GUI 未验证标注（该卡改前端下拉，执行者漏标）。

**测试终账：** **781**（server 586 / web 187 / shared 8）。轨迹：上批终账 748 → TL-1 后 757（server 580）→ TL-2 后 760（server 583）→ TL-3 后 765（server 586/web 177）→ TL-4 后 781（web 187/shared 8：nudgeWeights 六例+门组件十例）。只增不减，每环主审亲跑复核。

**GUI 口径：** 本批按 owner 真实测试分工不做黑盒验证；改前端三卡（TL-3/TL-4）提交正文均注明「GUI 未验证」。交 owner 复测点位：①张力行三选（不动/偏正文/偏档案）；②「偏正文」后该维画像行从生成 prompt 消失；③weights 行 ±20 步进与夹边、行下作用范围灰字；④legacy 书（weights={}）占比行禁用+灰字；⑤设置页「不采用档案风格（按正文走）」可选可回退；⑥门内逐维下拉哨兵项共存；⑦仅张力行改动（styleChoice 保持现状）也能触发 styleBinding 提交。另加上批十点位中尚未回报的九点。

**预期现象存证：** `dimsSource`/`weights` 入指纹 face——TL 批改动本就含 styleBinding 注入面（门指纹自然轮换属预期）；并维批（DEC-2026-1124-05）归一后旧书首次过门将重弹一次，勿当 bug 修。
