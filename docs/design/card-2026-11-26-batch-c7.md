# 卡 C7 | T7 精炼引擎双路径（单次+map-reduce，D4 owner 改判版）（2026-11-26 批，hy4）
① 任务：照 `docs/plans/2026-11-26-summary-confirm-refine-budget.md`「任务 T7」节逐字执行；读 >4KB 文件用 pointer tools。依赖 C0/C1（StepName='refine'、timeouts.refine=180000）。
② 写集（越界即停报）：Create `apps/server/src/refine.ts`、`apps/server/src/prompts/render.ts`（+renderRefineTask/renderRefineReduceTask）、`apps/server/test/refine.test.ts`（+10）、`apps/server/test/prompts/contract.test.ts`（+1）。
③ 先红后绿与验收：按任务步骤顺序跑命令；钉死值全表照计划节（触发 OR 条件、段尺寸 ≤10666 字/≤16000 token、40475→4 map+1 reduce、per-call timeout、整体失败不回填）；exec.v1 契约照计划节；基线只增不减。
④ 约束：只 commit 不 push；Conventional 前缀+中文正文含 verify: 行 + Refs: DEC-2026-1126-10（C7）；卡内禁顺手改。
