# 卡 T7B：B1 注入核心 · chapter.ts 装配接线 + qc 步落 outputVersionId

## 一、根因与目标

T7A 已落渲染层与槽位（`renderStyleDimsBlock`/`AXIS_GUIDES`/`budgets.styleDims`/`rewrite` 新入参），但章节管线仍未把七维六轴画像取出来喂进去（`chapter.ts` 只解构 `rulesText/terms`），且 qc 步不记 `outputVersionId`（B3 的「版本→质检明细」查询依赖它）。本卡完成接线与 qc 联动。真值源：`docs/design/plan-2026-11-16-four-feedbacks.md` §二 B1 段与 §三.5；计划真值 `docs/plans/2026-11-16-four-feedbacks.md` Task7B（:287-314）；R2 报告 `docs/design/research-2026-11-16-distill-qc.md` §2.2。冲突即停报。

## 二、改动文件（仅此二件）

- Modify `apps/server/src/pipeline/chapter.ts`（rules 解构 :193-197；draft 槽 :211-227；draft finishStep :253；qc finishStep :288；rewrite 槽 :313-334；rewrite finishStep :361）
- Test Modify `apps/server/test/pipeline/chapter.test.ts`（+2）

## 三、改法（钉死）

1. `chapter.ts:193` 附近档案解构扩为 `const { rulesText, terms, dims, axes } = …`（保持既有 `getLatestProfile` 取法不变，只扩解构）。
2. 新增局部常量：`const styleDimsText = dims && axes ? renderStyleDimsBlock(dims, axes, config.budgets.draft.styleDims) : '';`（`renderStyleDimsBlock` 自 `../style/inject` 导入）。
3. draft 槽入参增 `styleDims: styleDimsText || undefined`。
4. 把现 :221 行内 fewShot 表达式提为局部常量 `fewShotBlock`（值与现行为逐字等价，仅换位置），draft 与 full 重写共用；**targeted 重写不传 fewShot**（方案 §一：targeted 只补 styleRules 精简槽）。
5. targeted `buildRewriteSlots` input 增 `styleRules: rulesText || undefined`；full input 增 `styleRules: rulesText || undefined`、`styleDims: styleDimsText || undefined`、`fewShot: fewShotBlock`。
6. qc 步 `finishStep('qc', …)` 增 `outputVersionId: currentVersion.id`（与 draft 步同款联动，供 B3 版本→qc 查询）；draft/rewrite finishStep 的 `outputJson` 归 T8A 处理，本卡不动。
7. 8k 档 `budgets.styleDims=0` → 装配器对空/截断为空串的槽自动不产出（T7A 已定行为），**不加特判分支**。
8. 禁止：改 prompt 文本、改槽预算数值、改 runs 状态机、改路由、动 `apps/web/**`。

## 四、先红后绿回归测试（以下命令均在项目根目录执行）

`chapter.test.ts` 追加 2 用例（provider 捕获手法照 `test/pipeline/generate-drift.test.ts` 的自定义包装 provider）：

1. 「绑定档案的 run：draft 调用 system 含【文风画像】与至少一行六轴映射句」——构造绑定风格档案（dims/axes 非空，axes 至少一轴落 <40 或 >60）的书与章节，跑 draft 一次，断言捕获的 `system` 文本含 `【文风画像】` 且含 `【六轴锚点】` 行；另断言 user 内 fewShot 块不含空 `【文风规则】` 头（T7A 修后的行为）。**注意 stable 槽进 system 不进 user**（断言抓 system，勿只抓 user）。
2. 「触发重写轮时 rewrite 槽集含 styleRules」——mock 使 l1 低分触发重写，断言 targeted 模式 rewrite 调用捕获的 system 含 `【文风规则】` 与档案规则文本。

顺序：先写 2 用例 → `pnpm --filter @inkforge/server exec vitest run test/pipeline/chapter.test.ts` 红 → 按三、接线 → 绿。

验证链：`pnpm typecheck` → 0 错；`pnpm lint` → 0 错；`pnpm --filter @inkforge/server exec vitest run` → 全绿且用例数 = 本卡开工前实测 +2（数字写进 commit verify）；`pnpm test` → 全绿。

## 五、验收命令（主审独立复核）

- 四、验证链重跑；`git show --name-only HEAD` 仅触及二、清单二文件。
- 抽查：`grep -n "styleDims\|fewShotBlock\|outputVersionId" apps/server/src/pipeline/chapter.ts` 命中三处接线点；`grep -n "renderStyleDimsBlock" apps/server/src/pipeline/chapter.ts` ≥1；`grep -n "outputVersionId" apps/server/src/pipeline/chapter.ts` 命中 qc 步。

## 六、约束

- 禁改：`apps/server/src/style/**`、`src/context/**`、`src/http/**`、`packages/**`、`apps/web/**`、任何 `package.json`；不得改 T7A 产物（发现问题即停报）。
- 只 commit 不 push；`git add` 明确列二文件路径，永不 `git add -A`、永不 `--no-verify`。
- commit 标题：`feat(server): 章节管线注入七维六轴画像与重写风格槽；qc 步落 outputVersionId`；正文 `verify:` 行含定向先红后绿、server 包用例数 +2 与全绿、全量结果、typecheck/lint 结果；GUI 未触及；尾行 `Refs: DEC-2026-1116-01`。
- 卡外（不属本卡、由主审另做）：B1 效果门 = 本卡装配确定性测试 + owner 盲评 A/B（同书同蓝图 3 章×注入前后），盲评由主模型组织、不计入本卡验收。
- 卡外问题即停报，不得自行扩面。
