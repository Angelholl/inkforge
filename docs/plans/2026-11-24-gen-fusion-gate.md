# 实现计划：生成前融合确认门 MVP（fusion gate）

> **目标：** 落实规格 v3.1 §3.5——run 启动入口（生成/续写按钮处）挂前置确认门：①引擎跑 A 类剥节候选（载体驱动、判定精确到片段，残段保留）+ 绑定现状快照；②一次 LLM 张力对照（行协议、超时/解析失败→**可见降级**）；③门分页逐项按机制诚实给选项（style 行=权重滑条/维归属/剥 MD/保持；planner 参考行=绑/不绑+「大纲卡落地格恒优先」附注；A 类行=剥/留）；④「确认并开始生成」=**单一 better-sqlite3 事务**批量写既有端点语义（无半写、失败中止不入队）→ 前端 confirm 200 后才调既有 runs 端点入队；⑤触发指纹哈希「实际注入面」，未变直通不弹、取消零写零指纹更新→下次必重弹、「不再提示」书级开关；⑥fewshot 开关门内只读显示。
> **架构：** 新增 `apps/server/src/fusion/` 三模块（fingerprint/engine/tension）+ 三个 HTTP 端点（GET gate / POST analyze / POST confirm）+ web 门组件挂 5 个 run 发起点。写语义**全部复用既有 repo 函数**（`updateBookMeta`/`setBookStyleBinding`/`setBookPlotProfile`/`setBookSpectrumProfile`/`setBookImitation`），与书设置面板=同一状态两个写入口（DEC-2026-1117-04 一致性；门写后快照刷新语义=重蒸不自动刷新、需手动重绑，与面板一致）。不动生成管线槽装配、不动蒸馏作业输入、不触碰 mandate/落地格/词表（mandate 与词表**不入指纹**，R6 正交）。
> **规格：** `docs/design/proposal-2026-11-23-import-reconcile.md` v3.1（真值源，owner 已终拍；两轮 decision-critic 评议收口、四钉并入 §3.5）。事实底账：`docs/design/research-2026-11-23-md-archive-overlap.md`（已验收，下称「调研报告」）。格式范例：`docs/plans/2026-11-22-landing-mandate.md`。

## 全局约束

1. **执行通道高危标注**：Task-01 含**数据库迁移 0015**，卡型=**数据库迁移=hy4 限时窗禁入型 → 本卡走 ZCode Agent / 主审亲执**，不得派普通执行者（含 NSIS 模板同步与 migrate/open 钉值随迁，0014 先例同罪源）。
2. **测试基线只增不减**：全量基线=**server 506 + web 156 + shared 2 = 664**（`docs/release/0.2.3-release.md:37`，CI 全量 664 绿+本地同链 server 506 复绿，2026-11-23 存证=当前最新可考值）。执行者开工先复跑 `pnpm test` 核对起点（有漂移以实测为准，**执行时主审实测填**进完成通知）；收口逐包计数 ≥ 基线；既有用例只许新增钉值，禁删禁改断言（冲击清单逐条复核仍绿；随迁钉值=仅数字/DDL 清单更新，非语义改动，提交正文逐条列出）。
3. **验证链硬序**：静态（`pnpm lint` 零输出）→ 定向测试 → 全量 `pnpm test` → `pnpm typecheck` 全 workspace 0 错 → `pnpm deadcode`（knip）零新增导出告警。任一环失败即停。工具链=repo 根 pnpm：`pnpm -F @inkforge/server exec vitest run <file>`、`pnpm -F @inkforge/web test`、`pnpm -F @inkforge/shared test`（脚本名沿 package.json:10-18 实核）。
4. **测试红→绿**：新功能允许走红绿；每任务的测试步骤先落测试夹具（红）再实现（绿）；既有回归用例改动仅限随迁钉值。
5. **执行者只 commit 不 push**；同工作树 ≤1 卡；永不 `--no-verify`、永不 `git add -A`；提交 Conventional 前缀+中文描述，正文 `verify:` 验证结果 + `Refs:` 规格与 DEC；GUI 相关任务提交信息注明「**GUI 未验证（owner 真实测试）**」。
6. **内容无关律 + 1301 纪律**：引擎/解析器/测试夹具全部内容无关（沿 `docs/plans/2026-11-20-settings-import.md` 泛型原则）；本计划与执行过程**不得读取** `apps/server/config/quality/landing-words.default.txt`、`apps/server/data/**`（含真实书稿归档 imports）、`apps/web/src` 下 `*.db`/文本样本；测试夹具自造中性仿形（《示例之作》系），绝不引用 v6 真实文本。
7. **设计红线**：剥除只作用于 description，**绝不回流解析输入**（N1：剥后卡数/树/伏笔/绑定/骨架/mandate 不变）；引擎零 LLM、不落库、无书特异性知识；planner 参考类（plot/spectrum/imitation）只给「绑/不绑」选项并附注「大纲卡落地格恒优先，档案只作参考」——**不造「剥 MD 靠档案」假选项**（化解评议 R3）；LLM 改写正典不做；8k 档截断行为不变。
8. **门四钉逐条落点**：指纹哈希注入面非活档案（Task-01）；可见降级（Task-03/05）；批量中止不入队+故障注入（Task-04）；写入口一致性（Task-04 复用 repo 函数）。

## 冲击清单（既有钉值用例，逐条复核）

| # | 文件:用例/位置 | 钉住的旧语义 | 本计划影响 | 处置 |
|---|---|---|---|---|
| 1 | `apps/server/test/db/migrate.test.ts:33,89,101,137,161,200`（六处 `user_version=14`）+ :48-49/:87 等 4 个回拨夹具 DROP 清单 | 末迁移号钉 14 | 0015 入列必破（沿 0014 入列随迁先例） | Task-01 随迁：六处 14→15 + 每个回拨夹具补 `ALTER TABLE books DROP COLUMN gen_gate_json;`（仿 0014 批注形态） |
| 2 | `apps/server/test/db/open.test.ts`（0014 入列曾中招三处同型，:41/:74/:81 邻域） | 增量迁移物清单断言 | 0015 入列同型风险 | Task-01 核实步：grep `0014` 全文件，命中同型断言随迁 |
| 3 | `apps/server/test/settings-import.parse.test.ts:88-393`（parseSettingsCompendium 全部断言） | 解析钉值（characters/outlineTree/warnings 等） | 返回对象**增键** `consumedSections`。已核（grep :88-393 全量）：断言均为**属性级**（`d.characters.map…toEqual`/`d.warnings toEqual([])`/`toMatchObject`），无整对象 `toEqual(d)` —— 增键不破 | Task-02 复核步整文件重跑全绿即证 |
| 4 | `apps/server/test/http/settings-import.test.ts`（preview 响应与 apply warnings 钉值） | preview body=解析 DTO 逐键 | preview 响应增 `consumedSections` 键；apply 的 zod draft schema（`schemas.ts:305-350`）**无 passthrough，未知键剥除** → 前端回传含新键的 draft 无影响 | Task-02 复核步 |
| 5 | `apps/web/src/pages/BookDetailPage.test.tsx:288`（整书生成 body maxRounds）与 :520-571（发起续写三例） | 点击生成/续写按钮 → 断言发往 run 端点的 fetch body | 门接入后点击路径先打 `GET /fusion-gate`——**stub 缺失即断言落空** | Task-05 随迁：三处用例 stub gate 返回 `{action:'pass'}`（直通形态），既有 run 端点断言逐字保留 |
| 6 | `apps/web/src/pages/NewBookIdeaPage.test.tsx`（launch → createRun 用例） | 同上 | 同上 | Task-05 随迁同型 stub |
| 7 | `apps/server/test/config.test.ts`（预算钉值，含 `config.ts:141` planner task=800、`config.ts:105` worldview=20000） | 预算常量钉值 | **零预算改动**（analyze 端 prompt 截断在模块内定值，不动 BUDGETS_*） | 无影响（列明存证） |
| 8 | `apps/server/test/http/style.test.ts`、`style-snapshot.test.ts`、`blueprint-suggest.test.ts` | PUT /style 与 planner 注入面行为 | 端点零改动（confirm 走 repo 函数新路径，不改 PUT /style） | 无影响 |
| 9 | `apps/server/test/db/repositories.test.ts`、`apps/server/test/http/api.test.ts` | BookDto/GET book 响应形态 | BookDto **不加键**；GET book 剥 `genGateJson` 键（沿 landingMandateJson 先例 `routes.ts:376-378`），响应键集不变 | 无影响；Task-04 复核 GET book 回归 |
| 10 | `apps/server/test/http/landing-mandate.test.ts`、`worker/queue.test.ts` | mandate 行为 | 门不触碰 mandate（指纹亦不含） | 无影响 |

---

## Task-01 基座：shared 类型 + migration 0015 + repo 门状态列 + 注入面指纹【hy4 禁入型 → ZCode Agent / 主审亲执】

**目标**：类型、存储、指纹三件套落地；门状态容错读取有钉死行为；NSIS 同步；migrate/open 钉值随迁。

**文件**
- Create `packages/shared/src/fusion.ts`
- Modify `packages/shared/src/index.ts`（追加 `export * from './fusion';`）
- Modify `packages/shared/src/api.ts:534-552`（SettingsImportDraftDto 增可选字段）
- Create `apps/server/src/db/migrations/0015_gen_gate.sql`
- Modify `apps/server/src/db/repositories/books.ts`（BookRow/Book/toBook 增 `gen_gate_json`；新 `parseGenGate`/`updateGenGate`）
- Create `apps/server/src/fusion/fingerprint.ts`
- Modify `apps/desktop/src-tauri/nsis/inkforge-installer.nsi`（File 节 + Delete 节各加 0015 行，仿 0014 行形态；同步复制 sql 到 `apps/desktop/src-tauri/resources/server/db/migrations/`）
- Test Modify `apps/server/test/db/migrate.test.ts`、`apps/server/test/db/open.test.ts`、`apps/server/test/db/repositories.test.ts`
- Test Create `apps/server/test/fusion/fingerprint.test.ts`

**接口**
- Produces（shared/src/fusion.ts）：
  ```ts
  /** A 类剥节行（引擎产物，Task-02 消费） */
  export interface FusionAClassRowDto {
    heading: string;
    verdict: 'fully-carried' | 'partially-carried' | 'not-carried';
    preset: 'strip' | 'keep';
    removable: boolean;
    strippableLines: string[];
    residualLines: string[];
  }
  /** 张力行（Task-03 产物） */
  export interface TensionRowDto {
    entry: string; mdSide: string; profileSide: string;
    nature: '拉扯' | '冗余' | '缺口'; suggestion: string;
  }
  /** GET /fusion-gate 响应 */
  export interface FusionGateReportDto {
    action: 'pass' | 'show';
    fingerprint: string;
    aClass: FusionAClassRowDto[];
    previewDescription: string;
    headWindowWarn: boolean;
    hasArchive: boolean;
    binding: { styleBinding: StyleBindingDto | null; styleFewshotOn: boolean; snapshotPresent: boolean; plotProfileId: string | null; spectrumProfileId: string | null; imitationProfileId: string | null };
  }
  /** POST /fusion-gate/analyze 响应（可见降级钉） */
  export interface FusionTensionDto { rows: TensionRowDto[]; degraded: boolean; degradeReason?: string }
  /** POST /fusion-gate/confirm 请求（逐项裁决；undefined=该项不动） */
  export interface FusionGateConfirmBody {
    description?: string;
    styleBinding?: { primaryProfileId: string; auxProfileIds: string[]; dimsSource: Record<string, string>; weights: Record<string, number> };
    imitationProfileId?: string | null;
    plotProfileId?: string | null;
    spectrumProfileId?: string | null;
    suppress?: boolean;
  }
  export interface FusionGateConfirmResult {
    results: { description: 'applied' | 'skipped'; styleBinding: 'applied' | 'skipped'; plotProfileId: 'applied' | 'skipped'; spectrumProfileId: 'applied' | 'skipped'; imitationProfileId: 'applied' | 'skipped'; suppressed: boolean; fingerprintStored: boolean };
    fingerprint: string;
  }
  ```
- Produces（api.ts SettingsImportDraftDto）：`/** 消费节清单（规格 §2 v2.2：解析器消费过的节 heading 原文；可选——旧 apply 体经 zod 剥键不受影响 */ consumedSections?: string[]`
- Produces（books repo）：
  ```ts
  export interface GenGateState { fingerprint: string; suppressed: boolean; updatedAt: string }
  /** DB 容错读取：null/''/非法 JSON/缺 fingerprint 键 → null */
  export function parseGenGate(raw: string | null | undefined): GenGateState | null
  export function updateGenGate(db: Database, bookId: string, state: GenGateState): void
  ```
- Produces（fusion/fingerprint.ts）：
  ```ts
  export interface InjectionFace {
    description: string;
    styleBinding: StyleBinding | null;   // booksRepo.getBookStyleBinding 直接产物（含 dimsSource/weights）
    styleFewshotOn: boolean;
    styleSnapshotJson: string | null;
    plotProfileId: string | null;
    spectrumProfileId: string | null;
    imitationProfileId: string | null;
    // mandate（landingMandateJson）与落地词表【不得】入此接口——R6 正交钉
  }
  /** sha256 hex of 固定键序 JSON.stringify(face) */
  export function injectionFaceFingerprint(face: InjectionFace): string
  ```
- Consumes：Task-02 消费 `FusionAClassRowDto`；Task-03/04 消费其余 DTO；Task-04 消费 `parseGenGate`/`updateGenGate`/`injectionFaceFingerprint`；Task-05 消费全部 web 侧 DTO。

**步骤**
- [ ] 1. `pnpm -F @inkforge/server exec vitest run test/db/repositories.test.ts` → 全绿，记用例数（基线锚，执行时主审实测填）。
- [ ] 2. 写 `packages/shared/src/fusion.ts`（上方全部接口，注释注明规格锚 §3.5/§2）+ index.ts 导出。
- [ ] 3. api.ts:534-552 SettingsImportDraftDto 增可选 `consumedSections?: string[]`（注释：preview 回传、书设置入口对归档重解析得同一清单=规格 N3；apply zod schema 无 passthrough 会剥除，无副作用——冲击 #4 证据）。
- [ ] 4. `pnpm -F @inkforge/shared test` → 全绿（shared 基线 2 不减）。
- [ ] 5. 建 `0015_gen_gate.sql`：一行 `ALTER TABLE books ADD COLUMN gen_gate_json TEXT;`，头注释写明规格锚 §3.5 门四钉（触发指纹/不再提示）与回滚句 `ALTER TABLE books DROP COLUMN gen_gate_json;`（user_version 不回退，SQLite ≥3.35，仿 0014 第 3 行）。
- [ ] 6. migrate.test.ts 随迁（冲击 #1）：六处 `user_version` 期望 14→15（:33/:89/:101/:137/:161/:200，沿 0012/0013/0014 入列钉值更新惯例）；4 个回拨夹具各补一行 `ALTER TABLE books DROP COLUMN gen_gate_json;`（沿 :55-68 既有 books 增量列 DROP 形态；:48-49 注释里的迁移号序列描述同步 +1）。
- [ ] 7. `pnpm -F @inkforge/server exec vitest run test/db/migrate.test.ts` → 全绿。
- [ ] 8. open.test.ts 核实步（冲击 #2）：`grep -n "0014" apps/server/test/db/open.test.ts` → 命中的同型「增量物清单/末迁移号」断言随迁补 0015（0014 入列时该文件曾漏网三处，教训在 `docs/plans/2026-11-22-landing-mandate.md` 冲击 #13）；零命中则记录核实结论。
- [ ] 9. books.ts：BookRow 增 `gen_gate_json: string | null`；Book 增 `genGateJson: string | null`；toBook（:48）映射 `gen_gate_json ?? null`（SELECT * 自动带新列，无 SQL 改动）；新增 `parseGenGate`（try/catch JSON.parse；结果非对象或缺 fingerprint 字符串键 → null）与 `updateGenGate`（`UPDATE books SET gen_gate_json = ?, updated_at = ? WHERE id = ?`）。
- [ ] 10. 写 `fusion/fingerprint.ts`（上方签名；`createHash('sha256').update(JSON.stringify(face)).digest('hex')`；接口注释钉死字段序=序列化序）。
- [ ] 11. NSIS：installer.nsi File 节（0014 行 :1560 后）加 `File /a "/oname=resources\server\db\migrations\0015_gen_gate.sql" "${INKFORGE_RES}\server\db\migrations\0015_gen_gate.sql"`（**主审对码修正 11-24：源路径沿 0014 行用 `${INKFORGE_RES}` 变量，非仓库绝对路径**）；Delete 节仿 :5421 行加对应 Delete；复制 sql 到 resources 树（CI `scripts/release-inventory.mjs:82` MIGRATIONS 门 14/14→15/15 属预期随迁）。
- [ ] 12. 测试 `apps/server/test/fusion/fingerprint.test.ts`（纯函数，无 DB）：
  - `同输入两次调用 → 指纹逐字符相等`（N3 确定性）
  - `description 变一字符 / weights 变一值 / dimsSource 变一映射 / fewshotOn 翻转 / snapshotJson 变 / plot、spectrum、imitation 各自变化 → 指纹均改变`（注入面七要素各一断言）
  - `接口键集 toEqual 恰七键（description/styleBinding/styleFewshotOn/styleSnapshotJson/plotProfileId/spectrumProfileId/imitationProfileId），无 mandate/词表键`（R6 结构级钉）
- [ ] 13. repositories.test.ts 追加：`updateGenGate 往返（parseGenGate 回读 fingerprint/suppressed/updatedAt 钉值）`、`gen_gate_json 空串/非法 JSON/缺键 → parseGenGate null`（咬人输入①）。
- [ ] 14. `pnpm -F @inkforge/server exec vitest run test/fusion/fingerprint.test.ts test/db/repositories.test.ts test/db/migrate.test.ts test/db/open.test.ts` → 全绿；`pnpm lint` 零输出。

**验收**：以上全绿；migration 幂等；指纹七要素敏感性与 mandate/词表排除钉死；NSIS 两处行在 diff 中可见。

---

## Task-02 消费节清单（DTO 增字段）+ A 类引擎纯函数（片段级承载判定）

**目标**：解析器增发消费节清单；引擎对任意 description×消费节×绑定现状产出剥节候选行（判定精确到片段、残段保留、定位句保护、头窗示警），零 LLM、零落库、内容无关。

**文件**
- Modify `apps/server/src/settings-import.ts`（parseSettingsCompendium :474 返回对象增 `consumedSections`；`refineForDescription` :95 加 `export`；新增导出 `splitCompendiumSections`）
- Create `apps/server/src/fusion/engine.ts`
- Test Modify `apps/server/test/settings-import.parse.test.ts`
- Test Create `apps/server/test/fusion/engine.test.ts`

**接口**
- Produces（settings-import.ts）：
  ```ts
  export interface CompendiumSectionRaw { heading: string; level: 2 | 3; lines: string[] }
  /** 薄封装 splitDoc：H2 sections（level 2）+ h3Blocks（level 3），文档序 */
  export function splitCompendiumSections(raw: string): CompendiumSectionRaw[]
  // parseSettingsCompendium 返回对象增（固定序，未命中不产条目）：
  // consumedSections = [人物命中节 heading, 大纲命中节 heading, 矩阵命中节 heading, 文风命中节 heading, ...命中 /悬置|伏笔/ 的 h3Blocks heading]
  // —— 与 :494/:499/:501/:542/:447 五处 includes/find 判定同一事实源（调研报告 Q1）
  ```
- Produces（fusion/engine.ts）：
  ```ts
  export interface FusionCarriers {
    charactersText: string;      // listCharacters 的 base_setting JSON 串拼接
    outlineText: string;         // books.outline
    blueprintGoalsText: string;  // chapters 蓝图 goal 拼接
    foreshadowingsText: string;  // listForeshadowings 的 description 拼接
    styleSourcesText: string;    // 本书已绑 style 档案 style_sources.text 拼接（routes.ts:1008-1024 同源）
  }
  export interface FusionAClassRow { /* 同 shared FusionAClassRowDto 五键 */ }
  export interface FusionAClassResult { rows: FusionAClassRow[]; previewDescription: string; headWindowWarn: boolean }
  export function computeFusionRows(input: {
    description: string;
    sections: Array<{ heading: string; lines: string[] }>;  // lines=refineForDescription(节原文) 后的行（与 description 同形）
    consumedHeadings: string[];
    carriers: FusionCarriers;
  }): FusionAClassResult
  export function applyStripping(description: string, rows: FusionAClassRow[], stripHeadings: string[]): string
  ```
- 判定规则（规格 §2 v2.2 逐条落地，全部钉测试）：
  1. `normLine(s)` = 去全部空白字符（`/\s+/g`→''）。节行非空且 `normLine` 后非空才参与判定。
  2. 行级承载 = 该行 `normLine` 后作为**子串**出现在五类 carrier 之一的 `normLine` 文本中（characters/outline/blueprint goals/foreshadowings/style_sources）。
  3. verdict：节内全部参与行承载 → `fully-carried`；部分 → `partially-carried`；零 → `not-carried` 且 `removable=false`。
  4. preset（规格 §4 裁决2）：`fully-carried` → `'strip'`；其余 → `'keep'`。标签行残段（如「**X**：一句话」类解析器有意跳过不成卡的行）天然不承载 → 落 `residualLines`（v2.2 残段保留钉）。
  5. **首标题行之前的行（H1 题名行 + 定位句 blockquote——主审对码修正 11-24：精炼文行 0 实为题名行，定位句 blockquote 的 `> ` 前缀保留、在其后）恒不可剥**：引擎段匹配天然不覆盖节外行，另加显式钉「节外行不入任何节 strippableLines」（N4 头窗保护，双保险）。
  6. `headWindowWarn` = 按当前 preset 合成的剥除稿前 90 字 ≠ 原前 90 字（planner task 简介头窗 ≈90 字，`config.ts:141` task=800 装配截断；规格 N4「首节即被消费须显式示警」）。
  7. `previewDescription` = `applyStripping(description, rows, rows.filter(preset==='strip' && removable).map(heading))`；**`applyStripping` 必须限段删除**（主审对码修正 11-24）：对每个所选 heading，先在 description 中定位其标题行（trim 全等，标题行在精炼文中保留——`settings-import.ts:121`，interim 实测 11 锚点全中可证），段尾=下一标题行（H2 或 H3，同法匹配）或文末；**只删该段内** `normLine` 命中该节 strippableLines 的行——防跨节同文本短行被全局集合误删（裸集合匹配会把别节相同行一并剥掉）。段外行一律逐字节保留。尾处理 `replace(/\n{3,}/g,'\n\n').trim()`（与 refine 尾处理同形，确定性钉）。
- Consumes：Task-01 `FusionAClassRowDto`（形状一致）；Task-04 路由组装 carriers 与 sections 调 `computeFusionRows`。

**步骤**
- [ ] 1. 核实步：读 `apps/server/src/settings-import.ts` splitDoc 定义，确认 `doc.sections` 元素含 `heading`+`lines`（不含标题行与否）、`doc.h3Blocks` 元素含 `heading`+`lines`（:446-447 用法已证）；splitCompendiumSections 按实核形态薄封装；若 sections[].lines 含标题行，则标题行随行匹配（标题行在 carrier 中不存在→天然 residual，安全侧，无需特判）。
- [ ] 2. settings-import.ts：`refineForDescription` 加 `export`（docblock 补「exported 供门引擎节级精炼同形，行为逐字节不变」）；新增 `splitCompendiumSections`。
- [ ] 3. parseSettingsCompendium 返回对象增 `consumedSections`：在 :494-542 五处 find 之后收集命中 heading（固定序 人物→大纲→矩阵→文风→H3 悬置逐个），引用既有局部变量（charactersSec 等若未具名则就地 `const` 化，不重复 find）。
- [ ] 4. settings-import.parse.test.ts 追加三例：`中性夹具 → consumedSections 钉值 toEqual([命中节标题…])`（按夹具实际命中节写精确值）、`无任何命中骨架（纯 H1+一段文字）→ consumedSections toEqual([])`、`含悬置 H3 → consumedSections 含该 H3 heading`。全文件重跑 → 既有断言全绿（冲击 #3 复核）。
- [ ] 5. 写 `fusion/engine.ts`（上方签名+七条规则；docblock 逐条注规格锚）。
- [ ] 6. 测试 `apps/server/test/fusion/engine.test.ts`（中性仿形夹具《示例之作》：一个 H2 人物节全量承载 + 一个 H2 规则节部分承载含标签行残段 + 一个 H2 场景节零承载；carrier 文本由夹具同步构造）：
  - `全量承载节 → verdict fully-carried、preset 'strip'、residualLines 空`
  - `部分承载节 → preset 'keep'、承载行入 strippableLines、标签行残段落 residualLines`（规格 v2.2 片段级钉，咬人输入②）
  - `零承载节 → verdict not-carried、removable false、strippableLines 空`（规格 §2「未被抽取=无承载→不可剥」钉）
  - `applyStripping 只删所选节承载行、残段与未选节逐字节保留；剥后 carriers 源文本不变`（N1 不回流钉）
  - `同一归一化文本行同时出现于所选节与未选节 → 只删所选节段内出现，未选节保行`（限段删除钉，主审对码修正①的回归证明）
  - `description 行 0 出现在承载匹配中 → 仍保留且不入 strippableLines`（N4）
  - `首节承载行落在前 90 字内 → headWindowWarn true；剥除不涉头窗 → false`
  - `同输入重跑两次 → rows/previewDescription 逐字节相等`（N3）
  - `consumedHeadings 未包含的节 → 不产行`（载体驱动：引擎只看清单，不做内容猜测）
- [ ] 7. `pnpm -F @inkforge/server exec vitest run test/fusion/engine.test.ts test/settings-import.parse.test.ts` → 全绿；`pnpm -F @inkforge/server exec vitest run test/http/settings-import.test.ts` → 全绿（冲击 #4 复核）；`pnpm lint` 零输出。

**验收**：consumedSections 三态钉值；引擎七规则各有具名用例；解析与 HTTP 既有钉值零回归。

---

## Task-03 LLM 张力对照端点（行协议 + 可见降级）

**目标**：POST 分析端点（无写）：输入=description+大纲产物+已绑与候选档案 rulesText/structure；输出张力对清单；沿 plannerProvider 测试缝；超时/解析失败→降级标记随响应返回。

**文件**
- Create `apps/server/src/fusion/tension.ts`
- Modify `apps/server/src/http/routes.ts`（`PUT /api/books/:bookId/spectrum` :1151-1161 之后插新端点）
- Modify `apps/server/src/http/schemas.ts`（空 body schema）
- Test Create `apps/server/test/fusion/tension.test.ts`
- Test Create `apps/server/test/http/fusion-gate.test.ts`（本任务建文件，analyze describe 段）

**接口**
- Produces（fusion/tension.ts）：
  ```ts
  export interface TensionRow { /* 同 shared TensionRowDto 五键 */ }
  /** 行协议（沿 LANDING 单行先例 prompts/render.ts:173）：
   *  TENSION: <条目> | <MD 侧> | <档案侧> | <性质: 拉扯|冗余|缺口> | <建议偏向> */
  export function buildTensionPrompt(args: {
    description: string; outline: string;
    boundStyles: Array<{ name: string; rulesText: string }>;
    boundPlanner: Array<{ kind: 'plot' | 'spectrum' | 'imitation'; name: string; structure: string }>;
    candidateStyles: Array<{ name: string; rulesText: string }>;
    candidatePlanner: Array<{ kind: 'plot' | 'spectrum' | 'imitation'; name: string; structure: string }>;
  }): string
  //   description/outline headExcerpt 2000 字；每 rulesText 800、structure 600、候选 rulesText/structure 400；
  //   bound+candidates 各列表 cap 8（超额截断并注明）；协议行+负约束前置（仿 renderBlueprintTask :160-179 结构）
  export function parseTensionRows(text: string): { rows: TensionRow[]; invalid: number }
  //   逐行匹配协议行；性质词不在枚举 → 该行丢弃 invalid++；rows cap 20
  ```
- Produces（routes.ts）：
  ```ts
  // POST /api/books/:bookId/fusion-gate/analyze（无写）
  // 404 守卫 → 组装 prompt 输入（bound=绑定现状：主辅档案 rules_json.rulesText + 三类已绑 structure；
  //   candidates=全局 style_profiles rules_json + 三类档案列表，各 cap 8）→
  //   state.plannerProvider ?? createRoleProvider(config, 'planner')（routes.ts:458 同缝）
  //   complete({ ..., timeoutMs: 120000, meta: { step: 'summarize' } }) → parseTensionRows
  // 成功：reply.send({ rows, degraded: false })
  // complete 抛错/超时 或 rows.length===0：reply.send({ rows: [], degraded: true, degradeReason: '...' })——恒 200，可见降级钉
  ```
- Consumes：Task-01 `TensionRowDto`；Task-05 门 UI 消费响应（degraded=true → 横幅）。

**步骤**
- [ ] 1. 写 `fusion/tension.ts`（buildTensionPrompt 截断常量模块内定值，**不动 config**——冲击 #7 存证；parseTensionRows 纯函数）。
- [ ] 2. tension.test.ts 追加（canned 文本自造，性质三值各 ≥1）：
  - `三行合法协议 → rows 钉值五键逐项`、`性质词非法行 → 丢弃且 invalid 恰 1`、`rows 超 20 → 截断 20`、`prompt 含负约束行与描述/大纲/已绑/候选四段标记`、`超长 description → prompt 中被截至 2000 字+省略号`。
- [ ] 3. routes.ts 插 analyze 端点（见接口；schemas.ts 增 `fusionGateAnalyzeSchema = z.object({}).optional()`——不收字段，全部服务端取数）。
- [ ] 4. `apps/server/test/http/fusion-gate.test.ts` 建 analyze describe（buildApp+openDb 临时目录，`plannerProvider` 缝形态沿 blueprint-suggest.test.ts:40-44）：
  - `planner mock 输出两行合法协议 → 200 { rows 钉值, degraded: false }`
  - `planner mock 输出垃圾文 → 200 { rows: [], degraded: true, degradeReason 非空 }`（可见降级断言）
  - `planner mock complete 抛错 → 200 degraded: true`（降级不 500/不阻断，规格 §3.5 钉2）
  - `无绑无候选空书 → 200 { rows: [], degraded: true }`（无对照面即降级，诚实呈现）
- [ ] 5. `pnpm -F @inkforge/server exec vitest run test/fusion/tension.test.ts test/http/fusion-gate.test.ts` → 全绿；`pnpm lint` 零输出。

**验收**：行协议三性质 canned 钉值；超时/垃圾→200+degraded:true（可见降级）；候选 cap 与截断定值生效；config 零改动。

---

## Task-04 GET gate 直通判定 + POST confirm 单事务批量写

**目标**：门状态判定（指纹未变直通）与批量确认端点：所有库内写包进**单一 better-sqlite3 事务**（天然无半写、失败中止）；run 入队仍由前端在 confirm 200 后走既有 runs 端点；取消=零写零指纹更新。

**文件**
- Create `apps/server/src/fusion/apply.ts`
- Modify `apps/server/src/http/routes.ts`（GET gate 插在 Task-03 analyze 端点旁；confirm 紧随）
- Modify `apps/server/src/http/schemas.ts`（confirmBody schema）
- Test Modify `apps/server/test/http/fusion-gate.test.ts`（gate/confirm describe 段）

**接口**
- Produces（fusion/apply.ts）：
  ```ts
  export interface ConfirmDecisions { /* 同 shared FusionGateConfirmBody（undefined=不动） */ }
  export interface ConfirmOutcome { results: FusionGateConfirmResult['results']; fingerprint: string; fingerprintStored: boolean }
  /** 单事务批量写；profile 存在性校验在事务体内（抛错即全回滚）；gen_gate 指纹写在事务提交后（写失败不吞——
   *  返回 fingerprintStored:false，宁重弹不误直通）；description 写恒最先（故障注入断言锚点） */
  export function applyFusionConfirm(db: Database, bookId: string, decisions: ConfirmDecisions, face: InjectionFace): ConfirmOutcome
  //   description: updateBookMeta(db, bookId, { description })（books.ts:241）
  //   styleBinding: 逐 id SELECT style_profiles 存在性（缺→throw）→ buildStyleBundle → setBookStyleBinding(db, bookId, binding, JSON.stringify(bundle))
  //     ——与 PUT /style routes.ts:836-853 同构复用（写入口一致性钉）；face.styleBinding 取写后 getBookStyleBinding
  //   plot/spectrum/imitation: 逐 id 存在性（缺→throw）→ setBookPlotProfile/setBookSpectrumProfile/setBookImitation（books.ts:216/225/207）
  ```
- Produces（routes.ts）：
  ```ts
  // GET /api/books/:bookId/fusion-gate（无写）
  //   404 守卫 → face 组装（book.description + getBookStyleBinding + styleFewshotOn + styleSnapshotJson + 三 profile 列）
  //   fingerprint = injectionFaceFingerprint(face)
  //   stored = parseGenGate(book.genGateJson)；stored && stored.fingerprint === fingerprint → reply { action:'pass', fingerprint }
  //   否则 show：归档存在（path.join(config.dataDir,'imports',`${bookId}-settings.md)`，routes.ts:313 同源）→
  //     raw=读档 → splitCompendiumSections + parseSettingsCompendium(raw).consumedSections →
  //     sections 精炼行=refineForDescription(sec.lines.join('\n')).split('\n')（h3 块同法）→
  //     carriers 组装（listCharacters :103 / book.outline / listChapters 蓝图 goal / listForeshadowings continuity.ts:70 /
  //     style_sources.text 按 bound profile source_hash，routes.ts:1008 同源）→ computeFusionRows →
  //     reply { action:'show', fingerprint, aClass: rows, previewDescription, headWindowWarn, hasArchive: true, binding: {...} }
  //   无归档 → aClass: []、hasArchive: false（A 类行空，门仍有绑定快照+张力，规格泛型：非 MD 书也过门）
  // POST /api/books/:bookId/fusion-gate/confirm
  //   404 守卫 → zod confirm schema（styleBinding 四键必填校验沿 styleBindSchema :64 语义；weights 键集/Σ=100 校验复用既有 zod 规则）→
  //   try applyFusionConfirm → 200 { results, fingerprint }；catch → 400 { error: message }（事务已回滚=零半写）
  ```
- Consumes：Task-01 fingerprint/repo/DTO；Task-02 engine/解析导出；Task-03 无（analyze 独立）。

**步骤**
- [ ] 1. 核实步：读 `books.ts:241` updateBookMeta patch 语义（description 键名）与 `styleBindSchema`（schemas.ts:64-90）weights 校验规则，confirm schema 沿抄同规则（键集/Σ=100/辅档不重复），不另造口径。
- [ ] 2. 写 `fusion/apply.ts`（上方签名；`db.transaction` 体按 description→styleBinding→三类顺序；存在性校验全在体内；事务后 `updateGenGate` + `fingerprintStored`）。
- [ ] 3. routes.ts 加 GET gate（见接口；GET book :371-379 响应剥 `genGateJson` 键——沿 landingMandateJson :376-378 先例，解构 void）。
- [ ] 4. routes.ts 加 POST confirm（见接口）。
- [ ] 5. fusion-gate.test.ts 建 gate/confirm describe（夹具：openDb 临时库+buildApp；两本书——「归档书」写 imports 归档中性仿形 MD 后 apply 流程不可用则直接 createBook+写归档文件+手工建 characters/outline/伏笔/绑定行；「素书」无归档）：
  - `GET 首次（无 gen_gate 记录）→ action 'show'、aClass 按夹具钉值（一 fully/一 partial/一 not）、headWindowWarn 按夹具`（门三态之一：首次弹出）
  - `confirm 全「保持」（body 仅 {}）→ 200、各 'skipped'、库内 description/绑定逐字节不变（回读钉）、fingerprint 已记 → 再 GET → action 'pass'`（直通钉+回归钉「全保持=现状」）
  - `confirm 带剥节 description（前端用 GET previewDescription 或 applyStripping 产物）→ description 生效、characters/outline/伏笔/chapters 骨架/landingMandate 逐字节不变`（N1/R6 回归钉）
  - `故障注入：confirm styleBinding.primaryProfileId='不存在' → 400、description 未变（事务回滚=无半写）、gen_gate 未记 → 再 GET 仍 'show'`（N5 钉；description 写在最先=回滚覆盖锚点）
  - `confirm 200 后不调 runs 端点即无 run 行（测试内查 runsRepo listRunsByBook 为空）——run 入队归前端（前端测试 Task-05 钉 confirm 200 才发 run）`（中止不入队钉）
  - `取消路径：GET show 后**不调** confirm 直接再 GET → 仍 'show'`（取消零写零指纹→下次必重弹，咬人输入③）
  - `confirm { suppress: true }（零其他裁决）→ gen_gate 记 suppressed:true + 指纹 → GET 'pass'；随后经既有 PUT /api/books/:id/style 改 weights → 注入面变 → 再 GET 'show'`（变化重弹钉+门三态全走通）
  - `素书 GET → hasArchive:false、aClass:[]、action 'show'`（咬人输入①：无归档书）
  - `gen_gate_json 被外部写坏（直 SQL 置 'not-json'）→ GET 不抛、按无记录 'show'`（容错钉）
  - 冲击复核：`GET /api/books/:id` 既有响应形态用例（api.test.ts 相关）全绿（冲击 #9）。
- [ ] 6. `pnpm -F @inkforge/server exec vitest run test/http/fusion-gate.test.ts test/http/style.test.ts test/http/style-snapshot.test.ts` → 全绿；`pnpm lint` 零输出。

**验收**：单事务全写/全滚钉值；指纹直通-重弹-suppress 三态闭环；N1/R6 回归钉；既有 style 端点零回归。

---

## Task-05 web 门组件 + 5 个 run 发起点接入

**目标**：对话框门挂全部生成/续写发起点；行渲染按机制诚实选项；降级横幅；直通逻辑；confirm 200 才发 run；取消零写；「不再提示」checkbox。

**文件**
- Modify `apps/web/src/api/client.ts`（新三方法，:192 createRun 邻域）
- Create `apps/web/src/components/FusionGateDialog.tsx`
- Create `apps/web/src/fusionGate.ts`（`startRunWithGate` helper）
- Modify `apps/web/src/pages/BookDetailPage.tsx`（4 接入点：:643 整书生成 / :945 章行内生成 / :1009 生成本章 / :1012 发起续写）
- Modify `apps/web/src/pages/NewBookIdeaPage.tsx`（:115-127 launch 接入）
- Test Create `apps/web/src/components/FusionGateDialog.test.tsx`
- Test Modify `apps/web/src/pages/BookDetailPage.test.tsx`、`apps/web/src/pages/NewBookIdeaPage.test.tsx`

**接口**
- Produces（client.ts）：
  ```ts
  getFusionGate: (bookId: string) => req<FusionGateReportDto>(`/api/books/${bookId}/fusion-gate`),
  analyzeFusionGate: (bookId: string) => req<FusionTensionDto>(`/api/books/${bookId}/fusion-gate/analyze`, { method: 'POST', body: '{}' }),
  confirmFusionGate: (bookId: string, body: FusionGateConfirmBody) => req<FusionGateConfirmResult>(`/api/books/${bookId}/fusion-gate/confirm`, { method: 'POST', body: JSON.stringify(body) }),
  ```
- Produces（fusionGate.ts）：
  ```ts
  /** 门接入唯一入口：直通→直接 startFn；否则打开门。**startFn 必须是「发 run」的闭包**（内部调 api.generateChapter /
   *  generateAll / createRun 原方法，不得预发）。confirm 200 → startFn()；confirm 非 200 / 取消 → 不调 startFn（中止不入队） */
  export function startRunWithGate(bookId: string, startFn: () => Promise<void>, mount: GateMount): Promise<void>
  ```
- Produces（FusionGateDialog.tsx，对话框形态）：props=`{ report: FusionGateReportDto; tension?: FusionTensionDto; analyzing: boolean; busy: boolean; onConfirm(body: FusionGateConfirmBody): void; onCancel(): void }`；内部 state=逐行裁决草稿（A 类行剥/留 checkbox 预置 preset、不可剥行禁用；style 快照行=权重滑条/维归属 select/「剥 MD 文本」/保持四选；planner 三行=绑/不绑 radio+附注「大纲卡落地格恒优先，档案只作参考」；fewshot 只读文本展示 on/off）；`tension.degraded===true` → 顶部横幅「本次未做张力对照」（可见降级钉）；分析中显示加载位；底部 `checkbox aria-label="不再提示（当前注入面不变时）"` + 按钮 `确认并开始生成` / `取消`。
- Consumes：Task-01 全部 DTO；Task-04 端点契约。

**步骤**
- [ ] 1. client.ts 三方法（类型从 `@inkforge/shared` 导入）。
- [ ] 2. 写 FusionGateDialog.tsx。**剥 MD 的 MVP 简化钉死**（组件 docblock 同文）：前端零引擎逻辑，剥后文本**唯一来源=服务端 `report.previewDescription`**（=preset 集合的剥除稿）；用户在某 preset='strip' 行勾「剥 MD 文本」→ confirm body 传 `description: report.previewDescription`；用户把该行改回「保持」→ **不传 description 键**（不启剥）；多节逐行混合勾选超出 MVP，界面在该行下注明「逐节剥除组合请用书籍设置世界观框手改」。其余选项映射：保持=不动 styleBinding；权重滑条/维归属=按快照现状主/辅 id 组 `styleBinding` 对象；planner 行绑/不绑=`plotProfileId` 等三键 string|null。
- [ ] 3. 写 fusionGate.ts（见接口）。
- [ ] 4. BookDetailPage 4 接入点：onClick 换 `startRunWithGate(bookId, 原闭包, mount)`（原 generateAll/generate/startContinue/行内 lambda 闭包原样传入；maxRounds/chapterNo 捕获不变）。
- [ ] 5. NewBookIdeaPage :115-127 launch 同法接入（startFn=createRun+navigate 闭包）。
- [ ] 6. FusionGateDialog.test.tsx：
  - `show 报告 → 三段行渲染钉值（A 类预设勾选态/planner 行附注文案「大纲卡落地格恒优先，档案只作参考」/fewshot 只读无控件）`
  - `tension.degraded=true → 横幅文案「本次未做张力对照」`；`analyzing → 加载位`
  - `勾「不再提示」+确认 → onConfirm body 钉 { suppress: true, ...裁决 }`
  - `不可剥行（removable false）→ 剥控件禁用`
  - `取消 → onConfirm 未调用`
- [ ] 7. BookDetailPage.test.tsx 随迁（冲击 #5）：:288 与 :520-571 三处用例 fetch stub 表补 `GET /fusion-gate → { action:'pass', ... }`，既有 run 端点断言逐字保留；新增一例：`stub gate → show + confirm → 断言 confirm 请求 body 后才见 runs 端点请求（fetch 调用顺序断言）`。
- [ ] 8. NewBookIdeaPage.test.tsx 随迁同型 stub（冲击 #6）。
- [ ] 9. `pnpm -F @inkforge/web test` → 全绿（web 基线 156 不减）；`pnpm -F @inkforge/web build` 冒烟过；`pnpm lint` 零输出；提交信息注明「GUI 未验证（owner 真实测试）」。

**验收**：5 接入点全部走门；直通零打扰；降级横幅可见；confirm 非 200 不发 run（顺序断言）；既有 web 用例零回归（仅 stub 随迁）。

**GUI 未验证（owner 真实测试）点位（规格 §6）**：门分页三态（首次生成弹出/无变化直通/变化重弹）、张力行偏向操作、可见降级横幅、取消后再生成必重弹、失败中止回显、书级不再提示。

---

## Task-06 验证链收口

**步骤**
- [ ] 1. `pnpm lint` → 零输出。
- [ ] 2. `pnpm typecheck` → 全 workspace 0 错。
- [ ] 3. 定向回归包：`pnpm -F @inkforge/server exec vitest run test/fusion/fingerprint.test.ts test/fusion/engine.test.ts test/fusion/tension.test.ts test/http/fusion-gate.test.ts test/settings-import.parse.test.ts test/http/settings-import.test.ts test/db/migrate.test.ts test/db/repositories.test.ts` → 全绿。
- [ ] 4. `pnpm test` → 逐包计数：server ≥ 506+新增、web ≥ 156+新增、shared ≥ 2+新增（0.2.3 存证基线 664 只增不减；终值执行时主审实测填）。
- [ ] 5. `pnpm deadcode` → 零新增告警（新导出 injectionFaceFingerprint/parseGenGate/updateGenGate/splitCompendiumSections/refineForDescription/computeFusionRows/applyStripping/buildTensionPrompt/parseTensionRows/applyFusionConfirm/shared fusion 类型均有消费方；knip 误报按既有豁免形态处理并提交正文说明）。
- [ ] 6. diff 安全扫：`git diff` 逐文件过目——零秘密、零词表原文、零 `apps/server/data/**` 改动；NSIS 0015 两处（File/Delete）在 diff 中确认；migrate/open 随迁仅数字与 DDL 行。
- [ ] 7. 提交（Conventional 前缀+中文，正文 `verify:` 全链结果 + `Refs:` 规格文件名；只 commit 不 push）；完成通知附：基线终账、GUI 未验证声明、门行为翻转说明（首次弹出/直通/重弹三态 + 故障注入回滚证明）。

---

## 五类咬人输入 → 测试映射（全覆盖核对）

| 咬人输入 | 钉死行为 | 测试位置 |
|---|---|---|
| ① 无归档书 / gen_gate_json 坏 JSON | gate 仍 show（aClass 空）；parseGenGate null 容错不抛 | Task-04 步骤 5 素书用例 + 坏 JSON 用例；Task-01 步骤 13 |
| ② 标签行残段（粗体冒号行解析器跳过不成卡） | 残段不承载 → residualLines 保留、applyStripping 不删 | Task-02 步骤 6 部分承载用例 + N1 用例 |
| ③ 取消（show 后不 confirm） | 零写、指纹不更新 → 再 GET 仍 show（必重弹） | Task-04 步骤 5 取消用例 |
| ④ LLM 超时/垃圾输出/空对照面 | 200 + degraded:true + degradeReason（可见降级，不阻断确认） | Task-03 步骤 4 三例降级用例 + Task-05 横幅用例 |
| ⑤ confirm 内单点失败（不存在档案 id） | 单事务回滚=无半写、gen_gate 不记、前端不发 run | Task-04 故障注入用例 + Task-05 顺序断言用例 |

## 自审五查

1. **规格覆盖**：门形态五步（§3.5）——引擎 A 类+绑定快照（Task-02/04）、LLM 张力对照行协议+降级不阻断（Task-03）、确认分页按机制诚实选项含 planner 附注与 fewshot 只读（Task-05）、确认=单事务批量写既有端点语义+confirm 200 后前端发 run（Task-04/05）、不再提示书级开关（Task-01 列+Task-04 suppress+Task-05 checkbox）。门四钉——指纹哈希注入面/取消必重弹/mandate 词表不入（Task-01）、可见降级（Task-03/05）、批量中止不入队+故障注入（Task-04/05）、写入口一致性复用 repo（Task-04）。泛型原则 §2——载体驱动无节表、片段级判定残段保留（Task-02 七规则）、N1 不回流（engine 用例+Task-04 回归钉）、N3 确定性（consumedSections 重解析同源+fingerprint/engine 重跑钉）、N4 头窗（行 0 保护+headWindowWarn）。MVP 边界 §4 D 裁定——不含 fewshot 管理（只读）、词表、mandate 建议、LLM 改写、向导内嵌（P1 未做）。验收口径 §6 七条各对应具名用例（引擎双夹具型/张力三性质/HTTP 全确认/故障注入/注入重放——剥节后 description 变短由 Task-04 N1 用例覆盖、其余槽不变同例钉/三态 GUI 点位列 Task-05）。——**覆盖完整**。
2. **步骤唯一性**：每步一个动作+可核对结果（命令+用例名+断言钉值/精确签名+落点行号），无 TBD；剥 MD 行的 MVP 简化单一决策钉死（Task-05 步骤 2，前端零引擎）；不确定处（splitDoc 字段形态、单文件基线数、open.test 命中面）均给「核实步+随迁规则+执行时主审实测填」，非空话。——**通过**。
3. **类型一致**：全部跨端 DTO 单点定义于 `packages/shared/src/fusion.ts`；confirm body 与 zod schema、apply.ts 入参、client.ts 类型三层同源；引擎 `FusionAClassRow` 与 DTO 五键一致；`InjectionFace` 七键与 GET gate 组装面逐一对应且注释钉死排除 mandate/词表；gen_gate 存储 `{fingerprint,suppressed,updatedAt}` 沿指令倾向 books 加列（0015，hy4 禁入已标注）。——**通过**。
4. **咬人输入**：五类全部具名测试（见上表），另加指纹七要素敏感性与重蒸直通（Task-01 步骤 12）。——**通过**。
5. **比例**：预计净增代码 ~600 行（server fusion 模块 ~350、routes/schemas/repo/settings-import ~120、shared ~80、web ~250）+ 测试 ~700 行 + migration/NSIS ~10 行；计划 6 任务均独立可测可评审（基座/引擎/张力/端点/UI/收口）；计划篇幅约为代码预期量级，无抄代码段（引用均为签名与规则清单）。——**通过**。
