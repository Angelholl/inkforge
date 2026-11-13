# 卡 0.2-T02b：生产库实迁（浮动卡，无测试增量）

## 根因/背景
0.2 计划 v2（docs/plans/2026-11-13-inkforge-0.2-draft.md，任务 0.2-T02b）。T02a 的 0003 迁移已合入，须对生产库 data/inkforge.db 实迁。当前 runs 表无 queued/running 行，窗口已开。

## 改动文件
- Create `apps/server/scripts/migrate-prod.mjs`
- 生产库 `apps/server/data/inkforge.db`（经脚本执行迁移，不进 git）

## 改法（钉死）
`node --import tsx scripts/migrate-prod.mjs`（cwd=apps/server）：
1. 查 `SELECT COUNT(*) FROM runs WHERE status IN ('queued','running')` → >0 则 stderr 打印 running runId 列表并 **exit 2（不触库）**
2. 先 `VACUUM INTO` 副本（带 PID 临时名）跑 migrate 校验（user_version=3 + books/chapters/chapter_versions/run_steps 四计数相等，失败 exit 3 并删副本）
3. 对 `data/inkforge.db` 实迁 → 打印 `uv=3` 与两索引名
4. 一次性独立进程，禁重启长驻 service/worker（WAL + busy_timeout=5000 兜底，锁冲突重试一次）

## 先红后绿
迁移类卡无新用例（T02a 已覆盖逻辑）；以副本预演门（步骤②）替代红验证——副本校验不过即退出不动生产库。

## 验收命令（以下命令均在项目根目录执行）
```bash
cd apps/server && node --import tsx scripts/migrate-prod.mjs          # 输出 uv=3
node --import tsx -e "import('./src/db/migrate.ts').then(()=>{})" # 不适用则跳过
node -e "const db=require('better-sqlite3')('data/inkforge.db',{readonly:true});console.log(db.pragma('user_version',{simple:true}), db.prepare(\"select name from sqlite_master where type='index' and name in ('idx_chapter_versions_chapter','idx_runs_book_created')\").all().map(r=>r.name).join(','))"
# 期望：3 idx_chapter_versions_chapter,idx_runs_book_created
cd apps/server && pnpm exec vitest run test/db   # 16 全绿（迁移后测试仍绿）
```

## 约束
- 只 commit 不 push（仅脚本文件；库文件不进 git）：`feat(server): 生产库实迁脚本 migrate-prod（running 门+副本预演）`，正文 verify:+Refs: DEC-2026-1113-05。
- 生产库只经本脚本迁移一次；禁重启 server/worker；执行前后 health 探活（http://127.0.0.1:8787/api/health）应均 ok。
- 超范围（改 migrate 机制/其它迁移）即停报。
