# GUI 黑盒目验：世界观/人物卡/剧情大纲（0.2 WCO，2026-11-14）

**环境：** 8789 mock 隔离实例（四件套齐备：INKFORGE_PORT=8789 + INKFORGE_DATA_DIR=apps/server/data-gui-wco + INKFORGE_MOCK=1 + INKFORGE_CONFIG_FILE=data-gui-wco/config.json），web 经 vite dev（5173）+ INKFORGE_API_TARGET=http://127.0.0.1:8789 代理（构建产物 API 基址硬编码 8787，桌面态设计；GUI 目验走 dev 代理为先例方案）。驱动：puppeteer-core + 系统 Chrome（无头），纯真实用户操作（导航/点击/键入），零 JS 注入改状态。8787 生产态零触碰（无活动 run）。

**结论：全部测试点 PASS（1 个真 bug 目验中抓出并当场修复复验）**

| # | 测试点 | 结果 | 证据 |
|---|---|---|---|
| T1 | 新书向导 step1：书名/世界观/剧情大纲/人物卡行录入 → 建书 | PASS | t1_initial.png / t1_filled.png |
| T1b | mock 态 outline-suggest 502 显性暴露 + 兜底文案（缺章块错误逐条列出，表单数据保留） | PASS | t1_result.png（console 仅一条预期 502 资源错误） |
| T2 | 书详情三分区渲染与预填（世界观/剧情大纲回读建书入参、人物卡列表含建书随录的张三卡） | PASS | t2_initial.png（API 复核 description/outline/characters 一致） |
| T2b | 世界观/大纲回编 → 保存设定 → PUT meta 持久化（API 回读「（新编版）」「终卷：新王登基」在库） | PASS | t2_saved.png |
| T3a | 人物卡添加（李四）→ 列表即时可见 | PASS | t3_added.png |
| T3b | 人物卡编辑（张三设定追加）→ 预览即时更新 | PASS | t3_edited.png |
| T3c | 人物卡删除（李四）→ 列表移除 + API 复核仅剩张三 | PASS | t3_deleted.png |
| P2 | 空姓名添加 → 行内校验「人物卡姓名不能为空」，不发请求 | PASS | t3_emptyname.png |

**console 错误清单：** 全程仅预期内资源错误（T1b 的 502；无未捕获异常、无渲染报错）。

## 目验中抓出的真 bug（已修复）

**`deleteCharacter` 删除请求 400**：client 以 `content-type: application/json` + 空 body 发 DELETE，Fastify 拒空体（FST_ERR_CTP_EMPTY_JSON_BODY）→ 每次点击删除都 400、卡片不消失。修复=补 `body: '{}'`（对齐 cancelRun 等兄弟端点先例）。**单测未拦截的原因**：app.inject 的 DELETE 未带 content-type 头，不触发该解析路径——GUI 黑盒目验的价值实证。修复后聚焦复测（t3c）：一次点击即删、console 零错误。

## 已知限制（非缺陷，登记备忘）

1. 人物卡编辑态预填为展平文本（`k: v`），保存按 `{"设定": text}` 包裹回写——重复编辑会产生「设定: 设定: …」前缀噪声（界面显示层，数据无损）。后续可改为按原始 JSON 键回填。
2. 全量脚本里「保存后立即删除」点击会落在 refetch 重渲染前的已卸载节点（脚本时序，真实用户操作间隔不会触发）；聚焦复测正常。

## 环境准备记录（与测试行为区分）

- 建书/人物卡数据全部由测试自身的 GUI 操作产生（T1 向导真实填表建书），无预置数据注入；
- mock 服务器与 vite dev 为环境准备；API GET 复核为只读交叉验证。
