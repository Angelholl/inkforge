# 补摘要确认弹窗 + 设定集精炼按钮 实现计划

**目标：** 把「补摘要」从静默秒写改为 LLM 生成→用户编辑确认→确认后单事务落库，并给设定集导入加单次 LLM 精炼按钮。预算账（字符/token 混用、档位接线）经 owner 裁决本批不动手，调节依赖现有模型窗口自适应机制，仅留注记。
**架构：** 服务端把 `runSummarizeStep` 拆成零写库的 `generateSummarize` 与单事务 `commitSummarize`，原名保留为组合壳使 `chapter.ts` 一字不改；新增 refine 纯函数引擎 + 端点 + 前端按钮；不改 DB schema、不改 shared 既有类型形状（只追加 DTO/StepName）。
**规格：** `docs/design/card-2026-11-26-summary-confirm-refine-plan.md` §1（A1/A2/B/C）+ §2（四项裁决全部 owner 2026-11-26 落定：D1/D2=追认代决（原 [PROXY-DECISION]），D3=亲裁不开任务靠模型自适应，D4=改判单次 LLM + 分块 map-reduce 兜底；归档 DEC-2026-1126-10；critic 评议已通过）。

## 全局约束

- **规格真值**：卡 §1/§2 逐条照抄——A1 章节点击补摘要无反应；A2 点击后由 LLM 大模型生成，再由用户编辑确认（确认后才落库）；B 设定集导入 40475 字超 20000 预算；C=owner 裁决「64K 预算账不需要手动调，以模型自适应来做调节」，本批不开任务。
- **D1**：弹窗范围=B 加强版。SUMMARY 可编辑（落库前压单行+长度上限）；BEATS 只读折叠；THREADS/STATE 只读展示但**每行可勾选剔除**并标注生效结果（将回收哪条/将新埋/未匹配将被忽略/未匹配人物卡不会写入）。**不做 STATE/THREADS 自由文本编辑**。
- **D2**：伏笔复活本批顺手修。planted 改为与全书同名伏笔比对含已回收项；**先写钉现状测试再改行为**。
- **D3（owner 亲裁 2026-11-26）**：预算上限不需要手动调，以模型自适应来做调节——本批不开任务。已知账仅注记备查：`chapter.ts:162 totalBudget=contextWindow-maxOutput-500` token 窗当字符数混用（中文≈1.3-1.5 tok/字）；`pickBudgetProfile`（config.ts:150-152）有调用方 `quality/l1.ts:29`（qc 档），但**未接入 draft 装配路径**。现有输出侧自适应（budget.ts 按 provider 实际窗口 clamp）即为调节机制。worldview 常数保持 20000；64K 参考值（长章~15000/短章≤16000）以注释形式留在 config.ts:107 行上方（T1 唯一 C 侧动作）。
- **D4（owner 改判 2026-11-26）**：精炼=单次 LLM + 分块 map-reduce 兜底：导入面板 preview→apply 之间插「AI 精炼」，整篇压到预算内回填可编辑字段；大窗口 provider 走单次直精，输入超阈/小窗口模型走分块压缩-合并。计划真值由增补卡修订（T7/T8/T9+映射+自审）。
- **超时共用键**：`config.ts:201 summarize=1200000` 同时供大纲偏离复核（`routes.ts:705`）——**本批不动**。加 `timeouts` 键要动 shared `StepName`（`domain.ts:17`）；硬编码 timeout 先例 120s/180s（`routes.ts:1332`/`:518`），重文本走 `config.timeouts`。
- **端点形态定死三选一**：取 **502+errors**（502 惯例 `routes.ts:539`）；不采 catch 降级 degraded（融合门 `:1354`）、不采无 catch 框架默认。
- **测试基线**：执行者动代码前实测 server/web/shared 三处测试基线数，**只增不减**；最近存证 server 840 / web 201 / shared 12（`docs/plans/2026-11-26-output-budget-stitch.md:5`、decision-log 终账），仅作对照非钉值。修 bug/改默认值必带先红后绿回归测试。
- **GUI 黑盒**：必须真模型或带延迟 mock——补摘要此前只在 mock 秒回态验收过（`docs/baseline/gui-verification-0.2-entryA.md:13`），等待态缺陷从未被看见。提交信息注明「GUI 已验证/未验证」。
- **通道**：禁入并行卡型=核心路由重构/数据库迁移；本批无迁移、改动为既有端点两段式拆分（非核心路由重构），归 `opencode/hy4-flash-free` 限时窗（DEC-2026-11-18-01，至 2026-12-02）。推送前 code-review（≥3 文件或 ≥100 行）。执行者只 commit 不 push。
- **计划定死钉值（卡面未给值，本计划补定）**：`SUMMARY_MAX_CHARS=2000`；`refine timeout=180000`（ms，**每次** `provider.complete` 均用此值，per-call 非总预算）；refine 走分块的触发门限=`输入估算 >48000 token` 或 `contextWindow<80000`（tokens，满足任一即分块，原「<80000 一律拒」作废）；绝对下限 `contextWindow≥22144`（tokens），低于此仍抛 `refine-context-too-small`。
- **抽验修正（只纠路径/事实，不改卡面决策、不改工作树）**：①`pickBudgetProfile` 并非「现无调用方」——`apps/server/src/quality/l1.ts:29` 已用于 qc 档位；本批接线目标=`chapter.ts:269` draft 槽档位（`draftSlots` 第二参硬编码 `config.budgets.draft`）。②`settings-import.ts` 实际路径=`apps/server/src/settings-import.ts`（非 `apps/server/src/llm/`），`refineForDescription` 在 `:215-244`。③`summarize.test.ts` 实际路径=`apps/server/test/pipeline/summarize.test.ts`（非 `test/http/`）。④502 惯例锚点=`routes.ts:539`。

## 拆卡表（§5：文件互斥，否则串行/通道）

| 卡 | 任务 | 主改文件集（测试随卡） | 与谁互斥/串行 | 通道 |
| --- | --- | --- | --- | --- |
| C0 | T0 | `packages/shared/src/api.ts`、`packages/shared/src/domain.ts` | 独占 shared，先行 | hy4 |
| C1 | T1 | `apps/server/src/config.ts`、`apps/server/src/http/schemas.ts` | 独占 config.ts（C 的 64K 注释并入此卡）→ C 侧不再碰 config.ts | hy4 |
| C2 | T2 | `apps/server/src/pipeline/summarize.ts` | 独占；与 C3 串行（C3 消费其签名） | hy4 |
| C3 | T3 | `apps/server/src/http/routes.ts` | **与 C6 共动 routes.ts → C3 先、C6 后（严格串行）** | hy4 |
| C4 | T4 | `apps/web/src/api/client.ts` | 独占 client.ts；C5/C7/C9 只消费不修改 | hy4 |
| C5 | T5 | `apps/web/src/components/SummaryConfirmDialog.tsx`（Create） | 独占新组件 | hy4 |
| C6 | T6 | `apps/web/src/pages/BookDetailPage.tsx` | 与 C5 无文件交集，可并行 | hy4 |
| C7 | T7 | `apps/server/src/refine.ts`（Create）、`apps/server/src/prompts/render.ts` | 独占引擎 | hy4 |
| C8 | T8 | `apps/server/src/http/routes.ts`、`apps/server/src/app.ts` | **串行：必须在 C3 之后** | hy4 |
| C9 | T9 | `apps/web/src/components/SettingsImportPanel.tsx` | 独占面板 | hy4 |

依赖序：C0 → C1 → C2 → C3 → C8；C0 → C4 → {C5,C6}（并行）；C0/C1 → C7 → C8 → C9。（原 C10/T10 预算账卡经 owner 裁决撤销，不开任务。）

## exec.v1 契约

- `version: v1`；`channel: opencode/hy4-flash-free`；`dispatch_guard --check` exit 0 才可开工。
- `exit: 0`、`flags: none`、`rotation: 0`（零轮转）；单卡超时 600000ms。
- `file_set`: 严格等于拆卡表该行「主改文件集」+ 该任务「文件」字段列出的 Test 路径；越界即停报。
- `verify`: 每卡按任务步骤末尾的命令原样跑；任一红即停，不得改断言「变绿」；全链含 `pnpm -w typecheck`（L-20261113-01 教训）。
- `baseline`: 开卡前实测 server/web/shared 三处基线，验收只增不减。
- `commit`: Conventional 前缀 + 中文正文含 `verify:` 行 + `Refs:` 卡号；只 commit 不 push；GUI 改动注明「GUI 已验证」或「GUI 未验证（owner 真实测试）」。
- `gate`: ≥3 文件或 ≥100 行的卡 push 前过 code-review 两轴（Spec/Standards）。

---

## 任务 T0：共享契约基座

**文件：** Modify `packages/shared/src/api.ts`（追加 5 个接口）/ Modify `packages/shared/src/domain.ts`（`StepName` 追加 `'refine'`，:17）
**接口：**
- Consumes：无。
- Produces：
```ts
export interface SummaryThreadChoice { text: string; include: boolean }
export interface SummaryStateChoice { name: string; stateJson: string; include: boolean }
export interface SummaryGenerateResultDto {
  baseVersionId: string; summary: string; beats: string[];
  openThreads: string[]; characterDeltas: Array<{ name: string; stateJson: string }>;
}
export interface SummaryCommitBody {
  baseVersionId: string; summary: string; beats: string[];
  threads: SummaryThreadChoice[]; states: SummaryStateChoice[];
}
export interface SettingsImportRefineBody { content: string }
export interface SettingsImportRefineResult { description: string; truncated: boolean }
```
**钉死值：** `StepName = 'draft' | 'qc' | 'rewrite' | 'summarize' | 'finalize' | 'refine'`（只为 `config.timeouts` 加键用，不改 run/step 状态机）。`SummaryCommitBody` 不带 chapterNo（从 URL 取），不带 `stateJson` 自由文本编辑位（D1）。
**步骤：**
- [ ] 改 `domain.ts:17` 联合类型加 `'refine'` → `pnpm -w typecheck`（类型基座先绿，后续卡引用此名）。
- [ ] `api.ts` 末尾追加上述六个接口，`SummaryGenerateResultDto.baseVersionId` 为必填（D3 陈旧校验依赖它）→ `pnpm -w typecheck` 零错。commit。

## 任务 T1：服务端配置与校验基座（config.ts 独占改动者；C 侧仅 64K 参考值注释一行）

**文件：** Modify `apps/server/src/config.ts`（:5、:94-98、:107 邻域、:178-184、:201 邻域）/ Modify `apps/server/src/http/schemas.ts`（追加两 schema）/ Test `apps/server/test/config.test.ts`（+2）、`apps/server/test/http/summarize-confirm.test.ts` 由 T3 建
**接口：**
- Consumes：T0 的 `SettingsImportRefineBody` 与 `StepName='refine'`。
- Produces：`RoleName` 含 `'refiner'`；`config.roles.refiner`；`config.timeouts.refine=180000`；`summaryCommitSchema`、`settingsImportRefineSchema`（zod `z.infer` 类型供 T3/T8）。
**钉死值：**
```ts
export type RoleName = 'planner' | 'drafter' | 'qc' | 'rewriter' | 'summarizer' | 'refiner';
INKFORGE_ROLE_REFINER: z.enum(['local','cloud']).default('local');
roles.refiner = { provider: e.INKFORGE_ROLE_REFINER, model: e.STRATA_MODEL };
timeouts: { draft:3600000, qc:900000, rewrite:3600000, summarize:1200000, refine:180000 };
// config.ts:107 worldview 行上方注释（D3 原文照抄）：
// 64K 上下文参考：长章 ~15000 字 / 短章 ≤16000 字；worldview 常数保持 20000，供日后调参。
```
`summaryCommitSchema`：`baseVersionId: z.string().min(1)`；`summary: z.string().transform(s => s.replace(/\s*[\r\n]+\s*/g,' ').trim()).pipe(z.string().min(1).max(2000))`；`beats: z.array(z.string()).default([])`；`threads: z.array(z.object({text:z.string(),include:z.boolean()})).default([])`；`states: z.array(z.object({name:z.string().min(1),stateJson:z.string().min(1),include:z.boolean()})).default([])`。`stateJson` 另加 `.refine(s => { const v=JSON.parse(s); return v!==null && typeof v==='object' && !Array.isArray(v); }, 'stateJson 必须是纯对象')`（JSON.parse 抛错由 zod 转 400）。`settingsImportRefineSchema`：`content: z.string().min(1)`。
**步骤：**
- [ ] `config.test.ts` 新增 `it('refiner 默认走 local 且 timeouts.refine=180000')`：`loadConfig(LEGAL_ENV)` → `expect(c.roles.refiner.provider).toBe('local')`、`expect(c.timeouts.refine).toBe(180000)`；再 `it('INKFORGE_ROLE_REFINER=cloud → roles.refiner.provider=cloud')`。跑 `pnpm --filter @inkforge/server exec vitest run test/config.test.ts` 确认红。
- [ ] 改 config.ts 六处（RoleName/env/roles/timeouts/64K 注释；worldview 20000 与 `summarize=1200000` 字面量不动）→ 同命令绿（config.test.ts 7→9 passed，计数随迁只增）。
- [ ] 追加两 schema；`pnpm --filter @inkforge/server exec vitest run test/config.test.ts test/http/summarize-confirm.test.ts` 中 config 部分绿（后一文件 T3 建，本步只保证 import 零报错）。
- [ ] `pnpm -w typecheck` 零错；`pnpm -w lint` 零告警。commit。

## 任务 T2：A 服务端 summarize 拆分 + D2 伏笔复活

**文件：** Modify `apps/server/src/pipeline/summarize.ts`（全文件重构，:22-81）/ Test `apps/server/test/pipeline/summarize.test.ts`（+4，:55-121 既有两例保留不删）、`apps/server/test/llm/plainproto.test.ts`（:110-114 不动，仅跑）、Create `apps/server/test/pipeline/summarize-commit.test.ts`（+4）
**接口：**
- Consumes：T0 的 `SummaryCommitBody`（形状同源）、`parseSummary`（plainproto.ts）、`renderSummarize`（render.ts）、`listForeshadowings`/`resolveForeshadowing`/`upsertChapterSummary`/`upsertCharacterState`/`getContinuitySnapshot`（continuity.ts）、`listCharacters`（books.ts）。
- Produces（签名钉死）：
```ts
export interface SummaryPayload {
  summary: string; beats: string[]; openThreads: string[];
  characterDeltas: Array<{ name: string; stateJson: string }>;
}
export class SummarizeParseError extends Error { constructor(public errors: string[]) { super(`summarize 解析失败: ${errors.join('; ')}`); } }
export async function generateSummarize(
  deps: { provider: LlmProvider; config: AppConfig },
  input: { chapterNo: number; finalContent: string; signal?: AbortSignal },
): Promise<SummaryPayload>;                       // LLM + 解析，零写库
export function commitSummarize(
  db: Database, bookId: string, chapterNo: number, payload: SummaryPayload,
): void;                                          // 单事务、四段齐写
export async function runSummarizeStep(/* 签名逐字不动 */): Promise<void>; // 组合壳：generate → commit
```
**钉死值：** `generateSummarize` 内 `meta: { step: 'summarize', chapterNo }` **必须保留**（mock 按步名路由：`llm/mock.ts:136/164`、`generate-drift.test.ts:143/159`、`routing-e2e.test.ts:62`）；`maxOutputTokens: config.providers.local.maxOutput`、`timeoutMs: config.timeouts.summarize` 照旧；空 SUMMARY 抛 `SummarizeParseError(parsed.errors)`（不区分生成/解析失败）。`commitSummarize` 四段=摘要 upsert→STATE 浅合并→THREADS 比对→（同事务）`db.transaction` 包裹；STATE 行 `JSON.parse` 抛错→跳过该行不影响整步，`JSON.parse` 成功但结果非纯对象→抛错整事务回滚；THREADS 比对源去掉 `.filter(f => f.status !== 'resolved')`（D2），命中同名（含已回收）的 `[planted]` 不重复埋，未命中 `[planted]` 才 INSERT。失败语义不区分，`runSummarizeStep` 直通抛错（chapter.ts 不改）。
**步骤：**
- [ ] **先钉现状**：`summarize-commit.test.ts` 加 `it('现状：重摘要旧章复活已回收伏笔（D2 修复前快照）')`——先 INSERT status='resolved' 的 `密信落款人身份`，跑 `runSummarizeStep` 喂 `THREADS: - [planted] 密信落款人身份`，断言 `listForeshadowings` 出现第二条 `status='open'` 同名行；跑 `pnpm --filter @inkforge/server exec vitest run test/pipeline/summarize-commit.test.ts` 确认**绿（钉住旧行为）**。
- [ ] 同文件加 `it('generateSummarize 零写入：chapter_summaries / character_states / foreshadowings / run_steps 四表行数不变')`——直调 generate，四表 COUNT 前后相等；加 `it('commitSummarize 四段齐写：摘要+STATE+THREADS 回收+新埋同现在库')`；跑定向确认红（函数未导出）。
- [ ] 同文件加 `it('STATE 非法 JSON 行跳过不影响整步；JSON 非对象（\"死了\"）抛错且四段零写入回滚')` + `it('空 SUMMARY → generateSummarize 抛 SummarizeParseError')`；跑定向确认红。
- [ ] 同文件加 `it('runSummarizeStep：done 失败上抛不 finalize；needs_human 吞掉照常 finalize')`——用 `buildApp` + mock `summarize:{error:'http_500',afterMs:0}` 驱动两条 run，断言生成失败在 done 下 run 无 finalize 版本指针、needs_human 下 step=failed 但 run=done；再补一例 commit 失败（`stateJson` 非对象）同两态断言；跑定向确认红。
- [ ] 实现 `summarize.ts` 三函数（函数体只在此处：THREADS 全量比对、STATE 对象判定、事务边界）；上述四组转绿。
- [ ] 把 D2 现状用例断言改为修复后语义（同名已回收不重复埋；`expect(listForeshadowings(...).filter(f=>f.description==='密信落款人身份')).toHaveLength(1)`）→ 同命令绿（先红后绿留痕）。
- [ ] 既有 `summarize.test.ts:55-121` 两例、`plainproto.test.ts:110-114` 一例零改动跑绿；`pnpm -w typecheck` 零错。commit。

## 任务 T3：A 服务端路由——generate/commit 两段式

**文件：** Modify `apps/server/src/http/routes.ts`（:1489-1504 替换 + 新增 commit 端点）/ Test `apps/server/test/http/import.test.ts`（:129-150 两例随迁）、Create `apps/server/test/http/summarize-confirm.test.ts`（+5）
**接口：**
- Consumes：T1 的 `summaryCommitSchema`；T2 的 `generateSummarize` / `commitSummarize` / `SummarizeParseError`；T0 的 `SummaryGenerateResultDto` / `SummaryCommitBody`。
- Produces：`POST /api/books/:bookId/chapters/:chapterNo/summarize` → 200 `{...SummaryPayload, baseVersionId}` 不落库；`POST .../summarize/commit` → 200 `{ok:true}` 单事务落库。
**钉死值：** generate 三守卫照旧顺序=书不存在 404 `not found`（:1493）→ 章无 currentVersionId 404 `not found` → 活 run 409 `book has active run`（:1494-1495）；断连即中止=`const ac=new AbortController(); req.raw.once('close',()=>{ if(!reply.sent) ac.abort(); });` 传 `signal: ac.signal`（signal 入口已有、generate 零写入所以安全）。生成错误（含空 SUMMARY）→ 502 `{error:'摘要生成失败', reason:(e as Error).message}`（502 惯例 :539）。commit 入口三项校验**放路由层**（照融合门 confirm 先例 :1469-1487）：①`parseBody(reply, summaryCommitSchema, req.body)` 失败→400（zod 自带 message，单行/2000/纯对象全在此）②书/章存在且 `ch.currentVersionId === body.baseVersionId`（**必填字段**，不学融合门可选指纹；版本只增不改 `chapters.ts:189`，版本号即可无需哈希），不等→409 `{error:'章节版本已变动，请重新生成摘要', reason:'stale-base-version'}` ③活 run 409 与 generate 同口径。**陈旧校验不得进共用 `commitSummarize`**——流水线在 finalize 前提交时 currentVersionId 还是旧值（`chapter.ts:454/463/501`）。
**步骤：**
- [ ] 先改 `import.test.ts:129-150` 两例：首例断言 200 改为「返回 `summary/beats/openThreads/characterDeltas/baseVersionId` 且 `chapter_summaries` 行数**不变**」，并追加 commit 调用后行数 +1；次例 404/409 断言字面不动（POST /summarize 语义变更同步改，唯一消费者 `client.ts:269` 由 T4 同包发布、无兼容期）。跑定向确认红。
- [ ] `summarize-confirm.test.ts` 加 `it('空 SUMMARY → 502 可读错误')`、`it('活 run 409 / 陈旧 baseVersionId 409 / 非法 stateJson 400 / 无章 404')`、`it('编辑后 summary 压单行且 ≤2000 落库原样')`、`it('勾选剔除的 THREADS/STATE 行不写库')`、`it('commit 在途断连不触发落库（abort generate）')`；跑定向确认红。
- [ ] 改 routes.ts 两端点（generate 调 T2 generate、commit 调 T2 commitSummarize）；`pnpm --filter @inkforge/server exec vitest run test/http/import.test.ts test/http/summarize-confirm.test.ts` 全绿（import 两例 + 新五例）。
- [ ] 既有 `test/http/` 全量 + `pnpm -w typecheck` 零错。commit。

## 任务 T4：web API 客户端（A/B 共用 client.ts，一次改完）

**文件：** Modify `apps/web/src/api/client.ts`（:269-270 替换 + 追加两函数）
**接口：**
- Consumes：T0 的 DTO；`req<T>(url, init?: RequestInit)` 已支持 `signal`（client.ts:67-74）。
- Produces：
```ts
summarizeGenerate: (bookId: string, chapterNo: number, signal?: AbortSignal) => req<SummaryGenerateResultDto>(
  `/api/books/${bookId}/chapters/${chapterNo}/summarize`, { method:'POST', body:'{}', signal }),
summarizeCommit: (bookId: string, chapterNo: number, body: SummaryCommitBody) => req<{ok:true}>(
  `/api/books/${bookId}/chapters/${chapterNo}/summarize/commit`, { method:'POST', body: JSON.stringify(body) }),
refineDescription: (body: SettingsImportRefineBody, signal?: AbortSignal) => req<SettingsImportRefineResult>(
  '/api/settings-import/refine', { method:'POST', body: JSON.stringify(body), signal }),
```
**钉死值：** 保留 `summarizeChapter` 名删除（唯一消费者即本文件 :269，同包发布无兼容期）；错误文案统一走既有 `apiErrorText`（:77-88），不再 `String(e)` 裸显原始 message（A2 可读错误）。
**步骤：**
- [ ] 替换 `:269-270`、追加两函数 → `pnpm -w typecheck` 零错；`grep -n "summarizeChapter" apps/web/src packages/shared/src` 零命中。commit。

## 任务 T5：A web 补摘要确认弹窗组件

**文件：** Create `apps/web/src/components/SummaryConfirmDialog.tsx` / Create `apps/web/src/components/SummaryConfirmDialog.test.tsx`（+6）
**接口：**
- Consumes：T0 `SummaryGenerateResultDto`/`SummaryCommitBody`；T4 `api.summarizeCommit`；`Button`（ui.tsx:96/129/143-160，loading 保留可访问名且禁用）。
- Produces：`SummaryConfirmDialog({ open, chapterNo, result, onCancel, onConfirmed })`；`onConfirmed(body: SummaryCommitBody): Promise<void>`。
**钉死值：** D1 四段 UI——摘要 `<textarea>` 可编辑、节拍 `<details>` 只读折叠、THREADS/STATE 逐行 `<input type="checkbox">` 默认 checked 且**只读文本**；生效标注文案逐字：命中回收=`将回收：${desc}（第${plantedCh}章埋）`、未命中 planted=`将新埋：${desc}`、同名已存在=`已存在同名伏笔，不会重复埋`、未匹配 resolved/advanced=`未匹配将被忽略`、人物存在=`将更新人物「${name}」状态（与前章浅合并）`、人物不存在=`未匹配人物卡不会写入`。D1 道具「标注结果」由 page 传入 `annotations: { threads: Record<string,string>; states: Record<string,string> }`（T6 算）。弹窗在途文案=`正在生成摘要… 已等待 {elapsed}s`，取消按钮=`取消`，确认按钮=`确认落库`；错误 `<p data-testid="summary-dialog-error">`。
**步骤：**
- [ ] 测试 `it('四段渲染断言')`：喂一份含 2 THREADS + 2 STATE 的 result → `getByLabelText('摘要（可编辑）')` 是 textarea、`BEATS` 在 `<details>` 内、四行 checkbox 全 checked、六个标注文案按映射逐字出现；红。
- [ ] 测试 `it('编辑后文本原样进 commit payload')`：fireEvent 改 textarea → 点确认 → 断言 `onConfirmed` 收到的 `body.summary` 逐字等于编辑值、`body.threads[i].include` 随勾选翻转；`it('取消不调 commit')`：点取消 → `api.summarizeCommit` 零调用、`onCancel` 调用一次；红。
- [ ] 测试 `it('在途 aria-busy 不可点')` + `it('失败文案位置')`：传 `busy` → 按钮 `aria-busy=true` 且 `disabled`，错误文案落 `summary-dialog-error`；红。
- [ ] 测试 `it('摘要 >2000 字前端即时计数不阻断、由服务端 400 拒收')`：填 2001 字 → 确认仍发请求（校验归 T1 zod，前端不重复实现长度规则）；红。
- [ ] 实现组件（含 elapsed `setInterval` 1000ms + cleanup；函数体只在此：勾选态→payload 映射）→ 上述六例绿。
- [ ] `pnpm --filter @inkforge/web exec vitest run src/components/SummaryConfirmDialog.test.tsx` 6 passed；`pnpm -w typecheck` 零错。commit（注明 GUI 未验证，交黑盒）。

## 任务 T6：A web 页面接线（loading/取消/单在途）

**文件：** Modify `apps/web/src/pages/BookDetailPage.tsx`（:709-717 `summarize` 重写、:1100 按钮、:1205 msg）/ Test `apps/web/src/pages/BookDetailPage.test.tsx`（:185-196 保留 +3）
**接口：**
- Consumes：T4 `api.summarizeGenerate`/`summarizeCommit`/`apiErrorText`；T5 `SummaryConfirmDialog`；既有 `booksRepo` DTO（ChapterDto 的 `isOriginal`/`chapterNo`）、`listForeshadowings` 无前端 API → 标注结果由 generate 返回的 `openThreads` + `characterDeltas` 与页面已有的角色列表/chapter 数据本地推导（不新增服务端端点）。
- Produces：`summarize(chapterNo)` 两段式：generate → 打开弹窗 → 确认后 commit → `setMsg('第N章摘要已生成')` + `void refetch()`。
**钉死值：** 页面级 `const [gen,setGen] = useState<{chapterNo:number; result:SummaryGenerateResultDto; abort:AbortController; startedAt:number} | null>(null)`；**同时只允许一个补摘要在途**——所有 `补摘要` 按钮 `disabled={gen !== null}`，再点其他章被忽略（不触发第二次 generate）；`Button loading={gen?.chapterNo===c.chapterNo}`（aria-busy 由组件给）；在途文案在弹窗（T5），失败文案在 `:1205` msg 行格式 `摘要失败：${apiErrorText(e)}`。取消=`gen.abort.abort(); setGen(null)`，**不调 commit**；服务端断连即中止由 T3 `signal` 承接。
**步骤：**
- [ ] `BookDetailPage.test.tsx` 加 `it('在途 aria-busy 不可点、再点其他章被忽略')`：stub generate 用延迟 Promise（**不用秒回 mock**），点 ch1 → 断言该按钮 aria-busy=true 且 disabled；点 ch2 → 断言 generate 调用计数恒 1；红。
- [ ] 加 `it('弹窗各段渲染断言（页面接线后）')` + `it('失败文案出现在按钮旁 msg 行')`：generate reject → 断言 `:1205` 文案含 `摘要失败：` + `apiErrorText` 还原的 error 字段；红。
- [ ] 既有 `it('original 章渲染「补摘要」按钮且仅 original 章可见')`（:185-196）逐字保留跑绿；改 `summarize`/按钮/msg 三处 → 上述两例绿。
- [ ] `pnpm --filter @inkforge/web exec vitest run src/pages/BookDetailPage.test.tsx` 全绿；`pnpm -w typecheck` 零错。
- [ ] 提交前 web-gui-tester 黑盒：**延迟 mock（generate ≥3s）** 走完「点击→在途文案+秒数→取消→再点→确认落库」；提交信息注明 GUI 已验证/未验证（owner 真实测试）。commit。

## 任务 T7：B 服务端精炼引擎（双路径：单次 LLM + 分块 map-reduce 兜底）

**文件：** Create `apps/server/src/refine.ts` / Modify `apps/server/src/prompts/render.ts`（+`renderRefineTask`、`renderRefineReduceTask`）/ Test `apps/server/test/refine.test.ts`（+10）/ Test `apps/server/test/prompts/contract.test.ts`（+1）
**接口：**
- Consumes：T0 `SettingsImportRefineResult`；T1 `AppConfig`、`config.timeouts.refine`、`pickProviderForRole`（factory.ts:11）；`render.ts` 既有 prompt 渲染风格。
- Produces：
```ts
export async function refineDescriptionWithLlm(
  deps: { provider: LlmProvider; config: AppConfig; providerConfig: ProviderConfig },
  input: { raw: string; budgetChars: number; signal?: AbortSignal },
): Promise<SettingsImportRefineResult>;                     // 签名不变，T8/T9 消费者零改
export function renderRefineTask(raw: string, budgetChars: number): string;                  // 单次/每段 map
export function renderRefineReduceTask(chunkOutputs: string[], budgetChars: number): string; // 合并
export function estimateRefineTokens(s: string): number;    // = Math.ceil(s.length * 1.5)
```
**钉死值：**
```ts
// 输入估算：中文 1.3–1.5 token/字取上沿 1.5（不动 budget.ts 的 TOKENS_PER_CHAR=4.0 英文假设）
const REFINE_TOKEN_PER_CHAR = 1.5;
const estimateRefineTokens = (s: string) => Math.ceil(s.length * REFINE_TOKEN_PER_CHAR);
// 触发（OR）：任一成立走分块 map-reduce
const REFINE_INPUT_THRESHOLD_TOKENS = 48000;   // 估算输入 > 48000 → 分块
const REFINE_WINDOW_FLOOR = 80000;             // contextWindow < 80000 → 分块（原「一律拒」作废）
// 分块尺寸
const REFINE_CHUNK_TARGET_TOKENS = 16000;      // 每段目标输入 token
const REFINE_CHUNK_MAX_CHARS = 10666;          // = floor(16000 / 1.5)，单段硬切上限
const REFINE_OUTPUT_RESERVE_TOKENS = 4096;     // 每 call 输出预留
const REFINE_WINDOW_MARGIN = 2048;             // 安全余量
const REFINE_MIN_MAP_WINDOW = 22144;           // = 16000+4096+2048；窗口低于此仍抛错
// 段数 n = Σ每段 ceil(段长/10666)；每段 map 输出上限 chunkBudgetChars = floor(budgetChars / n)
// budgetChars=20000、40475 字无段落分隔 → n=4、chunkBudgetChars=5000、总调用 4 map + 1 reduce = 5
// 单次路径：1 次 complete；分块路径：每段一次 + 合并一次
// 超时：每次 provider.complete 都用 timeoutMs = config.timeouts.refine（180000），per-call 非总预算；
//       所有 call 共享同一 signal，断连即整体中止，无部分结果回填
```
- **分块边界规则**：按 `\n\n` 段落切；**不跨段合并**（每段独立成段）；单段 >10666 字（估算 >16000 token）在该段内按 10666 字硬切；段数 `n` 与每段字符数可纯函数算出，测试逐段钉长。
- **每段目标尺寸**：输入 token ≤16000、字符 ≤10666；map prompt 用 `renderRefineTask(段, chunkBudgetChars)` 要求压到 `chunkBudgetChars` 字，引擎对 map 输出硬截断到该值。
- **合并策略**：`renderRefineReduceTask(mapOutputs, budgetChars)` 一次 reduce 调用，输入为各段输出以 `\n\n` 拼接（40475 场景 ≈20000 字 ≈30000 token < 65536 窗），要求保留规则/约束/人物关系网、合并去重、压到 `budgetChars`；输出 `description = raw.slice(0, budgetChars)`，`truncated = 任一段被截断 || raw.length > budgetChars`。
- **触发条件**（OR）：`estimateRefineTokens(raw) > 48000 || providerConfig.contextWindow < 80000`。两者都不成立走单次；成立但 `contextWindow < 22144` → 抛 `Error('refine-context-too-small')`（交 T8 502）。小窗（如 65536）走分块，不再一律拒。
- **失败/空输出口径**：map 调用抛错 → `refine-map-failed: segment ${i+1}/${n}`；map 输出 `trim()` 为空 → `refine-map-empty: segment ${i+1}/${n}`；reduce 抛错 → `refine-reduce-failed`；reduce 空 → `refine-reduce-empty`。**整体失败、不回填部分结果、不降级**（T8 统一 502）；共享 signal 中止按同一口径上抛。
- **单次路径保留**：不动既有逻辑——`meta: { step: 'refine' }`、`timeoutMs: config.timeouts.refine`、`maxOutputTokens: config.providers.local.maxOutput`、返回 `description = res.text.trim().replace(/\n{3,}/g,'\n\n').slice(0, budgetChars)` 与 `truncated = res.text.trim().length > budgetChars`；仅把「40K 字恰 1 次」改为阈值内输入恰 1 次（40K 字现已走分块）。
**步骤：**
- [ ] `refine.test.ts` 加 `it('单次路径：12000 字输入 + contextWindow=524288 → provider.complete 恰 1 次、description.length=20000、truncated=true，每次 timeoutMs=180000 且 meta.step=refine')`：mock 返回 `'摘'.repeat(30000)`，断言 `calls.length===1`、`calls[0].timeoutMs===180000`、`calls[0].meta.step==='refine'`；红。
- [ ] 加 `it('prompt 含规则/约束/人物关系网与 20000 上限字串')`（既有单次 prompt 用例保留）、`it('输入触发边界：32000 字→1 次；32001 字→5 次（4 map+1 reduce）')`（32000×1.5=48000 不触发；32001×1.5→48002 触发；window=524288）；红。
- [ ] 加 `it('窗口触发边界：contextWindow=80000→1 次；65536→3 次（12000 字切 2 段+reduce）；22143→抛 refine-context-too-small')`：固定 12000 字输入，`n=ceil(12000/10666)=2`；红。
- [ ] 加 `it('64K 窗 + 40475 字 → 4 map + 1 reduce 共 5 次；每段 ≤10666 字（估算 ≤16000 token）；description.length=20000、truncated=true、每次 timeoutMs=180000')`：mock map 返回 `'摘'.repeat(8000)`、reduce 返回 `'终'.repeat(30000)`；断言 `calls.length===5`、4 个 map prompt 各自段长 `[10666,10666,10666,8477]`；红。
- [ ] 加 `it('段落边界：\\n\\n 优先且不跨段合并，超 10666 字单段硬切 → 段长 [5000,10666,9334,1000]')`：raw=`'A'.repeat(5000)+'\\n\\n'+'B'.repeat(20000)+'\\n\\n'+'C'.repeat(1000)`，断言 `n===4` 且逐段等长；红。
- [ ] 加 `it('map 段报错 → 抛 refine-map-failed: segment 3/4，无部分结果')`（第 3 次 complete throw `Error('boom')`，40475 字/65536 窗）、`it('map 段空输出 → 抛 refine-map-empty: segment 2/4')`（第 2 次返回空串）；红。
- [ ] 加 `it('reduce 报错 → refine-reduce-failed；reduce 空输出 → refine-reduce-empty')`（4 段 map 正常，第 5 次 complete 分别 throw / 返回空串）；红。
- [ ] 加 `it('map 输出超 chunkBudgetChars → 硬截断到 5000 且最终 truncated=true')`：40475 字 → `chunkBudgetChars=5000`，map 返回 8000 字、reduce 返回 `'终'.repeat(100)`，断言 `description.length===100 && truncated===true`；红。
- [ ] `contract.test.ts` 加 `it('renderRefineReduceTask 含“合并”“预算 20000 字”关键词')`：调 `renderRefineReduceTask(['甲','乙'], 20000)` 断言包含两串；红。
- [ ] 实现 `estimateRefineTokens` + 切段纯函数 + `renderRefineTask`/`renderRefineReduceTask` + `refine.ts` 双路径（函数体只在此：切段/调用编排/硬截断与 truncated 计算）；上述十例 + contract 一例转绿。
- [ ] `pnpm --filter @inkforge/server exec vitest run test/refine.test.ts test/prompts/contract.test.ts` 全绿（refine +10、contract 既有 render* 用例零破 +1）；`pnpm -w typecheck` 零错。commit。

## 任务 T8：B 服务端精炼端点（串行于 T3）

**文件：** Modify `apps/server/src/http/routes.ts`（settings-import 区 :251-270 之后追加 `/api/settings-import/refine`）/ Modify `apps/server/src/app.ts`（:12-18 `BuildAppOptions` 加 `refinerProvider?: LlmProvider`，:39 state 装配）/ Test `apps/server/test/http/settings-import.test.ts`（+5）
**接口：**
- Consumes：T1 `settingsImportRefineSchema`；T7 `refineDescriptionWithLlm`；T0 `SettingsImportRefineBody/Result`；`pickProviderForRole(config,'refiner')`。
- Produces：`POST /api/settings-import/refine` → 200 `{description, truncated}`；provider/context/输出错误 → 502 `{error:'refine failed', reason}`（**端点形态已定死 502+errors，不做 catch 降级**）。
**钉死值：** `const provider = state.refinerProvider ?? createRoleProvider(config, 'refiner');` 与 summarizer 注入缝同形（app.ts:17）；`budgetChars = 20000`（不读 config，沿用 D3 不动常数）；`signal` 同 T3 断连即中止。分块失败 reason 沿用 T7 口径原样透传（`refine-map-failed: segment i/n`、`refine-map-empty: segment i/n`、`refine-reduce-failed`、`refine-reduce-empty`），不降级、不写库；外部契约（200 `{description,truncated}` / 502 `{error:'refine failed',reason}` / zod `content: z.string().min(1)`）一字不动。
**步骤：**
- [ ] `settings-import.test.ts` 加 `it('refine → 200 description ≤20000 且 mock 调用恰 1 次')`（12000 字 + 524288 窗单次路径）、`it('contextWindow 小 → 502 含 reason=refine-context-too-small')`（8192 < 22144）、`it('provider error → 502 可读 error，不降级不写库')`；红。
- [ ] 加 `it('分块中途某段 mock 报错 → 502 且 reason 含 refine-map-failed: segment 3/4')`：注入 refinerProvider mock，content 40475 字 + contextWindow=65536，第 3 次 complete throw；断言 status=502、`body.error==='refine failed'`、`body.reason` 含 `refine-map-failed: segment 3/4`；红。
- [ ] 加 `it('分块某段空输出 → 502 且 reason 含 refine-map-empty: segment 2/4')`：同上改为第 2 次返回空串；红。
- [ ] 追加端点 + 注入缝 → 五例绿；同文件既有 preview/apply 用例零改动跑绿。
- [ ] `pnpm --filter @inkforge/server exec vitest run test/http/settings-import.test.ts` 全绿；`pnpm -w typecheck` 零错。commit。

## 任务 T9：B web 精炼按钮（preview→apply 之间）

**文件：** Modify `apps/web/src/components/SettingsImportPanel.tsx`（:76-80 apply 前插按钮、:90 计数器、:155-161 description textarea）/ Test `apps/web/src/components/SettingsImportPanel.test.tsx`（+3）
**接口：**
- Consumes：T4 `api.refineDescription`；T0 `SettingsImportRefineResult`；既有 `draft` state 与 `onApplied`。
- Produces：按钮 `AI 精炼`，点击后把 `result.description` 写回 `setDraft({...draft, description})`，**其余 draft 字段一字不动**（apply 整包回传用户编辑后的 draft + 原始 content，:76-80）。
**钉死值：** 按钮只在 `draft !== null` 且 `!busy && !applying` 时可点；文案 `AI 精炼`，在途 `精炼中…`；`aria-busy` 由 `Button loading` 给；失败文案落既有 `error` 状态（同 preview 失败路径 :147）；计数器 `:90` 随回填自动刷新（绑 draft 值）；`charCount` 文案 `超 20000` 由现有函数给出，不新增第二套。**在途文案覆盖分块耗时**：分块路径多段串行可能耗时数分钟，在途期间恒显示 `精炼中…`（措辞保持，不加进度条/分段进度/任何新 UI），`aria-busy` 仍由 `Button loading` 给，解除时机=整次精炼返回（含 4 map + 1 reduce 全部完成）。
**步骤：**
- [ ] 测试 `it('preview 后点 AI 精炼 → description 被替换、title/characters/outlineTree 逐字不变')`：stub fetch 补 `/api/settings-import/refine` 分支，返回 `{description:'精炼正文',truncated:false}`；红。
- [ ] 测试 `it('精炼在途按钮 aria-busy 不可点、失败文案呈现（延迟 mock）')`（延迟 mock 用分块 provider：40475 字 + 65536 窗、5 次调用各带延迟，断言整段在途期间文案恒为 `精炼中…`、按钮 `aria-busy=true` 且 disabled，全部调用返回后才解除）+ `it('truncated=true → 提示文本出现且 apply 仍可用')`；红；不新增 UI。
- [ ] 实现按钮与回填 → 三例绿；既有六例（`SettingsImportPanel.test.tsx:43/87/113/147/164/193`）逐字保留跑绿。
- [ ] `pnpm --filter @inkforge/web exec vitest run src/components/SettingsImportPanel.test.tsx` 全绿；提交前 web-gui-tester 黑盒（延迟 mock 或真模型，40K 中文字样实测一次）；`pnpm -w typecheck` 零错。commit。

## ~~任务 T10~~（已撤销：owner 裁决预算账本批不动，调节=模型自适应；原测试两例随卡删除）

## 决策→任务映射（D1–D4）

| 决策 | 落地任务 | 可指到的实现点 |
| --- | --- | --- |
| D1 弹窗=B 加强版 | T2（summary 单行/上限与勾选剔除载荷）、T3（zod 落库前压单行+2000）、T5（SUMMARY 可编辑 / BEATS 只读折叠 / THREADS·STATE 只读勾选+六类标注 / 禁自由文本）、T6（单在途、loading、秒数、取消、失败文案位置） | `SummaryConfirmDialog.tsx` 四段 UI；`summaryCommitSchema.summary` transform；`SummaryStateChoice/ThreadChoice.include` |
| D2 伏笔复活 | T2（**先钉现状测试**→去 `.filter(status!=='resolved')`→改断言） | `summarize.ts` THREADS 比对源；`summarize-commit.test.ts` 首两例 |
| D3 预算账（owner 亲裁：不开任务，仅注记） | T1（64K 参考值以注释形式入 config.ts:107 行上方；worldview 20000 与 summarize=1200000 不动） | `config.ts:107` 注释一行；已知账见 D3 条文本批留痕 |
| D4 精炼单次 LLM + 分块 map-reduce 兜底（owner 改判） | T7（`refineDescriptionWithLlm` 双路径：大窗口且输入≤48000 token 走单次 complete；输入超阈或 contextWindow<80000 走分块，40475 字→4 map+1 reduce；切段按 `\n\n` 不跨段、单段≤10666 字/≤16000 token、每段输出≤chunkBudgetChars=5000；合并输出≤budget=20000 且 truncated；任一段失败/空输出整体抛错不回填；绝对下限 22144；per-call timeout=180000；prompt 保规则/关系网）、T8（端点 502+errors + 注入缝不变；补分块中途某段报错→502 可读 reason）、T9（preview→apply 间按钮、`精炼中…` 覆盖分块耗时、回填可编辑字段、不加新 UI） | `refine.ts`（切段/调用编排/硬截断）；`render.ts` 的 `renderRefineTask`/`renderRefineReduceTask`；`routes.ts` 新端点；`SettingsImportPanel.tsx` 按钮 |

## §4 测试清单→任务映射

| §4 条目 | 任务 | 测试名（断言/规格值内嵌处） |
| --- | --- | --- |
| generate 零写入（四张表行数不变） | T2 | `generateSummarize 零写入：…四表行数不变` |
| commit 四段齐写 | T2 | `commitSummarize 四段齐写：摘要+STATE+THREADS 回收+新埋同现在库` |
| 中途失败四段零写入回滚 | T2 | `STATE 非法 JSON 行跳过…非对象（"死了"）抛错且四段零写入回滚` |
| 非法 stateJson 行跳过不影响整步 | T2 | 同上例前半 |
| 非对象 JSON 拒收 | T2 / T3 | T2 同上例后半（事务回滚）；T3 `非法 stateJson …400`（路由 zod） |
| 空 SUMMARY generate 抛错→手动路由可读错误 502 | T2 / T3 | T2 `空 SUMMARY → 抛 SummarizeParseError`；T3 `空 SUMMARY → 502 可读错误` |
| 流水线 done 两失败上抛不 finalize | T2 | `runSummarizeStep：done 失败上抛不 finalize…`（两失败各一） |
| 流水线 needs_human 两失败吞掉照常 finalize | T2 | 同上例后半（两失败各一） |
| 路由 404 / 409×2（活 run、陈旧 baseVersionId）/ 400 | T3 | `活 run 409 / 陈旧 baseVersionId 409 / 非法 stateJson 400 / 无章 404` |
| 伏笔复活先钉现状再改断言 | T2 | `现状：重摘要旧章复活已回收伏笔（D2 修复前快照）`→改后同名仅 1 行 |
| 在途 aria-busy 不可点 | T5 / T6 | T5 `在途 aria-busy 不可点`；T6 `在途 aria-busy 不可点、再点其他章被忽略` |
| 再点其他章被忽略 | T6 | 同上（generate 调用计数恒 1） |
| 弹窗各段渲染断言 | T5 / T6 | T5 `四段渲染断言`；T6 `弹窗各段渲染断言（页面接线后）` |
| 编辑后文本原样进 commit payload | T5 | `编辑后文本原样进 commit payload` |
| 取消不调 commit | T5 | `取消不调 commit` |
| 失败文案位置 | T5 / T6 | T5 `失败文案位置`；T6 `失败文案出现在按钮旁 msg 行` |
| 迁移不删 import.test.ts:129-150 两例 | T3 | 首例按新契约改（行数不变→commit 后 +1），次例 404/409 字面不动 |
| 迁移不删 summarize.test.ts:55-121 | T2 | 两例零改动跑绿 |
| 迁移不删 plainproto.test.ts:110-114 | T2 | 一例零改动跑绿 |
| 迁移不删 BookDetailPage.test.tsx:185 | T6 | `original 章渲染「补摘要」按钮…` 逐字保留 |
| 单次路径调用计数恰 1（大窗口 + 阈值内输入） | T7 | `单次路径：12000 字输入 + contextWindow=524288 → provider.complete 恰 1 次…` |
| 分块触发边界（输入 >48000 token 或 contextWindow<80000，OR） | T7 | `输入触发边界：32000 字→1 次；32001 字→5 次（4 map+1 reduce）`；`窗口触发边界：80000→1 次；65536→3 次；22143→抛 refine-context-too-small` |
| 分块边界规则与每段尺寸（≤10666 字/≤16000 token，段落优先、超长硬切、不跨段） | T7 | `段落边界：\\n\\n 优先且不跨段合并…段长 [5000,10666,9334,1000]`；`64K 窗 + 40475 字…每段 ≤10666 字（估算 ≤16000 token）` |
| 分块调用数（4 map + 1 reduce = 5） | T7 | `64K 窗 + 40475 字 → 4 map + 1 reduce 共 5 次`（断言 calls.length===5） |
| 合并输出 ≤budget=20000 且 truncated（含 map 截断传播） | T7 | `64K 窗 + 40475 字…description.length=20000、truncated=true`；`map 输出超 chunkBudgetChars → 硬截断到 5000 且最终 truncated=true` |
| 任一段失败/空输出口径（整体失败、不返回部分结果） | T7 / T8 | T7 `map 段报错 → refine-map-failed: segment 3/4`、`map 段空输出 → refine-map-empty: segment 2/4`、`reduce 报错 → refine-reduce-failed；reduce 空输出 → refine-reduce-empty`；T8 `分块中途某段 mock 报错 → 502 且 reason 含 refine-map-failed: segment 3/4`、`分块某段空输出 → 502 …refine-map-empty: segment 2/4` |
| 超时语义（per-call 180000，共享 signal） | T7 | 单次与分块两例均断言每次 `timeoutMs===180000`；分块例断言 `calls.length===5` |
| 最小窗口守卫与 map-reduce 并存（65536 走分块、8192/22143 抛错） | T7 / T8 | T7 窗口边界例；T8 `contextWindow 小 → 502 含 reason=refine-context-too-small`（8192） |
| reduce prompt 关键词 | T7 | `renderRefineReduceTask 含“合并”“预算 20000 字”关键词`（contract.test.ts +1） |
| ~~小窗口测试（原 T10）~~ | — | owner 裁决撤销，随卡删除 |

## 自审五查记录

1. **规格覆盖（通过，2026-11-26 owner 裁决后修订；D4 改判按增补卡重跑）**：A1/A2→T3/T5/T6；B→T7/T8/T9；C=仅注记→T1 注释一行（原 T10 撤销）；D1→T2/T3/T5/T6；D2→T2；D4→T7/T8/T9（**owner 改判：单次 LLM + 分块 map-reduce 兜底**——T7 双路径含触发/切段/合并/失败/超时钉值，T8 分块失败 502 断言，T9 在途文案覆盖分块耗时且不加 UI）；§4 全表逐行挂任务（见上表，新增单次计数/触发边界/分块边界与尺寸/调用数/合并输出≤budget/truncated/失败口径/超时/最小窗并存/reduce prompt 九类）无遗漏。迁移不删四例全部显式保留。T4/T0 为共用基座（client.ts/shared 一次改完），防跨卡碰撞。
2. **步骤唯一性（通过，D4 改判重跑）**：每步一动作一可核对结果（命令+看到什么算过）；`import.test.ts` 改契约只在 T3 出现、`routes.ts` generate 端点只在 T3、refine 端点只在 T8（串行已标）；`config.ts` 只在 T1 改；`client.ts` 只在 T4 改；map-reduce 的切段/调用编排/合并/截断函数体只在 T7 的 `refine.ts`，prompt 串只在 `render.ts`，分块失败 502 断言只在 T8。全篇无占位、待补、泛化校验类死行。
3. **类型一致（通过，D4 改判重跑）**：`SummaryPayload`/`SummaryGenerateResultDto`/`SummaryCommitBody` 在 T0→T2→T3→T4→T5→T6 签名一致；`refineDescriptionWithLlm(deps, input)` 签名与返回 `{description,truncated}` 在 T7→T8→T9 一致（T8 外部契约不动）；新增 `renderRefineReduceTask(chunkOutputs: string[], budgetChars: number)` 在 T7 定义并由 T7 的 `contract.test.ts` 验；`estimateRefineTokens` 的 1.5 系数在 T7 钉值与测试一致；`REFINE_MIN_MAP_WINDOW=22144` 在 T7 钉值、T7 窗口边界例、T8 8192 抛错例一致；`StepName='refine'` 在 T0→T1→T7 一致；`timeouts.refine=180000` 在 T1→T7（per-call，每次 complete 均带）一致；`baseVersionId` 必填贯穿 T0/T2/T3/T4/T5。
4. **五类咬人输入各配一测（通过，2026-11-26 owner 裁决后修订；D4 改判重跑）**：①空/非单行摘要与 refine 空输出→T2 `SummarizeParseError` + T3 502 + T1 zod transform + T7 `map 段空输出 → refine-map-empty: segment 2/4` / `reduce 空输出 → refine-reduce-empty` + T8 502；②`stateJson` 非对象 `"死了"`→T2 事务全回滚 + T3 400；③陈旧 `baseVersionId`→T3 409；④活 run、再点其他章与分块中途某段报错→T3 409 + T6 调用计数恒 1 + T7 `map 段报错 → refine-map-failed: segment 3/4` + T8 `分块中途某段 mock 报错 → 502`；⑤同名伏笔（含已回收）、断连取消与 64K 窗/40K 字分块边界→T2 D2 两断言 + T3 abort + T5/T6 取消不 commit + T7 触发边界（32000/32001 字、80000/65536/22143 窗）、`64K 窗 + 40475 字 → 5 次调用`、每段 ≤10666 字/≤16000 token、合并输出 ≤20000 且 truncated。（原「budget.ts 窗口吃满/小窗口→T10 两例」随 T10 撤销。）
5. **比例（通过，留痕）**：契约+钉值+测试清单为主，函数体只在 T2（THREADS/STATE/事务）、T5（勾选映射）、T7（单次硬截断 + 分块切段/调用编排/合并/truncated 计算）三处签名与测试都定不了的算法处出现，其余均为接口/步骤/断言。计划体量（修订后含 T7 双路径）对卡面 7.5KB 超出两倍，源于 11 卡逐卡可执行粒度（卡面是决策真值、不含接口与测试落点），属粒度展开非代码抄写；若主审要求压比，优先合并 T0/T1 与 T4/T5/T6 为三张卡而不删测试映射。
