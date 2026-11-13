# 卡 0.2-T07：入口 A server 二——planner 蓝图生成端点（server 163→167）

## 根因/背景
0.2 计划 v2（docs/plans/2026-11-13-inkforge-0.2-draft.md，任务 0.2-T07）。入口 A 第二段：按角色 planner 生成章蓝图（GOAL/BEATS/HOOK 行协议），502 显性兜底，无静默 fallback。

## 改动文件
- Modify `apps/server/src/prompts/render.ts`（+renderBlueprintTask）、`apps/server/src/llm/plainproto.ts`（+parseBlueprint 只增）、`apps/server/src/quality/l1.ts`（repairPrompt 补 export）、`apps/server/src/config.ts`（budgets.planner）、`apps/server/src/app.ts`（BuildAppOptions 增可选 plannerProvider 注入缝）、`apps/server/src/http/routes.ts`（+端点）、`packages/shared/src/api.ts`（+BlueprintSuggestBody）
- Modify `apps/server/test/config.test.ts`（+1）、`apps/server/test/prompts/contract.test.ts`（+2）、`apps/server/test/http/import.test.ts`（+1）

## 改法（钉死）
```ts
// config.ts：planner: { hardRules: 300, continuity: 1500, prevTail: 1500, task: 300 }
// app.ts：BuildAppOptions 增 plannerProvider?: LlmProvider → RouteState.plannerProvider 透传（测试注 mock）
// render.ts
export function renderBlueprintTask(args: { chapterNo: number; bookTitle: string; bookDescription: string; prevTail: string; continuityText: string }): string;
// 输出钉死含：任务说明行（为第 ${chapterNo} 章拟蓝图）、上一章末尾摘录、连续性摘要、
// 【输出格式】（GOAL: 一句话本章目标 / BEATS: 每行一条 2-4 节拍 / HOOK: 结尾钩子一句）与负约束行
//（'不要输出 JSON、markdown 代码块或任何解释；不要复述前文情节；每行前缀必须为 GOAL:/BEATS 条目/HOOK: 之一'）
// plainproto.ts
export function parseBlueprint(raw: string): { blueprint: ChapterBlueprint; errors: string[] };
// GOAL 缺/空 → errors+1；BEATS '- ' 行 → beats（0 条 → errors+1，上限 6 条超出截断+error）；HOOK 缺 → errors+1、有则并入 beats 末；
// mustHaveBeats 恒 []、bannedTopics 恒 []；容忍 CRLF/多余空行
// routes.ts
// POST /api/books/:bookId/blueprint-suggest {chapterNo} → 200 {blueprint, source:'llm'} | 502 {error:'blueprint parse failed', errors}
```
行为：provider = `state.plannerProvider ?? createRoleProvider(config,'planner')`；槽 hardRules/continuity/prevTail/task（stable 在前，总预算照 chapter.ts:108 同式）；温度 0.3、timeoutMs 钉 180000、meta.step 恒 `'summarize'`（不扩 StepName）；errors>0 → `repairPrompt`（l1.ts 导出）重试一次 → 仍败 502 显性暴露。

## 先红后绿
1. contract.test.ts +2：`'parseBlueprint：合格文样往返'`（GOAL+2 beats+HOOK → beats 3 条/errors 空）；`'parseBlueprint：缺 GOAL → errors 含该行且 beats 仍收'` → 红（现 6，目标 8 passed）。
2. config.test.ts +1（budgets.planner 深等钉值）→ 红（现 6，目标 7 passed）。
3. 实现 parseBlueprint/renderBlueprintTask/config 档/l1 export/注入缝 → 上两命令绿。
4. 端点先红：import.test.ts +1 `'blueprint-suggest：注入 mock → 200 且蓝图落库可读'`（buildApp 传 plannerProvider=createMockProvider({summarize:{text:'GOAL: 试炼第六层的入口\nBEATS:\n- 发现入口\n- 首次交锋\nHOOK: 入口在身后关闭'}})；POST → source==='llm'；PUT 落库 → GET blueprint.goal 相等）→ 红 → 实现 → 绿（import.test 3 passed）。
5. 真模型冒烟**本卡跳过**（与 T05 同窗口，主审后置安排），commit 正文注明「真模型冒烟后置」。

## 验收命令（以下命令均在项目根目录执行）
```bash
pnpm --filter @inkforge/server exec vitest run test/prompts/contract.test.ts test/config.test.ts test/http/import.test.ts   # 8+7+3 passed
pnpm --filter @inkforge/server exec tsc --noEmit                                                                            # 0 错
```

## 约束
- 只 commit 不 push：`feat(server): planner 蓝图生成端点（注入缝 + 行协议 + repairPrompt 导出）`，正文 verify:+Refs: DEC-2026-1113-05。
- parseBlueprint 只增不改既有解析；禁改 gate.ts/nsi/物证目录/生产库；禁重启服务。
- 用例数只增不减；超范围即停报。
