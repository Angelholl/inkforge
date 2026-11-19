# 实现计划：续写 run ↔ 内容 GUI 深度关联（owner 拍板 C 方案）

- 日期：2026-11-19
- 计划员：code-planner（只拆解，不写业务代码）
- 规格（真值源）：`docs/design/research-run-continuation-gui.md`（只读调研报告，含全部 path:line 证据锚点）
- 面向读者：未见过本代码库的编程执行者。请先读完本文档第 4 节「已核实事实」再动手。

## 1. 目标

owner 在书详情页发起续写后（a）没有暂停/取消入口、（b）无法直接查看续写内容。本计划交付三个已拍板的改进（范围=以下三项，不得增删；`rerunChapter`/`adoptPartial` 有 API 无 UI 属范围外，明确不做）：

1. **入队提示可点**：书详情发起续写成功后的提示从纯文本改为带「查看运行面板→」链接，跳 `/runs/:runId`。
2. **运行卡内联操作 + 内容入口**：`RunAsideCard` 活动态（queued/running）行内联「暂停/取消」（暂停后出现「继续」）；完成态（done/failed/cancelled）行加「查看第N章→」跳章节阅读页。
3. **新端点 GET /api/runs/:runId/versions**：按 runId 返回该 run 产出/触及的章节版本列表及正文；运行卡（done 态）与仪表盘「产物」列可展开正文。

## 2. 架构与数据流（改什么、为什么这样改）

- 现状：暂停/继续/取消 API 前后端齐全（`apps/web/src/api/client.ts:149-155`、`apps/server/src/http/routes.ts:486-502/537-544`），但唯一 UI 入口在 `/runs/:runId` 运行面板页（`apps/web/src/pages/RunPage.tsx:58-68`）；书详情右侧运行卡 `RunAsideCard` 全部可点元素只有「报表」链接（`apps/web/src/components/RunAsideCard.tsx:22-24`）。续写正文落盘 `chapter_versions`（带 `run_id` 列），GUI 只能按章号进阅读页看；无按 runId 查版本的端点。
- 数据流（本计划新增路径）：
  - 前端提示：`BookDetailPage.startContinue` 成功 → `setMsg` + `setQueuedRunId(runId)` → 渲染 `<Link to={/runs/:runId}>`。
  - 运行卡操作：`RunAsideCard` 行内按钮 → `api.pauseRun/resumeRun/cancelRun`（既有端点，不改语义）→ `queryClient.invalidateQueries(['book', bookId])` 刷新 run 列表（书查询在 `BookDetailPage.tsx:324`，key=`['book', bookId]`，另有 4s 轮询兜底）。
  - run 产物：`chapter_versions.run_id` 反查（JOIN chapters 取章号与 current 指针）→ 新端点返回 `RunVersionsDto`（正文内联，区别于既有 versions 列表端点不带正文的风格，见 `routes.ts:824-829` + `packages/shared/src/api.ts:52-53` 注释「列表不带正文」——本端点定位是「产物展开」，一次性取回正文避免逐版本二次请求）。
  - 仪表盘展开：报表步行新增可选 `versionId`（来自 `run_steps.output_version_id`，`routes.ts:900-914` 已在手）→ 前端以 `versionId` 精确对齐 run 产物版本 → 产物列「正文」按钮展开。

## 3. 全局约束

- 测试基线只增不减：只新增测试，不改删既有测试。本任务是交互改进（非修 bug），全部走新功能红绿流程（先写失败测试，再实现转绿）。
- 执行者只 commit 不 push；提交信息 Conventional 前缀 + 中文描述；建议每任务一个 commit。
- GUI 行为不做浏览器目验（owner 真实测试）；组件行为以组件测试断言为准，不安排目验步骤。
- 不改既有 API 语义，只新增；`ReportStepDto.versionId` 为可选字段，向后兼容。
- UI 文案一律中文。
- 不新增 DB 迁移文件：`chapter_versions.run_id` 列已存在（`apps/server/src/db/migrations/0001_core.sql:21`），无 run_id 索引但单机 SQLite 数据量小，全表过滤可接受（0003_indices.sql 注释明确只按需建索引）。
- `packages/shared` 以 src 直引消费（`packages/shared/package.json` exports 指向 `./src/index.ts`），新增类型无需构建步骤。

## 4. 已核实事实（计划前只读复核，写死进本计划）

| # | 事实 | 锚点 |
| --- | --- | --- |
| F1 | `RunDto` **已含** `chapterScope: { from: number; to: number }`（必填，非可选）及 `bookId`、`mode`、`status` 等；**无需扩共享类型与后端 DTO 映射**（owner 交办核实项①的结论） | `packages/shared/src/api.ts:78-93`；后端映射 `apps/server/src/db/repositories/runs.ts:73-81`（`chapter_scope_json` JSON.parse） |
| F2 | `RunStatus` 全集 `queued/running/paused/cancelled/done/failed` | `packages/shared/src/domain.ts:15` |
| F3 | `chapter_versions` 表列：`id, chapter_id(→chapters), parent_version_id, kind(CHECK original/draft/revised/final/manual_edit), content, word_count, run_id, prompt_hash, model, params_json, style_sample_ids_json, created_at`；索引仅 `(chapter_id, created_at)` | `apps/server/src/db/migrations/0001_core.sql:16-24`、`0003_indices.sql:3` |
| F4 | 既有版本端点风格：`GET /api/books/:bookId/chapters/:chapterNo/versions` → `{ currentVersionId, versions }`（列表**不带正文**）；`GET /api/versions/:versionId` → 单版本全量含正文。仓储函数：`listVersions`（无 content，`ORDER BY created_at DESC, rowid DESC`）、`getVersion`、`appendChapterVersion`、`setCurrentVersion`、`getChapter(db, bookId, no)`、`getChapterById` | `apps/server/src/http/routes.ts:823-836`、`apps/server/src/db/repositories/chapters.ts:189-269` |
| F5 | runs 仓储：`getRun(db, runId)`、`createRun(db, { bookId, mode, chapterScope, maxRounds?, ... })`、`updateRunStatus`、`listSteps`、`listRunsByBook` | `apps/server/src/db/repositories/runs.ts:106-118/175-179` |
| F6 | 测试栈与命令：根 `pnpm lint`（eslint .）/ `pnpm typecheck`（pnpm -r）/ `pnpm test`（pnpm -r --if-present）/ `pnpm build:web`；apps/server `vitest run`（测试在 `apps/server/test/**`）；apps/web `vitest run --passWithNoTests`（测试与源码同目录 `*.test.tsx`）+ `tsc --noEmit` + `vite build`；web 测试环境 jsdom（`vite.config.ts` `test.environment='jsdom'`，无 setupFiles，不用 jest-dom matchers，沿既有 `toBe/toBeTruthy/toMatch` 风格）；**vitest run 不做类型检查（esbuild 剥离类型），类型错误在 `pnpm typecheck` 环节暴露** | 根/两 app `package.json` scripts；`apps/web/vite.config.ts:15-17` |
| F7 | server http 测试先例：`loadConfig({ ..., INKFORGE_DATA_DIR: dir })` + `openDb` + `buildApp({ config, provider: createDefaultMockProvider(), db, inlineQueue: true })` + `app.inject({ method, url, payload })`；建书→PUT blueprint 即建章行 | `apps/server/test/http/versions-delete.test.ts:18-34` |
| F8 | web 组件测试先例：`vi.stubGlobal('fetch', vi.fn(...))` + `jsonResponse` 助手 + `MemoryRouter`/`Route`/`Routes` + `QueryClientProvider` + `afterEach { cleanup(); vi.unstubAllGlobals(); }`；URL 断言用 `endsWith/includes`（API_BASE 在 vitest 下为空串） | `apps/web/src/pages/BookDetailPage.test.tsx:42-102/136-140/151-159`、`apps/web/src/components/VersionQcPanel.test.tsx:6-51` |
| F9 | `useRunEvents(runId: string|null)` → `{ run: RunDto|null, steps, connected }`，内部 `new EventSource(runEventsUrl(runId))`；**jsdom 无 EventSource，RunAsideCard 测试必须 stub** | `apps/web/src/hooks/useRunEvents.ts:12-22` |
| F10 | `RunAsideCard` 现状 props 仅 `{ runs: RunDto[] }`；`latest = runs.find(ACTIVE) ?? runs[0]`，`ACTIVE = {'queued','running','paused'}`；唯一调用点 `BookDetailPage.tsx:907`（单调用点，扩 props 安全）；书查询 key=`['book', bookId]`、4s 轮询；msg 渲染点 `:902`；startContinue 在 `:417-430`（成功 `:426`） | `apps/web/src/components/RunAsideCard.tsx:6-11`、`apps/web/src/pages/BookDetailPage.tsx:324/417-430/902-908` |
| F11 | 既有续写成功测试只断言 POST body，不断言提示文案（改文案零回归风险）；stub 返回 `{ runId: 'r1234567890' }`，蓝图 textarea 可直接 `findByPlaceholderText(/蓝图 JSON/)` 填入后「保存蓝图」→「发起续写」 | `apps/web/src/pages/BookDetailPage.test.tsx:94/414-447` |
| F12 | `Button` 签名：`variant?: 'primary'|'secondary'|'danger'|'quiet'`（默认 secondary）、`size?: 'md'|'sm'`（默认 md） | `apps/web/src/components/ui.tsx:86-97` |
| F13 | 报表端点步行组装处已持有 `st.outputVersionId`；`outputVersionId` 有值但版本行被硬删 → `versionDeleted=true`（删行不改 run_steps，故 versionId 与 versionDeleted 可并存） | `apps/server/src/http/routes.ts:891/900-914`、`apps/server/src/db/repositories/chapters.ts:286-298` |
| F14 | 仪表盘 `DashboardPage`：查询 `['report', runId]`，产物列 `:45`（versionDeleted → Badge，否则空）；无既有测试文件；根有 `Link` 需 Router 包裹 | `apps/web/src/pages/DashboardPage.tsx:9-50` |
| F15 | 对照先例：新书向导 createRun 后直接 `navigate('/runs/:runId')`（`NewBookIdeaPage.tsx:96`）；本计划书详情改提示内链接（不 navigate，保留蓝图编辑区上下文） | — |

## 5. 任务定界与理由

| 任务 | 交付物 | 依赖 | 测试循环 |
| --- | --- | --- | --- |
| Task-01 | 共享 DTO（RunVersionsDto 等）+ client.getRunVersions | 无 | typecheck/lint（纯类型与一行封装） |
| Task-02 | 仓储 `listVersionsByRun` + 新端点 + http 测试 | Task-01 | 红→绿（vitest） |
| Task-03 | 报表步行补 versionId + http 测试 | Task-01 | 红→绿（vitest） |
| Task-04 | 入队提示可点 + 组件测试 | 无（排在前端首位） | 红→绿（vitest） |
| Task-05 | RunAsideCard 内联操作 + 章节链接 + 组件测试 | 无代码依赖（建议在 04 后，同文件 907 行改动错开） | 红→绿（vitest） |
| Task-06 | RunAsideCard done 态产物展开 + 组件测试 | Task-01、Task-05 | 红→绿（vitest） |
| Task-07 | 仪表盘产物列展开正文 + 组件测试 | Task-01、Task-03 | 红→绿（vitest） |

定界理由：owner 建议「共享类型+后端端点 → 前端提示 → 运行卡交互 → 内容展开」。契约先行（01→02/03）让前端任务消费稳定签名；04/05/06/07 四块 UI 各自独立红绿、互不阻塞；03 单独拆出是因为它是 07 的硬依赖且改动仅两行+一个测试文件，可独立验收；02 的仓储与端点同一测试循环覆盖，不再细拆。后端（02/03）与前端（04~07）可并行开工，但 04 与 05 都碰 `BookDetailPage.tsx`（04 动 :426/:902 区、05 动 :907），串行执行避免冲突。

---

## Task-01 共享 DTO + client 方法

- 文件/操作：
  - `packages/shared/src/api.ts`：修改 + 新增（类型）。
  - `apps/web/src/api/client.ts`：修改（新增 1 个方法 + import）。
- **Interfaces / Produces**（精确签名，后续任务按此消费，不得改名）：

```ts
// packages/shared/src/api.ts —— 插在 RunStepDto 之后（现 :113 与 HealthDto :115 之间）
/** run 产物版本项（C 方案③）：run_id 反查 chapter_versions，正文内联（区别于 VersionListItemDto 不带正文）；isCurrent=该章 current 指针指向此版本。 */
export interface RunVersionItemDto {
  versionId: string;
  chapterId: string;
  chapterNo: number;
  kind: ChapterKind;
  wordCount: number;
  content: string;
  isCurrent: boolean;
  createdAt: string;
}

export interface RunVersionsDto {
  runId: string;
  versions: RunVersionItemDto[];
}

// packages/shared/src/api.ts —— ReportStepDto（现 :120-127）内新增可选字段（versionDeleted 之后）
  /** 产物版本 id（版本被硬删后仍保留原 id 供墓碑对照；前端配合 /api/runs/:runId/versions 做正文展开） */
  versionId?: string;
```

```ts
// apps/web/src/api/client.ts —— 类型 import 列表加入 RunVersionsDto；getRun（现 :150）之后新增：
  getRunVersions: (runId: string) => req<RunVersionsDto>(`/api/runs/${runId}/versions`),
```

- 步骤：
  1. 按上文签名编辑两文件（`ChapterKind` 已在 api.ts:1 import，无需新增 import）。
  2. 核对结果：`pnpm --filter @inkforge/shared typecheck` → 退出码 0；`pnpm --filter @inkforge/web typecheck` → 退出码 0。
- 验收标准：两包 typecheck 通过；`RunVersionItemDto`/`RunVersionsDto`/`versionId` 三个名字与上文逐字一致（Task-02/03/06/07 按名消费）。

---

## Task-02 仓储 listVersionsByRun + GET /api/runs/:runId/versions

- 文件/操作：
  - `apps/server/src/db/repositories/chapters.ts`：新增函数（落点：`getVersion` 之后，现 :269 附近）。
  - `apps/server/src/http/routes.ts`：新增路由（落点：`GET /api/runs/:runId` 块之后，现 :520 与 :522 events 之间）。
  - `apps/server/test/http/run-versions.test.ts`：新增（先写，红）。
- **Interfaces**：
  - Consumes：Task-01 `RunVersionItemDto`。
  - Produces：
    - `export function listVersionsByRun(db: Database, runId: string): RunVersionItemDto[]`（chapters.ts，import `RunVersionItemDto` from '@inkforge/shared'）
    - 端点 `GET /api/runs/:runId/versions` → 200 `RunVersionsDto`；runId 不存在 → 404 `{ error: 'not found' }`。
- 步骤：
  1. **红**：新建 `apps/server/test/http/run-versions.test.ts`，骨架照抄 F7 先例（beforeAll：mkdtemp + loadConfig(`INKFORGE_DATA_DIR: dir`) + openDb + `buildApp({ config, provider: createDefaultMockProvider(), db, inlineQueue: true })`；afterAll：app.close + db.close + rmSync）。仓储 seed（import `appendChapterVersion, setCurrentVersion` from `../../src/db/repositories/chapters`、`createRun` from `../../src/db/repositories/runs`）：
     - inject `POST /api/books { title: 'run 产物书' }` → bookId；inject `PUT /api/books/:bookId/chapters/1/blueprint { title: '第一章', blueprint: { goal: 'g', beats: [], mustHaveBeats: [], bannedTopics: [] }, targetChars: 500 }`；`chapterId = db.prepare('SELECT id FROM chapters WHERE book_id = ? AND chapter_no = 1')...`。
     - `runA = createRun(db, { bookId, mode: 'continue', chapterScope: { from: 1, to: 1 } })`；`v1 = appendChapterVersion(db, { chapterId, kind: 'draft', content: '第一版正文。', runId: runA.id })`；`v2 = appendChapterVersion(db, { chapterId, kind: 'final', content: '第二版正文。', runId: runA.id })`；`setCurrentVersion(db, chapterId, v2.id)`；`runB = createRun(db, { bookId, mode: 'generate', chapterScope: { from: 1, to: 1 } })` + `appendChapterVersion(db, { chapterId, kind: 'draft', content: '其他 run 的版本。', runId: runB.id })`；`emptyRun = createRun(db, { bookId, mode: 'generate', chapterScope: { from: 1, to: 1 } })`。
     - 测试 1 `未知 runId → 404 not found`：`GET /api/runs/nope/versions` → `statusCode === 404` 且 `res.json()` **toEqual** `{ error: 'not found' }`（红态下 Fastify 未注册路由的 404 body 含 message 字段，toEqual 必失败，红态成立）。
     - 测试 2 `run 产物版本按章号与时间正序返回，带正文与 isCurrent`：`GET /api/runs/${runA.id}/versions` → 200；断言 `body.runId === runA.id`；`body.versions.length === 2`；`versions[0]` toMatchObject `{ versionId: v1.id, chapterId, chapterNo: 1, kind: 'draft', content: '第一版正文。', isCurrent: false }`；`versions[1]` toMatchObject `{ versionId: v2.id, kind: 'final', content: '第二版正文。', isCurrent: true }`；两者 `wordCount > 0`。
     - 测试 3 `不同 run 的版本不串（run_id 隔离）`：`GET /api/runs/${runB.id}/versions` → `versions.length === 1` 且 `versions[0].content === '其他 run 的版本。'`。
     - 测试 4 `无产物 run → versions 空数组`：`GET /api/runs/${emptyRun.id}/versions` → `versions.length === 0`。
     - 核对结果：`pnpm --filter @inkforge/server test test/http/run-versions.test.ts` → **4 failed**（路由不存在）。
  2. **绿-仓储**：chapters.ts 新增（精确实现，含同毫秒 rowid 决序——`appendChapterVersion` 的 `created_at` 精度是毫秒，同毫秒插入必须靠 rowid 保序）：

```ts
  const rows = db
    .prepare(
      `SELECT v.id, v.chapter_id, c.chapter_no, v.kind, v.word_count, v.content, v.created_at,
              CASE WHEN c.current_version_id = v.id THEN 1 ELSE 0 END AS is_current
       FROM chapter_versions v
       JOIN chapters c ON c.id = v.chapter_id
       WHERE v.run_id = ?
       ORDER BY c.chapter_no ASC, v.created_at ASC, v.rowid ASC`,
    )
    .all(runId) as Array<{ id: string; chapter_id: string; chapter_no: number; kind: string; word_count: number; content: string; created_at: string; is_current: number }>;
  return rows.map((r) => ({
    versionId: r.id,
    chapterId: r.chapter_id,
    chapterNo: r.chapter_no,
    kind: r.kind as ChapterKind,
    wordCount: r.word_count,
    content: r.content,
    isCurrent: r.is_current === 1,
    createdAt: r.created_at,
  }));
```

  3. **绿-路由**：routes.ts `:520` 后新增：

```ts
  // run 产物版本（C 方案③）：run_id 反查 chapter_versions，正文内联；未知 run 404
  app.get('/api/runs/:runId/versions', async (req, reply) => {
    const { runId } = req.params as { runId: string };
    if (!runsRepo.getRun(db, runId)) return reply.code(404).send({ error: 'not found' });
    reply.send({ runId, versions: chaptersRepo.listVersionsByRun(db, runId) });
  });
```

  4. 核对结果：同步骤 1 命令 → **4 passed**。
- 验收标准：4 个测试绿；不改任何既有函数行为（`listVersions`/`getVersion` 等原样）；`pnpm --filter @inkforge/server typecheck` 退出码 0。

---

## Task-03 报表步行补 versionId

- 文件/操作：
  - `apps/server/src/http/routes.ts`：修改两处（:891 内联类型、:914 return 对象）。共享类型已在 Task-01 就位。
  - `apps/server/test/http/run-report-versionid.test.ts`：新增（先写，红）。
- **Interfaces**：
  - Consumes：Task-01 `ReportStepDto.versionId?: string`。
  - Produces：`GET /api/runs/:runId/report` 每个步行多一个可选键 `versionId`（值=`st.outputVersionId`，无则缺键）；`versionDeleted` 语义不变。
- 步骤：
  1. **红**：新建测试文件，骨架同 Task-02（buildApp + 建书 + PUT blueprint 章 1 + `appendChapterVersion(db, { chapterId, kind: 'final', content: '存活的最终版正文。', runId: 'r-report' })` → `vLive`）。run 与 steps 用裸 INSERT（沿 versions-delete.test.ts:58-71 先例；`output_version_id` 无外键，可指向不存在的 `'v-gone'` 模拟已删版本）：

```ts
db.prepare("INSERT INTO runs(id, book_id, mode, status, chapter_scope_json, created_at) VALUES('r-report', ?, 'generate', 'done', '{\"from\":1,\"to\":1}', ?)").run(bookId, new Date().toISOString());
db.prepare("INSERT INTO run_steps(id, run_id, chapter_id, step, attempt, status, output_version_id) VALUES('rs-draft', 'r-report', ?, 'draft', 1, 'done', 'v-gone')").run(chapterId);
db.prepare("INSERT INTO run_steps(id, run_id, chapter_id, step, attempt, status, output_version_id) VALUES('rs-final', 'r-report', ?, 'finalize', 1, 'done', ?)").run(chapterId, vLive.id);
```

     - 测试 1 `report 步行带 versionId；版本被删的步 versionDeleted 与 versionId 并存`：`GET /api/runs/r-report/report` → 200；`body.chapters[0].chapterNo === 1`；steps 中 `finalize` 行 toMatchObject `{ step: 'finalize', versionId: vLive.id }` 且 `'versionDeleted' in 行 === false`；`draft` 行 toMatchObject `{ step: 'draft', versionDeleted: true, versionId: 'v-gone' }`。
     - 核对结果：`pnpm --filter @inkforge/server test test/http/run-report-versionid.test.ts` → **1 failed**（步行无 versionId 键）。
  2. **绿**：routes.ts `:891` 内联类型在 `versionDeleted?: boolean` 后加 `versionId?: string`；`:914` return 改为：

```ts
        return { step: st.step, attempt: st.attempt, ms, usage, ...(versionDeleted ? { versionDeleted: true } : {}), ...(st.outputVersionId ? { versionId: st.outputVersionId } : {}) };
```

  3. 核对结果：同步骤 1 命令 → **1 passed**；并跑 `pnpm --filter @inkforge/server test test/http/api.test.ts` 确认既有报表行为零回归（api.test.ts 含报表用例）。
- 验收标准：新测试绿 + api.test.ts 绿；只新增可选键，不删不改既有键。

---

## Task-04 入队提示可点（C 方案①）

- 文件/操作：
  - `apps/web/src/pages/BookDetailPage.tsx`：修改（状态区新增 1 个 useState；startContinue 成功分支 `:426`；msg 渲染点 `:902`）。`Link` 已在 `:3` import。
  - `apps/web/src/pages/BookDetailPage.test.tsx`：新增 1 个测试（先写，红）。
- **Interfaces**：
  - Consumes：`api.createRun`（现状不变）。
  - Produces（组件内部状态与渲染约定）：新状态 `const [queuedRunId, setQueuedRunId] = useState('');`（落点：组件状态区、与现有 msg 的 useState 同组）；成功文案 = 文本 `续写已入队 run ${r.runId.slice(0, 8)}` + 链接 `查看运行面板→`（href=`/runs/${r.runId}`），渲染进 `:902` 既有 `<p>`。
- 步骤：
  1. **红**：在 `BookDetailPage.test.tsx` 既有「发起续写」测试（:414-447）之后新增（渲染 JSX 照抄该文件 :416-424 的 `QueryClientProvider + MemoryRouter + Route path="/books/:bookId"` 包法；stub 沿 `installFetchStub`，其 POST /api/runs 返回 `{ runId: 'r1234567890' }`，见 F11；`setInput` 助手见同文件 :142-146）：

```tsx
  it('发起续写成功提示含「查看运行面板→」链接，href 指向 /runs/:runId（C 方案①）', async () => {
    installFetchStub();
    render(/* 同 :416-424 包法 */);
    const bpArea = await screen.findByPlaceholderText(/蓝图 JSON/);
    setInput(bpArea, JSON.stringify({ goal: '入城遇阻', beats: ['守卫盘查'], mustHaveBeats: [], bannedTopics: [] }));
    fireEvent.click(screen.getByRole('button', { name: '保存蓝图' }));
    fireEvent.click(await screen.findByRole('button', { name: /发起续写/ }));
    const link = await screen.findByText('查看运行面板→');
    expect(link.closest('a')!.getAttribute('href')).toBe('/runs/r1234567890');
    expect(screen.getByText(/续写已入队 run r1234567/)).toBeTruthy();
    expect(screen.queryByText(/进度见右侧/)).toBeNull();
  });
```

     核对结果：`pnpm --filter @inkforge/web test src/pages/BookDetailPage.test.tsx` → 新测试 **failed**（找不到「查看运行面板→」），既有测试全绿。
  2. **绿**：
     - `:418`（`setMsg('')` 旁）加 `setQueuedRunId('');`；
     - `:426` 改为两行：`setMsg(\`续写已入队 run ${r.runId.slice(0, 8)}\`);` + `setQueuedRunId(r.runId);`（原「，进度见右侧「运行」卡」后缀删除）；
     - `:902` 改为：

```tsx
          {msg && (
            <p className="mt-2 text-sm text-muted">
              {msg}
              {queuedRunId && (
                <Link className="ml-1 text-primary-strong hover:underline" to={`/runs/${queuedRunId}`}>
                  查看运行面板→
                </Link>
              )}
            </p>
          )}
```

  3. 核对结果：同步骤 1 命令 → 全部 passed（含既有 :414-447 测试——其只断言 POST body，见 F11）。
- 验收标准：新测试绿且断言 href 精确等于 `/runs/r1234567890`、文本 `续写已入队 run r1234567`（slice(0,8) 精确值）；既有测试全绿。

---

## Task-05 RunAsideCard 内联操作 + 完成态章节链接（C 方案②前半）

- 文件/操作：
  - `apps/web/src/components/RunAsideCard.tsx`：修改（props、行渲染 :18-27、新增 actionMsg 状态与 runAction 助手）。
  - `apps/web/src/pages/BookDetailPage.tsx:907`：修改（传 `bookId`）。
  - `apps/web/src/components/RunAsideCard.test.tsx`：新增（先写，红）。
- **Interfaces**：
  - Consumes：`api.pauseRun/resumeRun/cancelRun`（client.ts:151-153，签名不变）；`queryClient.invalidateQueries({ queryKey: ['book', bookId] })`（书查询 key 见 F10）。
  - Produces：`export default function RunAsideCard({ runs, bookId }: { runs: RunDto[]; bookId: string })`（props 变更，唯一调用点 BookDetailPage.tsx:907 同任务更新）。
- 步骤：
  1. **红**：新建 `RunAsideCard.test.tsx`：
     - 顶部 stub（jsdom 无 EventSource，见 F9）：

```ts
class FakeEventSource {
  addEventListener(): void {}
  close(): void {}
  onerror: ((ev: unknown) => void) | null = null;
}
```

     - module 级共享 fixture（Task-06 复用 `base`；**必须** `import type { RunDto } from '@inkforge/shared'` 并给 `runs` 标注 `RunDto[]`——字面量直接作 prop 传入会因类型拓宽报 TS 错；`chapterScope` 来自 RunDto 必填字段，见 F1）：

```ts
const base = { bookId: 'b9', mode: 'continue', skipFailures: true, salvagePartial: true, maxRounds: 2, createdAt: '2026-11-19T00:00:00Z' } as const;
const runs: RunDto[] = [
  { ...base, id: 'r-run-act1', status: 'running', chapterScope: { from: 2, to: 2 } },
  { ...base, id: 'r-run-pau1', status: 'paused', chapterScope: { from: 3, to: 3 } },
  { ...base, id: 'r-run-done1', status: 'done', chapterScope: { from: 1, to: 1 } },
  { ...base, id: 'r-run-can1', status: 'cancelled', chapterScope: { from: 4, to: 6 } },
];
```

     - 渲染助手：`QueryClientProvider` + `MemoryRouter initialEntries={['/books/b9']}` + `Route path="/books/:bookId" element={<RunAsideCard runs={runs} bookId="b9" />}`；fetch stub 记录 `calls` 数组，默认回 `jsonResponse({})`。
     - 测试 1 `活动态行内联暂停/取消，paused 行出现继续`：断言 `getAllByRole('button', { name: '暂停' }).length === 1`、`继续 === 1`、`取消 === 2`、`报表` 链接 `length === 4`（既有行为不回归）；`fireEvent.click(暂停按钮)` 后 `await waitFor(() => expect(calls.some((c) => c.url.endsWith('/api/runs/r-run-act1/pause') && c.init?.method === 'POST' && c.init?.body === '{}')).toBe(true))`（注：单测只挂 RunAsideCard，无 `['book','b9']` 观察者，invalidateQueries 为即时 no-op，故不断言刷新请求；真页面的刷新由 BookDetailPage 的查询观察者承接）。
     - 测试 2 `完成态行「查看第N章→」链接指向章节阅读页`：`getByRole('link', { name: '查看第1章→' })` 的 `getAttribute('href') === '/books/b9/chapters/1'`；`查看第4-6章→` 的 href === `/books/b9/chapters/4`（范围 run 取 from）；done/cancelled 行无暂停按钮已由测试 1 的计数覆盖。
     - 测试 3 `动作失败显示错误文案`：stub 对 `/pause` 返回 `jsonResponse({ error: 'run is done' }, 409)`；点击暂停 → `await screen.findByText('暂停失败：run is done')`（apiErrorText 会从 `POST url → 409: body` 还原 error 字段，见 client.ts:58-70）。
     - 核对结果：`pnpm --filter @inkforge/web test src/components/RunAsideCard.test.tsx` → **3 failed**（vitest 不查类型，红态=运行期断言失败：暂停/继续/取消按钮与章节链接不存在）；`pnpm typecheck` 此时会报 bookId prop 不匹配（静态检查环节红，实现后转绿）。
  2. **绿-组件**：RunAsideCard.tsx：
     - import 增加：`useState`（react）、`useQueryClient`（@tanstack/react-query）、`api, apiErrorText`（../api/client）、`Button`（加入现 :3 的 './ui' import）。
     - `:6` 后加 `const TERMINAL = new Set(['done', 'failed', 'cancelled']);`
     - props 改为 `{ runs, bookId }: { runs: RunDto[]; bookId: string }`；组件内加：

```tsx
  const queryClient = useQueryClient();
  const [actionMsg, setActionMsg] = useState('');
  const runAction = async (runId: string, kind: 'pauseRun' | 'resumeRun' | 'cancelRun', label: string) => {
    try {
      await api[kind](runId);
      setActionMsg('');
      await queryClient.invalidateQueries({ queryKey: ['book', bookId] });
    } catch (e) {
      setActionMsg(`${label}失败：${apiErrorText(e)}`);
    }
  };
```

     - `:18-27` 行渲染改为：徽标与 id 不动；其后依次插入——`r.status === 'queued' || r.status === 'running'` → `<Button size="sm" variant="secondary" onClick={() => void runAction(r.id, 'pauseRun', '暂停')}>暂停</Button>` + `<Button size="sm" variant="danger" onClick={() => void runAction(r.id, 'cancelRun', '取消')}>取消</Button>`；`r.status === 'paused'` → `<Button size="sm" variant="secondary" onClick={() => void runAction(r.id, 'resumeRun', '继续')}>继续</Button>` + 同款取消按钮；`TERMINAL.has(r.status)` →

```tsx
<Link to={`/books/${bookId}/chapters/${r.chapterScope.from}`} className="text-primary-strong hover:underline">
  {r.chapterScope.from === r.chapterScope.to ? `查看第${r.chapterScope.from}章→` : `查看第${r.chapterScope.from}-${r.chapterScope.to}章→`}
</Link>
```

       「报表」Link 保持最后且保留 `ml-auto`（推到行尾）。`runs.length === 0` 空态不动。
     - `<ul>` 之后加 `{actionMsg && <p className="text-xs text-danger">{actionMsg}</p>}`。
  3. **绿-调用点**：`BookDetailPage.tsx:907` → `<RunAsideCard runs={book?.runs ?? []} bookId={bookId} />`（bookId 即 `:419` 处所用变量）。
  4. 核对结果：步骤 1 命令 → **3 passed**；`pnpm --filter @inkforge/web test src/pages/BookDetailPage.test.tsx` → 全绿（既有 BookDetailPage 测试里 `runs: []`，latest 为 undefined，useRunEvents(null) 早退不触 EventSource，见 F10）。
- 验收标准：3 个新测试绿；RunAsideCard 唯一调用点已传 bookId；暂停/继续/取消仅发 `POST body='{}'` 到既有端点，不改 client。

---

## Task-06 RunAsideCard done 态产物展开（C 方案③ 前端·运行卡）

- 文件/操作：
  - `apps/web/src/components/RunAsideCard.tsx`：修改（新增 showOutput 状态 + useQuery + 展开区块）。
  - `apps/web/src/components/RunAsideCard.test.tsx`：追加测试（先写，红）。
- **Interfaces**：
  - Consumes：Task-01 `api.getRunVersions(runId)` → `RunVersionsDto`；Task-05 的 props 与渲染骨架。
  - Produces：done 态 `latest` 行下方「产物/收起产物」切换按钮 + 版本卡片列表（`第{chapterNo}章 · {kind} · {wordCount}字[ · 当前]` + 正文）。
- 步骤：
  1. **红**：在 RunAsideCard.test.tsx 追加（新 describe，复用 module 级 `base`，fixture 标注 `RunDto[]`：单条 done run `{ ...base, id: 'r-run-out1', status: 'done', chapterScope: { from: 1, to: 1 } }`；stub 对 `endsWith('/api/runs/r-run-out1/versions')` 回：

```ts
{ runId: 'r-run-out1', versions: [
  { versionId: 'v-2', chapterId: 'c1', chapterNo: 1, kind: 'final', wordCount: 8, content: '第二版正文内容。', isCurrent: true, createdAt: '2026-11-19T00:00:02Z' },
  { versionId: 'v-1', chapterId: 'c1', chapterNo: 1, kind: 'draft', wordCount: 7, content: '第一版正文内容。', isCurrent: false, createdAt: '2026-11-19T00:00:01Z' },
] }
```

     - 测试 1 `done 态点「产物」展开 run 版本正文；非 done 态无产物入口`：running fixture 渲染 → `queryByRole('button', { name: '产物' })` 为 null；done fixture 渲染 → 点击「产物」→ `await screen.findByText('第二版正文内容。')` 且 `findByText('第一版正文内容。')`；断言标签文本 `第1章 · final · 8字 · 当前` 存在（精确值，模板 = `第{chapterNo}章 · {kind} · {wordCount}字{isCurrent ? ' · 当前' : ''}`）。
     - 测试 2 `再点「收起产物」正文消失`：点击「收起产物」→ `queryByText('第二版正文内容。')` 为 null。
     - 测试 3 `空产物 run → 「该 run 没有产物版本」`：stub versions 回 `{ runId: 'r-run-out1', versions: [] }` → 点击「产物」→ `await screen.findByText('该 run 没有产物版本')`。
     - 核对结果：`pnpm --filter @inkforge/web test src/components/RunAsideCard.test.tsx` → 新 3 例 **failed**，Task-05 的 3 例仍绿。
  2. **绿**：RunAsideCard.tsx：
     - 加 `import { useQuery, useQueryClient } from '@tanstack/react-query';`（useQueryClient Task-05 已引入则合并）；
     - 组件内加：

```tsx
  const [showOutput, setShowOutput] = useState(false);
  const { data: runVersions } = useQuery({
    queryKey: ['run-versions', latest?.id],
    queryFn: () => api.getRunVersions(latest!.id),
    enabled: showOutput && latest?.status === 'done',
  });
```

     - 控制台 `<div>`（:29-38）之后、`</Card>` 之前插入：

```tsx
      {latest?.status === 'done' && (
        <div>
          <Button size="sm" variant="quiet" onClick={() => setShowOutput((v) => !v)}>
            {showOutput ? '收起产物' : '产物'}
          </Button>
          {showOutput && (
            <div className="mt-2 space-y-2">
              {(runVersions?.versions ?? []).length === 0 && <p className="text-xs text-faint">该 run 没有产物版本</p>}
              {(runVersions?.versions ?? []).map((v) => (
                <div key={v.versionId} className="rounded-ctl border border-line bg-surface p-2">
                  <p className="text-xs text-muted">
                    第{v.chapterNo}章 · {v.kind} · {v.wordCount}字{v.isCurrent ? ' · 当前' : ''}
                  </p>
                  <div className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap text-xs">{v.content}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
```

  3. 核对结果：步骤 1 命令 → 全部 passed。
- 验收标准：6 例全绿（Task-05 的 3 例 + 本任务 3 例）；正文只在展开时请求（`enabled` 条件），收起不卸查询缓存不发新请求。

---

## Task-07 仪表盘「产物」列可展开正文（C 方案③ 前端·仪表盘）

- 文件/操作：
  - `apps/web/src/pages/DashboardPage.tsx`：修改（新查询 + 产物列 + 展开行）。
  - `apps/web/src/pages/DashboardPage.test.tsx`：新增（先写，红）。
- **Interfaces**：
  - Consumes：Task-01 `api.getRunVersions` + `ReportStepDto.versionId`（Task-03 起报表步行携带）；既有 `api.getReport`。
  - Produces：产物列单元格 = `versionDeleted` → 既有 Badge（不变）；否则 `versionId` 命中 run 版本 → 「正文」quiet 按钮；展开时在该行下插入 `<tr><td colSpan={6}>` 正文块。命中规则：`s.versionId && !s.versionDeleted && contentById.has(s.versionId)`。
- 步骤：
  1. **红**：新建 `DashboardPage.test.tsx`：

```ts
const report = {
  chapters: [
    { chapterNo: 1, steps: [
      { step: 'finalize', attempt: 1, ms: 10, usage: { promptTokens: 1, completionTokens: 2 }, versionId: 'v-1' },
      { step: 'draft', attempt: 1, ms: 5, usage: { promptTokens: 3, completionTokens: 4 }, versionDeleted: true, versionId: 'v-x' },
      { step: 'qc', attempt: 1, ms: 2, usage: { promptTokens: 0, completionTokens: 0 } },
    ] },
  ],
  totals: { ms: 17, promptTokens: 4, completionTokens: 6 },
};
const runVersions = { runId: 'r1', versions: [
  { versionId: 'v-1', chapterId: 'c1', chapterNo: 1, kind: 'final', wordCount: 8, content: '这是最终版正文。', isCurrent: true, createdAt: '2026-11-19T00:00:02Z' },
] };
```

     fetch stub：`endsWith('/api/runs/r1/report')` → report；`endsWith('/api/runs/r1/versions')` → runVersions；渲染包法 `QueryClientProvider + MemoryRouter initialEntries={['/runs/r1/dashboard']} + Routes + Route path="/runs/:runId/dashboard" element={<DashboardPage />}`（DashboardPage 有 Link 与 useParams，见 F14）。
     - 测试 1 `产物列「正文」可展开该步版本正文`：`await screen.findByText('finalize')` 后断言 `getByText('版本已删')` 存在（既有行为不回归）；点击「正文」按钮 → `await screen.findByText('这是最终版正文。')`；断言 stub 收到过 `/api/runs/r1/versions` 请求。
     - 测试 2 `再点「正文」收起`：再次点击同一按钮 → `queryByText('这是最终版正文。')` 为 null。
     - 测试 3 `步无 versionId（qc 老步）→ 产物列为空`：qc 步所在行既无「版本已删」也无「正文」（`getAllByRole('button', { name: '正文' }).length === 1`，仅 finalize 步有）。
     - 核对结果：`pnpm --filter @inkforge/web test src/pages/DashboardPage.test.tsx` → **3 failed**（无「正文」按钮）。
  2. **绿**：DashboardPage.tsx：
     - import 增加 `useState`、`Button`（./ui）；新增查询与映射：

```tsx
  const { data: runVersions } = useQuery({ queryKey: ['run-versions', runId], queryFn: () => api.getRunVersions(runId), enabled: !!runId });
  const [expandedVersionId, setExpandedVersionId] = useState('');
  const contentById = new Map((runVersions?.versions ?? []).map((v) => [v.versionId, v]));
```

     - `:37-48` tbody 的 `.map` 改 `.flatMap`，行键沿用 `` `${c.chapterNo}-${s.step}-${s.attempt}-${i}` ``；产物列（现 :45）改为：

```tsx
<td className={dataTableCell}>
  {s.versionDeleted ? (
    <Badge tone="muted">版本已删</Badge>
  ) : s.versionId && contentById.has(s.versionId) ? (
    <Button size="sm" variant="quiet" onClick={() => setExpandedVersionId((cur) => (cur === s.versionId ? '' : s.versionId!))}>
      正文
    </Button>
  ) : (
    ''
  )}
</td>
```

     - 步行 `<tr>` 之后按需追加展开行（同一 flatMap 内 return 数组）：

```tsx
    if (s.versionId && !s.versionDeleted && expandedVersionId === s.versionId && contentById.has(s.versionId)) {
      rows.push(
        <tr key={`${rowKey}-content`}>
          <td className={dataTableCell} colSpan={6}>
            <div className="max-h-64 overflow-auto whitespace-pre-wrap text-xs">{contentById.get(s.versionId)!.content}</div>
          </td>
        </tr>,
      );
    }
```

  3. 核对结果：步骤 1 命令 → 全部 passed。
- 验收标准：3 个新测试绿；`版本已删` Badge 行为逐字不变；展开行 `colSpan={6}` 对齐表头 6 列。

---

## 6. 验收命令区

以下命令均在项目根目录执行。验证链硬序：静态检查 → 定向测试 → 全量测试 → 冒烟；任一环失败即停，不得跳环。

```bash
# ① 静态检查
pnpm lint
pnpm typecheck

# ② 定向测试（红→绿逐任务核对，全部转绿才算过）
pnpm --filter @inkforge/server test test/http/run-versions.test.ts
pnpm --filter @inkforge/server test test/http/run-report-versionid.test.ts
pnpm --filter @inkforge/web test src/pages/BookDetailPage.test.tsx
pnpm --filter @inkforge/web test src/components/RunAsideCard.test.tsx
pnpm --filter @inkforge/web test src/pages/DashboardPage.test.tsx

# ③ 全量测试（测试基线只增不减：全量必须含以上新测试且既有用例零失败）
pnpm test

# ④ 冒烟（前端产物可构建）
pnpm build:web
```

提交纪律：执行者只 commit 不 push；建议每任务一个 commit，Conventional 前缀 + 中文描述（如 `feat(server): 新增按 runId 查章节版本端点`）。

## 7. 自审五查记录

1. **规格覆盖**：owner 三项逐一对号——①=Task-04、②=Task-05、③=Task-02（端点）+Task-06/07（两个展开消费点）+Task-01/03（契约）。范围外（rerunChapter/adoptPartial/GUI 目验）在 §1/§3 明确排除。✅
2. **步骤扫描**：每个代码步给出唯一落点与精确签名/文案；每个测试步给出测试名、stub 值与精确断言（如 href `/runs/r1234567890`、文案 `续写已入队 run r1234567`、标签模板 `第1章 · final · 8字 · 当前`）；无 TBD/「处理边界情况」类死行。自审修正：fixture 补 `RunDto[]` 标注（类型拓宽会报 TS 错）；Task-05 红态描述改为「vitest 不查类型，红=运行期断言失败，类型错误由 typecheck 环节承接」。✅
3. **类型一致**：`RunVersionItemDto` 八字段、`RunVersionsDto`、`ReportStepDto.versionId`、`getRunVersions`、`listVersionsByRun`、`RunAsideCard({ runs, bookId })` 在 Task-01~07 的 Consumes/Produces 与实现间逐字一致。✅
4. **输入类测试覆盖**：端点覆盖 404/正常/隔离/空集；组件覆盖成功/失败（409 错误文案还原）/切换收起/空态/老数据无 versionId。✅
5. **比例**：计划只给签名、SQL、JSX 骨架与断言，不整文件抄码；总篇幅与 7 个任务的改动面（约 6 个源文件 + 4 个测试文件）相称。✅
