# 卡 C3 | T3 路由两段式 generate/commit（2026-11-26 批，hy4）
① 任务：照 `docs/plans/2026-11-26-summary-confirm-refine-budget.md`「任务 T3」节逐字执行；读 >4KB 文件用 pointer tools。依赖 C1/C2；routes.ts 与 C8 共动——**C3 先、C8 后严格串行**（计划拆卡表原文写「与 C6 共动」系笔误，C6 不碰 routes.ts，冲突对象=C8）。
② 写集（越界即停报）：`apps/server/src/http/routes.ts`、`apps/server/test/http/import.test.ts`（两例随迁）、Create `apps/server/test/http/summarize-confirm.test.ts`。
③ 先红后绿与验收：按任务步骤顺序跑命令；exec.v1 契约照计划节；基线只增不减。POST /summarize 语义变更唯一消费者=client.ts（T4），同包发布无兼容期。
④ 约束：只 commit 不 push；Conventional 前缀+中文正文含 verify: 行 + Refs: DEC-2026-1126-10（C3）；卡内禁顺手改。
