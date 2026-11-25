# 实现计划：人物光谱蒸馏容量放宽——ROLE 上限 16 / 抽样 16 段 / planner 注入 1500 字（SP-P，DEC-2026-1125-02）

- 日期：2026-11-25。计划真值源=本文；卡面=`docs/design/card-2026-11-25-sp-planner.md`；决策归档=`docs/decision-log.md` DEC-2026-1125-02。
- 本计划只写精确文件路径、行号、字面量、测试名与断言、可执行步骤，**不含实现代码 diff**；唯一落盘文件=本文。
- 行号=2026-11-25 工作树快照；>4KB 文件经 `python C:/Users/57850/.zcode/tools/pointer_tools.py` 的 `pointerize/read_pointer` 只读拉取，未整读全文。施工漂移时以锚点文本/函数名定位，不以行号硬依赖。
- 测试基线起点=**815**，只增不减；新增 3 例、迁移 1 例（不减计数）→ 收口目标 **≥818**。先红后绿。

## 1. 目标

1. 三处数字联动放宽：① ROLE 条数上限 8→**16**（prompt 文案、解析截断、save schema）；② `analyzeSpectrum` 抽样调用点 `maxSegments` 8→**16**（`segmentChars: 2000` 不变）；③ planner 注入槽 `spectrumReference` 的 `budgetChars` 600→**1500**。
2. 语义零漂移：ROLE 下限 3 与「不足 3 条判蒸馏失败」不变；NAMES 不入库、脱敏命中重蒸一次再犯 throw、`ROLE 行严禁人名` prompt 条款全部零改动。
3. 红线零越界：`sampleReferenceText` 函数本体与默认值（20000/20）不动；plot / imitation 蒸馏口径（各 `maxSegments: 8`）不动；drafter 不注入光谱槽不动；存量已入库光谱档案不重蒸、无迁移代码；`apps/server/data/**` 不动。
4. 四条回归测试先红后绿（名+断言见 §3.3），验收 grep 四处钉值齐（§6.1），自审五查逐条打勾留痕（§7）。

## 2. 架构

### 2.1 锚点表（只读实读；行号快照）

| # | 锚点 | 现状（改前） | 本计划处置 |
| --- | --- | --- | --- |
| 1 | `apps/server/src/spectrum.ts:8` | `SPECTRUM_INSTRUCTION` 内 `（3-8 条。定位标签=…）` | 仅 `3-8`→`3-16`，本行其余逐字不动（SP-P-1） |
| 2 | `apps/server/src/spectrum.ts:73` | `sampleReferenceText(source, { segmentChars: 2000, maxSegments: 8 })` | `maxSegments: 8`→`maxSegments: 16`（SP-P-1） |
| 3 | `apps/server/src/spectrum.ts:79-81` | 注释「条数钳制 3-8……多于 8 条截断」、`return { roles: roles.slice(0, 8), names };` | 注释→3-16/16；`slice(0, 8)`→`slice(0, 16)`（SP-P-1） |
| 4 | `apps/server/src/http/schemas.ts:256` | 注释「…匿名化人物原型 3-8 条…」 | 注释→`3-16 条`（SP-P-2） |
| 5 | `apps/server/src/http/schemas.ts:267` | `structure: z.array(z.string().min(1)).min(1).max(8),` | 仅 `.max(8)`→`.max(16)`；同对象 `:266` 的 `sourceHash: z.string().min(8)` **不动**（SP-P-2） |
| 6 | `apps/server/src/http/routes.ts:456` | `...(spectrumBrief ? [{ name: 'spectrumReference', content: spectrumBrief, budgetChars: 600, stable: false, keep: 'head' as const }] : [])` | 仅该槽 `600`→`1500`（SP-P-3） |
| 7 | `apps/server/src/style/sample.ts:2-3` | `sampleReferenceText` 默认 `segmentChars=20000` / `maxSegments=20` | **零改动**（共用函数，style/plot 依赖默认值） |
| 8 | `apps/server/src/plot.ts:39`、`apps/server/src/imitation.ts:56` | 各自 `sampleReferenceText(source, { segmentChars: 2000, maxSegments: 8 })` | **零改动红线**：本次只放宽光谱调用点 |
| 9 | `apps/server/src/db/migrations/0013_spectrum_profiles.sql:2` | 历史注释「structure_json（string[]，3-8 条…）」 | **零改动**：历史迁移文件非本次改动面，不新增迁移 |
| 10 | `apps/server/src/http/routes.ts:454-455/:457` | imitationStructure / plotReference / outlineCard 三槽 `budgetChars: 600` | **零改动**：只改 `:456` 光谱槽 |
| 11 | `apps/server/test/spectrum.test.ts:59-68` | `it('条数钳制：>8 条截到 8 条；<3 条抛…')`：10 条 ROLE → `toHaveLength(8)` | 迁移为 20 条 → `toHaveLength(16)`；<3 条断言原样保留（SP-P-1） |
| 12 | `apps/server/test/spectrum.test.ts:48-104` | `describe('analyzeSpectrum（人物光谱蒸馏）')` | 新增 1 例：抽样调用点结构断言（SP-P-1） |
| 13 | `apps/server/test/spectrum.test.ts:123-192` | `describe('人物光谱 HTTP 层')`（已有 `app`/`bookId`/`plannerCalls`） | 新增 2 例：schema 边界、注入预算（SP-P-2 / SP-P-3） |
| 14 | `apps/server/test/http/blueprint-suggest.test.ts:72-78` | 现有「task 预算 800」例：捕获 `plannerCalls[last].user` 断言尾部字样 | 写法参照，不改动该文件（SP-P-3 复用风格） |

### 2.2 改后数据流

设定集原文 → `analyzeSpectrum`：SHA256 → `sampleReferenceText(2000×16)` → prompt（ROLE 3-16 条）→ `parseRoleLines` → `roles.length < 3` 抛错 / `roles.slice(0, 16)` → NAMES 脱敏回路（零改动）→ `SpectrumDraft.structure: string[]` → `spectrumSaveSchema`（`.max(16)`）→ `spectrum_profiles` 入库 → `books.spectrum_profile_id` → `blueprint-suggest` planner 槽 `spectrumReference`（1500 字，head 截断）→ drafter 组装面恒无此槽。

### 2.3 范围与红线（逐项锁死）

1. 写面仅 4 个文件：`apps/server/src/spectrum.ts`、`apps/server/src/http/schemas.ts`、`apps/server/src/http/routes.ts`、`apps/server/test/spectrum.test.ts`。
2. 不写：`apps/server/src/style/sample.ts`、`plot.ts`、`imitation.ts`、`style/analysis.ts`、`0013_spectrum_profiles.sql`、`apps/server/data/**`、web 端任何文件、任何 shared DTO、任何配置预算常量。
3. `budgetChars: 600` 在 `routes.ts` 共 4 处，只有 `:456` 改；`maxSegments: 8` 在 src 共 3 处（spectrum/plot/imitation），只有 spectrum 改；`slice(0, 8)` 在 spectrum.ts 有 `:62`（hash 前缀）与 `:81`（ROLE 截断）两处，只有 `:81` 改；`min(8)` 在 schemas.ts 有 `:266`（sourceHash）一处，不动。
4. 全仓 `3-8` 命中中，`style/analysis.ts:21/:23`（RULES/FREQTERMS）与 `0013_...sql:2` 不属光谱容量口径，不动。

## 3. 规格（钉死的实现决定）

### 3.1 决策 → 任务映射

| 已拍板决策（DEC-2026-1125-02） | 钉死字面量 | 任务 |
| --- | --- | --- |
| ROLE 上限 8→16（prompt + 解析） | `3-16 条`、`slice(0, 16)` | SP-P-1 |
| 抽样预算 maxSegments 8→16 | `maxSegments: 16` | SP-P-1 |
| save schema 上限 8→16 | `max(16)` | SP-P-2 |
| planner 注入预算 600→1500 | `budgetChars: 1500` | SP-P-3 |

### 3.2 精确字面量（逐字，替换范围唯一）

- `spectrum.ts:8`：`（3-16 条。定位标签=性别+叙事功能序号，如「男角色A」「女角色B」「尊长C」「反派D」；光谱特性=性格光谱、行事动机、关系功能。）`
- `spectrum.ts:73`：`const segments = sampleReferenceText(source, { segmentChars: 2000, maxSegments: 16 });`
- `spectrum.ts:79`：`// 条数钳制 3-16：少于 3 条视同蒸馏失败；多于 16 条截断`
- `spectrum.ts:81`：`return { roles: roles.slice(0, 16), names };`
- `schemas.ts:256`：`// 人物光谱蒸馏（DEC-2026-1120-09）：ROLE 行协议草稿（匿名化人物原型 3-16 条），沿 plot schema 同构`
- `schemas.ts:267`：`structure: z.array(z.string().min(1)).min(1).max(16),`（`.min(1)` 不动）
- `routes.ts:456`：`...(spectrumBrief ? [{ name: 'spectrumReference', content: spectrumBrief, budgetChars: 1500, stable: false, keep: 'head' as const }] : [])`

### 3.3 四条回归测试（先红后绿；测试名 + 断言逐条钉死）

1. **R1 解析截断（迁移例，不新增计数）** — `apps/server/test/spectrum.test.ts` `describe('analyzeSpectrum（人物光谱蒸馏）')` 原 `:59` 用例改名 `it('条数钳制：>16 条截到 16 条；<3 条抛「ROLE 行不足 3 条」', …)`；夹具 `Array.from({ length: 20 }, (_, i) => \`ROLE: 男角色${i}：特性${i}。\`)` + `NAMES: 张三`；断言 `expect(draft.structure).toHaveLength(16)`；低位例 `few`（1 条）保持 `rejects.toThrow('ROLE 行不足 3 条')` 不变。旧 8 → 红，16 → 绿。
2. **R2 抽样调用点（新增）** — `it('抽样调用点：长文本仅取 16 段且 prompt 写 3-16 条', …)`，同 describe 内、原 `:67` 之后插入。用包装 provider 捕获 `req.user`（`LlmProvider` 已在测试 `:14` 导入，`CompletionRequest` 在 `:15` 导入；内层仍 `createMockProvider({ summarize: { text: SPECTRUM_TEXT } })`）。输入 `longText = '甲'.repeat(2000 * 21)`（42000 字 → 21 个非空块，均匀取 16）。断言：`expect((captured.match(/----/g) ?? []).length).toBe(15)`（16 段以 `\n----\n` 相接=15 个分隔符；旧 8 段=7 个 → 红）；`expect(captured).toContain('3-16 条')`（旧文案缺失 → 红）。SPECTRUM_TEXT 无脱敏泄漏，恰一次调用，无需处理重蒸轮。
3. **R3 schema 边界（新增）** — `it('spectrumSaveSchema 边界：16 条 201 / 17 条 400', …)`，`describe('人物光谱 HTTP 层')` 内、全链用例之后插入。复用 `app`：`POST /api/spectrum-profiles`，`draft = { name: '边界', sourcePath: 'inline:abcd1234', sourceHash: 'a'.repeat(64), structure: Array.from({ length: n }, (_, i) => \`男角色${i}：特性${i}。\`) }`。断言：`n=16 → expect(res.statusCode).toBe(201)`（旧 `max(8)` 时为 400 → 红）；`n=17 → expect(res.statusCode).toBe(400)`（`parseBody` 的 zod 失败 400 路径，改前后恒绿，作反向守卫）。
4. **R4 注入预算（新增）** — `it('planner 注入：spectrumReference 预算 1500 字（超 600 的尾部存活）', …)`，同 HTTP describe、R3 之后插入。先 `POST /api/spectrum-profiles` 存 `structure: ['甲'.repeat(700) + '尾标甲']` → 201；再 `PUT /api/books/${bookId}/spectrum` 绑定；再 `POST /api/books/${bookId}/blueprint-suggest`；取 `const req = plannerCalls[plannerCalls.length - 1]`。断言 `expect(req.user).toContain('尾标甲')`：该标记位于光谱参考文本第 ~701 字，旧 600 预算 head 截断必切掉（红），1500 预算存活（绿）。沿用 `blueprint-suggest.test.ts:72-78` 的「捕获 planner 请求 user 断言尾部字样」写法；不改该文件。

### 3.4 测试隔离与先后顺序

- R1/R2 在 `describe('analyzeSpectrum…')`；R3/R4 在 `describe('人物光谱 HTTP 层')`，位于全链用例（原 `:155-174`）之后、解绑用例（原 `:176`）之前——R4 绑定的长档案由解绑用例随后解绑，不影响原「解绑后不含【人物光谱参考】」断言；原「未知档案 404」用例只查列表首项 id，不依赖条数。
- 全量基线：815 + R2 + R3 + R4 = 818（R1 为迁移，计数不变）；`pnpm test` 收口 **≥818**。

## 4. 全局约束

1. 执行串行 SP-P-1 → SP-P-2 → SP-P-3，同工作树 ≤1 卡；每卡一次提交，只 commit 不 push；提交信息带 `verify:`（含定向测试结果与基线数）与 `Refs: docs/plans/2026-11-25-spectrum-capacity.md`。
2. 写白名单仅 §2.3.1 的 4 个文件；每步落点唯一（§7「步骤唯一可写」），禁止顺手改相邻 600 / min(8) / maxSegments: 8 / 历史迁移注释。
3. 测试基线只增不减（起点 815、目标 ≥818）；禁删用例，旧钉值只随迁；先红后绿，红未出现即停回报，不得直接写绿。
4. 验证链硬序：定向测试（红→绿）→ `pnpm --filter @inkforge/server test -- test/spectrum.test.ts` 全绿 → `pnpm test` 全量 ≥818 → `pnpm typecheck` → `pnpm lint`；任一环失败即停回报，不得跳环。
5. 读 >4KB 文件一律用 `python C:/Users/57850/.zcode/tools/pointer_tools.py` 的 `pointerize/read_pointer/read_diff_only`，禁止整读全文；卡外问题即停回报。
6. 存量已入库光谱档案不重蒸、不新增迁移、不写 `apps/server/data/**`；无 GUI 实测项（本次仅服务端容量钉值，UI 无变化）。
7. 计划无 TBD、无「处理边界情况」类死行；步骤均为 2-5 分钟、一步一动作 + 可核对结果（红/绿计数、grep/diff 输出、状态码）。

## 5. 任务表（文件 / Interfaces / checkbox 步骤串）

### SP-P-1 `spectrum.ts` 三处钉值 + R1/R2

- **文件**：改 `apps/server/src/spectrum.ts:8`、`:73`、`:79`、`:81`；测 `apps/server/test/spectrum.test.ts:59-68`（R1 迁移）、`:48-104` 内新增 R2（插在 `:67` 之后）。
- **Interfaces / 接口**：Consumes=`sampleReferenceText(text, opts?: { segmentChars?: number; maxSegments?: number }): string[]`（`style/sample.ts:2`，签名与默认值零改动）、`parseRoleLines` 私有行为；Produces=`analyzeSpectrum(deps: { db: Database; provider: LlmProvider }, input: { name: string; text: string }): Promise<SpectrumDraft>` **签名不变**，仅其 prompt 字面量、抽样入参、截断上限变为 §3.2 值；`SpectrumDraft.structure: string[]` 类型不变。
- **步骤**：
  - [ ] SP-P-1-S1（红，3-4 min）：改 `spectrum.test.ts:59` 用例名为 R1 名、夹具 10→20、断言 8→16，并在 `:67` 后照 §3.3 R2 新增捕获型测试；跑 `pnpm --filter @inkforge/server test -- test/spectrum.test.ts -t '条数钳制|抽样调用点'`，核对结果=**2 红**（R1 实得 8；R2 分隔符实得 7 且无 `3-16 条`）。
  - [ ] SP-P-1-S2（绿，3-5 min）：只替换 `spectrum.ts:8/:73/:79/:81` 四行为 §3.2 字面量（`SPECTRUM_INSTRUCTION` 其余行、`sourceHash` 行 `slice(0, 8)` 逐字不动）；重跑 S1 命令，核对结果=2 绿，且 `:49/:70/:87` 三条既有蒸馏例仍绿。
  - [ ] SP-P-1-S3（守，2-3 min）：跑 `grep -n "3-8\|slice(0, 8)\|maxSegments: 8" apps/server/src/spectrum.ts`，核对结果=仅剩 `:62` 的 hash 前缀 `slice(0, 8)` 一处命中，`3-8` 与 `maxSegments: 8` 零命中。

### SP-P-2 `schemas.ts` 上限 + R3

- **文件**：改 `apps/server/src/http/schemas.ts:256`、`:267`；测 `apps/server/test/spectrum.test.ts` 的 `describe('人物光谱 HTTP 层')` 全链用例后新增 R3。
- **Interfaces / 接口**：Consumes=`z`（zod v4）与 `spectrumSaveSchema` 既有形状 `{ draft: { name: string; sourcePath: string; sourceHash: string; structure: string[] } }`；Produces=`spectrumSaveSchema.draft.structure` 的 `.max(16)`（`.min(1)` 不动），`parseBody(reply, schema, body)`（`routes.ts:1729`）的 400 行为不变；无导出签名变化。
- **步骤**：
  - [ ] SP-P-2-S1（红，2-4 min）：照 §3.3 R3 在 HTTP describe 新增 `it`（16 条→201、17 条→400）；跑 `pnpm --filter @inkforge/server test -- test/spectrum.test.ts -t 'spectrumSaveSchema 边界'`，核对结果=**1 红**（16 条实得 400；17 条断言绿）。
  - [ ] SP-P-2-S2（绿，2-3 min）：只把 `schemas.ts:256` 注释 `3-8`→`3-16`、`:267` 的 `.max(8)`→`.max(16)`（`:266` `sourceHash.min(8)` 不动）；重跑 S1 命令，核对结果=1 绿，且 `spectrum.test.ts:155` 全链 4 条档案保存例仍绿。
  - [ ] SP-P-2-S3（守，2 min）：跑 `grep -n "max(\|min(" apps/server/src/http/schemas.ts | sed -n '1,20p'` 目视定位，核对结果=`:267` 为 `.min(1).max(16)`、`:266` 仍 `z.string().min(8)`。

### SP-P-3 `routes.ts` 注入预算 + R4

- **文件**：改 `apps/server/src/http/routes.ts:456`；测 `apps/server/test/spectrum.test.ts` HTTP describe 内 R3 之后新增 R4。
- **Interfaces / 接口**：Consumes=`ContextSlot { name: string; content: string; budgetChars: number; stable: boolean; keep: 'head' | 'tail' }`（`context/assembler.ts:4-10`）、`spectrumBrief` 字符串（`routes.ts:433-437`）；Produces=仅 `slots` 中 `name === 'spectrumReference'` 项的 `budgetChars: 1500`，其余项（`hardRules`/`continuity`/`imitationStructure`/`plotReference`/`outlineCard`/`prevTail`/`task`）字面量不变；`assembleContext` 与 blueprint-suggest 端点签名不变。
- **步骤**：
  - [ ] SP-P-3-S1（红，3-4 min）：照 §3.3 R4 新增 `it`（长档案绑定 + blueprint-suggest + 捕获 `plannerCalls[last].user` 断言 `尾标甲`）；跑 `pnpm --filter @inkforge/server test -- test/spectrum.test.ts -t 'planner 注入'`，核对结果=**1 红**（600 预算 head 截断，标记不在 prompt 中）。
  - [ ] SP-P-3-S2（绿，2-3 min）：只把 `routes.ts:456` 该槽 `budgetChars: 600`→`1500`（`:454/:455/:457` 三处 600 逐字不动）；重跑 S1 命令，核对结果=1 绿，且既有全链例 `:155-174` 与解绑例 `:176-183` 仍绿。
  - [ ] SP-P-3-S3（守，2-3 min）：跑 `grep -n "budgetChars: 600\|budgetChars: 1500" apps/server/src/http/routes.ts`，核对结果=`:454/:455/:457` 三处仍 600、`:456` 唯一 1500；再跑 `pnpm --filter @inkforge/server test -- test/spectrum.test.ts`，核对结果=全文件绿且基线数 ≥818。

## 6. 验收

1. 四处钉值：`grep -n "3-16\|slice(0, 16)\|maxSegments: 16\|max(16)" docs/plans/2026-11-25-spectrum-capacity.md` → §3.2 即命中四行，齐全。
2. 覆盖核对：改动文件 4 个各有任务（SP-P-1/2/3 覆盖 3 个源文件，测试落点写在各任务「文件」行）；§3.3 四条回归例各有测试名 + 断言（R1/R2/R3/R4）。
3. 全链：`pnpm --filter @inkforge/server test -- test/spectrum.test.ts` → 全绿；`pnpm test` → 全绿且计数 ≥818；`pnpm typecheck`、`pnpm lint` → 全绿。
4. 副作用白名单：`git diff --stat` 仅含 §2.3.1 的 4 个文件；`git diff -- apps/server/src/plot.ts apps/server/src/imitation.ts apps/server/src/style/sample.ts apps/server/src/db/migrations apps/server/data` 输出为空。

## 7. 自审五查（写完计划即执行，逐条打勾留痕）

- [x] **规格覆盖** — 四条决策（ROLE 16 / 抽样 16 / schema 16 / 注入 1500）逐条映射到 SP-P-1/1/2/3（§3.1）；§3.3 四条回归例均带测试名与断言；§6.1 grep 四字面量齐；改前锚点 14 条逐条有处置（§2.1）。
- [x] **步骤唯一可写** — 9 个 checkbox 步骤各自只写唯一落点：`:8`/`:73`/`:79`/`:81`、`:256`/`:267`、`:456`，测试插入点分别为 analyzeSpectrum describe、HTTP describe 两处；无两步写同一行；相邻 600、`:266 min(8)`、`:62 hash 前缀`、plot/imitation `maxSegments: 8`、历史迁移注释均已明确排除（§2.3.3）。
- [x] **类型一致** — 无签名/类型改动：`analyzeSpectrum` 仍返回 `Promise<SpectrumDraft>`、`structure` 仍 `string[]`、`ContextSlot.budgetChars` 仍 `number`、schema 形状不变；R2 所用 `LlmProvider`/`CompletionRequest` 类型在 `spectrum.test.ts:14-15` 已导入，无新增 import 或类型断言需求。
- [x] **隐含输入类** — 已纳入隐式输入：mock provider 的 `summarize` 文本（SPECTRUM_TEXT 4 条无泄漏→恰好一次调用）、长文本 21 块全非空（`甲` 非空白）、`parseBody` zod 失败→400 路径、planner 槽 `keep: 'head'` 截断语义、HTTP describe 中 `plannerCalls` 跨例累积（取 last）、R4 绑定档案由解绑例后续清理；基线 815 只增不减按 §3.4 计为 818。
- [x] **比例** — 3 个源文件 ↔ 3 个任务（1:1），每任务 3 步（红 1 / 绿 1 / 守 1），共 9 步均为 2-5 min；4 条回归例 = 1 迁移 + 3 新增，新增占基线 3/815（<0.5%）；规格/约束/任务/验收/自审五段职责不重叠，无重复长段。
