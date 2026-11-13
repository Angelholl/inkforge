# 墨炉（Inkforge）入口 B 生成模式实现计划（2026-11-14）

**目标：** 意向书入口 B 落地——新书 TAB（`/new`）从占位页升级为真实三步向导：①书名 + 世界观/角色卡/规则 + 章节数 → 建书并生成全书蓝图（一次 LLM 调用，行协议）→ ②蓝图审阅（逐章采用/编辑）→ ③批量落蓝图并发起 generate 模式 run（1..N 章）跳 `/runs/:runId`。生成过程复用 0.1 既有管线（蓝图→逐章生成→L0/L1 质检→门控→重写→连续性摘要），风格档案绑定走书详情既有入口（generate 模式自动注入）。

**规格路径：** DEC-2026-1113-07 第 2 条（owner 指令「立项功能全部落地」覆盖四 TAB 计划 T-02 占位）；意向书 docs/intent/novel-pipeline.md 入口 B；架构沿 DEC-2026-1111-01（分隔符纯文本协议，iq3_xxs JSON 不可靠——**全书蓝图输出禁用 JSON**）。

---

## 一、路线决策（唯一选择）

### D1 全书蓝图协议：行协议分块（`# <章号>` 分块 + 块内 GOAL/BEATS/HOOK），不用 JSON
理由：DEC-2026-1111-01 第 2 条钉死分隔符纯文本；0.2-T07 实证单章 GOAL/BEATS/HOOK 行协议 + parseBlueprint 已在场；全书输出 = N 个同构块，按 `# <n>` 切块后逐块复用 parseBlueprint，解析器只增不改（0.2 禁改令口径延续）。mock 探针（T-07 目验）证实 mock summarize 文样无 GOAL/HOOK 行 → 502 显性暴露路径正确，修复不入本轮（真模型窗口验证）。

### D2 一次调用生成全书蓝图，不做「先章纲再逐章精化」两级流水
理由：N≤50、单章蓝图 ~80 字，全书蓝图 ≤4000 字 ≈ 单次输出上限内；两级流水 = N 次调用 × 20 章 ≈ 挂机时段级时延，违背「蓝图勾画 → 一键开跑」的入口 B 体验；章级修编兜底已有（书详情蓝图编辑 + 单章 blueprint-suggest）。

### D3 世界观存储：books.description 直存，零迁移
F 证：`renderBlueprintTask` 已消费 bookDescription（routes.ts:131）；draft 预算含 worldview 槽（config.test.ts:27 worldview 1000）——生成期世界观自动入槽。入口 B 的世界观/角色卡/规则全文 = description，无需新表新列。

### D4 绑定 UI 不进向导：延续四 TAB 计划 D5（绑定是每书上下文动作，留在书详情）
发 run 前可先去书详情绑档案再回来发起；generate 模式注入为管线既有行为（style_sample_ids）。

## 二、探查结论（文件:行号实证）

- F1 `parseBlueprint`（plainproto.ts:143-190）：GOAL/BEATS(- 条目)/HOOK 行解析，MAX_BLUEPRINT_BEATS=6，容忍 CRLF/围栏/空行；errors: 缺 GOAL/缺 BEATS/HOOK 并入 beats 末。
- F2 blueprint-suggest 端点（routes.ts:115-165）：BuildAppOptions.plannerProvider 注入缝（:53）、槽装配 assembleContext、baseReq 钉 temperature 0.3/timeoutMs 180000/meta.step='summarize'、repair 一次、502 显性暴露——outline-suggest 全套沿用。
- F3 renderBlueprintTask（render.ts:90-108）：协议与负约束前置保 300 字预算；PLANNER_HARD_RULES 槽在 routes.ts:137。
- F4 配置：BUDGETS_PLANNER（config.ts:118）静态常量、budgets 类型 :56-62、config.test.ts 逐 key 深等（新增 outline key 零破坏）。
- F5 shared api.ts：BlueprintPutBody :108、BlueprintSuggestBody :114、CreateRunBody :122（mode 已备）；client.ts putBlueprint :40、suggestBlueprint :50、createRun :55。
- F6 web：NewBookIdeaPage.tsx 占位页（静态 JSX + 1 用例）；NewBookPage.tsx:130 createRun({mode:'continue'}) 先例；测试夹具 stubFetch 模式照 SettingsPage.test（method 分支）。
- F7 基线实测（本日）：shared 2 / web 19 / server 173 = 194 全绿；lint/typecheck/build 全绿。

## 三、任务

### 任务 EB-1：shared 类型 + client 方法 + parseOutline + renderOutlineTask + config（server 红绿）

**文件：** Modify `packages/shared/src/api.ts`（+`OutlineSuggestBody {chapterCount:number}`、`OutlineItemDto {chapterNo:number; blueprint:ChapterBlueprint}`）；Modify `apps/server/src/llm/plainproto.ts`（+parseOutline 只增）；Modify `apps/server/src/prompts/render.ts`（+renderOutlineTask）；Modify `apps/server/src/config.ts`（+OutlineBudgets {hardRules:300; worldview:5000; task:600}，BUDGETS_OUTLINE 常量，budgets.outline）；Modify `apps/server/test/prompts/contract.test.ts`（+2）；Modify `apps/server/test/config.test.ts`（+1）。

**接口（钉死）：**
```ts
// plainproto.ts
export interface ParsedOutline { outline: Array<{ chapterNo: number; blueprint: ChapterBlueprint }>; errors: string[] }
export function parseOutline(raw: string, expectedCount?: number): ParsedOutline;
// 行为：`# <n>` 行切块（全角＃容忍）；块内 parseBlueprint；块错 → `第n章: <err>` 前缀；
// expectedCount 给定时缺块 → `缺少第n章块`；n 非连续/重复不报错（按 n 排序去重首现）
// render.ts
export function renderOutlineTask(args: { bookTitle: string; worldview: string; chapterCount: number }): string;
// 输出钉死含：【任务】为《书名》拟全书 ${chapterCount} 章蓝图（第 1..N 章，每章一块）、
// 【输出格式】每章以 `# 章号` 行开头，块内 GOAL:/BEATS:/HOOK: 同单章协议、
// 负约束（不输出 JSON/markdown/解释；不得复述世界观原文；每块必须含 GOAL/BEATS/HOOK）、【世界观】全文
```
- config：`export interface OutlineBudgets { hardRules: number; worldview: number; task: number }`；`BUDGETS_OUTLINE: OutlineBudgets = { hardRules: 300, worldview: 5000, task: 600 }`；budgets 类型 + `outline: OutlineBudgets`；返回对象 + `outline: BUDGETS_OUTLINE`。

**步骤：**
- [ ] 先红 contract.test.ts +2：`'parseOutline：两块合格文样往返（块内 GOAL/BEATS/HOOK 逐条）'`；`'parseOutline：缺第2章块 → errors 含「缺少第2章块」且首块蓝图仍收'`。→ 红。
- [ ] config.test.ts +1：`'budgets.outline 钉值'`（toEqual {hardRules:300, worldview:5000, task:600}）。→ 红。
- [ ] 实现 parseOutline/renderOutlineTask/config → 绿：`vitest run test/prompts/contract.test.ts test/config.test.ts` → **8+7 passed**。
- [ ] shared 类型 + client.suggestOutline（`req<OutlineSuggestResult>('/api/books/${bookId}/outline-suggest', ...)`，OutlineSuggestResult = `{ outline: OutlineItemDto[]; source: 'llm' }`）→ `pnpm --filter @inkforge/shared build`（如脚本存在；否则 typecheck）+ web typecheck 绿。
- [ ] commit：`feat(server): parseOutline/renderOutlineTask 与全书蓝图配置档（入口 B 一）`。

### 任务 EB-2：outline-suggest 端点（server 红绿）

**文件：** Modify `apps/server/src/http/schemas.ts`（+outlineSuggestSchema `z.object({ chapterCount: z.number().int().min(1).max(50) })`）；Modify `apps/server/src/http/routes.ts`（+端点）；Create `apps/server/test/http/outline.test.ts`（+2）。

**接口（钉死）：** `POST /api/books/:bookId/outline-suggest {chapterCount} → 200 {outline, source:'llm'} | 404 | 502 {error:'outline parse failed', errors}`。行为：槽 = hardRules(PLANNER_HARD_RULES)/worldview(book.description)/task(renderOutlineTask)，预算 budgets.outline；baseReq 同 F2（temperature 0.3、timeoutMs 180000、meta.step 'summarize'、meta.chapterNo=1）；parseOutline(raw, chapterCount) → errors>0 repair 一次 → 仍败 502。

**步骤：**
- [ ] 先红 outline.test.ts +2：`'outline-suggest：注入 mock planner → 200 且两章蓝图逐章 goal 非空'`（buildApp 传 plannerProvider，mock script text=`# 1\nGOAL: ...\nBEATS:\n- ...\nHOOK: ...\n# 2\nGOAL: ...\nBEATS:\n- ...\nHOOK: ...`；断言 outline.length===2、source==='llm'）；`'outline-suggest：不存在 bookId → 404；chapterCount=0 → 400'`。→ 红。
- [ ] 实现端点 → 绿（outline.test 2 passed）；`vitest run test/http` 全绿。
- [ ] commit：`feat(server): 全书蓝图 outline-suggest 端点（行协议分块 + repair 一次）`。

### 任务 EB-3：新书向导三步（web 红绿 + GUI 黑盒）

**文件：** Rewrite `apps/web/src/pages/NewBookIdeaPage.tsx`（占位 → 真实向导，导出名不变）；Rewrite `apps/web/src/pages/NewBookIdeaPage.test.tsx`（占位 1 例 → 向导 2 例）。

**接口/流程（钉死）：**
- step1：书名 input（placeholder 书名）、世界观 textarea（placeholder `世界观 / 角色卡 / 规则（越具体越好）`）、章节数 input type=number min=1 max=50 默认 8、按钮 `建书并生成蓝图`；点击 → api.createBook({title, description: worldview}) → api.suggestOutline(bookId, {chapterCount})（loading 文案 `蓝图勾画中…约需数分钟`）→ 成功进 step2；失败行内展示。
- step2：逐章卡（`第N章 goal` + beats 逐行 + 复选框 `采用` 默认全选 + `编辑` 展开 textarea 预填该章 blueprint JSON）；按钮 `保存蓝图并继续（N/M 章）` → 逐采用章 api.putBlueprint(bookId, n, {title:`第${n}章`, blueprint, targetChars:3000}) → step3。
- step3：文案 `将从第 1 章生成到第 N 章。生成可在书详情页绑定风格档案（生成模式注入）。`；按钮 `发起生成（1..N）` → api.createRun({bookId, mode:'generate', fromChapter:1, toChapter:N}) → navigate(`/runs/${runId}`)；502 outline 未获蓝图时 step2 顶部行内错误 + 提示「可到书详情页手填蓝图后从书架发起」。

**步骤：**
- [ ] 先红：用例 1 `'新书向导：建书并生成全书蓝图后进入审阅'`（stub fetch：POST /api/books → {id:'b1'}；POST /outline-suggest → 两章 outline；断言两章卡渲染 + goal 文本可见）；用例 2 `'新书向导：采用全部蓝图后 PUT 逐章落库并 generate 发起'`（点保存 → 断言两次 PUT /api/books/b1/chapters/1|2/blueprint 调用 → 断言 POST /api/runs body {mode:'generate', fromChapter:1, toChapter:2}）。→ 红。
- [ ] 实现向导 → 绿（2 passed）；web 全量 ≥ 20（19 +1 净增：占位 1 例换向导 2 例）；typecheck 绿。
- [ ] **GUI 黑盒目验**（8789 mock 隔离，沿用 T-07 环境与 Chrome CDP）：走通 step1 建书+生成蓝图（mock 502 显性暴露截图）→ 手填蓝图兜底走书详情 → 从书架发起 generate run → /runs/:runId；结论存 `docs/baseline/gui-verification-0.2-entryB.md`。
- [ ] commit：`feat(web): 新书 TAB 入口 B 三步向导（设定→蓝图审阅→发起生成）`（GUI 已验证）。

### 任务 EB-4：收口验证链

- [ ] `pnpm -w lint && pnpm -w typecheck && pnpm -w test` → 全绿；总量 200 = 2 + 20 + 178（server 173+2 contract+1 config+2 outline）。
- [ ] `pnpm build:web` → 成功。
- [ ] commit（如有微调）：`test: 入口 B 收口验证链`。

## 四、账本（基线 194 → 200）

```
server 173 ─EB-1 +3→ 176 ─EB-2 +2→ 178；web 19 ─EB-3 +1→ 20；shared 2 不变；全量 200
```
每个 commit 点用例数 ≥ 前一 commit 点。

## 五、约束

1. 版本冻结 0.1.2（DEC-2026-1113-03 口径）；禁 `git add -A`；commit 正文 verify + Refs: DEC-2026-1113-07。
2. mock 态下 outline-suggest 必然 502（R7：mock summarize 文样非蓝图协议）——GUI 目验以「502 显性暴露 + 兜底路径可用」为准，真模型验证并入后续窗口（Strata 在线时）。
3. 8787 生产服务与在跑物证零触碰；GUI 环境一律 8789 + 临时 data 目录。

## 六、自审五查

1. **规格覆盖**：意向书入口 B 三要素（预设世界观/角色卡 → 蓝图勾画 → 全新生成）→ EB-1（协议+配置）→ EB-2（勾画端点）→ EB-3（向导三步）；「全新生成」复用 generate 管线（0.1 已验收）。
2. **步骤唯一可核**：每步带命令与期望数（8+7、2 passed、≥20、200）。
3. **签名一致**：parseOutline/renderOutlineTask/OutlineBudgets 三处同名同形；OutlineSuggestResult 与端点返回同形；createRun body 与 CreateRunBody 同形。
4. **输入类测试**：空/缺块（parseOutline 缺块报错）、越界（chapterCount 0→400）、502 显性（EB-3 步骤 4）、mock 502 兜底（R7 注记）。
5. **比例**：3 任务覆盖 5 src + 4 test + 2 shared/client；测试净 +6 对新增 1 端点 1 解析器 1 向导，健康。
