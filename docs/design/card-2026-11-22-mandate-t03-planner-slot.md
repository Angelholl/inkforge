# 卡：落地策略 T03 层②——planner 协议【LANDING】行（校验→重试 1 次→降级不 500）

以下命令均在项目根目录执行（相对路径）。

> 派卡前置：T02 已验收合入。非禁入卡型（routes 该端点局部校验扩展，非核心路由重构），走 hy4。执行中读 >4KB 文件用 pointer 工具，禁整读。

## 根因/目标

DEC-2026-1122-01 层②：blueprint-suggest 的 planner 输出协议加 LANDING 行（协议区必出），服务端 parseLandingCell 校验；不合格拒收重出一次、再不合格丢弃+warning 不 500；合格则与卡叠加并集、卡优先。**主审裁决（钉，不得回改）**：`expectsLanding = cardLanding === null || cardLanding.keywords.length === 0`——仅当该章**无确定性落地**时才要求模型出格（卡有书零扰动零额外重试；mandate 不参与判定，mandateOn 变量不引入）。计划真值=docs/plans/2026-11-22-landing-mandate.md **Task-03**（步骤 1-6 全钉值照序执行，冲击清单 #6/#10 已按主审裁决修订）。

## 改动文件（卡外改动即超范围）

- Modify：`apps/server/src/llm/plainproto.ts`（ParsedBlueprint 加 `landingRaw/landingErrors`，parseBlueprint 仿 HOOK 分支加 LANDING 分支：首条捕获、多余行进 landingErrors、缺行不进 errors）、`apps/server/src/prompts/render.ts`（renderBlueprintTask 协议区加 `LANDING: 本章落地格，形态为 H（场景）或 L（场景），场景写具体人物事件` 行+负约束行改写，预算 800 不动）、`apps/server/src/http/routes.ts`（:458-473 邻域：landingOk 判定/重试条件扩展/降级 warning/并集叠加卡优先/响应 warnings 键）
- Test Modify：`test/llm/plainproto.test.ts`、`test/http/blueprint-suggest.test.ts` 追加

## 先红后绿

新用例先写先红：LANDING 捕获/双行/缺行三例 + describe「planner LANDING 落地格槽」四例（合规并集卡优先、text 全等去重、不合格重试恰 1 降级 200、无卡章有期望/卡章 plannerCalls 恰 1 无 warnings 键）；实现转绿。既有三例（:54/:64/:72）断言一字不动。

## 验收命令

```bash
pnpm -F @inkforge/server exec vitest run test/llm/plainproto.test.ts test/http/blueprint-suggest.test.ts
pnpm lint
```

全绿判据：新用例全绿；既有 blueprint-suggest 三例原样绿（冲击 #6：卡章不重试故 plannerCalls/toEqual 原样；:64 无卡章重试后末次调用断言与 toEqual([]) 不变）；contract 预算断言（:86/:96 parseBlueprint 往返两例）原样绿（冲击 #10）；lint 零输出。

## 约束

- 重试上限恒 1 次（沿 :460-464 单次结构，不加循环）；终态不合格**绝不 500**，走 warnings 降级。
- 模型合格条目不写 source（与卡条目同旧语义）；卡条目排前（卡优先）。
- 1301 纪律：禁读 landing-words 词表原文与 data/**；测试 mock 输出用「H（撞见场：房东×阿美）」类场景文案即可（该文案已在既有测试中，安全）。
- 只 commit 不 push；`feat(server):` 前缀+中文，正文 verify: + `Refs: DEC-2026-1122-01`；永不 --no-verify；永不 git add -A，逐文件 add（含本卡面）。
- 现场冲突即停待裁决。
