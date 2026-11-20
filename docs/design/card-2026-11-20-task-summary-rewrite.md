# 卡：rewrite 落地保全 + task 尾部摘要块（Task-03）

以下命令均在项目根目录执行（你 cwd 即仓库根）。

## 根因/目标

实测：风格/落地规则虽注入但被 13.5k 字世界观槽压场，模型执行衰减；rewrite 两轮只砍字数套话、可能把落地越改越素。本卡：①rewrite 指令加「必含节拍不得在修订中丢失」保全句；②draft/rewrite 的 task 槽尾部追加 recency 摘要块（【本章硬要求】+【文风铁则】前 3 条），把最该执行的规则放到 user 末尾；无声明书零污染；带 grade 条目显示统一分级文案 `（落地·${m.grade}级须显性词）`。

## 施工真值（先读这两个区，按钉值执行，不得偏离）

`docs/plans/2026-11-20-gen-landing-style-inject.md`：
- 全局约束：第 9–17 行
- Task-03 全文：从「## Task-03」标题行读到「## Task-04」标题行为止（offset/limit 分段读；3-1 文案钉死 / 3-2 renderDraft grade 分支 / 3-3 renderTaskSummaryBlock 全文 / 3-4 chapter.ts 接线四步 / 3-5 task 预算 500→800×2 / 3-6 测试 A-D / 3-7 验收 / 3-8 命令）

依赖 Task-02 已提交（config.ts/config.test.ts 串行）。grade 模板文案与 Task-01 的 grade 字段同源，逐字照计划。

## 改动文件

1. `apps/server/src/prompts/render.ts`：renderDraft 必含节拍行加 grade 分支；新增导出 `renderTaskSummaryBlock`（renderRewrite 之后）；首行 shared import 补 `type BeatRequirement`
2. `apps/server/src/pipeline/chapter.ts`：draft task 尾接块；`landingPreserve` 常量入 targeted/full 两分支；rewrite taskText 先存变量再传 buildRewriteSlots（两处同值）
3. `apps/server/src/config.ts`：BUDGETS_DRAFT/BUDGETS_REWRITE task 500→800
4. 测试：`test/pipeline/chapter.test.ts`（capturing 助手照抄 continue.test.ts + 三用例）、`test/pipeline/continue.test.ts`（一例）、`test/prompts/contract.test.ts`（grade 文案一例，既有用例保留）、`test/config.test.ts`（draft/rewrite 钉值）

## 验收命令（按序，任一环失败即停）

```bash
pnpm lint
pnpm --filter @inkforge/server typecheck
pnpm --filter @inkforge/server exec vitest run test/pipeline/chapter.test.ts test/pipeline/continue.test.ts test/prompts/contract.test.ts test/config.test.ts
pnpm --filter @inkforge/server test
```

全绿且测试基线只增不减。

## 约束

- 基线=派卡时 HEAD（开工记录哈希随回报）；只 commit 不 push；禁 `git add -A`（逐文件 add，含本卡面）；永不 `--no-verify`。
- 提交信息：`feat(server): 重写保全必含节拍并在任务尾部注入硬要求与文风铁则摘要`，正文 `verify: <实测结果>；Refs: DEC-2026-1120-10`；注明「GUI 未验证（owner 真实测试）」。
- 不动清单照计划全局约束 4；「无必含节拍且无档案 → task 与改前逐字节同形」是硬验收（零污染用例必过）。
- 现场与卡面冲突即停待裁决。预计工时 ≤40 分钟，超时先回报进度。
