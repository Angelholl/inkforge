# 执行卡 TL-2：七维来源「不采用」哨兵 DIM_SOURCE_NONE（server+shared）

- 前置依赖：TL-1 已合入（串行第 2 张；本卡接口上**独立于 TL-1**，不消费 lever/DTO，排序仅为同工作树 ≤1 卡）。
- 计划真值源：`docs/plans/2026-11-24-tension-levers.md` §3.2/§5。

## Consumes / Produces

- Consumes：TL-1？（**否，独立**）。
- Produces：`packages/shared/src/api.ts` 新导出（TL-3/TL-4 依赖的精确签名）：
  ```ts
  /** 七维来源「不采用」哨兵（DEC-2026-1124-04）：dimsSource[dim]=该值 → 该维不采用任何档案风格、
   *  按正文与设定走；merge 产出该维空文本、不记贡献（不参与六轴加权与样本席位之外的回落）。
   *  双下划线包边，不会与真实档案 id 冲突。 */
  export const DIM_SOURCE_NONE = '__none__';
  ```
  行为面：`mergeStyleProfiles` 收到 `dimsSource[dim]=DIM_SOURCE_NONE` → `dims[dim]===''`、`contributors[dim]==[]`。

## 一、根因

门内「偏正文」要表达「该维以后不采用档案风格」，现引擎没有这个值：`merge.ts:207` 对非哨兵未知值一律 `validIds.has(raw) ? raw : primaryProfileId` 静默回落主档（critic 红线①，已复核成立）——`__none__` 若不加专用分支会主档化。本卡新增哨兵常量与 merge 早退分支，注入层零改动（`inject.ts:60` 对空串维自动跳行）。

## 二、改动文件（不越界清单）

| 文件 | 动作 | 锚点（Modify 行号） |
| --- | --- | --- |
| `packages/shared/src/api.ts` | Modify | `DIM_SOURCE_COEXIST` :403-404 旁新增常量 |
| `apps/server/src/style/merge.ts` | Modify | import :19；七维循环 :191-223 内、COEXIST 分支 continue（:205）之后与 :207 回落**之前**插分支；模块头算法注释 :5-6 区域补一行 |
| `apps/server/test/style/merge.test.ts` | Modify | 共存 describe（:507 起）旁新增「不采用」describe |
| `apps/server/test/pipeline/chapter.test.ts` | Modify | 仿混合注入例 :372-404 新增一例（prompt 文本断言） |
| `apps/server/test/http/polish.test.ts` | Modify | 仿 :148-204 夹具与断言新增一例 |

禁触：merge.ts 六轴加权（:225-243）与样本席位（:307-353）算法、rulesText/terms 合并逻辑、`normalizeDimsSource`（:67-74，无生产调用方）、`inject.ts`、`chapter.ts`/`polish.ts` 生产码、`apply.ts`/`fingerprint.ts`/`books.ts`。

## 三、改法（每步一个动作 + 可核对结果；红阶段全部先于绿阶段）

### 阶段 A：shared 常量

- [ ] A1. `api.ts:404` 下方按 Produces 形状新增 `DIM_SOURCE_NONE`（含注释）。核对：常量值恰 `'__none__'`，注释含「不参与六轴加权与样本席位之外的回落」。

### 阶段 B：全部红例先落（merge + 注入层两文件三例）

- [ ] B1. `merge.test.ts`：import 行补 `DIM_SOURCE_NONE`；共存 describe（:507 起）后新增 describe「七维不采用（DEC-2026-1124-04）」，首例钉（对照组=「该维来源文本为空」的等贡献形态，数学上与哨兵同权，隔离哨兵效应）：
  ```ts
  const profiles = {
    pA: prof({ dims: { 特色词汇: 'A词汇', 节奏: 'A节奏' }, axes: { ...fullAxes, 叙述温度: 70 } }),
    pB: prof({ dims: { 特色词汇: '', 节奏: 'B节奏' }, axes: { ...fullAxes, 叙述温度: 56 } }), // pB 特色词汇文本空
  };
  const sent = mergeStyleProfiles(
    bundle({ primaryProfileId: 'pA', auxProfileIds: ['pB'], dimsSource: { 特色词汇: DIM_SOURCE_NONE, 节奏: 'pB' }, profiles }), 1,
  );
  expect(sent.dims['特色词汇']).toBe('');   // 哨兵维空文本，不回落主档
  expect(sent.dims['节奏']).toBe('B节奏');   // 其余维不受影响
  const ctrl = mergeStyleProfiles(
    bundle({ primaryProfileId: 'pA', auxProfileIds: ['pB'], dimsSource: { 特色词汇: 'pB', 节奏: 'pB' }, profiles }), 1,
  );
  expect(sent.axes).toEqual(ctrl.axes);     // 哨兵零贡献 ≈ 该维来源文本空（对照）→ 加权不受影响
  expect(sent.samples.map((s) => s.id)).toEqual(ctrl.samples.map((s) => s.id)); // 席位不受影响
  expect(ctrl.dims['特色词汇']).toBe('A词汇'); // 对照分界：来源文本空→回落主档文本；哨兵→恒空
  ```
- [ ] B2. `chapter.test.ts` 仿 :372-404 新例：同一混合夹具形态，`dimsSource` 含 `{ 特色词汇: '__none__' }`（辅档 `特色词汇: '辅特色词汇文本'` 在场）；沿用 capturing provider + prompt 文本断言风格：
  - `expect(prompt).not.toContain('特色词汇：')`（该维画像行不进 prompt）；
  - `expect(prompt).toContain('节奏：主节奏文本')`（其余维照常）。
- [ ] B3. `polish.test.ts` 仿 :148-204 新例：内联夹具 `dimsSource` 改 `{ 写作特点: 'pb-aux', 特色词汇: '__none__', 章节结构: 'pb-aux' }`（辅档 `特色词汇: '辅特色词汇文本'` 在场），断言钉：
  - 直接 `mergeStyleProfiles(JSON.parse(snapshotJson), 2)` → `merged.dims['特色词汇'] === ''`；
  - `polishBenchmarks(db, book, 2)` 不抛且 `out.terms` 含 `{ term: '灵力', note: '代指法力' }`（terms 面不受哨兵影响）；
  - runPolishChapter harness rewrite prompt 仍含 `灵力：代指法力`（既有钉值 :203 同款）。
- [ ] B4. 跑红（三个文件各跑一次）。核对红点：
  - merge 例：`sent.dims['特色词汇']` 实得 `'A词汇'`（:207 静默回落主档，红线①复现）；
  - chapter 例：prompt 实含 `特色词汇：辅特色词汇文本`（`not.toContain` 红）；
  - polish 例：`merged.dims['特色词汇']` 实得 `'辅特色词汇文本'`。

### 阶段 C：merge 分支一次性转绿

- [ ] C1. merge.ts:19 import 补 `DIM_SOURCE_NONE`。
- [ ] C2. 七维循环内、COEXIST 分支 `continue;`（:205）之后、`const src = …`（:207）之前插入：
  ```ts
  // 「不采用」哨兵（DEC-2026-1124-04）：该维不采用任何档案风格、按正文与设定走；
  // 必须先于下方越权回落判定，否则 __none__ 被 validIds 三元静默回落主档（红线①）
  if (raw === DIM_SOURCE_NONE) {
    dims[dim] = '';
    contributors[dim] = [];
    continue;
  }
  ```
  核对：六轴段（:225 起）与样本段未动一个字符。
- [ ] C3. merge.ts 模块头算法注释（:5-6 区域）补一行「1''. 不采用维（DIM_SOURCE_NONE，DEC-2026-1124-04）：该维空文本、零贡献，不回落」。核对：注释与实现同拍。
- [ ] C4. 跑绿。核对：`pnpm -F @inkforge/server exec vitest run test/style/merge.test.ts`、`test/pipeline/chapter.test.ts`、`test/http/polish.test.ts` 三文件全绿。

### 阶段 D：收口链

- [ ] D1. `pnpm lint` → 0 error。
- [ ] D2. `pnpm test` 全量 ≥ 基线只增（开工先实跑记数）。
- [ ] D3. `pnpm typecheck` → 0 error。
- [ ] D4. `pnpm deadcode` → 0 新增挂空（`DIM_SOURCE_NONE` 本卡内 merge.ts 已消费即不挂 knip）。
- [ ] D5. 提交（只 commit 不 push）：
  ```
  feat(server): 七维来源新增 __none__ 不采用哨兵

  shared 增 DIM_SOURCE_NONE='__none__'；mergeStyleProfiles 七维循环在共存分支之后、
  越权回落（:207 三元）之前识别哨兵 → 该维空文本零贡献，不参与六轴加权与样本席位
  之外的回落；注入层零改动（空串维自动跳行）。merge/chapter/polish 各增注入面
  回归例（先红后绿）。

  verify: pnpm lint/test/typecheck/deadcode 全绿，测试基线 <开工>→<收口> 只增
  Refs: docs/plans/2026-11-24-tension-levers.md
  ```

## 四、先红后绿回归测试与验收命令

以下命令均在项目根目录执行

```bash
# 1) 红（B4，三文件各跑一次）
pnpm -F @inkforge/server exec vitest run test/style/merge.test.ts
pnpm -F @inkforge/server exec vitest run test/pipeline/chapter.test.ts
pnpm -F @inkforge/server exec vitest run test/http/polish.test.ts
# 2) 绿与收口（C4 与 D1-D4）
pnpm lint
pnpm test
pnpm typecheck
pnpm deadcode
```

验收样例（输入 → 期望输出）：
- `dimsSource = { 特色词汇: '__none__', 节奏: 'pB' }`（pB 特色词汇文本为空对照组下）→ `dims['特色词汇']===''`、`dims['节奏']==='B节奏'`、axes/samples 与对照组全等、对照组该维回落主档文本 `'A词汇'`（分界钉）。
- chapter prompt：不含 `特色词汇：` 画像行，含 `节奏：主节奏文本`。

## 五、约束

- 只 commit 不 push；永不 `--no-verify`；永不 `git add -A`。
- 读 >4KB 文件用 pointer_tools 的 pointerize/read_pointer/read_diff_only。
- 卡外问题（如 :207 锚点漂移找不到、对照组夹具与既有 prof/bundle 助手签名不符）即停回报。
- 禁读 `apps/server/data/**`、词表文件、真实书稿文本；夹具中性仿形。
- 禁改 merge.ts 六轴/席位算法本体——本卡只允许在 :206/:207 之间插早退分支与 :19 import、:5-6 区域注释。
