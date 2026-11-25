# 执行卡 DF-1：蒸馏指令 DIM 行加每维 70 字量条（层①）

- 计划真值=`docs/plans/2026-11-25-dims-floor.md`（Task DF-1 + §3.2 逐字面量 + §4 全局约束）；决策归档=DEC-2026-1125-01。
- 前置：无（六卡串行第一张，DF-2~DF-6 依赖本卡产出之字面量）。

## 0. 背景（根因）

「八并六」后默认蒸馏指令对 DIM 行无单维量目标——RULES/TERMS/FREQTERMS 均有数量目标，唯独 DIM「每维一行」被模型执行成单行短评（实测 V3 均值 ~43.5 字/维 vs V2 ~54）。owner 拍板六维统一单维字数下限=70 字/维、三层强制；本卡只做层①=指令显式量条，解析端校验/重试/warning 归 DF-2~DF-6。

## 1. 改动文件（不得越界）

| 文件 | 操作 |
| --- | --- |
| `apps/server/src/style/analysis.ts` | Modify——仅 `ANALYSIS_INSTRUCTION` DIM 行一行，替换为 §2-B1 逐字面量；AXIS/RULES/TERMS/FREQTERMS/NAMES 行、三条指导行（语言与描写=…/尺度维=…含「每条证据不超过 10 字」/叙述方式=…含「心理距离」）、「不要输出 JSON…」行、【样本开始】逐字不动 |
| `apps/server/test/http/distill-template.test.ts` | Modify——既有「默认指令」用例内新增两条断言（§2-A1），禁删改既有用例其余部分 |

## 2. 改法（每步一个动作 + 可核对结果）

### A. 基线与红

- [ ] A0 实跑 `pnpm test` 记录用例总数（应 ≥804，最近存证）。核对：数字记卡面。
- [ ] A1 在 `distill-template.test.ts` 既有「默认指令」用例新增断言：`expect(captured[0]).toContain('每维不少于 70 字')`；`expect(captured[0]).toContain('证据词仅作建议')`。跑 `pnpm --filter @inkforge/server test -- test/http/distill-template.test.ts -t '默认指令'`，核对=**1 红**（红因=字样缺失）。

### B. 实现转绿

- [ ] B1 DIM 行整行替换为下列逐字面量：
  `DIM: <维度>: <一段描述>（六维：语言与描写、特色词汇、结构与节奏、情感基调、尺度、叙述方式，每维一行；每维不少于 70 字，请写足样本中的具体字句与手法细节，勿只给短评。证据词仅作建议：引用样本原文短语作支撑即可，不设数量硬指标。）`
  重跑 A1 命令，核对=全绿，且 `:105-109` 既有断言（六维清单/心理距离/对话腔/尺度维/六轴）仍绿。

### C. 收口（验证链硬序）

- [ ] C1 `pnpm lint` → C2 定向（distill-template.test.ts）→ C3 `pnpm test` 全量 ≥A0 只增 → C4 `pnpm typecheck` → C5 `pnpm deadcode`。每步核对：exit 0 / 数字记录。
- [ ] C6 `git diff --stat` 改动 ⊆ §1 两文件；`git diff apps/server/src/style/analysis.ts` 仅命中 DIM 行一行（指导行零 diff）。核对：对表。
- [ ] C7 提交：`feat(style): 蒸馏指令DIM行加每维70字量条（DF-1）`，正文 `verify: ...`（含 A0→C3 数字与红绿留痕）+ `Refs: docs/plans/2026-11-25-dims-floor.md`。只 commit 不 push。

## 3. 验收命令

以下命令均在项目根目录执行：

```
pnpm --filter @inkforge/server test -- test/http/distill-template.test.ts
pnpm lint
pnpm test
pnpm typecheck
pnpm deadcode
```

## 4. 约束

- 只 commit 不 push；永不 `--no-verify`；永不 `git add -A`。
- 读 >4KB 文件用 `python C:/Users/57850/.zcode/tools/pointer_tools.py` 的 pointerize/read_pointer/read_diff_only，禁止整读文件全文（analysis.ts 超 4KB）。
- 禁改：`parseAnalysis`、`analyzeStyle` 逻辑、shared 常量与别名函数、任何 `apps/server/data/**`。本卡只动指令文案+测试断言，不提前实现 DF-2/3。
- 纯文本/文案改动，无 GUI 验证义务（提交注明 GUI 不适用）。
- 卡外问题即停回报；不得越界顺手改。
