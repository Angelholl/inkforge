# 实现计划：蒸馏六维统一单维字数下限（DF-P，DEC-2026-1125-01）

- 日期：2026-11-25。计划真值源=本文（writing-plans 粒度纪律）；卡面=`docs/design/card-2026-11-25-df-planner.md`；决策归档=`docs/decision-log.md` DEC-2026-1125-01。
- 本计划只写签名、字面量、测试断言与步骤；**不含实现代码 diff**。代码只读，唯一落盘文件=本文；计划回账交 owner 审后再派执行卡。
- 测试基线起点=最近存证全量 **804**，只增不减；先红后绿。回归最少三点位（校验触发重试 / 反馈内容进第二次调用 / warning 透传）+ 边界例 + 五类咬人输入各一条。
- 行号=2026-11-25 工作树快照（大件经 pointer_tools 只读拉取），漂移以锚点文本/实际为准。

## 1. 目标

1. 给六维蒸馏建立**统一单维字数下限 = 70 字/维**（合并维不双倍、不分组待遇），根治「DIM 每维一行」被模型执行成单行短评的系统性缩水（V3 六维 261 字 vs V2 八维 434 字）。
2. 落地**三层强制**：①默认指令 DIM 行显式写量条（证据词只留建议措辞，不进硬校验）→ ②解析端逐维校验，不达门槛带具体反馈**自动重试一次** → ③重试后仍不达，**草稿标 warning** 供入库前人工补厚（不阻断 job、不阻断确认入库）。
3. 范围只覆盖**新蒸馏调用链**（含自定义模板路径：模板整体替换默认指令，但逐维下限是机制不变量，落点钉在解析层而非提示词层）；存量档案与读时别名零改动；仙家 V3 数据不动、不做重蒸验收。
4. 回归基线 804 只增不减；验收链 `pnpm lint` → 定向测试 → `pnpm test` 全量 → `pnpm typecheck` → `pnpm deadcode` 全绿。
5. 自审五查通过（§9），§1 三条钉死决策逐条可指到任务块（§3.1 映射表）。

## 2. 架构（改前现状与数据流）

### 2.1 锚点表（只读实读；行号快照）

| # | 锚点 | 现状 | 本计划处置 |
| --- | --- | --- | --- |
| 1 | `apps/server/src/style/analysis.ts:15-26` | `ANALYSIS_INSTRUCTION` 默认模板；DIM 行 `:16` 无单维量目标；三条定向指导行（语言与描写/尺度/叙述方式） | DF-1 只改 DIM 行措辞；其余逐字不动 |
| 2 | `apps/server/src/style/analysis.ts:46` | `instruction = input.instruction?.trim() ? input.instruction : ANALYSIS_INSTRUCTION`（自定义模板整体替换） | 零改动；DF-5 钉「模板不绕过机制」 |
| 3 | `apps/server/src/style/analysis.ts:58-68` | `isEmpty` 判定 + 「全空重试一次」回路（retry 文案 `【解析失败重试】…`） | DF-3 把重试条件扩为「全空 ∨ 有单维不达标」，最多一次 |
| 4 | `apps/server/src/llm/plainproto.ts:340` | `ParsedAnalysis { dims, axes, rules, terms, freqTerms, errors }` | DF-2 扩 `dimShortfalls` 字段 |
| 5 | `apps/server/src/llm/plainproto.ts:352-427` | `parseAnalysis`；`:363-368` 未知维度丢弃并记 error；`:424` 缺行补 `''` | DF-2 在补空**之后**统一计算逐维缺口（交互钉死见 §3.8） |
| 6 | `apps/server/src/style/distill-job.ts:81-114` | `runDistillJob`：`instruction=getTemplate()||undefined`；`:92` 调 `analyzeStyle`；`result_json={analysis,samples,evaluation,sourceText}` | DF-4 从 analyzeStyle 收 `warnings` 并并入 result_json |
| 7 | `apps/server/src/http/routes.ts:1002/:1010` | 轮询端点把 `result_json` 直接 `as DistillStyleDraftDto` 回传 | **零改动**：warnings 随 DTO 自动透传 |
| 8 | `packages/shared/src/api.ts:385-393` | `DistillStyleDraftDto { analysis, samples, evaluation, sourceText? }` | DF-4 加 `warnings?: string[]`（仅草稿层） |
| 9 | `packages/shared/src/api.ts:402 / :441-498` | `STYLE_DIMENSIONS` 六维常量；读时别名 `mergeLegacyDimTexts` / `mapLegacyDimSource` | **零改动红线**（存量档案/读时别名不动） |
| 10 | `packages/shared/src/api.ts:511 / :606-612` | `StyleAnalysisDto`；`DistillJobDto.result: DistillStyleDraftDto` | `StyleAnalysisDto` **零改动**（不入库、不改归档形状）；job DTO 零改动 |
| 11 | `apps/web/src/pages/StyleProfilesSection.tsx:~54-99` | `pollJob` 到 done 后 `setDraft({ analysis, samples, name, sourceText })`；failed 读 `job.error` | DF-6 把 `job.result.warnings ?? []` 写入 draft |
| 12 | `apps/web/src/pages/StyleProfilesSection.tsx:466-531 / :546-552` | 草稿预览编辑区；`DistillDraftState { analysis, samples, name, sourceText }` | DF-6 扩 `warnings: string[]` 并在预览区顶部显示 |
| 13 | `apps/server/src/style/distill.ts:42`、`apps/server/src/http/routes.ts:335` | CLI 蒸馏 / 设定集导入也调 `analyzeStyle`（各只解构 `analysis`） | 不新增分支：同一机制覆盖；多出的 `warnings` 被忽略（§5 随迁项） |

### 2.2 数据流（改后；★=新增/扩展点）

```
默认/自定义 instruction → analyzeStyle
  ★DF-1 默认指令 DIM 行写「每维不少于 70 字」+证据词建议句（自定义模板路径不经过此文案）
  → provider.complete(第1次) → parseAnalysis
      ★DF-2 逐维计数（trim 后按字符），产出 dimShortfalls；未知维丢弃→补空→也进 dimShortfalls
  ★DF-3 if (isEmpty ∨ dimShortfalls.length>0) → 带反馈文案 complete(第2次，唯一一次重试)
      → 仍 isEmpty ⇒ 抛错（沿用现状）；非空但仍有缺口 ⇒ 产出 warnings
      → return { analysis, evaluation, warnings }
  → distill-job runDistillJob ★DF-4 result_json 加 warnings（job 仍 done，error 仍 null）
  → GET /api/style-profiles/jobs/:jobId（routes.ts 零改动，cast 自动带出）
  → web pollJob ★DF-6 draft.warnings → 草稿预览顶部 role=alert 提示（GUI 实测延后，§8）
  → 确认入库 POST /api/style-profiles（StyleProfileCreateBody 零改动，warnings 不入库）
```

### 2.3 范围与红线

- **动**：`analysis.ts`（指令 + analyzeStyle）、`plainproto.ts`（解析 + 类型）、`shared/api.ts`（仅 `DistillStyleDraftDto` 加可选字段）、`distill-job.ts`（result_json 加 warnings）、`StyleProfilesSection.tsx`（draft 状态 + 显示）、对应 5 个测试文件。
- **不动**：`mergeLegacyDimTexts` / `mapLegacyDimSource` / `STYLE_DIMENSIONS` / `LEGACY_DIM_ALIAS` / `LEGACY_DIM_GROUPS` / `StyleAnalysisDto` / `StyleProfileCreateBody` / `DistillJobDto` / `routes.ts` / 任何 `apps/server/data/**` 真实库数据 / 存量档案与快照 / 仙家 V3 数据；无迁移脚本、无编辑端点、重蒸不注入旧内容（`base_profile_id` 仍仅记账）。

## 3. 规格（钉死的实现决定；死行禁入）

### 3.1 §1 三条决策 → 任务块映射（验收 grep 用）

| 钉死决策（卡面 §1） | 落地任务块 | 钉点 |
| --- | --- | --- |
| 决策① 六维统一单维下限 70 字/维；合并维不双倍、不分组 | **DF-1**（指令量条）、**DF-2**（解析层统一阈值，不分维种）、**DF-2-S2**（69/70 边界） | §3.2 / §3.3 / §3.8 |
| 决策② 三层强制：①指令量条 ②解析校验+带反馈重试一次 ③仍不达标标 warning | **DF-1**（层①）、**DF-2 + DF-3**（层②，反馈文案/次数上限）、**DF-4 + DF-6**（层③，透传+显示） | §3.2 / §3.5 / §3.6 |
| 决策③ 范围：仅新蒸馏链（含自定义模板）；存量与读时别名零改动；仙家 V3 不动 | **DF-5**（模板路径不变量）、**DF-2**（校验无条件执行）、§2.3 红线 + §4 约束 | §3.7 / §4 |

### 3.2 指令 DIM 行精确新措辞（DF-1；逐字）

`ANALYSIS_INSTRUCTION` 中 DIM 行**唯一替换为下列字面量**（行协议其余部分逐字不动）：

```
DIM: <维度>: <一段描述>（六维：语言与描写、特色词汇、结构与节奏、情感基调、尺度、叙述方式，每维一行；每维不少于 70 字，请写足样本中的具体字句与手法细节，勿只给短评。证据词仅作建议：引用样本原文短语作支撑即可，不设数量硬指标。）
```

- 「每维不少于 70 字」=层①硬量条；「证据词仅作建议…不设数量硬指标」=证据词只留建议措辞、**不进硬校验**。
- **逐字不动清单**：`AXIS:` 行、`RULES:` 行、`TERMS:` 行、`FREQTERMS:` 行、`NAMES:` 行、`不要输出 JSON、markdown 代码块或任何解释。`、`【样本开始】`，以及三条指导行（语言与描写维=…、尺度维=…含「每条证据不超过 10 字」、叙述方式维=…含「心理距离」）。`distill-template.test.ts:105-109` 既有子串断言须保持绿。
- 该量条**仅默认模板有**；自定义模板整表替换后不含它，但逐维下限由 DF-2 保证（§3.7）。

### 3.3 字数计数法与边界（DF-2）

- 计数函数（模块私有，不导出）：`countDimChars(s: string): number = Array.from(s.trim()).length`。
- 口径：`trim` 去首尾空白后按 **Unicode 码点**计，**CJK / ASCII / 标点 / 串内空白各计 1**；空串或纯空白 = 0。用 `Array.from` 而非 `.length`，避免代理对双计（钉死，防边界争议）。
- 常量：`export const STYLE_DIM_MIN_CHARS = 70`（定义在 `plainproto.ts` `parseAnalysis` 附近，供 `analysis.ts` 反馈文案引用，避免两处硬编码 70；有生产消费方，不挂 deadcode）。
- 判定：`chars >= 70` 放行；`chars < 70` 记缺口。边界钉测试：**69 → 触发（缺口 chars=69）/ 70 → 放行（无缺口、无重试、无 warning）**。

### 3.4 校验落点与数据形状（DF-2）

- **落点=`parseAnalysis` 返回值扩展**（不放在 analysis 层）：因为缺行补空与未知维丢弃都在这里发生，缺口必须包含「被丢弃后补空」的维（§3.8）。
- `ParsedAnalysis` 扩展字段（签名）：

  ```ts
  dimShortfalls: Array<{ dim: string; chars: number }>
  ```

- 计算时机：在现有 `for (const d of STYLE_DIMENSIONS) if (dims[d] === undefined) dims[d] = '';` **之后**、return 之前；遍历 `STYLE_DIMENSIONS`（顺序即 `packages/shared/src/api.ts:402` 表序），逐维 `countDimChars(dims[d]) < 70` 者 push `{dim, chars}`。
- `dimShortfalls` **不并入 `errors`**：既有 `errors` 断言（如 `plainproto.test.ts:307-322` 的 `errors.toEqual([])`、`:296` 的「现行六维」）保持绿；缺口走独立通道。
- `StyleAnalysisDto` 零改动：返回给 DTO 的转换仍只取 `dims/axes/rules/terms/freqTerms`；`dimShortfalls` 只在 `analyzeStyle` 内部消费。

### 3.5 反馈文案与重试上限（DF-3）

- `analyzeStyle` 返回签名扩为：

  ```ts
  Promise<{ analysis: StyleAnalysisDto; evaluation: SelfEvalItem[]; warnings: string[] }>
  ```

- 重试条件：`isEmpty(analysis) || first.dimShortfalls.length > 0`。
- **次数上限=1**：第二次 `provider.complete` 后无论结果如何**不再发第三次**；自评（held-out）调用不是重试，不计入。
- 反馈文案格式（逐字模板）：`维度${s.dim}仅${s.chars}字，低于下限70字，请重写该维`；多条以 `；` 连接，整体前缀 `【单维字数不足，需重写】`，作为 `\n\n${feedback}` 拼到原 `user` 后。
- 与「全空重试」**互斥**：`isEmpty` 为真时沿用现状原句 `【解析失败重试】上一轮输出缺少 DIM/AXIS/RULES 标记，请严格按【输出格式】重新输出。`，不叠加缺口文案（否则 6 个 0 字重复噪音）。
- 第二次解析后：`isEmpty` 仍真 ⇒ 沿用 `throw new Error('文风分析失败：输出缺少 DIM/AXIS/RULES 行')`；非空但仍有缺口 ⇒ **不抛**，`warnings` 按 §3.6 生成。
- `warnings` 恒取**最终一次**解析的 `dimShortfalls`（未重试则取第一次）；首轮全达标时 `warnings=[]`。

### 3.6 warning 形状与透传（DF-4 + DF-6）

- 单条 warning 字面量（逐字模板）：`维度${s.dim}仅${s.chars}字，低于下限70字`（**无**「请重写该维」，与反馈文案区分）。
- DTO：`DistillStyleDraftDto` 增 `warnings?: string[]`（仅草稿层；**不进** `StyleAnalysisDto` / `StyleProfileCreateBody` / 归档 `rules_json`）。
- `runDistillJob`：解构 `const { analysis, evaluation, warnings } = await analyzeStyle(...)`；`resultJson` 由 `{analysis,samples,evaluation,sourceText}` 扩为含 `warnings`。job 仍 `status=done / progress=100 / stage=done`，`error=null`；warning **不改状态、不抛错、不阻断确认入库**。
- `routes.ts` 轮询端点零改动（`:1010` 已 cast 为 `DistillStyleDraftDto`），warnings 自动透传。
- 前端：draft 状态扩 `warnings: string[]`；`pollJob` 写 `warnings: job.result.warnings ?? []`（缺省兼容旧 job / 无 warning 场景）；显示位置=草稿预览容器内 `<h3>草稿预览编辑（未入库）</h3>` 之后、六维编辑区之前，一个 `role="alert"` 容器，复用现有 token `rounded-card border border-line bg-bg p-2 text-xs text-muted`；文案字面量：

  ```
  单维字数不足（草稿未达标，请编辑补厚后再确认入库）：{draft.warnings.join('；')}
  ```

  仅 `draft.warnings.length > 0` 时渲染；无 warning 时 DOM 不出现该节点（可断言 `queryByRole('alert')` 为 null）。

### 3.7 自定义模板路径不变量（DF-5）

- 现状链：`runDistillJob` 传 `instruction: deps.getTemplate() || undefined` → `analyzeStyle` 用 `input.instruction?.trim()` 整表替换默认指令（`analysis.ts:46`）。
- **钉死**：逐维下限、重试、warning 由 `parseAnalysis` / `analyzeStyle` 保证，**与 instruction 来源无关**；自定义模板即使完全不含「70 字」字样，仍照常触发校验与 warning。模板只替换提示文案，不是机制开关。
- 测试落点=`apps/server/test/http/distill-template.test.ts`：PUT 一个不含量条的模板 → distill → 断言 prompt 为该模板（默认指令不出场）**且**仍发生重试、result 带 warning（断言第二次 user 含 §3.5 反馈文案）。

### 3.8 五类咬人输入的交互钉死

| 输入类 | 钉死行为 | 归属任务/用例 |
| --- | --- | --- |
| 空维文本 `DIM: 情感基调: ` | `m[2].trim()=''` → `chars=0` → 缺口 `{dim:'情感基调',chars:0}` | DF-2-S1（`plainproto.test.ts`） |
| 纯空白 `DIM: 特色词汇: <空格/制表>` | trim 后 `chars=0` → 同上；串内空白照计 1 | DF-2-S1 |
| 恰等于阈值 | 69 → 缺口 chars=69；70 → 无缺口、不重试、warning=[] | DF-2-S2 + DF-3-S2 |
| 自定义模板路径 | 模板整表替换默认指令；校验/warning 不绕过 | DF-5 |
| 旧名 DIM 行被丢致缺行补空 | `DIM: 对话: 甲` 仍记 `未知维度: 对话` error 且丢弃 → `:424` 补 `''` → `dimShortfalls` 含 `{dim:'语言与描写',chars:0}`；反馈文案出现 `维度语言与描写仅0字…`；两类信息并存、互不覆盖 | DF-2-S1 + DF-3-S2 |

### 3.9 风险与待裁决（卡面 §1 异议出口）

- **无推翻性异议**。以下为已识别风险/预期现象，不阻塞计划：
  1. 非 job 调用面（`distill.ts:42` CLI、`routes.ts:335` 设定集导入）共用 `analyzeStyle`，会多一次重试调用但其 `warnings` 不被消费；`analysis.test.ts:147` 的请求下标因此随迁（§9 缺口清单 G1）。不新增开关分支，保持机制单一。
  2. `distill-template.test.ts:12` / `distill-jobs.test.ts:18-19` 的旧夹具维名 `节奏` / 短文本会触发重试+warning；既有断言只查首轮 prompt 与落库字段，保持绿（§9 G2）。
  3. 存量自定义 `distill_template` 若仍指示旧八维名：旧名行照旧记 errors 丢弃、缺行补空、触发本机制的 0 字 warning；不迁移、不重写数据（与 DEC-2026-1124 预期现象一致）。
  4. GUI 真实测试按 11-24 令延批次由 owner 一次做（§8），本批不声称已实测。
  5. 若 owner 后续要求「合并维双倍下限」或「证据词数量硬校验」，属推翻 §1 钉死决策，须回卡面重拍，不在本计划内自行调整。

## 4. 全局约束

1. 执行卡**串行** DF-1 → DF-2 → DF-3 → DF-4 → DF-5 → DF-6，同工作树 ≤1 卡；执行者只 commit 不 push。
2. 只读红线（越界即停）：不得改 `packages/shared/src/api.ts` 的 `STYLE_DIMENSIONS` / 别名函数 / `StyleAnalysisDto` / `StyleProfileCreateBody` / `DistillJobDto`，不得改 `routes.ts`、`apps/server/data/**`、任何存量档案/快照/仙家 V3 数据；无迁移、无编辑端点。
3. 测试基线只增不减：开工先实跑 `pnpm test` 记数（最近存证 804），每卡收口只增；禁删用例，旧钉值只随迁。
4. 验证链硬序：`pnpm lint` → 定向测试 → `pnpm test` 全量（≥804）→ `pnpm typecheck` → `pnpm deadcode`；任一环失败即停回报，不得跳环。
5. 读 >4KB 文件用 `python C:/Users/57850/.zcode/tools/pointer_tools.py` 的 `pointerize/read_pointer/read_diff_only`，禁止整读全文；卡外问题即停回报；计划只写签名与断言，不得给实现代码 diff。
6. 每卡一次提交：Conventional 前缀 + 中文描述；正文带 `verify:`（验证结果+基线数）与 `Refs: docs/plans/2026-11-25-dims-floor.md`；永不 `--no-verify`；永不 `git add -A`。
7. 行号为 2026-11-25 实读快照，施工以锚点注释/唯一匹配文本定位；`dimShortfalls` / `warnings` 新增字段一律可选或带缺省，保证旧 job、旧草稿兼容。

## 5. 风险与待裁决

见 §3.9（置于规格内以便 §1 决策映射同节可指）。无推翻项；GUI 实测延后条款见 §8。

## 6. 任务块（文件 / 接口 / 步骤 checkbox 串）

### DF-1 指令量条（层①）

- **文件**：改 `apps/server/src/style/analysis.ts:16`（DIM 行）；测 `apps/server/test/http/distill-template.test.ts:99-110`。
- **接口**：Produces=`ANALYSIS_INSTRUCTION` DIM 行=§3.2 字面量；不改任何函数签名。
- **步骤**：
  - [ ] DF-1-S1（红，2-3 min）：在 `distill-template.test.ts` 既有「默认指令」用例加断言 `expect(captured[0]).toContain('每维不少于 70 字')` 与 `expect(captured[0]).toContain('证据词仅作建议')`；跑 `pnpm --filter @inkforge/server test -- test/http/distill-template.test.ts -t '默认指令'`，核对结果=**1 红**（该用例失败，红因=字样缺失；两条断言先后生效）。
  - [ ] DF-1-S2（绿，2-3 min）：仅替换 DIM 行为 §3.2 字面量；重跑上条命令，核对结果=全绿，且 `:105-109` 六维清单/心理距离/对话腔/尺度维/六轴断言仍绿。
  - [ ] DF-1-S3（守，2 min）：grep 核对「逐字不动清单」未被改动（AXIS/RULES/TERMS/FREQTERMS/NAMES/三条指导行/样本开始逐字保留），核对结果=`git diff` 仅命中 1 行。

### DF-2 解析端逐维校验（层②数据基础）

- **文件**：改 `apps/server/src/llm/plainproto.ts:340`（接口）、`:352-427`（parseAnalysis）；测 `apps/server/test/llm/plainproto.test.ts`（新增 describe）。
- **接口**：Consumes=`STYLE_DIMENSIONS`（`api.ts:402`）；Produces=`export const STYLE_DIM_MIN_CHARS = 70`、私有 `countDimChars`、`ParsedAnalysis.dimShortfalls: Array<{dim:string;chars:number}>`、`parseAnalysis` 行为扩展（errors 不变）。
- **步骤**：
  - [ ] DF-2-S1（红，3-4 min）：在 `plainproto.test.ts` 新增 4 个 `it`——空维文本、纯空白、旧名 `对话` 丢弃→补空、六名齐行带 1 条 42 字其余 70 字；断言 `r.dimShortfalls` 的 dim/chars 精确值，并断言 `r.errors` 仍含「未知维度: 对话」/「现行六维」且不含缺口文案；跑定向测试，核对结果=**4 红**（`dimShortfalls` undefined）。
  - [ ] DF-2-S2（红，2-3 min）：新增边界 `it`：`'字'.repeat(69)` → 缺口 chars=69；`'字'.repeat(70)` → `r.dimShortfalls` 为空；核对结果=**1 红**（两条断言先后报红）。
  - [ ] DF-2-S3（绿，3-5 min）：加常量+私有计数函数+接口字段，在 `:424` 补空之后按 §3.4 计算；重跑 S1/S2，核对结果=6 绿且 `errors` 断言未回归。
  - [ ] DF-2-S4（守，2 min）：确认 `countDimChars` 未导出、`STYLE_DIM_MIN_CHARS` 在 DF-3 有消费方（避免 deadcode），核对结果=`pnpm deadcode` 零新增告警（DF-3 落地后复核）。

### DF-3 反馈重试 + warning 生成（层②③核心）

- **文件**：改 `apps/server/src/style/analysis.ts:58-68`（重试回路）；测 `apps/server/test/style/analysis.test.ts`（新增 describe）。
- **接口**：Consumes=DF-2 `dimShortfalls` / `STYLE_DIM_MIN_CHARS`；Produces=`analyzeStyle` 返回 `{analysis,evaluation,warnings}`，重试上限=1，反馈/warning 字面量见 §3.5/§3.6。
- **步骤**：
  - [ ] DF-3-S1（红，3-4 min）：新增「校验触发重试」例——capturing provider 依次返回「六维中 1 条 42 字 + 5 条 70 字」「六维全 70 字」，断言 `complete` 调用数=2、`warnings=[]`；核对结果=**红**（旧实现无重试、无 warnings）。
  - [ ] DF-3-S2（红，3-4 min）：同例加断言第 2 次 `req.user` 含 `维度语言与描写仅42字，低于下限70字，请重写该维`；另加「重试后仍不足」例（两次同短文本）断言 `warnings=['维度语言与描写仅42字，低于下限70字']`、调用数仍=2；核对结果=**2 红**。
  - [ ] DF-3-S3（红→绿，3-5 min）：按 §3.5 扩重试条件与反馈、按 §3.6 生成 warnings；重跑 S1/S2，核对结果=全绿；另跑既有 `analysis.test.ts` 确认「空源抛错」「全空重试」语义未变。
  - [ ] DF-3-S4（守，2 min）：核对 `distill.ts:42` / `routes.ts:335` 只解构 `analysis`，编译无类型破坏，核对结果=`pnpm typecheck` 零报。

### DF-4 warning 透传（层③服务端）

- **文件**：改 `packages/shared/src/api.ts:385-393`（`DistillStyleDraftDto` 加 `warnings?: string[]`）、`apps/server/src/style/distill-job.ts:92/:104-108`（resultJson 加 warnings）；`routes.ts` **零改动**；测 `apps/server/test/http/distill-jobs.test.ts`。
- **接口**：Consumes=DF-3 `warnings`；Produces=`DistillStyleDraftDto.warnings?: string[]`；`runDistillJob` result_json 形状 `{analysis,samples,evaluation,sourceText,warnings}`。
- **步骤**：
  - [ ] DF-4-S1（红，3-4 min）：在 `distill-jobs.test.ts` 新增 HTTP 例——summarizerProvider 用固定短文本队列（两次均不足）→ `waitJob` → 断言 `job.status='done'`、`job.error=null`、`(job.result as DistillStyleDraftDto).warnings` 含钉死文案；核对结果=**红**（字段不存在）。
  - [ ] DF-4-S2（绿，2-3 min）：加 DTO 可选字段并在 resultJson 并入 warnings；重跑 S1，核对结果=绿；`routes.ts` diff 为空（grep 白名单核对）。
  - [ ] DF-4-S3（守，2 min）：核对 `StyleAnalysisDto` / `StyleProfileCreateBody` / 归档 `rules_json` 形状零改动，核对结果=`git diff --stat` 仅 3 文件（api.ts / distill-job.ts / 该测试）。

### DF-5 自定义模板路径不变量

- **文件**：只改 `apps/server/test/http/distill-template.test.ts`（新增 1 例）；生产代码**零改动**（验证 DF-2/DF-3 的落点正确性）。
- **接口**：Consumes=DF-2（解析层无条件校验）+ DF-3（重试/warning）；Produces=无新增签名。
- **步骤**：
  - [ ] DF-5-S1（红，3-4 min）：PUT 一个不含「70 字」的自定义模板（复用 `CUSTOM_TEMPLATE`）→ distill → `waitJob` → 断言 `captured[0]` 含模板且不含默认指令六维清单，同时 `captured[1]` 含 `低于下限70字`，result.warnings 非空；核对结果=**红**（旧实现第二次调用不存在）。
  - [ ] DF-5-S2（绿，2 min）：重跑 S1（DF-2/DF-3 已落地则自动绿）；核对结果=绿，确认无需在生产代码加任何「模板兼容」分支。

### DF-6 web warning 显示

- **文件**：改 `apps/web/src/pages/StyleProfilesSection.tsx`（`~54-99` pollJob、`:546-552` DistillDraftState、`:466-531` 预览区）；测 `apps/web/src/pages/StyleProfilesSection.test.tsx`（新增 1 例 + jobStub 变体）。
- **接口**：Consumes=`DistillStyleDraftDto.warnings`（DF-4）；Produces=`DistillDraftState.warnings: string[]`，预览区 `role="alert"` 节点（文案 §3.6）。
- **步骤**：
  - [ ] DF-6-S1（红，3-4 min）：测试 stub 增 `jobWarnings: string[]`（`afterEach` 复位 `[]`），job done 的 result 带上它；新例设 2 条 warning → 蒸馏 → 断言 `screen.getByRole('alert')` 文本含 `单维字数不足（草稿未达标，请编辑补厚后再确认入库）：` 与两条文案；核对结果=**红**（无 alert 节点）。
  - [ ] DF-6-S2（绿，3-4 min）：扩 draft 类型、pollJob 写 `warnings ?? []`、按 §3.6 插入 alert；重跑 S1，核对结果=绿；另断言无 warning 时 `queryByRole('alert')` 为 null。
  - [ ] DF-6-S3（守，2 min）：确认 `createStyleProfile` payload 未带 warnings、`StyleProfileCreateBody` 零改动；核对结果=`pnpm --filter @inkforge/web test` 全绿 + 该断言成立。
  - [ ] DF-6-S4（延，GUI）：真实浏览器实测按 §8 延批次，**本卡不执行**。

### 随迁项（非新用例，随 DF-3 自动发生）

| 位置 | 随迁原因 | 处置 |
| --- | --- | --- |
| `apps/server/test/style/analysis.test.ts:147-148` | 首次蒸馏触发重试 → `captured` 索引后移 | 把第二次蒸馏首轮断言从 `captured[1]` 改为 `captured[2]`（轮次筛选亦可）；语义不变、只随迁 |
| `apps/server/test/http/distill-template.test.ts:12` | 旧名 `节奏` 触发重试 | `captured[0]` 断言不变；禁止新增「未发生重试」断言 |
| `apps/server/test/http/distill-jobs.test.ts:18-19` | 短 DIM 夹具触发重试+warning | 落库/result 既有断言不变；新例归 DF-4 |
| `apps/server/test/http/self-eval.test.ts:46`（DF-3 轮补登） | mock sequence 单次即尽：ANALYSIS_TEXT 短文本触发反馈重试后队列错位→自评取空→抛错 | 主审直修已落地=队列补一份 ANALYSIS_TEXT（断言零改动，随 DF-3 提交 61a4d12）；后续卡新增用例 fixture 须保证每次调用有响应 |

## 7. 回归测试与验收口径（先红后绿，基线 804）

### 7.1 三点位 + 五类输入归属

| 要求 | 任务/用例 | 断言要点 |
| --- | --- | --- |
| ①校验触发重试 | DF-3-S1 | `complete` 调用数=2；首轮短→次轮全达标 |
| ②反馈内容进第二次调用 | DF-3-S2 / DF-5-S1 | 第 2 次 user 含 `维度语言与描写仅42字，低于下限70字，请重写该维` |
| ③warning 透传 | DF-4-S1（server DTO）+ DF-6-S1（web 显示） | `job.result.warnings` 非空；页面 alert 文本含钉死文案 |
| 边界 69 触发 / 70 放行 | DF-2-S2 + DF-3-S2 | chars=69 入缺口；chars=70 无缺口、不重试、warning=[] |
| 空维文本 | DF-2-S1 | `{dim:'情感基调',chars:0}` |
| 纯空白 | DF-2-S1 | `{dim:'特色词汇',chars:0}` |
| 恰等于阈值 | DF-2-S2 | 同上边界 |
| 自定义模板路径 | DF-5-S1 | 模板整表替换仍校验/重试/warn |
| 旧名行丢弃→补空→阈值交互 | DF-2-S1 + DF-3-S2 | errors 含「未知维度: 对话」且 dimShortfalls 含 `{dim:'语言与描写',chars:0}`；反馈出现 `仅0字` |

### 7.2 跨卡总验收

1. `pnpm test` 全量 ≥804（只增不减；轨迹按卡记数入提交正文）。
2. 定向：plainproto / analysis / distill-jobs / distill-template / StyleProfilesSection 五套测试全绿，红例均有明确红驱动字样。
3. `pnpm lint`、`pnpm typecheck`、`pnpm deadcode` 零新增告警。
4. `git diff --stat` 覆盖文件与 §2.3「动」清单一致；`apps/server/data/**` 零 diff；`StyleAnalysisDto` / 别名函数 / routes.ts 零 diff。
5. 验收命令（项目根目录）：`ls docs/plans/2026-11-25-dims-floor.md` 存在且为唯一新增文件；grep §1 三条决策在 §3.1 可逐条指到任务块；§9 缺口清单可见。

## 8. GUI 延后条款（11-24 令）

- 本计划含 web 改动（DF-6 warning 显示）。**GUI 真实测试延批次收口，由 owner 一次完成**；本批只交付代码 + 自动化单测，不声称已实测。
- 交 owner 实测点位：①短维草稿轮询到 done 后预览区顶部出现「单维字数不足…」提示，且六维输入框可编辑补厚；②达标草稿（六维≥70）不出现该提示；③补厚后点「确认入库」正常入库、warnings 不落档；④自定义模板（无 70 字样）蒸馏仍出现提示。

## 9. 自审五查（写完计划即执行，发现即就地修，结论回填）

1. **基点核实**：全部 `文件:行号` 本轮经 pointer_tools 实读（超 4KB 文件未整读）。修正记录：卡面 `analysis.ts:15-26/:46/:58-68`、`plainproto.ts:340/:352-427/:363-368/:424`、`distill-job.ts:81-114`、`routes.ts:1002/:1010`、`api.ts:385-393/:402/:511/:606-612` 逐一吻合；StyleProfilesSection 的 pollJob/预览区行号按实读取 `~54-99` / `466-531` / `546-552`（卡面 `:54/:78` 为快照近似，本文以函数名锚定）。已核。
2. **接口一致**：六个任务块 Consumes/Produces 与 §3 逐签名对齐——DF-2 产 `dimShortfalls`/`STYLE_DIM_MIN_CHARS` → DF-3 消费；DF-3 产 `warnings` → DF-4 消费 → DF-6 消费；DF-5 只消费不生产；DF-1 独立。无交叉依赖遗漏。已核。
3. **步骤可核对**：每任务步骤均为 2-5 分钟、一步一动作+可核对结果（红/绿计数、grep/diff 白名单、`git diff --stat`），无 TBD。已核。
4. **先红后绿**：DF-1/2/3/4/5/6 各新例先于实现列步，红驱动明确（字样缺失 / 字段 undefined / 调用数 / alert 节点）；随迁项单列且注明「非新用例，红来源=调用数随迁」。已核。
5. **红线与副作用**：§2.3/§4 逐项锁死存量/别名/数据/仙家 V3；warnings 仅草稿层可选、不入库；`countDimChars` 私有、`STYLE_DIM_MIN_CHARS` 有生产消费方防 deadcode；非 job 调用面共用 analyzeStyle 仅多一次调用、无状态副作用。已核。

### 缺口清单（自审发现 → 就地修痕迹）

| ID | 发现 | 处置（已就地修入本文） |
| --- | --- | --- |
| G1 | `analyzeStyle` 有 4 个调用面（定义、CLI `distill.ts:42`、job `distill-job.ts:92`、设定集导入 `routes.ts:335`）；通用重试会让 `analysis.test.ts:147` 的 `captured[1]` 由「第二次蒸馏首轮」变成「第一次蒸馏重试轮」 | §5 随迁表钉 `captured[2]`；§3.9 记风险；不新增开关分支 |
| G2 | `distill-template.test.ts:12` / `distill-jobs.test.ts:18-19` 旧夹具维名/短文本会触发重试+warning，可能误伤既有断言 | §5 随迁表钉「`captured[0]` 断言不变、禁止新增未重试断言」；既有断言实读确认只查首轮 prompt/落库字段 |
| G3 | 若把缺口并入 `errors`，`plainproto.test.ts:296/:307-322` 的 `errors` 断言会红 | §3.4 钉死 `dimShortfalls` 独立字段、不并入 errors |
| G4 | 自定义模板整体替换指令，量条不在 prompt 中，若校验放在指令层会被绕过 | §3.7 钉死校验落点=`parseAnalysis`（无条件）；DF-5 专测 |
| G5 | 全空与 6 个 0 字缺口同时存在会产出重复噪音反馈 | §3.5 钉死互斥：isEmpty 用原句，不叠加缺口文案 |
| G6 | web 显示需 GUI 实测，本批无法在自动化内收口 | §8 延后条款 + 4 个 owner 实测点位 |
| G7 | `STYLE_DIM_MIN_CHARS` 若只定义不消费会挂 deadcode；`countDimChars` 导出同样有风险 | §3.3/DF-2-S4 钉死：常量由 DF-3 消费、计数函数私有 |
| G8 | 行号随时间漂移（卡面自注「以实际为准」） | §2.1 全部锚点附函数名/字面量；§4.7 钉「以锚点文本定位」 |
