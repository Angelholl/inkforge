# 拍板批次实现计划（蒸馏一+二 / 流程一 / UI T-U1）

**目标：** 落地 DEC-2026-1115-03 全部裁决项。
**架构：** 零 DDL——结构化档案并入 style_profiles.rules_json（向后兼容）；确认门=HTTP distill 改纯分析不入库 + 显式 create 入库（draft 存前端态）；模板落 app_meta（key-value 既有表）；段落四操作纯 web 预设。
**规格：** docs/design/2026-11-15-discuss-distill-upgrade.md + 2026-11-15-discuss-full-pipeline-benchmark.md + DEC-2026-1115-03。

## 全局约束

- 行协议分隔符，禁 JSON（DEC-2026-1111-01 第 2 条）；AXIS:/DIM:/RULES:/SCORE:/REASON: 前缀行。
- 分析输入规格：`sampleReferenceText(text, {segmentChars: 2000, maxSegments: 8})` ≈1.6 万字/次（MirrorNovel 20×2 万为云端规格；本地 tok/s 实测 15-20 分钟/章，40 万字输入不可承受，降规格为决策非遗漏）。
- few-shot 存储=`pickFewShotSamples(text)` 12 段（现状不变）；held-out=独立均匀 2 段（起点与 few-shot 错开）。
- rules_json 形状：`{rulesText, axes?, dims?, evaluation?}`——旧档案无新键，读侧一律 `?.` 容错。
- 每任务收尾：vitest 定向绿 + commit（账本只增不减，基线 215）。
- 现状修正登记：voice-match QC 续写模式**已接线**（chapter.ts:106 修正 F2 认知）；批次二补 generate 模式基准与抄用 referenceTexts。

## 任务 T-D1：分析管线重构（server）

**文件：** Modify `apps/server/src/style/distill.ts`；Test `apps/server/test/style/distill.test.ts`（已有则追加）。
**接口：** Produces `analyzeStyle(deps, {text, temperature?, maxSegments?}) → Promise<{sourceHash, sourcePath, axes, dims, rulesText, samples, heldOut, metrics}>`（sourcePath=`inline:<hash 前 8 位>`）；`saveStyleProfile(db, {name, analysis}) → string`；`distillStyleProfile` 签名不变（=analyze+save，CLI 兼容）。Produces 类型 `StyleAxes{narrativeTemp,langDensity,humor:number(1-5); narratorStance,rhythm,emotion:string}`、`StyleDims{rhythm,dialogue,description,tone,traits,vocab,chapterStructure:string}`。
**步骤：**
- [ ] 新增 `ANALYZE_INSTRUCTION`（AXIS n=六轴/DIM n=七维/RULES 5-10 行协议模板+输出格式说明）；`parseAnalysis(text) → {axes, dims, rulesText}`（解析容错：缺行→axes 数值 0/字符串 ''，测试锁缺行不抛）
- [ ] `analyzeStyle`：采样 sampleReferenceText(2000×8) 拼分析输入；provider.complete(system:'你是文风分析师。', temperature 默认 0.3, meta.step='summarize')；heldOut/pickHeldOutSamples 内聚实现（windows 起点 floor((i+0.5)*len/count) 错开）
- [ ] `saveStyleProfile`：version=sourceHash 递增逻辑迁入；rules_json=JSON.stringify({rulesText, axes, dims, evaluation})
- [ ] 测试红→绿：①parseAnalysis 缺 AXIS 行不抛且 axes 全 0 ②analyzeStyle(mock) 返回 dims 七键 ③saveStyleProfile 同 source_hash 二次 version=2 ④旧形状 rules_json 读侧容错（getLatestProfile 返回原样）

## 任务 T-D2：HTTP 两步 API（server）

**文件：** Modify `apps/server/src/http/schemas.ts`(:64 distillStyleSchema)、`apps/server/src/http/routes.ts`(distill 路由)；Test `apps/server/test/http/style.test.ts` 追加。
**接口：** Consumes T-D1 analyzeStyle/saveStyleProfile。distillStyleSchema+`{temperature?: number 0-1, maxSegments?: int 4-20}`；新增 `styleProfileCreateSchema = {name, axes?, dims?, rulesText, samples:[{id,text}] min1 max16, heldOut?, metrics?, evaluation?, sourcePath?}`。路由：`POST /api/style-profiles/distill` → 200 `{sourceHash, axes, dims, rulesText, samples, heldOut, metrics}`（不入库）；`POST /api/style-profiles` → 201 `{profileId}`（确认门入库）。旧 `GET /api/style-profiles` 不变。
**步骤：**
- [ ] schema 扩展 + 新 schema（zod）
- [ ] distill 路由改 analyze 返回；create 路由新增（booksRepo 风格校验：samples 全空文本 → 400 '样本为空，禁止蒸馏'）
- [ ] 既有 style.test.ts 中"distill 入库"断言改两步断言；新增：distill 200 不产生 style_profiles 行；create 201 产生；create samples 空 400
- [ ] 账本 +3

## 任务 T-D3：确认门 UI（web）

**文件：** Rewrite `apps/web/src/pages/StyleProfilesSection.tsx`；Test `apps/web/src/pages/StyleProfilesSection.test.tsx` 追加；Modify `apps/web/src/api/client.ts`（distillStyle 返回类型改 StyleAnalysisDto、新增 createStyleProfile）。
**接口：** Consumes T-D2 两端点。shared 新增 `StyleAnalysisDto`（packages/shared）。
**步骤：**
- [ ] shared 类型 + client 两方法
- [ ] 组件三态：表单态→预览编辑态（六轴数值 input 1-5、七维 textarea、RULES textarea 可编辑、heldOut 自评分展示）→列表态；确认调 createStyleProfile、放弃清态
- [ ] RTL：蒸馏(mock fetch 返回分析)→预览态出现→确认→列表 +1 行；账本 +2

## 任务 T-D4：模板落库 + 高级参数（server+web）

**文件：** Modify `routes.ts`（settings 区）、`apps/web/src/pages/SettingsPage.tsx`；Test `apps/server/test/http/settings.test.ts` + SettingsPage.test.tsx 追加。
**接口：** app_meta key=`distill_template`；`GET /api/settings/distill-template → {template, isDefault}`；`PUT …{template}`（空串=恢复默认）。distill 路由读 app_meta 覆盖默认模板；请求体 temperature/maxSegments 透传 analyzeStyle。
**步骤：**
- [ ] 常量 DEFAULT_DISTILL_TEMPLATE（=T-D1 模板）导出；GET/PUT 路由（PUT 写 app_meta）
- [ ] distill 路由接模板与参数
- [ ] 测试：PUT 后 GET 回读一致；PUT 空串→isDefault true；distill 用自定义模板（mock 断言 user 含标记词）——账本 +3
- [ ] web 设置页模板 textarea+保存/恢复默认；RTL +1

## 任务 T-D5：自评 held-out（server）

**文件：** Modify `distill.ts`（analyzeStyle 内第二次 provider.complete）；Test distill.test.ts 追加。
**接口：** Consumes T-D1 heldOut。协议：`SCORE: <1-5>` + `REASON: <一句>`；解析容错缺行→不产 evaluation 项。mock 注入 `createMockProvider({summarize:{text:'SCORE: 4\nREASON: 节奏贴合'}})`。
**步骤：**
- [ ] analyzeStyle 加自评调用（temperature 0.2，meta.step='summarize'）；evaluation:[{sampleId, score(1-5 取整越界钳制), reason}] 附返回值
- [ ] mock 模式自评测试：score=4 落 evaluation；解析缺 SCORE 行→evaluation=[] 不抛——账本 +2

## 任务 T-D6：generate drift 基准 + 抄用 referenceTexts（server）

**文件：** Modify `apps/server/src/pipeline/chapter.ts`(:106 附近)；Test `apps/server/test/pipeline/`（既有 chapter 管线测试文件追加）。
**接口：** 语义钉死：generate+绑定档案 → voiceRefMetrics=JSON.parse(profile.metrics_json)（损坏 JSON→undefined 容错）且 referenceTexts=本次注入 3 段样本文本；continue 维持现状（prevTexts metrics）；referenceTexts 仅 generate 传。
**步骤：**
- [ ] chapter.ts 读绑定档案（setBookStyleProfile 已有绑定；getBook.styleProfileId）→ voiceRefMetrics/referenceTexts 双值接入 runL0Checks
- [ ] 测试：mock 档案绑书+generate 单章 → l0 check details 含 style_drift；无绑定书 → 无 style_drift check——账本 +2

## 任务 T-F1：段落四操作预设（web only）

**文件：** Modify `apps/web/src/pages/SelectionRewrite.tsx`；Test 追加。
**接口：** 四预设 instruction 精确文案（续写='从选段结尾自然续写 2-3 句，保持人称与时态'；润色='优化选段表达，不改情节与信息量'；扩写='在选段基础上扩写细节与感官描写，篇幅约增加一倍'；改对话='将选段叙述改写为人物对话呈现'）。
**步骤：** [ ] 四按钮点击→instruction 填充→提交走既有 rewrite-selection；RTL：点「润色」→请求体 instruction=润色文案——账本 +1

## 任务 T-F2：伏笔 CRUD（server+web）

**文件：** Modify `apps/server/src/db/repositories/continuity.ts`、`routes.ts`、`schemas.ts`、`apps/web/src/pages/BookDetailPage.tsx`；Test `test/http/` 新文件 foreshadowings.test.ts + BookDetailPage.test.tsx 追加。
**接口：** `createForeshadowing(db,{bookId,description,plantedCh}) → row`；`updateForeshadowing(db,bookId,id,{status?}) → boolean`（status IN open/advanced/resolved，resolved 须带 resolvedCh=当前章）；`deleteForeshadowing(db,bookId,id) → boolean`；list 已有。路由 GET(新)/POST/PUT/DELETE `/api/books/:bookId/foreshadowings`；schema `{description min1, plantedCh int≥1}`。
**步骤：** [ ] repo 三函数（deleteBook 级联已覆盖 foreshadowings 清理，无需改）[ ] 四路由+schema [ ] server 测试：POST→GET 往返、PUT resolved、DELETE 404——账本 +3 [ ] BookDetailPage 伏笔分区（列表/添加/推进/删除）；RTL +1

## 任务 T-F3：导出格式（server+web）

**文件：** Modify `apps/server/src/export/export.ts`、export 路由；Test `test/export/` 追加。
**接口：** `exportBook(db, bookId, outDir, format?: 'chapters-md'(默认|现状)|'combined-md'|'txt')`；combined=`全书标题.md`（章节间 `\n\n---\n\n`）；txt=分章 `{NNN}-{title}.txt`（无 # 标题行，首行章节名）。
**步骤：** [ ] format 分支 [ ] 路由 query `?format=` 校验枚举 [ ] 测试三格式文件名断言——账本 +1 [ ] web 导出按钮下拉三选；RTL +1

## 任务 T-U1：UI 壳（web，最后执行）

**文件：** Rewrite `apps/web/src/index.css`(@theme token 表)、`App.tsx`(rail)；Modify `BooksPage.tsx`(卡片网格+chip 条)；`package.json` 加 lucide-react。
**接口：** token 名对齐 SubTrans：--color-bg/--color-surface/--color-primary/--color-ok/--color-warn/--color-danger/--color-console-bg + spacing/radius/h-ctl；组件类硬编码色值清零。
**步骤：** [ ] pnpm add lucide-react（web） [ ] @theme 表 [ ] AppShell rail（品牌块双行/分组导航/底部版本） [ ] BooksPage 卡片网格+流程 chip 条 [ ] lint/tsc/全量 [ ] web-gui-tester 黑盒（lessons 先调；8789 四件套；全页面浅色双分辨率截图）[ ] GUI 已验证注记

## 账本

215 → T-D1 +4 / T-D2 +3 / T-D3 +2 / T-D4 +4 / T-D5 +2 / T-D6 +2 / T-F1 +1 / T-F2 +4 / T-F3 +2 / T-U1 +0（纯视觉，目验代测）= **239**。
