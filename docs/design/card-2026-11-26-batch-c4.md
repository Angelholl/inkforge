# 卡 C4 | T4 web API 客户端（2026-11-26 批，hy4）
① 任务：照 `docs/plans/2026-11-26-summary-confirm-refine-budget.md`「任务 T4」节逐字执行；读 >4KB 文件用 pointer tools。依赖 C0（DTO）；client.ts 独占改动者，C5/C7/C9 只消费不修改。
② 写集（越界即停报）：`apps/web/src/api/client.ts`。
③ 先红后绿与验收：按任务步骤顺序跑命令（typecheck 零错+grep 零命中=绿）；exec.v1 契约照计划节；基线只增不减。
④ 约束：只 commit 不 push；Conventional 前缀+中文正文含 verify: 行 + Refs: DEC-2026-1126-10（C4）；卡内禁顺手改。
