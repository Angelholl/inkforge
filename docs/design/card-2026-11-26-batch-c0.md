# 卡 C0 | T0 共享契约基座（2026-11-26 批，hy4）
① 任务：照 `docs/plans/2026-11-26-summary-confirm-refine-budget.md`「任务 T0」节逐字执行；读 >4KB 文件用 pointer tools。本卡先行，无并行同伴（C1/C4 均消费本卡产出）。
② 写集（越界即停报）：`packages/shared/src/api.ts`、`packages/shared/src/domain.ts`。
③ 先红后绿与验收：按任务步骤顺序跑命令（typecheck 零错=绿）；exec.v1 契约照计划「exec.v1 契约」节；基线开卡前实测只增不减。
④ 约束：只 commit 不 push；Conventional 前缀+中文正文含 verify: 行 + Refs: DEC-2026-1126-10（C0）；卡内禁顺手改。
