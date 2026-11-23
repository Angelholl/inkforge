# 调研卡：设定集 MD 各节 → 库内记录 → 生成注入 的数据流与蒸馏档案重叠面（2026-11-23）

## ① 调研问题与范围

背景：owner 拟精简《少年阿磊》设定集 v6.md（11 个编号 H2 节），判断「哪些节的内容已由蒸馏档案承载、可从 MD 删除由档案填补」。本卡只回答事实数据流，不做删减建议。

必须回答的问题（逐条给 path:line 证据）：

**Q1 解析器现行映射**（锚点 `apps/server/src/settings-import.ts`，全文件；计划文档 docs/plans/2026-11-20-settings-import.md:14-111 为设计期真值，以代码现行为准）：
- description 现在如何聚合：是「精炼全文」还是节选拼接？「精炼」具体剥掉什么（哪些节进、哪些节只归档不进 description）？DESCRIPTION_BUDGET 常量现值与 warning 文案。
- H2 节关键词归类规则逐条列出（包含匹配的词表），并对照 v6 实际节题逐一判定落点：`1.框架装置`、`2.世界观`、`3.规则体系`、`4.人物圣经`、`5.三卷大纲`、`6.故事线池`、`7.关系发生矩阵`、`8.场景资产库`、`9.剧情引擎库`、`10.文风与语言规范`、`11.长线账：悬置与终章接口`（悬置线清单为其下 H3）。
- characters / outlineTree / foreshadowings / styleSection 的提取规则现行实现（与计划十条规则的差异要点）。

**Q2 apply 与 mandate 落点**（锚点 `apps/server/src/http/routes.ts` 中 settings-import 相关路由、`apps/server/src/db/` books repo、`apps/web/src/pages/NewBookPage.tsx` 续写入口）：
- apply 是否总是 createBook 新书？有无「向既有书重导入/更新 description·characters」的路径？续写入口（NewBookPage）导入设定集的语义是什么（建新书还是写回原书）？
- 书级落地策略 mandate 存哪张表/哪个列？导入时「勾选落 mandate」读的是 MD 哪一节（关系发生矩阵？）？书籍设置下拉能否脱离 MD 独立编辑 mandate？即：若 MD 删掉该节，mandate 数据是否仍独立存在于库中、生成时照常生效？

**Q3 生成注入装配清单**（锚点 `apps/server/src/pipeline/`、`apps/server/src/context/`、`apps/server/src/prompts/`，及 config.ts BUDGETS 各槽消费者）：
- 逐个列出 draft 管线各上下文槽（worldview/characters/styleRules/styleDims/blueprint/continuity/prevTail/fewShot）的数据来源表与列（books.description? characters.baseSetting? style_profiles.analysis? chapter_summaries? character_states?）。
- planner（章节蓝图/续写）上下文各块来源：是否注入 books.description？注入 spectrum_profiles / plot_profiles / mandate【LANDING】行的内容与条件（planner-only 还是也进 drafter）？
- outline-suggest / blueprint-suggest 槽来源。
- book_style_profiles 绑定（buildStyleBundle）产物注入哪些槽；style_profiles.source 与 analysis 分别喂给谁。
- 结论要求：给出一张「注入槽 ← 来源表/列」总表，标明每个槽的内容是「来自 MD 导入」还是「来自章节蒸馏」还是「两者同源可互替」。

**Q4 蒸馏作业输入输出**（锚点 `apps/server/src/spectrum.ts`、`plot.ts`、`imitation.ts`、`style/`、`apps/server/src/worker/` 或 distill_jobs 相关）：
- 各蒸馏类型（style/spectrum/plot/imitation）的输入是什么（章节正文? style_sources? 设定 description?）——确认档案内容是否全部派生自已生成章节、与 MD 无派生关系；distill_jobs 各 kind 的产物写入哪张表。

**范围外**：GUI 组件交互细节、测试文件、导出功能。

## ② 只读约束

- 禁止改动工作树任何代码文件；只允许新建并写入报告文件 `docs/design/research-2026-11-23-md-archive-overlap.md`。
- 完成后 `git add` 仅该报告文件并 commit（Conventional 前缀 docs: + 中文），**不 push**；不得 git add -A。

## ③ 报告结构

- 结论先行：Q1-Q4 各一段结论；随后给「v6 十一节 → 库内记录 → 注入槽 → 蒸馏档案是否覆盖同一槽」逐节判定表（只列事实，不给删减建议）。
- 证据：每条断言附 path:line + 短摘录（≤6 行/条）。
- 未找到项与已试搜索词：明确列出查不到/存疑的点。

## ④ 验收命令（均在项目根目录执行）

- `grep -n "DESCRIPTION_BUDGET" apps/server/src/settings-import.ts apps/web/src/components/SettingsImportPanel.tsx`
- `grep -n "世界观\|规则体系\|人物圣经\|大纲\|悬置\|文风" apps/server/src/settings-import.ts | head -40`
- `grep -n "mandate" apps/server/src/http/routes.ts apps/server/src/db/*.ts | head -30`
- `grep -rn "worldview" apps/server/src/pipeline/ apps/server/src/context/ | head -30`
- `grep -rn "spectrum\|plotReference\|LANDING" apps/server/src/pipeline/ apps/server/src/prompts/ | head -30`
- 主审将对照本卡范围逐问复核，超范围即退回。

## 卡面四条

1. 根因/目标：为「设定集精简依赖蒸馏档案填补」的决策提供代码级数据流真值。
2. 改动文件：仅新建 `docs/design/research-2026-11-23-md-archive-overlap.md`。
3. 改法：按①③执行只读调研并落盘报告。
4. 验收命令：见④；无测试要求（只读卡）。
