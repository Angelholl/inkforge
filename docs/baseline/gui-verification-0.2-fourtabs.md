# GUI 黑盒目验：web 四 TAB 壳（0.2-T-07 收口）

- 日期：2026-11-14 凌晨（0.2 混跑窗口）
- 环境：`INKFORGE_PORT=8789 INKFORGE_DATA_DIR=data/gui-verify-t07 INKFORGE_MOCK=1`（隔离临时库）+ `INKFORGE_API_TARGET=http://127.0.0.1:8789 pnpm --filter @inkforge/web dev`（Vite 5173）；浏览器 = 无头 Chrome 157（CDP 9223）——ZCode 内建浏览器（IAB）本会话 webview 持续未就绪（5 次尝试 guest not attached），按 web-gui-tester 方法论换用系统 Chrome 无头实例等价驱动，交互均为真实 GUI 事件（click/input 原生事件），无注入改态。
- 结论：**7 项全过**；console 监听未注册（工具层未提供只读 console 通道），以页面可见错误表现为准——仅一处预期内 502（见第 3 项）。

| # | 测试点 | 结果 | 证据（docs/baseline/gui-shots/） |
|---|---|---|---|
| 1 | `/` 书架 TAB 高亮（font-bold）、无建书表单（input/建书按钮均无）、空态「还没有书。去 续写向导 建第一本。」、进入书详情正常 | PASS | t07-1-shelf.png |
| 2 | 依次点击 新书/续写/设置，激活态随路由迁移（/new 占位页禁用壳完整；/continue 三步向导；/settings 双分区；返回书架链接已随壳移除） | PASS | t07-2a-new.png / t07-2b-continue.png / t07-2c-settings.png |
| 3 | 续写向导三步走通：建书「四TAB目验之书」→ 粘贴 3 章拆章预览（37/30/36 字，可删）→ 导入成功「下一章为第 4 章」→ AI 建议蓝图 502 显性暴露（errors: 缺少 GOAL/HOOK 行，mock 文样非蓝图协议，R7 预期内）→ 行内提示转手填 → 手填 JSON → 发起续写跳 `/runs/477f7aa2`（SSE 已连接，章节范围 4-4；mock worker 实际执行，第 4 章产出 needs_human） | PASS | t07-3a~3e |
| 4 | `/settings` 双分区：保存出「已保存，重启应用后生效」；蒸馏 200 字样本 → 「蒸馏完成：档案 622be6cc…」→ 列表新增「测试档案甲 v1 · 句长中位数 29」 | PASS | t07-4a-saved.png / t07-4b-distill.png |
| 5 | 地址栏直入 `/styles` → 落 `/settings`（replace）且设置 TAB 高亮 | PASS | t07-5-styles-redirect.png |
| 6 | 直入 `/nope` → 404 页：无 TAB 导航、「服务已连接 · v0.1.2」健康状态、「此页不存在」、「← 返回书架」 | PASS | t07-6-notfound.png |
| 7 | 书架 → 书详情页：TAB 头常驻可见；绑定下拉显示「测试档案甲（v1）」与 continue 不注入注记 | PASS | t07-7-bookdetail.png |

环境准备记录（黑盒约束生效前的操作）：临时数据目录 data/gui-verify-t07 全新建；8789 服务以 mock 态启动；无任何预置业务数据（书/档案均由测试自身产生）。
