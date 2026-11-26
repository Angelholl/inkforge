# 卡面：输出预算与续写拼接回路 实现计划卡（计划撰写，不写代码）

## 任务性质

本卡只产出一份实现计划文档，落盘 `docs/plans/2026-11-26-output-budget-stitch.md`。禁止改动任何代码文件。计划交 owner 审后另批派执行卡。

## 背景与根因（已定案事实，写计划直接引用，勿再推翻）

事故现场：书《阿美》(books.id=e1947ab1-f0d1-43eb-b032-00a94eb5caf3) 第 7 章 generate run（runs.id=0d8d80bf，2026-11-26 04:23，max_rounds=2），模型 swift-iq3_xxs（local provider），目标 6000 字。owner 报五症状：①无结尾中断；②剧情单薄；③大量重复+内容矛盾；④描写严重冲突（第一人称男性主角被写有女性器官）；⑤实际仅 ~2500 字。

根因链（全部有 DB/QC 记录实锤）：

1. **症状①⑤同一根因＝输出 token 上限**：`apps/server/src/config.ts:163/:174` local/cloud `maxOutput: 8192` 硬编码。三次生成调用（draft、rewrite r1、r2）completionTokens 全部正好 =8192（顶格铁证），该模型中文约 3.2–3.3 token/字 → 单次输出天花板 ≈2500 字，6000 目标在 token 层结构性不可达。终稿停在半截拟声词「啪」。
2. **截断静默**：finishReason（stop_reason）已在 provider 层采集（`src/llm/anthropic.ts:75` JSON 路径、`:109/:123/:128` 流式 message_delta），类型字段存在（`src/llm/types.ts:19`，mock `src/llm/mock.ts` 同源返回），但全 src 无任何调用方读取；draft/rewrite 调用点（`src/pipeline/chapter.ts:254/:379`）只取 text+usage。管线把半截稿当完整稿送 QC → rewrite 轮对不可能达成的目标空转两轮烧钱，gate 判 needs_human（行为本身正确）。
3. **症状②＝非蓝图不足**：蓝图 goal+5 beats+1 H 必含节拍，qc#2/#3 beat_coverage 全过——节拍都写到了；单薄感是顶格压缩后靠重复注水撑出来的副作用。字数控制现状：prompt 软约束（`src/prompts/render.ts:9`「以 ${targetChars} 字为目标…0.9-1.1 区间；1.2 倍绝对上限」）+ L0 length 事后检查（±20% band，`src/quality/l0.ts:140-144`，hardFail `:223`），无 token 层换算。
4. **症状③④＝小模型能力＋注入污染**：IQ3_XXS 极限量化档 CJK 长篇典型句式回环（L1 三轮均点「同构短句原地打转」「大段复现灌水」；机械 n-gram 检查 replay/tail/echo/plagiarism 全部只测对源文不测内部自重复，故 pass=0.000）。叠加：本书 6 张人物卡全是设定集群像原型（杜小满/林知蘅/贾仲良/赵启帆/郑守拙/马春桃），第 1–6 章正文中一个都没出现；真正的主角/阿美/阿泰无卡。draft#1 L1 blocker：偷情双方被写成赵启帆+马春桃、卡片细节「厚眼镜」「计算器挂件」原样入文。ch2–6 无摘要（chapter_summaries 仅 ch1/ch7 两行）→ continuity 槽薄，qc#3 major「阿泰身份来源未交代」（实为 ch6 出现 72 次的房东）。融合快照=仙家(34)+斗罗大陆(33)+舍友(33)三档案、style_fewshot_on=1，源文女性 POV 句式带进男性第一人称（style_drift 三轮全 fail：去重字符比 cur 0.14–0.20 vs base 0.01）。
5. **现场数字**：L0 length 三轮 charCount=2231/2369/2472，band ±1200；promptTokens 仅 4657–4933（注入不过载）；run_steps.qc output_json 存 {l0,l1,gate} 全文可查。

## Owner 已拍板四项（计划必须照此拆任务，不得改主意）

- **D1 自适应输出预算**：maxOutput 按目标字数估算（token/字比率＋余量），**上限 512000**。实现约束（主模型定）：config.ts local contextWindow 硬编码 524288，但当前在线模型 iq3_s（Qwen3.8-Flash-Next IQ3_S）实测 n_ctx=393216——预算必须 clamp 到 min(上限, 模型真实窗口 − prompt − 安全余量)，防服务端拒收。比率与余量的精确值由计划定死（参考实测：iq3_xxs ≈3.3 token/字；跨档比率不同需留裕度）。
- **D2 截断处置＝续写拼接回路**：stop_reason=max_tokens 时从断点续写、段间自然边界拼接，而非整篇 rewrite 空转；finishReason 落库（优先 JSON 字段通道：chapter_versions.params_json / run_steps.output_json，避免新迁移——若计划判定必须加列，该任务标注「数据库迁移＝禁并行卡型」单独成卡）。
- **D3 characters 槽护栏**：draft/rewrite 的 characters 注入槽只注入本章蓝图涉及人物；蓝图关键人物无卡时给警告（落点 `src/pipeline/chapter.ts:226-229` 附近，具体形态计划定）。本书补三张主角卡＋ch2–6 批跑 summarize 属 owner UI 操作，不进代码任务。
- **D4 模型**：主生成已切 iq3_s（owner 已改 ~/.inkforge/config.json STRATA_MODEL），非代码任务；计划收尾安排「数据补齐后重跑第 7 章」作为批次验收点位（owner 真实测试口径：agent 只保证卡级验证链跑绿）。

## 计划格式硬要求（writing-plans 纪律摘要）

- 文档头：目标一句话／架构两三句／规格＝本卡路径。全局约束逐条精确值照抄：测试基线 server 840 / web 201 **只增不减**；修 bug/改默认值必带先红后绿回归测试；Conventional 前缀＋中文提交正文含 verify:；执行者只 commit 不 push。
- 每任务：文件（Create/Modify 带行号/Test 精确路径）＋接口（Consumes/Produces 精确签名）＋checkbox 步骤串，2–5 分钟粒度、每步一个动作＋可核对结果；测试步含测试名与断言、精确值内嵌。无 TBD 死行。
- 自审五查：规格覆盖／每步唯一可写／前后签名一致／最可能咬人的未覆盖输入类各配一测（建议至少含：短章小预算不回归、续写段接缝不重复拼接已写内容、护栏不误删蓝图人物卡、mock provider 路径 finishReason 兼容、顶格但无 stop_reason 的旧云端行为）／比例适当。
- 涉及 GUI 展示变化（如截断警告上屏）的任务标注「提交前 web-gui-tester 黑盒验证」。

## 可复核锚点（验收时主审会 grep 复验）

config.ts:163/174 maxOutput；anthropic.ts stop_reason 三处采集；types.ts finishReason；chapter.ts:254/:379 调用点与 :226-229 characters 槽；l0.ts length/band；gate.ts rewrite→needs_human；render.ts targetChars 行；0002_runs.sql partial_outputs。

## 验收命令（均在项目根目录执行）

1. `ls docs/plans/2026-11-26-output-budget-stitch.md` 存在且含文档头三段＋全局约束节。
2. 逐任务核对：文件/接口/步骤齐、每步唯一可写、测试锚点精确；grep 上述锚点行号与实际代码一致（行号漂移≤5 行内可接受，超出须修正计划）。
3. D1–D4 四项拍板各有至少一个任务承接，无遗漏无越权改动清单。
