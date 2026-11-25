# FB-P 卡：四反馈批合并实现计划产出

## 背景（已拍板，照抄入计划，勿重新发明）

owner 四条反馈+一项追加已全部裁决归档=docs/decision-log.md **DEC-2026-1125-03**（先读该节取全文），事实真值=docs/design/research-2026-11-25-four-feedbacks.md（>4KB，用 pointer 工具读）。SP 批已收口推送至 4a8c86f，基线起点=**818**。decision-critic 评议条件已并入裁决条目。

## 产出物

`docs/plans/2026-11-25-four-feedbacks-batch.md`：五 feature 合并一计划，任务组序=F1→F4→F3→F5→F2（同工作树串行执行卡）。格式=计划头（目标/架构/规格）+全局约束+任务表（每任务：文件精确路径带行号、Interfaces、checkbox 步骤串，每步 2-5 分钟粒度、一个动作+可核对结果；一两个文件一卡）。无 TBD、无死行。

## 钉死的决策（摘要，全文以 DEC-2026-1125-03 为准）

- **F1**：analysis.ts FREQTERMS 指令行加显式量条（每行说明 ≥30 字、须含语境/功能；保留「无则省略本行」逃生门——硬下限只对写了但不足触发，样本真无高频词不得被重试强造）；解析端 freqShortfalls 纳入 DF 同款「缺口带反馈重试一次→warning 透传」（plainproto.ts dimShortfalls 旁复制结构、analysis.ts:60-74 重试触发）。注入=**独立常注槽与 styleRules/styleDims 同族**（不受 fewShot 开关门控），FREQ_TERMS_MAX=10 不动。DF-5 自定义模板下限不变量测试随迁 FREQTERMS。
- **F4**：blueprintSuggestSchema（routes.ts:62）增可选 seed；服务端确定性合并纯函数——seed.beats 原样置前、模型补充按 trim 全等去重追加、goal 非空以 seed 为准、mustHaveBeats 沿现 PUT 并集（routes.ts:392-402 语义不动）；畸形 seed→400/忽略+warning 禁 500；前端「基于已有草稿扩展」按钮传当前 textarea JSON；expectsLanding 判定保持现状。
- **F3**：blueprint-suggest planner 槽区（routes.ts:452-459）给 worldview 独立槽预算 **~2000 字**+超截断 warning 可观测；`plotReference` 600→1500；renderBlueprintTask 移除【书籍简介】行后签名变化随迁全部调用方。
- **F5**：续写书一键批量蓝图建议——对全部无蓝图章节逐章串行生成（现状 POST /api/runs 对 blueprint-less 章 400、queue.ts:62 跳过，勿动该语义；新端点/队列形态由计划定，须过 decision-critic 已锁边界：不自动跑正文）。
- **F2**：光谱→AI 实例化人物卡。行协议禁 JSON（DEC-2026-1111-01 红线）；产物 `{name, baseSetting}`，baseSetting=JSON 对象字符串；重名草稿层 warning+单次 ≤8 张分批；未绑定书按钮禁用+指引；characters 槽 8000 超限行为带断言。

## 受牵连测试（计划必须逐文件列明处置）

research 报告 §五 D 区表全量照搬（plainproto/distill-template/distill-jobs/analysis/inject-blocks/merge/style/http-blueprint-suggest/plot/spectrum/settings-import/continue/chapter/BookDetailPage.test/StyleProfilesSection.test/DistillProfilesShell.test）；其中 inject-blocks.test.ts:51-54「renderStyleBlock 不含 freqTerms」=F1 注入必改钉（推翻裁决的测试面兑现）。

## 全局约束

- 基线只增不减起点 818；先红后绿，每 feature ≥1 条新回归例+受牵连钉值随迁不删例。
- 禁改 `apps/server/data/**`；存量档案不重蒸不迁移；fewShot 开关语义（DEC-2026-1116-01④）不动——F1 选常注族正是为了不受它门控。
- plot/spectrum/drafter「只 planner 注入」红线仅 F1 的 freqTerms 接线经 DEC-2026-1125-03 显式豁免，其余面不扩。
- GUI 归 owner 真实测试延批次收口一次做；计划须为五 feature 各列 GUI 实测点位清单（供收口呈报）。

## 验收命令（以下命令均在项目根目录执行）

1. `grep -n "30 字\|2000\|seed\|批量\|实例化" docs/plans/2026-11-25-four-feedbacks-batch.md` → 五 feature 钉值各有任务承接。
2. D 区测试清单逐文件在计划中有处置行（随迁/新增/不动三态之一）。
3. 每任务文件数 ≤2 源文件（测试另计）；自审五查在计划末尾逐条打勾留痕。

## 执行指针令

执行中读取大于 4KB 的文件用 `python C:/Users/57850/.zcode/tools/pointer_tools.py` 的 pointerize/read_pointer，禁止整读全文；本卡产出为新建计划文档，允许直接 Write。只写这一个文件，不得改动其他任何文件（含工作树既有未提交文件）。
