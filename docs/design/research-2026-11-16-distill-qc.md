# 调研报告 R2：蒸馏管线现状对照目标能力矩阵 + 评分参数可调面（2026-11-16）

对应调研卡：docs/design/card-research-2026-11-16-distill-qc.md。只读调研，本文为唯一新增文件。

## 一、结论先行

### 1.1 附录A 目标能力矩阵七行差距状态表

| # | 目标能力 | 状态 | 差在哪个环节 | 关键证据 |
|---|---------|------|------------|---------|
| 1 | 个人参考库（上传/粘贴、进度、失败原因、档案、重新蒸馏、删除） | **部分** | 粘贴✓、.txt/.md 文件✓（客户端读入）；**进度✗**（同步阻塞无进度事件）、**重新蒸馏✗**（无任何入口）、**删除✗**（无端点无按钮）；失败原因仅一条 502 错误串 | routes.ts:656；StyleProfilesSection.tsx:24-40,156-166；全仓无 `app.delete('/api/style-profiles` |
| 2 | 多格式导入 .txt / .epub | **部分** | .txt/.md 经前端 FileReader 读入 textarea；**.epub 全仓 0 命中**（无解析代码、无依赖） | StyleProfilesSection.tsx:156-166；`grep -rniE "epub" apps/server/src apps/web/src packages/shared/src` 空结果 |
| 3 | 风格蒸馏七维档案 | **已实现（产出层）**，注入层缺失 | 七维/六轴/RULES/TERMS 已提取、落库、版本化；但 **dims/axes 不进章节生成上下文**（见追问 b） | analysis.ts:14-21,108-113；chapter.ts:194 |
| 4 | 结构分析可编辑 + 确认后带入 + 可取消 | **部分** | 蒸馏侧：预览可编辑（七维/六轴/规则/术语）+ 确认入库/放弃 ✓；**仿写侧结构拆解预览为只读列表，不可编辑** | StyleProfilesSection.tsx:181-243；ImitationProfilesSection.tsx:159-170 |
| 5 | 创作联动：多选参考 + 结构快照带入 | **部分** | 一书仅能绑 **1 个**风格档案（单选下拉）；**无多选**；仿写「结构快照」仅注入 blueprint-suggest 的 planner 槽（600 字），不进正文生成 | BookDetailPage.tsx:11-23；routes.ts:233-241 |
| 6 | 可选文风示例（默认关闭） | **缺失** | 绑定档案即**恒注入**范例片段，无任何开关，默认即开 | chapter.ts:221；全仓无示例开关字段 |
| 7 | 人格提炼：档案→个人风格模板复用 | **缺失** | persona 快照=「绑定时刻的档案副本」，非可独立复用的模板实体；无「档案→模板」转换流 | routes.ts:593-599；chapter.ts:184-192 |

### 1.2 Q1 追问 a–i 逐条结论

- **a) 蒸馏执行形态 = 同步阻塞请求**。`POST /api/style-profiles/distill` 内 `await analyzeStyle(...)`（provider timeout 900000ms=15 分钟），无后台任务、无进度事件、无轮询端点；失败返回 502 `{error}`，UI 显示 `蒸馏失败：<message>`。对照：正文生成 run 才是后台队列（`POST /api/runs` → 202+runId，worker/loop.ts 轮询）。
- **b) renderStyleBlock 注入内容 = rulesText + 术语表 + 样本原文，七维/六轴结构化字段从未注入**（效果根因关键）。实际组装顺序两槽：① `styleRules` 槽 = `rulesData.rulesText`（rules_json 中的纯文本规则），system 稳定槽，预算 `budgets.draft.styleRules`=1000 字；② `fewShot` 槽 = `renderStyleBlock('', styleSamples, budgets.draft.fewShot=1500, styleTerms)`（注意首参传空串，因此块内只有【术语表】+【范例片段】），user 挥发槽。dims（七维描述）与 axes（六轴数值）只存在 rules_json 里，`chapter.ts` 仅解构 `{ rulesText, terms }`。另外：**full 模式重写不传 styleRules/fewShot**，整章重写时风格约束完全脱落。
- **c) voiceRefMetrics 已真接线（旧缺口 F2 已闭合，bfca407 属实）**。chapter.ts:108-118：generate 模式=绑定档案 metrics 快照（快照优先回落现值，损坏容错 undefined）；continue 模式=前文实算 `computeStyleMetrics(prevTexts)`；chapter.ts:271 传入 runL0Checks；l0.ts:170-172「voiceRefMetrics 存在才启用」style_drift，每超带项记 1 softMajor 进 gate。
- **d) 一书绑定 = 1 本（单档）**。DB 单列 `books.style_profile_id`；UI 为单选下拉 `<select>`。轮换逻辑仅样本级：`pickStyleSamples` 每章按 `(chapterNo-1) mod len` 轮换取 3 段。注意：API 支持传 `profileId:null` 解绑（styleBindSchema nullable），但 UI `onChange` 里 `e.target.value && onBind(...)` 忽略空值——**UI 实际无法解绑**。
- **e) 文风示例注入无开关，默认开（且关不掉）**。绑定即 `fewShot` 槽恒填，`BookSamplePicker` 只是样本导入器。
- **f) 风格档案无删除端点、无 UI 删除；「重新蒸馏」无入口**。唯一 DELETE 是仿写档案 `DELETE /api/imitation-profiles/:id`（UI 有删除按钮）；风格档案只有 GET 列表/版本视图。「重新蒸馏」全仓 0 命中（版本视图仅查看）。
- **g) .epub 解析无**（`grep -rniE "epub"` 全仓 0 命中，package.json 无相关依赖）。
- **h) persona 快照语义 =「书绑定时的档案快照」**：绑定即复制该版本档案的 rules_json+samples_json 存入 `books.style_snapshot_json`，后续改档案不影响已绑书（损坏回落现值）。它**不是**「可独立复用的个人风格模板」——无独立实体、无列表、无命名、无跨书复用语义；且 UI 还解绑不掉（见 d）。能力 7 的差距即在于此转换流缺失。
- **i) 七维字段类型：dims=`Record<StyleDimension, string>` 自由文本；六轴 axes=`Record<StyleAxis, number>` 0-100 整数**（协议 AXIS 行 0-100 整数；schema `z.number()` 无范围钳制，UI 预览编辑 clamp 0-100）；RULES 3-8 条可判分量化文本；TERMS 3-10 条。**六轴数值不参与 QC**：l0.ts / gate.ts 全文无 axes 引用，六轴仅存档展示 + 蒸馏预览可编辑。

### 1.3 Q2-4 两张可调面清单

**清单一：GUI 当前可调参数**

| 参数 | 位置 | 范围/默认 |
|------|------|----------|
| 本地端点地址 / API Key / 模型名 | SettingsPage.tsx:69-100（`PUT /api/settings`） | 保存后需重启 |
| mock 模式 | SettingsPage.tsx:86-89 | 默认关 |
| 蒸馏模板（覆盖 ANALYSIS_INSTRUCTION） | DistillPage.tsx:47-68（`PUT /api/settings/distill-template`） | 空串=默认 |
| 采样段数 maxSegments | StyleProfilesSection.tsx:169-173 | 4-20，留空走 sample.ts 默认 20（仅影响 fewShot 数） |
| 采样温度 temperature | StyleProfilesSection.tsx:174-177 | 0-1，留空默认 0.3 |
| 绑定/换绑风格档案 | BookDetailPage.tsx:333（单选；无解绑） | — |
| 仿写反推章数 chapterCount | ImitationProfilesSection.tsx:137-147 | 1-50 |

注意：API 层 `PUT /api/settings` 支持 cloud 三项（cloudBaseUrl/cloudApiKey/cloudModel），但 SettingsPage.tsx 表单未暴露 cloud 输入。

**清单二：仅存在于代码常量/环境变量的阈值（GUI 不可调）**

| 常量 | 当前值 | 位置 |
|------|--------|------|
| quality.scoreThreshold | 8.0 | config.ts:183 |
| quality.minGain | 0.05（5%，无改善即停） | config.ts:183 |
| quality.maxRounds | 2（run 级可传 1-5，UI 未传） | config.ts:183；schemas.ts:46 |
| quality.targetChars | 3000 | config.ts:183 |
| L0 length 容差 | ±20%（band=0.2） | l0.ts:113 |
| L0 replay_ngram | n=8，<0.35 | l0.ts:141 |
| L0 tail_replay | n=8，tail=200 字，<0.20 | l0.ts:145 |
| L0 echo_20gram | n=20，任一命中即失败 | l0.ts:147-153 |
| L0 plagiarism_ngram | ≥15 连续字 | l0.ts:87,156-157 |
| L0 style_drift 超带 | 相对偏差 >0.4，每项 1 softMajor | l0.ts:193 |
| gate 软硬合并线 | softMajors + L1 major ≥ 2 → rewrite | gate.ts:41-43 |
| gate blocker | ≥1 → rewrite | gate.ts:45-48 |
| L1 OVERALL 标尺 | 1-10 整数（无分档锚点定义） | prompts/render.ts:61 |
| draft 风格槽预算 | styleRules 1000 / fewShot 1500（8k 档两者皆 0） | config.ts:101,105,113 |
| QC/重写槽预算 | qc draft 6000 等 | config.ts:120-131 |
| 采样常量 | segmentChars 20000 / maxSegments 20 / fewShot count 12 / 窗 200-400 字 / heldOut 2 段 | sample.ts:3-4,20-22,47-50 |
| 蒸馏最小样本 | 去空白 ≥200 字 | routes.ts:659,681；schemas.ts:64 |
| 生成/重写温度 | draft 0.9 / rewrite 0.7 / qc 0.2 / 蒸馏·仿写 0.3 | chapter.ts:231,339；l1.ts:46；analysis.ts:45；imitation.ts:48 |
| LLM 上限 | maxOutput 8192；本地 contextWindow 524288 | config.ts:150-151 |
| 超时 | draft/rewrite 3600000 / qc 900000 / summarize 1200000 | config.ts:184 |
| 套话表路径 | `INKFORGE_CLIQUES_PATH`（env，唯一可 env 覆盖的质量项） | chapter.ts:27；config/quality/cliches.default.txt |

## 二、证据（关键行摘录 ≤5 行/条）

### 2.1 Q1 能力1（库/进度/删除）

- routes.ts:656-676（同步阻塞 + 502）：
  ```ts
  app.post('/api/style-profiles/distill', async (req, reply) => {
    ...
    const { analysis, evaluation } = await analyzeStyle(
      { provider }, { sourceText: body.text, samples: fewShot, heldOut, temperature: body.temperature, instruction: getDistillTemplate() || undefined });
    reply.send({ draft: { analysis, samples: fewShot, evaluation } });
    } catch (e) { reply.code(502).send({ error: (e as Error).message }); }
  ```
- routes.ts:656-693 两步确认门：distill 产 draft 不入库；`POST /api/style-profiles`（678）显式入库。
- StyleProfilesSection.tsx:158 `accept=".txt,.md"`（无 epub）；:24-40 `catch → setMsg('蒸馏失败：…')`（唯一失败呈现）；无删除按钮、无再蒸馏按钮。
- 全仓 `grep -rnE "router\.delete|'DELETE'" apps/server/src` 等价核查：仅 books:96、characters:144、foreshadowings:181、imitation-profiles:719 有 DELETE；**style-profiles 无**。

### 2.2 Q1-b 注入面（效果根因）

- inject.ts:16-23：
  ```ts
  export function renderStyleBlock(rulesText: string, samples: StyleSample[], budgetChars = 1200, terms?: StyleTermDto[]): string {
    const parts = [`【文风规则】\n${rulesText}`];
    if (terms && terms.length > 0) { parts.push(`【术语表】\n${...}`); }
    parts.push(...samples.map((s) => `【范例片段】\n${s.text}`));
  ```
- chapter.ts:194-196（只取 rulesText/terms/samples，dims/axes 被丢弃）：
  ```ts
  const rulesData = JSON.parse(rulesSource) as { rulesText?: string; terms?: StyleTermDto[] };
  styleRulesText = rulesData.rulesText ?? '';
  styleTerms = rulesData.terms ?? [];
  styleSamples = pickStyleSamples(JSON.parse(samplesSource) as StyleSample[], args.chapterNo);
  ```
- chapter.ts:217,221（两槽）：
  ```ts
  styleRules: styleRulesText || undefined,
  fewShot: styleSamples.length > 0 ? renderStyleBlock('', styleSamples, config.budgets.draft.fewShot, styleTerms) : undefined,
  ```
- assembler.ts:86-88（styleRules=system 稳定槽）；config.ts:101,105,113（styleRules 1000/fewShot 1500；8k 档 styleRules:0）。
- chapter.ts:315-330：full 重写 `buildRewriteSlots({...})` 参数仅 hardRules/worldview/blueprint/continuity/prevTail/draftBudgets——**无 styleRules/fewShot**（rewrite.ts:35-49 支持但未传）。
- 六轴无处消费：`grep -rnE "\.dims|\.axes"` 服务端仅 analysis.ts（自评拼要点）、plainproto.ts（解析）、schemas.ts（校验）；pipeline/context/prompts 0 命中。

### 2.3 Q1-c voiceRefMetrics

- chapter.ts:108-118：
  ```ts
  if (book.styleProfileId && runMode === 'generate') { ... boundProfileMetrics = JSON.parse(profile.metrics_json) ... }
  const voiceRefMetrics = runMode === 'continue' && prevTexts.length > 0 ? computeStyleMetrics(prevTexts.join('\n')) : boundProfileMetrics;
  ```
- chapter.ts:271 `voiceRefMetrics,`；l0.ts:170-172：
  ```ts
  // 7. style_drift（T32 接线；voiceRefMetrics 存在才启用）
  if (input.voiceRefMetrics) { const drift = checkStyleDrift(input.draft, input.voiceRefMetrics); softMajors += drift.overBandItems; ... }
  ```
- polish.ts:43-64,120 校对路径同接线。

### 2.4 Q1-d/e 绑定

- BookDetailPage.tsx:11-23 `StyleBindSelect`：单选 `<select>`，`onChange={(e) => e.target.value && onBind(e.target.value)}`（空值=解绑被忽略）。
- routes.ts:592-599 绑定即复制快照：
  ```ts
  booksRepo.setBookStyleProfile(db, bookId, body.profileId, {
    profileId: profile.id, version: profile.version, rulesJson: profile.rules_json, samplesJson: profile.samples_json });
  ```
- chapter.ts:184-192 快照优先回落；chapter.ts:221 fewShot 恒注入（无开关）。

### 2.5 Q1-h/i 档案结构

- analysis.ts:14-21（协议）：`DIM: <维度>: <描述>（七维…每维一行）`、`AXIS: <轴名>: <0-100 整数>（六轴…）`、`RULES: 3-8 条`、`TERMS: 3-10 条`。
- analysis.ts:108-113 落库：`rules_json = { rulesText, dims, axes, terms }`；:98-101 `metrics.selfScore/selfReason`。
- packages/shared/src/api.ts:301-305,313-314：`STYLE_DIMENSIONS`/`STYLE_AXES` 常量元组；`dims: Record<StyleDimension, string>`、`axes: Record<StyleAxis, number>`。
- schemas.ts:75-76：`dims: z.record(z.string(), z.string()); axes: z.record(z.string(), z.number())`（数值无范围约束，UI clamp 0-100：StyleProfilesSection.tsx:206-208）。

### 2.6 Q2-1 评分链

- l0.ts 9 项检查与阈值（上表）；硬失败集 l0.ts:177（style_drift 不入硬失败，走 softMajors）。
- l1.ts:24-71：整章送审 → `parseFindings`（OVERALL 1-10 + SEVERITY/DIMENSION/QUOTE/COMMENT）→ quote 非子串丢弃 → 解析失败修复重试一次。rubric 标尺 render.ts:57-75，仅「OVERALL: <1-10 整数>（整体评分）」，**无 8 分意味着什么的锚点定义**。
- gate.ts:26-62 判定序：①l0.hardFail → rewrite（轮未满）否则 needs_human；②softMajors+L1 major≥2；③blocker≥1；⑤'增益<minGain → needs_human（无改善即停，先于阈值）；④overall<8.0；⑥pass。

### 2.7 Q2-2 呈现链

- SSE 事件全集 domain.ts:42-53：`run.status | step.status | step.delta` 三类，**无 finding/score 事件**。
- useRunEvents.ts:24-48：仅监听 snapshot/run.status/step.status（step.delta 到达即走 `return prev` 分支被忽略）。
- RunPage.tsx:81-104：步/轮/状态/错误表；DashboardPage.tsx:22-45：章/步/耗时/输出 tok（`GET /api/runs/:runId/report` routes.ts:778-810 仅 ms+usage，无分数）；ChapterReaderPage.tsx:62-66：版本 chip 上 `v.params.overall.toFixed(1)分`——**全 UI 唯一的分数露点**。
- qc 步 outputJson（含 l0/l1/gate 全量）经 `GET /api/runs/:runId` 的 `steps[].outputJson` 可得（shared/api.ts:69-82），但 web 全仓 `grep findings|l0\.|l1\.|gate` 无消费。
- 阈值/评分含义解释文案：`grep -rniE "阈值|评分|解释|含义|图例" apps/web/src --include=*.tsx` 0 命中。

### 2.8 Q2-3 蒸馏自评

- analysis.ts:68-78：heldOut 非空时第二次调用 `SELF_EVAL_INSTRUCTION`（SCORE 1-5 钳制/REASON）→ parseSelfEval；缺行 evaluation=[]。
- analysis.ts:98-101 写入 `metrics.selfScore/selfReason`；展示 StyleProfilesSection.tsx:117 `自评 ${p.metrics.selfScore}/5`、:133 版本视图同款。

## 三、未找到项与已试搜索词

| 项 | 已试搜索词 | 结果 |
|----|-----------|------|
| .epub 解析 | `grep -rniE "epub" apps/server/src apps/web/src packages/shared/src`；package.json 全套 | 0 命中 |
| 「重新蒸馏」入口 | `重新蒸馏|再蒸馏|redistill|re-distill`（web+server） | 0 命中 |
| 风格档案删除端点 | `app.delete('/api/style-profiles`、`router\.delete|'DELETE'` | 仅 imitation/books/characters/foreshadowings 有 DELETE |
| 蒸馏进度事件 | routes.ts:656-676（同步 await）；`progress` 于 distill.ts 0 命中 | 无后台任务、无进度 |
| 文风示例开关 | `示例|开关|toggle|默认关闭|默认开启|includeSamples|withSamples`（web+pipeline+shared） | 仅样本选择器 toggle，无注入开关 |
| 评分/阈值解释文案 | `阈值|评分|解释|含义|图例`（web tsx） | 0 命中 |
| 六轴参与 QC | `\.dims|\.axes`（server pipeline/context/quality/prompts） | 0 命中，仅存档+预览编辑 |
| maxRounds UI 传入 | `maxRounds`（web tsx） | 0 命中（API 支持 1-5，UI 未传，恒默认 2） |
| 多档绑定 | BookDetailPage.tsx StyleBindSelect | 单选，无多选 |

## 四、验收命令复核（均在项目根目录执行）

1. `grep -nE "maxSegments|均匀|预算|progress|失败" apps/server/src/style/distill.ts` → **0 命中**。锚点漂移：distill.ts 已瘦身为 `analyzeStyle+saveStyleProfile` 的薄封装（47 行）；文案实际位于 sample.ts:1,13「均匀」、sample.ts:4「maxSegments」、routes.ts:663「maxSegments」、schemas.ts:68、analysis.ts:97「version+1」、analysis.ts:26「RULES_INSTRUCTION」。
2. `grep -nE "axes|六轴|七维|dims|rulesText" apps/server/src/style/inject.ts` → 仅 rulesText 2 处（16,17）；inject.ts 确认无 dims/axes 注入。
3. `grep -rn "voiceRefMetrics" apps/server/src` → 6 处（chapter.ts:118,271；polish.ts:43,62,64,120；l0.ts:105,171）。
4. `grep -rniE "epub" …` → 0 命中。
5. `grep -nE "THRESHOLD|阈值|score" l0.ts gate.ts` → 命中 141/145/177 等（阈值硬编码清单见 1.3）。
6. `grep -rniE "router\.delete|'DELETE'" apps/server/src` → 0 命中（本项目用 `app.delete`，见 2.1 核查）。
