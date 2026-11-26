# 卡 C6 | T6 web 页面接线 loading/取消/单在途（2026-11-26 批，hy4）
① 任务：照 `docs/plans/2026-11-26-summary-confirm-refine-budget.md`「任务 T6」节逐字执行；读 >4KB 文件用 pointer tools。依赖 C4/C5（与 C5 无文件交集可并行段=测试桩先行）；既有 BookDetailPage.test.tsx:185 按钮回归逐字保留。
② 写集（越界即停报）：`apps/web/src/pages/BookDetailPage.tsx`、`apps/web/src/pages/BookDetailPage.test.tsx`（+3）。
③ 先红后绿与验收：按任务步骤顺序跑命令；延迟 mock（generate ≥3s）走通在途态是卡内硬步骤；exec.v1 契约照计划节；基线只增不减。GUI 黑盒主审批次收口做，提交信息注明 GUI 状态。
④ 约束：只 commit 不 push；Conventional 前缀+中文正文含 verify: 行 + Refs: DEC-2026-1126-10（C6）；卡内禁顺手改。
