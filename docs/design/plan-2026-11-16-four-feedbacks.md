# 实现计划 v2（评议后）：四条反馈收口（2026-11-16）

> 前作：plan-2026-11-16-four-feedbacks-draft.md（被本文取代）；事实基础 R1/R2 调研报告（均已主审抽查复核）；decision-critic 评议四条 [HIGH_RISK_OBJECTION] **全部采纳**（关键事实断言主审已逐条复核成立）。Button 规范已入库：spec-button-subtrans-2026-11-16.md（fed8d00，65 处映射表实证）。
> 状态：待 owner 四项拍板（见文末），拍板后归档 decision-log 并开卡。

## 一、评议异议裁定（主审回应）

| 异议 | 裁定 | 定案 |
|---|---|---|
| D1 叶子硬删近乎无效+不可逆无回滚 | **采纳** | 章节版本改**软删**：`deleted_at` 列（加列迁移），可删任意「非 current 且未被 queued/running/**paused** run 引用」的版本；listVersions 过滤已删且**列表查询不再 SELECT content**（读放大根治）；磁盘回收延后（v1 诉求是列表不再堆积）。配套：VersionDto/versions 端点补 `currentVersionId`，ChapterReaderPage current 回退不再取 list[0]，DiffPage 相邻配对改按 parent 链；draft/rewrite finishStep 把 usage 写进 outputJson，报表与版本行解耦。 |
| D1 风格档案删除致死快照 | **采纳** | **有绑定则 409 拒绝**（返回绑定书列表，确认框展示影响面）；解绑（含⑦解绑修复）后方可删。不静默解绑、不留死快照。 |
| D2⑨ 多选绑定属架构决策 | **采纳** | 移出本批，另立 0.3 设计稿（合并优先级/快照结构/voiceRefMetrics 基准三题先决）。 |
| D2④ 蒸馏复用 run 队列形态不成立 | **采纳** | 独立 `distill_jobs` 表（status/progress/error/result_json）+ 轮询端点；不动 runs 状态机，不堵章节生成（worker 并发=1）。 |
| D3 targetChars 死旋钮 [MATERIAL_CONFLICT] | **采纳** | 不做全局 targetChars 旋钮（管线消费的是每章 blueprint 值）；设置页只暴露 scoreThreshold（minGain 进图例说明）；maxRounds 放开跑入口（runs 级字段已有）；OVERALL 锚点定义从批一移入 D3 与阈值校准同批。 |

批一其余修正（随采纳落地）：dims/axes 走**独立 styleDims 槽**（system 稳定槽，预算 600 字，8k 档=0 卡面注明）；六轴**渲染成语义句**（每轴两端锚点→指导语，映射表写入卡面，不裸注入数字）；**targeted 重写也补 styleRules 精简槽**（不只 full）；fewShot 空规则头一行修随批一带走；⑥档案删除从批二摘除归 D1/B4；⑤重新蒸馏前置=新增 style_sources 原文留存（否则版本链语义断裂）。

## 二、批次排期（串行主线，有限并行）

- **B1 注入核心**（server：chapter.ts/prompts/config/inject）：styleDims 槽+语义句映射、full+targeted 重写补风格槽、qc step 写 outputVersionId、fewShot 空头修。**验收门=确定性装配测试（+3~4 例）+ owner 盲评 A/B**（同书同蓝图 3 章注入前后，qc-replay 语料只验解析不作效果门）。
- **B2 章节版本软删**（server 卡+web 卡，可与 B1 并行——文件不相交）：迁移加列、删除端点（拦截 queued/running/paused + output_version_id 引用）、列表瘦身、isCurrent、Reader/Diff 修正、删除矩阵测试（current/有子/三种 run 态/无引用 ≥6 场景）。
- **B3 评分解释+可调**（server+web）：settings 持久化 quality 覆盖（scoreThreshold；保存生效口径卡上定）、开跑入口 maxRounds(≤3)、版本详情「质检明细」面板（消费 gate.reasons+l0 findings，依赖 B1 的 qc outputVersionId）、OVERALL 锚点、chip 图例与「同分即停」说明。
- **B4 档案删除+解绑修复+示例开关**（迁移加列串行）：删除 409-if-bound；StyleBindSelect 空值修；`books.style_fewshot_on` 列（NULL=沿用现状开，**新绑定默认写 0=关**，逐书可切）——samples 关闭时抄用检测失去参考文本，卡面+UI 双注明。
- **B5 蒸馏后台化+重蒸**：distill_jobs+进度轮询+失败原因展示；style_sources 留存后「重新蒸馏」真升同源版本。
- **B6 按钮归一（D4）串行尾批**：组件卡（ui.tsx Button 四变体+单测+1）→ 按页替换卡 4-5 张（单卡 ≤13 处，卡面钉映射表行号范围；测试基线不降，+组件用例）；每卡 GUI 黑盒 1280/1600。若 owner 改令先行，代价=后续批次触及同页需复验目验。
- **0.3 缓议**：⑨多选绑定设计稿；.epub（依赖引入+不可信 zip 威胁模型：路径穿越/zip bomb 上限）；persona 模板实体；仿写拆解预览可编辑。

**测试基线**：开工前实测钉 shared/web/server 三包 vitest 用例数，逐卡卡面钉 +N 落点；只增不减。

## 三、owner 终拍板（2026-11-16，AskUserQuestion 直答，归档 DEC-2026-1116-01）
1. **章节版本删除=硬删+删前快照+墓碑**：事务内 ①backupBook 删前快照（独立命名 `-predelete-`、独立保留 3 份、不挤占 run 快照额度）→②写墓碑表（id/chapter_id/kind/run_id/word_count/created_at/deleted_at，不存 content）→③子版本 parent_version_id 置 NULL（仅元数据，content 永不就地改）→④删行。拦截集=current + queued/running/**paused** run 的 output_version_id 引用。VersionDto 补 currentVersionId、Reader 回退不再取 list[0]、DiffPage 配对修正同卡落地；报表对墓碑显示「版本已删」，usage 写进 outputJson 彻底解耦。磁盘真回收。
2. **风格档案删除=有绑定拒绝（409+绑定书列表）**，解绑（含⑦修复）后方可删。
3. **按钮全量归一=立即先行**：执行序改为 D4（组件卡→按页替换卡，单卡 ≤13 处）→B1→B2→B3→B4→B5；代价登记：后续功能卡对已替换页面 GUI 复验。
4. **文风示例=全局默认关+逐书开关**：`books.style_fewshot_on` 列 DEFAULT 0（存量绑定书一并关，owner 接受存量输出变化，书详情可逐书开）；**开关仅控注入**——抄用检测 referenceTexts 恒取绑定样本（有绑定且有样本即运行），硬检查不随开关关闭（主模型设计细节，随 DEC 归档可驳回）。
5. 默认通过项：⑨多选绑定设计稿+批三（.epub/persona 模板/仿写预览可编辑）缓议 0.3；B1 效果门=装配确定性测试+owner 盲评（3 章×注入前后）。

**计划真值**：docs/plans/2026-11-16-four-feedbacks.md（code-planner 产出，writing-plans 粒度），owner 审后按 dispatch-discipline 派卡。
