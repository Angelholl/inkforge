# 卡 T8A｜B2 章节版本硬删 · server（迁移 0006 + 删除事务 + 列表瘦身 + 报表解耦）

Refs: DEC-2026-1116-01（owner 裁决①：章节版本 = 硬删 + 删前快照 + 墓碑）
计划真值：docs/plans/2026-11-16-four-feedbacks.md §Task8A｜规格：docs/design/plan-2026-11-16-four-feedbacks.md §一.1、§三.1

## 1. 背景与根因（卡面自足，不必再勘探）

工作树 `I:\inkforge`，分支 `master`。以下为已实测事实，直接照用：

- 仓储层**没有任何**版本删除函数；`apps/server/src/http/routes.ts` **没有** `DELETE /api/versions/:id`（versions 段只有 GET 列表 :755-760、GET 单取 :762-767、rollback :769-775）。
- `apps/server/src/db/repositories/chapters.ts:235` `listVersions` 用 `SELECT *` → 列表把每版**全文**都吐给前端（N 版 = N 份全文）。
- 报表 `GET /api/runs/:runId/report`（routes.ts:778-809）的 usage **只**从「版本行 `params_json.usage`」取（:796-800）→ 版本被硬删后 usage 直接归零。draft/rewrite 两个 run_step 目前只写 `outputVersionId`、不写 `outputJson`（`pipeline/chapter.ts:266`、`:377`）。
- `apps/server/src/db/backup.ts` 的 prune 过滤是 `f.startsWith(`${bookId}-`)`，而新家族名 `${bookId}-predelete-…` **也以该前缀开头** → 两家族会互相误删，prune 必须按「家族」精确隔离。
- 迁移最新序号 = **0005**（`0001_core`…`0005_round4_scope`）；`migrate.ts` 按文件名序 + `user_version` 推进，新脚本自动生效。
- `chapter_versions` 的 `parent_version_id` 无外键；current 指针在 `chapters.current_version_id`（亦无外键）；`run_steps.output_version_id` 无外键（0002_runs.sql:20）。
- 全仓库 `listVersions` 消费点（已清点）：server src 仅 routes.ts:759；server test：`api.test.ts:62`、`import.test.ts:74`、`distill.test.ts:122/137`、`phaseA.mock.e2e.test.ts:73`（**读 content**）、`polish.test.ts:90`（repo 直调、不读 content）、`repositories.test.ts:84`、`routing-e2e.test.ts:72`、`termination.test.ts:67`、`chapter.test.ts:114`、`continue.test.ts:89`（均不读 content）；web：`client.ts:131`、`ChapterReaderPage.tsx:14`、`DiffPage.tsx:22`、`BookSamplePicker.tsx:40`（本卡**不动 web**）。

## 2. 改动文件清单（新建 1 + 改 7 + 测试：新建 1 / 改 5）

```
Create  apps/server/src/db/migrations/0006_chapter_version_tombstone.sql
Modify  apps/server/src/db/backup.ts                       （全文件重构，现 :1-36）
Modify  apps/server/src/db/repositories/chapters.ts        （listVersions :235-238 改造；文件尾新增三函数 + 一类型）
Modify  apps/server/src/db/repositories/books.ts           （deleteBook :208 之后插一行）
Modify  apps/server/src/pipeline/chapter.ts                （draft finishStep :266；rewrite finishStep :377）
Modify  apps/server/src/http/routes.ts                     （versions 段 :759 列表形状 + :775 后新增 DELETE；report :792-803）
Modify  packages/shared/src/api.ts                         （VersionDto :46 后新增两型；ReportStepDto :90-95 增一字段）
Test Create apps/server/test/http/versions-delete.test.ts  （+8 用例）
Test Modify apps/server/test/db/backup.test.ts             （+1 用例）
Test Modify apps/server/test/db/migrate.test.ts            （硬编码 5 → 6：4 处断言 + 1 行 revert，见 §3.9，不新增用例）
Test Modify apps/server/test/http/api.test.ts              （响应形状适配，见 §3.8）
Test Modify apps/server/test/http/import.test.ts           （同上）
Test Modify apps/server/test/style/distill.test.ts         （同上）
Test Modify apps/server/test/e2e/phaseA.mock.e2e.test.ts   （列表已无 content，改走 GET /api/versions/:id）
```

**本卡不得改 `apps/web/**`**（属 Task8B）。不得改 0001–0005 迁移文件。

## 3. 改法钉死

### 3.1 新建迁移 `0006_chapter_version_tombstone.sql`（无 FK：删书级联由 books.ts 显式清）

```sql
-- B2 裁决①（DEC-2026-1116-01）：章节版本硬删留痕。墓碑只留元数据，不存正文。
-- 无外键：删书时由 books.ts deleteBook 显式清孤儿墓碑（见 §3.4）。
CREATE TABLE IF NOT EXISTS chapter_version_tombstones(
  id TEXT PRIMARY KEY,
  chapter_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  run_id TEXT,
  word_count INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  deleted_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tombstones_chapter ON chapter_version_tombstones(chapter_id);
```

### 3.2 `backup.ts` 全文件重构（两家族前缀互相包含 → prune 必须按家族精确圈定）

整文件替换为：

```ts
import fs from 'node:fs';
import path from 'node:path';
import type { Database } from './open';

let seq = 0;

/** 文件名时间戳：ms + 定宽 4 位序号（定宽 → 字典序即时间序）。 */
function stamp(): string {
  seq = (seq + 1) % 10000;
  return `${Date.now()}-${String(seq).padStart(4, '0')}`;
}

function escapeForRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** VACUUM INTO 快照 + 按「家族」prune：familyRe 精确圈定本家族，绝不误伤同前缀的另一家族。 */
function vacuumSnapshot(db: Database, backupDir: string, prefix: string, familyRe: RegExp, retain: number): string {
  fs.mkdirSync(backupDir, { recursive: true });
  const target = path.join(backupDir, `${prefix}${stamp()}.db`);
  db.prepare('VACUUM INTO ?').run(target);
  const mine = fs.readdirSync(backupDir).filter((f) => familyRe.test(f)).sort();
  for (const f of mine.slice(0, Math.max(0, mine.length - retain))) {
    try {
      fs.rmSync(path.join(backupDir, f), { force: true });
    } catch {
      /* Windows 锁瞬态 */
    }
  }
  return target;
}

const plainRe = (bookId: string): RegExp => new RegExp(`^${escapeForRegExp(bookId)}-(?!predelete-)\\d+-\\d{4}\\.db$`);
const predeleteRe = (bookId: string): RegExp => new RegExp(`^${escapeForRegExp(bookId)}-predelete-\\d+-\\d{4}\\.db$`);

/** run 前 VACUUM INTO 快照：{backupDir}/{bookId}-{ts}-{seq}.db；同书保留最近 retain 份。返回备份路径。 */
export function backupBook(db: Database, bookId: string, backupDir: string, retain = 5): string {
  return vacuumSnapshot(db, backupDir, `${bookId}-`, plainRe(bookId), retain);
}

/** 硬删版本/删书前快照（DEC-2026-1116-01 ①）：{bookId}-predelete-{ts}-{seq}.db，与 backupBook 家族互不 prune。默认留 3 份。 */
export function backupBookPredelete(db: Database, bookId: string, backupDir: string, retain = 3): string {
  return vacuumSnapshot(db, backupDir, `${bookId}-predelete-`, predeleteRe(bookId), retain);
}
```

`backupBook` 的对外签名与「保留最近 retain 份」行为不变（既有 `backup.test.ts` 首用例必须照旧绿）。**VACUUM INTO 不得在 `db.transaction` 内调用。**

### 3.3 `chapters.ts`：列表瘦身 + 三新函数

- 新增导出类型（紧接 `ChapterVersion` 定义之后）：`export type VersionListItemDto = Omit<ChapterVersion, 'content'>;`
- 新增私有映射 `toVersionListItem(r: VersionRow)`：字段与 `toVersion`（:78-93）逐一对齐，**独缺 `content`**。
- `listVersions` 改造（同名、同排序规则、去 content）：

```ts
export function listVersions(db: Database, chapterId: string): VersionListItemDto[] {
  // rowid 决胜：同毫秒时间戳下保持插入序（新版本在前）。B2：列表不取正文，正文走 getVersion 单取。
  return (
    db
      .prepare(
        'SELECT id, chapter_id, parent_version_id, kind, word_count, run_id, prompt_hash, model, params_json, style_sample_ids_json, created_at FROM chapter_versions WHERE chapter_id = ? ORDER BY created_at DESC, rowid DESC',
      )
      .all(chapterId) as VersionRow[]
  ).map(toVersionListItem);
}
```

- 文件尾新增：

```ts
/** 该版本是否被「活 run」（queued/running/paused）的某步引用为产物。 */
export function findActiveRunRef(db: Database, versionId: string): { runId: string; status: string } | undefined {
  return db
    .prepare(
      "SELECT rs.run_id AS runId, r.status AS status FROM run_steps rs JOIN runs r ON r.id = rs.run_id WHERE rs.output_version_id = ? AND r.status IN ('queued','running','paused') LIMIT 1",
    )
    .get(versionId) as { runId: string; status: string } | undefined;
}

/**
 * 硬删一个版本并留墓碑（DEC-2026-1116-01 ①）：
 * ① INSERT 墓碑（id/chapter_id/kind/run_id/word_count/created_at 取原行，deleted_at=now，墓碑 id = 原版本 id）
 * ② 子版本 parent_version_id 置 NULL（断孤链，不级联删子）
 * ③ DELETE 原行。行不存在返回 false。不动 chapters.current_version_id（调用方已拦截 current）。
 */
export function deleteChapterVersionWithTombstone(db: Database, versionId: string): boolean {
  const tx = db.transaction((vid: string): boolean => {
    const row = db
      .prepare('SELECT id, chapter_id, kind, run_id, word_count, created_at FROM chapter_versions WHERE id = ?')
      .get(vid) as { id: string; chapter_id: string; kind: string; run_id: string | null; word_count: number; created_at: string } | undefined;
    if (!row) return false;
    db.prepare(
      'INSERT INTO chapter_version_tombstones(id, chapter_id, kind, run_id, word_count, created_at, deleted_at) VALUES(?,?,?,?,?,?,?)',
    ).run(row.id, row.chapter_id, row.kind, row.run_id, row.word_count, row.created_at, new Date().toISOString());
    db.prepare('UPDATE chapter_versions SET parent_version_id = NULL WHERE parent_version_id = ?').run(vid);
    db.prepare('DELETE FROM chapter_versions WHERE id = ?').run(vid);
    return true;
  });
  return tx(versionId);
}
```

`getVersion`（:240，含 content）与 `appendChapterVersion`/`setCurrentVersion`/`setVersionParams` **签名与语义不变**；`chapter_fts` 不动（FTS 按章索引一份正文，删非 current 版本不影响）。

### 3.4 `books.ts` deleteBook：防孤儿墓碑

现 :208（`DELETE FROM chapter_versions …`）之后、`DELETE FROM chapters` 之前插一行：

```ts
    db.prepare('DELETE FROM chapter_version_tombstones WHERE chapter_id IN (SELECT id FROM chapters WHERE book_id = ?)').run(id);
```

### 3.5 `pipeline/chapter.ts`：两步落 outputJson（报表解耦的前提）

- :266 → `finishStep('draft', 1, { outputVersionId: draftVersion.id, outputJson: { usage: draftRes.usage, provider: roleLabel('drafter') } });`
- :377 → `finishStep('rewrite', rwAttempt, { outputVersionId: revised.id, outputJson: { usage: rwRes.usage, round: rounds, provider: roleLabel('rewriter') } });`
- 版本 `params` 内的 usage **保留**（历史报表兼容），两处只是新增 `outputJson` 键。

### 3.6 `routes.ts`：列表形状 + DELETE 路由 + 报表 usage 解析序

1) GET 列表（:759）改为包壳：

```ts
    reply.send({ currentVersionId: chapter.currentVersionId ?? null, versions: chaptersRepo.listVersions(db, chapter.id) });
```

2) 紧接 rollback 路由（:775）之后新增 DELETE（四步顺序**钉死**，owner §三.1）：

```ts
  app.delete('/api/versions/:versionId', async (req, reply) => {
    const { versionId } = req.params as { versionId: string };
    const v = chaptersRepo.getVersion(db, versionId);
    if (!v) return reply.code(404).send({ error: 'not found' });
    const chapter = chaptersRepo.getChapterById(db, v.chapterId);
    if (!chapter) return reply.code(404).send({ error: 'not found' });
    if (chapter.currentVersionId === versionId) {
      return reply.code(409).send({ error: '当前版本不可删除（先回滚到其他版本）', reason: 'current' });
    }
    const active = chaptersRepo.findActiveRunRef(db, versionId);
    if (active) {
      return reply.code(409).send({ error: `版本被 ${active.status} 状态的运行引用，暂不可删除`, reason: 'run-active', runStatus: active.status });
    }
    // 快照先于删除事务（VACUUM INTO 不能在事务内）；目录沿用 queue.ts:47 的按书子目录惯例
    backupBookPredelete(db, chapter.bookId, path.join(config.dataDir, 'backups', chapter.bookId));
    chaptersRepo.deleteChapterVersionWithTombstone(db, versionId);
    reply.send({ ok: true });
  });
```

- 错误形状沿用仓库既有约定 `{ error: string }`，409 **额外**附 `reason`（run-active 时再附 `runStatus`）；不得改成嵌套 `{ error: { code, message } }`。
- 需 import：`backupBookPredelete`（`'../db/backup'`）；`path` 与 `config` 该文件已在用（export 路由 :859 即 `path.join(config.dataDir, …)`），若缺则补 import。

3) report 路由 stepRows（:792-803）解析序改为 `outputJson.usage` → 版本 `params.usage` → 零，并在「有 outputVersionId 但版本行已消失」时标 `versionDeleted`：

```ts
        let usage = { promptTokens: 0, completionTokens: 0 };
        let versionDeleted: boolean | undefined;
        const outV = st.outputVersionId ? chaptersRepo.getVersion(db, st.outputVersionId) : undefined;
        if (st.outputVersionId && !outV) versionDeleted = true;
        const oj = st.outputJson as { usage?: { promptTokens?: number; completionTokens?: number } } | undefined;
        const u = oj?.usage ?? (outV?.params as { usage?: { promptTokens?: number; completionTokens?: number } } | undefined)?.usage;
        if (u) usage = { promptTokens: u.promptTokens ?? 0, completionTokens: u.completionTokens ?? 0 };
        totalPrompt += usage.promptTokens;
        totalCompletion += usage.completionTokens;
        return { step: st.step, attempt: st.attempt, ms, usage, ...(versionDeleted ? { versionDeleted: true } : {}) };
```

（`versionDeleted` 仅在为真时附键，避免既有 `toEqual` 整对象断言因多键而炸；totals 累加语义不变。）

### 3.7 `packages/shared/src/api.ts`

`VersionDto`（:33-46）之后新增：

```ts
export type VersionListItemDto = Omit<VersionDto, 'content'>;

export interface VersionListDto {
  currentVersionId: string | null;
  versions: VersionListItemDto[];
}
```

`ReportStepDto`（:90-95）体内新增一行：`  versionDeleted?: boolean;`

（`chapters.ts` 的 `VersionListItemDto` 与 shared 同形各落一份：shared 是跨端真值，server 侧不反向 import 以免包环。）

### 3.8 既有测试形状适配（不新增用例，只改断言形状）

- `test/http/api.test.ts:62-66`：`versions.json() as { currentVersionId: string | null; versions: Array<{ id: string; kind: string }> }`，`expect(body.versions.length).toBeGreaterThanOrEqual(1)`，`const list = body.versions;`（其余 rollback 逻辑不动）。
- `test/http/import.test.ts:74-78`：`as { versions: Array<{ kind: string }> }`，`expect(body.versions).toHaveLength(1)`、`expect(body.versions[0].kind).toBe('original')`。
- `test/style/distill.test.ts:122-123` 与 `:137-138`：`as { versions: Array<{ styleSampleIds: string[] }> }`，断言走 `body.versions.some(...)` / `body.versions2.versions.every(...)`。
- `test/e2e/phaseA.mock.e2e.test.ts:73-75`：列表已无 content，改为「列表取 id → 单取正文」：

```ts
    const versions = await app.inject({ method: 'GET', url: `/api/books/${bookId}/chapters/1/versions` });
    const finalizeVersionId = (run as RunWithStepsDto).steps.find((s) => s.step === 'finalize')!.outputVersionId!;
    const cur = (versions.json() as { versions: Array<{ id: string }> }).versions.find((v) => v.id === finalizeVersionId)!;
    const curFull = (await app.inject({ method: 'GET', url: `/api/versions/${cur.id}` })).json() as { content: string };
    expect(content).toContain(curFull.content);
```

- `test/http/polish.test.ts:90` **无需改**（repo 直调 + 子集 cast）。测试内一律内联 cast，不必 import shared DTO。

### 3.9 `test/db/migrate.test.ts` 勘正（计划未预见的硬编码，属本卡必改）

计划写「迁移装卸由既有 migrate.test.ts 覆盖（跑绿即可）」，但该文件把 `user_version` **硬编码为 5**，加 0006 后必红。只改数字与 revert 行，**不删任何用例**：

- :29 用例标题里的 `user_version=5`（两处）→ `6`；
- :33 `toBe(5)` → `toBe(6)`；
- :49-56 revert 块末尾补一行 `db.exec('DROP TABLE IF EXISTS chapter_version_tombstones');`（维持注释所述「schema 真实还原」）；
- :76 `toBe(5)` → `toBe(6)`；
- :88 `toBe(5)` → `toBe(6)`；:113 `toBe(5)` → `toBe(6)`。
- :42 的 `indexes` 断言用 `name IN (?, ?)` 白名单，**不受新索引影响，不动**。

## 4. 新增测试（+9）

### 4.1 `apps/server/test/http/versions-delete.test.ts`（新建，+8）

setup 抄 `test/http/books-delete.test.ts:21-25` 形态：`fs.mkdtempSync(os.tmpdir()+'inkforge-versions-delete-')` → `loadConfig({ STRATA_BASE_URL:'http://127.0.0.1:47831/v1', STRATA_API_KEY:'strata', STRATA_MODEL:'iq3_xxs', INKFORGE_DATA_DIR: dir })` → `openDb(path.join(config.dataDir,'inkforge.db'))` → `buildApp({ config, provider: createDefaultMockProvider(), db, inlineQueue: true })`；`afterAll` 关 app/db 并 `fs.rmSync`。
造数据用 helper（直插 SQL，勿跑真管线）：

```ts
// beforeAll 内：建书 + 建章
const created = await app.inject({ method: 'POST', url: '/api/books', payload: { title: '删除测试书' } });
bookId = (created.json() as { id: string }).id;
await app.inject({ method: 'PUT', url: `/api/books/${bookId}/chapters/1/blueprint`, payload: { title: '第一章', blueprint: { goal: 'g', beats: [], mustHaveBeats: [], bannedTopics: [] }, targetChars: 500 } });
chapterId = (db.prepare('SELECT id FROM chapters WHERE book_id = ? AND chapter_no = 1').get(bookId) as { id: string }).id;

function addVersion(kind: 'draft' | 'revised', opts: { parent?: string; runId?: string } = {}): string {
  const id = `v-${Math.random().toString(36).slice(2)}`;
  db.prepare(
    'INSERT INTO chapter_versions(id, chapter_id, parent_version_id, kind, content, word_count, run_id, params_json, style_sample_ids_json, created_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
  ).run(id, chapterId, opts.parent ?? null, kind, `正文-${id}`, 4, opts.runId ?? null, '{}', '[]', new Date().toISOString());
  return id;
}

function addRunReferencing(status: 'queued' | 'running' | 'paused' | 'done', versionId: string): void {
  const runId = `r-${Math.random().toString(36).slice(2)}`;
  db.prepare("INSERT INTO runs(id, book_id, mode, status, chapter_scope_json, created_at) VALUES(?,?, 'generate', ?, '{\"from\":1,\"to\":1}', ?)").run(
    runId, bookId, status, new Date().toISOString(),
  );
  db.prepare("INSERT INTO run_steps(id, run_id, chapter_id, step, attempt, status, output_version_id) VALUES(?,?,?,'draft',1,'done',?)").run(
    `rs-${runId}`, runId, chapterId, versionId,
  );
}
```

用例（每个用例自带独立版本行，current 指针在需要时 `setCurrentVersion(db, chapterId, id)`）：

1. **current 拒删**：`v=addVersion('draft')` → `setCurrentVersion` → `DELETE /api/versions/${v}` 得 409，body 含 `reason:'current'` 且 `error` 含「当前版本不可删除」；版本行仍在。
2/3/4. **活 run 引用拒删**（`queued` / `running` / `paused` 各一，独立版本行）：非 current + `addRunReferencing(status, v)` → 409，body 含 `reason:'run-active'`、`runStatus === status`。
5. **done run 引用放行**：`addRunReferencing('done', v)` → 200 `{ok:true}`，版本行消失。
6. **有子版本 → 子行 parent 置 NULL**：`v1=addVersion('draft')`、`v2=addVersion('revised',{parent:v1})`，current=v2 → `DELETE v1` 得 200，`SELECT parent_version_id FROM chapter_versions WHERE id=v2` 为 `null`，v2 行仍在。
7. **无引用删除留墓碑 + 删前快照落盘**：`v=addVersion('draft')`（记下原 kind/word_count/created_at）→ 200；断言：① `chapter_version_tombstones` 中 `id=v` 行存在且 `kind/word_count/created_at` 等于原行、`deleted_at` 非空；② 原行消失；③ `fs.readdirSync(path.join(dir,'backups',bookId)).filter(f=>f.includes('-predelete-')).length >= 1`；④ `pragma_table_info('chapter_version_tombstones')` 列名集合恰为 `['id','chapter_id','kind','run_id','word_count','created_at','deleted_at']`（**无 content**，迁移在场）。
8. **不存在 404**：`DELETE /api/versions/no-such-version` → 404 `{error:'not found'}`。

### 4.2 `apps/server/test/db/backup.test.ts`（+1）

```ts
  it('plain 与 predelete 两家族同目录互不 prune（各留各的 retain）', () => {
    const backupDir = path.join(dir, 'backups-mixed', bookId);
    for (let i = 0; i < 4; i++) backupBookPredelete(db, bookId, backupDir, 3);
    for (let i = 0; i < 2; i++) backupBook(db, bookId, backupDir, 5);
    const listed = fs.readdirSync(backupDir).filter((f) => f.endsWith('.db'));
    expect(listed.filter((f) => f.includes('-predelete-'))).toHaveLength(3); // 4 → prune 到 3
    expect(listed.filter((f) => !f.includes('-predelete-'))).toHaveLength(2); // 不被 predelete prune 误伤
    backupBook(db, bookId, backupDir, 5);
    expect(fs.readdirSync(backupDir).filter((f) => f.includes('-predelete-'))).toHaveLength(3); // 反向也不误伤
  });
```

（需在文件顶部 import 处补 `backupBookPredelete`。）

## 5. 验收命令（硬序，任一环失败即停并回报）

以下命令均在项目根目录执行（cwd 已是仓库根）：

```
pnpm --filter @inkforge/server exec vitest run test/http/versions-delete.test.ts test/db/backup.test.ts test/db/migrate.test.ts
pnpm typecheck && pnpm lint
pnpm --filter @inkforge/server exec vitest run
pnpm test        # 全仓；开工基线 = 296 全绿，本卡后应 ≥305（只增不减）
```

判据：定向 4 文件全绿；typecheck/lint 0 错；server 包全绿；全仓全绿且测试数 ≥305。**不得**通过删/改既有断言来「变绿」——§3.8/§3.9 列出的适配之外，既有断言一律不动。

## 6. 约束

- 同工作树只有你在跑；**只 commit 不 push**。
- 永不 `--no-verify`；永不 `git add -A`（逐文件 add）。
- 生产库 `apps/server/data/` 与其下 `backups/` **禁碰**；测试一律 `mkdtemp` 临时目录（`INKFORGE_DATA_DIR` 指向临时 dir）。
- 墓碑表不存 content（裁决①钉死：只留痕、不留正文）。
- 不得改 `apps/web/**`、不得改 0001–0005 迁移、不得改 `appendChapterVersion`/`getVersion` 签名。
- `.env` 值不得抄入任何入库文件。
- 卡面若有与实测冲突之处：以实测为准改动，并在 commit 正文逐条记「卡面勘正」。

## 7. commit 模板（单 commit）

```
feat(server): 章节版本硬删+删前快照+墓碑；版本列表去 content；报表 usage 解耦

verify: 定向 versions-delete/backup/migrate <N> 绿；server 包 <N> 绿；全仓 <N> 绿（基线 296）；typecheck 0 错；lint 0 错
卡面勘正: <migrate.test.ts 硬编码 user_version=5、phaseA e2e 读列表 content、其他实测冲突，逐条列出>
Refs: DEC-2026-1116-01
```

## 8. Produces（Task8B 消费，务必按此形状交付）

- `VersionListDto { currentVersionId: string | null; versions: VersionListItemDto[] }`（GET 列表新形状）
- `DELETE /api/versions/:versionId` → 404 `{error}` / 409 `{error, reason:'current'|'run-active', runStatus?}` / 200 `{ok:true}`
- `ReportStepDto.versionDeleted?: boolean`
- 单版正文一律走 `GET /api/versions/:versionId`（列表已无 content）

## 9. 卡外（勿做）

- web 侧删除钮 / current 回退 / Diff 配对 / Dashboard「版本已删」列 = Task8B。
- GUI 黑盒目验 = Task8B（本卡纯 server，无需）。
- **已知计划缺口，主审留账**：`BookSamplePicker.tsx:40-43` 亦读 `listVersions` 的 `content`，计划 Task8B 文件清单漏列该文件 → 由主审在 8B 卡面补入，执行者不必处理。
