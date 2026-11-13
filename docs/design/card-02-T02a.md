# 卡 0.2-T02a：迁移 0003 编写 + tmp 库测试（server 157→158）

## 根因/背景
0.2 计划 v2（docs/plans/2026-11-13-inkforge-0.2-draft.md，任务 0.2-T02a）钉定的热查询索引迁移。仅 tmp 库测试，不触生产库 data/inkforge.db。

## 改动文件
- Create `apps/server/src/db/migrations/0003_indices.sql`
- Modify `apps/server/test/db/migrate.test.ts`（+1 用例）

## 改法
0003 文件内容钉死（M7 终稿，恰两条索引+头注释）：
```sql
-- 回滚：DROP INDEX IF EXISTS idx_chapter_versions_chapter; DROP INDEX IF EXISTS idx_runs_book_created;（user_version 不回退，旧代码零影响）
-- 不建 run_steps/chapters 索引：UNIQUE(run_id,chapter_id,step,attempt) 与 UNIQUE(book_id,chapter_no) 已有隐式索引
CREATE INDEX IF NOT EXISTS idx_chapter_versions_chapter ON chapter_versions(chapter_id, created_at);
CREATE INDEX IF NOT EXISTS idx_runs_book_created ON runs(book_id, created_at);
```
测试用例钉死：`'0003 索引：user_version=3 且两索引在场；user_version=2 旧库升级数据 intact'`——tmp 建库跑 migrate → user_version===3 且两索引名在 sqlite_master；手置 `PRAGMA user_version=2` 种子库（四表各 1 行）再 migrate → user_version===3 且四行逐列相等。

先红后绿：先写测试跑红 → 实现 0003 跑绿 → `vitest run test/db` 全绿。

## 验收命令（以下命令均在项目根目录执行）
```bash
cd apps/server && pnpm exec vitest run test/db/migrate.test.ts   # 2 passed（现 1+新 1）
cd apps/server && pnpm exec vitest run test/db                   # 全绿
```

## 约束
- 只 commit 不 push：`feat(server): 迁移 0003 双索引（含冗余索引删除理由与回滚注释）`，正文 verify:+Refs: DEC-2026-1113-05。
- 挂机 run 进行中：禁触 data/inkforge.db（读写皆禁）、禁重启 server/worker；测试一律 tmp 库。
- 超范围（改动 migrate 机制/其它迁移文件）即停报。
