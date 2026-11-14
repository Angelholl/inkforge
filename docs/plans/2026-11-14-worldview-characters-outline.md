# 墨炉（Inkforge）世界观/人物卡/剧情大纲功能扩展实现计划（2026-11-14）

**目标：** 把入口 B 向导里「一锅炖」的设定文本升级为一等功能：世界观可回编（书详情）、人物卡结构化管理（建书即录 + 书详情 CRUD + 注入生成/蓝图提示）、剧情大纲独立字段（建书即录 + 书详情回编 + 注入全书蓝图勾画）。

**架构：** 人物卡复用既有 `characters` 表（UNIQUE(book_id,name)，`character_states` 以 character_id 外键联动连续性追踪；`createBook` 已收 characters 入参）零新表；剧情大纲 = `books.outline` 新列（migration 0004，user_version 3→4）；世界观维持 `books.description`（DEC-2026-1114-01 D3 不变）。提示注入走槽位装配：draft 新增可选 stable `characters` 槽，outline-suggest 新增 `characters`/`outline` 两槽；rewrite/blueprint-suggest 本轮不动（范围控制）。

**规格：** owner 2026-11-14 指令「添加世界观、人物卡、剧情大纲等功能」（本会话不外派，方案主模型自定归档，同 DEC-2026-1114-01 先例）；意向书 docs/intent/novel-pipeline.md 入口 B。

## 全局约束

1. 版本冻结 0.1.2（DEC-2026-1114-01 口径延续，owner 未答复前不动 tauri.conf version）。
2. 生产库 `apps/server/data/inkforge.db` 当前 user_version=3 且无活动 run（0423945b 已终态 done）；migration 0004 幂等顺序推进，禁止任何对生产库的手工写。
3. 测试账本：基线 200（shared 2 / web 20 / server 178）→ 目标 211（server +9、web +2）；每 commit 点只增不减。
4. 禁 `git add -A`；commit = Conventional 前缀 + 中文描述，正文 `verify: <验证结果>` + `Refs: DEC-2026-1113-07, DEC-2026-1114-03`。
5. GUI 黑盒一律 8789 端口 + 临时 data 目录（8787 生产服务与物证零触碰）。
6. push 仍按 DEC-2026-1113-06：全部任务结束后一次性统一 push，push 前 code-review + 三查。

## 任务 W-1：server 基座（migration 0004 + shared 类型 + repo + config + 渲染/槽位）

**文件：** Create `apps/server/src/db/migrations/0004_book_outline.sql`；Modify `packages/shared/src/api.ts`；Modify `apps/server/src/db/repositories/books.ts`；Modify `apps/server/src/config.ts`；Modify `apps/server/src/prompts/render.ts`；Modify `apps/server/src/context/assembler.ts`；Modify `apps/server/src/pipeline/chapter.ts`（draft 槽装配一处）；Test Modify `apps/server/test/db/repositories.test.ts`(+2)、`apps/server/test/prompts/contract.test.ts`(+3)、`apps/server/test/config.test.ts`（钉值更新，计数不变）。

**接口（钉死）：**

```sql
-- 0004_book_outline.sql
ALTER TABLE books ADD COLUMN outline TEXT NOT NULL DEFAULT '';
```

```ts
// shared/api.ts
export interface CharacterDto { id: string; name: string; baseSetting: string }
export interface CreateCharacterBody { name: string; baseSetting?: string }
export interface UpdateCharacterBody { name?: string; baseSetting?: string }
export interface BookMetaPutBody { title?: string; description?: string; outline?: string }
// CreateBookBody += outline?: string；BookDto += outline: string
```

```ts
// repositories/books.ts
export function updateBookMeta(db, bookId: string, patch: { title?: string; description?: string; outline?: string }): Book | undefined;
export function getCharacter(db, bookId: string, characterId: string): { id: string; name: string; baseSetting: string } | undefined;
export function createCharacter(db, bookId: string, input: { name: string; baseSetting?: string }): { id: string; name: string; baseSetting: string };  // 重名抛 SQLite UNIQUE 约束错，由端点转 409
export function updateCharacter(db, bookId: string, characterId: string, patch: { name?: string; baseSetting?: string }): { id: string; name: string; baseSetting: string } | undefined;
export function deleteCharacter(db, bookId: string, characterId: string): boolean;  // 事务内先删 character_states 再删 characters；bookId 不匹配返回 false
// createBook input += outline?: string；Book/BookRow/toBook += outline
```

```ts
// config.ts：DraftBudgets += characters: number（BUDGETS_DRAFT.characters=800；BUDGETS_DRAFT_8K.characters=0，8k 档截空即关闭）
// OutlineBudgets += { characters: number; outline: number }（BUDGETS_OUTLINE = {hardRules:300, worldview:5000, characters:1200, outline:2000, task:600}）
```

```ts
// render.ts
export function renderCharacterCards(cards: Array<{ name: string; baseSetting: string }>): string;
// 空数组 → ''；每卡：`【人物卡】${name}` + 设定行；baseSetting 为 JSON 对象 → 逐 entry `k: v` 以「；」连接；
// '{}' → 仅名字行；非法 JSON → trim 后原文
```

```ts
// assembler.ts draftSlots：input += characters?: string；worldview 槽之后插入
// { name:'characters', content, budgetChars: budgets.characters, stable:true, keep:'head' }（content 空则不插，既有槽序不变）
```

```ts
// chapter.ts draft 装配处：characters: renderCharacterCards(listCharacters(db, args.bookId)) || undefined
```

**步骤：**
- [ ] 先红 contract.test.ts +3：`'renderCharacterCards：多卡渲染含姓名与设定键值'`（断言含【人物卡】、名字与 `身份: 主角`）；`'renderCharacterCards：空数组 → 空串；非法 JSON → 原文'`；`'draftSlots：characters 槽紧随 worldview 且 stable'`（slotReport 序断言）。→ 红。
- [ ] repositories.test.ts +2：`'createCharacter/updateCharacter/deleteCharacter 往返，重名拒绝，删除级联清理 character_states'`；`'updateBookMeta 持久化 outline 与 description；createBook 收 outline 往返'`。→ 红。
- [ ] migration 0004 + repo 实现 + config 预算 + renderCharacterCards + draftSlots 扩展 + chapter.ts 装配 → 绿：`cd apps/server && pnpm vitest run test/db/repositories.test.ts test/prompts/contract.test.ts test/config.test.ts`（config.test 钉值期望对象补 characters/outline 新键）。
- [ ] shared 类型（api.ts + BookDto.outline + CreateBookBody.outline）→ `pnpm -w typecheck` 绿。
- [ ] commit：`feat(server): 人物卡/剧情大纲数据基座（migration 0004 + CRUD 仓储 + 槽位装配）`。

## 任务 W-2：server 端点（PUT meta + 人物卡 CRUD）

**文件：** Modify `apps/server/src/http/schemas.ts`（+bookMetaPutSchema/createCharacterSchema/updateCharacterSchema）；Modify `apps/server/src/http/routes.ts`（+5 端点）；Create `apps/server/test/http/characters.test.ts`(+3)。

**接口（钉死）：**
- `PUT /api/books/:bookId/meta` body {title?, description?, outline?} → 200 BookDto（含 chapters? 否——仅 book 字段）| 404；title 给出时 min(1)。
- `GET /api/books/:bookId/characters` → 200 CharacterDto[]。
- `POST /api/books/:bookId/characters` body {name, baseSetting?} → 201 CharacterDto | 409 {error:'人物卡重名'}（先 getCharacterByName 探测）| 404。
- `PUT /api/books/:bookId/characters/:characterId` → 200 | 404。
- `DELETE /api/books/:bookId/characters/:characterId` → 200 {ok:true} | 404。
- booksRepo 补 `getCharacterByName(db, bookId, name)`（POST 409 探测用）。

**步骤：**
- [ ] 先红 characters.test.ts +3：`'人物卡 CRUD：POST→GET→PUT→DELETE 往返，重名 POST → 409'`；`'PUT meta：description/outline 持久化且 GET /api/books/:id 回读 outline'`；`'meta/characters：不存在 bookId → 404；空 name → 400'`。→ 红。
- [ ] schemas + routes 实现 → 绿（3 passed）；`pnpm vitest run test/http` 全绿。
- [ ] commit：`feat(server): 书籍设定 meta 编辑与人物卡 CRUD 端点`。

## 任务 W-3：outline-suggest 槽扩展（characters + outline 注入）

**文件：** Modify `apps/server/src/http/routes.ts`（outline-suggest 槽序）；Modify `apps/server/test/http/outline.test.ts`(+1)。

**接口（钉死）：** 槽序 = hardRules(stable) / worldview(book.description) / characters(renderCharacterCards(listCharacters(db,bookId))) / outline(book.outline) / task(renderOutlineTask)；characters/outline 槽内容为空串时不插槽（ assembleContext 空槽自动过滤，直接不构造即可）；预算 = budgets.outline.characters / .outline。

**步骤：**
- [ ] 先红 outline.test.ts +1：`'outline-suggest：人物卡与大纲文本注入 planner 上下文'`（plannerProvider 用自写 stub LlmProvider 捕获 req.user，断言含卡名与大纲片段，返回合法两块 OUTLINE_TEXT）。→ 红。
- [ ] 槽序实现 → 绿（4 passed）；`pnpm vitest run test/http` 全绿。
- [ ] commit：`feat(server): outline-suggest 注入人物卡与剧情大纲槽`。

## 任务 W-4：web（新书向导 step1 扩展 + 书详情三分区）

**文件：** Modify `apps/web/src/api/client.ts`（+putBookMeta/listCharacters/createCharacter/updateCharacter/deleteCharacter）；Modify `apps/web/src/pages/NewBookIdeaPage.tsx`(+test +1)；Modify `apps/web/src/pages/BookDetailPage.tsx`(+test +1)。

**接口/流程（钉死）：**
- 向导 step1 在世界观 textarea 下新增：剧情大纲 textarea（placeholder `全书剧情大纲（可选）：分卷 / 关键转折 / 结局走向`）；人物卡动态行（姓名 input + 设定 textarea，`添加人物` 按钮，行尾 `移除`）；start() → createBook({title, description, outline: outlineVal || undefined, characters: 非空名行 map({name, baseSetting: 设定文本 ? JSON.stringify({设定}) : '{}'})})。
- 书详情新增三分区（风格档案之上）：`世界观` textarea(rows=6) + `剧情大纲` textarea(rows=6) + 单个 `保存设定` 按钮 → putBookMeta(bookId, {description, outline})；`人物卡` 列表（useQuery ['characters']，每卡名字+设定预览 + `编辑`/`删除`）+ 添加行（姓名+设定 → createCharacter，baseSetting 同向导包裹约定）；编辑态用 PUT 提交。
- client 新方法：`putBookMeta(bookId, body)` → `req<BookDto>(PUT /api/books/${bookId}/meta)`；`listCharacters(bookId)`；`createCharacter(bookId, body)`；`updateCharacter(bookId, characterId, body)`；`deleteCharacter(bookId, characterId)`。

**步骤：**
- [ ] 先红 NewBookIdeaPage.test +1：`'新书向导：人物卡与大纲随建书提交'`（stub fetch 捕获 POST /api/books body：characters[0].name==='张三' 且 outline 含片段）。→ 红。
- [ ] 先红 BookDetailPage.test +1：`'书详情：保存设定调用 PUT meta 且人物卡增删可见'`（stub PUT meta → 断言调用体含 description/outline；POST characters → 列表出现新卡）。→ 红。
- [ ] 实现 → 绿（web 22 passed）；`pnpm -w typecheck` 绿。
- [ ] commit：`feat(web): 新书向导人物卡/大纲录入与书详情设定三分区`。

## 任务 W-5：GUI 黑盒目验 + 收口验证链

- [ ] 8789 mock 隔离实例（临时 data 目录 + INKFORGE_CONFIG_FILE=tmp）：走通向导 step1（填书名/世界观/大纲/两张人物卡 → 建书，mock outline 502 显性暴露截图 + 兜底文案）→ 书详情三新区块渲染与回编保存 → 人物卡增/改/删 → GET API 复核 outline/characters 落库。结论与截图存 `docs/baseline/gui-verification-0.2-wco.md`。
- [ ] `pnpm -w lint && pnpm -w typecheck && pnpm -w test` → 全绿 211（server 187 / web 22 / shared 2）。
- [ ] `pnpm build:web` → 成功。
- [ ] commit：`test(web): 世界观/人物卡/大纲黑盒目验与收口验证链`。

## 任务 W-6：桌面安装包构建（只构建，不安装）

- [ ] `INKFORGE_STAMP_NSI=1` 下跑 desktop 构建脚本（tauri build → NSIS）；产物副本 + SHA256 落 `data/artifacts/`，构建与校验记录附于收口文档。
- [ ] **不执行任何安装器、不卸芽**（incident-0.2-t14-arp-hijack 待决项 + 装机态动作 owner 未答复，AskUserQuestion 已呈报无回应）。

## 任务 W-7：收口

- [ ] decision-log 登记 DEC-2026-1114-03（方案定案）与 DEC-2026-1114-04（装机三问待决记录）。
- [ ] code-review（diff ≥3 文件）→ 处置反馈 → 最终 commit：`docs: 世界观/人物卡/大纲功能扩展收口`。

## 账本（基线 200 → 211）

```
server 178 ─W-1 +5→ 183 ─W-2 +3→ 186 ─W-3 +1→ 187；web 20 ─W-4 +2→ 22；shared 2 不变；全量 211
```

## 自审五查

1. **规格覆盖**：世界观回编（W-2 meta 端点 + W-4 书详情分区）、人物卡（W-1 基座 + W-2 CRUD + W-3 注入 + W-4 录入/管理）、剧情大纲（W-1 migration + W-2 meta + W-3 注入 + W-4 录入/回编）；「等功能」候选（伏笔手动 CRUD）明确不在本轮，登记待议。
2. **步骤唯一可核**：每测试步带测试名与断言对象；每实现步带文件与签名；每验证步带命令与期望数。
3. **签名一致**：CharacterDto 三字段与 listCharacters 返回同形；BookMetaPutBody 与 bookMetaPutSchema 同形；renderCharacterCards 在 W-1（chapter.ts）与 W-3（routes.ts）调用同签名；budgets.outline.characters/outline 键名与 config.ts 定义一致。
4. **输入类**：空人物卡列表（renderCharacterCards ''→不插槽）、空大纲（outline 槽不插）、重名 409、8k 档 characters 预算 0 截空、非法 JSON baseSetting 原文渲染——均已挂测试。
5. **比例**：5 任务覆盖 2 SQL/TS 层 + 2 HTTP 层 + 2 web 页面 + 1 打包；测试净 +11 对新增 5 端点 1 迁移 1 渲染 1 槽位，健康。

## 修订记录（实施期，2026-11-14）

1. **owner 四答落地（DEC-2026-1114-04）**：桌面版=两个旧安装全卸、只装一新的，安装名改英文 **inkforge**；版本升 **0.2.0**（覆盖版本冻结口径）；登录模块**暂不做**。W-6 相应改写为「升版+改名+卸两装一」。
2. **W-1 测试落点微调**：draftSlots characters 槽测试落 assembler.test.ts（槽序钉值测试所在，契约一致性更强），contract.test.ts 只承担 renderCharacterCards 两例——计数不变（+3 分摊 2+1）。
3. **migrate.test 旧库模拟修正**：原「回拨 user_version=2 重迁」对 ADD COLUMN 不成立（SQLite 无 ADD COLUMN IF NOT EXISTS，重跑必炸 duplicate column）——改为先 `ALTER TABLE books DROP COLUMN outline` 真实还原 v2 schema 再回拨重迁，快照改显式列清单（0004 加列后 SELECT * 形状漂移）。
