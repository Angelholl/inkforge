# 卡 T11A｜B5 蒸馏后台化+重蒸 · server（迁移 0008 distill_jobs + style_sources 原文留存 + 202/轮询 + 同源重蒸）

Refs: DEC-2026-1116-01（owner 反馈⑤：蒸馏同步阻塞 → 后台化 + 可重蒸）
计划真值：docs/plans/2026-11-16-four-feedbacks.md §Task11A（:563-617）
上游已交付：Task10A（`21b70c6`）后全仓 **329** 绿（server 262 + web 65 + shared 2）；Task10B 若已收口则以 T10B commit 的实收数为准并在 commit 正文注明

## 1. 实测事实（卡面自足，勿再全量勘探；行号是 Task10A 之后的实测值，计划里的旧行号已过期）

- `apps/server/src/http/routes.ts`：
  - 蒸馏模板段 **:665-679**：`getDistillTemplate()` 读 `app_meta` key=`'distill_template'`（:665-667）；GET/PUT `/api/settings/distill-template`（:669/:671-679）。
  - **POST `/api/style-profiles/distill` 在 :682-702**（同步阻塞，本卡改造对象）：`parseBody(distillStyleSchema)` → `text.replace(/\s/g,'').length < 200` → 400 `'样本为空，禁止蒸馏'` → `const provider = state.summarizerProvider ?? createRoleProvider(config, 'summarizer')`（:688）→ `pickFewShotAndHeldOut(body.text, { count: body.maxSegments })` → `fewShot.length === 0` → 400 `'样本过短，无法采样'` → `await analyzeStyle({ provider }, { sourceText, samples: fewShot, heldOut, temperature, instruction: getDistillTemplate() || undefined })` → `reply.send({ draft: { analysis, samples: fewShot, evaluation } })`；catch → 502 `{error}`。
  - POST `/api/style-profiles`（入库，无模型调用）**:704-718**。
  - 既有 202 先例：POST runs（:422-426 一带）`reply.code(202).send({ runId: run.id })`。
- `apps/server/src/style/analysis.ts`：`analyzeStyle(deps:{provider}, input:{sourceText,samples,heldOut?,instruction?,temperature?})`（:37-81，内部 `timeoutMs: 900000`，正常 2 次模型调用：分析 + held-out 自评，分析全空时多一次重试）；`saveStyleProfile(db, input:{name,source,sourcePath?,analysis,samples,evaluation?})` **:85-123** —— `sourceHash = createHash('sha256').update(input.source).digest('hex')`（:92）、`sourcePath = input.sourcePath ?? 'inline:'+hash[:8]`（:93）、同 hash `MAX(version)+1`（:94-97）、`id = randomUUID()`（:98，randomUUID 已在该文件 import）、INSERT（:104-121）。
- **原文整篇不留存**：库里只有 `style_profiles.samples_json`（few-shot 片段）+ `source_hash` + `inline:` 前缀路径；`sourceText` 只活在请求期 → 重蒸必须先有 `style_sources` 留存（本卡 0008 的一半）。
- `apps/server/src/app.ts`：`migrate(db)` 在 **:33**；`inlineQueue` 段 :44-48；`RouteState` 注入 :34-42。
- `apps/server/src/db/migrations/`：现有 0001-0007，**0008 空位可用**；全仓 `test/**` 里没有任何 `jobs` 表既有用例。
- `apps/server/src/db/repositories/runs.ts` 的 `claimNextStep/heartbeatStep/takeoverStaleSteps` 属 runs 状态机；本卡**不动 runs**（方案钉死：独立表 + 轮询，不进队列、不加 worker）。
- `packages/shared/src/api.ts`：`StyleProfileDto` :269-276、`DistillStyleBody` :278-283、`SelfEvalItemDto` :285-288、`DistillStyleDraftDto` :315-320（`{ analysis, samples: string[], evaluation }`）、`StyleProfileCreateBody` :322-328、`StyleAnalysisDto` :342-348；文件以 `ImitationBindBody`（:380-382）收尾 → 新 DTO 追加文件末尾。
- `apps/server/src/http/schemas.ts`：`distillStyleSchema` :64-69（name/text + temperature 0-1 + maxSegments int 4-20 optional）、`styleProfileCreateSchema` :71-82。

### 1.1 会被本卡打红的既有测试（必须同步适配，不得靠删断言变绿）

1. `apps/server/test/http/style.test.ts` 的 helper `distill(name)`（**:52-56**）里 `expect(r.statusCode).toBe(200)` + 直接取 `.draft` —— 接口改 202 后必红。**适配法**：helper 内部改成「POST 拿 202 `{jobId}` → 轮询 GET `/api/style-profiles/jobs/:jobId` 至 `status==='done'`（mock provider 即时返回，轮询 20ms×上限 200 次足够）→ 返回 `job.result`」；helper 的对外返回形状（`DistillStyleDraftDto`）**不变**，因此 :79-109、:123-143、:146-230（删除/fewshot 两 describe）等所有调用点无需改动。
2. 同文件用例「distill → 200 分析 draft（七维六轴+样本）且不入库」（**:59-67**）与「maxSegments 收敛 few-shot 采样量：count=4 → draft.samples ≤4」（**:111-121**）里有**直接** `expect(r.statusCode).toBe(200)` —— 这两处的断言要按新契约改写为 `202` + `jobId` 在场（这是接口变更的直接后果，属规格变更，不是「为了让测试变绿而改测试」）；其余断言（dims 取值、samples 数量、不入库计数）全部原样保留。
3. 同文件「distill 参数校验：temperature 越界 / maxSegments 越界 / 空样本 → 400」（:69-77）**不动**——两项守卫留在路由里同步返回 400（见 §3.4）。
4. `apps/server/test/style/distill.test.ts` 全部走 `distillStyleProfile` 直调（CLI/纯函数路径），不经 HTTP → 不受影响；跑完全量必须确认仍绿。
5. 迁移测试的 **user_version 硬编码坑（第三次）**：`apps/server/test/db/open.test.ts` 3 处 `toBe(7)` + 用例标题「迁移后 user_version=7、…、13 个核心对象存在…」+ 对象清单 13 项；`apps/server/test/db/migrate.test.ts` 4 处 `toBe(7)` + 用例标题 + 「0003-0007」注释 + **两处旧库回滚块**（v2 块与 v4 块，现各含 `ALTER TABLE books DROP COLUMN style_fewshot_on` 一行）→ 数字全改 8；回滚块各补 `db.exec('DROP TABLE IF EXISTS distill_jobs'); db.exec('DROP TABLE IF EXISTS style_sources');`（0008 是两张新表，回滚必须真还原到旧 schema，否则重迁时 CREATE 撞 UNIQUE/已存在）；open.test.ts 的对象清单补 `'distill_jobs'`、`'style_sources'` 两项并把标题改「15 个核心对象」。

## 2. 改动文件清单（新建 2 + 改 4 + 测试新建 1 改 2）

```
Create  apps/server/src/db/migrations/0008_distill_jobs.sql
Create  apps/server/src/style/distill-job.ts
Modify  apps/server/src/style/analysis.ts        （saveStyleProfile 尾部留原文一份）
Modify  apps/server/src/http/routes.ts           （:682-702 distill 改 202；其后增 GET job 与 POST redistill 两路由）
Modify  apps/server/src/app.ts                   （:33 migrate 之后一行 failStaleDistillJobs）
Modify  packages/shared/src/api.ts               （文件末尾增 DistillJobDto）
Test Create apps/server/test/http/distill-jobs.test.ts  （+5）
Test Modify apps/server/test/http/style.test.ts          （helper 改轮询 + 两处 statusCode 改 202）
Test Modify apps/server/test/db/migrate.test.ts / open.test.ts （§1.1-5）
```

不得改 `apps/web/**`（Task11B 地盘）、`apps/server/src/worker/**`、`apps/server/src/db/repositories/runs.ts`、`apps/server/src/style/cli.ts`、`apps/server/src/style/distill.ts`。

## 3. 改法钉死

### 3.1 迁移（整文件，计划钉死的两张表）

```sql
-- 0008：蒸馏后台化（DEC-2026-1116-01 反馈⑤）。distill_jobs=独立 job 状态机（不进 runs 队列）；
-- style_sources=按 source_hash 唯一留存整篇原文，供「重新蒸馏」复用（此前库里只有 hash 与片段，无原文）。
CREATE TABLE IF NOT EXISTS distill_jobs(
  id TEXT PRIMARY KEY, status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','done','failed')),
  progress INTEGER NOT NULL DEFAULT 0, stage TEXT NOT NULL DEFAULT '',
  error TEXT, result_json TEXT,
  base_profile_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS style_sources(
  id TEXT PRIMARY KEY, source_hash TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
  text TEXT NOT NULL, created_at TEXT NOT NULL);
```

### 3.2 `style/distill-job.ts`（新建，整文件钉死）

```ts
import { randomUUID } from 'node:crypto';
import type { AppConfig } from '../config';
import type { Database } from '../db/open';
import type { LlmProvider } from '../llm/types';
import type { DistillStyleDraftDto } from '@inkforge/shared';
import { analyzeStyle, pickFewShotAndHeldOut, saveStyleProfile } from './analysis';
```
（`pickFewShotAndHeldOut` 的实际来源文件按实测 import——它在 `style/analysis.ts` 还是 `style/samples.ts`，执行者以 `grep -rn "export function pickFewShotAndHeldOut" apps/server/src` 为准，照 routes.ts 现有 import 写法抄。**不得**新增第三处实现。）

```ts
/** 进程重启后把上次没跑完的 job 一律判失败（轮询端点不会永远挂着 running）。 */
export function failStaleDistillJobs(db: Database): void {
  db.prepare("UPDATE distill_jobs SET status = 'failed', error = 'server restarted', updated_at = ? WHERE status IN ('queued','running')").run(
    new Date().toISOString(),
  );
}

export interface DistillJobRow {
  id: string;
  status: 'queued' | 'running' | 'done' | 'failed';
  progress: number;
  stage: string;
  error: string | null;
  result_json: string | null;
  base_profile_id: string | null;
}

export function createDistillJob(db: Database, baseProfileId: string | null): string {
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare('INSERT INTO distill_jobs(id, status, progress, stage, base_profile_id, created_at, updated_at) VALUES(?,?,?,?,?,?,?)').run(
    id,
    'queued',
    0,
    'queued',
    baseProfileId,
    now,
    now,
  );
  return id;
}

export function getDistillJob(db: Database, jobId: string): DistillJobRow | undefined {
  return db.prepare('SELECT id, status, progress, stage, error, result_json, base_profile_id FROM distill_jobs WHERE id = ?').get(jobId) as
    | DistillJobRow
    | undefined;
}

function setJob(db: Database, jobId: string, patch: { status?: DistillJobRow['status']; progress?: number; stage?: string; error?: string; resultJson?: DistillStyleDraftDto }): void {
  const sets: string[] = [];
  const args: (string | number)[] = [];
  if (patch.status !== undefined) { sets.push('status = ?'); args.push(patch.status); }
  if (patch.progress !== undefined) { sets.push('progress = ?'); args.push(patch.progress); }
  if (patch.stage !== undefined) { sets.push('stage = ?'); args.push(patch.stage); }
  if (patch.error !== undefined) { sets.push('error = ?'); args.push(patch.error); }
  if (patch.resultJson !== undefined) { sets.push('result_json = ?'); args.push(JSON.stringify(patch.resultJson)); }
  sets.push('updated_at = ?');
  args.push(new Date().toISOString());
  db.prepare(`UPDATE distill_jobs SET ${sets.join(', ')} WHERE id = ?`).run(...args, jobId);
}

/** 后台蒸馏：四里程碑进度（0 创建 → 20 sampling → 30 analyzing → 100 done）；异常整枚置 failed。 */
export async function runDistillJob(
  deps: { db: Database; provider: LlmProvider; config: AppConfig; getTemplate: () => string },
  jobId: string,
  input: { name: string; text: string; maxSegments?: number; temperature?: number },
): Promise<void> {
  try {
    setJob(deps.db, jobId, { status: 'running', progress: 20, stage: 'sampling' });
    const { fewShot, heldOut } = pickFewShotAndHeldOut(input.text, { count: input.maxSegments });
    setJob(deps.db, jobId, { progress: 30, stage: 'analyzing' });
    const { analysis, evaluation } = await analyzeStyle(
      { provider: deps.provider },
      {
        sourceText: input.text,
        samples: fewShot,
        heldOut,
        temperature: input.temperature,
        instruction: deps.getTemplate() || undefined,
      },
    );
    setJob(deps.db, jobId, { status: 'done', progress: 100, stage: 'done', resultJson: { analysis, samples: fewShot, evaluation } });
  } catch (e) {
    setJob(deps.db, jobId, { status: 'failed', error: (e as Error).message });
  }
}
```

（`config` 参数按计划签名保留但当前实现里不直接用到——保留形参，勿删，Task11B 之后若要按 config 调预算可直接用；lint 若报 unused 参数，按仓库既有口径在函数体首行 `void config;` 消警，不得改成可选参数。）

### 3.3 `app.ts`

`migrate(db);`（:33）之后加一行：

```ts
  failStaleDistillJobs(db); // 蒸馏 job 是进程内异步：重启即失败，别让轮询端点挂着 running
```

并在文件头 import 列表补 `import { failStaleDistillJobs } from './style/distill-job';`。

### 3.4 `routes.ts`

- 把 POST `/api/style-profiles/distill`（:682-702）改造成（守卫仍同步、模型调用挪进 job）：

```ts
  app.post('/api/style-profiles/distill', async (req, reply) => {
    const body = parseBody(reply, distillStyleSchema, req.body);
    if (!body) return;
    if (body.text.replace(/\s/g, '').length < 200) {
      return reply.code(400).send({ error: '样本为空，禁止蒸馏' });
    }
    if (pickFewShotAndHeldOut(body.text, { count: body.maxSegments }).fewShot.length === 0) {
      return reply.code(400).send({ error: '样本过短，无法采样' });
    }
    const jobId = distillJobRepo.createDistillJob(db, null);
    void distillJobRepo.runDistillJob(
      { db, provider: state.summarizerProvider ?? createRoleProvider(config, 'summarizer'), config, getTemplate: getDistillTemplate },
      jobId,
      { name: body.name, text: body.text, maxSegments: body.maxSegments, temperature: body.temperature },
    );
    reply.code(202).send({ jobId });
  });
```

- 紧随其后新增两路由：

```ts
  // 轮询端点：queued/running/done/failed 四态 + 里程碑进度；未知 404
  app.get('/api/style-profiles/jobs/:jobId', async (req, reply) => {
    const { jobId } = req.params as { jobId: string };
    const job = distillJobRepo.getDistillJob(db, jobId);
    if (!job) return reply.code(404).send({ error: 'not found' });
    reply.send({
      id: job.id,
      status: job.status,
      progress: job.progress,
      stage: job.stage,
      error: job.error,
      result: job.result_json ? (JSON.parse(job.result_json) as DistillStyleDraftDto) : null,
    });
  });

  // 重新蒸馏（B5）：复用 style_sources 里留存的原文；未留存 → 409，绝不要求前端回传整篇原文
  app.post('/api/style-profiles/:id/redistill', async (req, reply) => {
    const { id } = req.params as { id: string };
    const profile = db.prepare('SELECT id, name, source_hash FROM style_profiles WHERE id = ?').get(id) as
      | { id: string; name: string; source_hash: string }
      | undefined;
    if (!profile) return reply.code(404).send({ error: 'not found' });
    const src = db.prepare('SELECT text FROM style_sources WHERE source_hash = ?').get(profile.source_hash) as { text: string } | undefined;
    if (!src) return reply.code(409).send({ error: '原文未留存，无法重新蒸馏' });
    const jobId = distillJobRepo.createDistillJob(db, profile.id);
    void distillJobRepo.runDistillJob(
      { db, provider: state.summarizerProvider ?? createRoleProvider(config, 'summarizer'), config, getTemplate: getDistillTemplate },
      jobId,
      { name: profile.name, text: src.text },
    );
    reply.code(202).send({ jobId });
  });
```

- import 处补：`import * as distillJobRepo from '../style/distill-job';` 与 `import type { DistillStyleDraftDto } from '@inkforge/shared';`（后者并入该文件既有 shared type import 列表；若该文件已 import 过 `DistillStyleDraftDto` 则不重复）。
- **路由冲突自查**：`GET /api/style-profiles/jobs/:jobId` 与既有 `GET /api/style-profiles/:id/versions`、`DELETE /api/style-profiles/:id` 共存——Fastify 静态段优先，`jobs/xxx` 不会被 `:id` 吞；执行者必须写一条用例（§4 例⑤之外在例①里顺带 `GET /api/style-profiles/jobs/<真 jobId>` 断言 200）并在冒烟里复核。

### 3.5 `analysis.ts`（saveStyleProfile 尾部留原文）

在 `db.prepare('INSERT INTO style_profiles...').run(...)`（:104-121）**之后**、`return { id, version };` 之前插入：

```ts
  // 0008：整篇原文按 hash 唯一留存一份，供「重新蒸馏」复用（同 hash 二次入库不覆盖）
  db.prepare('INSERT INTO style_sources(id, source_hash, name, text, created_at) VALUES(?,?,?,?,?) ON CONFLICT(source_hash) DO NOTHING').run(
    randomUUID(),
    sourceHash,
    input.name,
    input.source,
    new Date().toISOString(),
  );
```

### 3.6 `packages/shared/src/api.ts`（文件末尾追加）

```ts
/** 蒸馏后台 job（B5）：result 非空即 done；failed 时 error 是给人看的文案。 */
export interface DistillJobDto {
  id: string;
  status: 'queued' | 'running' | 'done' | 'failed';
  progress: number;
  stage: string;
  error: string | null;
  result: DistillStyleDraftDto | null;
}
```

## 4. 测试（+5 新建，另有 §1.1 的 3 组适配）

`apps/server/test/http/distill-jobs.test.ts`（新建）：照 `style.test.ts` 的 `buildApp({ config, provider, summarizerProvider: createMockProvider({ summarize: { text: ANALYSIS_TEXT } }), db, inlineQueue: true })` 形态自建夹具（可复制其 `SAMPLE_TEXT`/`ANALYSIS_TEXT` 常量，勿跨文件 import 私有常量）。轮询 helper 钉死：

```ts
async function waitJob(jobId: string, timeoutMs = 20000): Promise<DistillJobDto> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const r = await app.inject({ method: 'GET', url: `/api/style-profiles/jobs/${jobId}` });
    expect(r.statusCode).toBe(200);
    const job = r.json() as DistillJobDto;
    if (job.status === 'done' || job.status === 'failed') return job;
    if (Date.now() > deadline) throw new Error(`job 未收敛：${JSON.stringify(job)}`);
    await new Promise((r2) => setTimeout(r2, 20));
  }
}
```

- 例①「POST distill → 202 {jobId} 且不入库；轮询到 done 后 result.analysis.dims 非空」：断言 `statusCode===202`、body 有 `jobId`、**此刻** `SELECT COUNT(*) FROM style_profiles` 为 0；`waitJob` 后断言 `job.status==='done'`、`job.progress===100`、`job.result.analysis.dims['节奏']` 非空、`job.error===null`。
- 例②「入库后 style_sources 出现对应 source_hash 行」：POST `/api/style-profiles` → 201 → `SELECT text, name FROM style_sources WHERE source_hash = (SELECT source_hash FROM style_profiles WHERE id=?)` 有 1 行且 `text` 长度 > 200；同文再入库一次 → style_sources 仍 1 行（ON CONFLICT DO NOTHING）。
- 例③「redistill 已留存档案 → 202 → done → 再入库 → 同 hash version=2」：先入库拿 pid → POST `/api/style-profiles/${pid}/redistill` → 202 → waitJob done → 用 `job.result` 再 POST `/api/style-profiles`（同 name 同 text）→ 201 且 `version===2`；断言新 job 的 `base_profile_id===pid`（GET job 时把该字段也回出来，或在测试里直查 distill_jobs 行——**以 GET 响应为准**：job DTO 里没 base_profile_id，故直查库行 `SELECT base_profile_id FROM distill_jobs WHERE id=?`）。
- 例④「redistill 未留存原文的档案 → 409」：直插一行 `style_profiles`（不走 saveStyleProfile，source_hash 用一个 style_sources 里没有的值）→ POST redistill → 409 且 `error` 含「原文未留存」；未知 pid → 404。
- 例⑤「failStaleDistillJobs 把 queued/running 置 failed 且不动 done」：手工 INSERT 三枚 job（queued、running、done）→ 调 `failStaleDistillJobs(db)` → 前两枚 `status='failed'` 且 `error='server restarted'`，第三枚仍 `'done'`。

## 5. 验收命令（硬序，任一环失败即停并回报）

```
pnpm typecheck && pnpm lint
pnpm --filter @inkforge/server exec vitest run test/http/distill-jobs.test.ts test/http/style.test.ts test/db/migrate.test.ts test/db/open.test.ts test/style/distill.test.ts
pnpm --filter @inkforge/server exec vitest run
pnpm test        # 全仓；开工基线 = 329（Task10A 后；若 Task10B 已收口则 +4），本卡后应 ≥ 基线+5，只增不减
```

判据：定向 5 文件全绿；typecheck/lint 0 错；server 包全绿；全仓 ≥ 基线+5。既有断言不得改删来「变绿」（§1.1 列出的适配除外：helper 内部改轮询、两处 statusCode 断言按新契约写 202、user_version 数字/回滚行/对象清单）。

## 6. 冒烟（真实服务，非 GUI；GUI 归 owner 真实测试）

隔离四件套：独立 `INKFORGE_DATA_DIR` + `INKFORGE_CONFIG_FILE`、`INKFORGE_PORT=**8798**`、`INKFORGE_MOCK=1`；生产库 `apps/server/data/` 与其下 `backups/` 禁碰；脚本放仓库外临时目录并用 `python -I` 跑；停栈按端口 `netstat -ano | grep LISTENING` → PID → `taskkill //F //PID`（Git Bash `kill $!` 杀不掉 Windows node）。脚本按序核（判据 = HTTP 状态码 + 响应 JSON + 直查临时库行）：
1. `POST /api/style-profiles/distill`（≥200 字文本）→ **202** + `jobId`；立即 `GET /api/style-profiles/jobs/:jobId` → 200 且 status ∈ {queued,running,done}（mock 下多半已 done）；轮询到 done 断言 progress=100、result.analysis 非空。
2. `POST /api/style-profiles` 入库 → 直查临时库 `style_sources` 有该 hash 行。
3. `POST /api/style-profiles/:pid/redistill` → 202 → 轮询 done。
4. 造一枚「无原文」档案（直插 style_profiles 行）→ redistill → **409**；未知 id → 404。
5. **重启进程**（先 taskkill 再重起）：对一个还在 running 的 job 场景不易复现，改为直插一枚 `status='running'` 的 job 行 → 重启进程 → `GET` 该 job → `status='failed'`、`error='server restarted'`（确证 failStaleDistillJobs 真在启动路径上跑，不是只被测试调）。
6. `GET /api/style-profiles/jobs/<不存在的 id>` → 404。

## 7. 约束

- 同工作树只有你在跑；**只 commit 不 push**；逐文件 `git add`；永不 `--no-verify`；永不 `git add -A`。
- 生产库与 `apps/server/data/backups/` 禁碰；`.env` 值不得抄入任何入库文件。
- 不得改 `apps/web/**`、`apps/server/src/worker/**`、`apps/server/src/db/repositories/runs.ts`、`apps/server/src/style/cli.ts`、`apps/server/src/style/distill.ts`。
- 卡面与实测冲突以实测为准，并在 commit 正文逐条记「卡面勘正」。

## 8. commit 模板（单 commit）

```
feat(server): 蒸馏后台化（distill_jobs+202+轮询）；style_sources 原文留存与同源重蒸

verify: 定向 5 文件 <N> 绿；server 包 <N> 绿；全仓 <N> 绿（基线 <实收数>）；typecheck 0 错；lint 0 错；冒烟=<逐条结论，含重启后 running job 置 failed>；secret 扫描零新增；pnpm audit --prod 与基线一致
GUI: 未验证（owner 口径：真实测试由 owner 本人做）
卡面勘正: <逐条列出实测冲突>
执行: <派发/亲执情况>
Refs: DEC-2026-1116-01
```

## 9. 计划勘正（写卡时按实测纠正，执行者按本卡为准）

1. 计划的行号是 Task10A 之前的：distill 路由实际在 **routes.ts:682-702**（Task10A 新增两路由把它推后了）；`saveStyleProfile` 实际在 **analysis.ts:85-123**（计划写 :85-119）；`migrate(db)` 在 **app.ts:33**（与计划一致）。
2. 计划说「:617/:692 附近增三路由」——实测只需新增 **2** 条（GET job、POST redistill）；第三条（distill 本体）是**改造**既有路由，不是新增。
3. 计划 Task11A 未预见 **user_version 硬编码坑第三次**（open.test.ts 3 处 + migrate.test.ts 4 处 + 两处旧库回滚块 + 对象清单/标题），Task8A/Task10A 已两次踩中，本卡 §1.1-5 逐行钉死。
4. 计划 Task11A 测试清单未列 **style.test.ts 的 helper 与两处 statusCode 断言会被 202 打红**（该文件里 distill 有 10+ 个用例间接依赖 helper；只改 helper 内部即可，别去动各用例）。
5. 计划把 `runDistillJob` 的 deps 写成含 `config`，实测当前实现不需要它（analyzeStyle 不吃 config）——保留形参以贴计划，用 `void config;` 消 lint unused，不得删参。
6. 「采样完成 progress=20」这一里程碑在 mock 下几乎瞬间跨过，轮询端点大概率只观察到 30/100；断言不得写死「一定看到 20」（本卡例①只断言最终 100）。
7. 计划 §Task11A 未写「两项守卫必须留在路由里同步 400」——若不留，`样本为空/样本过短` 会变成 202 后 job 失败，既有 :69-77 的 400 用例语义就丢了；本卡 §3.4 钉死守卫同步。
8. 计划未写 `style_sources` 与 `style_profiles` 的关系是「按 source_hash 唯一、不随版本重复」；redistill 用的 name 沿用**被重蒸档案**的名字（不是 job 入参），本卡 §3.4 钉死。

## 10. 卡外（勿做）

- Task11B（web 轮询 UI、重新蒸馏入口）不在本卡。
- 不动 SSE、不动 runs/run_steps、不加 worker 子进程、不做 job 取消端点（0.3 缓议）。
- 0.3 缓议项（多选绑定、.epub、persona 模板、仿写预览可编辑）勿动。
