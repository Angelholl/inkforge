# 实现计划：剧情蒸馏（owner 拍板 A 案，DEC-2026-1120-03）

- 日期：2026-11-20
- 计划/执行：主模型亲执（owner 会话令不外派）
- 决策真值：DEC-2026-1120-03（docs/decision-log.md）
- 面向读者：未见过本规格的工程师。先读 §2 已核实事实再动手。

## 1. 目标

蒸馏工作台新增「剧情蒸馏」：原文 → 单轮 LLM 蒸剧情结构行（PLOT 协议 5-10 条）→ 预览（可编辑）→ 入库剧情档案库；书可绑定一份剧情档案，AI 建议蓝图时 planner 槽注入【剧情参考】（与仿写结构并列；drafter 不注入）。

## 2. 已核实事实

| # | 事实 | 锚点 |
| --- | --- | --- |
| F1 | analyzeImitation 形态：200 字下限、sha256 hash、sourcePath `inline:hash8`、baseReq（system 结构分析师/temp 0.3/topP 0.9/maxOutput 4096/timeout 900000/meta step summarize）、sampleReferenceText 8×2000、行协议解析 `l.trim().startsWith('STRUCTURE:')` | apps/server/src/imitation.ts:44-62 |
| F2 | 仿写五端点形态：POST /api/imitation-profiles/analyze（502 兜底）→ POST 保存 201 → GET list → DELETE 404/ok（解绑 books 引用 tx）→ PUT /api/books/:bookId/imitation 绑定（404 校验+booksRepo.setBookImitation） | apps/server/src/http/routes.ts:778-812 |
| F3 | blueprint-suggest planner 槽：imitationBrief=`【参考作品结构拆解】\nstructure.join('\n')`，slot imitationStructure budget 600 stable=false；相邻插 plotReference 同 budget | apps/server/src/http/routes.ts:237-250 |
| F4 | 迁移=文件名序自动应用（`0012_*.sql` 即生效）；0011 注释惯例含回滚说明 | apps/server/src/db/migrate.ts:11-26 |
| F5 | imitation repo：saveImitationProfile 同 hash version+1 不可变行；deleteImitationProfile tx 内 `UPDATE books SET imitation_profile_id=NULL` 防悬挂；list ORDER BY created_at DESC | apps/server/src/db/repositories/imitation.ts:31-75 |
| F6 | schema 形态：imitationAnalyzeSchema{name,text,chapterCount}、imitationSaveSchema{draft{...}}、imitationBindSchema{profileId nullable} | apps/server/src/http/schemas.ts:188-219 |
| F7 | UI 先例 ImitationProfilesSection：名称+原文表单→analyze→只读草稿预览（入库/放弃）→列表（删除三态确认+绑定书 select）；「相关书绑定已清空」文案 | apps/web/src/pages/ImitationProfilesSection.tsx 全文 |
| F8 | shared 类型直出无需构建（packages/shared exports src） | packages/shared/package.json |
| F9 | 测试基线 462（server 341+web 119+shared 2）；server 测试 mock provider 按 meta.step 分路（plot 沿 summarize 步） | apps/server/test/imitation.test.ts |

## 3. 全局约束

- 测试基线只增不减（462 起）。
- 新增通道全部与仿写同构；不改既有端点语义（blueprint-suggest 只加可选槽，零回归风险面=槽多一段文本）。
- drafter 不注入任何剧情/结构参考（Pagekin 红线，不做任何 drafter 改动）。
- UI 文案中文；删除档案必须解绑 books.plot_profile_id（无 FK 防悬挂）。
- 提交 Conventional+中文，`Refs: DEC-2026-1120-03`；单提交（一个特性原子）。

## 4. 任务

### Task 1：数据层（迁移+repo+shared 类型）
- [ ] `apps/server/src/db/migrations/0012_plot_profiles.sql`：plot_profiles(id,name,source_path,source_hash,structure_json,created_at) + `ALTER TABLE books ADD COLUMN plot_profile_id TEXT`（注释含回滚说明沿 0011）。
- [ ] `apps/server/src/db/repositories/plot.ts`：PlotProfileRow/PlotProfileDetail 类型 + savePlotProfile(db,{name,sourcePath,sourceHash,structure}) 返回 {id}（无 version，单行可覆盖语义=新档案新行）+ listPlotProfiles（DESC 含 structure）+ getPlotProfile + deletePlotProfile（tx 解绑+删行）。
- [ ] `apps/server/src/db/repositories/books.ts`：Book/toBook 增 plotProfileId（沿 imitationProfileId 映射）+ setBookPlotProfile。
- [ ] shared api.ts：PlotDraftDto{name,sourcePath,sourceHash,structure[]}、PlotProfileDto{id,name,structure[],createdAt}、PlotBindBody{profileId}。

### Task 2：蒸馏管线+端点+注入
- [ ] `apps/server/src/plot.ts`：PLOT_INSTRUCTION（钉死文案：`你是长篇剧情分析师。阅读参考文本的抽样片段，输出该书剧情结构的拆解，格式为多行 PLOT 行：\nPLOT: <一条剧情骨架判断>\n每条须指向可复用的剧情事实，例如：开篇钩子类型、卷级目标推进方式、多线交织节奏、高潮布局、收束方式、可复用桥段。输出 5-10 条，按叙事先后排序，不要其他内容。\n【抽样片段开始】`）+ analyzePlot（F1 同构：200 字校验/hash/PLOT 行解析 slice(0,10)/空抛「剧情蒸馏失败：缺少 PLOT 行」）。
- [ ] schemas.ts：plotAnalyzeSchema{name min1,text min1}、plotSaveSchema{draft{name,sourcePath min1,sourceHash min8,structure array min1 max10 of min1}}、plotBindSchema{profileId nullable}。
- [ ] routes.ts：五端点（F2 同构，analyze 502 兜底；save 201；bind 校验档案存在→booksRepo.setBookPlotProfile）。
- [ ] blueprint-suggest：plotBrief=`【剧情参考】\nstructure.join('\n')`，slot `plotReference` budget 600 插在 imitationStructure 之后（F3）。

### Task 3：前端（client+区块+挂载）
- [ ] client.ts：analyzePlot/savePlotProfile/listPlotProfiles/deletePlotProfile/bindPlot（沿仿写五方法形态）。
- [ ] `apps/web/src/pages/PlotProfilesSection.tsx`（F7 同构差异点：①预览结构行用 textarea join('\n') 可编辑，入库 split('\n') 过滤空行；②列表项直接展开 structure 行供查看参考；③文案「剧情蒸馏」/「PLOT 行」）。
- [ ] DistillPage 在 `<StyleProfilesSection />` 后挂 `<PlotProfilesSection />`。

### Task 4：测试
- [ ] server `apps/server/test/plot.test.ts`：①analyzePlot 解析（mock summarize 返回 6 条 PLOT 行→draft.structure 6 条、hash 前缀 inline:）②无 PLOT 行抛错③200 字下限抛错④save/list/delete+解绑（造书绑定后 delete → book.plotProfileId null）⑤http 层 bind+blueprint-suggest 注入（捕获装饰器断言 user 含【剧情参考】与某条结构行；含仿写并列时两段都在）。
- [ ] web `apps/web/src/pages/PlotProfilesSection.test.tsx`：①表单校验（空名/短文）②analyze→预览→编辑结构行→确认入库（POST body 断言）③列表渲染结构行+绑定书流程④删除三态确认。
- [ ] 定向跑两组绿。

### Task 5：收口
- [ ] lint/typecheck/全量（≥462 只增不减）/build:web/audit --prod。
- [ ] decision log 执行留痕补记；提交；远程核对→push→ls-remote。

## 5. 自审五查

1. 规格覆盖：拍板五点①迁移②analyzePlot③五端点④plotReference 注入⑤UI 区块 → Task1-3；测试 Task4。
2. 步骤唯一：指令文案/槽名/端点/类型/文案钉死。
3. 类型一致：PlotDraftDto/PlotProfileDto/plotProfileId 命名前后一致；slot 名 plotReference。
4. 隐含输入：无 PLOT 行/短文/删除悬挂绑定/坏请求 schema——测试覆盖。
5. 比例：契约+差异点清单（同构处引用先例锚点不抄写）。
