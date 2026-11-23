# 调研报告：设定集 MD 各节 → 库内记录 → 生成注入 的数据流与蒸馏档案重叠面（2026-11-23）

> 只读调研；未改动任何代码文件。以代码现行为准，计划文档 `docs/plans/2026-11-20-settings-import.md` 只作设计期对照。
> 范围外：GUI 组件交互细节、测试文件、导出功能（卡面①）。v6 原文件未入库，节题以卡面所列及归档副本 `apps/server/data/imports/08273ed7-28fa-467d-8c87-20e16bf181a7-settings.md:5-355` 为准（11 个 H2 节与卡面一一对应）。

## 一、结论先行（Q1–Q4）

**Q1（解析器现行映射）**：`description` 是**精炼全文**，不是节选拼接——`refineForDescription(raw)` 对整篇 MD 逐行处理，剥「版本/变更/修订/待确认/决策」等元信息节与散落噪声行、表格压成 `a｜b｜c`、剥 `[[...]]` 与 `**`、折叠空行；除元信息节外**所有 H2 节（1–11 的正文）都进入 description**（`apps/server/src/settings-import.ts:93,95-123,488`）。`DESCRIPTION_BUDGET=20000`（:12，与 `config.ts:105` 的 `BUDGETS_DRAFT.worldview` 对齐），超限只 push warning "description 现有 N 字，超出世界观槽预算 20000 字的部分在生成时会被截断，建议精炼"（:489-490），**解析期不截断**。H2「关键词归类」在代码里**没有词表**，只有四个单 token 的 `heading.includes(...)` 定向提取（`人物`:494、`大纲`:499、`矩阵`:501、`文风`:542）加 H3 的 `/悬置|伏笔/`（:447）；计划文档 rule1「世界观/规则体系/人物圣经/总大纲 关键词包含匹配、未匹配节忽略」（plan:76）是旧骨架真值，现行代码并未按节分流，只做特定节结构化抽取。对照 v6：只有 4.人物圣经→characters、5.三卷大纲→outlineTree/outline/outlineItems、7.关系发生矩阵→追加进 outline、10.文风→styleSection、11 下 H3 悬置线→foreshadowings；其余节只进 description 与原文归档。characters 三形态（粗体行段/表格首格/bullet 首粗体，重名去重，`baseSetting=JSON.stringify({设定:text})`）；outlineTree 支持表格章行/卷 H3/阶段头/兜底卡、cap 200 且跨树章号去重；foreshadowings 取 H3 命中后编号串、无编号回退 `／＋；`；outlineItems **区间卡逐章展开**（:520-523），与计划 rule8「区间卡不展开」（plan:85）相反。

**Q2（apply 与 mandate 落点）**：`apply` **总是 `createBook` 建新书**（`apps/server/src/http/routes.ts:250`），路由内没有「向既有书重导入/更新 description·characters」的路径；NewBookPage 的设定集导入位于向导步骤①，apply 回传新 `bookId` 后流到步骤②导原文（`apps/web/src/pages/NewBookPage.tsx:183-190,92-107,124-132`），语义=**建新书**而非写回原书。mandate 存 `books.landing_mandate_json`（`migrations/0014_landing_mandate.sql:1-2`；`db/repositories/books.ts:41,48,255`），仅由 body 勾选 `landingMandate.enabled` 写入 cadence/N（`routes.ts:299-302`；默认 false 零写入），**不读 MD 任何节**——「关系发生矩阵」只追加进 `books.outline`（`settings-import.ts:501-503`），与 mandate 无关。书籍设置有独立「落地策略」下拉，单独 `PUT /meta` 写同一列（`apps/web/src/pages/BookDetailPage.tsx:660-684,503-515`；`routes.ts:138-140`）。生成时 worker 每章 `ensureMandateBeat` 从 `books` 读 mandate，合成 `〔书级落地策略〕` 节拍回写 `chapters.blueprint_json.mustHaveBeats`（`worker/queue.ts:62`；`pipeline/mandate.ts:11-18,34,56`），再由 drafter 的 task 槽【本章硬要求】呈现——**MD 删掉任何节后 mandate 仍独立存在库中照常生效**。

**Q3（生成注入装配清单）**：draft 槽序钉死为 stable=`hardRules/worldview/(characters)/(styleDims)/styleRules`、volatile=`blueprint/continuity/prevTail/fewShot/task`（`context/assembler.ts:64,64-99`）。来源：`worldview←books.description`（MD 导入）、`characters←characters.base_setting`（MD 导入）、`styleRules/styleDims/fewShot←style_profiles.rules_json/samples_json` 经 buildStyleBundle/merge、`blueprint←chapters.blueprint_json`、`continuity←character_states+foreshadowings+chapter_summaries`、`prevTail←chapter_versions.content`、`task←renderDraft+renderTaskSummaryBlock`（`pipeline/chapter.ts:224-242,101-102,199-212`）。注意 `renderDraft` 的 `worldview` 参数传空串（`chapter.ts:240`），世界观只在独立 worldview 槽；【世界观要点】行实际为空（`prompts/render.ts:19`）。planner（blueprint-suggest）**注入 books.description**（task 槽【书籍简介】，`routes.ts:437-440`；`render.ts:158,175`，受 task 预算 800 限制仅约 90 字，`config.ts:141`），并条件注入 `imitation_profiles.structure_json` / `plot_profiles.structure_json` / `spectrum_profiles.structure_json` / outline 卡 / prevTail / continuity，**仅 planner、drafter 不注入**（红线注释 `routes.ts:414,420,426`）。`LANDING` 是 planner 的**输出协议行**（`render.ts:173-174`），仅当本章大纲卡无确定落地格才要求输出，`mandate` 明确不参与判定（`routes.ts:469-478`）；mandate 合成节拍经 blueprint 进 drafter task，不是独立槽。`outline-suggest/outline-tree-suggest` 槽=`hardRules/worldview(books.description)/characters/outline(books.outline)/existingTree`（`routes.ts:520-526,567-575`），无档案注入。`buildStyleBundle` 产物：`rulesText→styleRules 槽+task【文风铁则】`、`dims/axes→styleDims 槽`、`samples→fewShot 槽（受 books.style_fewshot_on 开关）`、`metrics→QC voice-match（非槽）`（`style/merge.ts:76-94`；`chapter.ts:199-212,327`；`style/inject.ts:16,58`）。`style_profiles.source` 原文→`style_sources.text`+`metrics_json`，`analysis`→`rules_json`+`samples_json`（`style/analysis.ts:88-130`）。

**Q4（蒸馏作业输入输出）**：plot/spectrum/imitation 三类**输入都是请求体 `text`**（用户粘贴/上传的参考作品或章节正文，`PlotProfilesSection.tsx:28`；`DistillProfilesShell.tsx:312-348`），与 MD 无派生关系；均为同步 `analyze`→草稿不入库→确认 `save` 后写入 `plot_profiles`/`spectrum_profiles`/`imitation_profiles`（`plot.ts:16-35`；`spectrum.ts:58-70`；`imitation.ts:34-45`；repos `plot.ts:27`/`spectrum.ts:27`/`imitation.ts:40`）。style 走 `distill_jobs` 异步 job（输入 `text`，草稿存 `distill_jobs.result_json`，确认后 `saveStyleProfile` 写 `style_profiles`+`style_sources`）（`style/distill-job.ts:79-114`；`routes.ts:975-992`；`analysis.ts:88-130`）。**`distill_jobs` 无 `kind` 列，只有 style 一种 job**（`migrations/0008_distill_jobs.sql:1-10`），不存在「各 kind」分流。**唯一例外**：设定集 apply 会把 MD 的文风节（≥200 字）直接 `analyzeStyle` 写成 `style_profiles`（`routes.ts:326-345`）——这是 MD→档案的唯一派生路径，且恰好与章节蒸馏档案注入同一批槽（styleRules/styleDims/fewShot）。其余世界观/人物/大纲/悬置/矩阵等槽无档案覆盖。

## 二、v6 十一节 → 库内记录 → 注入槽 → 蒸馏档案是否覆盖同一槽（逐节判定表）

> 只列事实，不给删减建议。「覆盖同一槽」=档案产物是否进入该节当前所走的注入槽。

| v6 H2 节（归档副本行） | 代码归类命中 | 库内记录 | 生成注入槽 | 蒸馏档案是否覆盖同一槽 |
|---|---|---|---|---|
| 1. 框架装置（`…:5`） | 无 `includes` 命中 | 仅 `books.description`（精炼全文）+ `data/imports/<bookId>-settings.md` 原文 | worldview（经 description） | 否；无档案注入 worldview |
| 2. 世界观（`…:15`） | 无独立命中（全文精炼） | `books.description` + 归档 MD | worldview（drafter/outline-suggest/outline-tree-suggest） | 否 |
| 3. 规则体系（`…:40`） | 无独立命中（全文精炼） | `books.description` + 归档 MD | worldview；落地词表另来自词表文件/app_meta，非本节 | 否 |
| 4. 人物圣经（`…:78`） | `includes('人物')`（:494） | `characters.base_setting`（`{"设定":…}`） | characters 槽（`renderCharacterCards`） | 否；spectrum 档案是匿名化原型、planner-only，不是人物卡同槽 |
| 5. 三卷大纲（`…:149`） | `includes('大纲')`（:499） | `outline_nodes` 卷/阶段/卡 + `books.outline` + `chapters.blueprint_json` | draft blueprint；outline-suggest outline；planner outlineCard | 否；imitation 可反推蓝图但 planner-only、非同槽 |
| 6. 故事线池（`…:232`） | 无命中 | `books.description` + 归档 MD | worldview | 否 |
| 7. 关系发生矩阵（`…:249`） | `includes('矩阵')`（:501） | 精炼后追加进 `books.outline`（OUTLINE_BUDGET 8000） | outline-suggest/outline-tree-suggest 的 outline 槽；drafter 无独立矩阵槽 | 否 |
| 8. 场景资产库与复变表（`…:314`） | 无命中 | `books.description` + 归档 MD | worldview | 否 |
| 9. 剧情引擎库（`…:338`） | 无命中 | `books.description` + 归档 MD | worldview | 否 |
| 10. 文风与语言规范（`…:346`） | `includes('文风')`（:542） | `styleSection`→apply 时 `style_profiles`+`book_style_profiles`+`books.style_snapshot_json` | styleRules/styleDims/fewShot + task【文风铁则】 | **是**：MD 文风节可直接派生 `style_profiles`（`routes.ts:331-345`），与章节蒸馏档案同槽 |
| 11. 长线账：悬置与终章接口（`…:355`） | H2 未命中；其下 H3 `11.1 悬置线清单`（`…:357`）命中 `/悬置|伏笔/`（:447） | `foreshadowings`（`planted_ch=1`） | continuity 槽（未 resolved 的伏笔） | 否 |

## 三、注入槽 ← 来源表/列 总表

| 槽 | 消费者 | 来源表/列 | 内容来源属性 |
|---|---|---|---|
| hardRules | drafter / outline | 纯函数 `renderHardRules`（`render.ts:6`） | 代码常量，非 MD 非档案 |
| worldview | drafter / outline-suggest / outline-tree-suggest | `books.description` | **来自 MD 导入**（精炼全文） |
| characters | drafter / outline-suggest / outline-tree-suggest | `characters.base_setting`（`{"设定":…}`） | **来自 MD 导入**（人物圣经节） |
| styleRules | drafter（stable）/ rewrite / task 铁则 | `style_profiles.rules_json.rulesText`→bundle→merge | **来自蒸馏档案**（章节样本 或 MD 文风节） |
| styleDims | drafter（stable）/ rewrite | `style_profiles.rules_json.dims+axes`→bundle→merge | 同上 |
| fewShot | drafter（开关 `books.style_fewshot_on`）/ rewrite | `style_profiles.samples_json`→bundle→merge | 同上 |
| blueprint | drafter | `chapters.blueprint_json`（goal/beats/mustHaveBeats/bannedTopics） | 来自 MD（大纲/矩阵导入）+ planner 输出 + mandate 合成 |
| continuity | drafter / planner | `chapter_summaries.summary`、`character_states.state_json`、`foreshadowings`、`characters.offline_from_chapter` | **来自章节蒸馏/写回**（摘要/状态）+ 来自 MD（伏笔） |
| prevTail | drafter / planner | `chapter_versions.content`（前 1–3 章） | 已生成章节正文 |
| task（drafter） | drafter | `renderDraft`（蓝图）+ `renderTaskSummaryBlock`（硬要求/铁则/落地词池） | 蓝图来自 MD+planner+mandate；铁则来自档案；词池来自词表文件 |
| hardRules/continuity/prevTail/task（planner blueprint-suggest） | planner | `PLANNER_HARD_RULES`、`continuityText`、prev 章正文、`renderBlueprintTask` 含 `books.description` | description 来自 MD；其余来自章节 |
| imitationStructure / plotReference / spectrumReference | blueprint-suggest **planner-only** | `imitation_profiles.structure_json` / `plot_profiles.structure_json` / `spectrum_profiles.structure_json` | **来自蒸馏档案**（参考正文），drafter 不注入 |
| outlineCard | blueprint-suggest planner-only | `outline_nodes`（卷/阶段/卡） | 来自 MD 导入的三级树 |
| outline | outline-suggest / outline-tree-suggest | `books.outline` | **来自 MD 导入**（大纲+矩阵） |
| existingTree | outline-tree-suggest planner | `outline_nodes` | 来自 MD/用户编辑的三级树 |

## 四、逐条断言与证据（path:line + ≤6 行摘录）

### Q1 证据

- description=精炼全文（非节选拼接）：`apps/server/src/settings-import.ts:93`
  > `* description=精炼全文（v3 全文≈1.3 万字恰在预算内）；矩阵节精炼版追加进剧情大纲。`
- 精炼剥什么：`apps/server/src/settings-import.ts:87-88,99,108-114`
  > `const META_LINE_RE = /^(?:>+\s*)?(?:版本...|待确认项?...|决策...)/;`
  > `const META_SECTION_RE = /^#{1,6}\s*(?:[\d.、]+\s*)?(?:版本...|修订...|待确认...)/;`
  > `if (headM && META_SECTION_RE.test(t)) { skipUntilLevel = ...; continue; }`
  > `if (META_LINE_RE.test(t)) continue;`
  > `if (t.startsWith('|')) { out.push(t.replace(/\s*\|\s*/g, '｜')...); continue; }`
  > `out.push(t.replace(/^#{1,6}\s*/, ''));`
- 常量与 warning：`apps/server/src/settings-import.ts:12,489-490`
  > `const DESCRIPTION_BUDGET = 20000;`
  > `if (description.length > DESCRIPTION_BUDGET) { warnings.push(\`description 现有 ${description.length} 字，超出世界观槽预算 ${DESCRIPTION_BUDGET} 字的部分在生成时会被截断，建议精炼\`); }`
- 归类命中 token：`apps/server/src/settings-import.ts:494,499,501,542,447`
  > `parseCharacters(doc.sections.find((s) => s.heading.includes('人物')), ...);`
  > `parseOutline(doc.sections.find((s) => s.heading.includes('大纲')), ...);`
  > `const matrixSec = doc.sections.find((s) => s.heading.includes('矩阵'));`
  > `const styleSection = cleanBlock(doc.sections.find((s) => s.heading.includes('文风')));`
  > `if (!/悬置|伏笔/.test(b.heading)) continue;`（b 为 h3Blocks 元素）
- characters 三形态：`apps/server/src/settings-import.ts:244-283`
  > `const isPerson = (bm !== null) || (/[（(]/.test(cells[0]));`（表格）
  > `const bm = t.match(/^[-·]\s*\*\*(.+?)\*\*/); if (!bm) continue;`（bullet）
  > `const bm = t.match(/^\*\*(.+?)\*\*/); ... if (/^[：:]/.test(rest)) continue;`（粗体段，标签跳过）
  > `out.push({ name, baseSetting: setting !== '' ? JSON.stringify({ 设定: setting }) : '{}' });`（:242）
- outlineTree 表格/卷/阶段/兜底：`apps/server/src/settings-import.ts:345-410`
  > `if (!/^\d{1,3}$/.test(first) && !rangeM) continue;`（表格首格章号）
  > `if (/《/.test(h3Text) || /^(卷|部|篇|章|阶段).../.test(probe)) { vol = makeVolume(...); }`
  > `const stageHead = t.match(/^(\d{1,3})\s*[–—-]\s*(\d{1,3})\s*\*\*([^*]+)\*\*/);`
  > `if (vol === null) continue;`（无卷不兜底散行）
- foreshadowings：`apps/server/src/settings-import.ts:447-467`
  > `if (!/悬置|伏笔/.test(b.heading)) continue;`
  > `for (const seg of anchorSegments(text)) { ... pushFs(desc) ... }`
  > `for (const part of text.split(/\s*[／＋]\s*|\s*；\s*|\n+/)) { ... pushFs(desc) ... }`
  > `out.push({ description: desc, plantedCh: 1 });`（:443）
- outlineItems 区间展开：`apps/server/src/settings-import.ts:520-523`
  > `outerItems: for (const c of allCards) { if (c.chapterFrom === null) continue;`
  > `const to = Math.min(c.chapterTo ?? c.chapterFrom, c.chapterFrom + 49);`
  > `for (let ch = c.chapterFrom; ch <= to; ch++) { ... outlineItems.push({ chapterNo: ch, blueprint: ... }); }`
- 计划对照（设计期真值）：`docs/plans/2026-11-20-settings-import.md:76,78,85`
  > `1. H2 分节：...按「世界观/规则体系/人物圣经/总大纲」关键词（包含匹配）归类；未匹配节忽略。`
  > `3. description = 首个 blockquote 文本 + ... 世界观节全文 + ... 规则体系节全文；>16000 字 push warning...`
  > `8. outlineItems = cards 中 chapterFrom≠null 逐章展开（区间卡不展开）...`

### Q2 证据

- apply 恒建新书：`apps/server/src/http/routes.ts:248-250`
  > `bookId = db.transaction(() => { const book = booksRepo.createBook(db, { title, description: d.description, outline: d.outline, characters });`
  > `outlineRepo.replaceOutlineTree(db, book.id, d.outlineTree);`
- 无重导入路径：全仓 `settings-import/apply` 仅 `routes.ts:231` 一处，路由内未调用 `updateBookMeta` 写 description/characters（仅 :300 写 mandate）；`grep -rn "reimport|重导入" apps/server/src` 无命中。
- 续写入口语义：`apps/web/src/pages/NewBookPage.tsx:50-51,183-190`
  > `* ① 建书 → ② 导入原文 → 成功后直接进书详情页...`
  > `或从设定集直接导入（自动建书 + 写入世界观 / 大纲 / 人物卡 / 伏笔...）`
  > `<SettingsImportPanel onApplied={({ result }) => setWiz({ step: 2, bookId: result.bookId })} />`
- mandate 落列：`apps/server/src/db/repositories/books.ts:41,255`；`migrations/0014_landing_mandate.sql:1-2`
  > `landing_mandate_json: string | null;`
  > `db.prepare('UPDATE books SET title = ?, description = ?, outline = ?, landing_mandate_json = ?, updated_at = ? WHERE id = ?')...`
  > `ALTER TABLE books ADD COLUMN landing_mandate_json TEXT;`
- 勾选才写/默认 false：`apps/server/src/http/routes.ts:297-302`；`http/schemas.ts:349-357`
  > `// 勾选才写 mandate...未勾选/默认 false 零写入（新书 landingMandate=null=off）`
  > `if (body.landingMandate.enabled) { booksRepo.updateBookMeta(db, book.id, { landingMandate: { mode: 'cadence', heavyEveryN: body.landingMandate.heavyEveryN } }); }`
  > `enabled: z.boolean().default(false), heavyEveryN: z.number().int().min(2).default(2)`
- 矩阵不喂 mandate：`apps/server/src/settings-import.ts:500-503`
  > `// 关系发生矩阵（v3 新增「全书剧情总账」）精炼追加进剧情大纲；v2 无矩阵节不触发`
  > `const outline = [outlineLines.join('\n'), matrixSec ? refineForDescription(matrixSec.lines.join('\n')) : ''].filter(...).join('\n');`
- 独立编辑 mandate：`apps/web/src/pages/BookDetailPage.tsx:503-512,660-668`
  > `await api.putBookMeta(bookId, { landingMandate: { mode: 'cadence', heavyEveryN } });`
  > `aria-label="落地策略"...value={mandateChoice}...`
  > `routes.ts:138-140: const body = parseBody(reply, bookMetaPutSchema, req.body); const book = booksRepo.updateBookMeta(db, bookId, body);`
- 生成期注入：`apps/server/src/worker/queue.ts:62`；`pipeline/mandate.ts:11-18,34,56`
  > `ensureMandateBeat(db, run.bookId, no);`
  > `const mandate = book ? parseLandingMandate(book.landingMandateJson) : null;`
  > `kept.push(synthesizeMandateBeat(chapterNo, mandate));`（写回 `chapters.blueprint_json.mustHaveBeats`）

### Q3 证据

- 槽序：`apps/server/src/context/assembler.ts:64,82,85-99`
  > `/** draft 槽序（钉死）：stable=hardRules/worldview/(characters)/(styleDims)/styleRules；volatile=blueprint/continuity/prevTail(tail)/fewShot/task。 */`
  > `{ name: 'worldview', content: input.worldview, budgetChars: budgets.worldview, stable: true, keep: 'head' }`
- 槽来源：`apps/server/src/pipeline/chapter.ts:224-242`
  > `const charactersText = renderCharacterCards(booksRepo.listActiveCharacters(db, args.bookId, args.chapterNo));`
  > `worldview: book.description, characters: charactersText || undefined, ...`
  > `blueprint: blueprintText(blueprint), continuity: continuityText, prevTail: prevTexts[0], fewShot: fewShotBlock,`
  > `task: renderDraft({ chapterNo, targetChars, worldview: '', blueprint }) + ... + renderTaskSummaryBlock({ mustHaveBeats: blueprint.mustHaveBeats, styleRulesText, landingWords })`
- continuity 来源：`apps/server/src/db/repositories/continuity.ts:140-160`
  > `SELECT cs.state_json, c.name FROM character_states cs JOIN characters c ...`
  > `SELECT name, offline_from_chapter ... FROM characters ...`
  > `SELECT * FROM foreshadowings WHERE book_id = ? AND status != 'resolved' ...`
  > `summaries: getRecentSummaries(db, bookId, chapterNo)`（`chapter_summaries`，:33）
- planner 注入 description 与档案：`apps/server/src/http/routes.ts:414,420,426,437-450`
  > `// 注入面：绑定仿写档案时结构摘要入 planner 槽；drafter 不注入`
  > `// 剧情参考...注入 planner 槽；drafter 不注入` / `// 人物光谱参考...drafter/related 不注入`
  > `taskText = renderBlueprintTask({ ..., bookDescription: book.description, ... });`
  > `...(plotBrief ? [{ name: 'plotReference', ... }] : []), ...(spectrumBrief ? [{ name: 'spectrumReference', ... }] : []),`
- LANDING 与 mandate 判定：`apps/server/src/http/routes.ts:469-478`；`prompts/render.ts:173-174`
  > `// 主审裁决 2026-11-22：仅当该章无确定性落地时才要求模型出 LANDING...mandate 不参与判定`
  > `LANDING: 本章落地格，形态为 H（场景）或 L（场景）...`
- outline-suggest 槽：`apps/server/src/http/routes.ts:520-526,567-575`
  > `{ name: 'worldview', content: book.description, ... }`
  > `...(book.outline ? [{ name: 'outline', content: book.outline, ... }] : []),`
  > `...(treeBrief ? [{ name: 'existingTree', content: treeBrief, ... }] : []),`
- buildStyleBundle/merge 产物：`apps/server/src/style/merge.ts:76-94`；`pipeline/chapter.ts:199-212`
  > `export function buildStyleBundle(input: {...}): StyleBundleV2 { return { v: 2, ..., profiles: input.profiles }; }`
  > `styleRulesText = merged.rulesText; styleTerms = merged.terms; styleDims = merged.dims; ... styleSamples = merged.samples;`
  > `fewShotBlock = book.styleFewshotOn && styleSamples.length > 0 ? renderStyleBlock('', styleSamples, ...) : undefined;`
- source/analysis 分落：`apps/server/src/style/analysis.ts:116-130`
  > `JSON.stringify({ rulesText: input.analysis.rules.join('\n'), dims, axes, terms, freqTerms }),`
  > `JSON.stringify(input.samples), JSON.stringify(metrics),`
  > `INSERT INTO style_sources(... text ...) ... .run(..., input.source, ...)`

### Q4 证据

- 蒸馏输入是 `text`：`apps/server/src/plot.ts:20-23`；`spectrum.ts:58-63`；`imitation.ts:34-38`
  > `export async function analyzePlot(deps, input: { name: string; text: string }): Promise<PlotDraft> { const source = input.text;`
  > `export async function analyzeSpectrum(deps, input: { name: string; text: string })...`
  > `export async function analyzeImitation(deps, input: { name: string; text: string; chapterCount: number })...`
- 抽样而非 MD：`apps/server/src/plot.ts:32-33`；`spectrum.ts:74-75`；`imitation.ts:52`
  > `const segments = sampleReferenceText(source, { segmentChars: 2000, maxSegments: 8 });`
- 草稿不入库/确认后写表：`routes.ts:1085-1094,1125-1134`；repos `plot.ts:27`/`spectrum.ts:27`/`imitation.ts:40`
  > `const draft = await analyzePlot({ db, provider }, body); reply.send({ draft });`
  > `INSERT INTO plot_profiles(... structure_json ...) ...` / `INSERT INTO spectrum_profiles(...)` / `INSERT INTO imitation_profiles(...)`
- style job 唯一类型/无 kind：`migrations/0008_distill_jobs.sql:5-10`；`style/distill-job.ts:79-114`
  > `CREATE TABLE IF NOT EXISTS distill_jobs(id, status, progress, stage, error, result_json, base_profile_id, created_at, updated_at);`
  > `setJob(..., { status: 'done', ..., resultJson: { analysis, samples: fewShot, evaluation, sourceText: input.text } });`
- redistill 复用 style_sources：`routes.ts:1008-1024`
  > `const src = db.prepare('SELECT text FROM style_sources WHERE source_hash = ?').get(profile.source_hash);`
- 例外：MD 文风节→档案：`apps/server/src/http/routes.ts:326-345`
  > `const styleText = d.styleSection.trim(); if (d.importStyle && styleText !== '') { ... analyzeStyle({ provider }, { sourceText: styleText, samples: [styleText] }); saveStyleProfile(db, { name: \`${title}·文风规范\`, source: styleText, analysis, ... }); ... }`

## 五、未找到项与已试搜索词

1. **v6.md 原文件未入库**：`find . -iname "*v6*.md"`、`find . -iname "*设定集*" -o -iname "*少年阿磊*"` 均无命中；`grep -rln "框架装置\|关系发生矩阵\|长线账"` 仅命中 `apps/server/data/imports/*-settings.md` 与本卡。以归档副本 `08273ed7-…-settings.md:5-355` 的 11 节作 v6 结构证据。
2. **代码中没有 H2 关键词词表/分类表**：已试 `grep -n "词表\|keywords\|keywordMap\|分类" apps/server/src/settings-import.ts`（只命中 `parseLandingCell` 的关键词切分 :150-170，与 H2 归类无关）；plan:16-30,76 的关键词表属旧骨架，现行代码只 `heading.includes(...)`。
3. **没有「向既有书重导入设定集」路由**：已试 `grep -rn "reimport\|re-import\|重导入" apps/server/src`、`grep -n "updateBookMeta(db.*settings" apps/server/src/http/routes.ts` 均无命中；apply 仅 `routes.ts:231` 一处且固定 `createBook`。
4. **mandate 不从 MD 任何节读取**：已试 `grep -n "mandate" apps/server/src/settings-import.ts`（无命中）；`grep -rn "mandate" apps/server/src` 全部命中集中在 routes.ts/books.ts/schemas.ts/pipeline/mandate.ts/worker/queue.ts/quality/l0.ts，无解析侧读取。「关系发生矩阵」只进 outline。
5. **`distill_jobs` 无 `kind` 列/无多类型 job**：已试 `grep -n "kind" apps/server/src/db/migrations/0008_distill_jobs.sql apps/server/src/style/distill-job.ts` 无命中；plot/spectrum/imitation 均为同步 analyze 端点而非 job。
6. **`style_profiles` 无字面 `source`/`analysis` 列**：已试 migration `0001_core.sql:29-35`；实际为 `source→style_sources.text + source_path/source_hash + metrics_json`，`analysis→rules_json/samples_json`（`analysis.ts:108-130`）。
7. **档案输入未与「已生成章节」建立代码级绑定**：已试 `grep -rn "章节.*蒸馏\|从章节\|已生成章节\|导出.*章节" apps/web/src`；蒸馏样本为 UI 粘贴/上传文本（`DistillProfilesShell.tsx:312-348`；`PlotProfilesSection.tsx:28`「粘贴参考作品正文」）。因此「档案内容全部派生自已生成章节、与 MD 无派生关系」只能确认后半句（除文风节 apply 例外），前半句在代码里无强制绑定。
