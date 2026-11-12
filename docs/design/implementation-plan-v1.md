# 墨炉（Inkforge）实施计划 v1

**目标：** 个人本地全自动长篇小说生成流水线：Phase 1 用 mock provider 打通单章纵向闭环，Phase 2 落地可崩溃恢复的队列并接入真模型，Phase 3 实现 20 章批量+连续性+风格+续写模式，Phase 4 云端路由与 GUI 完整化（可选）。

**架构：** headless 本地服务（Node 22 + TypeScript + Fastify，REST+SSE）+ 独立 worker 进程（concurrency=1，租约心跳）+ 单文件 SQLite(WAL) 唯一真相源（better-sqlite3）+ 浏览器 GUI（React 19 + Vite）；LLM 统一 OpenAI 兼容 client + 模型能力描述符 + 角色路由 + 上下文预算装配器（稳定前缀在前）；质检 L0 确定性 → L1 引用证据 rubric → 门控 → ≤2 轮定点重写。**8 项架构已由 decision-critic 评议 + owner 拍板定案，本计划不得变更架构。**

**规格：**
- 项目定义意向书（2026-11-11，owner 确认）——要点见附录 A；Task 01 将其落盘为 `docs/spec/intent-2026-11-11.md`（规格随计划走）。
- 技术选型评议（已拍板定案）：`D:\Pagekin\docs\design\review-tech-choice-2026-11-11.md`。

**计划路径说明：** 依派卡指令落盘 `docs/design/implementation-plan-v1.md`（writing-plans 默认 `docs/plans/`，以派卡路径为准）。

**纪律声明：** 本计划遵循 writing-plans 粒度纪律：任务=自带测试循环、值得独立评审的最小交付单元；每步=一个动作+一个可核对结果；文档内所有代码块仅为 DDL/协议文样/类型签名/测试断言，不含函数体。计划自审五查已执行，记录见文末。

---

## [INFO_GAP] 待 owner 确认（默认值已钉进 config，不阻塞动工）

1. **单章目标字数**：意向书未定。评审建议 2500–3500。本计划默认 `chapters.target_chars = 3000`，L0 长度带宽 ±20%（即 2400–3600）。owner 拍板后改配置默认值即可，不影响任务结构。
2. **Strata 126B iq3_xxs 实测指标**（tok/s、首 token 延迟、真实上下文窗口、JSON 遵循率）：能力描述符初值按 `contextWindow=32768, maxOutput=8192` 配置，Phase 2 Task 20 实测校准。此为评审 R1 [HIGH_RISK_OBJECTION] 关口。
3. **本地端 API key 取值与注入方式**：本机 18500 已实测需鉴权（`missing or wrong API key`）。约定 env `INKFORGE_LOCAL_API_KEY`，`.env` 永不入库。
4. **L1 加权分达标阈值**：评审只说"分达标"未给数值。默认 `quality.scoreThreshold = 8.0`（10 分制）。
5. **入口 A 样例小说 1–2 本**：Phase 3 Task 30 真实验收需要；测试先用合成 fixture。
6. **云端 API 候选与预算上限**：Phase 4 Task 31 前确认。
7. **QC 召回率回归集所需的 10 个已知缺陷历史章节**：Phase 4 Task 34 前提供。

---

## 全局约束

### 技术栈钉值

- Node `>=22.11 <25`（engines）；pnpm ≥9（根 package.json `packageManager` 字段回填本机 `pnpm -v` 实际值）；TypeScript `strict: true`，`target: ES2022`，`module: ESNext`，`moduleResolution: bundler`。
- **不做 tsc 产物构建**：运行时统一 `tsx`（本地自用，免构建链，规避 better-sqlite3 原生模块 rebuild 复杂度）；类型检查用 `tsc --noEmit`。
- 依赖钉值（全部 MIT/Apache，禁止引入 GPL/AGPL 依赖）：`fastify ^5`、`better-sqlite3 ^12`、`zod ^4`、`koffi ^2`（Windows 睡眠阻止 FFI）、`vitest ^3`、`eslint ^9`（flat config）+ `typescript-eslint`、`prettier ^3`；web 侧 `React >=19`、`Vite >=6`、`Tailwind CSS v4`（`@tailwindcss/vite` 插件）、`@tanstack/react-query ^5`、`react-router ^7`。Phase 4 增 `diff ^8`。
- monorepo：`apps/server` + `apps/web` + `packages/shared`。**简化/保留理由**：shared 承载 API DTO、SSE 事件、领域枚举供两端复用（防契约漂移）；better-sqlite3 原生模块隔离在 server；worker 与 service 同包部署，符合评议决策点 3"同一 workspace、同一启动器"。

### 目录与命名

```
D:\inkforge\
├─ apps/server/          # Fastify service + worker（同包双入口）
│  ├─ src/
│  │  ├─ index.ts        # service 入口（spawn worker、supervisor、单实例锁）
│  │  ├─ worker/main.ts  # worker 入口（写 data/worker.pid）
│  │  ├─ config.ts  db/  llm/  context/  quality/  pipeline/  http/  style/  import/  power.ts
│  │  └─ prompts/        # 各角色 prompt 渲染器（只含结构，文案执行者撰写，契约测试钉住）
│  ├─ config/quality/cliches.default.txt
│  ├─ scripts/           # baseline / crash-test / run-report 等
│  └─ test/              # vitest（单元 + e2e）
├─ apps/web/             # React 19 + Vite
├─ packages/shared/      # DTO / 事件 / 领域类型 / countChars
├─ docs/                 # spec/ design/ decision-log.md third-party-references.md baseline/
└─ data/                 # 运行时数据（gitignore）
   ├─ books/{bookId}.db
   ├─ backups/{bookId}/{bookId}-{yyyyMMdd-HHmmss}.db
   └─ exports/{书名安全化}/{NNN}-{章节标题安全化}.md
```

- 包名 `@inkforge/server`、`@inkforge/web`、`@inkforge/shared`。
- 所有 id：`crypto.randomUUID()`，TEXT 列。所有时间戳：UTC ISO 字符串（`new Date().toISOString()`）。
- 迁移文件：`apps/server/src/db/migrations/NNNN_名称.sql`，按文件名序执行，`PRAGMA user_version` 记进度，每个迁移单事务。

### 提交纪律（每任务收尾一步）

- Conventional 前缀 + 中文描述，如 `feat(server): 单章管线编排`；正文带 `verify: <本轮验证命令与结果>`。
- 只 `git add <明确路径>`，**禁 `git add -A`**；commit 前 secret 自查（`.env`、真实 apiKey 永不入库）；执行者只 commit 不 push。
- GUI 相关提交：提交前 web-gui-tester 黑盒目验，提交信息注明"GUI 已验证/未验证"。

### clean-room 合规（全程有效）

- 参考项目（EthanYoQ/Pagekin GPL-3.0、Aerdelan/MirrorNovel AGPL-3.0）**只读公开文档**；不 clone 进工作区、不 vendor、不复制其 prompt/DDL/UI 文案/schema/测试用例；本项目的提示词与表结构全部独立撰写（本计划的 DDL 与协议格式即独立设计基线）。
- Task 01 建立 `docs/third-party-references.md` 存证（参考日期、参考点=仅思路、不复制声明）。

### 默认参数表（全部进 `loadConfig` 默认值；验收一律用默认值跑）

| 参数 | 默认值 | 说明/来源 |
|---|---|---|
| `port` | 8787 | env `INKFORGE_PORT` 可覆盖 |
| `dataDir` | `data` | env `INKFORGE_DATA_DIR` |
| sqlite pragmas | WAL / synchronous=NORMAL / busy_timeout=5000ms / foreign_keys=ON | 评议决策点 2 |
| `timeouts`（毫秒，按步分级） | draft 3600000 / qc 900000 / rewrite 3600000 / summarize 1200000 / plan 1800000 | 评议决策点 3 |
| `provider.maxRetries` | 2，退避 `500ms × 2^n + rand(0..250ms)`，仅对网络错误/429/5xx | 评议决策点 4 |
| `budgets.draft`（32k 档，字符） | `{hardRules:500, worldview:1000, styleRules:1000, blueprint:1000, continuity:2500, prevTail:1500, fewShot:1500, task:500}` | 评议"固定前缀2.5k/蓝图1k/连续性2.5k/上章尾1.5k/few-shot1.5k/任务0.5k" |
| `budgets.draft8k`（8k 降级档） | `{hardRules:300, worldview:200, styleRules:0, blueprint:500, continuity:1000, prevTail:800, fewShot:1000, task:200}` | 评议 8k 降级；`pickBudgetProfile`：contextWindow ≤8192 → 8k 档，否则 32k 档 |
| `budgets.qc` / `budgets.qc8k` | `{hardRules:400, draft:6000, blueprint:500, continuity:500}` / `{hardRules:300, draft:3000, blueprint:300, continuity:200}` | L1 送审整章 |
| `budgets.rewrite` | `{hardRules:500, original:6000, findings:800, factBaseline:1000, task:500}` | targeted 档 |
| 总预算公式 | `totalBudgetChars = contextWindow − maxOutput − 500`（安全余量） | 客户端硬预算 |
| 采样温度 | draft 0.9 / rewrite 0.7 / qc 0.2 / summarize 0.3 / plan 0.4；top_p 0.9 | 评议决策点 4 |
| `quality.targetChars` | 3000（章节可覆盖） | [INFO_GAP] 1 |
| 长度带宽 | `|countChars − target| ≤ target × 0.2` | 评议 L0 |
| `quality.scoreThreshold` | 8.0 | [INFO_GAP] 4 |
| `quality.minGain` | 0.05（提升 <5% 即停） | 评议终止条件 |
| `rewrite.maxRounds` | 2（Phase 1 验收场景显式传 1） | 评议 ≤2 轮 |
| 重演 n-gram | n=8；重合率 = draft 8-gram 与前三章并集之交 / draft 8-gram 总数，≥0.35 → fail | 评议"防重演" |
| 抄用 n-gram | 任何 ≥15 连续字子串命中 few-shot/参考文本 → fail | 评议"禁止连续 15 字以上重合" |
| 套话表 | `cliches.default.txt`，每行一条 JS 正则 source；`!` 前缀=建议级（只提示不判 fail），否则硬禁。种子 3 条硬禁：`不是.{0,8}而是`、`这一刻，他明白了`、`空气仿佛凝固`；1 条建议级：`!宛如` | 评议决策点 5 |
| 风格注入 | few-shot 每章确定性轮换 3 段，块预算硬上限 1200 字；规划阶段不注入；续写模式不注入 | 评议决策点 6 |
| 漂移带 | 句长中位数、对话比与档案/原作基准偏差 ≤40% 判 pass，超带记 1 个 softMajor | 评议"可测漂移指标" |
| `runs 默认` | `skip_failures=1`、`salvage_partial=1`、`max_rounds=2` | 评议决策点 3/5 |
| 租约 | 心跳间隔 10s（测试 env 覆盖 200ms）；stale 阈值 30s；接管后 attempt+1 | 评议"租约心跳" |
| partial 落盘 | 每 200 token 或每 5s（token 按 `delta.length` 工程近似，仅影响落盘频率） | 评议"流式残稿" |
| 备份 | run 启动前 `VACUUM INTO`，每书保留最近 5 份 | 评议 R2 |
| 导出文件名 | `{String(chapterNo).padStart(3,'0')}-{safeTitle}.md`；`safeTitle`：`/[\\/:*?"<>|\s]+/g → '_'`，截断 50 字符 | 评议"导出 md" |
| SSE | step.delta 节流 500ms/连接；连接先发 `snapshot` 事件；每 15s 发 `: ping` 注释行防代理断连 | 评议"重连回放" |
| 单实例锁 | `data/service.pid`（O_EXCL 创建；已存在则 `process.kill(pid,0)` 探活，存活即拒绝启动） | 评议"单实例锁" |

### 测试命令约定

- 单测：`pnpm --filter @inkforge/server exec vitest run <文件>`（下文简写 `vitest run <文件>`）。
- 全量：`pnpm -w lint && pnpm -w typecheck && pnpm -w test`。

---

## 里程碑总览与 R1 关口

| Phase | 内容 | 任务 |
|---|---|---|
| 1 | mock provider 单章纵向闭环（装配→初稿→L0→L1→≤1 次重写→版本→导出） | Task 01–15 |
| 2 | worker/队列/租约/崩溃恢复 + 真模型接入 + 2 轮必停压测 + 最小 GUI + 睡眠阻止 | Task 16–24 |
| 3 | 自动摘要/连续性 + 20 章批量 + 风格蒸馏与注入 + 续写模式 | Task 25–30 |
| 4 | 云端路由 + GUI 完整化 + Electron 壳（可选）+ QC 回归集 | Task 31–34 |

**R1 关口（[HIGH_RISK_OBJECTION] 落实）**：Task 20 在真模型上实测单章基线。判定规则钉死：全流程（draft+qc+1 次重写）≤ 2700 秒（45 分钟）→ 继续队列任务；超限 → **停**，向 owner 提交回退选项（QC/planner 上云、缩上下文、降字数），由 owner 拍板后更新本计划。执行者不得自行改架构。mock 管线（Phase 1）不依赖该关口，可先行。

---

# Phase 1：mock 单章纵向闭环

### Task 01：仓库与 monorepo 骨架

**文件：** Create 根 `package.json`、`pnpm-workspace.yaml`、`.gitignore`、`tsconfig.base.json`、`vitest.workspace.ts`、`eslint.config.js`、`.prettierrc`；Create `packages/shared/src/{domain.ts,text.ts,api.ts}`、`packages/shared/test/domain.test.ts`；Create `apps/server/src/app.ts`、`apps/server/test/app.test.ts`；Create `apps/web`（Vite 模板）；Create `docs/spec/intent-2026-11-11.md`、`docs/third-party-references.md`、`docs/decision-log.md`。

**接口：** Produces——`@inkforge/shared` 导出：`RunStatus`、`StepName`（`'draft'|'qc'|'rewrite'|'summarize'|'finalize'`）、`StepStatus`（`'queued'|'inflight'|'done'|'failed'|'skipped'`）、`ChapterKind`（`'original'|'draft'|'revised'|'final'|'manual_edit'`）、`ChapterStatus`（`'planned'|'drafting'|'in_qc'|'needs_human'|'done'`）、`ChapterBlueprint`（`{goal: string; beats: string[]; mustHaveBeats: Array<{text: string; keywords: string[]}>; bannedTopics: string[]}`）、`Finding`（`{dimension: string; severity: 'blocker'|'major'|'minor'; quote: string; comment: string}`）、`RunEvent` 联合类型（附录 B）、`countChars(s: string): number`（`s.replace(/\s/g,'').length`）；`@inkforge/server` 导出 `buildApp(opts): FastifyInstance`（注册 `GET /api/health → {ok:true, version}`）。

**步骤：**
- [ ] `git init`；写 `.gitignore`（`node_modules/ dist/ data/ .env *.log .vitest`）→ `git add .gitignore && git commit -m "chore: init repo"`。核对：`git log --oneline` 有 1 条。
- [ ] 写根 `package.json`（`private`、engines、packageManager 回填本机 `pnpm -v`）与 `pnpm-workspace.yaml`（`apps/*`、`packages/*`）→ `pnpm install`。核对：`pnpm-lock.yaml` 存在。
- [ ] 建 `packages/shared`：写 `src/domain.ts`（上述类型与常量 `CHAPTER_KINDS`、`DIMENSIONS = ['设定一致','人物一致','情节推进','文风贴合','节奏','结尾钩子','重复度']`）、`src/text.ts`（countChars）、`src/api.ts`（DTO 见附录 B）；写 `test/domain.test.ts`：断言 `CHAPTER_KINDS` 深等于 `['original','draft','revised','final','manual_edit']`、`countChars('他推开门。\n雨停了。') === 10`、`countChars('') === 0`。核对：`pnpm --filter @inkforge/shared test` 绿。
- [ ] 建 `apps/server`：写 `src/app.ts`（`buildApp` 注册 health）与 `test/app.test.ts`（`app.inject({method:'GET', url:'/api/health'})` 期望 200 且 body `{ok:true}`）。核对：`vitest run test/app.test.ts` 绿。
- [ ] 建 `apps/web`：`pnpm create vite@latest web --template react-ts` 后并入 workspace；装 Tailwind v4 插件、TanStack Query、react-router；vite `server.proxy` 将 `/api` 转发 `http://127.0.0.1:8787`；`App.tsx` 渲染"墨炉"标题并用 fetch 显示 health。核对：`pnpm --filter @inkforge/web build` 成功。
- [ ] 根脚本：`dev:server`（`tsx watch src/index.ts`）、`dev:web`、`test`、`typecheck`（`tsc --noEmit` 逐包）、`lint`；配 vitest workspace 与 eslint flat。核对：`pnpm -w lint` 0 error、`pnpm -w test` 绿。
- [ ] 文档三件：`docs/spec/intent-2026-11-11.md`（抄附录 A 意向书部分）、`docs/third-party-references.md`（两参考项目、参考日期 2026-11-11、参考点=仅思路、不复制声明）、`docs/decision-log.md`（条目 `DEC-2026-1111-01` 指向评审文档并记录 8 项拍板）。核对：三文件存在且互链正确。
- [ ] `git add` 上述明确路径 → commit `chore: monorepo 脚手架与规格存证`。

### Task 02：配置层

**文件：** Create `apps/server/src/config.ts`、`apps/server/test/config.test.ts`、`.env.example`。

**接口：** Produces——`loadConfig(env: NodeJS.ProcessEnv): AppConfig`。`AppConfig = {port: number; dataDir: string; providers: {local: ProviderConfig; cloud?: ProviderConfig}; roles: Record<'planner'|'drafter'|'qc'|'rewriter'|'summarizer', {provider: 'local'|'cloud'; model: string}>; budgets: {draft; draft8k; qc; qc8k; rewrite}; quality: {targetChars: 3000; scoreThreshold: 8.0; minGain: 0.05; maxRounds: 2}; timeouts: Record<StepName, number>}`；`ProviderConfig = {name: string; baseURL: string; apiKey?: string; model: string; contextWindow: number; maxOutput: number; supportsJsonSchema: boolean}`。env 名：`INKFORGE_PORT`、`INKFORGE_DATA_DIR`、`INKFORGE_LOCAL_BASE_URL`（默认 `http://127.0.0.1:18500/v1`）、`INKFORGE_LOCAL_API_KEY`、`INKFORGE_LOCAL_MODEL`、`INKFORGE_CLOUD_BASE_URL/KEY/MODEL`（可选）。

**步骤：**
- [ ] 写 `test/config.test.ts`：最小合法 env（仅 `INKFORGE_LOCAL_API_KEY='x'`）→ 断言默认 `port===8787`、`dataDir==='data'`、`budgets.draft` 深等于全局参数表 32k 档 8 槽值、`budgets.draft8k` 深等于 8k 档、`quality` 三值、`timeouts` 深等于 5 步毫秒值、`roles` 默认五角色全 `{provider:'local', model: env 模型名}`。
- [ ] 同文件断言：缺 `INKFORGE_LOCAL_API_KEY` 时 `loadConfig` 抛 `ZodError`（本地也必须 key，评议决策点 4 实测依据）。
- [ ] `vitest run test/config.test.ts` 见红。
- [ ] 实现 `loadConfig`（zod schema + 上述默认值；`pickBudgetProfile(contextWindow): 'draft'|'draft8k'` 一并导出：≤8192 → 8k 档）。
- [ ] 同命令见绿。
- [ ] 写 `.env.example`（全部 `INKFORGE_*` 变量 + 中文注释，值留空）。核对：文件存在，`git grep -i "sk-" .env.example` 无命中。
- [ ] commit `feat(server): 配置加载与默认参数`。

### Task 03：DB 打开 + 迁移器 + migration 0001

**文件：** Create `apps/server/src/db/open.ts`、`src/db/migrate.ts`、`src/db/migrations/0001_core.sql`（DDL=附录 C1）；Create `apps/server/test/db/open.test.ts`。

**接口：** Produces——`openDb(file: string): Database`（better-sqlite3 实例，pragma 按全局参数表）；`migrate(db: Database): void`（读 migrations 目录按文件名排序，仅执行 `user_version < N` 的脚本，每脚本单事务并更新 `user_version`）。

**步骤：**
- [ ] 写 `0001_core.sql`（照抄附录 C1，含 `chapter_fts` trigram 虚表与 `is_original`、kind 含 `'original'`——续写模式已在基线 schema 内，避免后续改表）。
- [ ] 写 `test/db/open.test.ts`：tmp 目录建库 → `migrate` → 断言 `PRAGMA user_version === 1`、`PRAGMA journal_mode === 'wal'`、`sqlite_master` 含 `books/characters/chapters/chapter_versions/chapter_summaries/character_states/foreshadowings/style_profiles/app_meta/chapter_fts` 10 个对象；再次 `migrate(db)` 不抛且 `user_version` 仍为 1。
- [ ] `vitest run test/db/open.test.ts` 见红。
- [ ] 实现 `open.ts` + `migrate.ts`。
- [ ] 同命令见绿。
- [ ] commit `feat(server): sqlite 打开与顺序迁移器`。

### Task 04：migration 0002 运行状态表

**文件：** Create `src/db/migrations/0002_runs.sql`（DDL=附录 C2）；Modify `test/db/open.test.ts`（追加 0002 断言）。

**接口：** Produces——`runs`、`run_steps`（含 `output_json` 存 L0/L1 报告与 usage）、`partial_outputs` 表。

**步骤：**
- [ ] 写 `0002_runs.sql`（照抄附录 C2）。
- [ ] 测试追加：migrate 后 `user_version === 2`；向 `run_steps` 插入 `(run_id, chapter_id, step, attempt)` 完全相同的两行 → 第二次抛 `UNIQUE constraint failed`；`partial_outputs` 对同一 `run_step_id` 用 `INSERT ... ON CONFLICT(run_step_id) DO UPDATE` 两次后仅 1 行且 content 为第二次值。
- [ ] `vitest run test/db/open.test.ts` 先红后实现再绿（实现=仅新增 SQL 文件）。
- [ ] commit `feat(server): run/step/partial 状态表`。

### Task 05：核心仓储层（typed mapper，无 ORM）

**文件：** Create `src/db/repositories/{books,chapters,continuity,fts}.ts`；Create `test/db/repositories.test.ts`。

**接口：** Produces——
- books：`createBook(db, input: {title: string; description?: string; characters: Array<{name: string; baseSetting?: string}>}): Book`；`getBook(db, id): Book | undefined`；`listBooks(db): Book[]`。
- chapters：`upsertBlueprint(db, input: {bookId: string; chapterNo: number; title: string; blueprint: ChapterBlueprint; targetChars?: number}): Chapter`（同 `(book_id, chapter_no)` 覆盖）；`getChapter(db, bookId, chapterNo): Chapter | undefined`；`listChapters(db, bookId): Chapter[]`；`setChapterStatus(db, chapterId, status: ChapterStatus): void`；`appendChapterVersion(db, input: {chapterId: string; kind: ChapterKind; content: string; runId?: string; promptHash?: string; model?: string; params?: object; parentVersionId?: string; styleSampleIds?: string[]}): ChapterVersion`（`word_count = countChars(content)`，insert-only）；`getCurrentVersion(db, chapterId): ChapterVersion | undefined`（读 `chapters.current_version_id`）；`setCurrentVersion(db, chapterId, versionId): void`；`listVersions(db, chapterId): ChapterVersion[]`（created_at DESC）；`getVersion(db, versionId): ChapterVersion | undefined`。
- continuity：`upsertChapterSummary(db, input: {bookId: string; chapterNo: number; summary: string; beats: string[]; openThreads: string[]}): void`；`getRecentSummaries(db, bookId, beforeChapterNo: number, limit?: number /*默认3*/): Summary[]`；`upsertCharacterState(db, input: {characterId: string; chapterNo: number; state: object}): void`；`getContinuitySnapshot(db, bookId, chapterNo): {characters: Array<{name: string; state: object}>; openForeshadowings: Foreshadowing[]; summaries: Summary[]}`（仅取 `< chapterNo` 的最新角色状态与 `status !== 'resolved'` 的伏笔）；`upsertForeshadowing(db, input: {bookId: string; description: string; plantedCh: number; status?: 'open'|'advanced'|'resolved'; resolvedCh?: number}): string`。
- fts：`syncFts(db, chapterId, content): void`（先按 chapter_id 删后插，幂等）；`searchChapters(db, bookId, query: string): Array<{chapterId: string; chapterNo: number; snippet: string}>`。

**步骤：**
- [ ] 写测试第一组（books+chapters）：createBook→getBook 字段往返；upsertBlueprint 两次以最后一次为准；`appendChapterVersion` 后行内 `word_count === countChars(content)`；**append-only 静态断言**：`Object.keys(chaptersRepo)` 不含匹配 `/update.*(Content|Version)/` 的键（永不就地覆盖的结构性保证，评议 R2）；未设指针时 `getCurrentVersion` 为 undefined，`setCurrentVersion` 后返回该版本；`listVersions` 按 created_at DESC。
- [ ] `vitest run test/db/repositories.test.ts -t 'books'` 见红 → 实现 `books.ts`+`chapters.ts` → 绿 → commit `feat(server): books/chapters 仓储（append-only）`。
- [ ] 测试第二组（continuity）：summary 同章覆盖；`getRecentSummaries(bookId, 5)` 只含 chapterNo<5 的最近 3 条；character_state 同 `(characterId, chapterNo)` 覆盖；snapshot：1 条 resolved 伏笔不出现在 open 列表、character 只出现最新章状态。
- [ ] 见红 → 实现 `continuity.ts` → 绿 → commit `feat(server): 连续性仓储`。
- [ ] 测试第三组（fts）：`syncFts` 连调两次无重复行；`searchChapters(db, bookId, '雨停')` 命中含该词章节；`searchChapters(..., '雨')` 返回 `[]`（trigram 最短 3 字，注释说明）。
- [ ] 见红 → 实现 `fts.ts` → 绿 → commit `feat(server): FTS5 trigram 检索`。

### Task 06：LLM provider 抽象 + mock provider

**文件：** Create `src/llm/types.ts`、`src/llm/mock.ts`；Create `test/llm/mock.test.ts`。

**接口：** Consumes——`StepName`（shared）。Produces——
```ts
interface CompletionRequest {
  model?: string; system: string; user: string;
  temperature: number; topP: number; maxOutputTokens: number; timeoutMs: number;
  signal?: AbortSignal;
  meta: { step: StepName; chapterNo?: number; round?: number };
  onDelta?: (text: string) => void;   // 有则走流式
}
interface CompletionResult { text: string; usage: {promptTokens: number; completionTokens: number}; finishReason: string; }
interface LlmProvider { complete(req: CompletionRequest): Promise<CompletionResult>; }
type MockStepBehavior =
  | { text: string }
  | { text: string; chunks: number; chunkDelayMs: number }   // 流式拆分
  | { error: 'timeout' | 'http_500'; afterMs: number }
  | { sequence: MockStepBehavior[] }                          // 依序消费
  | { repeat: MockStepBehavior };                             // 无限重复
type MockScript = Partial<Record<StepName, MockStepBehavior>>;
function createMockProvider(script: MockScript): LlmProvider;  // 按 req.meta.step 路由；无该步脚本 → throw Error('mock script missing step')
```
Mock usage 约定：`completionTokens = text.length`（确定性，仅供测试断言）。

**步骤：**
- [ ] 测试第一组（路由+非流式）：script `{qc:{text:'Q'}}` → `complete({meta:{step:'qc'}})` 返回 text `'Q'`、`usage.completionTokens===1`；`meta.step='draft'` 无脚本 → rejects `'mock script missing step'`。
- [ ] 测试第二组（流式+失败+中止）：`{chunks:3, chunkDelayMs:10}` → onDelta 依序收 3 片后 resolve；`{error:'http_500', afterMs:20}` → rejects `ProviderError`（`error.name==='ProviderError'`，message 含 `http_500`）；传 `AbortController` 并在 5ms 后 abort → rejects，`error.name==='AbortError'`；`{sequence:[{text:'A'},{text:'B'}]}` 两次调用得 A、B，第三次 rejects。
- [ ] `vitest run test/llm/mock.test.ts` 见红 → 实现 `types.ts`+`mock.ts` → 绿。
- [ ] commit `feat(server): provider 抽象与 mock（含失败/序列注入）`。

### Task 07：OpenAI 兼容 provider

**文件：** Create `src/llm/openai.ts`；Create `test/llm/openai.test.ts`（测试内用 `node:http` 起本地假服务）。

**接口：** Consumes——`LlmProvider`、`ProviderConfig`。Produces——`createOpenAiProvider(cfg: ProviderConfig): LlmProvider`。

行为钉死：
- `POST {baseURL}/chat/completions`，body `{model, messages:[{role:'system',content:system},{role:'user',content:user}], temperature, top_p, max_tokens, stream}`；`cfg.apiKey` 非空才带 `Authorization: Bearer <key>` 头。
- `onDelta` 存在 → `stream:true`，按行解析 `data: {...}` SSE，取 `choices[0].delta.content`；否则非流式取 `choices[0].message.content`。usage 从响应 `usage` 读取（流式末块缺 usage 时记 0）。
- 超时与外部中止合并：`AbortSignal.any([req.signal, AbortSignal.timeout(req.timeoutMs)])`（Node 22）。
- 重试：网络错误/HTTP 429/5xx → 最多 2 次重试，延迟 `500×2^n + rand(0..250)`；其他 4xx 不重试。

**步骤：**
- [ ] 测试第一组：假服务返回 canned JSON → text/usage 映射正确；服务计数器证实首响应 500、二响应 200 → 成功且 `attempts===2`；`apiKey` 时断言收到 `Bearer k-test` 头。
- [ ] 测试第二组：服务延迟 200ms 且 `timeoutMs=50` → rejects；SSE 3 块 → onDelta 收 `'A''B''C'` 且最终 text==='ABC'；无 key 配置 → 请求无 Authorization 头。
- [ ] `vitest run test/llm/openai.test.ts` 见红 → 实现 → 绿。
- [ ] commit `feat(server): OpenAI 兼容 provider（重试/超时/流式）`。

### Task 08：上下文预算装配器

**文件：** Create `src/context/assembler.ts`；Create `test/context/assembler.test.ts`。

**接口：** Consumes——`pickBudgetProfile`（Task 02）。Produces——
```ts
interface ContextSlot { name: string; content: string; budgetChars: number; stable: boolean; keep: 'head' | 'tail'; }
interface AssembledPrompt { system: string; user: string; slotReport: Array<{name: string; requestedChars: number; usedChars: number; truncated: boolean}>; }
function assembleContext(slots: ContextSlot[], totalBudgetChars: number): AssembledPrompt;
function draftSlots(input: {hardRules: string; worldview: string; styleRules?: string; blueprint: string; continuity: string; prevTail: string; fewShot?: string; task: string}, budgets: Budgets['draft']): ContextSlot[];
```
规则钉死：stable 槽依序拼入 `system`，volatile 槽依序拼入 `user`，段间 `\n\n`；单槽超预算即截断——`keep:'head'` 取前 N 字符、`keep:'tail'` 取后 N 字符；`draftSlots` 槽序固定 `[hardRules(stable,head), worldview(stable,head), styleRules?(stable,head), blueprint(volatile,head), continuity(volatile,head), prevTail(volatile,tail), fewShot?(volatile,head), task(volatile,head)]`；`prevTail` 无值时传空串则该槽跳过。

**步骤：**
- [ ] 测试第一组（稳定性）：相同 input 调两次 → `system` 逐字节相等；仅换 blueprint 内容 → `system` 仍相等、`user` 不同。
- [ ] 测试第二组（预算）：worldview 4000 字符、budget 1000 → `slotReport` 该槽 `truncated===true, usedChars===1000`，system 含其前 1000 字符；prevTail 5000 字符、budget 1500 → user 段以原 content 最后 20 字符结尾（keep tail）；`sum(used) ≤ totalBudgetChars`。
- [ ] 测试第三组：`pickBudgetProfile(32768)==='draft'`、`pickBudgetProfile(8192)==='draft8k'`；`draftSlots` 输出槽名顺序断言等于上述钉死序列。
- [ ] `vitest run test/context/assembler.test.ts` 见红 → 实现 → 绿。
- [ ] commit `feat(server): 槽位化上下文装配器（稳定前缀在前）`。

### Task 09：纯文本协议解析 + prompt 渲染契约

**文件：** Create `src/llm/plainproto.ts`、`src/prompts/{draft,qc,rewrite,summarize,blueprint}.ts`；Create `test/llm/plainproto.test.ts`、`test/prompts/contract.test.ts`。协议文样见附录 D。

**接口：** Produces——
```ts
function parseFindings(raw: string): { findings: Finding[]; overall: number | null; errors: string[] };
function parseSummary(raw: string): { summary: string; beats: string[]; openThreads: string[]; characterDeltas: Array<{name: string; stateJson: string}>; errors: string[] };
function parseBlueprint(raw: string): { goal: string; beats: string[]; mustHave: Array<{text: string; keywords: string[]}>; errors: string[] };
```
（`renderDraft/renderQc/renderRewrite/renderSummarize/renderBlueprintAuto`：签名=输入对象→string，契约由测试钉住，文案执行者自由撰写。）

**步骤：**
- [ ] 测试第一组（parseFindings）：附录 D 文样 → 3 条 finding 字段全对 + overall 7；缺 `QUOTE:` 行 → 该条丢弃且 errors 长度 +1；`OVERALL: abc` → overall===null 且 errors 含该行；CRLF 与多余空行容忍。
- [ ] 测试第二组（parseSummary + parseBlueprint）：文样往返；STATE 行 `张三={"位置":"庭院"}` → characterDeltas 一条。
- [ ] 测试第三组（prompt 契约）：`renderQc` 输出含 `'SEVERITY:'`、`'QUOTE:'`、七维度各出现一次、含输入 draft 前 20 字符；`renderDraft` 含世界观前 20 字符与禁区文本；`renderSummarize` 含 `'SUMMARY:' 'BEATS:' 'THREADS:' 'STATE:'` 四个格式标记；`renderBlueprintAuto` 含 `'GOAL:' 'BEATS:' 'MUST:'`。
- [ ] 依组红→绿，三次 commit：`feat(server): 分隔符纯文本协议解析`、`feat(server): 角色_prompt 渲染契约`。

### Task 10：L0 确定性质检

**文件：** Create `src/quality/l0.ts`、`config/quality/cliches.default.txt`、`test/quality/l0.test.ts`、`test/quality/fixtures.ts`。

**接口：** Consumes——`countChars`、`ChapterBlueprint`。Produces——
```ts
function loadCliches(path: string): { hard: RegExp[]; soft: RegExp[] };
function runL0Checks(input: {
  draft: string; targetChars: number;
  prevTexts: string[];                       // ≤3 章
  blueprint: ChapterBlueprint;
  continuity: { characters: Array<{name: string; state: object}> };
  referenceTexts?: string[];                 // few-shot 样本 + 参考原文（抄用检测）
  voiceRefMetrics?: StyleMetrics;            // Phase 3 才传
}): L0Report;
// L0Report = { checks: Array<{name: 'length'|'cliche'|'replay_ngram'|'plagiarism_ngram'|'beat_coverage'|'continuity_facts'|'style_drift'; pass: boolean; details: string}>;
//              hardFail: boolean; softMajors: number; metrics: {charCount: number; replayRatio: number} }
```
规则钉死（同全局参数表）：length ±20%；cliche 硬禁命中→fail、建议级命中→仅写 details；replay n=8 阈值 0.35；plagiarism ≥15 连续字命中→fail；beat_coverage：每条 `mustHaveBeats[].keywords` 至少一个关键词出现在 draft，否则 fail；continuity_facts：`state.deceased===true || state.absent===true` 的角色名出现在 draft → fail（Phase 1 最小对账，富化留 Phase 3）。`style_drift` 检查仅当 `voiceRefMetrics` 存在时启用（Task 29 接线）。

**步骤：**
- [ ] 写 `fixtures.ts`：`HAPPY_DRAFT`（120 字、无命中）、`SHORT_DRAFT`、`CLICHE_DRAFT`（含"这一刻，他明白了"）、`REPLAY_PAIR`（两段共享 >35% 8-gram）、`PLAGIARISM_PAIR`（含 15 连续字重合）、`BEAT_MISS_DRAFT`、`DECEASED_APPEAR_DRAFT`。
- [ ] 测试第一组：length（HAPPY 以 target=120 过、SHORT 以 target=300 fail）；cliche（CLICHE fail；建议级命中→pass 且 details 非空）。
- [ ] 测试第二组：replay（REPLAY_PAIR.draft 对 prev → fail，replayRatio>0.35）；plagiarism（PLAGIARISM fail）。
- [ ] 测试第三组：beat_coverage（BEAT_MISS fail，补齐关键词后 pass）；continuity_facts（DECEASED fail）；HAPPY 全过且 `hardFail===false, softMajars===0`。
- [ ] 依组红→绿，commit `feat(server): L0 确定性质检六项`。

### Task 11：L1 质检 + 门控

**文件：** Create `src/quality/l1.ts`、`src/quality/gate.ts`；Create `test/quality/{l1,gate}.test.ts`。

**接口：** Consumes——`LlmProvider`、`renderQc`、`parseFindings`、`assembleContext`。Produces——
```ts
async function runL1Qc(deps: {provider: LlmProvider; config: AppConfig}, input: {
  draft: string; blueprint: ChapterBlueprint; continuityText: string; round: number; chapterNo?: number;
}): Promise<L1Report>;
// L1Report = { findings: Finding[]; invalidQuotes: number; overall: number | null; parseErrors: string[]; repaired: boolean }
function decideGate(input: {l0: L0Report; l1: L1Report; roundsUsed: number; prevOverall?: number | null},
                    cfg: {scoreThreshold: number; maxRounds: number; minGain: number}):
  { action: 'pass' | 'rewrite' | 'needs_human'; reasons: string[] };
```
行为钉死：QC 温度 `quality` 用 0.2，`meta.step='qc'`，槽用 `budgets.qc`（8k 模型自动切 qc8k）；解析 errors>0 → 修复重试一次（user 追加 `repairPrompt(errors)` 固定文案），`repaired=true`；`finding.quote` 非 draft 子串 → 丢弃该条并 `invalidQuotes+1`（评议"无引用不给分"的客户端校验）。
门控判定序（钉死，短路与）：① `l0.hardFail` → rewrite（roundsUsed<max）否则 needs_human；② `l0.softMajors + majors数 ≥ 2` → 同上；③ 任一 blocker → 同上；④ `overall < scoreThreshold` → 同上；⑤ `prevOverall != null 且 (overall−prevOverall)/prevOverall < minGain` → **needs_human（无改善即停，即使轮数未满）**；⑥ 否则 pass（`overall >= scoreThreshold` 用 `>=` 含边界）。

**步骤：**
- [ ] 写 gate 表驱动测试 8 例：hardFail+rounds 满→needs_human；hardFail+rounds 未满→rewrite；softMajor×1+major×0+overall 8.5→pass；softMajor×1+major×1→rewrite；blocker×1→rewrite；overall 7.9→rewrite；overall 8.0（threshold 8.0）→pass；prevOverall 5.0→overall 5.2（增益 4%）、roundsUsed=0→needs_human。
- [ ] `vitest run test/quality/gate.test.ts` 见红 → 实现 gate.ts（纯函数）→ 绿 → commit `feat(server): 质检门控与四类终止条件`。
- [ ] 写 l1 测试（mock provider）：script 返回附录 D findings 文样 → findings 3 条、overall 7、repaired false；`{sequence:[{text:'坏格式'}, {repeat:{text:'好格式'}}]}` → repaired true 且 findings 正确；quote 不在 draft → 该条丢弃、invalidQuotes===1。
- [ ] `vitest run test/quality/l1.test.ts` 见红 → 实现 l1.ts → 绿 → commit `feat(server): L1 引用证据质检（含修复重试）`。

### Task 12：重写器

**文件：** Create `src/pipeline/rewrite.ts`；Create `test/pipeline/rewrite.test.ts`。

**接口：** Consumes——`L0Report`、`L1Report`、`ContextSlot`。Produces——
```ts
function chooseRewriteMode(l0: L0Report, l1: L1Report): 'targeted' | 'full';
function buildRewriteSlots(input: {original: string; findings: Finding[]; factBaselineText: string; mode: 'targeted'|'full'; taskInstruction: string}, budgets: Budgets['rewrite']): ContextSlot[];
```
规则钉死：`l0.hardFail || blocker 数 ≥1 || (不通过检查项数 ≥3)` → `'full'`，否则 `'targeted'`；targeted 槽序 `[hardRules(stable), original(head), findings(head, 仅 blocker+major), factBaseline(head), task(head)]`；full 槽序同 `draftSlots` 但 task 段为修订指令。**实现顺序声明（记录的简化，不改架构）**：v1 重写输出=整章修订稿（输入侧省 token），"段落 patch 协议+定点替换 UI"推迟到 Phase 4 Task 32 与 GUI 一并做。

**步骤：**
- [ ] chooseRewriteMode 表驱动 4 例：hardFail→full；1 blocker→full；仅 2 major、L0 全过→targeted；1 major+1 softMajor 且 L0 全过→targeted。
- [ ] slots 断言：targeted 槽名集 `['hardRules','original','findings','factBaseline','task']`，findings 槽含 blocker 文本、不含 minor 文本；full 槽名集与 draftSlots 一致。
- [ ] `vitest run test/pipeline/rewrite.test.ts` 红→绿→ commit `feat(server): 重写槽位与模式选择`。

### Task 13：runs 仓储 + 单章管线编排

**文件：** Create `src/db/repositories/runs.ts`、`src/llm/hash.ts`、`src/pipeline/chapter.ts`；Create `test/db/runs.test.ts`、`test/pipeline/chapter.test.ts`。

**接口：** Consumes——前述全部。Produces——
```ts
// runs 仓储（Phase 2 的 claim/heartbeat 在 Task 17 追加，不在此签名内）
function createRun(db, input: {bookId: string; mode: 'generate'|'continue'; chapterScope: {from: number; to: number}; maxRounds?: number; skipFailures?: boolean; salvagePartial?: boolean}): Run;
function updateRunStatus(db, runId: string, status: RunStatus, patch?: {startedAt?: string; endedAt?: string; error?: string}): void;
function appendStep(db, input: {runId: string; chapterId: string; step: StepName; attempt: number}): RunStep;
function markStep(db, stepId: string, patch: Partial<{status: StepStatus; startedAt: string; endedAt: string; error: string; outputVersionId: string; outputJson: object; heartbeatAt: string}>): void;
function listSteps(db, runId: string): RunStep[];
function hashPrompt(system: string, user: string): string;   // sha256 hex
async function runChapterPipeline(deps: {db: Database; provider: LlmProvider; config: AppConfig; emit: (e: RunEvent) => void; onPartial?: (text: string) => void},
                                  args: {runId: string; bookId: string; chapterNo: number; signal?: AbortSignal}): Promise<RunOutcome>;
// RunOutcome = { status: 'done' | 'needs_human' | 'failed'; finalVersionId?: string; rounds: number }
```
步骤序列钉死（每步 queued→inflight→done 短事务提交，LLM 调用在事务外；Phase 1 步集 `draft→qc→(rewrite→qc)×n→finalize`，`summarize` 由 Task 25 插入）：
1. draft：`draftSlots`（book.style_profile_id 且 mode=generate 时含 styleRules/fewShot 槽，Phase 1 恒无）→ provider(step='draft') → `appendChapterVersion(kind 'draft', promptHash, model, params:{overall 将在 qc 后回填})`。
2. qc：`runL0Checks`（prevTexts=前三章 current 内容）+ `runL1Qc` → markStep `output_json={l0,l1,gate}`；`params_json.overall` 回填到本轮版本。
3. gate=rewrite → attempt=round+1 的 rewrite step：`chooseRewriteMode` → `buildRewriteSlots`（factBaselineText=渲染后的 continuity snapshot）→ provider(step='rewrite') → `appendChapterVersion(kind 'revised', parentVersionId=当前最佳)` → 重跑 qc。循环直至 gate=pass / rounds≥run.max_rounds / 触发无改善停。
4. finalize：**最佳版本规则**=各轮版本 `params_json.overall` 最大者（相等取新），`setCurrentVersion` + `setChapterStatus('done'|'needs_human')` + markStep done。
- emit 事件：run.status（running/done/needs_human/failed）与每 step.status 变更；`onPartial` 由 provider onDelta 直通（节流在 http 层）。

**步骤：**
- [ ] 写 `test/db/runs.test.ts`：createRun 默认值（skip_failures=1 等）；appendStep/markStep 状态往返；同 `(run,chapter,step,attempt)` 重复 append 抛 UNIQUE。
- [ ] `vitest run test/db/runs.test.ts` 红→绿→ commit `feat(server): runs 仓储与 prompt_hash`。
- [ ] 写管线测试场景一（happy，maxRounds=1）：mock draft 无瑕疵、qc `OVERALL: 9` 无 findings → outcome `done, rounds=0`；run_steps 含 draft/qc/finalize 三行全 done；事件序列首 `{type:'run.status',status:'running'}` 末 `done`。
- [ ] 场景二（一轮重写）：qc sequence 首轮 findings 含 1 blocker 次轮 `OVERALL: 9` → versions=[draft, revised]、rounds===1、finalVersionId=revised 的 id、chapters.status='done'。
- [ ] 场景三（永不通过，maxRounds=1）：qc `{repeat:{blocker 文样}}` → outcome `needs_human, rounds===1`、current version=draft、chapters.status='needs_human'。
- [ ] 场景四（中止）：draft 流式中 abort → outcome `failed`、draft step 行 status='failed' 且 error 含 'AbortError'。
- [ ] 场景五（prompt 稳定性）：同输入跑两章 → 两版本 `prompt_hash` 相等（KV cache 前缀复用的前置）。
- [ ] 依场景红→绿（实现 chapter.ts），commit `feat(server): 单章管线编排（版本链与门控循环）`。

### Task 14：导出器

**文件：** Create `src/export/export.ts`；Create `test/export/export.test.ts`。

**接口：** Produces——`exportBook(db, bookId, outDir: string): Promise<{files: string[]}>`；文件名规则与内容格式钉死：`{NNN}-{safeTitle}.md`，内容 = `# 第{chapterNo}章 {title}\n\n` + `getCurrentVersion().content`；无 current_version 的章节跳过。

**步骤：**
- [ ] 测试：fixture 书 2 章（标题含非法字符 `a/b:c`）→ 导出 2 文件、文件名 `001-a_b_c.md`；文件内容包含对应版本 content 全文（`toContain`）；第 3 章无版本 → 不生成文件。
- [ ] 红→绿→ commit `feat(server): markdown 导出`。

### Task 15：REST API + SSE

**文件：** Modify `src/app.ts`；Create `src/http/{routes,sse,schemas}.ts`；Modify `packages/shared/src/api.ts`（补请求体类型）；Create `test/http/{api,sse}.test.ts`。

**接口：** Consumes——shared DTO、管线、导出。Produces 端点钉死：
- `GET /api/health`；`POST /api/books`；`GET /api/books`；`GET /api/books/:bookId`（含 chapters）
- `PUT /api/books/:bookId/chapters/:chapterNo/blueprint`；`POST /api/books/:bookId/chapters/:chapterNo/generate → 202 {runId}`（Phase 1：服务内联异步执行管线，不 await）
- `GET /api/runs/:runId`（含 steps）；`GET /api/runs/:runId/events`（SSE：先发 `event: snapshot`=run+steps，再转发 RunEvent；step.delta 每 connection 500ms 节流；15s `: ping`）；`POST /api/runs/:runId/cancel`（Phase 1 仅取消：abort 当前章）
- `GET /api/books/:bookId/chapters/:chapterNo/versions`；`GET /api/versions/:versionId`；`POST /api/versions/:versionId/rollback`（setCurrentVersion 指针移动，不复制内容）
- `POST /api/books/:bookId/export → 200 {files}`；`GET /api/books/:bookId/search?q=`
- zod 校验失败 → 400 `{error}`；未知 id → 404。

**步骤：**
- [ ] 写 `test/http/api.test.ts`（inject）：createBook 201→重复 title 允许；blueprint PUT 200 后 GET 章节含 blueprint；generate 202 返回 runId，轮询 GET run（≤10s）至 status done；versions≥1；rollback 后 getCurrentVersion 指向旧版本；export 200 且文件落盘；search 命中；zod 非法 body 400；未知 bookId 404。
- [ ] `vitest run test/http/api.test.ts` 红→实现 routes（generate 用 `runEvents` EventEmitter 广播）→绿→ commit `feat(server): REST API 与内联单章执行`。
- [ ] 写 `test/http/sse.test.ts`（`app.listen(0)` + fetch 流式读）：连接后首个事件为 `snapshot`，随后收到 `run.status` done 事件；`: ping` 出现。
- [ ] 见红 → 实现 sse.ts → 绿 → commit `feat(server): SSE 进度流（snapshot+节流+心跳）`。

### Phase 1 验收门（可执行命令形态）

```bash
pnpm -w lint && pnpm -w typecheck && pnpm -w test        # 全绿
pnpm --filter @inkforge/server exec vitest run test/e2e/phase1.mock.e2e.test.ts
curl -s http://localhost:8787/api/health                  # {"ok":true,...}
git log --oneline | wc -l                                 # ≥ 15（每任务至少一 commit）
```
`phase1.mock.e2e.test.ts` 内容钉死：脚本建书（target_chars=500）→PUT 蓝图→generate→等待 done **≤10 秒**→断言 chapters.status='done'、export 文件包含 current 版本全文、needs_human 场景 ≤1 轮必停、cancel 场景 run cancelled。全门通过才算 Phase 1 收口。

---

# Phase 2：队列、崩溃恢复与真模型接入

### Task 16：worker 进程 + supervisor + 单实例锁

**文件：** Create `src/worker/main.ts`、`src/worker/supervisor.ts`、`src/singleinstance.ts`；Modify `src/index.ts`（spawn worker）；Create `test/worker/supervisor.test.ts`。

**接口：** Produces——
```ts
function spawnWorkerSupervisor(opts: {entryPath: string; env: NodeJS.ProcessEnv}): {child: ChildProcess; stop(): Promise<void>};
// 退避序列 [1000,2000,4000,8000,15000,30000]ms，稳定运行 60s 后重置；env INKFORGE_SUPERVISOR_BACKOFF_MS 可覆盖（测试用 100）
// stdio ['ignore','inherit','inherit','ipc']；收到子进程 message {type:'ready'} 记就绪
function acquireLock(dataDir: string): {release(): void};   // data/service.pid，O_EXCL；pid 存活→SingleInstanceError
```
worker/main.ts 启动序钉死：`acquireLock(dataDir)` → `openDb`+`migrate` → 写 `data/worker.pid` → `process.send({type:'ready'})` → 进入 `workerLoop`（Task 18 接管前先空转 sleep）。

**步骤：**
- [ ] 测试一：backoff 覆盖 100ms → `child.kill()` 后 3s 内收到第二次 ready（supervisor 重启成功）；`stop()` 后子进程退出且不再重启。
- [ ] 测试二：同 dataDir 二次 `acquireLock` → 抛 `SingleInstanceError`；手动伪造死 pid 文件 → 接管成功；release 后文件消失。
- [ ] 依组红→绿；Modify `index.ts`：启动即 acquireLock + spawn supervisor，SIGINT/TERM 时 stop()。
- [ ] `pnpm -w test` 全绿 → commit `feat(server): worker 进程、supervisor 与单实例锁`。

### Task 17：租约心跳与崩溃恢复

**文件：** Modify `src/db/repositories/runs.ts`；Create `src/worker/loop.ts`；Create `test/worker/recovery.test.ts`。

**接口：** Consumes——`runChapterPipeline`（加参数 `resumeFrom?: StepName`：该步之前已 done 的步直接跳过，draft 已有版本则复用不重生成）。Produces——
```ts
function claimNextStep(db: Database, workerId: string): RunStep | null;
// 事务内：最早 queued 的活跃 run（status='running'，按 created_at）→ 其下按 (chapter_no, step 序 draft<qc<rewrite<summarize<finalize, attempt) 最早的 queued step
// 置 inflight + lease_owner=workerId + heartbeat_at=now
function heartbeatStep(db: Database, stepId: string, workerId: string): void;   // owner 不匹配则 no-op
function takeoverStaleSteps(db: Database, staleMs?: number /*默认30000*/): number;  // inflight 且 heartbeat 超时 → queued + attempt+1，清空 lease；返回接管数
function resumePoint(db: Database, runId: string, chapterId: string): StepName | null;
// 最后 done 步的下一序：draft→qc；qc done 且 output_json.gate.action==='rewrite' 且轮数未满→rewrite；rewrite done→qc；summarize done→finalize；无 queued→null
function workerLoop(deps: {db: Database; provider: LlmProvider; config: AppConfig; workerId: string; emit: (e: RunEvent) => void}): Promise<void>;
// claim→无则 sleep 500ms；有则 10s 心跳 interval（env INKFORGE_TEST_HEARTBEAT_MS=200 覆盖）+ 执行管线剩余步
```

**步骤：**
- [ ] 测试一（接管）：种子 inflight step `heartbeat_at=now−60s` → `takeoverStaleSteps(db, 30000)` 返回 1、该行 queued 且 attempt=2；heartbeat 30s 内的行不动；done 行不动。
- [ ] 测试二（claim FIFO）：两 run 各 2 章按创建序与章序 claim，顺序断言；owner 不匹配的 heartbeatStep 不更新 heartbeat_at。
- [ ] 测试三（断点续跑）：种子 run：ch1 draft done（有版本）+ partial 存在 → `resumePoint` 返回 `'qc'`；workerLoop 跑完后 ch1 draft **版本数仍为 1**（未重复生成）且 qc step done。
- [ ] 依组红→绿 → commit `feat(server): 租约心跳、stale 接管与断点续跑`。

### Task 18：队列执行器 + run 前快照

**文件：** Create `src/worker/queue.ts`、`src/db/backup.ts`；Modify `src/http/routes.ts`（加 `POST /api/runs/:id/pause`、`/resume`、`POST /api/runs/:id/chapters/:chapterNo/rerun`）；Modify `src/worker/main.ts`（接 workerLoop→queue）；Create `test/worker/queue.test.ts`、`test/db/backup.test.ts`。

**接口：** Produces——
```ts
function runQueueLoop(deps: {db: Database; provider: LlmProvider; config: AppConfig; emit: (e: RunEvent) => void}): Promise<void>;
// 取最早 queued run → backupBook → status running → 逐章顺序执行（章内复用 resumePoint）
// pause 语义：run.status='paused' → 当前章完成后退出循环（不 abort 当前请求）
// cancel 语义：abort 当前章 → run cancelled，剩余章节无 step 行
// 章失败（provider 重试后仍败）→ chapters.status='needs_human' + step 行 failed → skip_failures=1 时继续下一章，run 最终 status='done'
function backupBook(db: Database, bookId: string, backupDir: string, retain?: number /*默认5*/): string;
// VACUUM INTO '{backupDir}/{bookId}-{ts}.db'；超过 retain 删最旧
```

**步骤：**
- [ ] `test/db/backup.test.ts`：连续 6 次 → 目录仅 5 个文件且最旧被删；备份文件可被 `openDb` 打开且含 books 行。红→绿→ commit `feat(server): run 前 VACUUM INTO 快照（保留5份）`。
- [ ] `test/worker/queue.test.ts` 场景一：3 章 mock 全过 → run done、3 章章序执行顺序正确（按 step started_at 断言）。
- [ ] 场景二：ch2 draft 注入 `{repeat:{error:'http_500'}}`（provider 层重试耗尽）→ skip_failures=1 → run done、ch2 needs_human、ch3 done。
- [ ] 场景三：ch2 进行中调 cancel → run cancelled、ch3 无 step 行、run_steps 中被中止行 failed。
- [ ] 场景四：pause 于 ch1 进行中置位 → ch1 完成后 run.status='paused'、ch2 未启动；`/resume` 后继续。
- [ ] 依场景红→绿；routes 三端点 inject 测试一并绿 → commit `feat(server): concurrency=1 队列与暂停/取消/重跑`。

### Task 19：partial_outputs 抢救

**文件：** Create `src/pipeline/partial.ts`；Modify `src/pipeline/chapter.ts`（draft/rewrite 步接 flusher）、`src/http/routes.ts`；Create `test/pipeline/partial.test.ts`。

**接口：** Produces——
```ts
function createPartialFlusher(db: Database, stepId: string, opts: {everyTokens?: number /*200*/; everyMs?: number /*5000*/}): {push(delta: string): void; flush(): void; discard(): void};
// 累计 token（按 delta.length 工程近似）或计时达到阈值 → UPSERT partial_outputs
// GET  /api/runs/:runId/chapters/:chapterNo/partial → {content, updatedAt} | 404
// POST /api/runs/:runId/chapters/:chapterNo/partial/adopt → 201 VersionDto(kind 'draft', params_json.salvaged=true)；不移动 current 指针
```

**步骤：**
- [ ] 测试：`{everyTokens:10}` 推 25 字符 → ≥2 次 UPSERT（查询 updated_at 与 content 长度递增）；`flush()` 写入余量；step 成功完成时管线调 `discard()`。
- [ ] adopt inject 测试：abort 场景后 adopt → versions 多一条 kind='draft' 且 `params_json.salvaged===true`；current_version 未变。
- [ ] 红→绿→ commit `feat(server): 流式残稿落盘与一键抢救`。

### Task 20：R1 基线——真模型单章实测（关口）

**文件：** Create `apps/server/scripts/baseline-one-chapter.ts`、`docs/baseline/README.md`（记录表模板）。

**接口：** Consumes——`loadConfig`、`createOpenAiProvider`、`runChapterPipeline`。Produces——`docs/baseline/strata-baseline.json`：`{tokPerSec, firstTokenMs, perStepMs: Record<StepName, number>, usagePerStep, totalMs, model}`。首 token 计时法：draft 步走 `onDelta` 流式，首个 delta 到达时刻−请求发出时刻。

**步骤：**
- [ ] 写脚本：fixture 书（3000 字世界观、2 角色、1 章蓝图、target_chars=3000）→ 真实 provider 跑完整管线 → 写 JSON + 控制台表格。
- [ ] 连通性预检：`curl -s -H "Authorization: Bearer $INKFORGE_LOCAL_API_KEY" http://127.0.0.1:18500/v1/models`——不可达则本任务挂起等环境（不算失败，记录 [INFO_GAP] 2 仍开放）。
- [ ] 执行 `pnpm --filter @inkforge/server exec tsx scripts/baseline-one-chapter.ts`，结果落 `docs/baseline/strata-baseline.json`。
- [ ] **关口判定（钉死）**：全流程 ≤2700000ms（45 分钟）→ PASS，继续 Phase 2 后续任务；超限 → **停**：向 owner 提交回退选项（QC/planner 上云、缩上下文至 8k 档、降字数），owner 拍板后更新本计划再继续。执行者不得自行改架构。
- [ ] commit `chore: R1 基线脚本与实测结果`。

### Task 21：终止条件回归（2 轮必停 + 无改善必停）

**文件：** Create `test/phase2/{never-pass,no-improve}.test.ts`。

**接口：** Consumes——管线+mock `{repeat}`。Produces——终止条件回归基线。

**步骤：**
- [ ] never-pass：max_rounds=2、qc 恒 blocker → 断言 rewrite step 行数===2、outcome needs_human、版本链 draft+revised×2、current=overall 最高者、chapters.status='needs_human'。
- [ ] no-improve：max_rounds=5、qc overall 序列 [5.0, 5.2]（增益 4%<5%）→ 断言 rewrite 行数===1、outcome needs_human（无改善停早于轮数停）。
- [ ] `vitest run test/phase2` 绿（预期直接绿：钉住 Task 11/13 已实现行为；若红即缺陷，走 systematic-debugging 修复后再绿）。
- [ ] commit `test: 终止条件回归（2 轮上限与 5% 无改善）`。

### Task 22：kill -9 崩溃恢复压测脚本

**文件：** Create `apps/server/scripts/crash-test.mjs`。

**接口：** Consumes——service/worker/supervisor、REST API。Produces——可重复执行的恢复验证命令。

**流程钉死：** spawn `tsx src/index.ts`（service，内含 supervisor 拉起 worker）→ 轮询 health 200 → API 建书 3 章+蓝图 → `POST /api/books/:id/runs {from:1,to:3}` → 轮询 run_steps 至 ch2 draft inflight → 读 `data/worker.pid` → `process.kill(pid, 'SIGKILL')`（Windows 等效强杀）→ supervisor 重启 → 轮询 run 终态（超时 300s）→ 断言：run done、3 章 status done、每章 draft 版本数 ≤2（无重复堆积）、存在 attempt≥2 的 step 行 → 退出码 0 并打印摘要；任一断言败 → 退出码 1。

**步骤：**
- [ ] 写脚本 → 跑一次，先人工确认日志出现 "ch2 draft inflight" 与 SIGKILL 生效。
- [ ] `node scripts/crash-test.mjs` → exit 0。
- [ ] 连跑 3 次全部 exit 0（稳定性）。
- [ ] commit `test: kill -9 崩溃恢复压测脚本`。

### Task 23：最小 GUI（运行面板）

**文件：** Create `apps/web/src/{api/client.ts,hooks/useRunEvents.ts}`、`src/pages/{BooksPage,BookDetailPage,RunPage,ChapterReaderPage}.tsx`；Create `apps/web/test/{run-panel,reader}.test.tsx`；Create `apps/server/scripts/seed-mock-book.ts`。

**接口：** Consumes——shared DTO、SSE 事件。Produces——四页最小 UI：书列表；书详情（章节列表+蓝图表单+生成按钮）；运行面板（run/step 实时状态、暂停/取消/单章重跑按钮、SSE 驱动）；正文阅读（版本列表+回滚+导出按钮）。`useRunEvents(runId)`：EventSource 封装，断连 3s 自动重连并依赖 snapshot 回放。

**步骤：**
- [ ] `client.ts`：全端点类型化 fetch（DTO 从 `@inkforge/shared` 导入，禁止 any）。
- [ ] RunPage 组件测试：mock RunDto+SSE payload → step 徽标渲染 done/failed/inflight；点取消按钮断言 client 调用（vi.mock client）。
- [ ] ReaderPage 组件测试：版本列表渲染、回滚按钮触发 POST。
- [ ] `pnpm --filter @inkforge/web test` 绿。
- [ ] 黑盒目验（web-gui-tester）：`seed-mock-book.ts` 灌入 mock 书 → 起 `dev:server`+`dev:web` → 走通 创建→蓝图→生成→取消→回滚→导出，截图存 `docs/gui-verification-phase2.md`。
- [ ] commit `feat(web): 最小运行面板（GUI 已验证）`。

### Task 24：睡眠阻止 + 启动器

**文件：** Create `src/power.ts`、`scripts/start-inkforge.cmd`；Create `test/power.test.ts`。

**接口：** Produces——`keepSystemAwake(on: boolean): void`：koffi 绑 kernel32 `SetThreadExecutionState`；on=`ES_CONTINUOUS|ES_SYSTEM_REQUIRED`(0x80000001)，off=`ES_CONTINUOUS`(0x80000000)；非 win32 平台 no-op。接线：`runQueueLoop` 有活跃章时 on、空闲 off。启动器：`scripts/start-inkforge.cmd` = 启 service（内含 worker）+ `start http://localhost:8787`。

**步骤：**
- [ ] `test/power.test.ts`：vi.mock koffi → 断言 on/off 两次调用的实参值；非 win32 分支 no-op。
- [ ] 红→绿→接线 queue→ commit `feat(server): 挂机期间阻止系统睡眠`。
- [ ] 手动核：运行中 `powercfg /requests` 出现 SYSTEM 请求（结果记入 Phase 2 验收记录）。
- [ ] 跑 `scripts/start-inkforge.cmd` → 浏览器打开且 health 200。

### Phase 2 验收门（可执行命令形态）

```bash
pnpm -w lint && pnpm -w typecheck && pnpm -w test
pnpm --filter @inkforge/server exec vitest run test/phase2            # 2 轮必停 + 无改善必停
node scripts/crash-test.mjs                                            # exit 0，无重复版本
pnpm --filter @inkforge/server exec tsx scripts/baseline-one-chapter.ts  # R1 基线 JSON 已落盘且 ≤45min
node scripts/run-report.mjs --run <真模型runId>                          # 每章耗时/token/tok/s 表
```
人工门（逐项记录）：真模型 3 章连跑 ≥2 小时无人值守无干预；运行期 `powercfg /requests` 含 SYSTEM 请求；GUI 黑盒目验一次；8 小时挂机（启动器+睡眠阻止）不断。`scripts/run-report.mjs` 为 Task 26 交付，若先跑到本门，可临时用 sqlite 查询脚本替代——**为避免死行，钉死：run-report.mjs 在 Task 26 交付，本门执行顺序置于 Task 26 之后。**

---

# Phase 3：批量连产、连续性与风格

### Task 25：自动摘要与连续性抽取（summarize 步）

**文件：** Modify `src/pipeline/chapter.ts`（步序插入 summarize：draft→qc→(rewrite→qc)×n→summarize→finalize）、`resumePoint` 步序；Create `src/pipeline/summarize.ts`；Create `test/pipeline/summarize.test.ts`。

**接口：** Consumes——`parseSummary`、`renderSummarize`、continuity 仓储。Produces——
```ts
async function runSummarizeStep(deps: {db: Database; provider: LlmProvider; config: AppConfig; emit: (e: RunEvent) => void},
                                input: {runId: string; chapterId: string; chapterNo: number; finalContent: string; signal?: AbortSignal}): Promise<void>;
```
写库规则钉死：`upsertChapterSummary(beats=parse 的 beats)`；STATE 行与该角色前一章 state 浅合并后 `upsertCharacterState`；THREADS 归一化（trim+压缩空白）后与 open foreshadowings 精确匹配——命中且标 resolved → `status='resolved', resolved_ch=chapterNo`；命中且标 advanced → `status='advanced'` 并追加 advanced_json；未命中且标 planted → 新行。

**步骤：**
- [ ] 单测：附录 D summary 文样 → summary/beats/threads/deltas 四类写库断言；前 state `{位置:书房}` + delta `{位置:庭院}` → snapshot 显示庭院；resolved 行 `resolved_ch` 正确。
- [ ] e2e（mock）：单章跑完 → run_steps 含 summarize 行 done、chapter_summaries 1 行。
- [ ] 红→绿→ commit `feat(server): 自动摘要与角色状态/伏笔抽取`。

### Task 26：20 章批量 + run-report

**文件：** Modify `src/http/routes.ts`（`POST /api/books/:bookId/runs {fromChapter, toChapter, maxRounds?}`；前置校验：范围内每章必有 blueprint，否则 400）；Create `apps/server/scripts/run-report.mjs`；Create `test/e2e/phase3.batch20.e2e.test.ts`。

**接口：** Produces——`run-report.mjs --run <runId>`：读库打印每章各 step 耗时/`usage` tokens/tok/s 与总计，末行 `预计20章总时长 = Σ×比例`。

**步骤：**
- [ ] e2e：20 章 target_chars=300 mock 全过 → run done 且断言耗时 <60s（vitest timeout 120s）；ch7 注入失败 → run 仍 done、ch7 无 current_version、run-report 含 failed 章。
- [ ] `vitest run test/e2e/phase3.batch20.e2e.test.ts` 红→绿→ commit `feat: 20 章批量运行与失败章跳过`。
- [ ] 写 `run-report.mjs` → 对 batch20 库跑一次，输出含 20 行章节表。
- [ ] commit `chore: run-report 耗时/token 报表`。

### Task 27：风格采样与离线蒸馏 CLI

**文件：** Create `src/style/{sample.ts,distill.ts,cli.ts}`、`test/style/{sample,distill}.test.ts`、`test/fixtures/style-sample.txt`（≥3 万字符合成文本）。

**接口：** Produces——
```ts
function sampleReferenceText(text: string, opts?: {segmentChars?: number /*20000*/; maxSegments?: number /*20*/}): string[];
// 按 segmentChars 分块；块数 > maxSegments 时按索引 Math.floor(i * n / maxSegments) 均匀取，否则全取；确定性（同输入同输出）
function pickFewShotSamples(text: string, opts?: {count?: number /*12*/; minChars?: number /*200*/; maxChars?: number /*400*/}): string[]; // 滑窗均匀取，确定性
async function distillStyleProfile(deps: {provider: LlmProvider}, input: {name: string; sourcePath: string; samples: string[]}): Promise<string /*profileId*/>;
// LLM 仅产出量化规则（plain 协议 RULES 行）；few-shot 样本由 pickFewShotSamples 客户端确定性选取
// 写 style_profiles：source_hash=sha256(源文件)，同 source_hash 再蒸馏 → version+1 新行，旧行永不改
// 源文本为空 → exit 1，错误信息固定为「样本为空，禁止蒸馏」（样本库为空时风格注入无效的防线，来自参考项目负面结果）
// CLI：pnpm --filter @inkforge/server exec tsx src/style/cli.ts distill --source <path> --name <名称>
```

**步骤：**
- [ ] sample 测试：确定性（两次 deep equal）；40 块取 20；20 块以内全取。
- [ ] distill 测试：mock provider 返回 RULES 文样 → profile 行 rules_json/source_hash/version=1 落库；同源二次蒸馏 → version=2 新行、旧行字段逐字节不变；空源 → 抛错文案钉死。
- [ ] CLI：对 fixture 跑 `distill --source test/fixtures/style-sample.txt --name 测试档案` → 打印 profileId；`--source` 指向空文件 → exit 1。
- [ ] 依组红→绿→ commit `feat(server): 风格采样与不可变蒸馏档案 CLI`。

### Task 28：风格注入与确定性轮换

**文件：** Create `src/style/inject.ts`；Modify `src/pipeline/chapter.ts`（draft 槽接入 styleRules/fewShot；version 记 `style_sample_ids_json`）；Create `test/style/inject.test.ts`。

**接口：** Consumes——style_profiles、`draftSlots`。Produces——
```ts
function pickStyleSamples(profile: {samplesJson: StyleSample[]}, chapterNo: number, count?: number /*3*/): StyleSample[];
// startIdx = (chapterNo - 1) mod samples.length，循环取 count 个
function renderStyleBlock(rulesText: string, samples: StyleSample[], budgetChars?: number /*1200*/): string; // 超预算截断
```

**步骤：**
- [ ] 单测：len=3 时 ch1 与 ch4 选样 deep equal（轮换周期）；len=5 时 ch2 → `[s2,s3,s4]`；renderStyleBlock 预算截断。
- [ ] 管线断言：book 绑定 profile 后 generate → 版本 `style_sample_ids_json` 长度 3；mode='continue' 或无 profile → 槽名集不含 styleRules/fewShot。
- [ ] 红→绿→ commit `feat(server): 风格档案确定性轮换注入`。

### Task 29：漂移指标 + voice-match

**文件：** Create `src/style/metrics.ts`；Modify `src/quality/l0.ts`（style_drift 检查启用）、`src/prompts/qc.ts`（continue 模式文风维度对照原作样本）；Create `test/style/metrics.test.ts`、`test/quality/voice-match.test.ts`。

**接口：** Produces——
```ts
interface StyleMetrics { medianSentenceLen: number; p90SentenceLen: number; dialogueRatio: number; uniqueCharRatio: number; }
function computeStyleMetrics(text: string): StyleMetrics;
// 句子切分 /[。！？；\n]+/；dialogueRatio = 引号内字符数（“” ""） / countChars(text)；uniqueCharRatio = 去重字符数 / countChars(text)
// style_drift 判定：|draft 指标 − 基准| / 基准 ≤ 0.4 → pass；基准值为 0 的项跳过；每超带一项 → l0.softMajors + 1
// voice-match（入口 A）：基准 = 原作样本 metrics；QC renderQc 的文风维度指令替换为对照原作 few-shot
```

**步骤：**
- [ ] metrics 测试：10 句×10 字构造文本 → medianSentenceLen===10；含 1/3 引号内容 → dialogueRatio≈0.33（`toBeCloseTo`）。
- [ ] l0 集成：voiceRefMetrics 传入且超带 → `softMajors===1` 且单凭它 gate 不触发（1<2）；两项 soft（drift+套话建议级不计）另加 1 major → gate rewrite。
- [ ] continue 模式 prompt 契约：renderQc 输入含 originalSamples → 输出含原作样本前 20 字符且不含 style profile 规则。
- [ ] 依组红→绿→ commit `feat(server): 可测风格漂移与 voice-match 质检`。

### Task 30：续写模式（入口 A）

**文件：** Create `src/import/importer.ts`；Modify `src/http/routes.ts`（`POST /api/books/:bookId/import {sourcePath}`、`POST /api/books/:bookId/chapters/:chapterNo/blueprint/auto`）、管线（mode=continue：无风格槽、fewShot 取原作、QC voice-match）；Create `test/e2e/phase3.continue.e2e.test.ts`。

**接口：** Produces——
```ts
function splitChapters(text: string): Array<{title: string; content: string}>;
// 优先按 /^\s*第[0-9一二三四五六七八九十百千]+章.*$/m 分割；无命中 → 每 6000 字符在段落边界切，标题=「第N部分」
function importOriginalBook(db: Database, input: {title: string; sourceText: string}): {bookId: string; chapterCount: number};
// 章节 is_original=1、target_chars=countChars(content)、每章 appendChapterVersion(kind 'original') 并 setCurrentVersion
// renderBlueprintAuto(input: {prevTails: string[]; continuity: string; bookDescription: string}): string → parseBlueprint → upsertBlueprint
// continue run 前置校验：书内必须存在 ≥1 条 kind='original' 版本，否则 400
```

**步骤：**
- [ ] importer 单测：含 `第一章/第二章` 标头 fixture → 2 章正确切分、is_original=1、original 版本落库；无标头 13000 字符 → 3 部分。
- [ ] blueprint/auto 单测（mock planner）：parseBlueprint 往返 → chapters.blueprint_json 落库。
- [ ] e2e（合成 2 章原作 fixture）：import → auto blueprint ch3 → runs(mode continue) → 断言 slotReport 无 style 槽、有 fewShot 槽（内容=原作采样）、renderQc 收到 originalSamples、run done、voice-match softMajors 计算路径执行。
- [ ] 前置校验测试：对 generate 模式建的书调 continue run → 400。
- [ ] 依组红→绿→ commit `feat(server): 续写模式（导入+蓝图勾画+voice-match）`。

### Phase 3 验收门（可执行命令形态）

```bash
pnpm -w lint && pnpm -w typecheck && pnpm -w test
pnpm --filter @inkforge/server exec vitest run test/e2e/phase3.batch20.e2e.test.ts      # mock 20 章 <60s，失败章跳过
pnpm --filter @inkforge/server exec tsx src/style/cli.ts distill --source test/fixtures/style-sample.txt --name 测试档案   # 打印 profileId
pnpm --filter @inkforge/server exec vitest run test/e2e/phase3.continue.e2e.test.ts
node scripts/crash-test.mjs                                                             # Phase 2 行为不退化
node scripts/run-report.mjs --run <真模型runId>                                           # 输出 20 章总时长投影
```
人工门：真模型 20 章批量 ≥1 次整夜挂机成功（晨检 run-report + 抽查第 5/20 章与前文事实一致性，对应评审 R3 验证）；owner 提供样例小说后完成 1 次真实 import+3 章续写抽查。

---

# Phase 4：云端路由、GUI 完整化（可选外壳）

> Phase 4 在 Phase 3 验收门通过后另开细化计划可再拆卡；以下任务已定界面与验收，粒度满足派卡下限。

### Task 31：云端 provider 与角色路由绑定

**文件：** Modify `src/config.ts`（roles 绑定 cloud）、`src/llm/openai.ts`（`supportsJsonSchema=true` 时 qc/planner 走 `response_format: {type:'json_schema', ...}`，false 走 plain 协议——iq3_xxs 恒 plain）、`src/llm/types.ts`（usage 加 provider 标识）；Create `test/llm/routing.test.ts`。
**步骤：** 路由解析单测（qc→cloud、drafter→local）；双 mock e2e（usage 按 provider 分账）；JSON schema 分支单测。验收命令：`vitest run test/llm/routing.test.ts`。前置：[INFO_GAP] 6 已确认。
**commit：** `feat(server): 角色路由上云与 JSON schema 分支`。

### Task 32：GUI 完整化 + 定点重写

**文件：** Modify `src/http/routes.ts`（`GET /api/runs/:id/report`、`POST /api/versions/:versionId/rewrite-selection {selection, instruction} → 新 kind='revised' 版本，单轮 targeted 管线`）；Create web `DiffPage`（`diff ^8` word-diff）、`DashboardPage`（读 report）、版本详情选段重写组件。
**步骤：** report 端点 inject 测试；rewrite-selection e2e（mock，产物含 selection 上下文）；RTL 组件测试；web-gui-tester 黑盒目验后提交（GUI 已验证）。
**验收命令：** `pnpm -w test && pnpm --filter @inkforge/web test`。
**commit：** `feat(web): 版本 diff、定点重写与仪表盘（GUI 已验证）`。

### Task 33：Electron 外壳（可选，owner 下令才开工）

**文件：** Create `apps/desktop`（electron + electron-builder）：主进程仅 spawn service（含 worker）+ `BrowserWindow.loadURL('http://localhost:8787')` + 关窗时 stop()；**不承载任何业务逻辑**。
**步骤：** 打包 `exe` → 启动→页面可用→关窗进程退出（含子进程）三项人工核验。
**commit：** `feat(desktop): electron 外壳（GUI 已验证）`。

### Task 34：QC 召回率回归集

**文件：** Create `test/quality/regression/*.json`（每例：缺陷章节文本+预期命中检查名）、`apps/server/scripts/qc-recall.mjs`（输出 L0+L1 召回率）、`docs/qc-baseline.md`。
**步骤：** owner 提供 10 个已知缺陷章节（[INFO_GAP] 7）→ 录入回归集 → 跑 `node scripts/qc-recall.mjs` → 基线入档；此后 rubric 迭代不得使召回率下降（测试基线只增不减）。
**commit：** `test: QC 召回率回归集与基线`。

### Phase 4 验收门

```bash
pnpm -w lint && pnpm -w typecheck && pnpm -w test
node scripts/qc-recall.mjs            # 召回率 ≥ docs/qc-baseline.md 基线
node scripts/crash-test.mjs           # 回归不退化
```
人工门：GUI 全页面黑盒目验；（若做 Task 33）Electron 打包件冷启动三核验。

---

## 附录 A：规格基线（意向书要点 + 拍板架构）

**意向书（2026-11-11，owner 确认）**：个人使用的全自动长篇小说生成流水线（非写作编辑器），Windows 本地为主（可切云端 LLM），浏览器 GUI。入口 A 续写模式（喂入已有小说→自动勾画剧情蓝图→续写）；入口 B 生成模式（预设世界观/角色卡/规则→蓝图勾画→全新生成）。风格系统共用：预设文风+参考小说片段提取（few-shot）+离线风格蒸馏档案；**续写模式（A）不注入风格档案，用 voice-match 质检维度代替（原作正文即最强风格锚）**。核心管线：蓝图规划→章节队列→逐章生成→自动质检（L0）→自动二次审稿（L1）→≤2 轮定点重写→挂机连产 20+ 章无人值守。连续性：几十万字长篇，自动摘要/伏笔/角色状态追踪。人工介入：跑完抽查、点章重写。主力模型：本地 Strata 126B iq3_xxs（http://127.0.0.1:18500，OpenAI 兼容，需 apiKey）；云端可选。明确不做：写作编辑器、审稿流转、多人协作。

**拍板架构（8 项，2026-11-11）**：① headless 本地服务（Node 22+TS+Fastify，REST+SSE）+React 19/Vite GUI，Electron 仅后期可选；② 单文件 SQLite(WAL) 唯一真相源（better-sqlite3），正文 TEXT+append-only chapter_versions+结构化连续性表，FTS5 trigram；③ DB 持久化 run/step 状态机+独立 worker(concurrency=1)+租约心跳，每步短事务断点，崩溃从最后提交步续跑，流式残稿 partial_outputs 可抢救，启动器阻止睡眠；④ 统一 OpenAI 兼容 client（本地也支持 apiKey）+能力描述符+角色路由+上下文预算装配器（绝不整本送；32k：固定前缀2.5k/蓝图1k/连续性2.5k/上章尾1.5k/few-shot1.5k/输出5k；稳定前缀在前复用 KV cache；iq3_xxs 用分隔符纯文本+客户端解析）；⑤ L0 确定性→L1 引用证据 rubric 单 pass→门控→≤2 轮定点重写；终止=全过且分达标/轮数2/提升<5%/预算耗尽，停则标 needs_human 保留最佳版本；⑥ 风格离线蒸馏一次→不可变档案→每章确定性轮换 3 段；可测漂移指标进 QC；⑦ run 前 VACUUM INTO 快照、导出 md、永不就地覆盖、单实例锁；⑧ clean-room 合规，存证 docs/third-party-references.md。

## 附录 B：关键共享类型（packages/shared）

```ts
type RunStatus = 'queued'|'running'|'paused'|'cancelled'|'done'|'failed';
type StepName  = 'draft'|'qc'|'rewrite'|'summarize'|'finalize';
type StepStatus = 'queued'|'inflight'|'done'|'failed'|'skipped';
type ChapterKind = 'original'|'draft'|'revised'|'final'|'manual_edit';
type ChapterStatus = 'planned'|'drafting'|'in_qc'|'needs_human'|'done';
interface ChapterBlueprint { goal: string; beats: string[]; mustHaveBeats: Array<{text: string; keywords: string[]}>; bannedTopics: string[]; }
interface Finding { dimension: string; severity: 'blocker'|'major'|'minor'; quote: string; comment: string; }
type RunEvent =
  | { type: 'run.status';  runId: string; status: RunStatus; ts: string }
  | { type: 'step.status'; runId: string; chapterNo: number; step: StepName; attempt: number; status: StepStatus; ts: string }
  | { type: 'step.delta';  runId: string; chapterNo: number; step: StepName; text: string; ts: string };
// api.ts DTO：BookDto/ChapterDto/VersionDto/RunDto/RunStepDto/HealthDto 及请求体类型（字段与仓储接口一一对应）
```

## 附录 C：DDL 基线（独立设计，未复制任何参考项目 schema）

**C1 `0001_core.sql`（节选核心约束，执行者按此落盘全表）：**

```sql
CREATE TABLE books(
  id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
  style_profile_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE characters(
  id TEXT PRIMARY KEY, book_id TEXT NOT NULL REFERENCES books(id),
  name TEXT NOT NULL, base_setting TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL,
  UNIQUE(book_id, name));
CREATE TABLE chapters(
  id TEXT PRIMARY KEY, book_id TEXT NOT NULL REFERENCES books(id),
  chapter_no INTEGER NOT NULL, title TEXT NOT NULL DEFAULT '',
  is_original INTEGER NOT NULL DEFAULT 0,
  blueprint_json TEXT, target_chars INTEGER NOT NULL DEFAULT 3000,
  status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','drafting','in_qc','needs_human','done')),
  current_version_id TEXT, created_at TEXT NOT NULL,
  UNIQUE(book_id, chapter_no));
CREATE TABLE chapter_versions(
  id TEXT PRIMARY KEY, chapter_id TEXT NOT NULL REFERENCES chapters(id),
  parent_version_id TEXT,
  kind TEXT NOT NULL CHECK(kind IN ('original','draft','revised','final','manual_edit')),
  content TEXT NOT NULL, word_count INTEGER NOT NULL,
  run_id TEXT, prompt_hash TEXT, model TEXT,
  params_json TEXT NOT NULL DEFAULT '{}',
  style_sample_ids_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL);
CREATE TABLE chapter_summaries(
  id TEXT PRIMARY KEY, book_id TEXT NOT NULL, chapter_no INTEGER NOT NULL,
  summary TEXT NOT NULL, beats_json TEXT NOT NULL DEFAULT '[]',
  open_threads_json TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL,
  UNIQUE(book_id, chapter_no));
CREATE TABLE character_states(
  id TEXT PRIMARY KEY, character_id TEXT NOT NULL REFERENCES characters(id),
  chapter_no INTEGER NOT NULL, state_json TEXT NOT NULL, created_at TEXT NOT NULL,
  UNIQUE(character_id, chapter_no));
CREATE TABLE foreshadowings(
  id TEXT PRIMARY KEY, book_id TEXT NOT NULL, description TEXT NOT NULL,
  planted_ch INTEGER NOT NULL, advanced_json TEXT NOT NULL DEFAULT '[]',
  resolved_ch INTEGER,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','advanced','resolved')),
  created_at TEXT NOT NULL);
CREATE TABLE style_profiles(
  id TEXT PRIMARY KEY, name TEXT NOT NULL, source_path TEXT NOT NULL,
  source_hash TEXT NOT NULL, version INTEGER NOT NULL,
  rules_json TEXT NOT NULL, samples_json TEXT NOT NULL,
  metrics_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL);
CREATE TABLE app_meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE VIRTUAL TABLE chapter_fts USING fts5(chapter_id UNINDEXED, content, tokenize='trigram');
```

**C2 `0002_runs.sql`：**

```sql
CREATE TABLE runs(
  id TEXT PRIMARY KEY, book_id TEXT NOT NULL REFERENCES books(id),
  mode TEXT NOT NULL CHECK(mode IN ('generate','continue')),
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK(status IN ('queued','running','paused','cancelled','done','failed')),
  chapter_scope_json TEXT NOT NULL,
  skip_failures INTEGER NOT NULL DEFAULT 1,
  salvage_partial INTEGER NOT NULL DEFAULT 1,
  max_rounds INTEGER NOT NULL DEFAULT 2,
  created_at TEXT NOT NULL, started_at TEXT, ended_at TEXT, error TEXT);
CREATE TABLE run_steps(
  id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES runs(id),
  chapter_id TEXT NOT NULL REFERENCES chapters(id),
  step TEXT NOT NULL CHECK(step IN ('draft','qc','rewrite','summarize','finalize')),
  attempt INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK(status IN ('queued','inflight','done','failed','skipped')),
  lease_owner TEXT, heartbeat_at TEXT,
  started_at TEXT, ended_at TEXT, error TEXT,
  output_version_id TEXT, output_json TEXT,
  UNIQUE(run_id, chapter_id, step, attempt));
CREATE TABLE partial_outputs(
  run_step_id TEXT PRIMARY KEY REFERENCES run_steps(id),
  content TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL);
```

## 附录 D：纯文本协议文样（iq3_xxs 不依赖 JSON 的客户端解析契约）

**L1 findings 输出（模型产出）：**
```
OVERALL: 7
---
SEVERITY: blocker
DIMENSION: 设定一致
QUOTE: 他拔出佩剑向城东疾驰
COMMENT: 与连续性表冲突：上章末主角佩剑已折断
---
SEVERITY: major
DIMENSION: 节奏
QUOTE: 两人争执了许久
COMMENT: 冲突段铺陈过长，缺乏推进
---
SEVERITY: minor
DIMENSION: 结尾钩子
QUOTE: 夜色渐深
COMMENT: 收尾平缓，可加悬念
```
解析规则：块间以单独一行 `---` 分隔；每块须含 `SEVERITY/DIMENSION/QUOTE/COMMENT` 四行（缺失即丢弃该块并计 error）；`OVERALL` 为 1–10 整数，缺省或非数记 error、overall=null。

**summary 输出：**
```
SUMMARY: 主角夜探书房，发现密信，决意提前南下。
BEATS:
- 夜探书房
- 获得密信
THREADS:
- [planted] 密信落款人身份
STATE:
张三={"位置":"书房","持有":["密信"]}
```
**blueprint 输出：**
```
GOAL: 主角与旧友重逢并取得线索
BEATS:
- 渡口重逢
- 旧友示警
MUST:
- keywords: 渡口|重逢 的渡口重逢
- keywords: 密信 的密信交接
```

---

## 计划自审五查记录（writing-plans 纪律，发现问题已就地修）

1. **规格覆盖**：8 项拍板架构逐条映射——形态→T01/T15/T23；SQLite→T03/T04/T05；队列恢复→T16–T19/T22；LLM 接入→T06–T09；质检→T10–T12/T21/T34；风格→T27–T30；安全→T14/T18/T16/T24；合规→T01。初稿缺口已补：FTS 检索端点（并入 T05/T15）、run 前快照（并入 T18）、run-report（T26）、QC 回归集（T34，对应评审 R4 验证）、入口 A 不注入风格的断言（T28/T30）。
2. **步骤扫描**：每步为单一动作+可核对命令；已清除"处理其余逻辑"类死行——所有行为均落到签名、断言值或钉死规则。Phase 4 三任务粒度低于 Phase 1–3，已在节首声明"验收门通过后可再细化拆卡"，属决策而非空行。
3. **类型一致**：门控函数统一命名 `decideGate`（初稿曾混用 decideAction，已统一）；`budgets.draft` 8 槽定义与 T02 断言、T08 槽序三方一致；`run_steps.output_json` 在 C2 DDL 与 T13 断言一致；`ChapterKind` 含 `'original'` 与 T30、C1 一致；`resumePoint` 步序在 T17 与 T25 修改处衔接（summarize 插入后序为 draft→qc→rewrite→summarize→finalize）。
4. **规格隐含的输入类**：空输入（`countChars('')===0` 挂 T01；空样本禁蒸馏挂 T27）；超长输入（槽截断 keep head/tail 挂 T08）；CRLF/多余空行（协议解析挂 T09）；原作缺失即 continue run 400（挂 T30）；并发 claim 竞态（事务内 claim 挂 T17）。均已有归属测试。
5. **比例**：全文代码块仅 DDL、协议文样、类型签名与断言，无任何函数体；计划主体为决策与验收，未抄写实现。

**遗留开放项**：[INFO_GAP] 1–7（见文首）。其中 2（R1 基线）由 Task 20 在 Phase 2 内闭合；5/6/7 需 owner 在对应阶段前提供材料。

**执行约定**：本计划为卡面来源；按 dispatch-discipline 派卡执行（同工作树 ≤1 卡、执行者只 commit 不 push）；owner 审阅本计划后生效，任何架构级偏离须回到 owner 拍板。
