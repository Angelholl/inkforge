# 卡 C1 | T1 服务端配置与校验基座（2026-11-26 批，hy4）
① 任务：照 `docs/plans/2026-11-26-summary-confirm-refine-budget.md`「任务 T1」节逐字执行；读 >4KB 文件用 pointer tools。依赖 C0（StepName='refine'）。config.ts 独占改动者，C 侧仅 64K 参考值注释一行。
② 写集（越界即停报）：`apps/server/src/config.ts`、`apps/server/src/http/schemas.ts`、`apps/server/test/config.test.ts`（+2）、**`apps/server/src/db/repositories/runs.ts`**（主审补划，见下）。
②b 计划缺口补令（DEC-2026-1126-10 C0 验收时定）：C0 已给 StepName 加 'refine'，`runs.ts:186 STEP_ORDER: Record<StepName, number>` 因此缺键编译红——本卡一并补 `refine: 5`（注释「非管线步，仅满足 Record 穷举，永不入 claim」），此即 C0 申报连锁红的收口处；本卡完成后全链 typecheck 必须转绿。
③ 先红后绿与验收：按任务步骤顺序跑命令；exec.v1 契约照计划节；基线只增不减。
④ 约束：只 commit 不 push；Conventional 前缀+中文正文含 verify: 行 + Refs: DEC-2026-1126-10（C1）；卡内禁顺手改。
