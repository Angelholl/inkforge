# 调研卡 R2：蒸馏管线现状对照目标能力矩阵 + 评分参数可调面（2026-11-16）

## ① 调研问题与范围

**背景（owner 2026-11-16 反馈原文）**：
- 反馈2「蒸馏的效果太差，和参考项目对比能力太弱」——owner 已给出蒸馏应达到的目标能力矩阵（附录A，摘自 MirrorNovel 公开 README 产品行为描述）。阶段 B 已落地「七维六轴结构化档案/确认门两步流/模板参数/自评/漂移抄用接线/persona 快照/版本视图/术语表/批量校对」（commit bfca407），但实际效果仍不达 owner 预期，需盘点代码事实层差距。
- 反馈4「生成的文章评分不知道是否合意，不知道在哪调整参数」。

**附录A 目标能力矩阵（owner 拍定的蒸馏目标形态）**：
1. 个人参考库：上传文件或粘贴正文；可查看后台分析进度、失败原因、风格档案；支持重新蒸馏或删除。
2. 多格式导入：.txt、.epub（EPUB 按阅读顺序提取正文）。
3. 风格蒸馏：提取节奏、对话、描写、情感基调、写作特点、特色词汇、章节结构七维，形成可复用档案。
4. 结构分析：提炼阶段节奏、冲突与伏笔等抽象方法；分析结果可编辑，确认应用后才带入创作，也可取消。
5. 创作联动：可多选已蒸馏参考，将确认后的参考与结构快照带入创作。
6. 可选文风示例：生成页可开启少量参考原文输入，默认关闭。
7. 人格提炼：将参考档案转为个人风格模板，便于后续复用。

**Q1 逐项盘点**（范围 apps/server/src + apps/web/src/pages + packages/shared/src；输出 7 行差距表，每行=已实现/部分/缺失 + path:line 证据或已试搜索词）：
- 已实现项也要给证据行；「部分」必须写明差在哪个环节。
- 重点追问（逐条回答）：
  a) 蒸馏执行形态：同步阻塞请求还是后台任务？有无进度事件与失败原因展示？（能力1）
  b) apps/server/src/style/inject.ts 的 renderStyleBlock 实际注入了什么：七维/六轴结构化字段是否真被注入章节生成上下文，还是仍只注入 rulesText+样本原文？逐项列注入内容组装顺序与字数预算。（效果根因关键）
  c) voiceRefMetrics 全仓接线现状：l0.ts 启用条件、chapter.ts 调用是否已传值（旧缺口 F2，bfca407 声称「漂移抄用接线」，须验证是否真生效；未生效给 path:line 反证）。
  d) 一本书可绑定的风格档案数量=1 还是多本？绑定与轮换逻辑在哪。（能力5）
  e) 文风示例注入有无开关、默认开还是关。（能力6）
  f) 风格档案/仿写档案有无删除端点与 UI 删除操作；「重新蒸馏」在 UI 的入口形态。（能力1）
  g) .epub 解析有无（搜索词 epub）。
  h) persona 快照语义：是「书绑定时的档案快照」还是「可独立复用的个人风格模板」？两者差异点。（能力7）
  i) 蒸馏产物七维字段各自的数据类型（数值/枚举/自由文本）与取值范围约束；六轴数值是否参与 QC 或仅存档展示。（效果根因关键）

**Q2 评分与参数可调面**（范围 apps/server/src/quality + apps/server/src/config.ts + apps/server/src/settings.ts + apps/web/src/pages）：
1. 评分链：l0.ts 各检查项（长度/套话/重演/抄用/节拍/连续性）的评分方式与阈值来源（硬编码常量名+当前值+行号，或读 config——逐个列）；l1.ts rubric 评分方式；gate.ts 门控判定条件（什么分数/条件过、触发重写、转 needs_human）。
2. 评分呈现链：SSE 事件字段（worker/app.ts）→ apps/web/src/hooks/useRunEvents → RunPage/DashboardPage/ChapterReaderPage——哪个页面展示哪个评分/finding 字段；有无任何解释评分含义/阈值来源的文案（hover/图例/说明）。
3. 蒸馏自评（bfca407 声称「自评」）：代码路径（哪个文件哪个函数）、分数是否写 metrics_json、UI 何处展示。
4. 可调面两张清单：GUI 当前可调参数清单（settings.ts + SettingsPage.tsx，名称+path:line）；仅存在于代码常量或环境变量的阈值清单（常量名+当前值+path:line）。

**锚点**（path+文案多重冗余，行号自行定位）：apps/server/src/style/distill.ts（文案「RULES_INSTRUCTION」「maxSegments」「版本+1」）；apps/server/src/style/inject.ts（文案「renderStyleBlock」「pickStyleSamples」）；apps/server/src/quality/l0.ts（文案「套话」「抄用」「15 字」）；apps/web/src/pages/SettingsPage.tsx（文案「端点」「模型」）；apps/server/src/imitation.ts（commit afaa726「三段分析管线」）。

## ② 只读约束
禁止改动工作树任何代码文件（不编辑、不格式化、不 git checkout/reset）。唯一允许的写操作：新建报告文件 docs/design/research-2026-11-16-distill-qc.md，并 `git add` 仅该文件 + `git commit -m "docs(design): R2 蒸馏能力差距与评分可调面调研报告"`，不 push。

## ③ 报告结构
结论先行（附录A 七行差距状态表 + Q1 追问 a-i 逐条一句话结论 + Q2 两张可调面清单）→ 证据（每条配 path:line + 关键行摘录 ≤5 行）→ 未找到项与已试搜索词。

## ④ 验收命令（以下命令均在项目根目录执行）
- `grep -nE "maxSegments|均匀|预算|progress|失败" apps/server/src/style/distill.ts | head -30`
- `grep -nE "axes|六轴|七维|dims|rulesText" apps/server/src/style/inject.ts | head -20`
- `grep -rn "voiceRefMetrics" apps/server/src | head`
- `grep -rniE "epub" apps/server/src apps/web/src packages/shared/src | head`
- `grep -nE "THRESHOLD|阈值|score" apps/server/src/quality/l0.ts apps/server/src/quality/gate.ts | head -40`
- `grep -rniE "router\.delete|'DELETE'" apps/server/src | head -20`
