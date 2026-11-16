# 卡 T7A：B1 注入核心 · 槽位与渲染层（server 纯函数，无路由改动）

## 一、根因与目标

蒸馏产出的七维 `dims` 与六轴 `axes` 落库后从未进入生成上下文（R2 实证：`chapter.ts` 只取 `rulesText/terms`，六轴不参与任何环节），且 `targeted` 重写不传风格槽、`fewShot` 在无规则时仍产出空 `【文风规则】` 头。本卡只落**渲染层与槽位定义**（纯函数+预算+装配器/重写入口），接线归 T7B。真值源：`docs/design/plan-2026-11-16-four-feedbacks.md` §二 B1 段与 §一 批一修正行；计划真值 `docs/plans/2026-11-16-four-feedbacks.md` Task7A（:239-283）。冲突即停报。

## 二、改动文件（仅此六件）

- Modify `apps/server/src/style/inject.ts`（`renderStyleBlock` :16-24 行为改 + 文件尾新增 `AXIS_GUIDES`/`renderStyleDimsBlock`）
- Modify `apps/server/src/config.ts`（`DraftBudgets` :17-27、`RewriteBudgets` :36-42、`BUDGETS_DRAFT` :97-107、`BUDGETS_DRAFT_8K` :109-119、`BUDGETS_REWRITE` :123-129）
- Modify `apps/server/src/context/assembler.ts`（`draftSlots` :65-101 增槽）
- Modify `apps/server/src/pipeline/rewrite.ts`（`RewriteSlotsInput` :17-32、targeted 槽 :56-63、full 透传 :35-50）
- Test Create `apps/server/test/style/inject-blocks.test.ts`（+3）
- Test Modify `apps/server/test/context/assembler.test.ts`（+1）、`apps/server/test/pipeline/rewrite.test.ts`（+2）

## 三、改法（钉死）

1. **新增导出（inject.ts）**：
```ts
export const AXIS_GUIDES: Record<StyleAxis, { low: string; high: string }>;
export function renderStyleDimsBlock(dims: Record<StyleDimension, string>, axes: Record<StyleAxis, number>, budgetChars?: number): string;
```
   `StyleAxis`/`StyleDimension` 自 `@inkforge/shared` 导入（`packages/shared/src/api.ts:301-305`）。
2. **六轴语义句映射表（逐字照抄，禁止改写；键=轴名）**：

| 轴 | low（值<40） | high（值>60） |
|---|---|---|
| 叙述温度 | 叙述温度偏冷：保持克制旁观的笔调，少用感叹与情绪形容词，情感经动作与细节自然透出。 | 叙述温度偏热：笔调贴近人物内心，允许直白的情绪抒发与氛围渲染，语感热烈。 |
| 语言密度 | 语言密度偏低：短句为主，用词平白晓畅，避免长句、从句嵌套与生僻书面语。 | 语言密度偏高：多用长句与修饰层叠，词汇书面化，意象稠密，读感绵密。 |
| 叙述者姿态 | 叙述者姿态疏离：以旁观视角叙述，不进入人物内心，评价性议论保持克制。 | 叙述者姿态贴身：紧贴视角人物的感知与心理，叙述语气随人物情绪起伏。 |
| 节奏 | 节奏偏缓：场景从容展开，多用静态描写与心理铺陈，允许放慢情节推进。 | 节奏偏快：场景切换干脆，以动作与对话推进，压缩铺陈直取冲突。 |
| 幽默 | 幽默感低：整体笔调严肃，避免插科打诨、玩笑式比喻与轻佻语。 | 幽默感高：允许俏皮比喻、反讽与轻松调侃，沉重段落可被化解。 |
| 情绪表达 | 情绪表达内敛：情感靠留白与细节暗示，避免直接点破人物感受。 | 情绪表达外放：情感直接抒发，允许大喜大悲的浓烈笔触。 |

3. **renderStyleDimsBlock 输出格式（钉死）**：首行 `【文风画像】`；每个非空 dim 一行 `· <维度名>：<描述>`；随后一行 `【六轴锚点】`；每个落入低带（<40）或高带（>60）的轴一行 `· <轴名>：<映射句>（值 <v>）`；40≤v≤60 的轴整行省略；六轴全在中带且 dims 全空 → 返回空串。超 `budgetChars` 按头部截断（与 `renderStyleBlock` 既有截断风格一致，先截尾）。
4. **renderStyleBlock 行为修**：`rulesText` 去空白后为空时不再产出 `【文风规则】` 头（fewShot 空规则头修）；其余行为与截断不变、签名不变。
5. **config.ts**：`DraftBudgets` 增 `styleDims`（`BUDGETS_DRAFT.styleDims=600`、`BUDGETS_DRAFT_8K.styleDims=0`）；`RewriteBudgets` 增 `styleRules=400`（`BUDGETS_REWRITE`）。8k 档 0 值由装配器既有「空槽不产出」行为消化，不加特判。
6. **assembler.ts**：`draftSlots` input 增 `styleDims?: string`；槽序钉死为 `…characters → styleDims → styleRules…`，槽属性 `stable:true, keep:'head'`（与 characters/styleRules 同族，进 system 不进 user）。
7. **rewrite.ts**：`RewriteSlotsInput` 增 `styleDims?: string` 与（若尚无）`styleRules?: string`；**targeted** 槽序在 `hardRules` 之后插 `styleRules` 槽（仅当有值，budget=`budgets.rewrite.styleRules`，stable）；**full** 经 `draftSlots` 透传 `styleRules`/`styleDims`/`fewShot`。

## 四、先红后绿回归测试（以下命令均在项目根目录执行）

1. `inject-blocks.test.ts`（新建 +3）：① `renderStyleBlock('', samples)` 结果不含 `【文风规则】`；② `renderStyleDimsBlock` 轴值 20 出该轴 low 句、80 出 high 句、50 该轴整行省略；③七维非空时输出首行为 `【文风画像】` 且七行 `· 维度：` 齐全。
2. `assembler.test.ts`（+1）：传 `styleDims` 时 system 文本含 `【文风画像】` 且其位置在 characters 之后、styleRules 之前。
3. `rewrite.test.ts`（+2）：①targeted 传入 `styleRules` 时槽集含名为 `styleRules` 的槽且紧随 hardRules；②full 传入 `styleDims` 时槽集含 `styleDims`。
4. `pnpm --filter @inkforge/server exec vitest run test/style/inject-blocks.test.ts test/context/assembler.test.ts test/pipeline/rewrite.test.ts` → 先红（新函数/槽不存在）后 7/7 绿。
5. `pnpm typecheck` → 0 错；`pnpm lint` → 0 错。
6. `pnpm --filter @inkforge/server exec vitest run` → **237 用例全绿**（231+6）；`pnpm test` → 285 全绿。既有逐字段断言 budgets 的用例按新字段同步改（不得删用例）。

## 五、验收命令（主审独立复核）

- 四、4/5/6 重跑；`git show --name-only HEAD` 仅触及二、清单六文件。
- 抽查：`grep -c "AXIS_GUIDES" apps/server/src/style/inject.ts` → ≥1；`grep -n "styleDims" apps/server/src/context/assembler.ts` 命中槽序行；`grep -n "styleDims\|styleRules" apps/server/src/pipeline/rewrite.ts` 命中 targeted 与 full 两处；`grep -n "【文风规则】" apps/server/src/style/inject.ts` 上下文确认空 rulesText 分支不产出头。

## 六、约束

- 禁改：`apps/server/src/pipeline/chapter.ts`（接线归 T7B）、`src/http/**`、`packages/shared/**`（DTO 不动）、`apps/web/**`、任何 `package.json`；不得改既有槽的 budget 数值（只增新键）。
- 六轴映射句必须与卡面二、表格逐字一致（主审会 diff 比对）。
- 只 commit 不 push；`git add` 明确列六文件路径，永不 `git add -A`、永不 `--no-verify`。
- commit 标题：`feat(server): 风格七维六轴语义槽与重写 styleRules 精简槽（B1 渲染层）`；正文 `verify:` 行含定向 7/7、server 237 全绿、全量 285 全绿、typecheck/lint 结果；GUI 未触及；尾行 `Refs: DEC-2026-1116-01`。
- 卡外问题即停报，不得自行扩面。
