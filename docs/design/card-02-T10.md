# 卡 0.2-T10：入口 A server 四——导入章可选摘要（server 171→173；web +1）

## 根因/背景
0.2 计划 v2（docs/plans/2026-11-13-inkforge-0.2-draft.md，任务 0.2-T10；owner 拍板新增，DEC-2026-1113-05 第 3 条）。导入章不自动跑模型，用户可对单个 original 章手动补摘要。

## 改动文件
- Modify `apps/server/src/http/routes.ts`（+端点）、`apps/web/src/api/client.ts`（+summarizeChapter）、`apps/web/src/pages/BookDetailPage.tsx`（original 章「补摘要」按钮）
- Modify `apps/server/test/http/import.test.ts`（+2）、`apps/web/src/pages/BookDetailPage.test.tsx`（+1）

## 改法（钉死）
`POST /api/books/:bookId/chapters/:chapterNo/summarize` → 200 `{ok:true}` | 404（章/版本缺失）| 409（该书存在 queued/running run——防模型调用与挂机并发）。行为 = `runSummarizeStep`（roleProvider('summarizer')）同步执行，写 chapter_summaries/character_states/foreshadowings（既有语义）。**仅用户显式触发，导入链路零自动模型调用。**

## 先红后绿
1. import.test.ts +2（先红）：`'可选摘要：注入 mock → 200 且 chapter_summaries +1 行'`（1 章 original → POST → 按 bookId 过滤恰 1 行）；`'无 current 版本 → 404；有 running run → 409'`。
2. 实现 → 绿；web：client 加 summarizeChapter，BookDetailPage original 章加按钮（点击后刷新）；BookDetailPage.test.tsx +1（按钮渲染与 client 调用断言）。

## 验收命令（以下命令均在项目根目录执行）
```bash
pnpm --filter @inkforge/server exec vitest run test/http/import.test.ts   # 5 passed（3+2）
pnpm --filter @inkforge/web exec vitest run                                # web 全量绿（11+1）
pnpm --filter @inkforge/server exec tsc --noEmit && pnpm --filter @inkforge/web exec tsc --noEmit   # 0 错
```

## 约束
- 只 commit 不 push：`feat(server): 导入章可选摘要端点与书籍详情入口（手动触发）`，正文 verify:+Refs: DEC-2026-1113-05，提交信息注明「GUI 已验证（按钮渲染 RTL 断言；8789 黑盒目验并入 T11/T12）」。
- GUI 变更按纪律 web-gui-tester 黑盒验证并入 T11/T12 的 8789 目验，本卡只做 RTL 断言。
- 禁触生产库/物证目录/nsi；禁重启服务；用例数只增不减；超范围即停报。
