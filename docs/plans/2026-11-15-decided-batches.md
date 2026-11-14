# 拍板批次实现计划 v2（DEC-2026-1115-04 全范围，协议先行）

> **完成记录（2026-11-15，主模型独做会话，无外派）：**
> - 四阶段全部落地：A1 三级蓝图（c09002a）→ A2 拆解仿写（afaa726）→ B 蒸馏四批（bfca407）→ C 三小件（5907615）→ D UI 三卡（bef65ec）+ NSIS 0005 补行（ad088eb）。
> - 账本：215 → **262**（A1 +6 / A2 +6 / B +27 / C +7 / D 目验代测 +0）。全仓 262 测试绿（server 231 / web 29 / shared 2），typecheck×3 + eslint 绿。
> - GUI 黑盒目验：A1 三级树 8/8、A2 仿写档案 5/5、D 全页面矩阵 10/10（5 页 × 1280/1600；隔离四件套 + puppeteer-core + stub LLM）。
> - 过程修正（登记）：B 账本实际 +27（计划 +26，自评测试拆分多 1，只增不减）；`listForeshadowings` 顺带修正 snake→camelCase 映射缺陷；CLI mock 文样随 analyzeStyle 契约更新；deleteImitationProfile 空体 400 修复（补 `'{}'` 体）。
> - 悬置（本轮不做，沿用计划钉死）：imitation CLI（HTTP only）；drafter 注入（Pagekin 红线守恒）；polish 详情页入口按钮（client 方法已备，UI 未排）；0.2 发布门与四问①②依旧悬置（owner 沿用 0.1.2 发版门精神）。

**目标：** 落地 DEC-2026-1115-04 全部裁决：协议双件（三级蓝图+拆解仿写）→ 蒸馏四批 → 三小件 → UI 三卡。
**架构：** 零表重建——全部 DDL 并入单一 0005 迁移（NSIS 模板只补一次，DEC-2026-1114-05 教训）；polish run 不扩 runs.mode CHECK，用 `runs.kind` 附加列（ADD COLUMN，worker 按 kind 分支）；三级蓝图/仿写档案为新表；蒸馏结构化并入 rules_json；确认门=draft 前端态+显式入库（owner 已拍板确认门方向）。
**规格：** DEC-2026-1115-04（owner 亲决 13 项）+ discuss-distill-upgrade.md + discuss-full-pipeline-benchmark.md。

## 全局约束

- 行协议分隔符禁 JSON（DEC-2026-1111-01 #2）；新协议前缀：`VOLUME:/STAGE:/CARD:/BODY:`（三级树）、`STRUCTURE:`（结构拆解）、`TERMS:`（术语）、`SCORE:/REASON:`（自评）、`AXIS:/DIM:/RULES:`（蒸馏）。
- 分析输入规格：`sampleReferenceText(text,{segmentChars:2000,maxSegments:8})`（≈1.6 万字/次；本地 tok/s 实测 15-20 分钟/章，40 万字不可承受——决策非遗漏）。
- 每任务收尾 vitest 定向绿 + commit；账本只增不减（基线 215）。
- 现状锚点：voice-match QC 续写已接线（chapter.ts:106）；抄用检测已在 l0.ts（缺 generate referenceTexts 传参）；采样器已在 sample.ts。
- GUI 目验策略：A/B/C 阶段的 web 改动随各自阶段目验；UI 三卡（D 阶段）收尾统一全页面目验矩阵（浅色 1280/1600）。

## 阶段 A：协议双件

### A0 迁移 0005_round4_scope.sql（全轮 DDL 一次到位）
- outline_nodes(id,book_id→books,parent_id TEXT NOT NULL DEFAULT ''（repo 层管层级，不设 FK 使 UNIQUE 生效）,level CHECK('volume','stage','card'),seq,title,body,chapter_from,chapter_to,created_at,UNIQUE(book_id,parent_id,level,seq))
- imitation_profiles(id,name,source_path,source_hash,version,structure_json,style_json,blueprint_json,metrics_json,created_at)
- ALTER books ADD imitation_profile_id TEXT / ADD style_snapshot_json TEXT；ALTER runs ADD kind TEXT NOT NULL DEFAULT 'pipeline'
- **测试：** test/db 追加迁移断言（新表在、新列在、旧库 user_version 4→5 幂等）账本 +1

### A1 三级蓝图（卷→阶段→滚动卡）
- **解析：** plainproto.ts 加 `parseOutlineTree(raw) → {volumes:[{title,body,seq,stages:[{title,body,seq,cards:[{title,body,seq,chapterFrom,chapterTo}]}]}], errors}`；协议：`VOLUME: <题>` / `STAGE: <题>` / `CARD: 第<a>-<b>章 <题>` / `BODY: <文>`；STAGE 挂最近 VOLUME、CARD 挂最近 STAGE（孤儿行记 error 不抛）；章号区间正则 `第\s*(\d+)\s*[-—~至]\s*(\d+)\s*章`
- **repo：** outline.ts（新）`replaceOutlineTree(db,bookId,tree)`（事务 delete+insert，seq 归一）、`getOutlineTree(db,bookId) → 树|null`
- **路由：** `POST /api/books/:bookId/outline-tree-suggest {chapterCount 1-50}` → LLM 产树 draft 不入库（502 显性暴露沿 outline-suggest 先例）；`GET /api/books/:bookId/outline-tree`；`PUT …/outline-tree`（整树替换保存）；`POST …/outline-check {upToChapter?}` → 近 3 章摘要 vs 卡安排 LLM 语义复核 → 报告文本返回不入库
- **注入面（本轮钉死）：** outline-tree-suggest prompt 附已有上层节点上下文；drafter/assembler 本轮不动（登记后续候选）
- **测试：** parser 正例/孤儿/区间变体 +3；路由 draft 不入库→PUT 入库→GET 往返 +2；outline-check mock 报告 +1（账本 +6）
- **GUI：** BookDetailPage 大纲分区升三级树（缩进展示/AI 生成/编辑/保存/偏离复核按钮），mock 态 502 显性暴露 + 手填兜底可用

### A2 拆解仿写（Pagekin 式）
- **管线：** imitation.ts（新）`analyzeImitation(deps,{name,text,chapterCount}) → ImitationDraft`：①structure——sampleReferenceText 8×2000 → `STRUCTURE:` 5-8 行；②style——复用 analyzeStyle（批次一产出七维六轴 RULES，B 阶段先落 A2 依赖其类型，接口对齐）；③blueprint——反推 chapterCount 章 `# 章号` 块协议（复用 parseOutline 校验）；draft 不入库
- **repo：** imitation.ts repo `saveImitationProfile`（source_hash version+1 不可变）/`listImitationProfiles`/`getImitationProfile`/`deleteImitationProfile`；books 绑定 `setBookImitation(db,bookId,profileId|null)`（404 守卫沿 style 绑定先例）
- **路由：** `POST /api/imitation-profiles/analyze`、`POST /api/imitation-profiles`、`GET /api/imitation-profiles`、`DELETE /api/imitation-profiles/:id`、`PUT /api/books/:bookId/imitation`
- **注入面（本轮钉死）：** blueprint-suggest prompt 附结构摘要槽（planner 层）；drafter 不注入（Pagekin 红线：参考不混入正文）
- **测试：** 路由 analyze draft 不入库/save/list/delete/绑定 404 +4；管线 mock 三调用形态 +2（账本 +6）
- **GUI：** StyleProfilesSection 同页扩「仿写档案」分区（analyze→预览→确认→列表→绑定书）

## 阶段 B：蒸馏四批（依赖 A0/A2 类型骨架）

- **B1=T-D1 分析重构：** analyzeStyle/saveStyleProfile/parseAnalysis(AXIS/DIM/RULES 缺行容错：数值轴 0、文本轴 ''、不抛)；pickFewShotAndHeldOut（起点错开防重叠；文本<200 字 heldOut=[]）；distillStyleProfile 签名不变=analyze+save（CLI 兼容，显式 samples 优先）——账本 +4
- **B2=T-D2 HTTP 两步：** distillStyleSchema+{temperature 0-1,maxSegments 4-20}；新 styleProfileCreateSchema；`POST /api/style-profiles/distill`→200 分析 draft 不入库；`POST /api/style-profiles`→201 入库——账本 +3
- **B3=T-D3 确认门 UI：** StyleProfilesSection 三态（表单→预览编辑→列表）；shared StyleAnalysisDto；client distillStyle/createStyleProfile——账本 +2
- **B4=T-D4 模板+参数：** app_meta key `distill_template`；GET/PUT `/api/settings/distill-template`（空串恢复默认）；distill 路由接模板+temperature/maxSegments；设置页模板编辑——账本 +4
- **B5=T-D5 自评：** analyzeStyle 第二次调用 held-out 2 段，SCORE(1-5 钳制)/REASON 解析，缺行 evaluation=[]——账本 +2
- **B6=T-D6 generate drift+抄用：** generate+绑定快照 → voiceRefMetrics=快照 metrics（损坏 JSON 容错 undefined）；referenceTexts=本次注入 3 段样本（仅 generate）——账本 +2
- **B7 批次三：** persona 快照——bindStyle 时 rules_json+samples_json 复制存 books.style_snapshot_json（含 profileId/version/boundAt）；generate 读快照优先 fallback 档案现值；解绑清快照；`GET /api/style-profiles/:id/versions`（同 hash 版本列表）+ web 版本展开——账本 +3
- **B8 批次三版本视图 web** 并入 B7——账本 +1
- **B9 批次四术语表：** TERMS: 行协议入 rules_json.terms[{term,note}]；analyze 同批产出；预览编辑可改；renderStyleBlock 注入术语段（预算内截断）——账本 +2
- **B10 批次四批量校对：** POST `/api/books/:id/polish {chapterFrom,chapterTo}` → run(mode='generate',kind='polish',scope)；worker processRun 按 kind 分支：逐章三 pass（结构重构→风格一致→去 AI 化，复用 rewrite 管线三次 provider 调用，step='rewrite' attempt=pass 序号）→ 单个 revised 版本；L0 基准=快照 metrics+few-shot referenceTexts；GET /api/runs 兼容不动——账本 +3
- **CLI：** imitation CLI 本轮不做（HTTP only，登记）

## 阶段 C：三小件

- **C1 段落四操作（web only）：** SelectionRewrite 四预设按钮，instruction 精确文案钉死（续写=『从选段结尾自然续写 2-3 句，保持人称与时态』/润色=『优化选段表达，不改情节与信息量』/扩写=『在选段基础上扩写细节与感官描写，篇幅约增加一倍』/改对话=『将选段叙述改写为人物对话呈现』）——账本 +1
- **C2 伏笔 CRUD：** continuity.ts 加 create/update/delete（update resolved 须带 resolvedCh）；四路由 GET/POST/PUT/DELETE `/api/books/:bookId/foreshadowings`；BookDetailPage 伏笔分区——账本 +4
- **C3 导出格式：** exportBook(db,bookId,outDir,format?:'chapters-md'|'combined-md'|'txt')；combined=`全书.md` 章节 `\n\n---\n\n` 间隔；txt=分章无 # 行；路由 query 枚举校验；web 导出下拉——账本 +2

## 阶段 D：UI 三卡（收尾统一目验）

- **D1：** index.css @theme token 表（SubTrans 对齐：bg #F3F4F6/surface/primary #3B82F6 系/ok/warn/danger/console-bg #0F172A+五分色/space 4-32/radius 8-16/h-ctl 36/字体族）；lucide-react；AppShell rail（品牌块仅「inkforge」+分组导航+底部版本；主题切换按钮不做）；BooksPage 卡片网格+流程 chip 条——组件硬编码色值清零
- **D2：** 公共组件 Card/Badge/Chip/Console；BookDetailPage aside 运行控制卡+深色控制台（useRunEvents 五分色日志）+详情 chip 条
- **D3：** 全页扫尾 NewBook/NewBookIdea/Reader/Diff/Settings token 化；web-gui-tester 全页面矩阵目验（lessons 先调；8789 四件套；1280/1600 双分辨率；GUI 已验证注记）

## 账本

215 → A: +13 / B: +26 / C: +7 / D: +0（目验代测）≈ **261**。每 commit 点只增不减。
