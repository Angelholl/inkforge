# 卡 C8 | T8 精炼端点（串行于 C3）（2026-11-26 批，hy4）
① 任务：照 `docs/plans/2026-11-26-summary-confirm-refine-budget.md`「任务 T8」节逐字执行；读 >4KB 文件用 pointer tools。**严格串行：必须在 C3 合入后开工**（routes.ts 冲突对象=C3，计划拆卡表已标）；依赖 C7。
② 写集（越界即停报）：`apps/server/src/http/routes.ts`、`apps/server/src/app.ts`、`apps/server/test/http/settings-import.test.ts`（+5）。
③ 先红后绿与验收：按任务步骤顺序跑命令；端点外部契约=200 {description,truncated}/502+errors 不得漂移；既有 preview/apply 用例零改动跑绿；exec.v1 契约照计划节；基线只增不减。
④ 约束：只 commit 不 push；Conventional 前缀+中文正文含 verify: 行 + Refs: DEC-2026-1126-10（C8）；卡内禁顺手改。
