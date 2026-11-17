# P3-2 向导瘦身 + 风格多选维度级拼装 + 续写注入 实现计划（2026-11-17）

**目标**：① /new 三步向导 step2 撤全量蓝图 JSON 编辑，改为「逐章采用勾选 + 标题输入（默认「第N章」）+ 逐章 targetChars（默认 3000、min 500）+ 蓝图只读预览」，深度蓝图编辑归详情页（已有，不动）；② 风格绑定改多选（上限 4=1 主+≤3 辅），七维独立选来源、六轴按贡献维数加权平均、规则主全量+辅去重补充（总预算 400 字符）、术语主优先并集（上限 10 条）、样本按权重最大余数法取 3 席位，新增 `book_style_profiles` 关联表 + 快照升级为「拼装映射+冻结内容」bundle + 单一合并模块 `apps/server/src/style/merge.ts`；③ continue 续写也注入混合风格块，并追加指令行「前文腔调优先，文风档案作质感参照」（前 3 章声线锚 computeStyleMetrics 保留）。

**架构**：新增 `apps/server/src/style/merge.ts` 单一模块：输入=绑定拼装映射（bundle）→ 输出=有效档案 `MergedStyleProfile`（dims 逐维来源文本、axes 加权后、rulesText 合并、terms 并集、samples 取样后、来源标注）。chapter/rewrite/polish 三管线与 inject.ts 一律消费 merged 形态（与现单档案同形，调用点改动最小；rewrite.ts 无需改动——chapter.ts 传入的 `styleRules` 即 merged.rulesText）。绑定存储=`book_style_profiles` 关联表（引用真相）+ `books.style_snapshot_json` 升级 V2 bundle（内容冻结）+ `books.style_profile_id` 保留为主风格镜像（BookDto/详情 chip/旧消费兼容）。

**规格**：真值=docs/decision-log.md#DEC-2026-1117-04（owner 亲决，2026-11-17，勿重开）+ 本计划「实现级钉死清单」一节（主模型钉细节，owner 可驳回）。

## 全局约束（逐条精确值）
1. **测试基线只增不减**：现全量 server 272 + web 85 + shared 2 = **359**；本计划预计新增 server 30（migrate 1 + repositories 2 + merge 20 + http 4 + pipeline 3）+ web 4（向导 1 + 详情页 3）→ 预计全量 ≈393，下限 359；既有断言仅允许计划内列明的适配（user_version 数字、快照 V1→V2 形态断言、向导 PUT body 断言、continue 用例一改名+style_sample_ids_json `'[]'`→`'["mock-profile:s3","mock-profile:s1","mock-profile:s2"]'` 按 B4 裁决④ ids 不看开关 + critic 4.5 id 命名空间 `${profileId}:`），一律不得改删来「变绿」。
2. **验证链硬序**：静态检查 → 定向测试 → 全量测试 → 冒烟 → 安全深扫比基线（零新增才放行）；任一环失败即停。工具命令从根 package.json / 各 app package.json 读实：`pnpm typecheck`、`pnpm lint`、`pnpm --filter @inkforge/server exec vitest run <文件>`（定向）、`pnpm -r --if-present run test`（全量）、`pnpm --filter @inkforge/web build`（冒烟）、`pnpm audit --prod`（安全）。
3. **GUI 不做自动化目验**：涉及 GUI 的提交信息注明「GUI 未验证（owner 真实测试）」。
4. **迁移卡面惯例**：user_version 硬编码点全库销号（全库 Grep 实数 **9 处**，明细见 Task-02）+ 迁移文件头带回滚注释 + 测试内两处旧库回滚块补 DROP。
5. **提交纪律**：永不 `--no-verify`、永不 `git add -A`；执行者只 commit 不 push；提交信息 Conventional 前缀+中文描述，正文 `verify: <验证结果>`；同一工作树 ≤1 卡。
6. **服务端 schema 校验**：新绑定 body 用 zod（apps/server/src/http/schemas.ts 惯例，parseBody 400 人话化 routes.ts:1016-1026），上限 4、主风格必在勾选中、维度来源必须在勾选中，非法 400 人话文案。
7. **装配测试风格**：合并逻辑测试=给定输入断言合并输出（纯函数直喂 fixture），不依赖 LLM；管线注入断言用 chapter.test.ts:229-240 capturing harness 抓 system/user。

## 调研基线（2026-11-17 实测复核，行号已核准）
- 绑定链：`books.style_profile_id` 单列（apps/server/src/db/repositories/books.ts:9、:29、:38；迁移 0001_core.sql:3；style_profiles 表 0001_core.sql:40-44）；PUT /api/books/:bookId/style body {profileId:string|null}（apps/server/src/http/routes.ts:583-605，绑定复制快照 :593-603）；styleBindSchema（apps/server/src/http/schemas.ts:53-55）；parseBody 400 人话化（routes.ts:1016-1026）；shared StyleBindBody（packages/shared/src/api.ts:264-267）、BookDto.styleProfileId（:13）；web client.bindStyle（apps/web/src/api/client.ts:202-203）；UI StyleBindSelect 单选（apps/web/src/pages/BookDetailPage.tsx:11-29、调用 :474、bindStyle fn :175-184）；「续写不注入」提示语（BookDetailPage.tsx:481）。
- 消费点：chapter.ts（apps/server/src/pipeline/chapter.ts）——voiceRefMetrics 分流 :110-121（generate 读档案 metrics_json、continue=computeStyleMetrics(prevTexts)，chapter.ts:121 保留）；风格注入素材 :176-218（:183 `runMode!=='continue'` 门、:186-197 快照优先回落档案现值、:198-210 rulesText/terms/dims/axes/samples 四路拆解）；styleDimsText/fewShotBlock :212-218（fewShot 受 book.styleFewshotOn 门 :216）；draft slots :233-250（task=renderDraft :245）；targeted/full rewrite slots :336-360（styleRules 透传 → rewrite.ts :62-64 精简槽 400，rewrite.ts 本体零改动）；抄用参考 :296（generate+samples）；finalize :432-459。
- polish.ts（apps/server/src/pipeline/polish.ts:41-80）：metrics/样本/术语取绑定档案（快照优先回落现值 :52-60），样本轮转 slice(startIdx, +3) :67-73。
- 预算（apps/server/src/config.ts:99-135）：draft styleDims 600 / styleRules 1000 / fewShot 1500；8K 档 styleDims=0（:117，语义沿用——assembler.ts:87-88 有内容才进槽、applySlot :18-26 截 0）；rewrite styleRules 400（:129）。注入渲染（apps/server/src/style/inject.ts）：pickStyleSamples :5-13（轮转 count=3）、renderStyleBlock :16-27（头部截断）、renderStyleDimsBlock :58-73（六轴只注 <40 或 >60 语义句）。draftSlots（apps/server/src/context/assembler.ts:64-105，槽序钉死 :64）。
- 蒸馏产物：saveStyleProfile（apps/server/src/style/analysis.ts:85-131）rules_json={rulesText,dims,axes,terms}（:112-117）、samples_json（:118）、metrics_json（:119）；同 source_hash 重蒸 version+1 新行、id 恒新（:94-98）→ 档案行不可变；getLatestProfile 按 id 精确取行（apps/server/src/style/distill.ts:45-47）；StyleSample={id,text}（distill.ts:7-10）。
- fewShot 开关：books.style_fewshot_on（books.ts:14、setBookFewshot :260-266；0007 迁移 DEFAULT 0；绑定/解绑都归零 books.ts:110）。
- 档案删除 409 反查：routes.ts:633-644 内联 SQL（:636-638 仅查 books.style_profile_id——多选后须并查关联表）；文案「该风格档案已被书绑定，请先解绑再删除」（:640）。
- 仓储：setBookStyleProfile（books.ts:102-116，绑定/解绑均归零 fewshot）；deleteBook 依赖序显式清表（books.ts:228-247，须补关联表清理否则 FK REFERENCES books 阻塞删书）；服务端 chapters 兜底 targetChars ?? 3000（apps/server/src/db/repositories/chapters.ts:128、:134，不动）。
- 向导：apps/web/src/pages/NewBookIdeaPage.tsx——step2 保存循环 :85-91（title 写死 `第${it.chapterNo}章` :87、targetChars 写死 3000 :89）；JSON 编辑 textarea+editBlueprint :68-79、:242-249；adopted 勾选 :24/:59-66；测试 apps/web/src/pages/NewBookIdeaPage.test.tsx（:117-157 用例三断言 put1.title==='第1章'、targetChars===3000）。
- 迁移：最新=0009_character_offline.sql（Glob 复核）；migrate() 顺序执行 user_version<N、幂等（apps/server/src/db/migrate.ts:11-27）；user_version 硬编码 9 处=apps/server/test/db/open.test.ts:41/:69/:76（toBe(9)）、apps/server/test/db/migrate.test.ts:33/:83/:95/:125（toBe(9)）、apps/server/scripts/migrate-prod.mjs:32-33/:73（`uv !== 3`，历史滞留 3）。测试回滚块两处：migrate.test.ts v2 块 :51-63、v4 块 :108-117。桌面打包快照（apps/desktop/src-tauri/{nsis/inkforge-installer.nsi, resources/server/db/migrations}）为打包期整树再生成物（机器生成文件行、0006-0009 亦未列入），本次不改。
- 快照消费测试现状：apps/server/test/http/style-snapshot.test.ts 用例一 :72-77 断言 V1 形态 {profileId,version,rulesJson,samplesJson}、用例二 :96-100 同——V2 bundle 后需适配；用例三 :112-144（快照优先注入标记）语义不变仍绿。continue.test.ts:44-98（continue 不注入、sampleIds='[]'、l0 含 style_drift）与 generate-drift.test.ts（setBookStyleProfile 无快照绑定）依赖「快照缺/无 → 回落档案现值」链（chapter.ts:186-197），新代码必须保留等价回落。

## 快照结构论证（架构钉「合并结果或映射二选一」→ 选「映射+冻结内容 bundle，注入时纯函数合并」）
选型：`books.style_snapshot_json` 存 V2 bundle=`{v:2, boundAt, primaryProfileId, auxProfileIds, dimsSource, profiles:{id → {version, metricsJson, rulesText, dims, axes, terms, samples}}}`——即拼装映射 + 各档案内容副本一体。合并产物不落快照，注入时由 `mergeStyleProfiles(bundle, chapterNo)` 确定性即时拼装（与绑定时刻逐字节一致）。三处成立性：
1. **档案删除 409 反查**：走关联表引用真相（book_style_profiles 并查 books.style_profile_id 主镜像），与快照内容无关，删辅档案同样 409。
2. **绑定回显**：GET /api/books/:bookId 由关联表组成 `styleBinding`（primaryProfileId/auxProfileIds/dimsSource），快照只作注入冻结内容。
3. **快照冻结语义**：各档案 rules/samples/axes 等内容绑定即复制进 bundle；重蒸=新 id 新行（analysis.ts:94-98），绑定 id 指向的旧行不可变，双保险；**样本逐章轮转语义保留**（冻结合并产物会杀死轮转——bundle 存池、注入时按 chapterNo 轮转取样，沿 pickStyleSamples 语义）。
不选「纯映射、注入时回读档案行」的原因：回读路径依赖档案行存活（现 409 守卫下成立，但快照自含内容是现行 persona 快照的既定语义 DEC-2026-1115-04，弱化即变更架构）；不选「冻结合并产物」的原因：样本轮转死亡、six-axis 重算与轮转取样耦合。V1 旧快照（{profileId,version,rulesJson,samplesJson,boundAt}）由 parseStyleBundle 适配为单主 bundle（七维全主），存量书零迁移直接可用。

## 任务板

### 线 A：向导瘦身（web 独立，与线 B 无依赖，可并行）
### Task-01 NewBookIdeaPage step2 瘦身（撤 JSON 编辑、加标题+逐章字数）
**文件**：
- Modify `apps/web/src/pages/NewBookIdeaPage.tsx`
- Modify（Test）`apps/web/src/pages/NewBookIdeaPage.test.tsx`

**Interfaces**：
- Consumes：`api.putBlueprint(bookId, chapterNo, BlueprintPutBody)`（BlueprintPutBody 不变：{title, blueprint, targetChars?}，packages/shared/src/api.ts:170-174；服务端兜底 chapters.ts:128/:134 不动）
- Produces：组件内新 state `titles: Record<number,string>`、`chars: Record<number,number>`；保存循环体 `{ title, blueprint, targetChars }`

**依赖**：无

**步骤**：
- [ ] 删除 `editBlueprint`（NewBookIdeaPage.tsx:68-79）与 JSON 编辑 textarea（:242-249）；新增两 state（:25 `editing` 旁）：`const [titles, setTitles] = useState<Record<number, string>>({});`、`const [chars, setChars] = useState<Record<number, number>>({});`
- [ ] 改保存循环（:85-91）：`title: (titles[it.chapterNo] ?? '').trim() || \`第${it.chapterNo}章\``；`targetChars: Math.max(500, Math.trunc(chars[it.chapterNo] ?? 3000) || 3000)`——默认 3000、min 500、NaN 兜底 3000（规格 A 精确值）；blueprint 原样 `it.blueprint`
- [ ] 改 :242-249 展开面板为三件套：标题 `<input aria-label={\`第${it.chapterNo}章标题\`} placeholder={\`第${it.chapterNo}章\`} onChange → setTitles>`；字数 `<input type="number" min={500} step={100} aria-label={\`第${it.chapterNo}章目标字数\`} onChange → setChars>`；只读预览 `<pre className="mt-2 rounded border bg-bg px-3 py-2 font-mono text-xs">{JSON.stringify(it.blueprint, null, 2)}</pre>`（无 onChange，不可编辑）
- [ ] 测试适配（Test 文件）：用例三（:117-157）改——去掉「编辑」后 JSON textarea 断言链，改为：点 `getAllByRole('button', { name: '编辑' })[0]` 展开 → `getByLabelText('第1章标题')` 输入 `启程`、`getByLabelText('第1章目标字数')` 输入 `2500` → 点「保存蓝图并继续」→ 断言 `put1.title === '启程'`、`put1.targetChars === 2500`、`puts[1]` body `title === '第2章'`、`targetChars === 3000`（未编辑章默认值精确断言）；新增断言 `screen.getByText(/少年踏上旅途/)` 仍以只读 pre 呈现（blueprint goal 原文在 DOM），且 step2 展开面板后 `expect(document.querySelectorAll('textarea').length).toBe(0)`（step2 视图已无任何 textarea——JSON 编辑撤销；step2 分支不渲染 step1 的世界观/大纲 textarea，全局计数应为 0）
- [ ] 测试新增（web +1）：`it('新书向导：逐章字数下限钳到 500', ...)`——第 1 章字数输入 `100` → 保存 → `put1.targetChars === 500`
- [ ] 验证：`pnpm --filter @inkforge/web exec vitest run src/pages/NewBookIdeaPage.test.tsx` 期望 `4 passed`（既有 3 + 新增 1）；`pnpm --filter @inkforge/web typecheck` 期望 exit 0
- [ ] GUI 未验证（owner 真实测试）——提交信息注明

### 线 B：风格杂糅（迁移 → repo → shared → merge → API → 管线 → UI → 收口）
### Task-02 迁移 0010 关联表 + user_version 销号（9 处）+ 旧库回滚块
**文件**：
- Create `apps/server/src/db/migrations/0010_book_style_profiles.sql`
- Modify `apps/server/test/db/migrate.test.ts`（:29 标题、:33/:83/:95/:125、:49 注释、:51-63 v2 回滚块、:108-117 v4 回滚块）
- Modify `apps/server/test/db/open.test.ts`（:38 标题、:41/:69/:76、:49-65 对象清单）
- Modify `apps/server/scripts/migrate-prod.mjs`（:32-33、:73）

**Interfaces**：
- Consumes：migrate() 顺序语义（apps/server/src/db/migrate.ts:11-27，user_version=9 库自动补跑 0010）
- Produces：表 `book_style_profiles(book_id TEXT NOT NULL REFERENCES books(id), profile_id TEXT NOT NULL, is_primary INTEGER NOT NULL DEFAULT 0, dims_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL, UNIQUE(book_id, profile_id))` + 索引 `idx_book_style_profiles_book`、`idx_book_style_profiles_profile`、`ux_book_style_profiles_primary`（部分唯一：每书至多一枚主行，critic 2.1 附议采纳）；存量回填（旧绑定→is_primary=1、七维全归主=dims_json '{}'，`INSERT OR IGNORE` 重跑幂等）

**依赖**：无

**步骤**：
- [ ] 新建 `0010_book_style_profiles.sql`，全文钉死：
  ```sql
  -- 0010：风格多选维度级拼装（DEC-2026-1117-04）：book_style_profiles 关联表（引用真相）
  -- books.style_profile_id 保留为主风格镜像；dims_json '{}' = 七维全归主。
  -- 回滚：DROP TABLE IF EXISTS book_style_profiles; DROP INDEX IF EXISTS idx_book_style_profiles_book; DROP INDEX IF EXISTS idx_book_style_profiles_profile; DROP INDEX IF EXISTS ux_book_style_profiles_primary;（user_version 不回退，旧代码零影响）
  CREATE TABLE IF NOT EXISTS book_style_profiles(
    book_id TEXT NOT NULL REFERENCES books(id),
    profile_id TEXT NOT NULL,
    is_primary INTEGER NOT NULL DEFAULT 0,
    dims_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    UNIQUE(book_id, profile_id)
  );
  CREATE INDEX IF NOT EXISTS idx_book_style_profiles_book ON book_style_profiles(book_id);
  CREATE INDEX IF NOT EXISTS idx_book_style_profiles_profile ON book_style_profiles(profile_id);
  CREATE UNIQUE INDEX IF NOT EXISTS ux_book_style_profiles_primary ON book_style_profiles(book_id) WHERE is_primary=1;
  INSERT OR IGNORE INTO book_style_profiles(book_id, profile_id, is_primary, dims_json, created_at)
    SELECT id, style_profile_id, 1, '{}', created_at FROM books WHERE style_profile_id IS NOT NULL;
  ```
- [ ] migrate.test.ts：4 处 `toBe(9)` → `toBe(10)`（:33、:83、:95、:125）；:29 用例标题「user_version=9」→「user_version=10」；:49 注释「0003-0009」→「0003-0010」（:48 同）；两处旧库回滚块各补一行 `db.exec('DROP TABLE IF EXISTS book_style_profiles');`（v2 块 :63 `DROP TABLE IF EXISTS style_sources` 之后、v4 块 :117 同位置）——否则重迁 CREATE 撞 UNIQUE/已存在（T8A/T10A/T11A 三次踩坑，DEC 记录在案）
- [ ] migrate.test.ts 新增用例（server +1）：`it('0010 关联表+存量回填：v9 旧库升级，绑定行 is_primary=1 数据 intact', ...)`——沿 :106-131 v4 模式：全量迁移后 `db.exec('DROP TABLE book_style_profiles')` + 手工 `INSERT INTO books(... style_profile_id ...) VALUES('b10','书十',..., 'p-legacy')` + `db.pragma('user_version = 9')` + `migrate(db)` → 断言 `user_version===10`、`SELECT profile_id, is_primary, dims_json FROM book_style_profiles WHERE book_id='b10'` equals `{profile_id:'p-legacy', is_primary:1, dims_json:'{}'}`、books 行数据 intact
- [ ] open.test.ts：3 处 `toBe(9)` → `toBe(10)`（:41、:69、:76）；:38 标题「user_version=9、…、15 个核心对象」→「user_version=10、…、16 个核心对象」；:49-65 对象清单追加 `'book_style_profiles'`
- [ ] migrate-prod.mjs：:32 `if (uv !== 3)` → `if (uv !== 10)`、:33 文案 `!== 3` → `!== 10`、:73 `if (uv !== 3 || ...)` → `if (uv !== 10 || ...)`（历史滞留 3 的硬编码一并销号，与最新迁移对齐）
- [ ] 验证：`pnpm --filter @inkforge/server exec vitest run test/db` 期望 migrate.test.ts 4 passed + open.test.ts 2 passed（含新用例）；`pnpm --filter @inkforge/server typecheck` exit 0
- [ ] 全库销号复核：Grep `user_version` 于 apps/server src+test+scripts，期望除 migrate.ts 动态读写（:16/:23）与旧版本号重置（migrate.test.ts:81 `= 2`、:123 `= 4`——语义为「造旧库」，保留）外无残留硬编码最新版

### Task-03 仓储层：绑定 CRUD + 删书清理 + 反查
**文件**：
- Modify `apps/server/src/db/repositories/books.ts`（:101-116 旁新增、:228-247 deleteBook）
- Modify（Test）`apps/server/test/db/repositories.test.ts`

**Interfaces**：
- Consumes：0010 表（Task-02）；`Database`（../db/open）
- Produces（精确签名）：
  ```ts
  export interface StyleBinding {
    primaryProfileId: string;
    auxProfileIds: string[];
    /** 七维→贡献档案 id；空对象=全归主（0010 存量行形态） */
    dimsSource: Record<string, string>;
  }
  export function setBookStyleBinding(db: Database, bookId: string, binding: StyleBinding | null, snapshotJson: string | null): void
  export function getBookStyleBinding(db: Database, bookId: string): StyleBinding | null
  export function listBooksBoundToProfile(db: Database, profileId: string): Array<{ id: string; title: string }>
  ```
- 保留 `setBookStyleProfile`（books.ts:102-116）签名不变，docblock 改注「遗留：仅写主镜像不写关联表（测试兜底路径用）；生产绑定走 setBookStyleBinding」

**依赖**：Task-02（派发级合并：0010 迁移+本任务+Task-04 合为一张卡一次提交=SM-02——消掉「0010 已落盘而 deleteBook 清理行未落」的 FK 窗口，窗口内删已绑书 500，critic 2.1 采纳）

**步骤**：
- [ ] 实现三函数（books.ts，`setBookStyleProfile` 后插入）：`setBookStyleBinding` 用 `db.transaction`：①`UPDATE books SET style_profile_id=?, style_snapshot_json=?, style_fewshot_on=0, updated_at=? WHERE id=?`（binding=null 时三参皆 null——沿 B4 裁决④ 重绑/解绑归零 fewshot，books.ts:110 同款 SQL）；②`DELETE FROM book_style_profiles WHERE book_id=?`；③binding 非空 → 主行（is_primary=1）先 INSERT、辅行按 `auxProfileIds` 绑定序逐行 INSERT（is_primary=0）；`const ts = new Date().toISOString()` 事务内取一次全行复用（逐行现取会毫秒漂移、行序不可靠），每行 `dims_json = JSON.stringify(binding.dimsSource)`（全量映射逐行同值）、`created_at = ts`。`getBookStyleBinding`：`SELECT profile_id, is_primary, dims_json FROM book_style_profiles WHERE book_id=? ORDER BY is_primary DESC, rowid ASC`（rowid=插入序=绑定序，auxProfileIds 返回序由此保证——merge 算法「辅按绑定序」依赖此序） → 无行 null；主行=is_primary=1 首行、auxProfileIds=其余按序、dimsSource=JSON.parse(主行 dims_json)。`listBooksBoundToProfile`：`SELECT id, title FROM books WHERE style_profile_id = ? UNION SELECT b.id, b.title FROM book_style_profiles r JOIN books b ON b.id = r.book_id WHERE r.profile_id = ? ORDER BY title`（UNION 自动去重主镜像行）
- [ ] deleteBook（books.ts:228-247）：在 `DELETE FROM foreshadowings`（:241）与 `DELETE FROM books`（:243）之间插入 `db.prepare('DELETE FROM book_style_profiles WHERE book_id = ?').run(id);`（缺失则 FK REFERENCES books 阻塞删书）
- [ ] 测试新增（repositories.test.ts 尾部新 describe，server +2）：`it('setBookStyleBinding/getBookStyleBinding 往返：主辅行+dims 映射+fewshot 归零'）`——createBook → setBookStyleBinding(db, id, {primaryProfileId:'pA', auxProfileIds:['pB','pC'], dimsSource:{对话:'pB'}}, '{"v":2}') → 断言 getBook(id).styleProfileId==='pA'、styleFewshotOn===false（先 setBookFewshot(db, id, true) 再绑定验证归零）、getBookStyleBinding equals `{primaryProfileId:'pA', auxProfileIds:['pB','pC'], dimsSource:{对话:'pB'}}`；`it('setBookStyleBinding(null) 解绑清三处；deleteBook 清关联表'）`——解绑后 getBookStyleBinding===null、style_snapshot_json null、关联表 0 行；重绑后 `deleteBook(db, id)===true` 且 `SELECT COUNT(*) FROM book_style_profiles` 0 行
- [ ] 验证：`pnpm --filter @inkforge/server exec vitest run test/db/repositories.test.ts` 期望全绿（既有用例数+2）

### Task-04 shared 类型：StyleBindBody 扩展 + StyleBindingDto
**文件**：
- Modify `packages/shared/src/api.ts`（:13 BookDto、:264-267 StyleBindBody）

**Interfaces**：
- Produces（精确形态）：
  ```ts
  export interface StyleBindBody {
    /** legacy：null=解绑；字符串=等价 {primaryProfileId} 七维全主（旧客户端兼容） */
    profileId?: string | null;
    primaryProfileId?: string;
    auxProfileIds?: string[];
    /** 七维→贡献档案 id；缺省维归主 */
    dimsSource?: Record<string, string>;
  }
  export interface StyleBindingDto {
    primaryProfileId: string;
    auxProfileIds: string[];
    dimsSource: Record<string, string>;
  }
  ```
- BookDto（:13 styleProfileId 行后）追加 `styleBinding?: StyleBindingDto | null;`

**依赖**：无（可与 Task-02/03 并行；Task-06/08 依赖本任务）

**步骤**：
- [ ] 按 Produces 形态改 api.ts :264-267（原 `profileId: string | null` 必填改四可选字段+legacy 注释）与 :13-14（BookDto 加 styleBinding）
- [ ] 验证：`pnpm --filter @inkforge/shared typecheck` exit 0；`pnpm --filter @inkforge/shared test` 期望 2 passed（基线不变，纯类型零运行时）；`pnpm --filter @inkforge/web typecheck` exit 0（StyleBindBody 变宽不破坏既有调用点 BookDetailPage.tsx:177 `{ profileId }`）

### Task-05 合并模块 merge.ts（纯函数）+ 装配单测
**文件**：
- Create `apps/server/src/style/merge.ts`
- Create（Test）`apps/server/test/style/merge.test.ts`

**Interfaces**：
- Consumes：`STYLE_DIMENSIONS`/`STYLE_AXES`/`StyleDimension`/`StyleAxis`/`StyleTermDto`（packages/shared/src/api.ts:338-355）；`StyleSample`/`StyleProfileRow`/`getLatestProfile`（apps/server/src/style/distill.ts:7-10/:12-22/:45-47）；`pickStyleSamples`（apps/server/src/style/inject.ts:5-13，轮转语义复用不另造）；`Database`（../db/open）
- Produces（精确签名）：
  ```ts
  export const RULES_TOTAL_BUDGET = 400; // 规格 B：合并 rulesText 总预算（辅补充以 400 封顶）
  export const TERMS_MAX = 10;           // 规格依据：蒸馏 TERMS 3-10 条惯例（analysis.ts:19）
  export const SAMPLE_QUOTA = 3;         // 规格 B：fewShot 预算内等比取样总席位（现注入 count=3 惯例）
  export interface StyleProfileContent {
    version: number;
    metricsJson: string;
    rulesText: string;
    dims: Partial<Record<StyleDimension, string>>;
    axes: Partial<Record<StyleAxis, number>>;
    terms: StyleTermDto[];
    samples: StyleSample[];
  }
  export interface StyleBundleV2 {
    v: 2;
    mergeVersion: number; // 恒 1；parse 缺省容忍=1——bundle 冻结的是内容非合并语义，算法演进时给已绑书留判别门（critic 1.3）
    boundAt: string;
    primaryProfileId: string;
    auxProfileIds: string[];
    dimsSource: Record<string, string>;
    profiles: Record<string, StyleProfileContent>;
  }
  export interface MergedStyleProfile {
    primaryProfileId: string;
    primaryMetricsJson: string;
    dims: Record<StyleDimension, string>;
    axes: Partial<Record<StyleAxis, number>>;
    rulesText: string;
    terms: StyleTermDto[];
    samples: StyleSample[];
  }
  export function buildStyleBundle(input: { primaryProfileId: string; auxProfileIds: string[]; dimsSource: Record<string, string>; profiles: Record<string, StyleProfileContent>; boundAt?: string }): StyleBundleV2
  export function parseStyleBundle(raw: string | null | undefined): StyleBundleV2 | undefined
  export function loadStyleBundle(db: Database, book: { styleProfileId: string | null; styleSnapshotJson: string | null }): StyleBundleV2 | undefined
  export function contentFromProfileRow(row: { version: number; rules_json: string; samples_json: string; metrics_json: string }): StyleProfileContent // 缺键/坏 JSON 容错：rulesText→''、dims/axes→{}、terms→[]、samples→[]（对齐 polish.ts:52-66 容错语义，critic 1.2；loadStyleBundle 与 PUT 组装两处复用）
  export function normalizeDimsSource(dimsSource: Record<string, string>, primaryProfileId: string): Record<StyleDimension, string>
  export function mergeStyleProfiles(bundle: StyleBundleV2, chapterNo: number): MergedStyleProfile
  ```

**依赖**：Task-04（类型无需新增，仅依赖既有 shared 导出——可提前实现，测试落在 Task-06 前）

**步骤**：
- [ ] 实现常量与类型（如上 Produces 全文）
- [ ] 实现 `normalizeDimsSource`：七维逐键——缺键/值空串/值 ∉ {primary∪aux} → primaryProfileId；恒返回七键全集
- [ ] 实现 `buildStyleBundle`：组装 `{v:2, mergeVersion: 1, boundAt: input.boundAt ?? new Date().toISOString(), ...}`
- [ ] 实现 `parseStyleBundle`：raw 空/JSON.parse 抛错/缺 primaryProfileId → undefined；`raw` 含字符串键 `rulesJson` → V1 适配：单主 bundle（auxProfileIds=[], dimsSource={}, profiles[profileId]={version, metricsJson:'', rulesText/dims/axes/terms=JSON.parse(rulesJson) 逐键容错取 `rulesText?/dims?/axes?/terms?`，samples=JSON.parse(samplesJson) 容错 []}）；否则按 V2 形态直读
- [ ] 实现 `loadStyleBundle`：book.styleProfileId=null → undefined；`parseStyleBundle(book.styleSnapshotJson)` 有值 → 返回；否则（快照缺/坏）回落 live 行——`getLatestProfile(db, book.styleProfileId)`，行 rules_json/samples_json 解析容错（沿 chapter.ts:186-197 语义），组装 buildStyleBundle(primary, [], {})；行缺失 → undefined
- [ ] 实现 `mergeStyleProfiles`（模块 docblock 钉死算法，全部确定性无随机）：
  0. 去重防御：`auxProfileIds = bundle.auxProfileIds.filter(id => id !== primaryProfileId)`（bundle 可能被手工/旧数据污染，同一档案不得双计权重与样本，critic 4.7）
  1. `dimsSource = normalizeDimsSource(bundle.dimsSource, bundle.primaryProfileId)`
  2. dims[dim] = 来源档案文本 trim 非空即用并记**实际来源**；来源 id 不在 profiles 表内（bundle 损坏防御）或该维文本空 → 回落主档案该维文本（实际来源=主）；仍空 → ''（实际来源=无）
  3. 权重（规格原文「实际贡献维度数」按此落实，critic 4.3）：`w_p = |{dim : 第 2 步实际来源 === p}|`；主风格 `w = max(w, 1)`（规格 B 保底）；W=Σw
  4. axes[axis]（六轴逐个）：参与集合 P = 「该轴值为有限数字」**且 `w_p > 0`** 的档案（防 ΣW=0 产 NaN，critic 4.2）；P 空 → 该轴不写入结果（renderStyleDimsBlock inject.ts:64 自滤）；否则 `Math.round(Σ_{p∈P} w_p·axes_p[axis] / Σ_{p∈P} w_p)`
  5. rulesText：主 rulesText **原样全量**（不做预算截断，1000 槽截断归 assembler）；辅按绑定序逐档案逐行（`rulesText.split('\n')` trim 非空），与已收行 trim 相等判重跳过；追加前置条件 `累计长度 + 1 + 行长 ≤ RULES_TOTAL_BUDGET(400)`——不满足则 **break 当前辅档案的行循环、继续下一辅档案**（语义钉死唯一，critic 4.1；主超 400 时任何辅行自然进不进）
  6. terms：主全收；辅按绑定序逐条 `term.trim()` 相等判同跳过；总数达 `TERMS_MAX(10)` 停
  7. samples：席位分配=最大余数法配 `SAMPLE_QUOTA(3)`——`raw_p = 3·w_p/W`，`floor` 后按小数余降序补足 3（平手：主先、再按 auxProfileIds 绑定序）；**顺延循环（钉死，critic 4.4）：`while 总席位<3 且存在「尚有未取样本」的档案：按主→辅绑定序给每个尚有未取样本的档案 +1 席，重复至补满或全池取尽`**；每档案内部 `pickStyleSamples(pool, chapterNo, quota_p)`（inject.ts:5-13 轮转，quota 0 → 空数组）；**合并样本 id 命名空间：输出 `{ ...s, id: `${profileId}:${s.id}` }`**（蒸馏 id 为档案内局部编号跨档案会撞、provenance 失真，critic 4.5；map 新对象不改池内原对象）；拼接顺序=主在前辅按绑定序；全池空 → []
  8. `primaryMetricsJson = profiles[primary]?.metricsJson ?? ''`
- [ ] 单测（merge.test.ts，纯 fixture 直喂、零 LLM 零 db，13 例全列）：
  - `it('单主档案：七维全主、六轴原值、样本配额 3'）` dimsSource={} → normalize 全主；axes 原值逐轴相等；samples.length===3
  - `it('双档案按贡献维数加权取整：主 4 维 70 / 辅 3 维 56 → 64'）` wA=4 wB=3：`(70*4+56*3)/7=448/7=64` 断言 axes['叙述温度']===64
  - `it('主零贡献保底权重 1：主 70 / 辅 56 → 58'）` 七维全辅（wB=7 wA=1）：`(70+56*7)/8=462/8=57.75→58`
  - `it('辅档案缺轴值 → 该轴在有余值档案间重归一'）` B axes 无『叙述温度』键 → 仍 70（仅 A 参与）
  - `it('规则合并：主全量保留，辅去重补充受 400 总预算封顶'）` 主 380 字 + 辅新行 30 字 → 411>400 不追加（result.rulesText.length===380）；主 300 字 + 辅「重复行+新行 60 字」 → 重复不收、新行补入（length===300+1+60）
  - `it('主 rulesText 超 400：全量保留且不补辅'）`
  - `it('术语并集主优先、上限 10 条'）` 主 8 条 + 辅 4 条（其中 2 条同名）→ 10 条、前 8 条为主原样、第 9-10 为辅新条
  - `it('样本席位最大余数法：wA=4/wB=3 → A2+B1'）` 断言按 samples.id 前缀计数 A 池 2 条、B 池 1 条
  - `it('样本逐章轮转：chapterNo=1 → [pA:s0,pA:s1]，chapterNo=2 → [pA:s1,pA:s2]'）` A 池 4 条 quota 2（id 含 `${profileId}:` 命名空间前缀，critic 4.5）
  - `it('辅样本不足 → 空缺席位顺延主池补满 3'）` B 池 0 条 → 3 条全 A
  - `it('V1 旧快照适配：单主七维全主、注入形状齐备'）` raw={profileId:'p1',version:1,rulesJson:'{"rulesText":"R","dims":{},"axes":{},"terms":[]}',samplesJson:'[{"id":"s0","text":"t"}]',boundAt:...} → merged.rulesText==='R'、samples.length===1、dimsSource 全 'p1'
  - `it('损坏快照 JSON → undefined'）` parseStyleBundle('not-json{') === undefined
  - `it('normalizeDimsSource：缺键/越权值/空串全归主'）` {对话:'pX'} → 七键全 'p1'
  - `it('实际贡献计权：辅映射维文本空回落主 → 权归主、辅零贡献不参与轴'）` 主 4 维文本非空 70；辅映射其余 3 维但文本全空、axes 全 56 → 回落主后 w主=7 w辅=0 → 各轴取主原值
  - `it('轴参与需 w>0：主缺该轴且其余档案均零贡献 → 该轴不写入结果'）` 主 axes 无『叙述温度』键、唯一有值档案 w=0 → 结果 axes 不含该键
  - `it('规则多辅：B 行超预算 break、C 短行仍可补入'）` 主 300 字 + 辅B 新行 120（300+1+120>400 break B）+ 辅C 新行 60（300+1+60≤400 收）→ rulesText.length===361
  - `it('样本顺延多轮循环：A 池 1/B 池 0/C 池 5 → A1+C2'）` 权重 A3B2C2 → 席位 A1B1C1；B 空池缺 1 席 → 循环按主→辅序扫描 C +1 → 断言 A 池 1 条、C 池 2 条
  - `it('辅列表含主去重：同一档案不双计权重与样本'）` auxProfileIds 含 primaryProfileId → 输出与纯主绑定 deep-equal
  - `it('contentFromProfileRow：坏 JSON/缺键降级空内容不抛'）` rules_json 'not-json{'、samples_json 'x'、metrics_json '' → rulesText ''/dims {}/axes {}/terms []/samples []，version 透传（critic 1.2 硬化：chapter 现状坏 JSON 整章 fail，改后降级不注入）
  - `it('确定性：同输入两次 deep-equal + profiles 键序置换输出不变'）` mergeStyleProfiles(bundle, 2) 两次调用 deep-equal；JSON 键序洗牌后的同内容 bundle → 输出 deep-equal
- [ ] 验证：`pnpm --filter @inkforge/server exec vitest run test/style/merge.test.ts` 期望 `20 passed`（原 13+critic 补 7）；`pnpm --filter @inkforge/server typecheck` exit 0

### Task-06 绑定 API：zod schema + PUT 改造 + 409 并查 + GET 回显
**文件**：
- Modify `apps/server/src/http/schemas.ts`（:53-55 styleBindSchema 替换）
- Modify `apps/server/src/http/routes.ts`（:198-203 GET 回显、:583-605 PUT 改造、:631-644 409 并查）
- Modify（Test）`apps/server/test/http/style.test.ts`、`apps/server/test/http/style-snapshot.test.ts`

**Interfaces**：
- Consumes：Task-03 三函数、Task-05 `buildStyleBundle`/`loadStyleBundle`、`STYLE_DIMENSIONS`（shared）
- Produces：
  - styleBindSchema（zod，superRefine 全语义校验，错误文案精确）：
    ```ts
    export const styleBindSchema = z.object({
      profileId: z.string().min(1).nullable().optional(),
      primaryProfileId: z.string().min(1).optional(),
      auxProfileIds: z.array(z.string().min(1)).max(3).optional(),
      dimsSource: z.record(z.string(), z.string().min(1)).optional(),
    }).superRefine((v, ctx) => { /* 步骤① 七规则 */ });
    ```
  - PUT /api/books/:bookId/style 回复 `{ ok: true, styleProfileId: <主 id> }`（解绑 `{ ok: true, styleProfileId: null }`）
  - GET /api/books/:bookId 回复新增 `styleBinding: StyleBindingDto | null`

**依赖**：Task-02、Task-03、Task-04、Task-05

**步骤**：
- [ ] 替换 styleBindSchema（schemas.ts:53-55）。superRefine 七规则（每条 `ctx.addIssue({ path, message })`，经 parseBody 输出「请求参数不合法：path: message」人话 400）：
  1. `profileId === null` 且其余三字段任一出现 → 「解绑请求不得携带绑定字段」
  2. `profileId` 为字符串且 `primaryProfileId` 同时出现 → 「profileId 与 primaryProfileId 不可同时出现」
  3. `profileId` 为 undefined 且 `primaryProfileId` 缺省 → 「必须显式指定主风格」（`profileId` 为字符串且其余字段全缺省 = legacy 合法单绑，放行由路由归一）
  4. `auxProfileIds` 含 primaryProfileId → 「主风格不可重复勾选」
  5. `dimsSource` 键 ∉ STYLE_DIMENSIONS → 「未知风格维度：<键>」；值 ∉ {primary ∪ aux} → 「维度来源必须在已勾选档案中：<键>」
  6. 总档案数（primary+aux 去重后）>4 由 aux≤3（zod max(3)）+ 规则 4 联合保证；文案「风格档案最多绑定 4 个（1 主 + 3 辅）」挂在 auxProfileIds 超限 issue 上
  7. 解绑（规则 1 放行）无需主风格——规则 3 仅约束绑定请求
- [ ] 改 PUT（routes.ts:583-605）：404 book 守卫保留（:585）；parseBody 换新 schema；`body.profileId === null` → `booksRepo.setBookStyleBinding(db, bookId, null, null)` 回 `{ok:true, styleProfileId:null}`（保留 :588-591 语义）；legacy `typeof body.profileId === 'string'` → 归一 `{primaryProfileId: body.profileId, auxProfileIds: [], dimsSource: {}}`；否则用 primaryProfileId/auxProfileIds/dimsSource。逐 id 存在性：`SELECT id, version, rules_json, samples_json, metrics_json FROM style_profiles WHERE id = ?` 任一缺 → `404 {error:'profile not found'}`（沿用 :596 文案）。内容解析容错=**新增硬化**（复用 contentFromProfileRow（Task-05），对齐 polish.ts:52-66 容错语义，**非 chapter.ts 现状**——现状坏 JSON 整章 fail，改后降级空内容不注入，critic 1.2），组装 `buildStyleBundle({primaryProfileId, auxProfileIds, dimsSource, profiles})` → `booksRepo.setBookStyleBinding(db, bookId, binding, JSON.stringify(bundle))` → 回 `{ok:true, styleProfileId: primary}`
- [ ] 改 GET（routes.ts:198-203）：`reply.send({ ...book, styleBinding: booksRepo.getBookStyleBinding(db, bookId), chapters: ..., runs: ... })`
- [ ] 改 409 反查（routes.ts:636-638）：换 `booksRepo.listBooksBoundToProfile(db, id)`（主镜像+关联表并查；覆盖删辅档案场景），:639-641 文案与结构不变
- [ ] style.test.ts 新增（server +3）：沿 :168-184 newProfile/newBook helper——
  - `it('多绑 body：1 主 2 辅 + dimsSource 落库，GET 回显 styleBinding，fewshot 归零'）` PUT `{primaryProfileId:p1, auxProfileIds:[p2,p3], dimsSource:{对话:p2, 节奏:p3}}` → 200、`styleProfileId===p1`；GET book 断言 `styleBinding` 深等于回显 + `style_fewshot_on`=0（先开后绑）
  - `it('多绑校验矩阵：超 4 档案/主不在勾选/维度来源越权/未知维度/主辅重复 → 400 人话'）` 五个 payload 逐个 400 且 `error` 分别含「风格档案最多绑定 4 个」「必须显式指定主风格」「维度来源必须在已勾选档案中」「未知风格维度」「主风格不可重复勾选」
  - `it('legacy body {profileId} 兼容：等价单主七维全主，bundle v2 落库'）` PUT `{profileId:p1}` → 200；GET book `styleBinding` equals `{primaryProfileId:p1, auxProfileIds:[], dimsSource:{}}`（七个键缺省=全主由消费方归一）；辅档案被绑书 DELETE 辅档案 → 409 且 `books` 数组含该书（新并查生效）
- [ ] style-snapshot.test.ts 适配+新增（server +1）：用例一 :72-77 断言改 V2 形态——`snap.v===2`、`snap.primaryProfileId===pid`、`snap.profiles[pid].version===1`、`snap.profiles[pid].rulesText==='快照规则v1标记'`、`snap.profiles[pid].samples[0].text==='样本文本甲'`（V1 形态断言退役，属计划列明适配）；用例二 :96-100 同款改 `{v:2, primaryProfileId, profiles[pid1].version===v1}`；新增 `it('重蒸产生新 id 不刷新绑定快照；辅档案冻结内容独立'）`——绑 p1 后 saveStyleProfile 同 source 再存得 p2 → GET 快照仍 `profiles[p1].version===旧值` 且无 p2 键
- [ ] 验证：`pnpm --filter @inkforge/server exec vitest run test/http/style.test.ts test/http/style-snapshot.test.ts` 期望全绿（style.test 既有 9 例+3、snapshot 既有 3 例适配+1）；`pnpm --filter @inkforge/server typecheck` exit 0

### Task-07 管线消费改造：chapter（生成+续写注入）与 polish
**文件**：
- Modify `apps/server/src/pipeline/chapter.ts`（:23 import、:110-121 voiceRef、:176-218 素材块、:245 task 指令行）
- Modify `apps/server/src/pipeline/polish.ts`（:41-80 基准素材）
- Modify（Test）`apps/server/test/pipeline/chapter.test.ts`、`apps/server/test/pipeline/continue.test.ts`、`apps/server/test/http/polish.test.ts`

**Interfaces**：
- Consumes：Task-05 `loadStyleBundle`/`mergeStyleProfiles`/`MergedStyleProfile`；`computeStyleMetrics`（style/metrics.ts:13，continue 锚保留）
- Produces：chapter.ts 内局部 `const merged: MergedStyleProfile | undefined`；draft task 指令行常量串「前文腔调优先，文风档案作质感参照。」；rewrite.ts / inject.ts **零改动**（merged.rulesText/dims/axes/samples 与现单档案同形流入既有槽）

**依赖**：Task-05（merge 模块）；Task-03（关联表读取）；Task-06（绑定入口，测试经 API 或 repo 函数）

**步骤**：
- [ ] chapter.ts :23 import 行改为 `import { renderStyleBlock, renderStyleDimsBlock } from '../style/inject';`（pickStyleSamples 由 merge.ts 复用，chapter 本体不再直接调用，typecheck 无未用导入为准）+ `import { loadStyleBundle, mergeStyleProfiles, type MergedStyleProfile } from '../style/merge';`
- [ ] voiceRef 分流（:110-121 保留外层结构）：generate → `merged` 就绪后 `boundProfileMetrics = JSON.parse(merged.primaryMetricsJson)` 容错（空串/坏 JSON → 回落 `getLatestProfile(db, merged.primaryProfileId)` 现行 metrics_json 再容错 → 仍失败 undefined——等价现 :112-118 行为）；continue+prevTexts → `computeStyleMetrics(prevTexts.join('\n'))`（:121 原样保留）
- [ ] 重写素材块（:176-218）：替换为——
  ```ts
  const binding = booksRepo.getBookStyleBinding(db, args.bookId)
    ?? (book.styleProfileId ? { primaryProfileId: book.styleProfileId, auxProfileIds: [], dimsSource: {} } : null);
  const bundle = binding ? loadStyleBundle(db, { styleProfileId: book.styleProfileId, styleSnapshotJson: book.styleSnapshotJson }) : undefined;
  const merged = bundle ? mergeStyleProfiles(bundle, args.chapterNo) : undefined;
  let styleRulesText = ''; let styleTerms: StyleTermDto[] = []; let styleDims: Record<StyleDimension,string> | undefined;
  let styleAxes: Record<StyleAxis,number> | undefined; let styleSamples: StyleSample[] = []; let styleSampleIds: string[] = [];
  if (merged) { styleRulesText = merged.rulesText; styleTerms = merged.terms; styleDims = merged.dims; styleAxes = merged.axes; styleSamples = merged.samples; styleSampleIds = styleSamples.map((x) => x.id); }
  ```
  （规格 C：**删除 `runMode !== 'continue'` 门**——continue 亦注入；fewShot 门 `book.styleFewshotOn`（:216）不动；快照优先/回落逻辑整体收编进 loadStyleBundle；**:296 抄用检测 referenceTexts 的 `runMode === 'generate'` 门原位保留——continue 不做抄用检测，执行者不得顺手扩**）
- [ ] continue 指令行（:233-250 draft slots）：`task: renderDraft({ chapterNo: args.chapterNo, targetChars, worldview: '', blueprint }) + (runMode === 'continue' ? '\n前文腔调优先，文风档案作质感参照。' : '')`——精确一行、句号结尾、置于任务段末尾
- [ ] polish.ts :41-80：素材块抽成导出纯函数 `export function polishBenchmarks(db: Database, book: { styleProfileId: string | null; styleSnapshotJson: string | null }, chapterNo: number): { voiceRefMetrics: StyleMetrics | undefined; referenceTexts: string[] | undefined; terms: StyleTermDto[] }`（管线消费其返回值；内部 binding 回落合成/loadStyleBundle/mergeStyleProfiles 与 chapter 同构），`terms = merged.terms`；**`referenceTexts = merged.samples.map((s) => s.text)` 直接取，不再二次轮转**（轮转已在 merge 第 7 步完成，critic 4.6；空数组→undefined）；`voiceRefMetrics` = `JSON.parse(merged.primaryMetricsJson)` 容错 → 空坏回落 `getLatestProfile(db, merged.primaryProfileId).metrics_json` 再容错（generate 同基准语义：声线锚=主风格）；merged 为 undefined → 三者维持现行空缺省（:43-45 原样）
- [ ] chapter.test.ts 新增（server +1）：`it('混合档案：draft system 含辅档案维度文本与加权轴值，styleRules 为合并规则'）`——沿 :229-240 capturing harness + repo 直绑（setBookStyleBinding + buildStyleBundle 手工 bundle：主 dims 节奏/对话/描写/情感基调 4 维（文本如 '主节奏文本' 每维非空）、axes['叙述温度']=70；辅 dims 其余 3 维（写作特点/特色词汇/章节结构，每维非空）、axes['叙述温度']=56；rulesText 主 '主规则甲' + 辅 '辅规则乙'）→ 断言 draft.system 含 '主节奏文本'（主维）与辅维文本、含 '（值 64）'（算式：wA=4 wB=3 → (70*4+56*3)/7=448/7=64）含 '主规则甲' 与 '辅规则乙'；`runMode='continue'` 同 bundle 再跑 → draft.system 仍含【文风画像】且 user 含 '前文腔调优先，文风档案作质感参照。'
- [ ] continue.test.ts 适配+新增（server +1）：用例一 :44-98 改名 `it('continue：绑定档案注入风格块与样本 ids（fewshot 关不注入范例片段），l0 含 style_drift'）`——:93 断言改 `style_sample_ids_json === '["mock-profile:s3","mock-profile:s1","mock-profile:s2"]'`（id 带 `${profileId}:` 命名空间前缀，merge 第 7 步）：门删除后 continue 走 loadStyleBundle 无快照回落 mock-profile live 行，池 3 条全归主配额，`pickStyleSamples(pool, chapterNo=3, 3)` 轮转 startIdx=(3-1)%3=2 → s3,s1,s2；**ids 记录不看 fewshot 开关（B4 裁决④，chapter.ts:214 注释），不得保留 '[]' 迁就旧文案**（此适配已列全局约束①）；provider 包一层捕获 draft prompt（capture harness 形态沿 chapter.test.ts:229-240）追加断言：`system` 含 'RULES: 句长 10-20 字。'（styleRules 稳定槽进 system）、`user` 含 '前文腔调优先，文风档案作质感参照。' 且不含 '【范例片段】'（fewshot 默认关）；l0 style_drift 断言保留；新增 `it('continue 开 fewshot → user 注入【范例片段】样本块'）`——setBookFewshot(db, bookId, true) 后重跑，断言 `user` 含 '【范例片段】' 与 '样本三'（fewShot 属 volatile 槽走 user、与 ids 同池轮转），`style_sample_ids_json` 与用例一同值（开关不影响 ids 记录）
- [ ] polish.test.ts 新增（server +1）：`it('polishBenchmarks：合并档案基准——术语并集含辅、referenceTexts 直取 merged.samples 无二次轮转'）`——直喂手工 bundle（主 terms []/samples 2 条/metricsJson '{}'，辅 terms [{term:'灵力',note:'代指法力'}]/samples 1 条，chapterNo=2）：断言返回 terms 含 '灵力' 条、referenceTexts deep-equal merged.samples 的 text 序列（3 条、轮转已在 merge 内完成不得再 slice）、voiceRefMetrics 可解析；再跑 runPolishChapter（既有 harness）抓 task 断言含 '灵力：代指法力'（注入面）
- [ ] 回归确认（零改动项）：generate-drift.test.ts（setBookStyleProfile 无快照 → loadStyleBundle 回落 live 行链）期望原样绿；style-snapshot.test.ts 用例三（快照优先注入标记）期望原样绿
- [ ] 验证：`pnpm --filter @inkforge/server exec vitest run test/pipeline/chapter.test.ts test/pipeline/continue.test.ts test/http/polish.test.ts test/pipeline/generate-drift.test.ts` 期望全绿（含既有场景一至五 prompt 稳定性用例）；`pnpm --filter @inkforge/server typecheck` exit 0

### Task-08 web 绑定 UI：StyleBindPanel 多选面板
**文件**：
- Modify `apps/web/src/pages/BookDetailPage.tsx`（:11-29 StyleBindSelect → StyleBindPanel、:474 调用点、:481 提示语）
- Modify `apps/web/src/api/client.ts`（:202-203 bindStyle 注释更新，签名不变）
- Modify（Test）`apps/web/src/pages/BookDetailPage.test.tsx`

**Interfaces**：
- Consumes：`StyleBindBody`（Task-04 新形态）、`StyleProfileDto[]`（既有 listStyleProfiles）、`book.styleBinding`（Task-06 GET 回显）
- Produces：`function StyleBindPanel({ binding, profiles, onBind }: { binding: { primaryProfileId: string; auxProfileIds: string[]; dimsSource: Record<string,string> } | null; profiles: StyleProfileDto[]; onBind: (body: StyleBindBody) => void }): JSX.Element`

**依赖**：Task-04、Task-06（回显字段在，UI 才有回显初值；测试用 fetch stub 不起真服务端，可在 Task-06 后随时做）

**步骤**：
- [ ] BookDetailPage.tsx :11-29 整段替换为 StyleBindPanel：本地 state `checked: string[]`（勾选序）、`primary: string`、`dims: Record<string,string>`、`touched: Set<string>`（用户显式改过的维度键）；初值由 props.binding 归一（null → 空）；**换主风格时：dims 中值===旧主且不在 touched 的键 → 改指新主**（critic 2.4：否则七键初值永远指旧主）；
  - 勾选列表：`profiles.map → <input type="checkbox" aria-label={\`风格档案勾选-${p.name}\`} checked={checked.includes(p.id)} onChange>`；上限 4：未勾且 `checked.length>=4` → `disabled` + `title="最多绑定 4 个（1 主 + 3 辅）"`（规格 B 精确上限）
  - 主风格：`<select aria-label="主风格">` 选项=勾选中档案（`{p.name}（v{p.version}）`），`primary` 初值=`binding?.primaryProfileId ?? checked[0]`
  - 七维来源：`STYLE_DIMENSIONS.map(d => <select aria-label={\`维度来源-${d}\`}>)` 选项=主+已勾辅，初值=`binding?.dimsSource[d] ?? primary`
  - 「保存绑定」Button **disabled={!primary || checked.length===0}**（防发 primaryProfileId:'' 吃 400，critic 2.4）→ `onBind({ primaryProfileId: primary, auxProfileIds: checked.filter(id => id !== primary), dimsSource: dims })`（dims 补齐七键：未显式改的键=primary）；「解绑」Button → `onBind({ profileId: null })`
  - 勾选变化时 `primary` 若失勾 → 自动回落 `checked[0] ?? ''`；`dims` 中失勾档案的键回落主
- [ ] :474 调用点替换：**书加载完成才挂载、换书强制重建** `{book ? <StyleBindPanel key={book.id} binding={book.styleBinding ?? null} profiles={Array.isArray(profiles) ? profiles : []} onBind={bindStyle} /> : null}`（critic 2.4：页面无 loading 守卫，面板 useState 初值首帧捕 null、GET 到达后不会重算，已绑书会显示成未绑）；:175-184 bindStyle fn 签名改 `(body: StyleBindBody)`，消息文案保留原句，**保存成功消息追加一行「绑定保存后文风示例开关已归零」（沿 books.ts:110 重绑归零语义，显性化不静默）**；:294 chip 改 `已绑定 N 个（主：<档案名>）` 形态（N=主+辅数，多选下只报主易误导，critic 2.4）；:481 提示语改为「续写也注入混合风格：前文腔调优先，文风档案作质感参照。」
- [ ] client.ts :202-203：注释补「body 支持多选形态（primaryProfileId/auxProfileIds/dimsSource）与 legacy {profileId}」，函数签名不动
- [ ] BookDetailPage.test.tsx 新增 describe（web +3，stub fetch 形态沿 :57-83）：book fixture 加 `styleBinding: null`、`styleFewshotOn: false`、`styleProfileId: null`——
  - `it('风格多选面板：勾 2 档案保存 → PUT body 为 1 主 1 辅 + 七键 dimsSource'）` 勾 p1、p2 → 主风格 select 值 'p1' → `维度来源-对话` 选 'p2' → 点「保存绑定」→ 断言 PUT `/api/books/b1/style` body deep-equal `{primaryProfileId:'p1', auxProfileIds:['p2'], dimsSource:{节奏:'p1',对话:'p2',描写:'p1',情感基调:'p1',写作特点:'p1',特色词汇:'p1',章节结构:'p1'}}`
  - `it('上限 4：第 5 个档案勾选框 disabled；解绑发 {profileId:null}'）` stub 回 5 档案 → 勾满 4 → 第 5 个 checkbox `disabled===true`；点「解绑」→ PUT body equals `{profileId:null}`
  - `it('已绑书初值渲染：binding 非空 → 勾选/主风格/七维值全部落对'）` book stub 首帧 undefined 次帧回真书（验挂载时机）+ `styleBinding:{primaryProfileId:'p1',auxProfileIds:['p2'],dimsSource:{对话:'p2'}}` → 断言 p1/p2 档案 checkbox 均 checked、`主风格` select 值 'p1'、`维度来源-对话` 值 'p2'、`维度来源-节奏` 值 'p1'、保存按钮 enabled（critic 2.4：两条 null-binding 用例测不到初值同步）
- [ ] 验证：`pnpm --filter @inkforge/web exec vitest run src/pages/BookDetailPage.test.tsx src/pages/NewBookIdeaPage.test.tsx` 期望全绿；`pnpm --filter @inkforge/web typecheck` exit 0
- [ ] GUI 未验证（owner 真实测试）——提交信息注明

### Task-09 全量收口验证（验证链硬序）
**文件**：无新改动（只读验证 + 决策日志执行留痕补记由主模型收口时处理）

**Interfaces**：
- Consumes：Task-01~08 全部交付物
- Produces：验证链五环证据 + 提交链（只 commit 不 push）

**依赖**：Task-01~08 全部

**步骤**：
- [ ] 静态：`pnpm typecheck` 期望全 workspace exit 0；`pnpm lint` 期望零输出
- [ ] 定向（各任务步骤已跑）复核一遍：`pnpm --filter @inkforge/server exec vitest run test/db test/style test/http/style.test.ts test/http/style-snapshot.test.ts test/pipeline` 期望全绿
- [ ] 全量：`pnpm -r --if-present run test` 期望 server 302 passed（272+30）、web 89 passed（85+4）、shared 2 passed——**合计 393 ≥ 基线 359，逐包数核对只增不减；各卡报数一律增量口径，绝对数与卡面不符先核对口径、不得改测试凑数（critic 2.2）**
- [ ] 冒烟：`pnpm --filter @inkforge/web build` 期望 exit 0（产物体积与基线同数量级即可）
- [ ] 安全比基线：`pnpm audit --prod` 期望零新增漏洞；提交前秘密扫描沿提交五步（secret 扫描→Conventional 中文提交→三查），正文 `verify: typecheck 0 错/定向 N 绿/全量 385/冒烟 build OK/audit 0`；永不 --no-verify、永不 git add -A、只 commit 不 push
- [ ] GUI 行：涉及 NewBookIdeaPage/BookDetailPage 的提交信息注明「GUI 未验证（owner 真实测试）」

## 实现级钉死清单（主模型钉细节落点，owner 可驳回）
| # | 钉细节 | 落点 |
|---|---|---|
| D1 | 快照升级为「拼装映射+冻结内容」V2 bundle，合并产物注入时确定性重算 | Task-05 StyleBundleV2 + 论证节 |
| D2 | 档案重蒸不自动刷新绑定快照（重蒸=新 id 新行，旧行不可变+bundle 内容副本双保险） | Task-06 测试「重蒸不刷新」 |
| D3 | 向导逐章字数随既有 PUT blueprint 落库，不新增 API | Task-01（BlueprintPutBody 不变） |
| D4 | books.style_profile_id 保留为主风格镜像（BookDto/chip/旧消费零破坏） | Task-02/03/06 |
| D5 | 规则合并：主全量保留优先于 400 总预算（主超 400 不补辅） | Task-05 算法 5 + 测试 |
| D6 | 术语并集上限 10 条（沿蒸馏 TERMS 3-10 惯例）；样本总席位 3、最大余数法配额、池内轮转 | Task-05 常量+算法 6/7 |
| D7 | 六轴加权：辅缺轴值→该轴在有余值档案间重归一；全缺→轴不注入（renderStyleDimsBlock 自滤） | Task-05 算法 4 + 测试 |
| D8 | continue 声线锚保留 prevTexts computeStyleMetrics；generate/polish 声线基准=主档案 metrics（辅不参与锚定） | Task-07 |
| D9 | legacy body {profileId} 与 legacy 无快照绑定（setBookStyleProfile）两条兼容链保留 | Task-06 schema 规则 3、Task-05 loadStyleBundle 回落 |
| D10 | 桌面 NSIS/资源快照不手补（打包期整树再生成物，0006-0009 既有漂移一并知会 owner） | 调研基线末条 |
| D11 | migrate-prod.mjs 滞留 `uv !== 3` 一并销号为 10（既有缺陷顺手修复，实迁门语义不变） | Task-02 |

## 自审五查（写毕自查，已就地修）
1. **规格覆盖**：A 向导瘦身（Task-01：勾选/标题默认第N章/字数默认 3000 min 500/只读预览/深度编辑不动）✓；B 多选拼装（Task-02~06+08：上限 4=1+3、主显式、七维独立来源默认主、六轴贡献维数加权保底 1、规则 400、术语并集、样本等比、槽预算 600/1000/1500 与 8K styleDims=0 不动——槽预算零改动由「merged 与单档案同形」保证）✓；C 续写注入（Task-07：锚保留+混合块并存+指令行原文）✓；D 三钉（D1-D3）✓；409 反查/绑定回显/冻结语义三处成立（论证节+Task-03/06）✓。
2. **步骤唯一可写**：每步一个动作+可核对结果；无 TBD/「适当处理」死行；测试步均带测试名+精确断言值+规格数值；验证步均带精确命令+期望输出。✓（自查修正：Task-07 加权 fixture 与算式对齐——主 4 维 70/辅 3 维 56 → 448/7=64 断言『（值 64）』；Task-06 校验规则 3 原表述会误杀 legacy body，已改为「profileId 为 undefined 且 primary 缺省才报错，字符串=legacy 放行」并拆出规则 7；Task-01 去掉规格外 20000 上限，只保留 min 500+NaN 兜底）
3. **类型一致**：StyleBindBody 四字段/StyleBindingDto 三字段/StyleBundleV2/MergedStyleProfile 前后文一致；setBookStyleBinding(dimsSource: Record<string,string>) 与 Dto 一致；GET 回显 `styleBinding` 键名在 routes/DTO/UI 三处一致。✓
4. **隐含输入容错**：损坏快照 JSON（parseStyleBundle→undefined→回落 live 行/live 行坏→空内容）、辅档案缺轴值（重归一）、辅样本池空（顺延补齐）、dimsSource 越权值（归主）、主 rulesText 超 400（不补辅）、fewshot 开关门（不动）、8K styleDims=0（assembler 截 0 沿用）——各配测试或在算法步钉死。✓
5. **比例**：server 30 / web 4 增量与各任务「预计新增」逐项可加总核对（3+20+4+2+1=30；1+3=4）；改动量与验收粒度成比例，merge 纯函数 20 例占大头（算法风险集中处），管线/UI 各 2-4 例聚焦规格断言。✓

**主模型复核轮（2026-11-17，就地修，共 5 处）：** ①continue 用例一 ids 断言 `'[]'`→`'["s3","s1","s2"]'`（B4 裁决④ ids 不看开关，chapter.ts:214 实证）；②Task-03 绑定行 ts 事务内单值+`ORDER BY is_primary DESC, rowid`（毫秒漂移会乱辅绑定序，merge 算法依赖）；③Task-01 蓝图区断言改 step2 全局 textarea 计数=0（原 aria-label 前缀断言与 DOM 现状不对位）；④Task-07 钉死 :296 抄用检测 generate 门原位保留（continue 不做抄用检测，防执行者顺手扩）；⑤Task-05 dims 来源 id 不在 profiles 表内→归主防御。复核另经代码实证：renderStyleDimsBlock 轴行格式 `…（值 64）` 与断言兼容（inject.ts:65）、styleDims/styleRules 均 stable 槽进 system（assembler.ts:64-91）、fewShot 属 volatile 走 user、polish 术语进 taskText `【术语表】` 格式 `term：note`（polish.ts:88）、generate voiceRef 现读 live metrics（chapter.ts:111-119，改 merged 冻结值+回落链等价）。

**decision-critic 评议轮（2026-11-17，总立场=有条件支持；主审回应=全部采纳，就地修）：** [HIGH_RISK_OBJECTION] 2.1 迁移窗口（app.ts:34/worker main.ts:15 启动无条件 migrate——0010 落盘即被下次服务启动应用；SM-02→SM-03 间 deleteBook 无清理行、删已绑书 500）→采纳：SM-02/03 并卡一次提交+派发前主审 VACUUM INTO 生产库快照+回填 INSERT OR IGNORE 幂等+ux_book_style_profiles_primary 部分唯一索引。[MATERIAL_CONFLICT] 1.2「samples_json 坏→[] 沿 chapter 现状」不实（chapter 坏 JSON 走外层 catch 整章 fail）→措辞改「新增硬化（对齐 polish.ts:52-66）」+contentFromProfileRow 纯函数用例；2.2 卡面绝对计数在任何顺序下互斥→全卡改增量口径。[MINOR] 全采纳：快照冻结粒度以 D1 为准+mergeVersion 字段（critic 1.3）、merge 算法钉死七处（实际贡献计权 4.3/轴分母 w>0 4.2/规则 break 语义 4.1/顺延循环 4.4/样本 id 命名空间 4.5/辅含主去重 4.7/确定性 meta 测）、polish 取消二次轮转+抽 polishBenchmarks 纯函数（4.6）、SM-08 面板挂载时机+key 重建/换主重映射/保存禁用/chip 多选语义/fewshot 归零显性化+初值渲染用例（2.4）、卡面补退回点（2.5）。critic 两语义问主审钉死：向导 step3 发起生成保留（导流非编辑面）；主零贡献时样本 0 席合意（完成通知知会 owner 可驳回）。continue 注入 fewshot 样本但不做抄用检测=既有缺口本次不扩，列「已知接受项」。
