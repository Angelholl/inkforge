# GUI 黑盒验证：0.2-T12 风格档案管理页与书籍绑定

- 日期：2026-11-13；验证人：主审（web-gui-tester 黑盒，lessons 已调）
- 隔离环境：server `INKFORGE_PORT=8789 INKFORGE_DATA_DIR=data/gui-verify-t12 INKFORGE_MOCK=1`；vite 5189（`INKFORGE_API_TARGET=http://127.0.0.1:8789`）；8787 生产服务全程在线零波及；验证后隔离进程已清杀（8789 down、8787 health 复核在线）

## 用例与结论（全通过）

| # | 步骤 | 结果 | 证据 |
|---|---|---|---|
| 1 | `/styles` 空态（「暂无档案」提示 + 蒸馏表单） | PASS | DOM 快照 |
| 2 | 短样本（130 字 <200）→ 400 行内文案「样本为空，禁止蒸馏」 | PASS | gui-shots/0.2-t12-style-400.png |
| 3 | 足量样本（270 字）蒸馏 → 「蒸馏完成：档案 237ac6f3…」且列表新增行「黑盒测试风格 v1 · 句长中位数 40」，表单清空 | PASS | gui-shots/0.2-t12-style-distilled.png |
| 4 | 书架建「绑定测试书」→ 详情页出现「风格档案」区：下拉（未绑定/黑盒测试风格 v1）+ continue 不注入注记 | PASS | DOM 快照 |
| 5 | 下拉选择档案 → 「风格档案已绑定」+「已绑定：黑盒测试风格」 | PASS | gui-shots/0.2-t12-bind.png |

## 备注

- 注入器注意：本环境 Playwright click 对部分按钮偶发超时（元素 enabled/visible 均正常），改用 CUA 坐标点击完成，页面行为不受影响。
- 「新建小说/风格」header 链接在 fallback 路由可见（既有 App 结构）。
