# 实现计划：四反馈批合并（FB）——高频词强化+接线 / 蓝图 seed 扩展 / planner 接线补洞 / 批量蓝图 / 光谱→AI 人物卡（DEC-2026-1125-03）

- 日期：2026-11-25。计划真值源=本文；卡面=`docs/design/card-2026-11-25-fb-planner.md`；决策归档=`docs/decision-log.md` **DEC-2026-1125-03**（含 decision-critic 四档「有条件支持」评议条件）；事实真值=`docs/design/research-2026-11-25-four-feedbacks.md`。
- 本计划只写精确文件路径、行号、字面量、测试名与断言、可执行步骤，**不含实现代码 diff**；唯一落盘文件=本文。
- 行号=2026-11-25 工作树快照；>4KB 文件经 `python C:/Users/57850/.zcode/tools/pointer_tools.py` 的 `pointerize/read_pointer` 只读拉取，未整读全文。施工漂移时以锚点文本/函数名定位，不以行号硬依赖。
- 执行序 **F1 → F4 → F3 → F5 → F2**，同工作树 ≤1 卡串行；SP 批已收口推送至 `4a8c86f`，基线起点=**818**（server `pnpm test` 计数），只增不减。
- GUI 归 owner 真实测试，延批次收口一次做；§4 附表为五 feature 各列实测点位清单（供收口呈报）。
- 验收三条硬命令见 §6；自审五查逐条打勾留痕见 §7。

## 1. 目标

1. **F1 高频词强化+接线**：① FREQTERMS 指令行加显式量条——每行说明 **≥30 字**、须含语境/功能，保留「无则省略本行」逃生门（硬下限只对「写了但不足」触发，样本真无高频词不得被重试强造）；② 解析端新增 `freqShortfalls`，纳入 DF 同款「缺口带反馈重试一次 → warning 透传」；③ 注入接线=**独立常注槽**，与 `styleRules`/`styleDims` 同族、`stable: true`，**不受 `fewShot` 开关门控**（显式推翻 DEC-2026-1120-06 注入隔离条款）；④ `FREQ_TERMS_MAX=10` 不动；⑤ DF-5 自定义模板下限不变量测试随迁高频词。
2. **F4 蓝图 seed 扩展**：`blueprintSuggestSchema` 增可选 `seed`；服务端**确定性合并纯函数**（seed.beats 原样置前、模型补充按 `trim` 全等去重追加、goal 非空以 seed 为准、mustHaveBeats 沿现 PUT 并集语义）；畸形 seed → 400 或忽略+warning，**禁 500**；前端「基于已有草稿扩展」按钮把当前 textarea JSON 作为 seed 传入；`expectsLanding` 判定保持现状。
3. **F3 planner 接线补洞**：blueprint-suggest 给 worldview 独立槽预算 **2000 字** + 超预算截断 warning 可观测；`plotReference` 600→1500 对齐光谱；`renderBlueprintTask` 移除【书籍简介】行并随迁全部调用方。已知边界：planner 槽须经「每章手动点 AI 建议 → PUT 保存」生效，挂机续写不会自动吃档案。
4. **F5 批量蓝图建议**：续写书对全部无蓝图章节一键批量生成——逐章串行、只落蓝图；现状 `POST /api/runs` 对 blueprint-less 章 400、`queue.ts:62` 跳过**语义不动**；decision-critic 已锁边界：**不自动跑正文**。
5. **F2 光谱→AI 实例化人物卡**：行协议**禁 JSON**（DEC-2026-1111-01 红线）；产物 `{name, baseSetting}`，`baseSetting` 须为 **JSON 对象字符串**（`renderCharacterCards` 消费形态）；重名在草稿层标 warning（批内互撞+与既有卡撞名），单次 ≤8 张分批；张数 >spectrum 行数行为钉死（同原型多卡）；未绑定书=按钮禁用+指引不静默隐藏；`characters` 槽 8000 超限行为带断言。
6. 五 feature 各 ≥1 条新回归例（先红后绿），受牵连钉值随迁不删例；server 基线 818 → 新增 12 例 → 收口 **≥830**；D 区测试逐文件有处置行（§2.5）；验收 grep 五钉值齐（§6.1）；自审五查留痕（§7）。

## 2. 架构

### 2.1 决策 → 任务映射

| 已拍板决策（DEC-2026-1125-03） | 钉死字面量 / 行为 | 任务组 |
| --- | --- | --- |
| F1①指令强化 | `每行说明 ≥30 字`、含语境/功能、保留「无则省略本行」 | FB-F1-1 |
| F1②解析缺口+重试+warning | `freqShortfalls`、`低于下限30字` | FB-F1-1 / FB-F1-5 |
| F1③独立常注槽 | `freqTerms` stable 槽、不经 fewShot 门 | FB-F1-2 / FB-F1-3 / FB-F1-4 |
| F1④上限不动 | `FREQ_TERMS_MAX=10`（不动，仅守） | FB-F1-4（守） |
| F1⑤DF-5 随迁 | 自定义模板路径高频词缺口重试 | FB-F1-1 |
| F4 seed schema + 前端 | `seed`、`基于已有草稿扩展` | FB-F4-1 / FB-F4-3 |
| F4 确定性合并纯函数 | seed.beats 置前 / trim 全等去重 / goal seed 优先 / mustHaveBeats 并集 | FB-F4-2 |
| F4 畸形 seed 禁 500 | 400 或忽略+warning | FB-F4-1 / FB-F4-2 |
| F3 worldview 独立槽 | `2000`、超截断 warning | FB-F3-1 |
| F3 plot 预算对齐 | `1500` | FB-F3-1 |
| F3 render 签名随迁 | 移除【书籍简介】、全调用方迁移 | FB-F3-2 |
| F5 批量蓝图 | `批量`、逐章串行、只落蓝图不跑正文 | FB-F5-1 / FB-F5-2 |
| F2 实例化人物卡 | `实例化`、`{name, baseSetting}`、JSON 对象字符串 | FB-F2-1 / FB-F2-2 / FB-F2-3 |

### 2.2 锚点表（只读实读；行号快照，改前）

| # | 锚点 | 现状（改前） | 本计划处置 |
| --- | --- | --- | --- |
| 1 | `apps/server/src/style/analysis.ts:23` | `FREQTERMS: <词组>: <总结说明>（结合上方统计总结 3-8 条高频用语：…；无则省略本行）` | 加显式量条 `每行说明 ≥30 字…须含语境/功能`，逃生门逐字保留（FB-F1-1） |
| 2 | `apps/server/src/style/analysis.ts:62-74` | `shortfalls = first.dimShortfalls` → 带反馈重试 → `warnings = shortfalls.map(维度…)` | 副本式纳入 `freqShortfalls`，重试反馈与 warning 并列（FB-F1-1） |
| 3 | `apps/server/src/llm/plainproto.ts:341-347` | `ParsedAnalysis { …, errors, dimShortfalls }` | 增 `freqShortfalls: Array<{ term: string; chars: number }>`（FB-F1-1） |
| 4 | `apps/server/src/llm/plainproto.ts:351` | `STYLE_DIM_MIN_CHARS = 70` | 旁增 `FREQ_TERM_MIN_CHARS = 30`（FB-F1-1） |
| 5 | `apps/server/src/llm/plainproto.ts:402-407` | FREQTERMS 行解析 → `freqTerms.push({ term, note })` | 解析形态不动；在 `:434-438` 旁增缺口统计（FB-F1-1） |
| 6 | `apps/server/src/llm/plainproto.ts:434-441` | `dimShortfalls` 统计 + `return { …, dimShortfalls }` | 增 `freqShortfalls` 统计与返回字段（FB-F1-1） |
| 7 | `apps/server/src/style/merge.ts:27` | `FREQ_TERMS_MAX = 10` | **零改动**；`:306-314/:369` 合并语义不动（FB-F1-4 守） |
| 8 | `apps/server/src/style/inject.ts:16-26` | `renderStyleBlock(rulesText, samples, budgetChars, terms?)` 产出规则/范例/术语 | 旁增 `renderFreqTermsBlock(freqTerms, budgetChars)`（FB-F1-2） |
| 9 | `apps/server/src/context/assembler.ts:64-105` | `draftSlots` stable=hardRules/worldview/(characters)/styleDims/styleRules | 增 `freqTerms` stable 槽，插在 styleRules 后（FB-F1-2） |
| 10 | `apps/server/src/pipeline/rewrite.ts:26-69` | rewrite input/slots 含 styleRules/styleDims/fewShot | 增 `freqTerms` stable 槽（FB-F1-3） |
| 11 | `apps/server/src/config.ts:18-27/100-145` | Draft/Rewrite budgets 无 freqTerms；planner 无 worldview | 增 `freqTerms` 预算；planner 增 `worldview: 2000`（FB-F1-3 / FB-F3-2） |
| 12 | `apps/server/src/pipeline/chapter.ts:192-240` | `merged` 取 rules/terms/dims/axes/samples；fewShot 受开关门 | 增取 `merged.freqTerms` 并传槽；fewShot 门逐字不动（FB-F1-4） |
| 13 | `apps/server/src/http/routes.ts:62` | `blueprintSuggestSchema = z.object({ chapterNo })` | 增可选 `seed`（FB-F4-1） |
| 14 | `apps/server/src/http/routes.ts:392-402` | PUT mustHaveBeats 按 `text.trim()` 全等并集 | **语义不动**；合并纯函数复用该口径（FB-F4-2 守） |
| 15 | `apps/server/src/http/routes.ts:452-459` | planner slots：imitation/plot 600、spectrum 1500、outline 600 | 增 worldview 2000；plotReference 600→1500（FB-F3-1） |
| 16 | `apps/server/src/http/routes.ts:443-448` | `renderBlueprintTask({ …, bookDescription: book.description })` | 去掉 bookDescription 实参（FB-F3-2） |
| 17 | `apps/server/src/http/routes.ts:476-513` | expectsLanding/重试/叠加/`reply.send({ blueprint, source:'llm', warnings? })` | 接入 seed 合并；判定不动（FB-F4-2） |
| 18 | `apps/server/src/prompts/render.ts:160-177` | `renderBlueprintTask({ chapterNo, bookTitle, bookDescription, … })` 含【书籍简介】行 | 删字段与行，签名随迁（FB-F3-2） |
| 19 | `apps/server/src/http/routes.ts:693/714/745` | blueprint-less → 400（POST /api/runs / generate-all） | **零改动**（FB-F5-1 守）；新端点独立 |
| 20 | `apps/server/src/worker/queue.ts:62` | `if (!chapter || !chapter.blueprint) continue;` | **零改动**（FB-F5-1 守） |
| 21 | `apps/server/src/http/schemas.ts:25-33` | `createCharacterSchema { name, baseSetting? }` | 增实例化 draft schema（FB-F2-1） |
| 22 | `apps/server/src/http/routes.ts:148-181` | 人物卡 GET/POST/PUT/DELETE；POST 重名 → 409 | 端点不动；新增实例化端点（FB-F2-2） |
| 23 | `apps/server/src/prompts/render.ts:33` | `renderCharacterCards(cards: {name, baseSetting}[])` | 消费形态不动（FB-F2-2 守） |
| 24 | `apps/web/src/api/client.ts:131-133` | `suggestBlueprint(bookId, body: BlueprintSuggestBody)` | 类型由 shared 扩 seed；调用点传 seed（FB-F4-3） |
| 25 | `packages/shared/src/api.ts:217-219` | `BlueprintSuggestBody { chapterNo }` | 增 `seed?`（FB-F4-1） |
| 26 | `apps/web/src/pages/BookDetailPage.tsx:459-471` | `suggest()` 只传 `{chapterNo}`，整体替换 textarea | 传 textarea JSON 作 seed（FB-F4-3） |
| 27 | `apps/web/src/pages/BookDetailPage.tsx:1024-1044` | 「AI 建议蓝图」按钮 + 蓝图 textarea | 增「基于已有草稿扩展」/「批量」按钮（FB-F4-3 / FB-F5-2） |
| 28 | `apps/web/src/pages/BookDetailPage.tsx:792+` | 人物卡区（:321 baseSetting 展示） | 增「实例化人物卡」按钮+禁用指引（FB-F2-3） |

### 2.3 改后数据流

- **F1**：样本 → `buildFreqBlock` → `analyzeStyle` prompt（FREQTERMS ≥30 字量条，逃生门保留）→ `parseAnalysis` 产 `freqTerms` + `freqShortfalls`（NAMES 过滤零改动）→ 缺口带反馈重试一次 → `warnings` 透传（`DistillStyleDraftDto.warnings` 已自动透传）→ `rules_json.freqTerms` 落库 → `mergeStyleProfiles`（FREQ_TERMS_MAX=10 不动）→ `merged.freqTerms` → `renderFreqTermsBlock` → draftSlots/rewriteSlots 的 stable `freqTerms` 槽（fewShot 关闭照注）。
- **F4**：textarea JSON → `JSON.parse` → `BlueprintSuggestBody.seed` → schema 校验（畸形 400）→ planner 产出 → `mergeSeedIntoBlueprint` 纯函数 → `reply.send({ blueprint, source:'llm', warnings? })` → 前端整体替换 textarea → PUT 保存（mustHaveBeats 并集语义不动）。
- **F3**：book.description → planner 独立 `worldview` 槽（2000，head 截断 + warning）→ task 槽只留协议行（无【书籍简介】）→ 手动「AI 建议蓝图」→ PUT 保存；挂机续写不吃档案（边界不变）。
- **F5**：书详情 → 列出 blueprint-less 章节 → `for...of await` 逐章调既有 planner 装配 + 纯合并 → `upsertBlueprint` 落库 → 返回 `{ generated, failed, items[] }`；**不调用 startRun、不写 chapter 正文**。
- **F2**：光谱档案 `structure` → planner 行协议（禁 JSON）→ 解析为 `{name, baseSetting}`（baseSetting 为 JSON 对象字符串）→ 草稿层按名去重（批内 + 与既有卡）标 warning、≤8 张/次 → 用户确认后走既有 POST 人物卡端点（409 语义不动）→ drafter `renderCharacterCards` 消费（characters 槽 8000 截断）。

### 2.4 范围与红线（逐项锁死）

1. **写白名单**（源文件，每卡 ≤2）：`style/analysis.ts`、`llm/plainproto.ts`、`style/inject.ts`、`context/assembler.ts`、`pipeline/rewrite.ts`、`config.ts`、`pipeline/chapter.ts`、`http/routes.ts`、`http/schemas.ts`、`prompts/render.ts`、`packages/shared/src/api.ts`、新增 `http/blueprint-merge.ts`、新增 `http/blueprint-batch.ts`、新增 `http/character-instantiate.ts`、`web/.../BookDetailPage.tsx`、`web/.../StyleProfilesSection.tsx`。测试文件另计。
2. **禁改**：`apps/server/data/**`；`style/merge.ts`（FREQ_TERMS_MAX=10 及合并语义）；`http/routes.ts:693/714/745` 的 blueprint-less 400；`worker/queue.ts:62` 跳过；`prompts/render.ts:33` renderCharacterCards；`http/routes.ts:148-181` 人物卡 CRUD；`expectsLanding` 判定（`:476-477`）；存量档案不重蒸、无迁移代码。
3. **fewShot 开关语义**（DEC-2026-1116-01④）不动：F1 选常注族正是为不受其门控；`chapter.ts:209-212` 门控逐字保留。
4. **红线豁免仅一处**：plot/spectrum/drafter「只 planner 注入」红线仅 F1 的 freqTerms 接线经 DEC-2026-1125-03 显式豁免；其余面不扩（F2 的人物卡仍只 drafter 消费，不进 planner）。
5. **行协议禁 JSON**（DEC-2026-1111-01）适用于 F2 实例化输出；baseSetting 为「JSON 对象字符串」是字段值形态，不等于输出 JSON 协议。
6. **不自动跑正文**（F5 critic 边界）：新端点只写 blueprint，不 createRun、不改 chapter 状态。
7. 步骤均为 2-5 分钟、一步一动作 + 可核对结果；无占位符、无「处理边界情况」类死行。

### 2.5 受牵连测试处置表（research §五 D 区全量 + 卡面追加两文件；三态齐）

| # | 测试文件 | 钉的值 | 处置 | 任务 |
| --- | --- | --- | --- | --- |
| D1 | `apps/server/test/llm/plainproto.test.ts:196-267` | FREQTERMS 解析形态/冒号容错/NAMES 剔除 | **随迁**（增 `freqShortfalls` 断言，旧断言零删） | FB-F1-1 |
| D2 | `apps/server/test/http/distill-template.test.ts:110,137-139` | 默认模板「每维不少于 70 字」+ DF-5 不变量例 | **随迁**（DF-5 例扩高频词缺口断言） | FB-F1-1 |
| D3 | `apps/server/test/http/distill-jobs.test.ts:242-247` | warnings 文案「维度X仅N字，低于下限70字」 | **随迁**（并列高频词 warning 文案） | FB-F1-1 |
| D4 | `apps/server/test/style/analysis.test.ts:238-263` | freqBlock 注入；FREQTERMS 落 rules_json | **随迁**（重试反馈含高频词） | FB-F1-1 |
| D5 | `apps/server/test/style/inject-blocks.test.ts:51-54` | `renderStyleBlock` 不含 freqTerms | **随迁**（推翻该钉，改断言新常注槽） | FB-F1-2 |
| D6 | `apps/server/test/style/merge.test.ts:137-148` | freqTerms 并集主优先、上限 10 | **不动**（守 FREQ_TERMS_MAX=10） | FB-F1-4 守 |
| D7 | `apps/server/test/http/style.test.ts:229-251` | DTO analysis.freqTerms 形态 | **不动**（DTO 零改动） | FB-F1-4 守 |
| D8 | `apps/server/test/http/blueprint-suggest.test.ts:45,72-75` | task 预算 800、大纲卡注入/并集/LANDING 重试 | **随迁**（mock 请求体带 seed；新增 3 例） | FB-F4-1 / FB-F3-1 |
| D9 | `apps/server/test/plot.test.ts:111-137` | plot 注入槽 + drafter 无槽红线 | **随迁**（plotReference 1500 例，红线断言不动） | FB-F3-1 |
| D10 | `apps/server/test/spectrum.test.ts:155-205` | spectrum 注入槽 1500 + drafter 无槽红线 | **不动**（SP 批已钉，本批不碰） | FB-F3-1 守 |
| D11 | `apps/server/test/http/settings-import.test.ts:66` | 人物卡解析、AXIS 行协议样例 | **不动**（F2 另起端点，不改导入解析） | FB-F2-2 守 |
| D12 | `apps/server/test/pipeline/continue.test.ts:98-178`、`apps/server/test/pipeline/chapter.test.ts:422` | continue 锚点先验、注入行为 | **随迁**（freqTerms 常注槽 + characters 8000 断言） | FB-F1-4 / FB-F2-2 |
| D13 | `apps/web/src/pages/BookDetailPage.test.tsx:103` | `/blueprint-suggest` 请求 mock | **随迁**（seed 请求体 + 3 个按钮用例） | FB-F4-3 / FB-F5-2 / FB-F2-3 |
| D14 | `apps/web/src/pages/StyleProfilesSection.test.tsx:294-310,616` | 高频词预览编辑、只读渲染 | **随迁**（warning 文案泛化后 role=alert 仍显） | FB-F1-5 |
| D15 | `apps/web/src/components/DistillProfilesShell.test.tsx` | 蒸馏草稿行编辑入库 | **不动**（口径不变） | guard |

## 3. 规格（钉死的实现决定）

### 3.1 F1 精确字面量

- `analysis.ts:23` 整行替换为：
  `FREQTERMS: <词组>: <总结说明>（结合上方统计总结 3-8 条高频用语：何处高频/什么语境/表达功能；**每行说明不少于 30 字**，须写足语境与表达功能，勿只给短评；与 TERMS 的世界观术语区分，同样严禁人物姓名；无则省略本行）`
  ——「无则省略本行」逐字保留=逃生门；硬下限只对写了但不足的行触发。
- 新增常量 `FREQ_TERM_MIN_CHARS = 30`（`plainproto.ts:351` 旁），与 `STYLE_DIM_MIN_CHARS=70` 同族。
- `ParsedAnalysis` 增 `freqShortfalls: Array<{ term: string; chars: number }>`；统计口径：`freqTerms` 每条 `Array.from(note.trim()).length < 30` 入列；`return` 增该字段。NAMES 过滤先于统计（被剔除的项不产生缺口）。
- `analysis.ts:62-74` 重试触发条件扩为 `isEmpty(analysis) || shortfalls.length > 0 || freqShortfalls.length > 0`；反馈串并列 `高频词「X」说明仅N字，低于下限30字，请重写该条说明`；`warnings` 并列 `高频词「X」说明仅N字，低于下限30字`。**第二轮仍不足不抛错、只透传 warning**（DF 同款）；`freqTerms` 为空（样本真无高频词）时不产生缺口、不触发重试。
- `inject.ts` 新增 `export function renderFreqTermsBlock(freqTerms: StyleTermDto[], budgetChars: number): string`：产出 `【高频词】\n${freqTerms.map(t => `${t.term}：${t.note}`).join('\n')}`，超预算 head 截断；空数组返回 `''`。
- `assembler.ts` `draftSlots` 入参增 `freqTerms?: string`，紧随 styleRules 之后 push `{ name:'freqTerms', content, budgetChars: budgets.freqTerms, stable:true, keep:'head' }`；`rewrite.ts` 同形加槽。
- `config.ts` 增 `freqTerms` 预算：draft **600**、rewrite **600**、draft8k **0**（低配_profile 与 fewShot 同档关闭）。

### 3.2 F4 精确字面量

- `packages/shared/src/api.ts:217-219`：
  ```ts
  export interface BlueprintSuggestBody {
    chapterNo: number;
    seed?: {
      goal?: string;
      beats?: string[];
      mustHaveBeats?: Array<{ text: string; keywords?: string[]; grade?: 'H' | 'L' }>;
      bannedTopics?: string[];
    };
  }
  ```
- `http/routes.ts:62`：`blueprintSuggestSchema = z.object({ chapterNo: z.number().int().positive(), seed: z.object({ goal: z.string().optional(), beats: z.array(z.string()).optional(), mustHaveBeats: z.array(z.object({ text: z.string(), keywords: z.array(z.string()).optional(), grade: z.enum(['H','L']).optional() })).optional(), bannedTopics: z.array(z.string()).optional() }).optional() })`。畸形 seed 由 `parseBody` 统一 400（禁 500）。
- 新增 `apps/server/src/http/blueprint-merge.ts` 纯函数：
  `export function mergeSeedIntoBlueprint(seed: BlueprintSuggestBody['seed'], model: ChapterBlueprint): ChapterBlueprint`
  - `beats = [...(seed?.beats ?? []), ...model.beats.filter(b => !(seed?.beats ?? []).some(s => s.trim() === b.trim()))]`（seed 原样置前，模型补充按 trim 全等去重追加）；
  - `goal = seed?.goal?.trim() ? seed.goal : model.goal`；
  - `mustHaveBeats = seed?.mustHaveBeats` 按 `text.trim()` 全等并集置前 + 模型条目追加（**与 `routes.ts:392-402` 同口径**），`grade` 随条目保留；
  - `bannedTopics` 不在合并范围，保持 `model.bannedTopics`；
  - 纯函数对 undefined/空 seed 恒等返回 model 的深拷贝形态，**不抛异常**。
- `routes.ts:509` 前接入：`report.blueprint = mergeSeedIntoBlueprint(body.seed, report.blueprint)`；`warnings` 可追加 `seed 合并完成` 类可观测项（可选，不影响既有 warning 判定）；`expectsLanding` 判定与 LANDING 叠加顺序不动。
- 前端 `BookDetailPage.tsx:459-471` `suggest()` 改 `api.suggestBlueprint(bookId, { chapterNo, ...(hasDraftSeed ? { seed: parsedTextarea } : {}) })`；`JSON.parse` 失败→就地 `setMsg` 提示且不发请求。**默认不传 seed**（保持现状行为），只有点「基于已有草稿扩展」才传。

### 3.3 F3 精确字面量

- `routes.ts:452-459` slots 区：新增 `...(worldviewBrief ? [{ name: 'worldview', content: worldviewBrief, budgetChars: 2000, stable: true, keep: 'head' as const }] : [])`；`worldviewBrief = book.description`；若 `book.description.length > 2000` 推 warning `书籍简介超 2000 字，planner 世界观槽已按 head 截断`（并入 `warnings`，随 `reply.send` 透传）。
- 同区 `plotReference` 槽 `budgetChars: 600`→`1500`；imitation/outline 两处 600 不动。
- `prompts/render.ts:160-177`：签名删 `bookDescription: string`；删 `【书籍简介】${args.bookDescription || '（无）'}` 行；其余协议行逐字不动。
- `routes.ts:443-448` 调用同步删 `bookDescription` 实参；`config.ts:141` 注释改为「task 800：协议行占 ~210，世界观走独立 2000 槽（DEC-2026-1125-03）」。
- 全仓 `renderBlueprintTask` 调用方仅 `routes.ts:443` 一处（已核），随迁即齐。

### 3.4 F5 精确字面量

- 新增 `apps/server/src/http/blueprint-batch.ts` 纯编排函数：
  `export async function batchBlueprintSuggest(deps: { db; config; plannerProvider; suggestOnce: (chapterNo: number) => Promise<ChapterBlueprint> }, input: { bookId: string }): Promise<{ generated: number; failed: number; items: Array<{ chapterNo: number; ok: boolean; error?: string }> }>`
  - 章节集合=`chaptersRepo.listChapters(db, bookId).filter(c => !c.blueprint)`，按 chapterNo 升序；
  - `for (const ch of targets) await` **串行**（禁 `Promise.all`），每章 `suggestOnce` → `chaptersRepo.upsertBlueprint`（带 title/targetChars，复用现 PUT 的 mustHaveBeats 并集语义）；
  - 单章失败→该项 `ok:false, error` 记入 items 并继续下一章，**不抛、不中断整批**；
  - 不调 `runsRepo.createRun`、不写正文。
- `routes.ts` 新端点 `POST /api/books/:bookId/blueprint-suggest/batch`：book 不存在 404；调用 `batchBlueprintSuggest` → `reply.send(result)`。既有 `POST /api/runs` / `generate-all` 400 与 `queue.ts:62` 零改动。
- 前端 `BookDetailPage.tsx` 蓝图区增「一键批量蓝图建议」：无蓝图章节数=0 时 `disabled` + `title="当前书没有待生成蓝图的章节"`；点击后显示进度 `已生成 x / n`，完成后刷新章节列表。

### 3.5 F2 精确字面量

- 新增 `apps/server/src/http/character-instantiate.ts`：
  - prompt 行协议（禁 JSON）：每卡两块 `NAME: <姓名>` / `BASE: <JSON 对象字符串>`，块间空行；明确「不要输出 JSON、markdown 代码块或解释」。
  - 解析：`^NAME\s*[:：]\s*(.*)$` / `^BASE\s*[:：]\s*(.*)$`；`BASE` 值须 `JSON.parse` 成功且为**非数组、非 null 的 plain object**，否则该卡丢弃并记 warning `第N张卡 baseSetting 非 JSON 对象字符串，已跳过`；产出 `{ name, baseSetting: JSON.stringify(obj) }`。
  - 单次上限 **8** 张：截断多余卡并记 warning `单次最多 8 张，已截取前 8 张`。
  - 重名：`Set` 比对批内 name + `booksRepo.listCharacters(db, bookId)` 既有 name，命中项不进草稿并记 warning `人物卡「X」重名，已跳过`；**草稿层标 warning，不落库**。
  - 张数 > spectrum `structure` 行数：允许同原型多卡，不截断（钉死行为，加断言）。
- `http/schemas.ts` 增 `characterInstantiateSchema = z.object({ maxCards: z.number().int().min(1).max(8).default(8) })`；`packages/shared/src/api.ts` 增 `CharacterInstantiateDraftDto = { cards: Array<{name:string;baseSetting:string}>; warnings: string[] }`。
- `routes.ts` 新端点 `POST /api/books/:bookId/characters/instantiate`：无 `book.spectrumProfileId` → 400 `{ error:'未绑定人物光谱档案' }`（前端禁用兜底）；返回草稿 DTO；保存仍走既有 `POST /api/books/:bookId/characters`（409 语义不动）。
- 前端 `BookDetailPage.tsx` 人物卡区增「实例化人物卡」：未绑定光谱 → `disabled` + `aria-describedby` 指引 `请先在「光谱档案」页绑定档案`；绑定 → 打开草稿预览，展示 warning 列表与逐卡可编辑 name/baseSetting，确认后逐张调用既有保存端点。

### 3.6 回归测试清册（先红后绿；名 + 断言钉死）

**F1**
1. `R-F1-1`（新增，`plainproto.test.ts:196-267`）`it('FREQTERMS 说明<30 字入 freqShortfalls；无 FREQTERMS 行不产生缺口', …)`：一行 `note='短说明'` → `expect(p.freqShortfalls).toEqual([{term:'X',chars:3}])`；无 FREQTERMS → `toHaveLength(0)`。旧解析无字段 → 红。
2. `R-F1-2`（新增，`analysis.test.ts:238-263`）`it('高频词缺口带反馈重试一次并透传 warning', …)`：mock 两次响应，第一次 note 短 → 断言第二次 `req.user` 含 `低于下限30字`、结果 `warnings` 含 `高频词`;第三次不被调用。旧无重试 → 红。
3. `R-F1-3`（**随迁**，`distill-template.test.ts` DF-5 例）：自定义模板不含默认指令，扩断言第二次调用 user 含 `低于下限30字` 且 job warnings 非空；首跑若红即停报根因（df-5 卡先例）。
4. `R-F1-4`（**随迁**，`inject-blocks.test.ts:51-54`）：原「不含 freqTerms」断言改为 `expect(renderStyleBlock('', samples, 1200, terms)).not.toContain('高频词')` **且** `expect(renderFreqTermsBlock(terms, 600)).toContain('【高频词】')`；推翻旧钉、不删文件。
5. `R-F1-5`（新增，`assembler.test.ts`）`it('draftSlots 含 stable freqTerms 槽，fewShot 关闭仍装配', …)`：断言槽名数组含 `freqTerms`、`stable:true`、位置紧随 styleRules。旧无槽 → 红。
6. `R-F1-6`（**随迁**，web `StyleProfilesSection.test.tsx:294-310`）：warning 文案泛化后 `getByRole('alert')` 仍含高频词缺口串；不删既有用例。

**F4**
7. `R-F4-1`（新增，`blueprint-suggest.test.ts:45` 后）`it('seed schema：畸形 seed→400，合法 seed 进入合并', …)`：`beats:'x'` → 400；合法 seed → spy `mergeSeedIntoBlueprint` 被调用。
8. `R-F4-2`（新增，`blueprint-merge.test.ts`）`it('确定性合并：seed.beats 置前/去重、goal seed 优先、mustHaveBeats 并集', …)`：seed.beats=['甲']、model.beats=['甲','乙'] → ['甲','乙']；seed.goal 非空胜出；mustHaveBeats 同 trim 不重复。
9. `R-F4-3`（新增，web `BookDetailPage.test.tsx:103`）`it('基于已有草稿扩展把 textarea JSON 作 seed', …)`：捕获请求体断言 `seed.beats` 等于 textarea 内容；默认按钮不传 seed。

**F3**
10. `R-F3-1`（新增，`blueprint-suggest.test.ts`）`it('planner worldview 槽 2000 字 + 超截断 warning', …)`：绑定 2500 字简介 → 捕获 planner user 含前 2000 字且不含尾标、`warnings` 含 `超 2000 字`；旧无槽 → 红。
11. `R-F3-2`（新增，`plot.test.ts:111-137`）`it('plotReference 预算 1500，>600 尾部存活', …)`：600 字尾部标记在 1500 预算下存活；红线（drafter 无槽）断言原样保留。
12. `R-F3-3`（**随迁**，`blueprint-suggest.test.ts:72-75`）：task 断言改「不含【书籍简介】、含协议行」，mock 随签名迁移。

**F5**
13. `R-F5-1`（新增，`blueprint-batch.test.ts`）`it('批量蓝图：仅无蓝图章逐章串行生成并落库', …)`：3 章中 1 章已有蓝图 → 只处理 2 章；spy 调用顺序 `[1,3]` 串行；upsertBlueprint 2 次。
14. `R-F5-2`（新增，`blueprint-batch.test.ts`）`it('批量端点不自动跑正文，POST /api/runs 400 语义不变', …)`：spy `createRun`/正文写入零调用；对 blueprint-less 章 `POST /api/runs` 仍 400。
15. `R-F5-3`（新增，web `BookDetailPage.test.tsx`）`it('一键批量按钮：计数驱动禁用态与进度', …)`：0 待生成 → disabled+title；点击后显示 `已生成 x / n`。

**F2**
16. `R-F2-1`（新增，`character-instantiate.test.ts`）`it('行协议禁 JSON：NAME/BASE 解析为 {name, baseSetting} 且 baseSetting 为 JSON 对象字符串', …)`：输出含 `BASE: {"age":20}` → `JSON.parse(baseSetting)` 为对象；输出整段 JSON → 0 卡 + warning。
17. `R-F2-2`（新增，`character-instantiate.test.ts`）`it('重名草稿层 warning + ≤8 张 + >spectrum 行数不截断', …)`：批内/既有各撞 1 → 2 条 warning、草稿不含重名；12 张 → 截 8 + warning；spectrum 2 行产 5 卡 → 5 卡全留。
18. `R-F2-3`（新增，`apps/server/test/pipeline/chapter.test.ts:422`）`it('characters 槽 8000 超限按 head 截断', …)`：超长 baseSetting → 卡槽内容长度=8000，尾部标记不在。
19. `R-F2-4`（新增，web `BookDetailPage.test.tsx`）`it('未绑定光谱→实例化按钮禁用+指引', …)`：无 spectrumProfileId → `disabled` + 指引文本存在。

- 计数：server 新增 R-F1-1/2/5、R-F4-1/2、R-F3-1/2、R-F5-1/2、R-F2-1/2/3 = **12 例** → 818+12=**≥830**；随迁 3 例（R-F1-3/4/6、R-F3-3 按文件计）不减计数；web 新增 4 例另计，各 web 卡 A0 实跑记数只增不减。

## 4. 全局约束

1. **执行串行**：FB-F1-* → FB-F4-* → FB-F3-* → FB-F5-* → FB-F2-*，同工作树 ≤1 卡；每卡一次提交、只 commit 不 push，提交信息带 `verify:`（定向测试结果+基线数）与 `Refs: docs/plans/2026-11-25-four-feedbacks-batch.md`；永不 `--no-verify`、永不 `git add -A`。
2. **写白名单**仅 §2.4.1；每步落点唯一（§7「步骤唯一可写」）；禁止顺手改 `FREQ_TERMS_MAX=10`、`budgetChars: 600`（imitation/outline）、`queue.ts:62`、blueprint-less 400、人物卡 CRUD、expectsLanding 判定。
3. **测试基线只增不减**（起点 818、目标 ≥830）；禁删用例，旧钉值只随迁；先红后绿，红未出现即停回报，不得直接写绿。
4. **验证链硬序**：定向测试（红→绿）→ `pnpm --filter @inkforge/server test` 相关文件全绿 → `pnpm test` 全量 ≥830 → `pnpm typecheck` → `pnpm lint` → web 定向 `pnpm --filter @inkforge/web test`；任一环失败即停回报，不得跳环。
5. 读 >4KB 文件一律用 `python C:/Users/57850/.zcode/tools/pointer_tools.py` 的 `pointerize/read_pointer`，禁止整读全文；卡外问题即停回报。
6. 存量档案不重蒸、不新增迁移、不写 `apps/server/data/**`。
7. **每任务源文件数 ≤2**（测试另计）；无占位符、无死行。
8. **GUI 归 owner 真实测试延批次收口一次做**——计划只列点位清单（§4.8），提交信息 `verify:` 须含「GUI 未验证」标注。

### 附：GUI 实测点位清单（供 owner 收口呈报；本批不执行）

| feature | 点位（页面/操作） | 期望现象 |
| --- | --- | --- |
| F1 | 风格档案页蒸馏 → 草稿预览 | 高频词不足出 `role=alert`，文案含「低于下限30字」；fewShot 关闭章节正文仍含高频词 |
| F4 | 书详情·蓝图：手填 JSON → 点「基于已有草稿扩展」→ AI 建议 | 手写 beats 原样置前、模型补充去重追加；畸形 JSON 提示而非 500 |
| F3 | 书详情·蓝图：绑定长简介 → AI 建议 | planner 世界观约 2000 字、超限 warning 可见；task 无【书籍简介】 |
| F5 | 书详情·蓝图：多章无蓝图 → 点「一键批量蓝图建议」 | 逐章进度、仅无蓝图章被生成、不触发正文生成 |
| F2 | 书详情·人物卡：绑定光谱 → 点「实例化人物卡」 | 未绑定时按钮禁用+指引；草稿显示重名 warning、≤8 张、可编辑后保存 |

## 5. 任务表（文件 / Interfaces / checkbox 步骤串）

### FB-F1-1 `analysis.ts` 指令行 + `plainproto.ts` 缺口解析（R-F1-1/2/3）

- **文件**：改 `apps/server/src/style/analysis.ts:23,62-74`；`apps/server/src/llm/plainproto.ts:341-347,351,434-441`；测 `test/llm/plainproto.test.ts:196-267`、`test/style/analysis.test.ts:238-263`、`test/http/distill-template.test.ts:110,137-139`、`test/http/distill-jobs.test.ts:242-247`。
- **Interfaces / 接口**：Consumes=`buildFreqBlock(fewShot): string` 与 `parseAnalysis(raw: string): ParsedAnalysis`（`plainproto.ts:365`，签名不变）; Produces=`ParsedAnalysis.freqShortfalls`（新增字段）、`analyzeStyle` 返回 `StyleAnalysisDto` **签名/字段不变**（`warnings` 经 job DTO 透传）。`StyleAnalysisDto` 零改动。
- **步骤**：
  - [ ] FB-F1-1-S1（红，3-4 min）：按 §3.6 R-F1-1/R-F1-2 增两例、按 R-F1-3 扩 DF-5 例断言；跑 `pnpm --filter @inkforge/server test -- test/llm/plainproto.test.ts test/style/analysis.test.ts test/http/distill-template.test.ts -t 'freqShortfalls|高频词缺口'`，核对结果=**2 红 + DF-5 例红**（无字段/无重试/无文案）。
  - [ ] FB-F1-1-S2（绿，4-5 min）：按 §3.1 替换 `analysis.ts:23`、新增常量与 `freqShortfalls` 统计/返回、扩 `:62-74` 重试与 warnings；重跑 S1 命令，核对结果=3 绿，且 `plainproto.test.ts:196-267` 既有解析断言仍绿。
  - [ ] FB-F1-1-S3（守，2 min）：跑 `grep -n "无则省略本行\\|FREQ_TERMS_MAX\\|30 字" apps/server/src/style/analysis.ts`，核对结果=逃生门保留、`30 字` 命中 1 行、merge 上限文件零改动。

### FB-F1-2 `inject.ts` + `assembler.ts` 常注槽（R-F1-4）

- **文件**：改 `apps/server/src/style/inject.ts:16-26` 旁；`apps/server/src/context/assembler.ts:64-105`；测 `test/style/inject-blocks.test.ts:51-54`、`test/context/assembler.test.ts`。
- **Interfaces / 接口**：Consumes=`StyleTermDto[]`（`@inkforge/shared`）、`AppConfig['budgets']['draft']`；Produces=`renderFreqTermsBlock(freqTerms, budgetChars): string`（新增导出）、`draftSlots` 入参增 `freqTerms?: string` 且新增 stable 槽；`renderStyleBlock` 签名与产出**不变**（测试仅反转 freqTerms 断言）。
- **步骤**：
  - [ ] FB-F1-2-S1（红，2-3 min）：按 R-F1-4 反转 `inject-blocks.test.ts:51-54` 断言、按 R-F1-5 增 assembler 用例；跑 `pnpm --filter @inkforge/server test -- test/style/inject-blocks.test.ts test/context/assembler.test.ts -t 'freqTerms|高频词'`，核对结果=**2 红**（无 renderFreqTermsBlock/无槽）。
  - [ ] FB-F1-2-S2（绿，3-4 min）：按 §3.1 新增渲染函数与 stable 槽；重跑 S1 命令，核对结果=2 绿，且 `renderStyleBlock` 既有 3 条断言仍绿。
  - [ ] FB-F1-2-S3（守，2 min）：跑 `grep -n "name: 'freqTerms'\\|stable: true" apps/server/src/context/assembler.ts`，核对结果=新槽 `stable: true` 且位于 styleRules 之后、fewShot 之前。

### FB-F1-3 `rewrite.ts` + `config.ts` 预算

- **文件**：改 `apps/server/src/pipeline/rewrite.ts:26-69`；`apps/server/src/config.ts:18-27,100-145`；测 `test/style/inject-blocks.test.ts` 追加槽断言。
- **Interfaces / 接口**：Consumes=`RewriteBudgets`/`DraftBudgets`（`config.ts:18-27`）新字段 `freqTerms: number`；Produces=`rewriteSlots` 增 stable `freqTerms` 槽、`pickBudgetProfile` 返回值不变。
- **步骤**：
  - [ ] FB-F1-3-S1（红，2 min）：在 `inject-blocks.test.ts` 追加 rewrite 槽断言（`freqTerms` 在 targeted 重写 slots 中）；跑定向，核对结果=**1 红**。
  - [ ] FB-F1-3-S2（绿，3 min）：按 §3.1 加预算（draft 600 / rewrite 600 / draft8k 0）与 rewrite 槽；重跑 S1 绿，核对 `config.test.ts` 既有预算断言仍绿。
  - [ ] FB-F1-3-S3（守，2 min）：跑 `grep -n "freqTerms" apps/server/src/config.ts`，核对结果=三档各 1 处、无遗漏 profile。

### FB-F1-4 `chapter.ts` 装配接线（守 merge 上限）

- **文件**：改 `apps/server/src/pipeline/chapter.ts:192-240`；测 `test/pipeline/continue.test.ts:98-178`、`test/pipeline/chapter.test.ts:422` 追加断言。
- **Interfaces / 接口**：Consumes=`merged.freqTerms`（`style/merge.ts:369` 已产出）、`draftSlots`/`rewriteSlots` 新入参；Produces=传入 `freqTerms: renderFreqTermsBlock(merged.freqTerms, config.budgets.draft.freqTerms)`；`fewShot` 门控 `:209-212` 逐字不动。
- **步骤**：
  - [ ] FB-F1-4-S1（红，2-3 min）：在 `chapter.test.ts` 追加「fewShot 关闭仍见高频词槽」断言；跑定向，核对结果=**1 红**。
  - [ ] FB-F1-4-S2（绿，3 min）：`merged` 分支增 `styleFreqTerms = merged.freqTerms`，传 draft 与 rewrite 两处；重跑绿，核对 `:209-212` diff 为空。
  - [ ] FB-F1-4-S3（守，2 min）：跑 `pnpm --filter @inkforge/server test -- test/style/merge.test.ts test/http/style.test.ts`，核对结果=全绿且上限 10/DTO 形态钉值未变；`git diff -- apps/server/src/style/merge.ts` 输出为空。

### FB-F1-5 web warning 文案泛化（R-F1-6，随迁）

- **文件**：改 `apps/web/src/pages/StyleProfilesSection.tsx:546-552` 附近 alert 文案与 `warnings` 组装；测 `apps/web/src/pages/StyleProfilesSection.test.tsx:294-310`。
- **Interfaces / 接口**：Consumes=`DistillStyleDraftDto.warnings?: string[]`（已透传）；Produces=alert 文案前缀由「单维字数不足…」泛化为「字数不足（草稿未达标，请编辑补厚后再确认入库）：」，同一 `role="alert"` 容器；`createStyleProfile` payload **不带** warnings（红线）。
- **步骤**：
  - [ ] FB-F1-5-S1（红，2-3 min）：改测试 stub 使 warnings 含高频词串、断言 `getByRole('alert')` 文本含该串；跑 `pnpm --filter @inkforge/web test -- StyleProfilesSection.test.tsx -t 'alert'`，核对结果=**1 红**。
  - [ ] FB-F1-5-S2（绿，2-3 min）：泛化文案前缀；重跑绿，核对「无 warning 时无 alert」既有用例仍绿。
  - [ ] FB-F1-5-S3（守，2 min）：`grep -n "createStyleProfile" apps/web/src/pages/StyleProfilesSection.tsx` 目视确认 payload 未带 warnings。

### FB-F4-1 shared + server schema（R-F4-1）

- **文件**：改 `packages/shared/src/api.ts:217-219`；`apps/server/src/http/routes.ts:62`；测 `test/http/blueprint-suggest.test.ts:45`。
- **Interfaces / 接口**：Consumes=`z`（zod v4）、`createRoleProvider(config,'planner')`；Produces=`BlueprintSuggestBody.seed?` 与 `blueprintSuggestSchema.seed`，`parseBody` 400 行为不变。
- **步骤**：
  - [ ] FB-F4-1-S1（红，2-3 min）：按 R-F4-1 增畸形/合法 seed 两断言；跑定向 `-t 'seed schema'`，核对结果=**1 红**（畸形被 200/500 或合法未透传）。
  - [ ] FB-F4-1-S2（绿，2-3 min）：按 §3.2 扩 DTO 与 schema；重跑绿，核对 `BookDetailPage.test.tsx:103` mock 仍绿（请求体新增可选字段不破坏）。
  - [ ] FB-F4-1-S3（守，2 min）：跑 `grep -n "seed" apps/server/src/http/routes.ts apps/server/src/http/schemas.ts packages/shared/src/api.ts`，核对结果=各 1 处定义、无重复。

### FB-F4-2 确定性合并纯函数（R-F4-2）

- **文件**：新增 `apps/server/src/http/blueprint-merge.ts`；改 `apps/server/src/http/routes.ts:509` 前；测新增 `test/http/blueprint-merge.test.ts`。
- **Interfaces / 接口**：Consumes=`BlueprintSuggestBody['seed']`、`ChapterBlueprint`（`schemas.ts:35-42`）；Produces=`mergeSeedIntoBlueprint(seed, model): ChapterBlueprint` 纯函数；不写 DB、不改 `expectsLanding`（`:476-477`）。
- **步骤**：
  - [ ] FB-F4-2-S1（红，3 min）：新增 `blueprint-merge.test.ts` 按 R-F4-2 三断言；跑定向，核对结果=**1 红**（函数不存在）。
  - [ ] FB-F4-2-S2（绿，3-4 min）：按 §3.2 实现纯函数并在 `:509` 前调用；重跑绿，核对 `blueprint-suggest.test.ts` 既有 LANDING/并集例仍绿。
  - [ ] FB-F4-2-S3（守，2 min）：`git diff -- apps/server/src/http/routes.ts | grep -n "392\\|393\\|394\\|395\\|396\\|397\\|398\\|399\\|400\\|401\\|402"` 核对结果=零命中（PUT 并集语义未动）。

### FB-F4-3 web「基于已有草稿扩展」（R-F4-3）

- **文件**：改 `apps/web/src/pages/BookDetailPage.tsx:459-471,1024-1026`；测 `apps/web/src/pages/BookDetailPage.test.tsx:103`。
- **Interfaces / 接口**：Consumes=`api.suggestBlueprint(bookId, BlueprintSuggestBody)`（`client.ts:131`）、`blueprintText` state（`:353`）；Produces=新按钮调用带 seed 的单次建议；默认 `suggest()` 不传 seed。
- **步骤**：
  - [ ] FB-F4-3-S1（红，2-3 min）：按 R-F4-3 增 mock 请求体断言；跑定向，核对结果=**1 红**。
  - [ ] FB-F4-3-S2（绿，3 min）：`suggest(opts?: { useSeed?: boolean })` 解析 textarea JSON 后传 seed、解析失败就地提示；增按钮；重跑绿，核对原「AI 建议蓝图」默认行为例仍绿。
  - [ ] FB-F4-3-S3（守，2 min）：`grep -n "基于已有草稿扩展\\|seed" apps/web/src/pages/BookDetailPage.tsx`，核对结果=按钮与传参各 1 处。

### FB-F3-1 routes.ts 槽区（R-F3-1/2/3）

- **文件**：改 `apps/server/src/http/routes.ts:452-459`（含 `:443-448` 调用实参另见 FB-F3-2）；测 `test/http/blueprint-suggest.test.ts:45,72-75`、`test/plot.test.ts:111-137`。
- **Interfaces / 接口**：Consumes=`book.description`、`ContextSlot`（`context/assembler.ts:4-10`）；Produces=新 `worldview` stable 槽 `budgetChars: 2000`、`plotReference` 1500、`warnings` 追加超截断项；其余槽字面量不变。
- **步骤**：
  - [ ] FB-F3-1-S1（红，3-4 min）：按 R-F3-1/R-F3-2 增两例、按 R-F3-3 改 task 断言；跑定向 `-t 'worldview|plotReference|task'`，核对结果=**3 红**（无 2000 槽/600 截断/仍含书籍简介）。
  - [ ] FB-F3-1-S2（绿，4-5 min）：按 §3.3 加 worldview 槽与 warning、plot 600→1500；重跑绿，核对 outlineCard/LANDING 既有例仍绿。
  - [ ] FB-F3-1-S3（守，2 min）：跑 `grep -n "budgetChars: 600\\|budgetChars: 1500\\|budgetChars: 2000" apps/server/src/http/routes.ts`，核对结果=imitation/outline 仍 600、spectrum/plot 1500、worldview 唯一 2000。

### FB-F3-2 render 签名随迁 + config 注释

- **文件**：改 `apps/server/src/prompts/render.ts:160-177`；`apps/server/src/config.ts:141`；`apps/server/src/http/routes.ts:443-448`（调用实参）。
- **Interfaces / 接口**：Consumes=`renderBlueprintTask(args)` 调用方唯一 `routes.ts:443`（已核）；Produces=签名删 `bookDescription`、产出无【书籍简介】行；其他 render 函数零改动。
- **步骤**：
  - [ ] FB-F3-2-S1（红，2 min）：在 `blueprint-suggest.test.ts` 断言 task 不含「【书籍简介】」；跑定向，核对结果=**1 红**。
  - [ ] FB-F3-2-S2（绿，2-3 min）：删 render.ts 字段与行、删 routes.ts 实参、改 config.ts 注释；重跑绿，核对 `prompts/contract.test.ts` 既有契约例仍绿。
  - [ ] FB-F3-2-S3（守，2 min）：跑 `grep -rn "renderBlueprintTask" apps/server/src`，核对结果=仅 `render.ts:160`/`routes.ts:46 import`/`routes.ts:443` 三处、无 bookDescription 残留。

### FB-F5-1 批量端点纯编排（R-F5-1/2）

- **文件**：新增 `apps/server/src/http/blueprint-batch.ts`；改 `apps/server/src/http/routes.ts` 增端点；测新增 `test/http/blueprint-batch.test.ts`。
- **Interfaces / 接口**：Consumes=`chaptersRepo.listChapters/upsertBlueprint`、注入的 `suggestOnce(chapterNo)`；Produces=`batchBlueprintSuggest(...)` 返回 `{ generated, failed, items[] }`；不调 `runsRepo.createRun`。
- **步骤**：
  - [ ] FB-F5-1-S1（红，3 min）：新增 `blueprint-batch.test.ts` 按 R-F5-1/R-F5-2 两断言；跑定向，核对结果=**2 红**（端点/函数不存在）。
  - [ ] FB-F5-1-S2（绿，4-5 min）：按 §3.4 实现串行编排与端点；重跑绿，核对既有 `POST /api/runs` 400 例仍绿。
  - [ ] FB-F5-1-S3（守，2 min）：跑 `git diff -- apps/server/src/worker/queue.ts apps/server/src/http/routes.ts | grep -n "createRun\\|queue.ts"`，核对结果=新 diff 段零命中（不跑正文）；`grep -n "Promise.all" apps/server/src/http/blueprint-batch.ts` 零命中。

### FB-F5-2 web 批量按钮（R-F5-3）

- **文件**：改 `apps/web/src/pages/BookDetailPage.tsx:1024-1044`；测 `apps/web/src/pages/BookDetailPage.test.tsx`。
- **Interfaces / 接口**：Consumes=`api.batchBlueprintSuggest(bookId)`（client.ts 新增一行）；Produces=按钮禁用态与进度文案；不改单章建议路径。
- **步骤**：
  - [ ] FB-F5-2-S1（红，2-3 min）：按 R-F5-3 增两断言；跑定向，核对结果=**1 红**。
  - [ ] FB-F5-2-S2（绿，3 min）：加 client 方法、按钮与进度 state；重跑绿，核对「AI 建议蓝图」用例仍绿。
  - [ ] FB-F5-2-S3（守，2 min）：`grep -n "批量" apps/web/src/pages/BookDetailPage.tsx`，核对结果=按钮与进度文案各 1 处。

### FB-F2-1 shared DTO + server schema

- **文件**：改 `packages/shared/src/api.ts`（增 `CharacterInstantiateDraftDto`）；`apps/server/src/http/schemas.ts:25-33` 旁（增 `characterInstantiateSchema`）；测 `test/http/character-instantiate.test.ts` 的 schema 例。
- **Interfaces / 接口**：Consumes=`z`；Produces=`CharacterInstantiateDraftDto { cards, warnings }`、`characterInstantiateSchema.maxCards` 1-8；人物卡 CRUD schema 不动。
- **步骤**：
  - [ ] FB-F2-1-S1（红，2 min）：新测试断言 `maxCards=9 → 400`；跑定向，核对结果=**1 红**。
  - [ ] FB-F2-1-S2（绿，2 min）：加 DTO 与 schema；重跑绿，核对 `settings-import.test.ts:66` 仍绿。
  - [ ] FB-F2-1-S3（守，2 min）：`git diff -- apps/server/src/http/schemas.ts` 目视仅新增 schema，无改动 `createCharacterSchema`。

### FB-F2-2 实例化解析纯函数 + 端点（R-F2-1/2/3）

- **文件**：新增 `apps/server/src/http/character-instantiate.ts`；改 `apps/server/src/http/routes.ts` 增端点；测新增 `test/http/character-instantiate.test.ts`、`test/pipeline/chapter.test.ts:422`。
- **Interfaces / 接口**：Consumes=`book.spectrumProfileId`、planner provider；Produces=`{ cards: Array<{name, baseSetting}>, warnings: string[] }` 草稿 DTO；`renderCharacterCards`（`render.ts:33`）消费形态不变；不写 characters 表。
- **步骤**：
  - [ ] FB-F2-2-S1（红，3-4 min）：按 R-F2-1/2/3 增三断言；跑定向，核对结果=**3 红**。
  - [ ] FB-F2-2-S2（绿，4-5 min）：按 §3.5 实现行协议解析（禁 JSON）、重名 warning、≤8、>spectrum 行数不截断、8000 槽断言；重跑绿，核对人物卡 CRUD 既有例仍绿。
  - [ ] FB-F2-2-S3（守，2 min）：`grep -n "JSON.stringify\\|JSON.parse" apps/server/src/http/character-instantiate.ts`，核对结果=仅用于 baseSetting 字段值校验与序列化，prompt 行协议零 JSON；`grep -n "409" apps/server/src/http/routes.ts` 仍命中人物卡 POST。

### FB-F2-3 web 实例化按钮（R-F2-4）

- **文件**：改 `apps/web/src/pages/BookDetailPage.tsx:792+`（人物卡区）；测 `apps/web/src/pages/BookDetailPage.test.tsx`。
- **Interfaces / 接口**：Consumes=`api.instantiateCharacters(bookId)`（client.ts 新增一行）、`book.spectrumProfileId`；Produces=禁用+指引、草稿预览与逐卡保存；保存复用既有 createCharacter。
- **步骤**：
  - [ ] FB-F2-3-S1（红，2-3 min）：按 R-F2-4 增禁用+指引断言；跑定向，核对结果=**1 红**。
  - [ ] FB-F2-3-S2（绿，3-4 min）：加按钮/指引/草稿预览；重跑绿，核对人物卡 CRUD UI 既有用例仍绿。
  - [ ] FB-F2-3-S3（守，2 min）：`grep -n "实例化\\|请先在" apps/web/src/pages/BookDetailPage.tsx`，核对结果=按钮与指引各 1 处。

## 6. 验收（以下命令均在项目根目录执行）

1. **五钉值**：`grep -n "30 字\|2000\|seed\|批量\|实例化" docs/plans/2026-11-25-four-feedbacks-batch.md` → §1/§3 即命中五 feature 钉值，各有任务承接（FB-F1-1 / FB-F3-1 / FB-F4-1 / FB-F5-1 / FB-F2-2）。
2. **D 区覆盖**：§2.5 表 D1-D15 逐文件有处置行（随迁/新增/不动三态之一）；其中 inject-blocks「不含 freqTerms」钉由 FB-F1-2 显式推翻兑现。
3. **文件数**：每任务源文件数 ≤2（测试另计）；`git diff --stat` 每卡提交仅含该卡白名单文件。
4. **全链**：`pnpm --filter @inkforge/server test -- test/llm/plainproto.test.ts test/style/inject-blocks.test.ts test/http/blueprint-suggest.test.ts test/http/blueprint-batch.test.ts test/http/character-instantiate.test.ts` → 全绿；`pnpm test` → 全绿且计数 ≥830；`pnpm typecheck`、`pnpm lint` → 全绿；`pnpm --filter @inkforge/web test` → 全绿且计数只增。
5. **副作用白名单**：`git diff -- apps/server/data apps/server/src/style/merge.ts apps/server/src/worker/queue.ts` 输出为空；全文逐段目视确认无占位符、无悬置项、无死行（步骤均可执行且带可核对结果）。

## 7. 自审五查（写完计划即执行，逐条打勾留痕）

- [x] **规格覆盖** — 五 feature 决策逐条映射到 §2.1/任务组；§3.6 十九例均带测试名与断言；§6.1 grep 五字面量齐；改前锚点 28 条逐条有处置（§2.2）；D1-D15 逐文件三态齐（§2.5）。
- [x] **步骤唯一可写** — 各卡步骤落点唯一：`analysis.ts:23/:62-74`、`plainproto.ts:341-347/:351/:434-441`、`inject.ts` 新增函数、`assembler.ts`/`rewrite.ts` 新槽、`config.ts` 预算、`chapter.ts:192-240`、`routes.ts:62/:452-459/:443-448/:509`、新增三纯函数文件、`render.ts:160-177`、web 三按钮区；`FREQ_TERMS_MAX=10`、imitation/outline `600`、`queue.ts:62`、blueprint-less 400、人物卡 CRUD、`expectsLanding` 均已明确排除（§2.4.2）。
- [x] **类型一致** — 无破坏性签名改动：`ParsedAnalysis` 只增字段、`analyzeStyle`/`analyzeSpectrum` 返回类型不变、`renderStyleBlock` 签名不变、`mergeSeedIntoBlueprint`/`batchBlueprintSuggest`/`character-instantiate` 为新增、`ChapterBlueprint` 形状不变、`StyleAnalysisDto` 零改动；web `BlueprintSuggestBody` 只加可选 `seed`。
- [x] **隐含输入类** — 已纳入：逃生门（真无高频词不重试）、NAMES 剔除先于缺口统计、自定义模板路径无默认量条、第二轮仍不足只 warning 不抛、seed JSON.parse 失败就地提示不发请求、畸形 seed 400 禁 500、worldview 2000 head 截断+warning、planner 手动生效边界、批量单章失败不中断且不跑正文、baseSetting JSON 对象校验（数组/null/非法串丢弃）、批内+既有重名、>spectrum 行数多卡、characters 8000 head 截断、web 未绑定禁用指引；基线 818 只增不减按 §3.6 计为 ≥830。
- [x] **比例** — 源文件与任务配比：15 卡覆盖 15 处主要写面（含 3 个新增纯函数文件），每卡 3 步（红/绿/守），共 45 步均 2-5 min；server 新增 12 例 = 每 feature ≥2 例（F1/F4/F3/F5/F2 分别 3/2/2/2/3），随迁 5 例不减计数；规格/约束/任务/验收/自审五段职责不重叠，无重复长段。
