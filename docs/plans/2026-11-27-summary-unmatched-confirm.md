# 补摘要未匹配批量确认 + per-book alias 学习 实现计划

**目标：** 补摘要中未匹配的伏笔行与人物名不再静默丢弃——在现弹窗加第五段「未匹配处理」批量裁决（人物三态=关联已有卡/新建卡/忽略，伏笔两态=写入/忽略），确认落库时同步建档与 alias 学习（characters.aliases，匹配顺序=精确同名→aliases→未匹配进第五段）。
**架构：** 匹配与裁决执行都在服务端 `commitSummarize` 单事务内（服务端按自己查库结果定匹配顺序，客户端第五段载荷只是裁决输入，防两端名单不一致）；generate 侧只在 `renderSummarize` 注入名册/伏笔标题行（带上限截断注记）从源头减幻觉名；shared DTO 加两个可选裁决数组与 `CharacterDto.aliases?`，迁移 0016 加列，默认 `[]` 旧路径零回归；管道路径（`runSummarizeStep` 自动补摘要，无交互面）不带裁决载荷，未匹配行维持现状跳过，不在本批整改范围。
**规格：** owner 四反馈+四拍板（本计划头「全局约束」Q1–Q4 逐条即规格真值，2026-11-27 下发）；修订声明与 DEC 草稿见文末（修订对象=旧计划 `docs/plans/2026-11-26-summary-confirm-refine-budget.md:10` D1 的两条未匹配文案与「每行可勾选」条款；「不做自由文本编辑」维持不变）。

## 全局约束

- **Q1（已拍板）**：`renderSummarize` 注入现有角色名册+伏笔清单，**仅名字/标题行**，不注入设定全文；UI 内用户手动裁决；**不做模糊自动匹配**。名册取 `listActiveCharacters`（写章在场口径），超上限截断并注记「名册未列全」；上限值=owner 已拍板（2026-11-27 决策点①）：`SUMMARIZE_ROSTER_CAP=50`。
- **Q2（已拍板）**：现弹窗 `SummaryConfirmDialog` 加第五段「未匹配处理」，确认按钮前统一呈现；**不做独立向导**。
- **Q3（已拍板）**：新建卡仅 `name`、`baseSetting` 留 `'{}'`（走既有 `createCharacter`，API/占位显示/编辑入口零新逻辑）。**评议 HIGH_RISK 已采纳**：前端 commit 预检新建名单与现库重名（同 POST /characters 的 409 门语义，拦在 `onConfirmed` 之前）；事务内 INSERT characters 禁裸插——先 `getCharacterByName` 回查、命中即关联既有卡，不得让重名炸整个 commit 事务（`characters` 表有 `UNIQUE(book_id, name)`，0001_core.sql:7）。
- **Q4（已拍板）**：迁移 0016 给 `characters` 加 `aliases`（样例照 0015_gen_gate.sql）；用户裁决「章内名 X → 已有卡 Y」时把 X 写入 Y 的 aliases；**匹配顺序=精确同名→aliases→未匹配进第五段**，服务端 commit 时按当前库自算顺序（客户端名单过期时以服务端为准）。
- **第五段默认处置（owner 已拍板③，2026-11-27；推翻原钉「忽略」）**：人物行默认=「新建卡」（仅 `name`，`baseSetting` 留 `'{}'`，走 Q3 既有建档链路），伏笔行（含无标签行）默认=「写入」（新建 planted 条目，语义见下行钉值）；用户仍可逐条改判为「关联已有卡」或「忽略」。**风险注记**：原推荐「忽略」的理由是防 LLM 幻觉名被一次误点确认批量建空卡污染名册——owner 拍板默认写入/建档后，此风险由用户逐条改判与前端重名预检（Q3）承担。
- **未匹配伏笔行「写入」语义（钉值）**：=新建 planted 条目（`INSERT INTO foreshadowings ... status='open', planted_ch=<本章>`），与既有 planted 自动路径同构（DEC-2026-1126-10 D2 口径一致）；带标签行写入 `collapseWhitespace(desc)`，无标签行写入 `collapseWhitespace(整行)`。命中既有的 planted 行维持「已存在同名不重复埋」不变（属去重非未匹配）。
- **alias 匹配口径（钉值）**：精确字符串相等（不做 collapseWhitespace/模糊匹配）；alias 命中=自动匹配成功行，视同精确命中（不写 alias、状态合并照走）；精确同名与他人 alias 撞名时精确优先。
- **管道路径不变（钉值）**：`runSummarizeStep` 自动补摘要不带裁决载荷，未匹配行跳过=既有自动化语义；本批只整改用户手动补摘要（generate→弹窗→commit）链路。管道若也要停机问询属新需求另开卡。
- **测试基线只增不减**：执行者开卡前实测三处基线（最近存证 server 681 / web 222 / shared 22，仅对照非钉值）；钉死文案变更按条款修订惯例更新钉值、用例数只增，禁删例。
- **验证链**：每卡定向 vitest → `pnpm -w typecheck` 零错 → 全量；GUI 卡提交前 web-gui-tester 黑盒并注明「GUI 已验证/未验证」；执行者只 commit 不 push；≥3 文件或 ≥100 行的卡 push 前过 code-review。
- **通道**：迁移卡（C1）属禁入并行卡型，独占串行窗；C2/C3 共改 `summarize.ts` 与 `routes.ts`，严格 C2→C3 串行；其余卡改动文件集互斥可并行。

## 拆卡表

| 卡 | 任务 | 主改文件集（测试随卡） | 依赖/串行 |
| --- | --- | --- | --- |
| C0 | T0 shared DTO | `packages/shared/src/api.ts` | 先行，全卡消费 |
| C1 | T1 迁移+仓储 alias | `apps/server/src/db/migrations/0016_character_aliases.sql`(Create)、`apps/server/src/db/repositories/books.ts` | T0；独占串行窗（迁移卡） |
| C2 | T2 prompt 名册注入 | `apps/server/src/prompts/render.ts`、`apps/server/src/pipeline/summarize.ts`、`apps/server/src/http/routes.ts` | T0；C3 严格在其后 |
| C3 | T3 commit 落库+zod | `apps/server/src/pipeline/summarize.ts`、`apps/server/src/http/routes.ts`、`apps/server/src/http/schemas.ts` | T0+T1+T2 |
| C4 | T4 弹窗第五段 | `apps/web/src/components/SummaryConfirmDialog.tsx` | T0 |
| C5 | T5 页面标注与接线 | `apps/web/src/pages/BookDetailPage.tsx` | T0+T4 |

依赖序：T0 → {T1, T2, T4}；T1+T2 → T3；T4 → T5。

---

## 任务 T0：shared DTO（裁决载荷 + aliases）

**文件：** Modify `packages/shared/src/api.ts`（:702-711 Summary* 群追加；:187-193 CharacterDto 追加字段）
**接口：**
- Consumes：无。
- Produces（T2/T3/T4/T5 消费，签名钉死）：
```ts
export interface SummaryUnmatchedThreadChoice { text: string; action: 'write' | 'ignore' }
export interface SummaryUnmatchedCharacterChoice {
  name: string;
  action: 'link' | 'create' | 'ignore';
  /** action='link' 必填：目标人物卡 id（zod 层 refine 把关） */
  characterId?: string;
}
// SummaryCommitBody 追加两个可选字段（可选=既有测试夹具与管道路径零改动）：
unmatchedThreads?: SummaryUnmatchedThreadChoice[];
unmatchedCharacters?: SummaryUnmatchedCharacterChoice[];
// CharacterDto 追加（可选=旧夹具零改动；0016 起服务端恒回）：
/** per-book 别名（0016，JSON 数组）；匹配顺序=精确同名→aliases→未匹配裁决 */
aliases?: string[];
```
**钉死值：** `SummaryGenerateResultDto` 形状不动（名册只进 prompt 不回传）；`SummaryThreadChoice`/`SummaryStateChoice` 不动（未匹配行的 include 由客户端恒置 false，见 T4）。
**步骤：**
- [ ] `api.ts` 按上述签名追加两接口、`SummaryCommitBody` 两可选字段、`CharacterDto.aliases?` → `pnpm -w typecheck` 零错（零逻辑改动，无新测试；shared 用例数不变即过）。commit。

## 任务 T1：迁移 0016 + 仓储 alias 读写

**文件：** Create `apps/server/src/db/migrations/0016_character_aliases.sql` / Modify `apps/server/src/db/repositories/books.ts`（:317-329 CharacterCard/CHARACTER_COLS/toCharacterCard、:331-352 四处 inline cast、:354 后追加 appendCharacterAlias）/ Test `apps/server/test/pipeline/summarize-commit.test.ts`（+2，本卡只加迁移/仓储例，commit 行为例归 T3）
**接口：**
- Consumes：无（schema 层独立）。
- Produces：`CharacterCard.aliases: string[]`；`appendCharacterAlias(db: Database, characterId: string, alias: string): void`（幂等：已含该 alias 则零写入；去重后 `UPDATE characters SET aliases=?`）。
**钉死值：** 迁移 SQL（样例照 0015 注释+回滚格式）：
```sql
ALTER TABLE characters ADD COLUMN aliases TEXT NOT NULL DEFAULT '[]';
-- 0016：per-book 人物别名（2026-11-27 补摘要未匹配确认批 Q4）：JSON 数组字符串；匹配顺序=精确同名→aliases→未匹配进第五段裁决。
-- 回滚：ALTER TABLE characters DROP COLUMN aliases;（user_version 不回退，旧代码零影响；SQLite ≥3.35 支持）
```
`toCharacterCard` 读列 `aliases`（NOT NULL DEFAULT '[]'，ALTER 时旧行自动回填默认值，`JSON.parse` 不需兜底）；四处 SELECT 的 inline cast 类型（getCharacter :332-334、getCharacterByName :339-341、listCharacters :109-117、listActiveCharacters :347-351）同步加 `aliases: string`；两条既有 `INSERT INTO characters`（books.ts:85/:360）不列 aliases 列，靠列默认值，零改动。
**步骤：**
- [ ] 写迁移文件（逐字照上）→ `pnpm --filter @inkforge/server exec vitest run test/pipeline/summarize-commit.test.ts` 全绿（migrate 按文件名序自动应用，既有例零破=迁移不炸既有库）。
- [ ] `summarize-commit.test.ts` 加 `it('0016 迁移：characters.aliases 列存在且旧行默认 []')`——建库 migrate 后对既有 character 直查 `SELECT aliases`，断言等于 `'[]'`；红。
- [ ] 同文件加 `it('appendCharacterAlias 幂等：重复 append 不产生重复项')`——`createCharacter` 后连续 `appendCharacterAlias(db, id, '阿三')` 两次，断言 `listCharacters(...)[0].aliases` 逐字等于 `['阿三']`；再 append `'三哥'` 断言 `['阿三','三哥']`；红。
- [ ] 实现 `CharacterCard.aliases` + `toCharacterCard` 解析 + `appendCharacterAlias`（函数体只在此：读-判重-写回）→ 上述两例绿；`pnpm -w typecheck` 零错。commit。

## 任务 T2：renderSummarize 名册/伏笔清单注入（含截断）

**文件：** Modify `apps/server/src/prompts/render.ts`（:142-156 renderSummarize） / Modify `apps/server/src/pipeline/summarize.ts`（:26-51 generateSummarize 入参、:115-125 runSummarizeStep、新增 collectSummarizeContext） / Modify `apps/server/src/http/routes.ts`（:1510-1532 generate 端点接线）/ Test `apps/server/test/prompts/contract.test.ts`（:88-92 随迁 +2）/ Test `apps/server/test/pipeline/summarize-commit.test.ts`（既有 generate 直调两例 :79/:147 随迁 +1 边界例）
**接口：**
- Consumes：T1 `CharacterCard`（.name）；`listActiveCharacters`（books.ts:346）、`listForeshadowings`（continuity.ts:70）；`collapseWhitespace`（@inkforge/shared，summarize.ts:8 已 import）。
- Produces：
```ts
export const SUMMARIZE_ROSTER_CAP = 50; // 钉值（owner 已拍板 2026-11-27，测试引常量）
export function collectSummarizeContext(db: Database, bookId: string, chapterNo: number): {
  roster: string[]; rosterTruncated: boolean; foreshadowTitles: string[]; foreshadowTruncated: boolean;
};
export function renderSummarize(input: {
  chapterNo: number; content: string;
  roster: string[]; rosterTruncated: boolean;
  foreshadowTitles: string[]; foreshadowTruncated: boolean;
}): string;
// generateSummarize 的 input 追加上述四个 context 字段（必填）
```
**钉死值：** `collectSummarizeContext`：`roster = listActiveCharacters(db, bookId, chapterNo).map(c => c.name)`、`foreshadowTitles = listForeshadowings(db, bookId).map(f => collapseWhitespace(f.description))`，各自按 `SUMMARIZE_ROSTER_CAP` slice，`truncated = 原长 > CAP`。`renderSummarize` 注入块插在【待摘要正文结束】与【输出格式】之间（逐字格式）：
```
【已知角色名册】（只可使用下列名字，名册外新名字一律不写入 STATE）
- <name>
（名册未列全，超出上限部分未列出）        ← rosterTruncated 时才输出此行
【既有伏笔清单】（[advanced]/[resolved] 只可指向下列条目）
- <title>
（伏笔未列全，超出上限部分未列出）        ← foreshadowTruncated 时才输出此行
```
空名单=整个块省略（连标题行都不出）。两清单各自独立计数截断。`runSummarizeStep` 内调 `collectSummarizeContext` 传入；routes.ts generate 端点 :1523 前调 `collectSummarizeContext(db, bookId, Number(chapterNo))` 并入 `generateSummarize` 入参（generateSummarize 保持零写库，只读）。mock provider 按 step 路由，prompt 内容变化零影响。
**步骤：**
- [ ] `contract.test.ts` 改既有 `renderSummarize：四个格式标记齐备`（:88-92）调用补四个 context 入参（传 `roster: [], rosterTruncated: false, foreshadowTitles: [], foreshadowTruncated: false`），断言不变且 `not.toContain('【已知角色名册】')`（空名单块省略）；红。
- [ ] 同文件加 `it('renderSummarize 注入名册与伏笔标题行及截断注记')`：`roster: ['张三','李四'], rosterTruncated: true, foreshadowTitles: ['密信落款人身份'], foreshadowTruncated: false` → 断言含 `- 张三`、`- 李四`、`（名册未列全，超出上限部分未列出）`、`- 密信落款人身份`、不含伏笔未列全注记行、不含任何 baseSetting 文本；红。
- [ ] `summarize-commit.test.ts` 加 `it('collectSummarizeContext 截断：恰好 CAP 不注记、CAP+1 双清单注记')`——断言全部用 import 的 `SUMMARIZE_ROSTER_CAP` 常量不用字面量 50：先建恰 CAP 张卡（createCharacter 循环）+恰 CAP 条伏笔（upsertForeshadowing）→ `collectSummarizeContext(db, bookId, 1)` 断言 `roster.length===SUMMARIZE_ROSTER_CAP && !rosterTruncated && foreshadowTitles.length===SUMMARIZE_ROSTER_CAP && !foreshadowTruncated`；再各补 1 条 → 断言两个 truncated 均为 true 且两数组长度仍=CAP；红。
- [ ] 同文件既有两处 `generateSummarize` 直调（:79 零写入例、:147 空 SUMMARY 例）入参补四个 context 字段（空数组形态）→ 定向跑绿（纯签名迁移，断言零改）。
- [ ] 实现 `SUMMARIZE_ROSTER_CAP` + `collectSummarizeContext` + `renderSummarize` 注入块 + `generateSummarize`/`runSummarizeStep`/routes generate 接线 → contract 两例 + 边界例绿。
- [ ] `pnpm --filter @inkforge/server exec vitest run test/prompts/contract.test.ts test/pipeline/summarize.test.ts test/pipeline/summarize-commit.test.ts` 全绿（summarize.test.ts 两例走 runSummarizeStep，签名不变零改动跑绿）；`pnpm -w typecheck` 零错。commit。

## 任务 T3：commit 落库——匹配顺序/建档/alias 写入/冲突回查 + zod

**文件：** Modify `apps/server/src/pipeline/summarize.ts`（:12-17 SummaryPayload、:53-112 commitSummarize）/ Modify `apps/server/src/http/schemas.ts`（:422-445 summaryCommitSchema）/ Modify `apps/server/src/http/routes.ts`（:1535-1558 commit 端点载荷映射）/ Test `apps/server/test/pipeline/summarize-commit.test.ts`（+8）/ Test `apps/server/test/http/summarize-confirm.test.ts`（+3）
**接口：**
- Consumes：T0 两裁决接口形状；T1 `appendCharacterAlias`、`CharacterCard.aliases`、`getCharacterByName`（books.ts:338）、`getCharacter`（books.ts:331）、`createCharacter`（books.ts:354）；既有 `listCharacters`/`resolveForeshadowing`/`upsertCharacterState`。
- Produces：
```ts
// SummaryPayload 追加（可选，管道路径不带）：
unmatchedThreads?: Array<{ text: string; action: 'write' | 'ignore' }>;
unmatchedCharacters?: Array<{ name: string; action: 'link' | 'create' | 'ignore'; characterId?: string }>;
// summaryCommitSchema 追加（zod）：
unmatchedThreads: z.array(z.object({ text: z.string().min(1), action: z.enum(['write','ignore']) })).default([]),
unmatchedCharacters: z.array(z.object({
  name: z.string().min(1),
  action: z.enum(['link','create','ignore']),
  characterId: z.string().min(1).optional(),
})).default([]),
// 对象级 refine：'link 裁决必须带 characterId'
.refine(b => b.unmatchedCharacters.every(e => e.action !== 'link' || e.characterId !== undefined), 'link 裁决必须带 characterId')
```
**钉死值（commitSummarize 执行序，全在原单事务内）：**
- STATE 匹配：`allCards = listCharacters(db, bookId)`；`idByExact = Map(allCards.name→id)`；`idByAlias = Map(allCards.flatMap(c => c.aliases.map(a => [a, c.id])))`。每条 delta（JSON 合法性既有检查不动）：`charId = idByExact.get(name) ?? idByAlias.get(name)`——命中走既有浅合并写库；未命中查 `unmatchedCharacters`（Map by name，重复 key 后者覆盖）：`link` → `getCharacter(db, bookId, characterId)` 不存在则 `throw new Error('关联的人物卡不存在: ' + characterId)`（400、整事务回滚），存在则 `appendCharacterAlias(db, characterId, delta.name)` 后以该 id 合并状态；`create` → 先 `getCharacterByName(db, bookId, name)` 回查（**HIGH_RISK 冲突回查：命中即关联既有卡，不 INSERT、不炸事务、不写 alias**），未命中才 `createCharacter(db, bookId, { name })`（baseSetting 缺省 `'{}'`）并以新 id 合并状态；`ignore` 或无裁决 → 跳过该行。alias 命中=自动匹配，不写 alias。
- THREADS 匹配：既有命中分支不动（resolved/advanced 命中 resolve、planted 未命中自动 INSERT、planted 命中跳过）；**未匹配行**（无标签行、或带标签但 desc 未命中且标签非 planted）查 `unmatchedThreads`（Map by 整行原文）：`write` → INSERT planted（desc=带标签行取 `collapseWhitespace(desc)`、无标签行取 `collapseWhitespace(整行)`，`planted_ch=chapterNo`，`status='open'`）；`ignore` 或无裁决（管道路径）→ 跳过。
- routes.ts commit 端点 :1548-1553 载荷映射改为：`openThreads = body.threads.filter(t => t.include || unmatchedThreadTexts.has(t.text)).map(t => t.text)`、`characterDeltas = body.states.filter(s => s.include || unmatchedCharacterNames.has(s.name)).map(...)`，并透传 `unmatchedThreads: body.unmatchedThreads, unmatchedCharacters: body.unmatchedCharacters`（未匹配行 include 恒 false 由客户端保证，服务端按裁决处理其落库，include 值对未匹配行无意义）。`stale-base-version`/活 run 409/404 三守卫不动；`commitSummarize` throw → 既有 catch 400 不动。
**步骤：**
- [ ] `summarize-commit.test.ts` 加 8 例（跑定向确认红）：
  - `it('alias 命中自动匹配：delta 用别名写库到本人卡，且不写 alias')`
  - `it('精确同名优先于他人 alias')`（卡 A name='X'、卡 B alias 含 'X'，delta X → 状态落在 A）
  - `it('link 裁决：状态合并进目标卡 + alias 追加')`
  - `it('create 裁决：建档 name-only（baseSetting={}）+ 状态落新卡')`
  - `it('重名撞车回查：create 裁决遇同名既有卡 → 不炸事务、关联既有卡')`（先直插同名卡再 commit，断言 characters 表该名仅 1 行且状态落在其上）
  - `it('未匹配伏笔 write 裁决：新建 planted 条目（planted_ch=本章，status=open）')`；`it('未匹配伏笔 ignore 裁决/无裁决：零写入')`
  - `it('link 指向不存在的 characterId → 抛错四段零写入回滚')`
  - `it('管道路径（无裁决载荷）：未匹配行维持跳过')`
- [ ] 实现 SummaryPayload 扩展 + commitSummarize 匹配/裁决/回查逻辑（函数体只在此）→ 上述 8 例绿。
- [ ] `summarize-confirm.test.ts` 加 3 例（红）：`it('link 缺 characterId → 400（zod refine）')`、`it('HTTP 全链：unmatched create+thread write 载荷 → 200 且库中建档+新伏笔')`、`it('characterId 不存在 → 400 可读错误')`。
- [ ] 改 summaryCommitSchema 与 routes commit 映射 → 3 例绿；既有 6 例（:98-:221）零改动跑绿。
- [ ] `pnpm --filter @inkforge/server exec vitest run test/pipeline/summarize-commit.test.ts test/http/summarize-confirm.test.ts test/pipeline/summarize.test.ts` 全绿；`pnpm -w typecheck` 零错；server 全量只增不减。commit。

## 任务 T4：弹窗第五段「未匹配处理」+ 前端重名预检

**文件：** Modify `apps/web/src/components/SummaryConfirmDialog.tsx`（props/buildBody/段五 UI）/ Test `apps/web/src/components/SummaryConfirmDialog.test.tsx`（+5）
**接口：**
- Consumes：T0 `SummaryUnmatchedThreadChoice`/`SummaryUnmatchedCharacterChoice`。
- Produces（T5 消费，props 钉死；`unmatched` 为**必填** prop，T5 恒传、无未匹配时传空三数组）：
```ts
unmatched: {
  characters: string[];                       // 未命中（精确+alias）的 name，按 characterDeltas 顺序去重
  threads: string[];                          // 未命中伏笔行原文，按 openThreads 顺序去重
  cards: Array<{ id: string; name: string }>; // 可关联既有卡（页面 characters 全量，含下线卡）
};
```
**钉死值：** 段五位于段四与 error/footer 之间，标题 `未匹配处理`。人物行：`aria-label="未匹配人物：${name}"` 的 select，三选项 `新建卡`（默认）/`关联已有卡`/`忽略`；选「关联已有卡」出第二 select `aria-label="关联目标：${name}"`，选项=label=卡名 value=卡 id，**默认选中第一张卡**（`cards[0]?.id ?? ''`）；`cards` 为空时「关联已有卡」选项 disabled。伏笔行：`aria-label="未匹配伏笔：${text}"` 的 select，两选项 `写入（按新伏笔埋入）`（默认）/`忽略`。段三/段四中属于未匹配名单的行**不再渲染 checkbox**（原位仅渲染 annotations 文案），其处置唯一入口=段五。buildBody：`unmatchedThreads`/`unmatchedCharacters` 按 unmatched 顺序从两个 state map 组装；未匹配行在 `threads`/`states` 数组里 include **恒 false**。前端重名预检（HIGH_RISK 已采纳）：点确认时若有 create 行的 name 命中 `unmatched.cards` 任一卡名 → 不调 `onConfirmed`，本地 state 渲染进既有 `data-testid="summary-dialog-error"` 槽位（与 props.error 二选一显示），文案逐字 `人物「${name}」已在档案中存在，请改选「关联已有卡」`。两 state map 在 open/换稿 useEffect（:44-49）随既有重置一并复位为默认写入/建档（人物=新建卡、伏笔=写入，决策点③拍板值）。
**步骤：**
- [ ] 测试 5 例（红）：
  - `it('段五渲染：人物三态下拉默认新建卡、伏笔两态下拉默认写入')`（unmatched 传 1 人物行+1 伏笔行，断言人物 select 初值=新建卡、伏笔 select 初值=写入）
  - `it('关联已有卡：出现目标下拉默认第一张卡，buildBody 带 {name, action:"link", characterId}')`
  - `it('新建卡 + 伏笔写入：buildBody.unmatchedCharacters/unmatchedThreads 逐字')`
  - `it('重名预检：create 名命中 cards → 显示预检文案、onConfirmed 零调用')`
  - `it('未匹配行在段三/四无 checkbox，include 恒 false 进 payload')`
- [ ] 实现段五 UI + state + buildBody 扩展 + 预检（函数体只在此：state→payload 映射与预检）→ 5 例绿；既有 7 例跑绿——其共享 render 助手补传 `unmatched: { characters: [], threads: [], cards: [] }` 一处（空名单=段五列表渲染为空，既有断言零改）。
- [ ] `pnpm --filter @inkforge/web exec vitest run src/components/SummaryConfirmDialog.test.tsx` 全绿；`pnpm -w typecheck` 零错。commit（注明 GUI 未验证，归 C5 后统一黑盒）。

## 任务 T5：页面标注改版 + 接线（含钉死文案变更）

**文件：** Modify `apps/web/src/pages/BookDetailPage.tsx`（:78-111 buildSummaryAnnotations、:1320-1328 弹窗挂点）/ Test `apps/web/src/pages/BookDetailPage.test.tsx`（:295-307 钉值随迁 +3）
**接口：**
- Consumes：T0 `CharacterDto.aliases?`；T4 `unmatched` props。
- Produces：`buildSummaryAnnotations` 返回扩展为 `{ threads, states, unmatched: { characters, threads, cards } }`（结构同 T4 props 钉死值）。
**钉死值：** 标注文案逐字（六类中两类变更，四类不动）：
- 人物未命中（精确+alias 都不中）：`未匹配人物卡不会写入` → **`待裁决：档案无此名，见「未匹配处理」`**
- 无标签 THREADS 行（决策点②通过版）：`未匹配将被忽略` → **`待裁决：无标签行，见「未匹配处理」`**
- 带标签未命中 advanced/resolved：`未匹配将被忽略` → **`待裁决：未命中既有伏笔，见「未匹配处理」`**
- 不动：`将回收：${desc}（第${hit.plantedCh}章埋）`、`将新埋：${desc}`、`已存在同名伏笔，不会重复埋`、`将更新人物「${d.name}」状态（与前章浅合并）`（**alias 命中复用此文案**，行按命中处理保留 checkbox）。
- `names` 之外加 `aliasSet = new Set(characters.flatMap(c => c.aliases ?? []))`；unmatched.characters=按 characterDeltas 顺序的未命中 name 去重；unmatched.threads=按 openThreads 顺序的未命中行去重；unmatched.cards=`characters.map(c => ({ id, name }))`。弹窗挂点 :1320-1324 传 `unmatched={annotations.unmatched}`。confirmSummary/取消/单在途逻辑零改动。
**步骤：**
- [ ] 测试随迁（红）：既有 `弹窗各段渲染断言（页面接线后）`（:279-308）按新钉值更新——期望文案列表 `未匹配将被忽略`（:302）→ `待裁决：未命中既有伏笔，见「未匹配处理」`、`未匹配人物卡不会写入`（:304）→ `待裁决：档案无此名，见「未匹配处理」`；checkbox 断言 `boxes.length).toBe(6)`（:295-297）→ **`toBe(4)`**（夹具 4 THREADS 中 `[advanced] 失踪的账本` 未匹配、2 STATE 中 `李四` 未匹配，均移除 checkbox）；追加断言 `未匹配处理` 标题与 `未匹配人物：李四`、`未匹配伏笔：[advanced] 失踪的账本` 两行在弹窗内。
- [ ] 加 3 例（红，共用约束：**模块级 `SUMMARY_RESULT` 夹具零改动**，后两例各建局部 fixture，不污染其他用例）：
  - `it('第五段裁决 link → commit 载荷带 unmatchedCharacters')`：用 `installSummarizeStub()` 默认夹具（李四/失踪的账本天然未匹配），段五把 `未匹配人物：李四` 选「关联已有卡」（默认目标=张三 k1）点确认 → stub 的 commit 分支捕获 `init.body`，断言 `unmatchedCharacters` 逐字等于 `[{ name:'李四', action:'link', characterId:'k1' }]` 且 `states` 中李四行 `include===false`。
  - `it('alias 命中显示为命中并保留 checkbox')`：该例自建独立 fetch stub（仿 installSummarizeStub 分支结构）——characters 分支返 `[{ id:'k1', name:'张三', baseSetting:'{"身份":"主角"}', offlineFromChapter:null, aliases:['张郎'] }]`、summarize 分支返局部 fixture `{ ...SUMMARY_RESULT, characterDeltas: [{ name:'张郎', stateJson:'{"伤":"轻"}' }, { name:'李四', stateJson:'{"伤":"重"}' }] }` → 断言 `将更新人物「张郎」状态（与前章浅合并）` 出现、张郎行有 checkbox、`未匹配人物：张郎` 不在弹窗（未匹配仅剩李四）。
  - `it('无标签 THREADS 行进第五段')`：该例自建独立 fetch stub，summarize 分支返局部 fixture `{ ...SUMMARY_RESULT, openThreads: [...SUMMARY_RESULT.openThreads, '夜行人的真实身份'] }` → 断言 `待裁决：无标签行，见「未匹配处理」` 出现且 `未匹配伏笔：夜行人的真实身份` 行在段五。
- [ ] 实现 buildSummaryAnnotations 扩展与挂点接线 → 上述全绿。
- [ ] `pnpm --filter @inkforge/web exec vitest run src/pages/BookDetailPage.test.tsx` 全绿（既有其余例零改动）；`pnpm -w typecheck` 零错。
- [ ] web-gui-tester 黑盒：延迟 mock 走「补摘要→弹窗五段→link/新建/忽略各一例→重名预检拦阻→确认落库→人物区出现新卡/伏笔区新条目」；提交信息注明 GUI 已验证/未验证。commit。

---

## 待 owner 审决策点（主会话呈报，审后只需改计划钉值再派卡）

- **①（已拍板 2026-11-27）名册注入上限值**：`SUMMARIZE_ROSTER_CAP = 50`（T2，名册与伏笔清单同用一常量、各自独立计）。每名 ≈4-8 token，50 名 ≈ 300 token 相对 48000 级输入可忽略。
- **②（已拍板 2026-11-27）无标签 THREADS 行进第五段**：默认=写入（按 `collapseWhitespace(整行)` 新埋 planted，T3 已按此实现；默认值随决策点③拍板改为写入）。用户偶见垃圾行，一键忽略即可。
- **③（已拍板，2026-11-27）第五段默认处置=写入/建档**：原推荐维持「忽略」，理由=防 LLM 幻觉名被一次误点确认批量建空卡污染名册。owner 推翻推荐、拍板默认写入/建档——该风险改由用户逐条改判与前端重名预检（Q3）承担；T4 默认选项与 T4/T5 测试断言已按新默认改写，其余任务不受影响。

## 条款修订声明与 DEC 草稿（归档由主会话执行）

旧计划 `docs/plans/2026-11-26-summary-confirm-refine-budget.md:10` D1 的「未匹配将被忽略」「未匹配人物卡不会写入」两条钉死文案与「THREADS/STATE 每行可勾选剔除」条款随本批修订：匹配行保留勾选剔除，未匹配行处置升级为第五段显式裁决（忽略语义由裁决承担）；「不做 STATE/THREADS 自由文本编辑」**维持不变**。草稿：

```
## DEC-2026-1127-02 [OWNER] 补摘要未匹配批量确认+per-book alias：四反馈落地与 D1 条款修订（2026-11-27）
**背景：** owner 四反馈（未匹配不得静默忽略/改名人物三态裁决/批量确认环节/确认写入同步建档）+四拍板（Q1 prompt 注入名册不模糊匹配、Q2 现弹窗加第五段、Q3 新建卡 name-only+重名预检+事务防炸、Q4 迁移 0016 aliases+匹配顺序精确→alias→裁决）。修订 DEC-2026-1126-10 D1 两条未匹配钉死文案与「每行可勾选」条款（匹配行保留、未匹配行归第五段），自由文本编辑禁令维持。
**拍板：** 三决策点全数拍板（2026-11-27）：①SUMMARIZE_ROSTER_CAP=50；②无标签 THREADS 行进第五段；③第五段默认处置=写入/建档（推翻原推荐「忽略」，幻觉名批量建档风险由用户逐条改判与前端重名预检承担）。计划真值=docs/plans/2026-11-27-summary-unmatched-confirm.md。
```

## 自审五查记录

1. **规格覆盖**：反馈①②③（不静默忽略/三态裁决/批量确认）→T4/T5；反馈④（建档）→T3；Q1→T2；Q2→T4；Q3（含 HIGH_RISK 预检+回查）→T3/T4；Q4（迁移+alias 写入+匹配顺序）→T1/T3；决策点①→T2 钉值+待审节；②→T3/T5 钉值+待审节；管道路径边界→全局约束钉死；条款修订→声明节。无缺口。
2. **步骤唯一性**：每步一动作一可核对结果；`render.ts`/`collectSummarizeContext` 只在 T2，`commitSummarize`/`summaryCommitSchema` 只在 T3，段五 UI 只在 T4，`buildSummaryAnnotations` 只在 T5；C2→C3 对 `summarize.ts`/`routes.ts` 的写序已钉。全篇无 TBD/泛化校验类死行；函数体只出现在签名+测试定不了的算法处（T1 append 幂等、T3 匹配/裁决序、T4 state→payload 映射+预检），均已用钉死值约束到唯一合理写法；`unmatched` prop 必填与测试助手补传方式已钉（无第二种合理写法）。
3. **类型一致**：`SummaryUnmatchedThreadChoice`/`SummaryUnmatchedCharacterChoice` 在 T0 定义、T3 zod/commit、T4 buildBody、T5 断言四处字段名一致（text/name/action/characterId）；`unmatched` props 三数组（characters/threads/cards）T4 定义=T5 产出；`collectSummarizeContext` 四字段在 T2→routes→generateSummarize 一致；`SUMMARIZE_ROSTER_CAP` 在 T2 钉值与待审①同指一个字面量，边界测试引常量不引字面量（值变更不破测试）；`appendCharacterAlias(db, characterId, alias)` T1 定义=T3 消费；`CharacterDto.aliases?` T0 定义=T5 消费（`?? []` 归一）；T4 `annotations` props 形状不动、新增 `unmatched` 独立必填 prop，T5 挂点同传两者。
4. **五类咬人输入各配一测**：①空/空白（名册空块省略、zod default([])、unmatched 空三数组）→T2 contract 空名单例+T3 schema 例+T4 助手空传例；②非法值（link 缺 characterId、characterId 悬空、action 枚举外）→T3 三例；③陈旧/竞态（create 撞已存在同名、客户端名单过期）→T3 重名撞车例+匹配顺序钉死（服务端自算精确→alias→裁决）；④重复冲突（同名裁决重复 key、alias 重复 append、精确撞他人 alias）→T1 幂等例+T3 精确优先例+Map 后者覆盖钉死；⑤边界量级（CAP 50/51 双清单、books 无卡时 link 禁用、无标签行）→T2 边界例+T4 cards 空钉死+T5 无标签行例。
5. **比例**：六卡均为签名/钉值/步骤串，函数体仅在 T1/T3/T4 三处算法点出现；计划体量约为规格（四反馈+四拍板）的必要展开，未抄写既有代码，全部代码块=接口签名或 SQL 迁移或注入文案钉值。
