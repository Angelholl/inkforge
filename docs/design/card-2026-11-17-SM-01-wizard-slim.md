# 卡 SM-01：新书向导 step2 瘦身（计划 Task-01）

## 背景/根因
owner 拍板 DEC-2026-1117-04 裁决①（docs/decision-log.md）：P3-2 瘦身收编——/new 三步向导保留、step2 撤全量蓝图 JSON 编辑，只留逐章采用/弃用+标题输入+逐章 targetChars 编辑（默认 3000、min 500），蓝图 JSON 改只读预览；targetChars 写死点（NewBookIdeaPage.tsx:89）随之消灭。深度蓝图编辑归详情页独有，本页不得新增。

## 改动文件（只允许动这 2 个）
- apps/web/src/pages/NewBookIdeaPage.tsx
- apps/web/src/pages/NewBookIdeaPage.test.tsx

## 改法
执行真值=docs/plans/2026-11-17-style-mixing-and-wizard-slim.md §Task-01（先读该节：搜「### Task-01」定位，offset/limit 分段读，勿整读计划全文；精确签名/断言值/命令以该节为准逐 checkbox 执行）。要点序：
1. 删 editBlueprint（:68-79）与 JSON 编辑 textarea（:242-249），新增 titles/chars 两个 Record state。
2. 保存循环（:85-91）改：title 空回落 `第N章`；targetChars=Math.max(500, trunc ?? 3000)。
3. 展开面板改三件套：标题 text input（aria-label「第N章标题」placeholder「第N章」）+ 字数 number input（min 500 step 100，aria-label「第N章目标字数」）+ 蓝图只读 `<pre>`（JSON.stringify(it.blueprint, null, 2)，无 onChange）。
4. 测试：用例三适配（去 JSON textarea 断言链，改为展开→输入标题「启程」/字数 2500→断言 put1 两值+未编辑章默认值+只读 pre 在场+step2 全局 textarea 计数 0）；新增「逐章字数下限钳到 500」用例。

## 先红后绿回归
先完成第 4 步测试改造 → 跑定向确认按预期变红（旧组件无标题/字数控件）→ 再改组件 → 全绿。

## 验收命令（均在项目根目录执行）
1. `pnpm --filter @inkforge/web exec vitest run src/pages/NewBookIdeaPage.test.tsx` → 4 passed
2. `pnpm --filter @inkforge/web exec vitest run` → 86 passed（基线 85 只增）
3. `pnpm typecheck` → exit 0；`pnpm lint` → 零输出
4. `pnpm -r --if-present run test` → web 86 / server 272 / shared 2（合计 360 ≥ 359）
5. `pnpm --filter @inkforge/web build` → exit 0（冒烟）
6. `pnpm audit --prod` → 零新增漏洞

## 约束
- 卡面自足，不依赖会话上下文；cwd 即项目根。
- 只动上列 2 文件；卡外问题即停上报待裁决，不得自修。
- 全量计数与本卡不符时先核对增量口径（本卡为首卡时 server 应仍 272），不得改测试凑数；验证链任一环失败即停，不得带病提交；回滚点=revert 本卡单提交。
- 只 commit 不 push；永不 --no-verify；永不 git add -A（只 add 上列 2 文件路径）。
- 提交信息 Conventional 前缀+中文，正文三行：`verify: <验收命令 1-6 实际结果摘要>`、`GUI 未验证（owner 真实测试）`、`Refs: DEC-2026-1117-04`。
- 既有断言仅允许计划 §Task-01 列明的适配，不得删/弱化来「变绿」。
- 返回报告：commit SHA + 各验收命令实际输出（通过/失败计数原文摘要）+ 偏差说明（如有）。
