# 实现计划：书级落地策略（landing mandate）+ planner 落地格槽

> **目标：** 落实 DEC-2026-1122-01 双层防线——层①书级落地策略（books.landing_mandate_json + 合成节拍注入 + l0 最小牙放宽 + 空关键词渲染跳过 + 书籍设置 UI + 导入提示），层② blueprint-suggest planner 协议强制【LANDING】落地格行（校验→有限重试→降级不 500）。根因：卷级大纲书 mustHaveBeats=[] → beat_coverage 空集恒绿 → 成品无 H。
> **架构：** 合成节拍在 queue 拾章后、runChapterPipeline 前**持久化**进 chapters.blueprint_json（drafter 与 QC 两消费方同源，critic 条件1）；BeatRequirement.source 标志把 l0 放宽严格限制在 mandate 条目（critic 条件4）；卡源条目旧语义一字不动（DEC-2026-1120-10 既有钉值全保留）。
> **规格：** docs/decision-log.md `DEC-2026-1122-01`（真值源，2026-11-22）。前序依赖：DEC-2026-1120-10（落地格/分级词表/beat_coverage AND 层）、DEC-2026-1121-01（测试基线 575）。

## 全局约束

1. **测试基线只增不减**：全量基线 server 429 + web 144 + shared 2 = **575**（DEC-2026-1121-01 留痕）。执行者先复跑 `pnpm test` 确认起点，收口时逐包计数 ≥ 基线；既有用例只许新增钉值，禁删禁改断言（冲击清单逐条复核仍绿）。
2. **验证链硬序**：静态（`pnpm lint` 零输出）→ 定向测试 → 全量 `pnpm test` → typecheck（`pnpm typecheck` 全 workspace 0 错）→ knip（`pnpm deadcode` 零新增导出告警）。任一环失败即停。
3. **GUI 未验证（owner 真实测试）**：Task-04 的两处 web 控件（设置导入勾选、书籍详情落地策略下拉）vitest 过≠GUI 过，提交信息注明「GUI 未验证（owner 真实测试）」。
4. **NSIS 模板同步**：新增迁移 `0014_landing_mandate.sql` 必须同步 `apps/desktop/src-tauri/nsis/inkforge-installer.nsi`（File 安装行 + Delete 卸载行，锚点见 Task-01），此为 DEC 拍板的高危项（快照 hazard），漏同步=桌面端装包缺迁移致新库建不出 books 新列。
5. **执行通道**：hy4 窗口内非禁入执行卡全裁 hy4（owner 口径）；执行者只 commit 不 push。
6. **1301 内容过滤纪律**：本计划与执行过程不得读取 `apps/server/config/quality/landing-words.default.txt`、`apps/server/data/**`、`apps/web/src` 下 `*.db`/文本样本；词表机制按 l0.ts:38-70 的 `[H]/[L]` 分节装载器抽象理解，测试夹具自造中性词（如「玉佩」「窗棂」），绝不引用真实词表原文。
7. **设计红线**：合成节拍措辞不得承诺「任意连续两章必现一重」（critic 条件3——卡章 L 与合成章 L 可相邻）；禁止读取 description 做结构化提取（DEC 否决项）；导入 apply 不自动猜 mandate，仅显式勾选写入。

## 冲击清单（既有钉值用例，逐条复核）

| # | 文件:用例 | 钉住的旧语义 | 本计划影响 | 处置 |
|---|---|---|---|---|
| 1 | apps/server/test/quality/l0.test.ts:179 `L0 beat_coverage 分级词表 AND 层（DEC-2026-1120-10）`（含 :218 `④ 无 grade 旧条目…逐字节同形`） | 卡源条目 keywords OR ∧ 词表 AND；无 grade 只走 OR | l0 改动仅在 `source==='mandate' && keywords.length===0` 分支，卡条目路径不变 | Task-02 步骤复核全绿 |
| 2 | apps/server/test/quality/l0.test.ts:78 `beat_coverage：缺关键词 fail；补齐后 pass` | 无 grade 条目 OR 层 | 同上，不进 mandate 分支 | Task-02 复核 |
| 3 | apps/server/test/prompts/contract.test.ts:54 `renderDraft：带 grade 必含节拍显示落地分级提示` | keywords 非空渲染 `（须出现关键词：…）` | 只加空 keywords 跳过分支，非空分支文本逐字节不变 | Task-02 复核 |
| 4 | apps/server/test/pipeline/chapter.test.ts:477-529 `Task-03 rewrite 落地保全 + task 尾部摘要块`（:484/:497/:507 三例） | renderTaskSummaryBlock 尾部块形态 `· X（场景一）（落地·H级须显性词）（须出现关键词：场景一、房东）`；无节拍章零污染 | 空关键词跳过仅影响 keywords=[] 条目；夹具均带关键词 | Task-02 复核 |
| 5 | apps/server/test/pipeline/continue.test.ts:143 `continue：带 grade 必含节拍在 task 尾部注入硬要求块与文风铁则` | 同 4 | 同 4 | Task-02 复核 |
| 6 | apps/server/test/http/blueprint-suggest.test.ts:54 `命中章…确定性带落地格 mustHaveBeats（含 grade）` | 卡叠加后 mustHaveBeats toEqual 单条卡条目 | **主审裁决修正**：卡有章不要求模型 LANDING→无重试无 warnings，plannerCalls 与 toEqual 原样不变；:64 无卡章（chapterNo=9）有 LANDING 期望→mock 无 LANDING→重试 1 次→降级丢弃+warning，响应仍 200，末次调用断言与 toEqual([]) 均不变（该文件无 plannerCalls 计数与 warnings 缺席断言，实测核过） | Task-03 步骤复核 |
| 7 | apps/server/test/http/blueprint-suggest.test.ts:112/122 `PUT blueprint 保存保留既有 mustHaveBeats` 两例 | PUT 并集去重键=text trim 全等、预填 grade 存活、永不删 | PUT 端点零改动 | 无影响 |
| 8 | apps/server/test/http/settings-import.test.ts:317 `逐章表+重叠区间 → …钉值，无关键词落地格 fail-open warning` | apply warnings 数组与章骨架钉值 | 预览警示条件=全书 0 落地格∧description 含「分级制」；该夹具有落地格→不触发 | Task-02 复核 |
| 9 | apps/server/test/http/settings-import.test.ts:127/154/192/205 `中性夹具→warnings toEqual([])`、`事务建书…warnings []`、`文风节<200字…`、`importStyle=false` | warnings 精确钉值 | 需核实夹具 description 不含「分级制」三字（Task-02 有专步）；含则警示会破 3 处 `toEqual([])` | Task-02 核实步 |
| 10 | apps/server/test/prompts/contract.test.ts:86/96 `parseBlueprint：合格文样往返`、`缺 GOAL → errors…` | 无 LANDING 行样例 errors/beats 形态 | parseBlueprint 新增 landingRaw/landingErrors 字段，缺 LANDING 时 landingErrors=[]、不进 errors（LANDING 缺行不算解析错），解构断言不受影响 | Task-03 复核 |
| 11 | apps/server/test/http/api.test.ts:86 `zod 非法 body 400；未知 id 404` | bookMetaPutSchema 既有校验 | 新字段可选，旧 payload 不变 | Task-01 复核 |
| 12 | apps/server/test/worker/queue.test.ts:77-160 场景一~四 | 无 mandate 书的 run 行为 | ensureMandateBeat 对 off 书零写入（无变化即不落库） | Task-02 复核 |
| 13 | apps/server/test/db/migrate.test.ts:33/88/100/135/158/196 `user_version=13` 六处 + 回拨夹具 :51-68 等四处增量物清单 | 末迁移号钉 13；夹具 DROP 清单=0003-0013 | 0014 入列必破（执行期停手裁决=主审 2026-11-22 批准随迁钉值更新） | Task-01 步骤 7 随迁更新+提交正文列条 |

---

## Task-01 基座：shared 类型 + migration 0014 + books repo + meta 端点校验

**目标**：类型、存储、HTTP 校验三件套落地；null/非法输入全部有钉死行为；NSIS 同步。

**文件**
- Create `packages/shared/src/mandate.ts`
- Modify `packages/shared/src/index.ts:1-3`（追加 `export * from './mandate';`）
- Modify `packages/shared/src/domain.ts:23-28`（BeatRequirement 加 source）
- Modify `packages/shared/src/api.ts:8-22`（BookDto）、`:185-189`（BookMetaPutBody）、`:538-541`（SettingsImportApplyBody）
- Create `apps/server/src/db/migrations/0014_landing_mandate.sql`
- Modify `apps/server/src/db/repositories/books.ts:4-45`（Book/BookRow/toBook）、`:222-242`（updateBookMeta）
- Modify `apps/server/src/http/schemas.ts:11-15`（bookMetaPutSchema）、`:290-337`（settingsImportApplySchema）
- Modify `apps/server/src/http/routes.ts:134-141`（PUT /meta）、`:363-368`（GET book）
- Modify `apps/desktop/src-tauri/nsis/inkforge-installer.nsi`（:1512-1524 File 节尾加 0014 行；:5369 起 Delete 节加 0014 行；仿 0013 行形态）
- Test Create `apps/server/test/http/landing-mandate.test.ts`
- Test Modify `apps/server/test/db/repositories.test.ts`（追加 describe）

**接口**
- Produces（shared/src/mandate.ts）：
  ```ts
  export interface LandingMandate { mode: 'off' | 'cadence'; heavyEveryN?: number }
  /** DB 容错读取：null/''/非法 JSON/mode 非法 → null（=off）；heavyEveryN 非正整数 → 2 */
  export function parseLandingMandate(raw: string | null | undefined): LandingMandate | null
  ```
- Produces（domain.ts）：`BeatRequirement.source?: 'card' | 'mandate'`（缺省=旧条目，JSON.parse 往返透传）
- Produces（books repo）：`Book.landingMandateJson: string | null`；`updateBookMeta(db, bookId, patch: { title?; description?; outline?; landingMandate?: LandingMandate | null })`——三态：undefined=不动、null=清空、对象=写 `JSON.stringify({mode, heavyEveryN})`（cadence 时 heavyEveryN 缺省归一 2、mode off 时只存 `{"mode":"off"}`）
- Consumes：Task-04 消费 `landingMandate` 三态与 schema 400 行为；Task-02 消费 `parseLandingMandate`。

**步骤**
- [ ] 1. `pnpm -F @inkforge/server exec vitest run test/db/repositories.test.ts` → 全绿记下用例数（基线锚）。
- [ ] 2. 写 `packages/shared/src/mandate.ts`：按上方签名实现 `parseLandingMandate`（try/catch JSON.parse；`mode==='cadence'` 才返回对象，heavyEveryN 用 `Number.isInteger(n) && n>=2 ? n : 2`）。
- [ ] 3. index.ts 追加导出；domain.ts BeatRequirement 加 `source?: 'card' | 'mandate'`（注释注明：mandate=书级落地策略合成，l0 放宽仅对此生效）。
- [ ] 4. api.ts 三处 DTO 扩展：BookDto `landingMandate?: LandingMandate | null`；BookMetaPutBody 同形；SettingsImportApplyBody 加 `landingMandate?: { enabled: boolean; heavyEveryN?: number }`。
- [ ] 5. `pnpm -F @inkforge/shared test` → 全绿（shared 基线 2 不减）。
- [ ] 6. 建 `0014_landing_mandate.sql`：一行 `ALTER TABLE books ADD COLUMN landing_mandate_json TEXT;`，头注释写明 DEC-2026-1122-01 与回滚句（仿 0013 第 3 行：`ALTER TABLE books DROP COLUMN landing_mandate_json;` user_version 不回退）。
- [ ] 7. `pnpm -F @inkforge/server exec vitest run test/db/migrate.test.ts` → 全绿（**主审裁决 2026-11-22**：0014 入列须随迁钉值更新——既有 6 处 `user_version` 13→14（:33/88/100/135/158/196，沿 0012/0013 入列钉值更新惯例）+ 4 个回拨夹具各补一行 `ALTER TABLE books DROP COLUMN landing_mandate_json;`（沿该文件 :55-68 既有 books 增量列 DROP 形态）；此两类=随迁更新非改断言语义，提交正文逐条列出）
- [ ] 8. books.ts：BookRow 加 `landing_mandate_json: string | null`；Book 加 `landingMandateJson: string | null`；toBook 映射；updateBookMeta patch 加 landingMandate 三态（写库 `landing_mandate_json = ?`，归一规则见接口；SQL 沿 :222-242 现形态扩列）。
- [ ] 9. schemas.ts：bookMetaPutSchema 加 `landingMandate: z.object({ mode: z.enum(['off','cadence']), heavyEveryN: z.number().int().min(2).optional() }).nullable().optional()`（无上限 max——超大 int≥2 合法入库，语义=章号难达倍数→合成恒 L，属可接受配置；0/1/负数/非整数→400）；settingsImportApplySchema 加 body 级 `landingMandate: z.object({ enabled: z.boolean().default(false), heavyEveryN: z.number().int().min(2).default(2) }).default({ enabled: false, heavyEveryN: 2 })`。
- [ ] 10. routes.ts PUT /meta（:134-141）：body 透传 updateBookMeta（landingMandate 已在 body 内）；GET book（:363-368）：响应在 `{...book}` 上覆盖 `landingMandate: parseLandingMandate(book.landingMandateJson)` 并删去 `landingMandateJson` 键（不向客户端泄漏原始 JSON 串）。
- [ ] 11. 测试 `apps/server/test/http/landing-mandate.test.ts`（buildApp+openDb 临时目录，仿 blueprint-suggest.test.ts beforeAll 形态），用例：
  - `PUT meta cadence+heavyEveryN=3 → 200，GET 回 {mode:'cadence',heavyEveryN:3}`
  - `PUT meta {mode:'off'} → 200，GET 回 {mode:'off'}`（入库 `{"mode":"off"}`，无 heavyEveryN 键）
  - `PUT meta landingMandate=null → 200，GET 回 landingMandate:null`
  - `PUT meta heavyEveryN=0 / 1 / -2 / 1.5 → 各 400`（4 断言；error 文案含 heavyEveryN）
  - `PUT meta mode:'daily' → 400`
  - `PUT meta 不带 landingMandate → 既有 title/description 更新不受影响`（冲击清单 #11 回归）
  - `PUT blueprint 传入 text 与库内〔书级落地策略〕前缀条目 trim 全等的节拍 → 并集去重保留库内条目，条目数不增`（先 upsertBlueprint 注入带前缀+source:'mandate' 条目，再 PUT 同 text 用户变体，钉 `savedBeats()[0].source === 'mandate'`）
- [ ] 12. repositories.test.ts 追加：`updateBookMeta landingMandate 三态往返（undefined 不动/null 清空/对象归一 heavyEveryN=2 缺省）`。
- [ ] 13. NSIS：installer.nsi :1524 后加 `File /a "/oname=resources\server\db\migrations\0014_landing_mandate.sql" "I:\inkforge\apps\desktop\src-tauri\resources\server\db\migrations\0014_landing_mandate.sql"`；Delete 节仿 0013 行加 `Delete "$INSTDIR\resources\server\db\migrations\0014_landing_mandate.sql"`；同步复制该 sql 到 `apps/desktop/src-tauri/resources/server/db/migrations/`（对齐 :1512 的源路径树）。
- [ ] 14. `pnpm -F @inkforge/server exec vitest run test/http/landing-mandate.test.ts test/db/repositories.test.ts` → 全绿；`pnpm lint` 零输出。

**验收**：以上测试全绿；`curl`/inject 层面非法 heavyEveryN 400、合法三态往返钉值成立；migration 幂等（migrate.test 绿）。

---

## Task-02 层①运行时：合成节拍 + queue 持久化注入 + l0 最小牙 + 渲染跳过 + 预览警示

**目标**：cadence 书在生成前拿到确定性落地节拍；QC 对 mandate 条目按最小牙判定并归因；prompt 不再渲染空关键词行；导入预览给勾选提示。

**文件**
- Create `apps/server/src/pipeline/mandate.ts`
- Modify `apps/server/src/worker/queue.ts:80-83`（resume 门后、runChapterPipeline 前注入）
- Modify `apps/server/src/quality/l0.ts:191-203`（beat_coverage）
- Modify `apps/server/src/prompts/render.ts:22`（renderDraft 必含节拍行）、`:92-107`（renderTaskSummaryBlock）
- Modify `apps/server/src/settings-import.ts:507-531`（parseSettingsCompendium 警示，插在 outline 预算警示后、章级蓝图预填前）
- Test Create `apps/server/test/pipeline/mandate.test.ts`
- Test Modify `apps/server/test/quality/l0.test.ts`、`apps/server/test/prompts/contract.test.ts`、`apps/server/test/settings-import.parse.test.ts`

**接口**
- Produces（pipeline/mandate.ts）：
  ```ts
  export const MANDATE_TEXT_PREFIX = '〔书级落地策略〕';
  export function synthesizeMandateBeat(chapterNo: number, mandate: LandingMandate): BeatRequirement
  //   heavyEveryN = mandate.heavyEveryN ?? 2；grade = chapterNo % heavyEveryN === 0 ? 'H' : 'L'
  //   text：H → `${PREFIX}本章须完成一次高强落地（H级）重场戏，落地分级词表须显性命中`
  //         L → `${PREFIX}本章须含一次轻量落地（L级）铺陈，落地分级词表须显性命中`（两文案禁含「连续」二字）
  //   keywords: []; source: 'mandate'
  export function ensureMandateBeat(db: Database, bookId: string, chapterNo: number): void
  //   book 缺失或 parseLandingMandate(book.landingMandateJson)===null → 仅剥离前缀条目（有剥离才写库，无则零写入）
  //   cadence → 剥离前缀条目 → 余下条目无任何 grade!==undefined 时追加 synthesizeMandateBeat → upsertBlueprint
  //   （title/blueprint 其余键/targetChars 全取 getChapter 现值；upsertBlueprint 会整写 blueprint_json 且 targetChars 缺省 3000，
  //    故必须显式回传 chapter.targetChars，chapters.ts:115-135 语义）
  ```
- Consumes：Task-01 的 `parseLandingMandate`/`LandingMandate`；l0/render 消费 `source` 字段；Task-03/05 复用钉值文案。

**步骤**
- [ ] 1. 核实中性夹具：`grep -n "分级制" apps/server/test/settings-import.test.ts apps/server/test/settings-import.parse.test.ts` → 预期零命中（有命中则停手上报，冲击清单 #9 三处 `warnings toEqual([])` 会破）。
- [ ] 2. 写 pipeline/mandate.ts 三件（PREFIX/synthesize/ensure），ensure 用 booksRepo.getChapter+upsertBlueprint 现有函数，不新增 repo 函数。
- [ ] 3. queue.ts:80-81 resume 门后插 `if (run.kind !== 'polish') ensureMandateBeat(db, run.bookId, no);`（polish 不消费蓝图节拍，零扰动；resumePoint 已 done 章 continue 跳过故不会重写已完成章）。
- [ ] 4. l0.ts:200-202 missed 计算改分支（旧回调体逐字保留为 else 路径）：
  ```ts
  if (m.source === 'mandate' && m.keywords.length === 0) {
    if (wordsEmpty) return false;                                   // 词表缺失 fail-open 同旧
    const lHits = lw.l.filter((w) => input.draft.includes(w));
    if (m.grade === 'H') return !(lw.h.some((w) => input.draft.includes(w)) || lHits.length >= 2); // 最小牙：≥1 H 词或 ≥2 不同 L 词
    return lHits.length === 0;                                      // L：≥1 L 词
  }
  ```
  details 归因（:203）：missed 条目映射 `m.source==='mandate' ? \`${m.text}（书级${m.grade}未达·落地策略）\` : m.text`，join 仍「、」。
- [ ] 5. render.ts:22 与 :98 关键词段改 `m.keywords.length > 0 ? \`（须出现关键词：${m.keywords.join('、')}）\` : ''`；grade 段 `（落地·H级须显性词）` 不动（mandate 条目带 grade 照显）。
- [ ] 6. settings-import.ts：parseOutline 后加 `const landingCellCount = allCards.filter((c) => parseLandingCell(c.body) !== null).length;`；`if (landingCellCount === 0 && description.includes('分级制')) warnings.push('全书大纲卡未解析出任何落地格，而设定集含「分级制」表述；如需每章落地保障，可在导入时勾选「启用书级落地策略」，或导入后在书籍设置开启');`
- [ ] 7. 测试 `apps/server/test/pipeline/mandate.test.ts`（纯函数段 + openDb 临时库集成段），用例：
  - `synthesize：N=2 → ch2/ch4 grade H、ch1/ch3 grade L；keywords 恒 []；source 恒 'mandate'；text 以前缀开头`
  - `synthesize：自定义 N=3 → ch3 H、ch1/ch2 L`（钉 `chapterNo % 3 === 0`）
  - `synthesize：两文案不含「连续」`（critic 条件3 钉值：`expect(text).not.toContain('连续')`）
  - `ensure：cadence 书 ch2 → 蓝图尾部恰一条 mandate 条目；重跑一次 → 条目数仍 1（幂等）`
  - `ensure：已有卡 grade 条目（upsertBlueprint 预填）→ 不追加 mandate 条目（有卡书零扰动）`（咬人输入③）
  - `ensure：off 书残留 mandate 条目 → 剥离后蓝图无前缀条目；再跑一次零写库（蓝图 JSON 字节不变）`（咬人输入⑤ off 侧）
  - `ensure：cadence 中途从 off 切入 → 先剥离旧合成条目再按新 N 重判追加`（咬人输入⑤：off→cadence→off→cadence 全序列条目数恒 ≤1）
  - `ensure：mandate json 空串 / 非法 JSON → 视同 off（剥离路径，不抛）`（咬人输入①）
  - `ensure：chapter.targetChars 保持现值（预置 2500，跑完仍 2500）`
- [ ] 8. l0.test.ts 追加 describe `L0 书级落地策略条目（DEC-2026-1122-01）`（沿用 :179 的 run() 助手与 LW 夹具形态，条目用 `source:'mandate'`+keywords:[]）：
  - `H 条目 + 正文 1 个 H 词 → pass；0 H 词 + 恰 1 个 L 词 → fail；0 H 词 + 2 个不同 L 词 → pass`
  - `L 条目 + 1 个 L 词 → pass；无 L 词 → fail`
  - `卡源同文条目（无 source）同正文 → 旧语义逐字节不变`（冲击清单 #1 复核）
  - `词表空 → mandate 条目 fail-open pass`
  - `fail 明细含「书级H未达·落地策略」`
- [ ] 9. contract.test.ts 追加：`renderDraft/renderTaskSummaryBlock：keywords=[] 条目跳过关键词括注`（钉输出 `\`【必含节拍】${PREFIX}…（落地·H级须显性词）\`` 且 `not.toContain('须出现关键词：')`）。
- [ ] 10. settings-import.parse.test.ts 追加：`全书 0 落地格 + description 含「分级制」→ warnings 含提示`、`有落地格 → 无该警示`、`无「分级制」→ 无该警示`。
- [ ] 11. `pnpm -F @inkforge/server exec vitest run test/pipeline/mandate.test.ts test/quality/l0.test.ts test/prompts/contract.test.ts test/settings-import.parse.test.ts` → 全绿。
- [ ] 12. 冲击复核：`pnpm -F @inkforge/server exec vitest run test/pipeline/chapter.test.ts test/pipeline/continue.test.ts test/http/settings-import.test.ts test/worker/queue.test.ts` → 全绿（清单 #4/#5/#8/#9/#12）。
- [ ] 13. `pnpm lint` 零输出。

**验收**：mandate.test 全绿含幂等/零扰动/三态切换；l0 卡条目钉值不变；渲染空关键词行消失。

---

## Task-03 层②：planner 协议【LANDING】行（校验→重试 1 次→降级不 500）

**目标**：blueprint-suggest 输出协议强制 LANDING 落地格行；不合格拒收重出一次；再不合格丢弃+warning；与卡叠加并集、卡优先。

**文件**
- Modify `apps/server/src/llm/plainproto.ts:136-139`（ParsedBlueprint）、`:141-200`（parseBlueprint）
- Modify `apps/server/src/prompts/render.ts:145-156`（renderBlueprintTask 协议行）
- Modify `apps/server/src/http/routes.ts:458-473`（blueprint-suggest 校验/重试/叠加）
- Test Modify `apps/server/test/llm/plainproto.test.ts`、`apps/server/test/http/blueprint-suggest.test.ts`

**接口**
- Produces（plainproto.ts）：
  ```ts
  export interface ParsedBlueprint { blueprint: ChapterBlueprint; errors: string[]; landingRaw: string | null; landingErrors: string[] }
  // parseBlueprint：捕获首个 /^LANDING\s*[:：]\s*(.*)$/ 行 → landingRaw（去围栏/CRLF 同现有管线）；
  // 第二条及以后 LANDING 行 → landingErrors.push('多余 LANDING 行')；缺 LANDING 行不进 errors（解析层不强制，强制在路由层）
  ```
- Produces（render.ts renderBlueprintTask）：协议区追加行 `LANDING: 本章落地格，形态为 H（场景）或 L（场景），场景写具体人物事件`；负约束行「每行前缀必须为 GOAL:/BEATS 条目/HOOK:/LANDING: 之一」。
- Consumes：routes 消费 landingRaw/landingErrors + `parseLandingCell`（settings-import.ts:155）；Task-05 复核钉值。
- 协议预算钉值：renderBlueprintTask 协议行由 ~210 字增至 ~270 字；`blueprint-suggest.test.ts:72` 「task 预算 800」夹具简介 300 字 → 300+270+尾部两行 ≈ 630 < 800，尾行存活断言不变（不调 BUDGETS_PLANNER.task）。

**步骤**
- [ ] 1. plainproto.ts：ParsedBlueprint 加两字段；parseBlueprint 循环内加 LANDING 分支（仿 HOOK 分支形态：首条取值、后续 landingErrors）；返回对象补默认 `landingRaw: null, landingErrors: []` 路径。
- [ ] 2. render.ts renderBlueprintTask 加协议行与负约束（见接口；不动预算）。
- [ ] 3. plainproto.test.ts 追加：`LANDING 行捕获 → landingRaw 原文`、`双 LANDING → landingErrors=['多余 LANDING 行']`、`无 LANDING → landingRaw null 且 errors 不含 LANDING`（冲击清单 #10 复核既有两例仍绿）。
- [ ] 4. routes.ts blueprint-suggest（:458-473 邻域）：
  - `const cardLanding = outlineCard ? parseLandingCell(outlineCard.body) : null;`
  - `const expectsLanding = cardLanding === null || cardLanding.keywords.length === 0;`——**主审裁决 2026-11-22**：仅当该章无确定性落地时才要求模型出格（卡有书零扰动零额外本地模型重试成本；无卡书无论 mandate 开关均吃层②红利，由模型从世界观自拟落地格）；mandate 不参与此判定（mandate 合成在 queue 侧 Task-02），mandateOn 变量不引入（knip/lint 死码门）
  - 判定函数 `landingOk(report) = report.landingRaw !== null && parseLandingCell(report.landingRaw) !== null && parseLandingCell(report.landingRaw)!.keywords.length > 0`
  - 重试条件扩为 `first.errors.length > 0 || (expectsLanding && !landingOk(first))`；重试 prompt = 既有 `repairPrompt(report.errors)` 拼接 `'\n输出必须含一行 LANDING: H（场景）形态落地格'`（重试上限恒 1 次，沿 :460-464 单次结构，不加循环）。
  - 终态：`expectsLanding && !landingOk(report)` → `warnings.push(landingRaw 缺行 ? 'planner 未输出 LANDING 落地格行，已按无模型落地格处理' : 'planner LANDING 落地格不合格，已丢弃')`；不 500。
  - 叠加（:466-472 块内、卡叠加之后）：`landingOk(report)` 时构造 `{ text: report.landingRaw!.trim(), keywords, grade, }`，text trim 全等去重并入 mustHaveBeats（模型条目不写 source，与卡同旧语义；卡条目在前=卡优先）。
  - 响应 `reply.send({ blueprint, source: 'llm', ...(warnings.length > 0 ? { warnings } : {}) })`。
- [ ] 5. blueprint-suggest.test.ts 追加 describe `planner LANDING 落地格槽（DEC-2026-1122-01）`：
  - `模型输出合规 LANDING → 与卡并集、text 重复时卡优先`（mock summarize 改产含 `LANDING: H（撞见场：房东×阿美）` 文本的 provider——text 与卡全等 → mustHaveBeats 仍单条卡条目；再放一个不同 text 的 `LANDING: L（借宿夜：表哥家中）` 变体 → 钉两条且卡条目在前）
  - `LANDING 不合格（如 LANDING: X（场景））→ 重试 1 次后丢弃 + warnings 告知，响应 200`（钉 plannerCalls 恰 2、`warnings.length===1`）
  - `无卡命中章（chapterNo=9）→ 有 LANDING 期望：mock 无 LANDING → 重试恰 1 次→丢弃+warnings 恰 1 条，响应 200 且 mustHaveBeats 仍 []`（主审裁决：无确定性落地才要模型格）
  - `卡命中章（chapterNo=1）→ 无 LANDING 期望：plannerCalls 恰 1、响应无 warnings 键`（卡有书零额外成本）
  - 冲击复核清单 #6：`pnpm -F @inkforge/server exec vitest run test/http/blueprint-suggest.test.ts` → 既有三例全绿（:54 卡章不重试故 plannerCalls/toEqual 原样）。
- [ ] 6. `pnpm -F @inkforge/server exec vitest run test/llm/plainproto.test.ts test/http/blueprint-suggest.test.ts` → 全绿；`pnpm lint` 零输出。

**验收**：合规 LANDING 并集卡优先钉值；不合格降级 200+warning；重试上限 1；既有卡叠加/预算/PUT 用例零回归。

---

## Task-04 设置导入勾选落 mandate + web 两控件（导入勾选、书籍设置下拉）

**目标**：apply 显式勾选才写 mandate（不自动猜）；书籍设置可开/关/自定义 N。

**文件**
- Modify `apps/server/src/http/routes.ts:293-296`（apply 事务内、`return book.id` 前写 mandate）
- Modify `apps/web/src/components/SettingsImportPanel.tsx:52`（state）、`:68-82`（apply body）、`:270-278`（importStyle 勾选行旁加勾选）
- Modify `apps/web/src/pages/BookDetailPage.tsx:606-622`（工具行「质量轮数」旁加「落地策略」select + 自定义 N 输入）、`:475`（保存接线）
- Test Modify `apps/server/test/http/settings-import.test.ts`、`apps/web/src/components/SettingsImportPanel.test.tsx`、`apps/web/src/pages/BookDetailPage.test.tsx`
- Modify `apps/web/src/api/client.ts:96-97`（无签名变化；BookMetaPutBody 类型由 shared 更新自动带入，仅需确认编译）

**接口**
- Consumes：Task-01 `settingsImportApplySchema.landingMandate`、`BookMetaPutBody.landingMandate`、`BookDto.landingMandate`。
- Produces：apply 事务语义——`landingMandate.enabled===true` 时在同一 `db.transaction` 内（:248 事务体、:295 foreshadowings 之后）执行 `booksRepo.updateBookMeta(db, book.id, { landingMandate: { mode: 'cadence', heavyEveryN: body.landingMandate.heavyEveryN } })`；enabled=false 零写入（新书默认 null=off）。

**步骤**
- [ ] 1. routes.ts apply：事务体内加勾选写入（见接口；失败随事务回滚=书与 mandate 同生共死）。
- [ ] 2. settings-import.test.ts 追加（复用 :288 LANDING_COMPENDIUM 与 :146 apply 形态）：`apply 带 landingMandate:{enabled:true,heavyEveryN:3} → 书 landingMandate 钉值 {mode:'cadence',heavyEveryN:3}`、`apply 不带 landingMandate → landingMandate null`（冲击清单 #8 复核既有钉值仍绿）。
- [ ] 3. SettingsImportPanel.tsx：`const [mandateEnabled, setMandateEnabled] = useState(false);`；importStyle 勾选行同款 `checkboxBase` 渲染 `启用书级落地策略`（aria-label 同名；title 提示「逐章表无落地格时按每 N 章一重的书级策略合成节拍」）；apply() 请求体加 `landingMandate: { enabled: mandateEnabled, heavyEveryN: 2 }`（N 固定 2，UI 不暴露 N——自定义 N 走书籍设置）。
- [ ] 4. SettingsImportPanel.test.tsx 追加（fetch stub 形态沿 :43-60）：`勾选启用 → apply 请求体钉 landingMandate:{enabled:true,heavyEveryN:2}`（断言 fetchMock 收到的 init.body JSON）、`默认不勾 → enabled:false`。
- [ ] 5. BookDetailPage.tsx：工具行（:610 质量轮数 label 之后）加 `<label>落地策略 <select aria-label="落地策略">`，选项 `off`=关 / `cadence-2`=分级制每2章重 / `cadence-custom`=自定义N；选 custom 时旁渲染 `数字输入 aria-label="每N章一重" min=2 max=50`；初始值由 `book.landingMandate` 派生（null/off→off；heavyEveryN===2→cadence-2；否则 custom）。变更即 `await api.putBookMeta(bookId, { landingMandate })`（off 发 `landingMandate:{mode:'off'}`；成功 `setMsg('落地策略已保存：…')`，失败走既有 catch 显示 `apiErrorText`）。
- [ ] 6. BookDetailPage.test.tsx 追加：`落地策略下拉渲染当前值`、`切到分级制每2章重 → PUT meta body 钉 landingMandate:{mode:'cadence',heavyEveryN:2}`（fetch stub 捕获 body，形态沿该文件既有 stub）。
- [ ] 7. `pnpm -F @inkforge/server exec vitest run test/http/settings-import.test.ts` → 全绿；`pnpm -F @inkforge/web test` → 全绿（web 基线 144 不减）；`pnpm -F @inkforge/web build` 冒烟过。
- [ ] 8. `pnpm lint` 零输出；提交信息注明「GUI 未验证（owner 真实测试）」。

**验收**：勾选才写 mandate；下拉三态与 PUT body 钉值成立；既有 settings-import/web 用例零回归。

---

## Task-05 验证链收口

**目标**：硬序全绿 + 基线只增不减留痕。

**步骤**
- [ ] 1. `pnpm lint` → 零输出（零告警门）。
- [ ] 2. `pnpm typecheck` → 全 workspace 0 错。
- [ ] 3. 定向回归包：`pnpm -F @inkforge/server exec vitest run test/http/landing-mandate.test.ts test/pipeline/mandate.test.ts test/quality/l0.test.ts test/http/blueprint-suggest.test.ts test/http/settings-import.test.ts` → 全绿。
- [ ] 4. `pnpm test` → 逐包计数：server ≥ 429+新增、web ≥ 144+新增、shared ≥ 2+新增；总 ≥ 575；记录终值（只增不减结论写进完成通知）。
- [ ] 5. `pnpm deadcode`（knip）→ 零新增告警（新导出 MANDATE_TEXT_PREFIX/synthesizeMandateBeat/ensureMandateBeat/parseLandingMandate/LandingMandate 均有消费方；若 knip 误报 shared 导出未消费，在 knip 配置按既有豁免形态处理并在提交正文说明）。
- [ ] 6. diff 安全扫：`git diff` 逐文件过目——零秘密、零词表原文、零 data 目录改动；NSIS 0014 两处（File/Delete）在 diff 中确认。
- [ ] 7. 提交（Conventional 前缀+中文描述，正文 `verify:` 验证结果；只 commit 不 push）；完成通知附：基线终账、GUI 未验证声明、行为翻转说明（off 书零回归；cadence 书合成节拍→beat_coverage 红灯→rewrite→needs_human 且明细带「书级H未达·落地策略」归因）。

---

## 五类咬人输入 → 测试映射（全覆盖核对）

| 咬人输入 | 钉死行为 | 测试位置 |
|---|---|---|
| mandate json 空串 / 非法 JSON | parseLandingMandate → null，视同 off（剥离路径不抛） | Task-02 步骤 7 咬人①用例；Task-01 步骤 12 null 往返 |
| heavyEveryN=0 / 1 / 负数 / 非整数 | PUT /meta 400 | Task-01 步骤 11 四断言 |
| heavyEveryN 超大（如 1e9） | 合法入库；合成按模运算→小章号恒 L | Task-01 步骤 11 无 400 断言 + Task-02 步骤 7 N=3 模值钉值外推（执行者加一行 `synthesize：N=10**9 → ch1 L` 即可） |
| 卡落地格与 mandate 同章并存 | ensure 见既有 grade 条目→不追加（卡优先零扰动）；l0 卡条目旧语义 | Task-02 步骤 7 零扰动用例 + Task-02 步骤 8 卡源复核用例 |
| PUT 传入与前缀条目 text 全等的用户节拍 | 并集去重保留库内 mandate 条目（source 存活、条目数不增） | Task-01 步骤 11 末例 |
| off↔cadence 中途切换 rerun | 剥离→重判→重追加，幂等条目数 ≤1；off 残留剥离 | Task-02 步骤 7 off/cadence 切换用例 |

## 自审五查

1. **规格覆盖**：DEC 四条件逐条落地——条件1 queue 持久化注入（Task-02 步骤 3，drafter/QC 同读 blueprint_json）；条件2 l0 最小牙且仅 mandate 条目（Task-02 步骤 4，卡条目 else 路径逐字保留）；条件3 措辞降级+「连续」禁词钉测试（Task-02 步骤 2/7）；条件4 source 标志+render 空关键词跳过（Task-01 步骤 3 + Task-02 步骤 5）。层② LANDING 协议/重试上限 1/降级不 500/卡优先并集（Task-03）。导入 preview 警示+apply 勾选制（Task-02 步骤 6 + Task-04）。UI 下拉三态（Task-04）。needs_human 归因（Task-02 步骤 4 details）。NSIS hazard（全局约束 4 + Task-01 步骤 13）。否决项未踩（无 description 结构化提取、无单层方案）。——**覆盖完整**。
2. **步骤唯一性**：每步一个动作+可核对结果（命令+预期绿/钉值/断言全文），无 TBD/「适当处理」；测试步均给用例名+断言钉值。——**通过**。
3. **类型一致**：`LandingMandate` 单点定义于 shared/mandate.ts，repo 存 JSON 串、DTO/路由层解析，`BeatRequirement.source?: 'card'|'mandate'` 与 zod schema（blueprintSchema 不收 source——PUT 用户条目经 zod 剥离无法伪造 mandate 来源）一致；ensureMandateBeat 显式回传 targetChars 规避 upsertBlueprint 缺省 3000 陷阱（chapters.ts:128）。——**通过**。
4. **咬人输入**：五类全部有具名测试（见上表），无遗漏。——**通过**。
5. **比例**：预计净增代码 ~350 行（server ~200、shared ~60、web ~60、sql/nsis ~10）+ 测试 ~450 行；计划 5 任务均独立可测可评审（Task-01 纯基座、Task-02 管线、Task-03 planner、Task-04 端到端 UI、Task-05 收口）；计划篇幅 < 代码预期。——**通过**。
