# 卡 0.2-T11：GUI 一——新建小说（续写）入口流三步向导（web 11→12）

## 根因/背景
0.2 计划 v2（docs/plans/2026-11-13-inkforge-0.2-draft.md，任务 0.2-T11）。入口 A 的 server 侧（T06 导入 / T07 蓝图建议 / T08 continue 模式 / T10 可选摘要）已全绿；本卡补 GUI 三步向导把四端点串成用户流程。

## 改动文件
- Create `apps/web/src/pages/NewBookPage.tsx`、`apps/web/src/pages/NewBookPage.test.tsx`
- Modify `apps/web/src/main.tsx`（+`/new` 路由）、`apps/web/src/App.tsx`（header「新建小说」链接）、`apps/web/src/api/client.ts`（+importOriginal/suggestBlueprint/createRun，类型化禁 any）、`apps/web/vite.config.ts`（proxy target 经 `process.env.INKFORGE_API_TARGET` 可覆盖，默认 8787 不变）

## 改法（钉死）
三步向导单页（`/new`）：
1. 书名+简介 → createBook；
2. 原文导入：textarea/文件读取 + 客户端拆章预览（正则 `/^第[0-9一二三四五六七八九十百零两]+[章节回][^。\n]*$/m`；零命中整篇单章；章题可删改）→ importOriginal；
3. 续写发起：显示「下一章 N」+「补摘要（可选，逐章）」入口（T10 端点 summarizeChapter 已在 client）→ suggestBlueprint 填充可编辑 JSON（502 行内提示转手填）→ putBlueprint → createRun({mode:'continue', fromChapter:N, toChapter:N}) → 跳 `/runs/:runId`；错误全部行内展示。

## 先红后绿
- client 方法就位 → `vitest run src/api/client.test.ts` 绿（既有零回归）。
- NewBookPage.test.tsx +1（`'拆章预览：粘贴 3 章渲染 3 条且可删一条'`）→ 红；实现 → 绿，web 12 passed。

## 验收命令（以下命令均在项目根目录执行）
```bash
pnpm --filter @inkforge/web exec vitest run        # web 12 passed（11+1）
pnpm --filter @inkforge/web exec tsc --noEmit      # 0 错
pnpm -w typecheck && pnpm -w lint                  # 全过
```

## 约束
- 只 commit 不 push：`feat(web): 新建小说续写入口流（8789 隔离环境）`，正文 verify:+Refs: DEC-2026-1113-05；GUI 黑盒由主审验收期亲执（8789+临时数据目录），通过后主审补「GUI 已验证」记录，执行者不得自行声明。
- 禁触生产库 `apps/server/data/inkforge.db`、8787 在跑服务、`data/artifacts/`；GUI 黑盒一律 `INKFORGE_PORT=8789` + `INKFORGE_DATA_DIR=data/gui-verify-t11`。
- 用例数只增不减（web 11→12）；禁 `git add -A`；超范围即停报。
