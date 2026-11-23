# 卡 FG-05：web 门组件 + 5 个 run 发起点接入（2026-11-24）

## 一、根因/目标

融合门 MVP 第五卡：FusionGateDialog + startRunWithGate helper 挂全部 5 个生成/续写发起点；直通零打扰；confirm 200 才发 run；取消零写；降级横幅；「不再提示」。计划真值=`docs/plans/2026-11-24-gen-fusion-gate.md` **Task-05**（接口块+步骤 1–9）；规格=`docs/design/proposal-2026-11-23-import-reconcile.md` v3.1 §3.5。

## 二、改动文件（=计划 Task-05 文件清单，不得越界）

Modify `apps/web/src/api/client.ts`（三方法，:192 createRun 邻域）、`apps/web/src/pages/BookDetailPage.tsx`（4 接入点 :643 整书生成/:945 行内生成/:1009 生成本章/:1012 发起续写——onClick 换 startRunWithGate，原闭包原样传入）、`apps/web/src/pages/NewBookIdeaPage.tsx`（:115-127 launch）；Create `apps/web/src/components/FusionGateDialog.tsx`、`apps/web/src/fusionGate.ts`；Test Create `apps/web/src/components/FusionGateDialog.test.tsx`；Test Modify `BookDetailPage.test.tsx`（:288 与 :520-571 三处 stub 表补 gate pass 形态+新增 confirm→run 顺序断言例）、`NewBookIdeaPage.test.tsx`（同型 stub）。

## 三、改法

按计划 Task-05 步骤 1–9。硬钉：前端零引擎——剥后文本唯一来源=`report.previewDescription`（组件 docblock 写明 MVP 简化）；planner 三行只给绑/不绑+附注「大纲卡落地格恒优先，档案只作参考」；fewshot 只读展示无控件；degraded → 横幅「本次未做张力对照」；不可剥行控件禁用；取消不调 onConfirm；aria-label 钉值照计划（不再提示 checkbox）。

## 四、先红后绿回归测试 + 验收命令（均在项目根目录执行）

- `pnpm -F @inkforge/web test` → 全绿（web 基线 156 不减；既有用例仅 stub 随迁+新增，断言零删改——冲击 #5/#6 逐例核对 run 端点断言仍真实命中）
- `pnpm -F @inkforge/web build` → 冒烟过
- `pnpm lint` → 零输出；`pnpm typecheck` → 全 workspace 0 错
- `git show --stat HEAD` → 文件集不越界

## 约束

只 commit 不 push；永不 `--no-verify`；永不 `git add -A`；提交 Conventional 前缀+中文，正文 `verify:` 实测结果 + GUI 行「**GUI 未验证（owner 真实测试）**」+`Refs: docs/plans/2026-11-24-gen-fusion-gate.md Task-05；规格 v3.1`。禁读 `apps/server/data/**`、词表文件、v6 文本。卡外问题即停回报待裁决。执行中读取大于 4KB 的文件或查看改动，用 `python C:/Users/57850/.zcode/tools/pointer_tools.py` 的 pointerize/read_pointer/read_diff_only，禁止整读文件全文（BookDetailPage.tsx 很大，接入点用 read_pointer 定位邻域）。
