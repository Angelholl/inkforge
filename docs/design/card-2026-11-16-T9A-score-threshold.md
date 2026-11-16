# 卡 T9A｜B3 评分解释+可调 · server（入库分阈值持久化 + 章级生效 + OVERALL 四档锚点 + 版本质检明细端点）

Refs: DEC-2026-1116-01（owner 反馈③：评分看不懂、阈值不可调）
计划真值：docs/plans/2026-11-16-four-feedbacks.md §Task9A（计划里的行号有两处与实际不符，本卡已按实测行号钉正，见 §1 末「计划勘正」）

## 1. 背景与根因（卡面自足，不必再勘探）

工作树 `I:\inkforge`，分支 `master`。实测事实（直接用）：

- 入库分阈值 `scoreThreshold` 目前**只有 config 默认值**（`apps/server/src/config.ts:76` 定义 `quality:{targetChars,scoreThreshold,minGain,maxRounds}`；`:188` 默认 `{targetChars:3000, scoreThreshold:8.0, minGain:0.05, maxRounds:2}`），**没有任何持久化/覆盖通道**；管线消费点 `apps/server/src/pipeline/chapter.ts:300`：
  `const gate = decideGate({ l0, l1, roundsUsed: rounds, prevOverall }, { ...config.quality, maxRounds });`
  （`maxRounds` 在 `:91` 从 run 行取：`const maxRounds = runRow?.maxRounds ?? config.quality.maxRounds;`）
- 门禁判定 `apps/server/src/quality/gate.ts`：`decideGate(input, cfg:{scoreThreshold,maxRounds,minGain})`；达标分支 `:57-59` 的 reason 文本是 **`overall ${l1.overall} < ${cfg.scoreThreshold}`**（本卡测试据此断言）；`:61` pass 时 reasons=`['全过且分达标']`。
- qc 步已把明细写进 run_steps（`chapter.ts:301`）：`finishStep('qc', qcAttempt, { outputVersionId: currentVersion.id, outputJson: { l0, l1, gate, usageProvider } })`；版本 params 另有 `{overall}`（`:302` setVersionParams）。→ 「版本 → 质检明细」可直接按 `run_steps.output_version_id` 反查，无需新表。
- `app_meta(key TEXT PRIMARY KEY, value TEXT NOT NULL)`（0001_core.sql:45）已存在，upsert 先例在 `routes.ts:649`（distill_template）。
- qc 输出协议解析 `apps/server/src/llm/plainproto.ts`（`parseFindings`）：只认「行首大写键 + 冒号」形态 `^([A-Z]+)\s*[:：]\s*(.*)$` 且键 ∈ KEYS∪{OVERALL}；OVERALL 值再取该行内首个数字串。**因此以 `【OVERALL 锚点】` 开头的说明行不会被解析成 OVERALL**（行首是 `【`，不是 A-Z），加锚点不破坏协议。
- qc 任务文本 `apps/server/src/prompts/render.ts:57-75` `renderQcTask()`：七维度清单 → `【输出格式】…` 行（:61）→ 四行字段说明（:62-65）→ `示例：`（:66）→ 示例块（:67-72）→ 负约束（:73）。**现状完全没有评分档位解释**（只说「1-10 整数」）。该文本在 `l1.ts:53` 被拼进 user 消息（`firstUser = assembled.user + '\n\n' + renderQcTask()`）。
- settings 读写 `apps/server/src/settings.ts`（48 行）：zod `settingsSchema`（全 string/enum）+ `configFilePath()` + `readSettingsFile()` + `writeSettingsFile()`（tmp+rename 原子写）。**注意：settings 路由的 schema 不在 schemas.ts，而是本地定义于 `routes.ts:38-46`（settingsPutSchema）**；`parseBody(reply, schema, req.body ?? {})` 先例见 `routes.ts:930-937`。
- settings 路由实际行号：GET `routes.ts:894-907`，PUT `:909-927`（返回 `{saved:true, restartRequired:true}`），`buildApp` 函数收尾 `}` 在 `:928`。
- versions 段现状：GET 列表（信封 `{currentVersionId, versions}`）、GET 单取、rollback、**DELETE（Task8A 新增，紧接 rollback 之后）**；`GET /api/versions/:versionId/qc` 尚不存在。
- `packages/shared/src/api.ts` 里 **没有** SettingsDto / GateDto / QcDto；`VersionDto.params` 是 `object`，`RunStepDto.outputJson` 是 `object`。

**计划勘正（写卡时按实测纠正，执行者照本卡即可）**：① 计划写「settings 段 :871-903」→ 实为 `:894-927`；② 计划写「gate 调用 :287」→ 实为 `:300`；③ 计划写「schemas.ts :181 后新增 qualityPutSchema」— settings 类 schema 事实上在 routes.ts 本地，本卡仍按计划在 schemas.ts 新增并 import（更整洁），执行者不必去改 routes.ts 的本地 settingsPutSchema。

## 2. 改动文件清单（改 6 + 测试改 2）

```
Modify  apps/server/src/settings.ts            （文件尾新增 readScoreThreshold / writeScoreThreshold；补 Database 类型 import）
Modify  apps/server/src/http/schemas.ts        （新增 qualityPutSchema）
Modify  apps/server/src/http/routes.ts         （settings 段尾新增 GET/PUT /api/settings/quality；versions 段 DELETE 之后新增 GET /api/versions/:versionId/qc）
Modify  apps/server/src/pipeline/chapter.ts    （:91 旁读阈值；:300 gate cfg 改传）
Modify  apps/server/src/prompts/render.ts      （renderQcTask 内插一行 OVERALL 锚点）
Modify  packages/shared/src/api.ts             （SettingsQualityDto / VersionQcAttemptDto / VersionQcDto）
Test Modify apps/server/test/http/settings.test.ts     （+3 用例）
Test Modify apps/server/test/pipeline/chapter.test.ts  （+1 用例）
```

不得改 `apps/server/src/quality/gate.ts`（判定序与 reason 文案不动）、不得改 `apps/web/**`（属 Task9B）、不得改既有 0001-0006 迁移、**不需要新迁移**（app_meta 已存在）。

## 3. 改法钉死

### 3.1 `settings.ts` 文件尾新增（DB 侧，与既有文件侧并存）

文件头 import 补一行：`import type { Database } from './db/open';`

```ts
/** 入库分阈值存 app_meta 的键名（B3：阈值属运行时数据，故存 DB 而非 config.json，改值无需重启）。 */
export const SCORE_THRESHOLD_KEY = 'quality_score_threshold';

/** 读入库分阈值：缺失、非数字或越界 [1,10] → undefined（调用方回落 config 默认）。 */
export function readScoreThreshold(db: Database): number | undefined {
  const row = db.prepare('SELECT value FROM app_meta WHERE key = ?').get(SCORE_THRESHOLD_KEY) as { value: string } | undefined;
  if (!row) return undefined;
  const n = Number(row.value);
  if (!Number.isFinite(n) || n < 1 || n > 10) return undefined;
  return n;
}

/** 写入库分阈值（upsert，沿用 routes.ts 里 app_meta.distill_template 的 ON CONFLICT 手法）。 */
export function writeScoreThreshold(db: Database, scoreThreshold: number): void {
  db.prepare('INSERT INTO app_meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(
    SCORE_THRESHOLD_KEY,
    String(scoreThreshold),
  );
}
```

（既有 `settingsSchema` 不必扩：阈值不写 config.json。）

### 3.2 `schemas.ts` 新增（紧接文件内既有 schema 之后即可）

```ts
export const qualityPutSchema = z.object({ scoreThreshold: z.number().min(1).max(10) });
```

### 3.3 `routes.ts` 四条新路由

1) 紧接 PUT /api/settings 之后（现 `:927` 之后、`buildApp` 收尾 `}` 之前）：

```ts
  // ── 质量阈值（B3：app_meta 持久化，章级生效，改值不重启）──
  app.get('/api/settings/quality', async (req, reply) => {
    const stored = readScoreThreshold(db);
    reply.send({ scoreThreshold: stored ?? config.quality.scoreThreshold, isDefault: stored === undefined });
  });

  app.put('/api/settings/quality', async (req, reply) => {
    const body = parseBody(reply, qualityPutSchema, req.body ?? {});
    if (!body) return;
    writeScoreThreshold(db, body.scoreThreshold);
    reply.send({ saved: true, restartRequired: false });
  });
```

2) 紧接 `app.delete('/api/versions/:versionId', …)` 之后：

```ts
  // 版本 → 质检明细（B3 解释性）：qc 步 outputJson 已存 l0/l1/gate，按 output_version_id 反查
  app.get('/api/versions/:versionId/qc', async (req, reply) => {
    const { versionId } = req.params as { versionId: string };
    if (!chaptersRepo.getVersion(db, versionId)) return reply.code(404).send({ error: 'not found' });
    const rows = db
      .prepare("SELECT attempt, output_json FROM run_steps WHERE output_version_id = ? AND step = 'qc' AND status = 'done' ORDER BY attempt")
      .all(versionId) as Array<{ attempt: number; output_json: string }>;
    const attempts = rows.map((r) => {
      const oj = JSON.parse(r.output_json || '{}') as {
        l0?: object;
        l1?: object;
        gate?: { action?: string; reasons?: string[] };
      };
      return {
        attempt: r.attempt,
        l0: oj.l0 ?? {},
        l1: oj.l1 ?? {},
        gate: { action: oj.gate?.action ?? 'unknown', reasons: oj.gate?.reasons ?? [] },
      };
    });
    reply.send({ attempts });
  });
```

3) import 补：`import { readScoreThreshold, writeScoreThreshold } from '../settings';`（该文件已从 `'../settings'` 引 `configFilePath/readSettingsFile/writeSettingsFile`，并入同一行即可）；schema import 行（现 `:21` 的长 import）补 `qualityPutSchema`。

### 3.4 `pipeline/chapter.ts` 生效口径（钉死：每章管线入口读一次 DB）

- `:91` 之后插一行：

```ts
  // B3：入库分阈值可入库覆盖；每章管线开始读一次 → run 内逐章生效、单章中途不变（改值无需重启）
  const scoreThreshold = readScoreThreshold(db) ?? config.quality.scoreThreshold;
```

- `:300` 改为：

```ts
      const gate = decideGate({ l0, l1, roundsUsed: rounds, prevOverall }, { scoreThreshold, minGain: config.quality.minGain, maxRounds });
```

- import 补：`import { readScoreThreshold } from '../settings';`
- `targetChars`/`minGain`/`maxRounds` 的其余用法一律不动。

### 3.5 `prompts/render.ts` OVERALL 四档锚点

`renderQcTask()` 数组内、`'示例：'` 那一行**之前**插一行（照抄，勿改字）：

```ts
    `【OVERALL 锚点】1=废稿：复文、套话或剧情硬伤密集，无法修复；5=不合格：存在多项 major，人物或逻辑明显失真，须整章大改；8=可入库：至多个别 minor 瑕疵，节奏、人物与对话符合蓝图；10=范文级：无可指摘，可作展示样章。`,
```

（解析安全性已实测确认：`parseFindings` 只认行首大写键+冒号，`【OVERALL 锚点】…` 行首是 `【`，不会被当 OVERALL 取值；模型即便回显该行也不污染协议。）

### 3.6 `packages/shared/src/api.ts` 新增

紧接 `VersionListDto` 之后：

```ts
export interface SettingsQualityDto {
  scoreThreshold: number;
  isDefault: boolean;
}

export interface VersionQcAttemptDto {
  attempt: number;
  l0: object;
  l1: object;
  gate: { action: string; reasons: string[] };
}

export interface VersionQcDto {
  attempts: VersionQcAttemptDto[];
}
```

## 4. 测试（+4）

### 4.1 `apps/server/test/http/settings.test.ts`（+3，追加进既有 describe 或新建一个 describe 均可，setup 复用现成的 `app`/`db`）

1. `PUT /api/settings/quality` body `{scoreThreshold: 9}` → 200 且 body `{saved:true, restartRequired:false}`；随后 `GET /api/settings/quality` → `{scoreThreshold: 9, isDefault: false}`。
2. `PUT /api/settings/quality` body `{scoreThreshold: 11}` → 400（zod 越界）。
3. 非法持久化值回落：直接 `db.prepare("INSERT INTO app_meta(key,value) VALUES('quality_score_threshold','abc') ON CONFLICT(key) DO UPDATE SET value=excluded.value").run()` → `GET /api/settings/quality` → `{scoreThreshold: 8, isDefault: true}`（回落 config 默认 8.0；用例 setup 未改 quality 默认）。

### 4.2 `apps/server/test/pipeline/chapter.ts` 侧（`test/pipeline/chapter.test.ts`，+1）

场景：同一 mock（qc 恒 `OVERALL: 8`、draft/rewrite/summarize 用既有 mock 手法、run 的 maxRounds=2）跑两遍，差别只在 app_meta 是否覆盖阈值：

```ts
  it('入库分阈值 app_meta 覆盖生效：overall 8 遇阈值 9 判 rewrite（reasons 含「< 9」），未覆盖时判 pass', async () => {
    const upsert = (v: string | null): void => {
      if (v === null) db.prepare("DELETE FROM app_meta WHERE key = 'quality_score_threshold'").run();
      else db.prepare("INSERT INTO app_meta(key, value) VALUES('quality_score_threshold', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(v);
    };
    const qcText = 'OVERALL: 8';
    const runOnce = (): { action: string; reasons: string[] } => {
      const bid = createBook(db, { title: `阈值测试书 ${Math.random().toString(36).slice(2)}` }).id;
      db.prepare('INSERT INTO chapters(id, book_id, chapter_no, title, blueprint_json, target_chars, created_at) VALUES(?,?,?,?,?,?,?)').run(
        `th-ch-${bid}`, bid, 1, '第1章', JSON.stringify({ goal: '阈值场景', beats: [], mustHaveBeats: [], bannedTopics: [] }), 500, new Date().toISOString(),
      );
      const runId = `run-${Math.random().toString(36).slice(2)}`;
      db.prepare("INSERT INTO runs(id, book_id, mode, max_rounds, chapter_scope_json, created_at) VALUES(?,?, 'generate', 2, ?, ?)").run(
        runId, bid, JSON.stringify({ from: 1, to: 1 }), new Date().toISOString(),
      );
      const provider = createMockProvider({
        draft: { textFn: (m) => `【章${m.chapterNo}阈】独有开头。` + '阈'.repeat(480) },
        qc: { repeat: { text: qcText } },
        rewrite: { textFn: (m) => `【章${m.chapterNo}阈】重写后。` + '改'.repeat(480) },
        summarize: { text: 'SUMMARY: 第1章完成。\nBEATS:\n- 完成\nTHREADS:\nSTATE:' },
      });
      return runChapterPipelineSyncGates({ db, provider, config, emit: () => {} }, { runId, bookId: bid, chapterNo: 1 });
    };
    // …（runOnce 内 await runChapterPipeline 后取 listSteps(db, runId).find(s => s.step==='qc' && s.attempt===1)!.outputJson 的 gate）
    try {
      upsert('9');
      const overridden = await runOnce();
      expect(overridden.action).toBe('rewrite');
      expect(overridden.reasons.some((r) => r.includes('< 9'))).toBe(true);
      upsert(null);
      const defaulted = await runOnce();
      expect(defaulted.action).toBe('pass');
    } finally {
      upsert(null);
    }
  }, 60000);
```

（上面 `runChapterPipelineSyncGates` 只是示意：实际直接 `await runChapterPipeline(...)` 后再 `listSteps(db, runId)` 取 qc attempt=1 的 `outputJson` 里的 `gate`；helper 里把那一步返回即可。断言只取**第一轮** qc 的门禁，第二轮不在断言范围。）

## 5. 验收命令（硬序，任一环失败即停并回报）

以下命令均在项目根目录执行（cwd 已是仓库根）：

```
pnpm --filter @inkforge/server exec vitest run test/http/settings.test.ts test/pipeline/chapter.test.ts
pnpm typecheck && pnpm lint
pnpm --filter @inkforge/server exec vitest run
pnpm test        # 全仓；开工基线 = 313 全绿（Task8B 后），本卡后应 ≥317，只增不减
```

判据：定向 2 文件全绿；typecheck/lint 0 错；server 包全绿；全仓 ≥317 全绿。既有断言一律不得改删来「变绿」（本卡不动 gate.test.ts、api.test.ts）。

## 6. 约束

- 同工作树只有你在跑；**只 commit 不 push**；逐文件 `git add`；永不 `--no-verify`；永不 `git add -A`。
- 生产库 `apps/server/data/` 与其下 `backups/` 禁碰；测试一律 mkdtemp 临时目录。
- 不得改 `gate.ts` 判定序与 reason 文案；不得改 `apps/web/**`；不得加迁移文件。
- `.env` 值不得抄入任何入库文件。
- 卡面与实测冲突时以实测为准，并在 commit 正文逐条记「卡面勘正」。

## 7. Produces（Task9B 消费，务必按此形状交付）

- `GET /api/settings/quality` → `SettingsQualityDto { scoreThreshold: number; isDefault: boolean }`
- `PUT /api/settings/quality` body `{scoreThreshold:number}`（1-10，越界 400）→ `{saved:true, restartRequired:false}`
- `GET /api/versions/:versionId/qc` → `VersionQcDto { attempts: [{ attempt, l0, l1, gate:{action,reasons} }] }`；版本不存在 404 `{error:'not found'}`；无 qc 记录 → `attempts: []`
- qc 任务文本新增【OVERALL 锚点】行（四档：1/5/8/10）

## 8. commit 模板（单 commit）

```
feat(server): 入库分阈值持久化+章级生效；OVERALL 四档锚点；版本质检明细端点

verify: 定向 settings/chapter <N> 绿；server 包 <N> 绿；全仓 <N> 绿（基线 313）；typecheck 0 错；lint 0 错
卡面勘正: <逐条列出实测冲突>
GUI: 未验证（本卡纯 server，GUI 目验属 Task9B）
Refs: DEC-2026-1116-01
```

## 8.5 主审实测勘正（亲执期回填，后续卡照此避坑）

1. **`apps/server/test/prompts/contract.test.ts` 必须同步改（计划与本卡 §2 清单均未列）**：其「七维度各一次」断言是对**全文**计数（`out.split(d).length - 1`），而 OVERALL 锚点行的散文里含维度名「节奏」→ 计数变 2 → 红。正解：把该断言收窄到七维度清单行（`out.split('\n').filter(l => l.startsWith('- '))`），另加一条锚点契约用例（四档文案在场 + `out.split('\n').filter(l => l.startsWith('OVERALL'))` 恰为 `['OVERALL: 6']`，即锚点行不会被 `parseFindings` 误取为 OVERALL 值）。
2. 计划 Task9A 未给 `GET /api/versions/:versionId/qc` 配测试；按「新功能必带回归」在 `test/http/versions-delete.test.ts` 补 1 例（造 qc 步 output_json 断言 attempts 映射 + 未知版本 404）。
3. 实测新增 **+6**（settings 3 / chapter 1 / qc 明细 1 / 契约 1），非卡面 §4 预估 +4；全仓 313 → **319**。
4. 冒烟踩坑（通用）：**Git Bash 的 `kill $!` 杀不掉 Windows 上的 node 进程**，残留旧 server 占端口会让「新路由 404」的假象出现；按端口 `netstat -ano | grep LISTENING` 取 PID 再 `taskkill //F //PID` 才可靠。跨进程重启复读是证明「阈值真落 DB 而非内存」的关键判据。

## 9. 卡外（勿做）

- web 侧「设置→质量」分区、三入口 maxRounds 选择器、阅读器图例行、`VersionQcPanel` = Task9B。
- B1 效果门（owner 盲评）由主模型另做。
