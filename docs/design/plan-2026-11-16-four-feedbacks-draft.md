# 实现计划草案：四条反馈收口（2026-11-16，待评议+owner 拍板）

> 事实基础：research-2026-11-16-ui-versions.md（R1）、research-2026-11-16-distill-qc.md（R2）。
> owner 口径（2026-11-16 已确认）：①按钮全量归一；②蒸馏对标七项能力矩阵（MirrorNovel 行为层，third-party-references 11-16 行）；③章节版本+档案版本两者都要删；④评分要解释+可调。
> UI 第一参考=SubTrans（owner 指定），Button 规范由设计专家另行产出（spec-button-subtrans-2026-11-16.md），不在本草案内。

## 决策点与推荐

### D1 版本删除 vs append-only 红线（高风险，须评议）
现状：chapter_versions 与 style_profiles 完全无删除通路；版本列表 SELECT * 连全文读、阅读器 5s 轮询（R1 Q2）。
**推荐**：
- 章节版本=**叶子硬删**：仅允许删「非本章 current 且无子版本引用（parent_version_id）且未被进行中 run 引用」的版本；content 永不就地改，删除视为垃圾回收，链完整性由叶子约束保证。UI 版本链每非当前版本加删除（两步确认）。
- 风格档案=**按版本行删**：DELETE /api/style-profiles/:id；删除前先解绑所有引用它的书（books.style_profile_id→NULL，仿 imitation 先解绑再删模式）；书侧 style_snapshot_json 保留不动。UI 档案行+版本视图行加删除（两步确认）。
- 不做软删/回收站，不做保留 N 自动清理（v1 从简，后续可加）。
**替代**：软删 deleted_at 标记（链断裂风险更低但加列+全查询过滤，复杂度不值）。**风险**：删版本后 DiffPage 相邻对比、run 报表引用需回归验证。

### D2 蒸馏效果根因与分批（核心）
根因（R2 追问 b 实证）：七维 dims/六轴 axes 产出后**从未进生成上下文**（chapter.ts 只取 rulesText/terms；fewShot 槽首参传空串）；full 整章重写**完全不传风格槽**——重写一次风格约束即脱落。这是「效果太差」的第一责任，不在采样层。
- **批一（效果核心，server+prompt）**：①dims/axes 摘要注入 draft（并入 styleRules 槽或独立槽，预算从 config.budgets 划）；②full/focused 重写路径补传 styleRules+fewShot；③OVERALL 标尺加锚点定义（1/5/8/10 各档语义，render.ts rubric）。批一动生成管线，需 replay 语料过门。
- **批二（参考库操作面，server+web+migration 串行）**：④蒸馏改后台任务+进度事件+失败原因展示（复用 run 队列形态）；⑤「重新蒸馏」入口；⑥档案删除（D1）；⑦解绑修复（UI 空值被忽略 bug）；⑧文风示例开关（**默认关**，对齐矩阵能力 6——注意这是默认行为变更，现有绑定书的注入会静默关闭，需 UI 明示）；⑨多选绑定（books 单列→绑定表，≤3 档对齐矩阵能力 5；数据库迁移卡串行）。
- **批三（输入与模板）**：⑩.epub 导入（需解析依赖，zip+xhtml，依赖引入待 owner 点头）；⑪人格提炼=档案→可复用个人风格模板实体（新表+跨书复用）；⑫仿写拆解预览可编辑（对齐矩阵能力 4）。
**替代**：只做批一+二，批三挂 0.3。**风险**：⑧默认关改变既有生成输出；⑨动 schema。

### D3 评分解释+可调
现状（R2 Q2）：全 UI 唯一分数露点=版本 chip 的 overall.toFixed(1)；阈值全硬编码（scoreThreshold 8.0/targetChars 3000/maxRounds 2/L0 带宽等）；无任何解释文案；SSE 无 finding 事件。
**推荐**：①设置页新增「生成与质检」区：targetChars/scoreThreshold/maxRounds 三旋钮（settings.ts 持久化+每项带含义说明）；②阅读器版本 chip 加 title 说明+质检结论图例（overall 1-10 锚点、softMajors/blocker 含义一句话）；③版本详情加「质检明细」折叠（数据已在 run steps outputJson，取数路径卡上核）。**替代**：只做①②。**风险**：阈值可调后低配组合可能放大垃圾输出，说明文案要写明建议区间。

### D4 按钮全量归一
依赖设计专家规范（65 处逐行映射表）。卡形：1 张组件卡（ui.tsx 加 Button 变体+单测）+ 2-3 张按页替换卡（大页 BookDetail/OutlineTree/NewBookIdea/NewBook 一组，小组件页一组，RunPage/Settings/Distill 一组）。每卡 GUI 黑盒目验+回归测试。

## 验收与测试基线
- 每卡先红后绿；server 测试基线只增不减；批二⑨ migration 卡串行不入并行白名单；GUI 卡提交前 web-gui-tester 黑盒（1280/1600）。
- 批一 replay 语料过门沿用 0.2-T05 真模型窗口条件。

## 待评议项（decision-critic）
D1 叶子硬删是否守住 append-only 设计意图与崩溃安全；D2 批一三项的优先级与⑧默认关的风险接受；D3 三件取舍；卡粒度是否过粗/过细。
