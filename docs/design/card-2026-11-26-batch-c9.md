# 卡 C9 | T9 web 精炼按钮 preview→apply 之间（2026-11-26 批，hy4）
① 任务：照 `docs/plans/2026-11-26-summary-confirm-refine-budget.md`「任务 T9」节逐字执行；读 >4KB 文件用 pointer tools。依赖 C4/C7（D4=单次+分块双路径，在途文案须覆盖分块耗时场景）。
② 写集（越界即停报）：`apps/web/src/components/SettingsImportPanel.tsx`、`apps/web/src/components/SettingsImportPanel.test.tsx`（+3）。
③ 先红后绿与验收：按任务步骤顺序跑命令；既有六例测试逐字保留跑绿；延迟 mock=分块 provider（40475 字+65536 窗、5 次调用各带延迟）是卡内硬步骤；exec.v1 契约照计划节；基线只增不减。GUI 黑盒主审批次收口做，提交信息注明 GUI 状态。
④ 约束：只 commit 不 push；Conventional 前缀+中文正文含 verify: 行 + Refs: DEC-2026-1126-10（C9）；卡内禁顺手改。
