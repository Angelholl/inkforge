# 卡 SM-02（并卡）：迁移 0010 + 仓储绑定 CRUD + shared 类型（计划 Task-02+03+04）

## 背景/根因
DEC-2026-1117-04 裁决② 数据层整体。原 SM-02/SM-03 两卡合并为一次提交——critic [HIGH_RISK_OBJECTION] 采纳：服务启动无条件 migrate（app.ts:34、worker/main.ts:15），0010 落盘即会被下一次启动应用到生产库；若迁移与 deleteBook 清理行分两次提交，中间窗口删已绑书触发 FK RESTRICT 500。合并后窗口消失。books.style_profile_id 保留为主风格镜像（D4）。

## 派发前置（主审完成，执行者先核验）
backups/ 内存在本轮生产库快照文件 `inkforge-pre0010-*.db`（主审 VACUUM INTO 产物，派发前完成）。缺失即停上报，不得自行代做。

## 改动文件（只允许动这 7 个）
- Create apps/server/src/db/migrations/0010_book_style_profiles.sql
- Modify apps/server/test/db/migrate.test.ts、apps/server/test/db/open.test.ts、apps/server/scripts/migrate-prod.mjs
- Modify apps/server/src/db/repositories/books.ts、apps/server/test/db/repositories.test.ts
- Modify packages/shared/src/api.ts

## 改法
执行真值=docs/plans/2026-11-17-style-mixing-and-wizard-slim.md §Task-02、§Task-03、§Task-04（搜「### Task-02/03/04」定位分段读；迁移 SQL 全文已在计划钉死逐字照抄——含 ux_book_style_profiles_primary 部分唯一索引与 INSERT OR IGNORE 幂等回填；三函数精确签名见 §Task-03 Interfaces）。要点序：
1. 测试先行：migrate.test 4 处 toBe(9)→10+注释改+两回滚块补 DROP+新增 0010 回填用例；open.test 3 处 toBe(9)→10+清单追加；migrate-prod.mjs 两处 `uv !== 3`→10；repositories.test 尾部新 describe 2 用例 → 跑定向确认红。
2. 建 0010 SQL（逐字）。
3. books.ts：setBookStyleBinding（事务内 ts 单值、主行先行辅按绑定序、dims_json 逐行同值全量映射）/getBookStyleBinding（`ORDER BY is_primary DESC, rowid ASC`）/listBooksBoundToProfile（主镜像 UNION 关联表）三函数；setBookStyleProfile 签名保留 docblock 改注遗留；deleteBook 在 foreshadowings 与 books 删除行之间插关联表清理。
4. shared api.ts：StyleBindBody 四可选字段（legacy 注释）+StyleBindingDto+BookDto.styleBinding。

## 先红后绿回归
第 1 步全部测试改造先行确认红 → 第 2-4 步实现 → 定向全绿。

## 验收命令（均在项目根目录执行）
1. `pnpm --filter @inkforge/server exec vitest run test/db` → 全绿（本包增量 +3：migrate 新用例 1+repositories 新用例 2）
2. 销号复核：`grep -rn "user_version" apps/server/src apps/server/test apps/server/scripts` → 除 migrate.ts 动态读写与造旧库 `= 2`/`= 4` 外无残留最新硬编码
3. `pnpm typecheck` exit 0；`pnpm lint` 零输出
4. `pnpm -r --if-present run test` → server 275（272+3）；web ≥85（SM-01 已入库则 86）；shared 2；合计 ≥362——**逐包增量口径核对，绝对数与卡面不符先核对口径、不得改测试凑数**
5. `pnpm --filter @inkforge/web build` → exit 0
6. `pnpm audit --prod` → 零新增

## 约束
- 卡面自足；cwd 即项目根。只动上列 7 文件；卡外问题即停上报待裁决。
- 生产库口径：执行者不得主动读写 apps/server/data/ 与 backups/（快照由主审产出，只读核验存在性即可）；服务/worker 若在窗口内启动将自动补跑 0010，**属预期行为不算违规**。
- 验证链任一环失败即停，不得带病提交；回滚点=revert 本卡单提交（生产库兜底=主审 pre0010 快照）。
- 只 commit 不 push；永不 --no-verify；永不 git add -A（只 add 上列 7 路径）。
- 提交信息 Conventional 前缀+中文，正文：`verify: <命令 1-6 实际结果摘要>`、`GUI 未验证（纯数据层）`、`Refs: DEC-2026-1117-04`。
- 返回报告：commit SHA + 各命令实际输出摘要 + 偏差说明。
