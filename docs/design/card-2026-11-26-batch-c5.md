# 卡 C5 | T5 web 补摘要确认弹窗组件（2026-11-26 批，hy4）
① 任务：照 `docs/plans/2026-11-26-summary-confirm-refine-budget.md`「任务 T5」节逐字执行；读 >4KB 文件用 pointer tools。依赖 C0/C4；D1=B 加强版钉死（摘要可编辑、节拍只读折叠、伏笔/状态逐行勾选剔除+六类标注文案，禁自由文本）。
② 写集（越界即停报）：Create `apps/web/src/components/SummaryConfirmDialog.tsx`、Create `apps/web/src/components/SummaryConfirmDialog.test.tsx`。
③ 先红后绿与验收：按任务步骤顺序跑命令；exec.v1 契约照计划节；基线只增不减。GUI 黑盒由主审在批次收口用延迟 mock/真模型做，本卡提交信息注明「GUI 未验证（owner 真实测试）」。
④ 约束：只 commit 不 push；Conventional 前缀+中文正文含 verify: 行 + Refs: DEC-2026-1126-10（C5）；卡内禁顺手改。
