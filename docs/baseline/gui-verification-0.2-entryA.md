# GUI 黑盒验证：0.2-T11 新建小说（续写）入口流

- 日期：2026-11-13；验证人：主审（web-gui-tester 黑盒，lessons 已调）
- 隔离环境：server `INKFORGE_PORT=8789 INKFORGE_DATA_DIR=data/gui-verify-t11 INKFORGE_MOCK=1`；vite 5189（`INKFORGE_API_TARGET=http://127.0.0.1:8789`）；8787 生产服务全程 health 0.1.2 在线、零波及（验证后隔离进程已清杀）

## 用例与结论（P0 主流程全通过）

| # | 步骤 | 结果 | 证据 |
|---|---|---|---|
| 1 | `/new` 三步向导首屏（书名/简介/建书） | PASS | gui-shots/0.2-t11-step1.png |
| 2 | 建书 → 进入导入步；粘贴 3 章文本「拆章预览」渲染 3 条（章题可编辑+字数+删除） | PASS | gui-shots/0.2-t11-step2-preview.png |
| 3 | 删除一条 → 2 条；「导入 2 章」→ 第三步显示「下一章为第 3 章」 | PASS | DOM 快照 |
| 4 | 补摘要·第 1 章（mock）→ 行内提示「第 1 章摘要已生成」 | PASS | DOM 快照 |
| 5 | AI 建议蓝图（mock 不出 GOAL/HOOK 文样）→ 502 → 行内红框展示 parse failed + 转手填提示（R2/R7 预期路径） | PASS | gui-shots/0.2-t11-step3-502-hint.png |
| 6 | 手填蓝图 JSON → 发起续写（第 3 章）→ 跳 `/runs/:runId`，SSE 已连接、范围 3-3、queued | PASS | gui-shots/0.2-t11-run-page.png |
| 7 | fallback 页 header「新建小说」链接 → /new | PASS | DOM 断言 href |

## 隔离复核

- mock 书/章/run 全部落 `apps/server/data/gui-verify-t11/inkforge.db`（独立目录）；生产库零写入。
- 验证后 8789/5189 六个隔离进程已清杀，8787 生产服务 health 复核在线。

## 备注

- 「新建小说」链接按卡面落在 App header（fallback/settings 路由可见）；BooksPage 页头无该链接（既有结构，未超卡改动）。
- 步骤 6 截图时 run 已 queued 无步骤行（mock worker 空闲排队），属既有 RunPage 语义。
