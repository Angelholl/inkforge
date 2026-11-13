# GUI 黑盒目验：入口 B 生成模式（EB-3 收口）

- 日期：2026-11-14
- 环境：`INKFORGE_PORT=8789 INKFORGE_DATA_DIR=data/gui-verify-eb3 INKFORGE_MOCK=1 INKFORGE_CONFIG_FILE=data/gui-verify-eb3/config.json`（全隔离：数据目录 + 设置文件，教训见下）+ Vite 5173（API target 8789）+ 无头 Chrome 157（CDP 9223）。
- 结论：**向导链路 + 兜底路径 + generate 管线全通**；mock 态 outline-suggest 502 为 R7 预期行为，真模型验证挂 Strata 窗口（端点当前离线）。

| # | 测试点 | 结果 | 证据（docs/baseline/gui-shots/） |
|---|---|---|---|
| 1 | `/new` 向导 step1：书名/世界观/章节数(3)填写完整，TAB 新书高亮 | PASS | eb3-1-suggest-502.png |
| 2 | 建书并生成蓝图：createBook 201（bookId 入 URL）→ outline-suggest 502 显性暴露（errors: 缺少第1/2/3章块，mock 文样非蓝图协议）+ 行内兜底提示「可到书详情页手填蓝图后从书架发起生成」 | PASS | eb3-1-suggest-502.png |
| 3 | 兜底路径：书详情蓝图编辑手填 3 张蓝图（JSON）→ 逐张「蓝图已保存」→ 章节列表 planned ×3 | PASS | eb3-2-blueprints.png |
| 4 | 「整书生成」→「整书已入队 run 66d3f1cc」→ mock worker 执行完毕，三章 planned→needs_human（generate 模式管线含蓝图→生成→L0/L1→门控走通；mock QC 语义正常） | PASS | eb3-3-run.png |
| 5 | step2/step3 UI 与 PUT 逐章/createRun generate 契约：RTL 覆盖（NewBookIdeaPage.test 2 例） | PASS（RTL） | — |

**隔离教训（已固化为测试 setup 与运行守则）：** 设置页保存写 `INKFORGE_CONFIG_FILE`（默认 `~/.inkforge/config.json`），与 INKFORGE_DATA_DIR 无关——GUI 隔离环境必须同时隔离设置文件，否则写穿宿主家目录（本次事故已修复并恢复原状，详见收口报告）。

环境准备记录：临时目录 data/gui-verify-eb3 全新建；无预置业务数据；书与蓝图均由测试自身产生。
