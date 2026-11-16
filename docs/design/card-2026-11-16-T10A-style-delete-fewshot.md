# 卡 T10A｜B4 档案删除+逐书文风示例开关 · server（迁移 0007 + DELETE 档案 409-if-bound + 示例开关 + fewShot 注入门控）

Refs: DEC-2026-1116-01（裁决②档案有绑定拒删、裁决④文风示例全局默认关+逐书开关）
计划真值：docs/plans/2026-11-16-four-feedbacks.md §Task10A（:488-531）
规格真值：docs/design/plan-2026-11-16-four-feedbacks.md §三.2 / §三.4
上游已交付：Task9B（`af4388f`）后全仓 **324** 绿（web 65 + server 257 + shared 2）

## 1. 实测事实（卡面自足，勿再全量勘探）

- **`apps/server/src/db/repositories/styles.ts` 不存在**（计划文件清单误写）。风格档案读写实际在：
  - `apps/server/src/style/analysis.ts:85` `saveStyleProfile(db, input): { id, version }`
  - `apps/server/src/style/distill.ts:45-47` `getLatestProfile(db, profileId)`（`SELECT * FROM style_profiles WHERE id = ?`）
  - 档案列表/版本列表投影**内联在 routes.ts**（`:606-618` 列表、`:621-638` 版本列表、`:592-595` 绑定前按 id 取档案）→ 本卡删除同样走**路由内联 SQL**，不新建 repository。
- 引用风格档案 id 的列**只有一处**：`books.style_profile_id`（`0001_core.sql:1-3`，纯 TEXT，**无外键约束**）。`books.imitation_profile_id` 指 imitation_profiles、`chapter_versions.style_sample_ids_json` 只存样本 id，均与本卡无关。→ 判「有无绑定」只需 `SELECT id, title FROM books WHERE style_profile_id = ?`。
- `apps/server/src/http/routes.ts`：现有 style 路由 = PUT 绑定 `:582-604`（解绑语义 `body.profileId === null` → `setBookStyleProfile(db, bookId, null)` 并清快照）、GET 列表 `:606-618`、GET 版本 `:621-638`、POST distill `:657-677`、POST 入库 `:679-693`。**无 DELETE**。409 先例：`:97-106`（删书拦活动 run，中文 error）、版本删除 `:786-790`（409 带结构化 reason）。
- `apps/server/src/db/repositories/books.ts`：`Book` `:4-15`、`BookRow`（私有）`:22-32`、`toBook` `:34-36`、`createBook` `:38-75`（返回**手写字面量** `book` 对象，非读库回读）、`getBook` `:77-80`、`listBooks` `:82-84`（`SELECT *` + toBook）、`setBookStyleProfile` `:97-110`、单列 update 先例 `setBookImitation` `:113-119`。
- GET 透出通道：`routes.ts:197-202` `reply.send({ ...book, chapters, runs })` → Book 新字段自动透出；`routes.ts:94` GET /api/books 直接回 `listBooks(db)`。
- `apps/server/src/pipeline/chapter.ts`：风格素材装配 `:176-211`（`book.styleProfileId` 守卫在 `:183`，样本采集 `:208-209`）；**fewShot 块装配 `:214`**（`const fewShotBlock = styleSamples.length > 0 ? renderStyleBlock(...) : undefined;`），注入 draft 槽 `:237`、full 重写槽 `:349`（targeted 重写不吃该槽）；**抄用检测 `:281-290`**，其中 `:289` `referenceTexts: runMode === 'generate' && styleSamples.length > 0 ? styleSamples.map((s) => s.text) : undefined`。`book` 在该作用域可见（`:183` 已用 `book.styleProfileId`）。
- 抄用检测的可观测出口：`apps/server/src/quality/l0.ts:156-157` —— `referenceTexts` 存在与否**不改变 pass 文案**（都写「无 ≥15 连续字重合」），但命中时 push `{ name: 'plagiarism_ngram', pass: false, details: '发现 ≥15 连续字与参考文本重合' }`；`hasLongCopy`（`:87-96`）= 去空白后参考文本的**任一 15 字符窗口**出现在去空白 draft 内即命中。qc 步 outputJson 结构 `{ l0, l1, gate, usageProvider }`（`chapter.ts:304`）→ 读 `run_steps.output_json` 即可断言，**无需 spy**。
- `apps/server/src/db/migrate.ts`：按文件名序只跑 `version > user_version` 的脚本、每脚本单事务并推进 user_version。0007 用 plain `ALTER TABLE ADD COLUMN` 与既有 `0004`（outline 列）/`0005`（两列 + runs.kind）同款，不引入新范式。
- `packages/shared/src/api.ts`：`BookDto` `:8-18`（含 `styleProfileId?: string`、`styleSnapshotJson?: string | null`、`imitationProfileId?: string | null`）。
- `apps/server/src/http/schemas.ts`：books 相关 `createBookSchema:3`、`bookMetaPutSchema:10`、`styleBindSchema:53-55`；文件末尾是 `foreshadowingUpdateSchema`（`:174-183`）→ 新 schema 追加文件末尾。

### 1.1 会被本卡打红的既有测试（必须同步适配，不得改删断言本身）

1. `apps/server/test/db/open.test.ts`：`toBe(6)` **3 处**（:41、:64、:71）+ 用例标题「迁移后 user_version=6…」(:38) → 全改 7。核心对象清单（13 项）**不变**（0007 只加列不加表）。
2. `apps/server/test/db/migrate.test.ts`：`toBe(6)` **4 处**（:33、:77、:89、:115）+ 用例标题「…user_version=6…」(:29) + 注释「0003-0006」两处（:46-47）→ 改 7 / 「0003-0007」。两处**旧库回滚块**必须同步撤销 0007 的增量物，否则 `migrate()` 重跑 ALTER 时撞「duplicate column」：
   - v2 回滚块（:49-57 之后）补 `db.exec('ALTER TABLE books DROP COLUMN style_fewshot_on');`
   - v4 回滚块（:102-107 之后）补同一行
3. `apps/server/test/pipeline/chapter.test.ts:256` `expect(draft.user).toContain('【范例片段】')` —— 裁决④把默认改成「关」，该断言按新默认必红。**适配法**：在该用例（:242-258）里显式开启开关后再跑管线，断言原样保留（注入功能的正向路径不丢）。
4. `apps/server/test/http/style-snapshot.test.ts:112-144` 断言的是 draft **system** 里的 styleRules 快照优先（`captured[0]` = system+user 拼接，但标记来自 system），fewShot 开关不动 styleRules 槽 → 预期仍绿；跑完本卡必须实测确认。
5. 全仓无 `vi.spyOn` 先例；对 ESM 命名空间具名导出做 spyOn 受只读 getter 限制，本卡不用该手段（见 §9 勘正⑤）。

## 2. 改动文件清单（改 6 + 新建 1 + 测试改 4）

```
Create  apps/server/src/db/migrations/0007_book_style_fewshot.sql
Modify  apps/server/src/db/repositories/books.ts        （Book/BookRow/toBook/createBook/setBookStyleProfile；文件尾新增 setBookFewshot）
Modify  apps/server/src/http/schemas.ts                 （文件末尾增 styleFewshotPutSchema）
Modify  apps/server/src/http/routes.ts                  （:604 后增 PUT style-fewshot；:618 后增 DELETE /api/style-profiles/:id）
Modify  apps/server/src/pipeline/chapter.ts             （仅 :214 fewShot 块装配一处门控；:289 抄用检测不动）
Modify  packages/shared/src/api.ts                      （BookDto 增 styleFewshotOn）
Test Modify apps/server/test/db/migrate.test.ts          （§1.1-2）
Test Modify apps/server/test/db/open.test.ts             （§1.1-1）
Test Modify apps/server/test/http/style.test.ts          （+4）
Test Modify apps/server/test/pipeline/chapter.test.ts    （既有 1 例适配 + 新增 1 例）
```

不得改 `apps/web/**`（Task10B 的地盘）、`apps/server/src/style/**`、`apps/server/src/quality/**`、`apps/server/src/settings.ts`。

## 3. 改法钉死

### 3.1 迁移（整文件）

```sql
-- 0007：文风示例逐书开关（DEC-2026-1116-01 裁决④：全局默认关，逐书开）
-- DEFAULT 0 = 既有书与新绑定书默认不注入范文片段；开关只管注入，抄用检测恒取绑定样本。
ALTER TABLE books ADD COLUMN style_fewshot_on INTEGER NOT NULL DEFAULT 0;
```

命名/风格照 `0004_book_outline.sql`（plain ALTER，无 IF NOT EXISTS 语法可用）。

### 3.2 `books.ts`

- `Book` 接口在 `imitationProfileId` 之后加一行：`  /** 文风示例注入开关（B4 裁决④）：仅控注入，抄用检测不受影响 */\n  styleFewshotOn: boolean;`
- `BookRow` 加 `  style_fewshot_on: number;`
- `toBook` 在 `imitationProfileId: r.imitation_profile_id,` 之后加 `styleFewshotOn: r.style_fewshot_on === 1,`
- `createBook` 的返回字面量（:43-53）在 `imitationProfileId: null,` 之后加 `styleFewshotOn: false,`（INSERT 未列该列 → 库默认 0，与字面量一致）
- `setBookStyleProfile`（:104）UPDATE 语句改为：

```ts
  db.prepare('UPDATE books SET style_profile_id = ?, style_snapshot_json = ?, style_fewshot_on = 0, updated_at = ? WHERE id = ?').run(
```

（绑定与解绑都归零——owner「新绑定默认写 0」；参数表不变。）

- 文件末尾新增（照 `setBookImitation` :113-119 形态）：

```ts
/** 逐书文风示例开关（B4 裁决④）：只控注入，抄用检测恒取绑定样本。 */
export function setBookFewshot(db: Database, bookId: string, on: boolean): void {
  db.prepare('UPDATE books SET style_fewshot_on = ?, updated_at = ? WHERE id = ?').run(
    on ? 1 : 0,
    new Date().toISOString(),
    bookId,
  );
}
```

### 3.3 `schemas.ts`（文件末尾追加）

```ts
/** 逐书文风示例开关（B4 裁决④）。 */
export const styleFewshotPutSchema = z.object({ on: z.boolean() });
```

### 3.4 `routes.ts`

- 在 PUT `/api/books/:bookId/style`（:604 收尾）之后插入：

```ts
  // B4 裁决④：逐书文风示例开关（只控注入；抄用检测恒取绑定样本，见 pipeline/chapter.ts）
  app.put('/api/books/:bookId/style-fewshot', async (req, reply) => {
    const { bookId } = req.params as { bookId: string };
    if (!booksRepo.getBook(db, bookId)) return reply.code(404).send({ error: 'not found' });
    const body = parseBody(reply, styleFewshotPutSchema, req.body);
    if (!body) return;
    booksRepo.setBookFewshot(db, bookId, body.on);
    reply.send({ ok: true, styleFewshotOn: body.on });
  });
```

- 在 GET `/api/style-profiles`（:618 收尾）之后、GET `/api/style-profiles/:id/versions`（:621）之前插入：

```ts
  // B4 裁决②：档案删除。只删被删 id 那一行（同 source_hash 的其他版本不受牵连，版本族靠 source_hash 组织）；
  // 仍被任何书绑定 → 409 并回绑定书列表，绝不静默解绑（books.style_profile_id 无外键，靠这里守住引用）。
  app.delete('/api/style-profiles/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!db.prepare('SELECT id FROM style_profiles WHERE id = ?').get(id)) return reply.code(404).send({ error: 'not found' });
    const bound = db
      .prepare('SELECT id, title FROM books WHERE style_profile_id = ? ORDER BY created_at')
      .all(id) as Array<{ id: string; title: string }>;
    if (bound.length > 0) {
      return reply.code(409).send({ error: '该风格档案已被书绑定，请先解绑再删除', books: bound });
    }
    db.prepare('DELETE FROM style_profiles WHERE id = ?').run(id);
    reply.send({ ok: true });
  });
```

- import 处补 `styleFewshotPutSchema`（并入既有 schema import 列表）。

### 3.5 `chapter.ts`（只动 :214 一处）

```ts
    // B4 裁决④：fewShot 块受逐书开关控制（默认关）；styleSamples 采集、styleSampleIds 记录、抄用检测（:289）一概不看开关
    const fewShotBlock =
      book.styleFewshotOn && styleSamples.length > 0
        ? renderStyleBlock('', styleSamples, config.budgets.draft.fewShot, styleTerms)
        : undefined;
```

`:237` 与 `:349` 的 `fewShot: fewShotBlock` 槽、`:289` referenceTexts 一律不动。

### 3.6 `packages/shared/src/api.ts`

`BookDto`（:8-18）在 `imitationProfileId?: string | null;` 之后加：

```ts
  /** 文风示例注入开关（B4 裁决④）：仅控注入 */
  styleFewshotOn: boolean;
```

## 4. 测试（+5 新增，另有 3 处既有适配）

### 4.1 `test/http/style.test.ts`（+4）

沿用文件既有 `distill(name)` helper 取 draft、再 POST `/api/style-profiles` 入库拿 profileId；建书用 POST `/api/books`。

- 例①「DELETE 未绑定档案 → 200 且行消失」：入库一枚档案 → DELETE → `statusCode` 200 且 `{ok:true}`；`SELECT COUNT(*) FROM style_profiles WHERE id=?` 为 0。
- 例②「DELETE 被绑定档案 → 409 且 body.books 含绑定书 id/title」：入库档案 → PUT `/api/books/:bookId/style` `{profileId}` 绑定 → DELETE → 409；`body.error` 含「已被书绑定」；`body.books` 数组含 `{id: bookId, title: <该书书名>}`；且档案行**仍在**（DELETE 未生效）。
- 例③「DELETE 不存在的档案 → 404」。
- 例④「PUT style-fewshot 开关：开→GET 透出 true；重新绑定档案后回落 false」：新书 GET `/api/books/:bookId` → `styleFewshotOn` 应为 `false`（默认关）→ PUT `/api/books/:bookId/style-fewshot` `{on:true}` 得 `{ok:true, styleFewshotOn:true}` → GET 回 `true` → 再 PUT `/api/books/:bookId/style`（绑定一枚档案，可为 null 解绑）→ GET 回 `false`；PUT 非法 body `{on:'x'}` → 400；不存在书 PUT → 404。

### 4.2 `test/pipeline/chapter.test.ts`

- 既有适配：helper `boundProfileBook(tag)`（:~185-217）签名加第二形参 `sampleText = '范例片段：他推开门，雨停了。'`，并把 `samples_json` 里的样本文本换成该形参（默认值 = 原文本，既有两例行为不变）；在用例「绑定档案：draft system 含七维画像…」（:242）里 `const bid = boundProfileBook('a');` 之后加一行 `db.prepare('UPDATE books SET style_fewshot_on = 1 WHERE id = ?').run(bid);`，:256 断言原样保留。
- 新增例「文风示例开关默认关：draft user 不含【范例片段】，但抄用检测仍以绑定样本为参考（plagiarism_ngram 仍判抄）」：
  - `const bid = boundProfileBook('fewoff', '范例长样本：少年推开木门，庭院的积水映着冷月，他没有回头。')`（clean 后 ≥15 字符，才可能触发 15 字窗口）；**不动 style_fewshot_on（保持默认 0）**。
  - mock draft 正文里**原样嵌入** `少年推开木门，庭院的积水映着冷月，他没有回头。`（≥15 连续字）再补填充字到 targetChars 附近；qc 固定 `OVERALL: 9`，summarize 走既有形态。
  - 断言①：`cap.calls.find(c => c.step === 'draft')!.user` **不含** `'【范例片段】'`（注入被开关拦下）。
  - 断言②：读 `SELECT output_json FROM run_steps WHERE run_id = ? AND step='qc' AND attempt=1` → `JSON.parse(...).l0.checks` 里 `name === 'plagiarism_ngram'` 的 `pass` 为 **false**、`details` 含「与参考文本重合」→ 证明开关关掉后 referenceTexts 仍喂样本（恒开）。

### 4.3 迁移测试适配（§1.1-1/§1.1-2 逐条落）

## 5. 验收命令（硬序，任一环失败即停并回报）

```
pnpm typecheck && pnpm lint
pnpm --filter @inkforge/server exec vitest run test/http/style.test.ts test/pipeline/chapter.test.ts test/db/migrate.test.ts test/db/open.test.ts test/http/style-snapshot.test.ts
pnpm --filter @inkforge/server exec vitest run
pnpm test        # 全仓；开工基线 = 324（Task9B 后），本卡后应 ≥329，只增不减
```

判据：定向 5 文件全绿；typecheck/lint 0 错；server 包全绿；全仓 ≥329。既有断言一律不得改删来「变绿」（§1.1 列出的适配除外：user_version 数字、旧库回滚块补 DROP COLUMN、chapter.test.ts 用例内加一行开关注入）。

## 6. 冒烟（真实服务，非 GUI；GUI 目验按 owner 口径由本人真实测试）

隔离四件套（lessons L-20261114-01）：独立 `INKFORGE_DATA_DIR` + 独立 `INKFORGE_PORT`（用 **8797**，避 8787）+ `INKFORGE_CONFIG_FILE`；生产库 `apps/server/data/` 与其下 `backups/` 禁碰；脚本与依赖放仓库外临时目录；停栈按端口 `netstat -ano | grep LISTENING` → PID → `taskkill //F //PID`（Git Bash `kill $!` 杀不掉 Windows node）。

`INKFORGE_MOCK=1` 起真服务，脚本按序核：
1. POST `/api/books` 建书 → GET 回 `styleFewshotOn === false`（默认关）。
2. POST `/api/style-profiles`（照 style.test.ts 的入库 body 形状）→ PUT `/api/books/:id/style` 绑定 → DELETE `/api/style-profiles/:pid` → **409** 且 body.books 含该书。
3. PUT `/api/books/:id/style-fewshot` `{on:true}` → GET 回 `true` → 再 PUT `/api/books/:id/style` 重新绑定 → GET 回 `false`（绑定归零）。
4. **杀掉进程重启**后再 GET → 仍回上次 PUT 的值（确证落库跨进程持久，非内存态）。
5. 解绑（PUT style `{profileId:null}`）→ DELETE 档案 → 200 → 再 DELETE 同 id → 404。
判据 = HTTP 状态码 + 响应 JSON + 直查临时库行；无 GUI、无截图。

## 7. 约束

- 同工作树只有你在跑；**只 commit 不 push**；逐文件 `git add`；永不 `--no-verify`；永不 `git add -A`。
- 生产库与 `apps/server/data/backups/` 禁碰；`.env` 值不得抄入任何入库文件。
- 不得改 apps/web/**、apps/server/src/style/**、apps/server/src/quality/**。
- 卡面与实测冲突时以实测为准，并在 commit 正文逐条记「卡面勘正」。

## 8. commit 模板（单 commit）

```
feat(server): 风格档案删除 409-if-bound；文风示例逐书开关（迁移 0007，注入门控、抄用检测恒开）

verify: 定向 5 文件 <N> 绿；server 包 <N> 绿；全仓 <N> 绿（基线 324）；typecheck 0 错；lint 0 错；冒烟=<逐条结论，含跨进程重启持久>；secret 扫描零新增；pnpm audit --prod 与基线一致
GUI: 未验证（owner 口径：真实测试由 owner 本人做）
卡面勘正: <逐条列出实测冲突>
执行: <派发/亲执情况>
Refs: DEC-2026-1116-01
```

## 9. 计划勘正（写卡时按实测纠正，执行者按本卡为准）

1. 计划文件清单写 `apps/server/src/db/repositories/books.ts` 之外的 `styles.ts`（不存在）。删除与绑定反查按仓库既有口径**内联在 routes.ts**（档案投影本来就内联于 :592/:606/:621），不新建 repository 文件。
2. 计划钉 DELETE 的 409 body `error: 'profile bound'` → 改中文「该风格档案已被书绑定，请先解绑再删除」（仓库 409 文案惯例：删书/删版本均为中文），`books` 列表字段照计划。
3. 计划 Task10A 说「跑绿即可」但**未列 user_version 硬编码**：`open.test.ts` 3 处 + `migrate.test.ts` 4 处断言、2 处标题、2 处注释都要 6→7，且 migrate.test.ts 两个旧库回滚块必须补 `ALTER TABLE books DROP COLUMN style_fewshot_on`（Task8A 已踩过同款坑）。
4. 计划未预见「默认改关」会打红 `chapter.test.ts:256` 的注入在场断言；适配法见 §4.2（在用例内显式开开关，保留断言；另新增默认关的反向例），不是删断言。
5. 计划写「chapter.test.ts +1 用 `vi.spyOn(l0 模块,'runL0Checks')` 捕获 input」——实测**不需要也不该**用 spy：全仓零 `vi.spyOn` 先例，且 vitest 对 ESM 命名空间具名导出的 spyOn 受只读 getter 限制；抄用检测的判定已落在 `run_steps.qc.outputJson.l0.checks.plagiarism_ngram`，直查该列即可（注意 pass 文案在「未抄」时与「无参考」不可区分，故必须让 mock draft 真抄 ≥15 连续字，见 §4.2）。
6. 计划只写 `Book/BookRow/toBook` 增字段，未写 `createBook` 的返回字面量也要补 `styleFewshotOn: false`（否则 TS 不满足 Book 返回类型）。
7. 计划测试④要求「重新绑定档案后回落 false」，实测依赖 `setBookStyleProfile` 的归零 UPDATE（§3.2），解绑同样归零——两条路径都写进例④。
8. 既有 helper `boundProfileBook` 的样本文本去空白后仅 14 字符，**永远触发不了** `hasLongCopy`（15 字窗口），故新例必须自带更长样本（形参化，默认值保持原文本）。

## 10. 卡外（勿做）

- Task10B（web 删除钮/解绑修复⑦/开关 checkbox）不在本卡。
- 0.3 缓议项（多选绑定、.epub、persona 模板、仿写预览可编辑）勿动。
- 档案「整族删除」（同 source_hash 全版本）无需求，勿顺手加。
