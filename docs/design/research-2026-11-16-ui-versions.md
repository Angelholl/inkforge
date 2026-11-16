# 调研报告 R1：按钮样式一致性与版本删除通路现状（2026-11-16）

> 范围：Q1 仅 `apps/web/src`；Q2 `apps/server/src` + `apps/web/src/pages`。全程只读，未改动任何代码文件。
> 基线：`1ba858c`（工作树 clean）。引用的历史提交 `bef65ec`（阶段 D 公共组件）、`c26e97b`（删书级联）均在库。

---

## 结论先行

### Q1 按钮清点

**根因：`apps/web/src/components/ui.tsx` 里没有 Button 组件。** 该文件只导出 `Card`、`Badge`、`Chip`、`Console`、`runStatusTone` 五个东西（ui.tsx:4/19/24/52/70），不存在任何 `variant` 定义。因此「枚举公共 Button 变体」的答案是 **0 个变体**；全站 **65 处 `<button>` 全部是手写内联 class**，公共组件调用数为 **0**。这正是「各种按钮不统一、部分没有底框」的直接原因。

统计（65 处，不含测试文件）：

| 维度 | 数量 |
|---|---|
| 无边框 | 57 |
| 无底色（无 `bg-*`） | 21 |
| **无边框且无底色（纯文本式）** | **16** |
| 有边框无底色 | 5 |
| 有底色无边框 | 41 |
| 边框+底色都有 | 3 |
| 圆角 `rounded`（4px） | 43 |
| 圆角 `rounded-ctl`（8px） | 6 |

#### 清单① 未走公共组件的裸按钮（65/65，按文件）

| 文件 | 数量 | 行号（文案） |
|---|---|---|
| BookDetailPage.tsx | 13 | 209 整书生成 / 212 刷新 / 225 导出 / 250 保存设定 / 280 保存 / 283 取消 / 292 编辑 / 300 删除 / 324 添加人物 / 363 补摘要 / 367 生成 / 391 保存蓝图 / 394 生成本章 |
| BookSamplePicker.tsx | 2 | 56 从书架选书 / 93 导入所选 N 章 |
| BooksPage.tsx | 3 | 48 确认删除 / 51 取消 / 60 删除 |
| ChapterReaderPage.tsx | 3 | 42 回滚到当前所选 / 45 导出 markdown / 56 版本链 chip |
| DistillPage.tsx | 2 | 60 保存模板 / 63 恢复默认 |
| ForeshadowingsSection.tsx | 3 | 90 标记回收 / 95 删除 / 121 登记伏笔 |
| ImitationProfilesSection.tsx | 5 | 97 删除 / 115 绑定 / 149 拆解分析 / 179 确认入库 / 182 放弃 |
| NewBookIdeaPage.tsx | 6 | 144 添加人物 / 164 移除 / 199 建书并生成蓝图 / 224 收起·编辑 / 247 保存蓝图并继续 / 262 发起生成 |
| NewBookPage.tsx | 7 | 149 建书并进入导入 / 176 拆章预览 / 179 导入 N 章 / 194 删除 / 215 补摘要·第 N 章 / 222 AI 建议蓝图 / 233 发起续写 |
| OutlineTreeSection.tsx | 11 | 110 AI 生成大纲树 / 113 手动加卷 / 116 编辑已存树 / 119 偏离复核 / 139 加阶段 / 142 删卷 / 169 加卡 / 172 删阶段 / 217 删卡 / 241 保存大纲树 / 244 放弃草稿 |
| RunPage.tsx | 3 | 70 暂停 / 73 继续 / 76 取消 |
| SelectionRewrite.tsx | 2 | 52 预设 chip / 69 提交选段重写 |
| SettingsPage.tsx | 1 | 124 保存（`type="submit"`） |
| StyleProfilesSection.tsx | 4 | 125 版本·收起版本 / 177 蒸馏 / 234 确认入库 / 237 放弃 |

**其他形态（c）**：无 `input[type=submit]`、无 `<label>` 伪装按钮。仅 `SettingsPage.tsx:124` 用 `<button type="submit">`，`NewBookIdeaPage.tsx:144/164` 用 `<button type="button">`，本质仍是裸 button。

#### 清单② 无边框且无底色的裸文本式按钮（16 处）

| # | path:line | 文案 | 完整 class |
|---|---|---|---|
| 1 | BookDetailPage.tsx:292 | 编辑 | `text-primary-strong` |
| 2 | BookDetailPage.tsx:300 | 删除 | `text-danger` |
| 3 | BookDetailPage.tsx:363 | 补摘要 | `text-sm text-primary-strong` |
| 4 | BookDetailPage.tsx:367 | 生成 | `ml-auto text-sm text-primary-strong` |
| 5 | ForeshadowingsSection.tsx:90 | 标记回收 | `text-primary-strong` |
| 6 | ForeshadowingsSection.tsx:95 | 删除 | `ml-auto text-danger` |
| 7 | ImitationProfilesSection.tsx:97 | 删除 | `ml-auto text-sm text-danger` |
| 8 | NewBookIdeaPage.tsx:164 | 移除 | `ml-auto text-sm text-danger` |
| 9 | NewBookIdeaPage.tsx:224 | 收起/编辑 | `ml-auto text-sm text-primary-strong` |
| 10 | NewBookPage.tsx:194 | 删除 | `text-danger` |
| 11 | OutlineTreeSection.tsx:139 | 加阶段 | `text-primary-strong` |
| 12 | OutlineTreeSection.tsx:142 | 删卷 | `text-danger` |
| 13 | OutlineTreeSection.tsx:169 | 加卡 | `text-primary-strong` |
| 14 | OutlineTreeSection.tsx:172 | 删阶段 | `text-danger` |
| 15 | OutlineTreeSection.tsx:217 | 删卡 | `text-danger` |
| 16 | StyleProfilesSection.tsx:125 | 版本/收起版本 | `ml-auto text-primary-strong` |

另有 5 处「有框无底」的中间态：BookSamplePicker.tsx:56（`rounded border px-4 py-2 text-sm`）、BooksPage.tsx:51（`rounded-ctl border border-line px-2 py-1`）、NewBookPage.tsx:176/215/222（`rounded border …`）。

#### 清单③ 同类按钮样式不一致对照表

**A. 危险操作（删除）——7 处三种形态：**

| path:line | 文案 | 形态 | class 关键段 |
|---|---|---|---|
| BooksPage.tsx:60 | 删除 | 描边+hover 底 | `rounded-ctl border border-danger px-2 py-1 text-xs text-danger hover:bg-danger-soft` |
| BooksPage.tsx:48 | 确认删除 | 实底白字 | `rounded-ctl bg-danger px-2 py-1 text-white` |
| BookDetailPage.tsx:300 | 删除 | 纯文本 | `text-danger` |
| ForeshadowingsSection.tsx:95 | 删除 | 纯文本 | `ml-auto text-danger` |
| NewBookPage.tsx:194 | 删除 | 纯文本 | `text-danger` |
| OutlineTreeSection.tsx:142/172/217 | 删卷/删阶段/删卡 | 纯文本 | `text-danger` |
| ImitationProfilesSection.tsx:97 | 删除 | 纯文本（字号不同） | `ml-auto text-sm text-danger` |

**B. 主操作（提交/生成/保存）——底色一致但圆角、内边距、字号三套：**

| 形态 | 代表 | 问题 |
|---|---|---|
| `rounded bg-primary px-4 py-2 text-white` | NewBookPage:149、NewBookIdeaPage:199、RunPage 之外多数 | 圆角 4px |
| `rounded bg-primary px-4 py-1.5 text-sm text-white` | DistillPage:60、StyleProfilesSection:234、OutlineTreeSection:241 | 圆角 4px + 小一号 |
| `rounded bg-primary px-3 py-1 text-white` | BookDetailPage:280、OutlineTreeSection:110 | 更小内边距 |
| `h-ctl rounded-ctl bg-primary px-4 text-white` | BookDetailPage:209 | 圆角 8px + 无 py |
| 同语义却是纯文本 | BookDetailPage:367「生成」 vs NewBookPage:179/233「导入/续写」是主色实底 | 同「生成」两种形态 |

**C. 次操作（取消/放弃/次要）——3 种形态混用：**

| 形态 | 代表 |
|---|---|
| `bg-bg` 无框 | BookDetailPage:283/324/394、DistillPage:63、ForeshadowingsSection:121、ImitationProfilesSection:115/182、NewBookIdeaPage:144、OutlineTreeSection:113/116/119/244、RunPage:73、SelectionRewrite:52 |
| `border` 无底 | BooksPage:51、NewBookPage:176/215/222、BookSamplePicker:56 |
| 纯文本 | 清单②的 16 处 |

**D. 圆角/尺寸 token 混用**：43 处 `rounded`（4px）对 6 处 `rounded-ctl`（8px）；`h-ctl`（36px 控件高，index.css:7 有定义）只有 BookDetailPage:209/212/225 三处使用。

---

### Q2 版本删除通路

| 版本/档案类型 | 存储 | API 删除 | UI 删除 | 结论 |
|---|---|---|---|---|
| 章节正文版本 | `chapter_versions` | **无** | **无** | **完全无删除通路**（只能删整本书级联） |
| 风格档案（含同源版本链） | `style_profiles` | **无** | **无** | **完全无删除通路**，版本只增不减 |
| 仿写档案（含同源版本链） | `imitation_profiles` | 有：`DELETE /api/imitation-profiles/:id` | 有：ImitationProfilesSection.tsx:97「删除」 | 有，但**按单行/单版本**删除，无「整族/批量清理」 |
| 蒸馏模板 | `app_meta.distill_template` | 无（非版本化，PUT 覆盖） | 无 | 不需要 |
| 整书删除 | 多表级联 | 有：`DELETE /api/books/:bookId` | 有：BooksPage 两步确认 | 覆盖 `chapter_versions`，但不覆盖两类档案 |

**直接回答：当前完全没有删除通路的是 ①章节正文版本 `chapter_versions`、②风格档案 `style_profiles`；仿写档案有单条删除但缺整族清理。** 三者都没有任何「保留最新 N 版」之类的自动清理策略。

**堆积后果证据（可预见体积/性能）：**

1. `listVersions` 用 `SELECT *` 把每个版本的完整正文 `content TEXT` 一起读出（chapters.ts:237），而 ChapterReaderPage 每 5 秒轮询一次（ChapterReaderPage.tsx:11-15）并全量渲染版本链（:52-69）。每生成/润色/重写一章就多一条全文行，读放大随版本数线性增长。
2. 风格档案列表 `SELECT … FROM style_profiles ORDER BY created_at DESC` 无 `LIMIT`（routes.ts:605-608）；同源版本列表同样无 `LIMIT`（routes.ts:620-627）。每次同源蒸馏都 `MAX(version)+1` 插入新行、旧行永不改（analysis.ts:95-105），列表与版本视图都随行数线性变慢。
3. 仿写档案列表 `SELECT * FROM imitation_profiles` 无 `LIMIT`（imitation.ts:57），且同样是同源 version+1 不可变插入（imitation.ts:32-53）。
4. `chapter_versions` 的 DDL 只有 `REFERENCES chapters(id)`，**无 `ON DELETE CASCADE`**（0001_core.sql:16-24），单章若被删会留孤儿；目前唯一清理路径是整书删除时显式按序 DELETE（books.ts:204-215，其中 :208 清 chapter_versions）。
5. 唯一的「保留 N 份」实现只针对**数据库备份文件**（backup.ts:7，`retain = 5`），与版本表无关。

---

## 证据

### Q1

1. **无公共 Button 组件** — `apps/web/src/components/ui.tsx:4/19/24/52/70`，导出物仅五个：

```tsx
export function Card(...)            // :4
export function Badge(...)           // :19
export function Chip(...)            // :24
export function Console(...)         // :52
export function runStatusTone(...)   // :70
```

`grep -rn "Button" apps/web/src --include=*.tsx --include=*.ts | grep -v test` → **0 行**；`grep -rnE "<Button|Button\(" apps/web/src` → **0 行**。

2. **65 处裸按钮、全部内联 class** — 例 `apps/web/src/pages/BookDetailPage.tsx:209`：

```tsx
<button className="h-ctl rounded-ctl bg-primary px-4 text-white" onClick={generateAll}>
  整书生成
</button>
```

同文件 :250 主操作却写成 `mt-2 rounded bg-primary px-4 py-1.5 text-white`（圆角/内边距不同）。

3. **同「删除」三种形态** — `apps/web/src/pages/BooksPage.tsx:60` 与 `BookDetailPage.tsx:300`：

```tsx
// BooksPage.tsx:60
className="ml-auto rounded-ctl border border-danger px-2 py-1 text-xs text-danger hover:bg-danger-soft"
// BookDetailPage.tsx:300
<button className="text-danger" onClick={() => void removeCard(c)}>删除</button>
```

4. **纯文本按钮无框无底** — `apps/web/src/pages/OutlineTreeSection.tsx:142/172/217` 三处均为 `className="text-danger"`；`ForeshadowingsSection.tsx:90` 为 `className="text-primary-strong"`。

### Q2

1. **chapter_versions DDL，无级联、content 全量存储** — `apps/server/src/db/migrations/0001_core.sql:16-24`：

```sql
CREATE TABLE IF NOT EXISTS chapter_versions(
  id TEXT PRIMARY KEY, chapter_id TEXT NOT NULL REFERENCES chapters(id),
  parent_version_id TEXT,
  kind TEXT NOT NULL CHECK(kind IN ('original','draft','revised','final','manual_edit')),
  content TEXT NOT NULL, word_count INTEGER NOT NULL,
  ...
```

2. **6 个写入点、0 个删除点** — 写入：`db/repositories/chapters.ts:155`（original）、`pipeline/chapter.ts:243`（draft）、`pipeline/chapter.ts:351`（revised）、`pipeline/polish.ts:124`、`http/routes.ts:571`（salvage）、`http/routes.ts:836`（选段重写）。路由只有读与回滚，没有 DELETE：

```ts
app.get('/api/books/:bookId/chapters/:chapterNo/versions', ...) // routes.ts:755
app.get('/api/versions/:versionId', ...)                          // routes.ts:762
app.post('/api/versions/:versionId/rollback', ...)                // routes.ts:769
```

3. **版本链 UI 无删除** — `apps/web/src/pages/ChapterReaderPage.tsx:52-69`，按钮只有 :42「回滚到当前所选」、:45「导出 markdown」、:56 版本 chip（`onClick={() => setSelected(v.id)}`），无删除入口。

4. **风格档案 version+1 不可变** — `apps/server/src/style/analysis.ts:95-105`：

```ts
const prev = db.prepare('SELECT MAX(version) AS v FROM style_profiles WHERE source_hash = ?').get(sourceHash);
const version = (prev.v ?? 0) + 1;
...
db.prepare('INSERT INTO style_profiles(...) VALUES(?,?,?,?,?,?,?,?,?)').run(...)
```

档案 API 只有列表/版本列表/蒸馏/入库（routes.ts:605、620、656、678），`app.delete` 全库仅 4 条（books、characters、foreshadowings、imitation-profiles），无 style-profiles。UI `StyleProfilesSection.tsx:116-145` 只有「版本/收起版本」切换按钮，无删除、无逐条「重新蒸馏」。

5. **仿写档案确有单条删除** — `apps/server/src/http/routes.ts:719-724` + `db/repositories/imitation.ts:68-78`（事务内先解绑 `books.imitation_profile_id` 再删行）；UI `ImitationProfilesSection.tsx:97`。但列表每行是一个版本，删除只作用于该行，无整族删除。

6. **整书级联覆盖 chapter_versions** — `apps/server/src/db/repositories/books.ts:204-215`，关键行 :208：

```ts
db.prepare('DELETE FROM chapter_versions WHERE chapter_id IN (SELECT id FROM chapters WHERE book_id = ?)').run(id);
```

注释明确「外键无级联（SQLite 默认 RESTRICT），按依赖序显式清空」；级联不含 `style_profiles` / `imitation_profiles`（二者为全局档案）。

7. **唯一的保留策略是 DB 备份** — `apps/server/src/db/backup.ts:7`：

```ts
export function backupBook(db, bookId, backupDir, retain = 5): string {
```

清理逻辑仅针对 `{bookId}-*.db` 备份文件（backup.ts:23-30），不涉及版本表。

---

## 未找到项与已试搜索词

| 未找到结论 | 实际试过的搜索词/命令 | 结果 |
|---|---|---|
| 公共 Button 组件/变体 | `grep -rn "Button" apps/web/src --include=*.tsx --include=*.ts \| grep -v test`；`grep -rnE "<Button\|Button\(" apps/web/src`；`grep -nE "variant\|border\|bg-" apps/web/src/components/ui.tsx` | 0 / 0 / 仅 Card/Badge/Chip/Console 的 border、bg |
| `router.delete` 删除端点 | 卡④原命令 `grep -rniE "router\.delete\|'DELETE'" apps/server/src` | **0 行——假阴性**：项目用 Fastify `app.delete`，不是 Express `router.delete` |
| 服务端实际删除端点 | `grep -n "delete(" apps/server/src/http/routes.ts` | 4 条：:96 books、:144 characters、:181 foreshadowings、:719 imitation-profiles |
| 章节版本删除（API+UI） | `grep -rniE "删除.*版本\|版本.*删除\|deleteVersion\|removeVersion" apps/web/src apps/server/src` | 0 行 |
| 风格档案删除 | `grep -rniE "deleteStyleProfile\|style-profiles/:id'" apps/server/src apps/web/src`；`grep -n "delete(" apps/server/src/http/routes.ts` | 0 行 / 无 style 路由 |
| 「重新蒸馏」操作 | `grep -rniE "重新蒸馏\|再蒸馏" apps/server/src apps/web/src` | 0 行 |
| 版本保留/自动清理 | `grep -rniE "retention\|cleanup\|清理\|保留\|prune\|LIMIT [0-9]" apps/server/src` | 仅 backup.ts 备份保留 5 份、SSE cleanup、查询 `LIMIT 1`；无版本清理 |
| label/input 伪装按钮 | `grep -rnE "<input\|<label" apps/web/src --include=*.tsx \| grep -v test` | 均为表单输入/标签，无伪装按钮；仅 SettingsPage:124 `button type="submit"` |

### ④ 验收命令执行结果

| 命令 | 结果 |
|---|---|
| `grep -nE "variant\|border\|bg-" apps/web/src/components/ui.tsx \| head -40` | 7 行，全是 Card/Badge/Chip/Console 的 class；**无 `variant`、无 Button** |
| `grep -rnE "<button" apps/web/src \| head -60` | 命中 65 处（head 截断到 60 行），分布 14 个文件 |
| `grep -rn "chapter_versions" apps/server/src \| head -20` | 9 行：DDL(:16)、索引(:3)、仓库(:199/219/221/226/237/241)、路由(:744) |
| `grep -rniE "router\.delete\|'DELETE'" apps/server/src \| head -30` | **0 行**（见上表假阴性说明） |
| `grep -rniE "删除" apps/web/src/pages \| head -30` | 命中含测试；实现侧危险操作集中在 BooksPage/Foreshadowings/ImitationProfiles/NewBookPage |
