# 执行卡 DM-1：风格维度八并六（shared 六维表 + 读时别名接线 + 全仓钉值随迁）

- 计划：`docs/plans/2026-11-24-style-dims-merge.md`（规格 §3.1/§3.2/§3.6 与冲击清单 §4 为唯一真值）。
- 前置：TL-1..TL-4 已合入（`DIM_SOURCE_NONE`、schemas 哨兵放行、门内把手）；行号以 TL 合入后工作树为准，漂移以锚点注释/唯一匹配文本定位（「以实际为准」）。

## 0. 背景（根因）

`STYLE_DIMENSIONS`（packages/shared/src/api.ts:400）现为八维。owner 拍板并为六维（语言与描写=对话+描写、结构与节奏=节奏+章节结构、叙述方式=写作特点并吸收 视角/人称/POV/心理距离），存量五份档案与旧快照不迁移，改为读时别名：读侧三口（contentFromProfileRow / parseStyleBundle / getBookStyleBinding）+ 档案详情口（routes.ts:898-912）归一，写侧经常量自动六维。常量翻转会让所有钉旧名的测试变红——本卡一次性随迁全部钉值（禁删用例），保证收口全量绿。

## 1. 改动文件（不得越界；越界即停回报）

| 文件 | 操作 |
| --- | --- |
| `packages/shared/src/api.ts` | Modify（:306-322 注释与 StyleBindingDto；:399-404 常量与新增导出） |
| `apps/server/src/style/merge.ts` | Modify（:1-18 注释；:119-127 contentFromProfileRow；:129-166 parseStyleBundle） |
| `apps/server/src/db/repositories/books.ts` | Modify（:139-146 接口；:187-199 getBookStyleBinding） |
| `apps/server/src/http/routes.ts` | Modify（:836 注释；:898-912 详情 dims 归一） |
| `packages/shared/test/style-dims.test.ts` | 新增 |
| 测试随迁+新例（只改钉值，禁删用例）：`apps/server/test/style/merge.test.ts`、`apps/server/test/style/analysis.test.ts`、`apps/server/test/llm/plainproto.test.ts`（仅 :198 夹具，新例归 DM-2）、`apps/server/test/http/style.test.ts`、`apps/server/test/pipeline/chapter.test.ts`、`apps/server/test/pipeline/polish.test.ts`、`apps/server/test/http/distill-jobs.test.ts`、`apps/server/test/http/settings-import.test.ts`、`apps/server/test/http/style-snapshot.test.ts`、`apps/server/test/db/repositories.test.ts`、`apps/web/src/pages/BookDetailPage.test.tsx`、`apps/web/src/components/FusionGateDialog.test.tsx`、`apps/web/src/pages/NewBookPage.test.tsx`、`apps/web/src/pages/StyleProfilesSection.test.tsx`（:27 夹具 + :196/:220/:588 `维度-节奏` label 断言随迁；「七维」仅出现在用例标题/注释非断言，不动，归 DM-4 顺手项） |

禁改红线：merge.ts 六轴（:225-260）与样本席位（:307-353）与逐维判定/回落（:186-223）本体、normalizeDimsSource（:67-74）、inject.ts、fingerprint.ts、apply.ts、schemas.ts、books.ts setBookStyleBinding（:148-185）、`apps/server/data/**`。蒸馏模板文案（analysis.ts）归 DM-2，本卡不动（distill-template.test.ts:105 的「八维」断言本卡保持原样即为绿）。

## 2. 改法（每步一个动作 + 可核对结果）

### A. 基线

- [ ] A1 实跑 `pnpm test` 记录三包用例总数（最近存证 748 = 571+175+2），写进提交正文。核对：输出数字记入卡面备注。
- [ ] A2 实跑 `pnpm deadcode` 记录现状零告警。核对：exit 0。

### B. shared 新例先红

- [ ] B1 新增 `packages/shared/test/style-dims.test.ts`，用例钉：
  1. `LEGACY_DIM_ALIAS` 恰 8 键、值 ∈ 新六名；`LEGACY_DIM_GROUPS` 六键、组内序 `语言与描写:['对话','描写']`、`结构与节奏:['节奏','章节结构']`。
  2. `mergeLegacyDimTexts({})` → 六键全 ''；`{节奏:'甲',章节结构:'甲'}` → `结构与节奏:'甲'`（去重）；`{对话:'甲',描写:'乙'}` → `语言与描写:'甲；乙'`（旧表序拼接）；`{写作特点:' 丙 ',视角:'丁'}` → `叙述方式:'丙'`（trim+未知键忽略）；`{语言与描写:'新',对话:'旧'}` → `'新'`（新键优先，旧组不并入）；非字符串值按 '' 处理。
  3. `mapLegacyDimSource({节奏:'pB',章节结构:'__coexist__'},'pA')` → `{dimsSource:{结构与节奏:'__coexist__'},splits:{}}`（同哨兵值不记 splits）；`{节奏:'pB',章节结构:'__none__'}` → `'__none__'`；`{节奏:'pB',章节结构:'pC'}` → dimsSource `{结构与节奏:'pA'}` 且 `splits['结构与节奏']==='旧结构里这一组原本分开跟随档案（节奏/章节结构），重蒸该档案后可再分开'`；`{对话:'pB'}` → `{dimsSource:{语言与描写:'pB'},splits:{}}`（单键）；`{情感基调:'pB',幻维:'x'}` → 只带情感基调（未知键忽略）；新键与旧键并存 `{叙述方式:'pB',写作特点:'pC'}` → `'pB'`；同输入两次调用 `toEqual`（确定性）。核对：`pnpm -F @inkforge/shared exec vitest run test/style-dims.test.ts` 红（模块无导出）。

### C. shared 实现转绿

- [ ] C1 `packages/shared/src/api.ts`：`:400` 改六维 `['语言与描写','特色词汇','结构与节奏','情感基调','尺度','叙述方式'] as const`，行尾注释注明「八并六 owner 2026-11-24 拍板（最保守档）+读时别名」；`:403-404` 注释「七维来源」→「维度来源」。核对：B1 定向转绿。
- [ ] C2 同文件 `:404` 旁新增 `LEGACY_DIM_GROUPS`、`LEGACY_DIM_ALIAS`、`DimsSourceMapping`、`mergeLegacyDimTexts`、`mapLegacyDimSource`（实现严格按计划 §3.1 钉 1-4；`__none__` 引用同模块 `DIM_SOURCE_NONE`）。核对：B1 全绿（TS 层由 G4 全仓 typecheck 兜底）。
- [ ] C3 同文件 `:316-322` StyleBindingDto 增 `/** 读时别名诊断：mapLegacyDimSource 的 splits（仅非空时由服务端携带）；不入库 */ legacySplits?: Record<string, string>;`；`:306-313` 注释「七维→」六维措辞；`:399` 注释「八维文本」→「六维文本」。核对：目视+G4 兜底。

### D. 全仓钉值随迁（红驱动：先 typecheck 收 TS 红，再定向测试收运行红）

- [ ] D1 实跑 `pnpm typecheck`，把 TS 红清单誊到卡面（预期命中 merge.test.ts `as Partial<Record<...>>` 夹具、chapter.test.ts:214 dims、StyleProfilesSection.test.tsx:27 等）。核对：清单条数记录。
- [ ] D2 按计划 §4.2 映射速查随迁 `apps/server/test/style/merge.test.ts`（#22 行清单：:52,:56,:64-65,:84-90,:158-165,:246-258,:294-295,:350-360,:407-408,:517,:549；组内并存文本用「；」合成一键；其余常量驱动行不动）。核对：`pnpm -F @inkforge/server exec vitest run test/style/merge.test.ts` 绿。
- [ ] D3 随迁 `apps/server/test/style/analysis.test.ts`：`ANALYSIS_TEXT` DIM 行改 `DIM: 结构与节奏: 短句为主，段落 3-6 行。`+`DIM: 语言与描写: 对话占比约三成，多短对答。`；:50-51/:103 断言换键；:54 缺省断言换任一未指定新维（如 '尺度'）；:73 换 '情感基调'；:113 换 `dims['语言与描写']`。**:58 `axes['节奏']` 是轴名，不动**。核对：定向绿。
- [ ] D4 随迁 `apps/server/test/llm/plainproto.test.ts:198`：`DIM: 节奏: 短句。` → `DIM: 结构与节奏: 短句。`（`:7-58` 的 `DIMENSION:` 行是蓝图协议，不动）。核对：定向绿。
- [ ] D5 随迁 `apps/server/test/http/style.test.ts`：:19-24 ANALYSIS_TEXT 两 DIM 行同 D3 措辞；:77/:199 断言 `dims['结构与节奏']`；:333/:343 `dimsSource: { ['语言与描写']: p2, ['结构与节奏']: p3 }`；:374/:395 `['对话']`→`['语言与描写']`（:362/:368 特色词汇、:396 '语感' 不动）。核对：`pnpm -F @inkforge/server exec vitest run test/http/style.test.ts` 绿。
- [ ] D6 随迁 `apps/server/test/pipeline/chapter.test.ts`：:214 dims 夹具改六键 `{ 结构与节奏:'场景从容，少跳切；单层推进', 语言与描写:'对话稀疏；白描为主', 情感基调:'克制', 叙述方式:'短句为主', 特色词汇:'冷僻字少', 尺度:'' }`（文本全保留）；:374/:402 trio → `['叙述方式','特色词汇','结构与节奏']`；:392 辅档 dims 三键 `写作特点→叙述方式`、`章节结构→结构与节奏`、特色词汇恒等（文本保留）；:414-415 prompt 文本断言不动（应自然绿）。核对：定向绿。
- [ ] D7 随迁 `apps/server/test/pipeline/polish.test.ts`：:151/:169/:179 trio 同 D6 换键保文本。核对：定向绿。
- [ ] D8 随迁 `apps/server/test/http/distill-jobs.test.ts`：:18-19 DIM 行 → `DIM: 结构与节奏: 短句为主，段落 3-6 行。`+`DIM: 语言与描写: 对话占比约三成，多短对答。`；:104 → `dims['结构与节奏']`。核对：定向绿。
- [ ] D9 随迁 `apps/server/test/http/settings-import.test.ts`：:56-72 STYLE_ANALYSIS_TEXT 的 DIM 行并为五行新名（结构与节奏/语言与描写各合并、写作特点→叙述方式、特色词汇/情感基调恒等；AXIS/RULES/TERMS 行不动）。核对：定向绿。
- [ ] D10 随迁 `apps/server/test/http/style-snapshot.test.ts:15`：`DIM: 节奏:` → `DIM: 结构与节奏:`。核对：定向绿。
- [ ] D11 随迁 `apps/server/test/db/repositories.test.ts`：:218/:226 `{ 对话: 'pB' }` → `{ 语言与描写: 'pB' }`。核对：定向绿。
- [ ] D12 随迁 web 四文件：BookDetailPage.test.tsx :741 标题「八键」→「六键」、:751 `维度来源-语言与描写`、:761/:889 六键 body（组内合并后六键全列出）、:766/:773/:806 措辞「八维」→「六维」、:786 `dimsSource['语言与描写']`、:812/:871 `{ 语言与描写: 'p2' }`、:827-828 label 换 `语言与描写`/`结构与节奏`；FusionGateDialog.test.tsx :34/:227 `{ 结构与节奏: 'sp1' }`、:159-160 `跟随：结构与节奏`；NewBookPage.test.tsx :267 措辞、:276 `toHaveLength(6)`；StyleProfilesSection.test.tsx :27 dims 夹具六键（`结构与节奏:'短句为主'` 等，文本保留）+ :196/:220/:588 `维度-节奏` → `维度-结构与节奏`（功能性 aria-label 断言，:588 为 toBeNull 语义等价换真维名）。核对：`pnpm -F @inkforge/web exec vitest run src/pages/BookDetailPage.test.tsx src/components/FusionGateDialog.test.tsx src/pages/NewBookPage.test.tsx src/pages/StyleProfilesSection.test.tsx` 绿。
- [ ] D13 grep 白名单复核：`rg -n "写作特点|章节结构|叙述视角" apps packages` 与 `rg -n "'对话'|'描写'|'节奏'" apps/server/src apps/server/test apps/web/src` 逐条核对，余留仅允许=白名单（analysis.ts 模板与 distill-template.test:105 八维断言、轴名「节奏」、DIMENSION: 蓝图行、fingerprint.test 任意键 '对白'、测试用例标题/注释里的「七维/八维」字样）。核对：白名单外零命中。

### E. 读时接线新例先红

- [ ] E1 `apps/server/test/style/merge.test.ts` 新增 3 例（禁删旧例）：①`parseStyleBundle(JSON.stringify({profileId:'pA',auxProfileIds:['pB'],dimsSource:{对话:'pB',节奏:'pC',章节结构:'__coexist__'},profiles:{pA:{…dims:{对话:'甲',描写:'乙'}…},pB:{…dims:{节奏:'丙'}…}}}))` → `bundle.dimsSource` 等于 `{语言与描写:'pB',结构与节奏:'__coexist__'}`，且 `bundle.profiles.pA.dims['语言与描写']==='甲；乙'`、`bundle.profiles.pB.dims['结构与节奏']==='丙'`；②V1 旧形态 `{profileId:'pA',version:1,rulesJson:JSON.stringify({rulesText:'',dims:{节奏:'丁'}}),samplesJson:'[]'}` → dims['结构与节奏']==='丁'；③`contentFromProfileRow` 喂 rules_json 含八维 dims → 返回 dims 恒恰六键。核对：三例红（接线未做）。
- [ ] E2 `apps/server/test/db/repositories.test.ts` 新增 1 例：`setBookStyleBinding` 写入 `{ 对话:'pB', 节奏:'pC', 章节结构:'pC' }`（组异值折主档）→ `getBookStyleBinding` 返回 dimsSource `{语言与描写:'pB',结构与节奏:'pA'}` 且 `legacySplits['结构与节奏']` 含「重蒸该档案后可再分开」；库内 `dims_json` 原文仍是旧键（SELECT 断言字节不变）。核对：红。
- [ ] E3 `apps/server/test/http/style.test.ts` 新增 1 例：旧档案 rules_json 直插八维 dims → GET `/api/style-profiles/:id` 详情 `analysis.dims` 恒六键且组内文本「；」拼接。核对：红。

### F. 接线实现转绿

- [ ] F1 `apps/server/src/style/merge.ts`：import 三个新导出；`:122` dims 包 `mergeLegacyDimTexts`；`:129-166` V1 `:155` 与 V2 `:164`（逐 profile 浅拷贝 `{...c, dims: mergeLegacyDimTexts(...)}`）接归一、`:144` dimsSource 在 return 前经 `mapLegacyDimSource(dimsSource, primaryProfileId).dimsSource`；`:1-18` 头注释「七维」→「维度」措辞。**:186-223 判定逻辑、:225-260、:307-353 一行不动**。核对：E1 三例绿。
- [ ] F2 `apps/server/src/db/repositories/books.ts`：`:139-146` 接口加 `legacySplits?`；`:187-199` 读 dims_json → `mapLegacyDimSource(parsed, primary.profile_id)`，返回 `dimsSource: mapped.dimsSource` 且 `Object.keys(mapped.splits).length > 0` 时追加 `legacySplits: mapped.splits`（空不带）；双写 :148-185 不动。核对：E2 绿（含库内字节不变断言）。
- [ ] F3 `apps/server/src/http/routes.ts`：`:907` dims 包 `mergeLegacyDimTexts`（import 自 '@inkforge/shared'）；`:836` 注释「七维全主」→「六维全主」。核对：E3 绿。
- [ ] F4 复核实跑 `apps/server/test/http/fusion-gate.test.ts`、`apps/server/test/fusion/fingerprint.test.ts` 绿（不改动；fingerprint face 因归一变化属预期 §3.6，测试本就动态算 face 应自洽）。核对：两文件定向绿。

### G. 收口（验证链硬序，任一环失败即停回报）

- [ ] G1 `pnpm lint` 零新增。核对：exit 0。
- [ ] G2 定向：`pnpm -F @inkforge/shared exec vitest run test/style-dims.test.ts` + D/E 涉及文件。核对：全绿。
- [ ] G3 `pnpm test` 全量 ≥ A1 基线只增。核对：数字记录。
- [ ] G4 `pnpm typecheck` 零错（D1 红清单全部销账）。核对：exit 0。
- [ ] G5 `pnpm deadcode` 与 A2 持平零新增（新导出当卡即有生产消费方：merge.ts/books.ts/routes.ts）。核对：exit 0。
- [ ] G6 `git status` 确认 `apps/server/data/**` 零 diff、改动文件 ⊆ §1 清单。核对：逐条对表。
- [ ] G7 提交：`feat(style): 风格维度八并六+读时别名接线（DM-1）`，正文 `verify: lint/定向/全量 N≥基线/typecheck/deadcode 全绿` + `Refs: docs/plans/2026-11-24-style-dims-merge.md`。只 commit 不 push。

## 3. 验收命令

以下命令均在项目根目录执行（不写仓库根绝对路径）：

```
pnpm -F @inkforge/shared exec vitest run test/style-dims.test.ts
pnpm -F @inkforge/server exec vitest run test/style/merge.test.ts test/style/analysis.test.ts test/db/repositories.test.ts test/http/style.test.ts test/http/style-snapshot.test.ts test/http/distill-jobs.test.ts test/http/settings-import.test.ts test/pipeline/chapter.test.ts test/pipeline/polish.test.ts test/llm/plainproto.test.ts
pnpm -F @inkforge/web exec vitest run src/pages/BookDetailPage.test.tsx src/components/FusionGateDialog.test.tsx src/pages/NewBookPage.test.tsx src/pages/StyleProfilesSection.test.tsx
pnpm lint
pnpm test
pnpm typecheck
pnpm deadcode
```

## 4. 约束

- 只 commit 不 push；永不 `--no-verify`；永不 `git add -A`（按 §1 清单逐文件 add）。
- 读 >4KB 文件用 `C:/Users/57850/.zcode/tools/pointer_tools.py` 的 pointerize/read_pointer/read_diff_only（merge.test.ts、BookDetailPage.test.tsx、routes.ts 均超 4KB）。
- 卡外问题即停回报（如：随迁后出现计划未列的红例、E 组新例与实现冲突、data 目录出现 diff）。
- 本卡不改 GUI 交互逻辑（web 只动测试钉值），无 GUI 黑盒验证义务。
