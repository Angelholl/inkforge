# 实现计划：阅读页返回入口 + 章节删除（owner 反馈，DEC-2026-1120-02）

- 日期：2026-11-20
- 计划/执行：主模型亲执（owner 会话令不外派）
- 决策真值：DEC-2026-1120-02（docs/decision-log.md）

## 1. 目标

①章节阅读页工具卡可一键返回书页（不必滚回页顶）；②章节可删除（删掉重调剧情，重存蓝图再生成）。

## 2. 已核实事实

| # | 事实 | 锚点 |
| --- | --- | --- |
| F1 | ChapterReaderPage 唯一返回入口=页顶 Link；工具卡按钮行（回滚/导出+提示）无导航项 | apps/web/src/pages/ChapterReaderPage.tsx:66-68,92-99 |
| F2 | 无章级删除；deleteBook 显式依赖序=canonical 先例（FK ON/RESTRICT） | apps/server/src/db/repositories/books.ts:293-311 |
| F3 | run_steps.chapter_id REFERENCES chapters(id)；partial_outputs→run_steps 须先行 | apps/server/src/db/migrations/0002_runs.sql |
| F4 | 报表 join chapters 容错（chapterNo ?? 0）+ versionDeleted 标记已存在 → runs 头保留可行 | apps/server/src/http/routes.ts:905-921 |
| F5 | chapter_summaries UNIQUE(book_id,chapter_no)；character_states UNIQUE(character_id,chapter_no) | 0001_core.sql |
| F6 | outline_nodes 与生成章无行级引用（剧情大纲树） | 0005_round4_scope.sql |
| F7 | 活动判定沿用 runs.status IN (queued/running/paused)；chapter_scope_json {from,to} | 0002_runs.sql；runs repo |
| F8 | 客户端 DELETE 需 body '{}'（Fastify 空体 400 先例）；三态确认门先例=阅读页版本删除 | apps/web/src/api/client.ts:161-163；ChapterReaderPage.tsx:119-142 |
| F9 | backupBookPredelete 先于事务（VACUUM INTO 不能在事务内） | apps/server/src/http/routes.ts:867-869 |

## 3. 全局约束

- 测试基线只增不减：现基线 456（server 338 + web 116 + shared 2）。
- 删除为破坏性操作：快照先行+确认门+409 活动拦截，文案沿版本删除先例。
- GUI 不做浏览器目验（owner 真实测试）。
- 提交 Conventional+中文，`Refs: DEC-2026-1120-02`；两反馈两提交（①feat(web) 返回；②feat(web,server) 删章）。

## 4. 任务

### Task 1：工具卡「返回书页」入口（①）

- [ ] ChapterReaderPage 工具按钮行行首加 `<Link to={`/books/${bookId}`}>` chip（形态复用「阅读」链接 class：inline-flex h-8 items-center rounded-ctl border border-line bg-surface px-3 text-xs text-ink hover:bg-bg），文案「返回书页」。
- [ ] ChapterReaderPage.test.tsx +1：工具卡含「返回书页」链接且 href 指向 /books/:bookId。
- [ ] 定向：`pnpm --filter @inkforge/web test -- ChapterReaderPage` 绿。

### Task 2：删除章节（②）

**文件：** Modify `apps/server/src/db/repositories/chapters.ts`（+deleteChapterWithCleanup）；Modify `apps/server/src/http/routes.ts`（+DELETE 路由）；Modify `apps/web/src/api/client.ts`（+deleteChapter）；Modify `apps/web/src/pages/BookDetailPage.tsx`（+确认门 UI）；Create `apps/server/test/http/chapters-delete.test.ts`；Modify `apps/web/src/pages/BookDetailPage.test.tsx`（+2 例）。

- [ ] repo：`deleteChapterWithCleanup(db, bookId, chapterNo): boolean`——章不存在 false；tx 内序：partial_outputs（run_step_id IN 本章 steps）→ run_steps（chapter_id）→ chapter_fts → chapter_versions → chapter_version_tombstones → chapter_summaries（book_id+chapter_no）→ character_states（chapter_no × book 人物）→ chapters（book_id+chapter_no）。
- [ ] route：`app.delete('/api/books/:bookId/chapters/:chapterNo')`——书/章 404；活动 run 覆盖（try parse scope，坏 JSON 保守视为覆盖）409 `{ error, reason: 'run-active', runId, runStatus }`；backupBookPredelete（F9）→ repo 清理 → `{ ok: true }`。
- [ ] client：`deleteChapter: (bookId, chapterNo) => req<{ok:boolean}>(同路径, { method:'DELETE', body:'{}' })`。
- [ ] UI：章节行「阅读」后加「删除」quiet·danger·sm；`confirmingDeleteChapter` 三态确认门（文案：删除将从磁盘永久移除该章全部版本、摘要与运行步，不可恢复（删前自动留 -predelete- 快照，同书保留最近 3 份）；可在「蓝图编辑」重存蓝图重生成）；确认→api.deleteChapter→invalidateQueries(['book',bookId])+setMsg；失败→apiErrorText。
- [ ] server 测试 chapters-delete.test.ts：①成功删（章/版本/fts/summaries/character_states/run_steps 全清、runs 头保留、返回 ok）②未知书 404 ③未知章 404 ④活动 run 覆盖 409 run-active ⑤快照落盘（backups 目录非空）。
- [ ] web 测试：①行「删除」→ 确认文案出现 → 「确认删除」→ deleteChapter 调用且行消失 ②「取消」回落不调用。
- [ ] 定向：`pnpm --filter @inkforge/server test -- chapters-delete` + `pnpm --filter @inkforge/web test -- BookDetailPage` 绿。

### Task 3：收口

- [ ] lint 零输出 + typecheck 全 workspace 0 错 + 全量 ≥461 + build:web 冒烟 + pnpm audit --prod。
- [ ] decision log 执行留痕补记；提交两枚；远程核对→push→ls-remote。

## 5. 自审五查

1. 规格覆盖：DEC 两要点 → Task1/Task2；一致性范围七表清理+runs 保留+快照+确认门全落 repo/route/UI 测试。
2. 步骤唯一：函数签名/路径/文案/状态名钉死。
3. 类型一致：deleteChapterWithCleanup/deleteChapter 命名前后一致；confirmingDeleteChapter 状态一致。
4. 隐含输入：未知书/章、活动 run、无 steps 章、坏 scope JSON——测试或代码分支覆盖。
5. 比例：契约+清单，无代码抄写。
