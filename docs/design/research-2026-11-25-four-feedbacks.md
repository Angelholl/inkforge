# 调研报告：四个反馈区现状事实（2026-11-25）

> 执行通道=ZCode code-reader（只读，无 Write 工具故报告由主模型代落盘）。路径相对 `I:\inkforge`，行号以当前工作树为准。方案未拍板，本报告只记事实。

## 一、总体结论

1. FREQTERMS 行指令仅「3-8 条 + 语境/功能说明 + 禁人名」，无字数下限、无证据要求；70 字/维下限（DF 批）只检查 DIM 行，管不到 FREQTERMS。
2. freqTerms「仅展示不注入」属实：merge 产物 `merged.freqTerms` 在服务端零消费，drafter 只注 `merged.terms`，polish 亦然。
3. 续写 = run 的 `mode:'continue'`，planner（blueprint-suggest）无人物卡槽、无 worldview 槽，书籍简介被塞进 800 字预算的 task 槽；光谱/剧情/仿写档案只进 blueprint-suggest 的 planner 槽（各 600 字），drafter 红线不注入。
4. 设定集导入的人物卡存 `characters` 表，是纯文本解析生成（无 LLM）；drafter 确实消费（renderCharacterCards），blueprint-suggest 不消费。
5. blueprint-suggest 输入仅 `chapterNo`；AI 建议在前后端都是「替换 textarea 内容」而非追加；蓝图 PUT 时 mustHaveBeats 做并集追加；可复用的「局部→AI 扩展」现成机制 = rewrite-selection 选中段重写、蒸馏草稿行编辑入库（DistillProfilesShell）。

## 二、A 区：高频词蒸馏

### 现行 FREQTERMS 指令原文
`apps/server/src/style/analysis.ts:23`
```
FREQTERMS: <词组>: <总结说明>（结合上方统计总结 3-8 条高频用语：何处高频/什么语境/表达功能；与 TERMS 的世界观术语区分，同样严禁人物姓名；无则省略本行）
```
对比同段其他行（analysis.ts:15-24）：DIM 行（:16）有硬质量机制=每维不少于 70 字 + 写足具体字句 + DF-3 缺口重试反馈；RULES 行（:21）要求可执行量化规则 3-8 条；TERMS 行（:22）要求 3-10 条并列举词类。FREQTERMS 差异：无落库校验、无字数下限、无重试触发，仅 prompt 层软目标；质量机制只有 NAMES 人名过滤。模板可被 app_meta `distill_template` 整体覆盖（analysis.ts:14,46）。

### freqTerms 全链路（仅展示不注入，确认属实）
- 解析：`apps/server/src/llm/plainproto.ts:402-407`；NAMES 过滤 :421-431。落库 `rules_json.freqTerms`（analysis.ts:127）。
- 合并上限 `FREQ_TERMS_MAX=10`（merge.ts:27,306-314,369）。
- drafter：chapter.ts:198-205 仅取 rulesText/terms/dims/axes/samples，无 freqTerms；:212 renderStyleBlock 传 `merged.terms`。polish.ts:44,91 同只 terms。planner 无 style 档案槽。
- 前端展示：StyleProfilesSection.tsx:386-389,529。注入隔离测试钉死：style/inject-blocks.test.ts:51-54「renderStyleBlock 不输出 freqTerms」。

### 70 字/维下限管不到 FREQTERMS
`STYLE_DIM_MIN_CHARS=70`（plainproto.ts:351）；缺口只统计 DIM（:434-438）；重试反馈只提维度（analysis.ts:64-73）。

## 三、B 区：续写场景的档案消费面

### 续写实现形态
- run `mode:'continue'`，锚点校验 routes.ts:706-709。drafter 差异 chapter.ts:110,134（voiceRefMetrics 取前文）、:190 注入门已删、:240 task 追加「前文腔调优先」。
- blueprint-suggest=续写前唯一 planner 入口，请求体仅 `{chapterNo}`（routes.ts:62）；注入槽 hardRules/continuity/prevTail/task（:452-459）+ 条件槽 imitationStructure/plotReference/spectrumReference/outlineCard 各 600 字。
- **世界观机制根源**：书籍简介不是独立槽，拼进 renderBlueprintTask【书籍简介】行（render.ts:175），task 槽总预算 800 字（config.ts:141，协议行占 ~210 后简介仅剩 ~90 字）。drafter 侧 worldview 槽预算 20000 字（config.ts:105）。「约 1000 字」无对应钉值。

### 档案→注入矩阵（现状）
| 档案 | planner(blueprint-suggest) | drafter | polish | 纯展示 |
|---|---|---|---|---|
| style 蒸馏 | 无槽 | terms/dims/axes/rules/samples | terms | **freqTerms** |
| plot 蒸馏 | 600 字【剧情参考】 | 不注入（红线） | 无 | 结构列表 |
| spectrum 蒸馏 | 600→1500 字（SP 批已拍板） | 不注入（红线） | 无 | 结构列表 |
| imitation 档案 | 600 字【参考作品结构拆解】 | 不注入 | 无 | - |
| 设定集人物卡 | 无槽（outline-suggest 有注入 :525-529,571-580） | **renderCharacterCards**（chapter.ts:224-227） | 无 | 编辑 UI |
| worldview(book.description) | 塞进 800 字 task 槽 | 20000 字槽（chapter.ts:232） | 无 | 书籍信息编辑 |

### 设定集导入人物卡
存 `characters` 表（migrations/0001_core.sql:4）；apply=routes.ts:243-254 name 去重后 createBook 插入；纯文本解析无 LLM（settings-import.ts:366,79-85,867-868）。「以光谱档案生成人物卡」目前不存在。

## 四、C 区：蓝图编辑
- blueprint-suggest 输入仅 chapterNo，用户给不了自定义文本；上下文全服务端取；输出 `{blueprint, source:'llm', warnings?}`（routes.ts:513）。
- 存储 chapters.blueprint JSON（goal/beats/mustHaveBeats/bannedTopics，schemas.ts:35-37）；前端 BookDetailPage.tsx:353 裸 JSON textarea，AI 建议=整体替换（:464-465），保存走 PUT。手工编辑已可行（无结构化表单）。
- AI 建议覆盖式非追加式；但 PUT 对 mustHaveBeats 并集追加（routes.ts:392-402）——既有 beat 不会被覆盖丢失。
- 可复用「局部→AI 扩展」机制：rewrite-selection 端点（routes.ts:1575-1577）、蒸馏草稿行编辑入库（DistillProfilesShell.tsx:175,186-197,364-371）、blueprint-suggest 确定性叠加+重试修复模式（routes.ts:484-512）。
- 未找到：蓝图条目级局部扩展端点。

## 五、D 区：受牵连测试钉值点位
| 测试文件 | 钉的值 |
|---|---|
| test/llm/plainproto.test.ts:196-267 | FREQTERMS 解析形态、冒号容错、NAMES 剔除 |
| test/http/distill-template.test.ts:110,137-139 | 默认模板「每维不少于 70 字」 |
| test/http/distill-jobs.test.ts:242-247 | warnings 文案「维度X仅N字，低于下限70字」 |
| test/style/analysis.test.ts:238-263 | freqBlock 注入；FREQTERMS 落 rules_json |
| test/style/inject-blocks.test.ts:51-54 | renderStyleBlock 不含 freqTerms（改注入必改） |
| test/style/merge.test.ts:137-148 | freqTerms 并集主优先、上限 10 |
| test/http/style.test.ts:229-251 | DTO analysis.freqTerms 字段形态 |
| test/http/blueprint-suggest.test.ts:45,72-75 | task 槽预算 800（简介 300 字不截断）；大纲卡注入/并集/LANDING 重试 |
| test/plot.test.ts:111-137、test/spectrum.test.ts:155-205 | plot/spectrum 注入槽 + drafter 无槽红线 |
| test/http/settings-import.test.ts:66 | 人物卡解析、AXIS 行协议样例 |
| test/pipeline/continue.test.ts:98-178、chapter.test.ts:422 | continue 锚点先验、注入行为 |
| web BookDetailPage.test.tsx:103 | /blueprint-suggest 请求 mock（改输入 schema 必牵连） |

## 六、未找到项与已试搜索词
- freqTerms 在 planner/rewrite 任何槽的消费：未找到。
- 蓝图局部 AI 扩展端点：未找到。
- 以光谱档案生成人物卡的代码：未找到。
- 「worldview 槽约 1000 字」出处：最接近=task 槽 800（config.ts:141）/drafter worldview 20000（config.ts:105）。
