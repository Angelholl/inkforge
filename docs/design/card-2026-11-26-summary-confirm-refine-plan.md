# 计划卡 | 补摘要确认弹窗 + 设定集精炼按钮（2026-11-26；预算账经 owner 改判只记录不动手）

## 0. 执行指令（卡面四条）
- 本卡为**计划任务卡**：产出一份实现计划 `docs/plans/2026-11-26-summary-confirm-refine-budget.md`，除此之外不改工作树任何文件。
- 读取大于 4KB 的文件用 pointer tools（`python C:/Users/57850/.zcode/tools/pointer_tools.py read_pointer <path>`），禁整读全文；本卡锚点已足够写计划，按需抽验即可。
- 计划格式与粒度照 §6；自审五查通过才交。
- 交付 = 计划文件 + exec.v1 契约；报告结构=结论先行+证据（path:line）+未找到项与已试搜索词。

## 1. 需求原文（真值）
- A1（owner）：章节点击补摘要无反应。
- A2（owner）：补摘要功能点击后应由 LLM 大模型生成，再由用户编辑确认（确认后才落库）。
- B（owner）：项目添加精炼功能——设定集导入时 40475 字超 20000 预算。
- C（owner 问答引申）：假设模型上下文 64K，字数上限应为多少。

## 2. 已拍板决策（**四项全部 owner 裁决完毕 2026-11-26：D1=追认 B 加强版，D2=追认本批顺手修，D3=亲裁不开任务靠模型自适应，D4=改判为单次+分块 map-reduce 兜底**；critic 评议已通过）
- **D1 弹窗范围=B 加强版**：SUMMARY 可编辑（落库前压单行+长度上限）；BEATS 只读折叠；THREADS/STATE 只读展示但**每行可勾选剔除**并标注生效结果（将回收哪条/将新埋/未匹配将被忽略/未匹配人物卡不会写入）。不做 STATE/THREADS 自由文本编辑。
- **D2 伏笔复活本批顺手修**：planted 改为与全书同名伏笔比对含已回收项；先写钉现状测试再改行为。
- **D3（owner 亲裁 2026-11-26）：预算上限不需要手动调，以模型自适应来做调节**——已知问题仅记录不修：`chapter.ts:162 totalBudget=contextWindow-maxOutput-500` token 窗当字符数混用；`pickBudgetProfile`（config.ts:150-152）无调用方未接线。现有输出侧自适应（budget.ts，上一批实现，按 provider 实际窗口 clamp）即为调节机制；worldview 预算常数保持 20000 不动。计划里把这些列为「已知账、本批不动」注记即可，不开任务。
- **D4（owner 改判 2026-11-26）：精炼=单次 LLM + 分块 map-reduce 兜底**：导入面板 preview→apply 之间插「AI 精炼」，整篇压到预算内回填可编辑字段；大窗口 provider 走单次直精，输入超阈/小窗口模型走分块压缩-合并。计划真值由增补卡修订（T7/T8/T9+映射+自审）。

## 3. 已核实事实（三轮调研+critic 读码复核，锚点可直接引用）

### A 链路
- 前端：按钮 `BookDetailPage.tsx:1100`（仅 isOriginal 章渲染，依据 DEC-2026-1113-05=decision-log.md:139；回归测试 `BookDetailPage.test.tsx:185-196`）→ `summarize()` :709-717 全程 await 同步调用；Button 支持 loading（ui.tsx:96/129/143-160，loading 保留可访问名并禁用）但未传；msg 条在页面底部 :1205；错误抛原始 message 未走 apiErrorText（:715，client.ts:77-88）。
- 路由：`routes.ts:1489-1504` POST /summarize；活 run→409 英文 `book has active run`（:1494-1495）；无 currentVersionId→404 'not found'（:1493）=第三种静默情形；唯一前端消费者 client.ts:269（req 无超时 :67-74）。
- 生成：`summarize.ts` LLM 调用 :22-31（summarizer 角色，注入缝 app.ts:17-18/41 `state.summarizerProvider ?? createRoleProvider`）；解析 :32-35 空 SUMMARY 抛错（现仅解析层有测试 plainproto.test.ts:110-114）；写库三段裸执行无事务：摘要 upsert :36-42 / STATE 浅合并 :49-58（try 吞 JSON.parse+写入全部异常，非对象 JSON 未校验——`张三="死了"` 会展开成字符索引对象入库）/ THREADS :60-81（**planted 只与未回收伏笔比对 :61/:71 → 重摘要旧章复活已回收伏笔**）。emit 未使用、signal 入口已有（:30）。
- 超时共用键：config.ts:201 summarize=1200000 **同时供大纲偏离复核**（routes.ts:705）——本批不动。
- 调用方仅两处：编排器 `chapter.ts:449-456`（ensureStep :447→调用→finishStep :457→finalize :463；catch :458-462 finalOutcome=done 上抛整 run 失败、needs_human 吞掉照常 finalize）+ 手动路由。**拆法已定**：保留 `runSummarizeStep` 原名做组合壳（内部 generate→commit），chapter.ts **一字不改**；新增 `generateSummarize`（LLM+解析零写库，空 SUMMARY 抛错，**必须保留 meta.step='summarize'**——mock 按步名路由：llm/mock.ts、generate-drift.test.ts、routing-e2e.test.ts）与 `commitSummarize`（纯事务写入）。失败语义不区分，用测试钉住现状两条路。
- 手动路径两段式：POST /summarize → generate 返回结构体+baseVersionId **不落库**；新增 commit 端点接收编辑后载荷单事务落库。commit 入口三项校验放路由层（照融合门 confirm 先例 routes.ts:1469-1487）：①书/章存在且 currentVersionId==generate 返回的 baseVersionId，不等 409（**必填字段**，不学融合门的可选指纹；版本只增不改 chapters.ts:189，版本号即可、无需哈希）②活 run 409 与 generate 同口径 ③zod 校验载荷：summary 非空/单行/有上限、stateJson 纯对象。陈旧校验**不得进共用 commit**——流水线在 finalize 前提交时 currentVersionId 还是旧值（chapter.ts:454/463/501）。
- 前端交互下限（critic 条件三）：按钮 loading+在途文案+已等待秒数；取消按钮做（服务端断连即中止，signal 入口已有、generate 零写入所以安全）；**同时只允许一个补摘要在途**，其余按钮禁用。失败文案出现在弹窗或按钮旁。
- 下游数据面：chapter_summaries 表 0001_core.sql:25-27；upsert continuity.ts:30-36；读者=getRecentSummaries :41-45→:176 注入最近 3 章（**不联 chapters 表**——已删章节的残留摘要会继续进后续章提示词，只有删整书才清得掉 chapters.ts:328-343）；beats_json/open_threads_json **无任何服务端读者**；character_states 取该章之前最新行（:143-151）、STATE 无事后修正 UI/API。
- GUI 黑盒必须真模型或带延迟 mock——补摘要此前只在 mock 秒回态验收过（docs/baseline/gui-verification-0.2-entryA.md:13），等待态缺陷从未被看见。

### B 精炼
- `SettingsImportPanel.tsx` preview 字段全部可编辑：description textarea :155-161、计数器绑 draft 值 :90（`charCount(draft.description.length, 20000)`）；apply **整包回传用户编辑后的 draft**+原始 content（:76-80）；服务端 routes.ts:251-270 直接消费 d.description 建书，zod schemas.ts:310-319 `description default ''` 可覆盖。
- `refineForDescription`（settings-import.ts:215-244）是确定性剥噪**不减散文字数**；阈值三处副本硬编码（settings-import.ts:12 / config.ts:107,148 / panel :9），警示非阻断。
- 角色现五个无 refiner（config.ts:5）；新增动三处：:5 联合类型、:94-98 env 键 `INKFORGE_ROLE_REFINER`、:178-184 默认表；factory 索引访问无需改；**前端无角色选择器**（纯服务端 env，默认 local）。加 timeouts 键要动 shared StepName（domain.ts:17）——硬编码 timeout 先例 120s/180s（routes.ts:518/1332），重文本走 config.timeouts；**端点形态三选一由计划定死**：502+errors / catch 降级 degraded（融合门 :1324/:1354）/ 无 catch 框架默认。
- 输入容量：local provider contextWindow=524288（config.ts:162）、cloud=200000（:173）；40K 中文字≈53-61K token——单次精炼必须跑大窗口 provider，计划写明约束。
- 精炼 prompt 要求：保留规则/约束/人物关系网，压缩叙述；输出目标=预算内（20000）。

### C 预算账（owner 亲裁：本批不开任务，仅注记）
- 装配收缩机制现状备查：assembler.ts:18-26 head slice、:35-43 超总预算按最大 volatile 槽迭代收缩 10%；draft 槽合计≈38500（config.ts:105-117），totalBudget=chapter.ts:162。混用账与未接线问题见 D3，计划列「已知账」注记。
- 执行者动代码前实测 server/web/shared 三处测试基线数，只增不减（A/B 任务通用）。

## 4. 测试清单（critic 第 5 项全表，计划须逐条挂到任务）
服务端：generate 零写入（四张表行数不变）；commit 四段齐写、中途失败四段零写入回滚；非法 stateJson 行跳过不影响整步、非对象 JSON 拒收；空 SUMMARY generate 抛错→手动路由可读错误（502 惯例 :539）；流水线 done 下两种失败都上抛不 finalize、needs_human 下都吞掉照常 finalize；路由 404/409×2（活 run、陈旧 baseVersionId）/400；伏笔复活先钉现状测试再改断言。
前端：在途 aria-busy 不可点、再点其他章被忽略；弹窗各段渲染断言；编辑后文本原样进 commit payload；取消不调 commit；失败文案位置。
迁移不删：import.test.ts:129-150 两例（钉的是一次性语义，POST /summarize 语义变更须同步改）、summarize.test.ts:55-121、plainproto.test.ts:110-114、BookDetailPage.test.tsx:185。计划写明：POST /summarize 唯一消费者=client.ts:269，同包发布无兼容期。

## 5. 拆卡与通道
- 一卡一两文件；**routes.ts 会被 A、B 两卡的端点接线段共动（config.ts 由 B 动）——各卡改动文件集互斥否则串行，计划给出拆法**。
- 禁入并行卡型=核心路由重构/数据库迁移（若某卡落此，标注走 ZCode Agent/主审亲持）；其余执行卡在 hy4 限时窗内派 opencode/hy4-flash-free。
- GUI 变更提交前 web-gui-tester 黑盒（延迟 mock 或真模型），提交信息注明 GUI 已验证/未验证；推送前 code-review（≥3 文件或 ≥100 行）。

## 6. 计划格式与粒度（writing-plans，逐条执行）
- 头三件套：目标一句话 / 架构两三句 / 规格=本卡 §1+§2。全局约束逐条精确值照抄。
- 每任务=文件（Create/Modify 带行号/Test 精确路径）+接口（Consumes/Produces 用签名说话）+checkbox 步骤串；2-5 分钟粒度，一步一动作一可核对结果。测试步含测试名+断言+规格值内嵌为代码；代码步含精确签名+落点，函数体只出现在签名和测试都定不了的算法处；验证步写命令+看到什么算过。
- 死行禁入：TBD/处理边界情况/加合适的校验。引用他任务指向 Interfaces 块不重复代码。
- 自审五查（规格覆盖/步骤唯一性/类型一致/五类咬人输入各配一测/比例）写「通过」于计划末尾，发现问题就地修。

## 7. 验收命令（均在项目根目录执行）
1. `ls docs/plans/2026-11-26-summary-confirm-refine-budget.md` 存在且含头三件套+全局约束节
2. `grep -c "^## 任务" docs/plans/2026-11-26-summary-confirm-refine-budget.md` ≥2（A/B 各至少一任务；C 不开任务只入「已知账」注记节）
3. D1/D2/D4 三项决策在计划中逐条可指到实现任务，D3 以「已知账、本批不动」注记呈现；§4 测试清单每条挂到具体任务无遗漏（仅适用于 A/B）
4. 拆卡表满足 §5 文件互斥或标注串行/通道归属
5. 计划末尾含自审五查通过记录
