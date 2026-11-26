# 卡 C2 | T2 summarize 拆分 + D2 伏笔复活（2026-11-26 批，hy4）
① 任务：照 `docs/plans/2026-11-26-summary-confirm-refine-budget.md`「任务 T2」节逐字执行；读 >4KB 文件用 pointer tools。依赖 C0/C1；D2 先钉现状测试再改断言（卡面红线）。
② 写集（越界即停报）：`apps/server/src/pipeline/summarize.ts`、`apps/server/test/pipeline/summarize.test.ts`、Create `apps/server/test/pipeline/summarize-commit.test.ts`；`test/llm/plainproto.test.ts` 仅跑不改。
③ 先红后绿与验收：按任务步骤顺序跑命令；既有两例+plainproto 一例零改动跑绿；exec.v1 契约照计划节；基线只增不减。
④ 约束：只 commit 不 push；Conventional 前缀+中文正文含 verify: 行 + Refs: DEC-2026-1126-10（C2）；卡内禁顺手改。
