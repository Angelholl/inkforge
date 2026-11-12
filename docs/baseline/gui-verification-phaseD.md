# GUI 黑盒目验记录（T30 补课，Phase D，2026-11-12）

## 方法与声明

- 工具：ZCode IAB（内嵌浏览器），DOM 快照 + 截图双通道取证；截图存 `docs/baseline/gui-shots/`。
- **声明（按 lessons gui.md）**：本面板 OS 级输入注入大面积失效（locator.click/cua.click 超时或无效果，与 owner 锁屏/面板后台节流相关），交互统一改用**元素级 programmatic click**（`el.click()`，与真实点击同一 DOM 事件链，不绕过任何前端逻辑）；表单输入用 Playwright `fill`。
- 服务：`http://127.0.0.1:8787`（mock=false，真模型端点当时未加载模型，见"受限项"）。

## 发现并当场修复的缺陷（目验价值）

| # | 缺陷 | 修复 | 回归 |
|---|------|------|------|
| G1 | **SPA history 回退缺失**：深链接整页加载（刷新/直开/书签）一律 404 JSON，T14 计划的"静态回退"未实现 | `routes.ts` setNotFoundHandler：非 `/api` GET 回 index.html；API 404 保持 JSON | `api.test.ts` 新增回归测试 7/7 绿（commit 54652dc） |
| G2 | **系统深色模式整页不可见**：页面未固定配色，WebView 跟随系统 dark 模式时书架标题/仪表盘 140 行表格/选段重写输入框黑底黑字不可见（截图 `bookshelf-before-darkmode-bug.png`） | `index.css` 固定 `color-scheme: light` + body 显式底色/字色，重建 | 修复后书架/阅读器/仪表盘截图全部清晰（见 gui-shots/*-fixed.png） |

## 逐项结论（修复后）

| # | 测试点 | 结论 | 证据 |
|---|--------|------|------|
| 1 | 书架页 | **PASS**：3 本书卡片、建书表单渲染正常 | bookshelf-fixed.png |
| 2 | 书详情页 | **PASS**：20 章列表、needs_human 状态标签、蓝图编辑区、整书生成/刷新按钮齐全（DOM 断言） | 快照留档 |
| 3 | 阅读器 | **PASS**：正文渲染、版本链 3 版（revised×2+draft）、回滚/导出按钮、选段重写面板 | reader-fixed.png |
| 4 | 版本 diff | **PASS**：相邻版本 word-diff，绿插入/红删除行内标记，统计"插入段 539 · 删除段 525" | diff-page.png |
| 5 | 仪表盘 | **PASS**：20 章 × 7 步 = 140 行全渲染，总耗时 10219.2s、输入 106921 tok、输出 167558 tok，无 NaN/空白崩坏 | dashboard-fixed.png |
| 6 | 选段重写 | **PASS（链路）/受限（真模型）**：表单填写→提交→错误反馈（"失败：POST …/rewrite-selection → 409"）全链路可用；真模型当时未加载（`/v1/models` 空），重写产物由 mock e2e 覆盖（commit 3bc042f） | 快照留档 |
| 7 | 页面错误 | **PASS**：全程无白屏/崩溃；控制台监听在本面板不可用，以页面可见错误表现为准 | — |

## 受限项（0.1 已知限制）

- 选段重写真模型产物未目验：Strata 端点挂机结束后未加载模型（409 "model ID is not loaded"），owner 重载模型后可直接在 GUI 重试。
- 书架内 React Router 点击导航（客户端路由）在注入环境未逐链验证；fallback 修复后深链整页加载全通过，客户端路由经 programmatic click 验证正常（detail→reader→diff）。
