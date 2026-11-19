# 设定集 MD 直接导入 实现计划

**目标：** 新书（/new）与续写（/continue）两个入口都能选择本地设定集 MD，一键解析预览、确认后建书并写入全套设定（世界观/剧情大纲/人物卡/大纲树/伏笔），导入即可驱动生成或续写。

**架构：** 纯函数解析器 `settings-import.ts`（服务端，无 LLM、内容无关）→ `POST /api/settings-import/preview` 出草稿 → 预览可编辑 → `POST /api/settings-import/apply` 事务建书（book+characters+outline-tree+foreshadowings+原文件归档）。两个入口复用同一个 `SettingsImportPanel` 组件；新书入口额外把章级梗概灌入现有「蓝图审阅」步骤，不新增任何章节写库路径。

**规格：** 本文档 §映射表（来源=owner 提供的设定集 MD 骨架，中性化分析）。本会话 owner 明示主模型独自完成不外派，计划真值=本文档（无 code-planner 产出）。

**拍板记录（DEC-2026-1120-04，owner 三问裁决 2026-11-20）：**
1. **完全加载**——设定好的 MD 导入后必须完全加载：落库无丢失（结构化字段+整篇归档），且管线设定槽扩容承载全量（BUDGETS_DRAFT worldview 1000→16000、characters 800→8000；BUDGETS_OUTLINE worldview 5000→16000、characters 1200→8000、outline 2000→8000；8k 档不动）。依据：local contextWindow=524288、总预算≈515k 字符、现槽合计≈10k，扩容余量巨大；扩槽只对长设定生效（短设定按实际长度取用），溢出收缩逻辑不会触发。
2. **文风规范节顺带导入风格档案**：解析器提取文风节原文 → apply 建书+归档后调现成 `analyzeStyle`（style/analysis.ts，行协议 DIM/AXIS/RULES/TERMS，planner provider）→ `saveStyleProfile`+`buildStyleBundle` 单主绑定；<200 字跳过+警示；失败不回滚建书、warning 呈现。
3. **新书导入确认后进蓝图审阅步**（维持原案）：章级梗概预填审阅列表，不自动发起 generate run。

## MD 设定集框架结构（中性化骨架，仅结构不含内容）

样本 MD（约 320 行）是「设定集」文体的标准骨架，11 个编号 H2 节 + 头部元信息：

| # | H2 节（关键词识别） | 内部形态 | 墨炉落点 |
|---|---|---|---|
| 0 | H1 标题 + 首个 blockquote（定位一句话）+ 标注约定 | 一行标题、`> 定位` 引文 | title / description 首段 |
| 1 | 原文解剖 | 表格 + 小节 + 编号清单（其中「悬置线清单」为编号串） | 仅 H3 悬置线 → foreshadowings；余不映射 |
| 2 | 参照解剖 | 手法表（T1–T10） | 不映射（归档兜底） |
| 3 | 世界观 | H3 时空/生态/内核命题 | description 主体 |
| 4 | 规则体系 | 编号规则 + 写作纪律 | description 尾段 |
| 5 | 人物圣经 | H3 核心（粗体段落）/ 常驻（表格）/ 外围（bullet 池） | characters[]（`{"设定": text}` 包裹，沿现有约定） |
| 6 | 总大纲 | H3 卷（`### 卷X 《题》（第 a–b 章）`）→ 行内篇（`37–41 **年会篇**：`）→ 章（`1. **题**（梗概）`、单行多章 `；` 分隔） | outline tree（卷→阶段→卡）+ outline（卷级梗概聚合）+ outlineItems（章→蓝图预填） |
| 7 | 场景资产库 | 复用表 | 不映射（归档兜底） |
| 8 | 关系阶梯 | 阶梯定义 | 不映射 |
| 9 | 文风与语言规范 | 规范清单 | styleSection 原文 → apply 时 LLM 分析成风格档案并绑定（拍板②） |
| 10 | 改写对照表 | 要素表 | 不映射 |
| 11 | 缺口清单 | Q1–Q10 | 不映射 |

**生成管线预算（拍板①扩容后）：** drafter worldview 槽=16000 字、characters 槽=8000 字、blueprint 槽=1000、continuity 槽=2500（伏笔经 continuity snapshot 生效）；outline-suggest worldview=16000/characters=8000/outline=8000。8k 小模型档（BUDGETS_DRAFT_8K）不动——物理不可能完全加载，该档位下设定仍完整落库、提示按档截断。整篇 MD 归档到 `data/imports/<bookId>-settings.md` 兜底（沿 data/exports 先例），未映射节信息不丢。

## 全局约束

- 解析器**内容无关**：只认标题/表格/编号骨架，不感知正文语义；测试夹具一律用中性仿形设定集（《示例之作》/主角/配角甲），原始 MD 不进仓库、不进测试。
- 人物卡 baseSetting 沿 `{"设定": text}` JSON 包裹约定（NewBookIdeaPage 先例，BookDetailPage 展示层按此解析）。
- 伏笔 plantedCh 必填（schema 正整数）：MD 无章号 → 默认 1，预览可改。
- 服务器 apply 单事务（better-sqlite3 嵌套事务=savepoint，createBook 内部事务安全嵌套）；文风档案导入在事务+归档**之后**执行，失败不回滚建书；执行者只 commit 不 push。
- 预算钉值（拍板①）：BUDGETS_DRAFT `{worldview: 16000, characters: 8000}`，BUDGETS_OUTLINE `{worldview: 16000, characters: 8000, outline: 8000}`，其余槽位与 draft8k/qc/rewrite/planner 档全部不动；config.test.ts 钉值同步更新。
- 提交：Conventional 前缀+中文描述，正文 `verify:` + GUI 标注「GUI 未验证（owner 真实测试）」。
- 新书入口**不**在 apply 里建章（adopted 语义归现有审阅步骤管）；apply 结果只回传 outlineItems 供审阅预填。

## 任务 1：解析器纯函数 + 共享类型

**文件：** Modify `packages/shared/src/api.ts`（追加类型）；Create `apps/server/src/settings-import.ts`；Create `apps/server/test/settings-import.parse.test.ts`

**接口：** Produces——
```ts
// shared/api.ts 追加
export interface SettingsImportDraftDto {
  title: string;
  description: string;            // 定位一句话+世界观节+规则体系节 聚合（拍板①扩槽后全量承载）
  outline: string;                // 总大纲卷级梗概聚合
  characters: Array<{ name: string; baseSetting: string }>;  // baseSetting 已按 {"设定":text} 包裹
  outlineTree: OutlineTreeDto;
  foreshadowings: Array<{ description: string; plantedCh: number }>;
  outlineItems: OutlineItemDto[];         // 章→蓝图预填（chapterNo, goal=梗概, beats=[]）
  chapterTitles: Record<string, string>;  // 章号→章题（审阅步 titles 预填；JSON 键为字符串）
  styleSection: string;           // 文风与语言规范节原文（未识别=空串；拍板②）
  importStyle: boolean;           // 文风节导入风格档案并绑定（预览开关，默认 true）
  warnings: string[];
}
export interface SettingsImportPreviewBody { content: string }
export interface SettingsImportApplyBody { content: string; draft: SettingsImportDraftDto }
export interface SettingsImportApplyResult {
  bookId: string;
  sourcePath: string;
  styleProfileId: string | null;  // 拍板②：文风节成功导入=档案 id；跳过/失败=null（warnings 说明）
  warnings: string[];             // apply 期警示（文风步跳过/失败）
  counts: { characters: number; volumes: number; stages: number; cards: number; foreshadowings: number };
  // 实现期裁决一：blueprintChapters 从 counts 移除——apply 不落章（adopted 语义归审阅步），章数前端自 draft.outlineItems 可得
}
// settings-import.ts
export function parseSettingsCompendium(raw: string): SettingsImportDraftDto;
```

**解析规则（钉死）：**
1. H2 分节：`/^##\s*(\d+[.、]?\s*)?(.+)$/` 按「世界观/规则体系/人物圣经/总大纲」关键词（包含匹配）归类；未匹配节忽略。
2. title：第一个 H1 → 取 `《(.+?)》` 内文；无则去尾部「设定集/扩写设定集」等后缀词后取前 40 字。
3. description = 首个 blockquote 文本（定位句）+ `\n\n` + 世界观节全文 + `\n\n` + 规则体系节全文；>16000 字 push warning「description 现有 N 字，超出世界观槽预算 16000 字的部分在生成时会被截断，建议精炼」。
4. characters：人物圣经节内 ①粗体行段 `^\*\*(.+?)\*\*`（名=粗体首段剥括号注记，设定=该段至下一空行/下一粗体行）；②表格行首格粗体（设定=三格拼接）；③bullet 池逐条 `-\s*\*\*(.+?)\*\*：`。按 name 去重（重复 push warning）；name 空跳过。
5. outlineTree：总大纲节 H3=`### 卷…` → volume（title 取《》内文或整行、body=H3 行余文）；卷体行先试阶段头 `^(\d+)\s*[–—-]\s*(\d+)\s*\*\*(.+?)\*\*\s*[：:]` → stage；章项全局正则 `(?:^|；)\s*(\d+)(?:\s*[–—-]\s*(\d+))?\s*[.、]?\s*\*{0,2}([^*（(；\n]+)\*{0,2}\s*(?:[（(]([^）)]*)[）)])?` → card{title, body=梗概, chapterFrom, chapterTo}（区间 N–M 为一张卡）；无编号行 → card{chapterFrom:null}；卷下无阶段 → 单 stage（title=''）；cards 总数 cap 200（超出 push warning 截断）。
6. outline = 逐卷一行 `卷X《题》（第a–b章）：H3余文`；>8000 字 push warning（大纲槽预算）。
7. foreshadowings：任意节 H3 标题含「悬置|伏笔」→ 其下编号项（行内 `；` 分隔或逐行）→ 每条 plantedCh=1；cap 50。
8. outlineItems = cards 中 chapterFrom≠null 逐章展开（区间卡不展开）→ `{chapterNo, blueprint:{goal: body||title, beats:[], mustHaveBeats:[], bannedTopics:[]}}`，chapterNo 升序去重；chapterTitles 同步填。
9. 文风节：H2 标题含「文风」→ `styleSection`=节全文（剥 H2 行本身）；未识别=空串。
10. 全空 draft（title 空且四类全空）→ warning「未识别到设定集骨架，可手填后导入」。

**步骤：**
- [x] 写 `settings-import.parse.test.ts`：中性夹具（含粗体段人物、表格人物、bullet 池人物各 ≥1；卷三形态：逐行编号章 / 区间篇行 / 单行多章 `；`；悬置线行内编号串；文风规范节含 2 条 bullet）断言 title/description 聚合序、characters 5 张（含外围聚合卡）、树 2 卷 3 卡、foreshadowings 3 条 plantedCh=1、outlineItems 2 条、styleSection 提取、warnings 含超长提示 → 红
- [x] `settings-import.ts` 实现十条规则 → 绿
- [x] 边界用例：空串、无 H2 任意文本、半角括号/连字符混排、人物重名、>200 卡、无文风节 → 断言不抛异常+warning 语义
- [x] `pnpm --filter @inkforge/server test -- settings-import` 全绿

## 任务 2：HTTP 端点 + zod schema + 归档 + 拍板①扩槽 + 文风节导入风格档案

**文件：** Modify `apps/server/src/config.ts`、`apps/server/test/config.test.ts`、`apps/server/src/http/schemas.ts`、`apps/server/src/http/routes.ts`；Create `apps/server/test/http/settings-import.test.ts`

**接口：** Consumes 任务 1 的 `parseSettingsCompendium` 与 `analyzeStyle`（style/analysis.ts 现成：单轮+修复重试+meta.step 'summarize' 可 mock）。Produces——
- **拍板①扩槽**：BUDGETS_DRAFT worldview 1000→16000、characters 800→8000；BUDGETS_OUTLINE worldview 5000→16000、characters 1200→8000、outline 2000→8000；config.test.ts 四处钉值同步（draft/outline 两 describe + 相关断言行），其余档不动。
- `POST /api/settings-import/preview` body `{content}` → 200 `SettingsImportDraftDto`（纯解析，无库操作）
- `POST /api/settings-import/apply` body `{content, draft}` → 201 `SettingsImportApplyResult`；流程：draft zod 整形（title min1；characters 逐条 name min1、baseSetting 缺省 '{}'、按 name 去重；foreshadowings plantedCh int≥1、cap 50；outlineTree 沿 outlineTreePutSchema 的 tree 形状校验；cards cap 200；importStyle boolean 缺省 true）→ `db.transaction` 内：booksRepo.createBook（title/description/outline/characters）+ outlineRepo.replaceOutlineTree + continuityRepo.upsertForeshadowing 逐条 → 事务外 `fs.mkdir(path.join(config.dataDir,'imports'),{recursive:true})` + 写 `<bookId>-settings.md`（content 原文）→ **文风步（拍板②，事务+归档之后）**：`draft.importStyle && styleSection.trim() 非空白 && 去空白 ≥200 字` 才执行——`analyzeStyle({provider: plannerProvider}, {samples:[styleSection]})` → `saveStyleProfile(db, {name: title+'·文风规范', source: styleSection, analysis, samples:[styleSection], evaluation: []})` → 重查档案行 `contentFromProfileRow` → `buildStyleBundle({primaryProfileId, auxProfileIds: [], dimsSource: {}, profiles, weights: undefined})` → `booksRepo.setBookStyleBinding(db, bookId, {primaryProfileId, auxProfileIds: [], dimsSource: {}, weights: {}}, JSON.stringify(bundle))`；任一步抛错 → warning「文风节导入风格档案失败：<msg>（书已建成，可在蒸馏工作台手动蒸馏）」，styleProfileId=null；<200 字 → 跳过 + warning；成功 → styleProfileId=档案 id → 回 bookId/sourcePath/styleProfileId/counts。

**步骤：**
- [x] config.ts 两预算表改值 + config.test.ts 钉值同步，跑 config 测试绿
- [x] schemas.ts 追加 `settingsImportPreviewSchema` / `settingsImportApplySchema`（apply.draft 复用任务 1 DTO 形态，zod 逐字段）
- [x] routes.ts 两路由注册（`/api/settings-import` 前缀不与 `/api/books/:bookId` 冲突；plannerProvider 沿 `state.plannerProvider ?? createRoleProvider(config,'planner')` 缝）
- [x] http 测试：preview 断言中性夹具草稿形态；apply（plannerProvider mock canned=合法 DIM/AXIS/RULES 行协议）断言 201 + GET /api/books/:id 回读 description/outline/characters 数/GET outline-tree 回读卷卡数/GET foreshadowings 回读条数/styleBinding.primaryProfileId 非空/sourcePath 文件存在且内容=入参 content/styleProfileId 回传非空；apply（mock canned=空文本）断言书仍建成+warnings 含文风失败文案+styleProfileId=null；styleSection<200 字断言跳过+warning；apply 缺 title → 400；空 content → 400
- [x] `pnpm --filter @inkforge/server test -- settings-import config` 全绿

## 任务 3：前端 client 方法 + SettingsImportPanel 组件 + decodeTextFile 抽出

**文件：** Modify `packages/shared/src/api.ts`（无新增，任务 1 已加）、`apps/web/src/api/client.ts`、`apps/web/src/pages/NewBookPage.tsx`；Create `apps/web/src/components/textFile.ts`、`apps/web/src/components/SettingsImportPanel.tsx`、`apps/web/src/components/SettingsImportPanel.test.tsx`

**接口：** Consumes 任务 2 端点。Produces——
- client.ts：`importSettingsPreview(body): Promise<SettingsImportDraftDto>`、`importSettingsApply(body): Promise<SettingsImportApplyResult>`（沿现有 `req` 形态）
- textFile.ts：`decodeTextFile(buf: ArrayBuffer): DecodedText` 整体从 NewBookPage 迁入；NewBookPage 改 `export { decodeTextFile } from '../components/textFile'`（保测试导入兼容）
- `SettingsImportPanel({ onApplied }: { onApplied: (r: { result: SettingsImportApplyResult; draft: SettingsImportDraftDto }) => void })`：粘贴 textarea（实现期裁决二：与 NewBookPage「粘贴全文，或选择本地文件」惯例对齐）+ 隐藏 file input（id=`settings-import-file`，accept `.md,.txt`）+ 虚线 dropzone 标签（沿 NewBookPage 样式）→ 选文件 decode 回显 → 「解析预览」调 preview → 预览卡：书名 input / 世界观 textarea+字数徽标（超 16000 显警示色文案）/ 剧情大纲 textarea / 人物卡行（姓名 input+设定 textarea+移除，沿 NewBookIdeaPage 卡样式）/ 大纲树只读摘要「N 卷 · N 卡（导入后书详情页可编辑）」/ 伏笔行（描述 input+plantedCh number min1）/ 文风节区（styleSection 非空时显示：checkbox「导入文风节为风格档案并绑定本书」默认勾选，绑 draft.importStyle）/ warnings 列表 / 「确认导入建书」调 apply → onApplied。busy 双按钮防重；错误 pre 沿现有 danger 样式。

**步骤：**
- [x] 抽 decodeTextFile → textFile.ts + NewBookPage re-export，跑 NewBookPage.test.tsx 仍绿
- [x] client.ts 两方法 + shared 类型导入
- [x] Panel 组件实现
- [x] Panel 测试（vi.stubGlobal fetch mock）：选文件→解析→预览含书名/人物卡行/伏笔行/文风节勾选→确认→onApplied 收到 bookId 与 counts；取消文风勾选→apply 入参 importStyle=false；preview 失败显错误文案
- [x] `pnpm --filter @inkforge/web test -- SettingsImportPanel` 全绿

## 任务 4：续写入口接入（NewBookPage）

**文件：** Modify `apps/web/src/pages/NewBookPage.tsx`、`apps/web/src/pages/NewBookPage.test.tsx`

**接口：** Consumes 任务 3 Panel。行为钉死：step 1 建书按钮下方加分隔「或从设定集直接导入（自动建书+写入世界观/大纲/人物/伏笔）」+ Panel；`onApplied` → `setWiz({ step: 2, bookId: result.bookId })`（流入现有导入原文步，向导其余不变）；step 2 不显示 Panel。

**步骤：**
- [x] 接入 + 条件渲染
- [x] 测试新用例：mock apply 命中后出现「选择本地 txt / md 文件」（step 2 标志）且页面仍带 bookId 上下文；原建书/拆章用例不回归
- [x] `pnpm --filter @inkforge/web test` 全绿

## 任务 5：新书入口接入（NewBookIdeaPage）

**文件：** Modify `apps/web/src/pages/NewBookIdeaPage.tsx`、`apps/web/src/pages/NewBookIdeaPage.test.tsx`

**接口：** Consumes 任务 3 Panel。行为钉死：setup 步顶部加「已有设定集？直接导入」区 + Panel；`onApplied` → `setBookId(result.bookId)`；若 `draft.outlineItems.length > 0`：`setItems(draft.outlineItems)` + `setTitles(预填 draft.chapterTitles)` + `setAdopted(全采用)` + `setStep('review')`（跳过 LLM suggestOutline，零模型调用）；否则落回现有 `suggestOutline(bookId,{chapterCount})` 路径并提示「设定集未含章级大纲，已按章节数生成蓝图」。审阅/保存/发起三步代码不动。

**步骤：**
- [x] 接入 + 分支逻辑（items 空回退 suggestOutline）
- [x] 测试新用例：带章级梗概夹具 → 导入后直接进审阅列表（断言「第1章」行出现、无「蓝图勾画中」）；空 outlineItems 夹具 → 走 suggestOutline mock
- [x] `pnpm --filter @inkforge/web test` 全绿

## 任务 6：全量验证 + 提交

**步骤：**
- [x] `pnpm typecheck` 全仓过
- [x] `pnpm lint` 过
- [x] `pnpm test` 全绿（测试基线只增不减）
- [x] 手动冒烟：`pnpm dev:server` + preview/apply 两 curl（真实样本 MD 本机验证，内容不入库外传）
- [x] 提交（feat(web,server)：设定集 MD 直接导入——新书/续写双入口+解析预览+事务落库；正文 verify: 全量测试/typecheck/lint 结果 + `GUI 未验证（owner 真实测试）`），不 push

## 自审五查记录

1. 规格覆盖：MD 骨架 11 节全部有归宿（映射/风格档案/归档或显式不映射）；拍板①②③均已落到具体任务 ✔
2. 步骤唯一可写：解析十条规则、apply 事务序+文风步三态、扩槽钉值、两入口分支条件均已钉死 ✔
3. 类型一致：DraftDto 字段名（outlineItems/chapterTitles/styleSection/importStyle）与 ApplyResult.styleProfileId 各任务引用一致；chapterTitles 键为 string（JSON 序列化约定）✔
4. 输入类覆盖：空/任意文本（T1 规则 10）、区间篇行（T1 规则 5）、半全角混排（T1 边界）、重名去重（T1 规则 4+T2 zod）、cap 截断（T1 规则 5/7+T2 schema cap）、文风节缺失/<200 字/LLM 失败（T1 规则 9+T2 文风步三态）✔
5. 比例：决策密度优先，无函数体抄写 ✔
