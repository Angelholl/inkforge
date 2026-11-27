# C2 卡面：renderSummarize 名册/伏笔清单注入（含截断）

**真值源：** docs/plans/2026-11-27-summary-unmatched-confirm.md「任务 T2」节——`SUMMARIZE_ROSTER_CAP=50`（owner 已拍板钉死）、collectSummarizeContext/renderSummarize 签名、注入块逐字格式、测试名与断言全部照计划执行。
**指针令：** 执行中读取大于 4KB 的文件或查看改动，用 `python C:/Users/57850/.zcode/tools/pointer_tools.py` 的 pointerize/read_pointer/read_diff_only，禁止整读文件全文。

## 根因
prompt 现不注入现有角色名册（render.ts:142-156），LLM 自由输出任意角色名→大量「未匹配」。Q1 拍板=从源头注入名册+伏笔标题行（仅名字/标题，不注入设定全文），超上限截断注记；UI 手选归 C4/C5，本卡只做 generate 侧。

## 改动文件（写集）
- Modify `apps/server/src/prompts/render.ts`：`SUMMARIZE_ROSTER_CAP=50` + renderSummarize 扩参 + 注入块（空名单整块省略；两清单独立计数截断；格式逐字照计划钉死块）
- Modify `apps/server/src/pipeline/summarize.ts`：新增 collectSummarizeContext（名册=listActiveCharacters 的 name，伏笔=listForeshadowings 的 collapseWhitespace(description)）+ generateSummarize 入参扩四字段 + runSummarizeStep 接线
- Modify `apps/server/src/http/routes.ts`：generate 端点 :1523 前调 collectSummarizeContext 并入参（保持 generate 零写库只读）
- Test `apps/server/test/prompts/contract.test.ts`：既有四标记例补 context 入参随迁 + 新增注入断言例（用例名照计划步骤逐字）
- Test `apps/server/test/pipeline/summarize-commit.test.ts`：CAP/CAP+1 边界例（断言引常量不引字面量）+ 既有两处 generateSummarize 直调随迁

## 先红后绿回归测试
计划 T2 五步 checkbox 串逐条执行留痕（每步红→绿可核对）；mock provider 按 step 路由，prompt 内容变化对既有用例零影响。

## 验收命令（以下命令均在项目根目录执行）
1. `pnpm --filter @inkforge/server exec vitest run test/prompts/contract.test.ts test/pipeline/summarize.test.ts test/pipeline/summarize-commit.test.ts` → 全绿
2. server 全量只增不减（开卡前实测基线存证）；`pnpm -w typecheck` 零错；lint 零错后 commit

## 约束
- 前置 C0 已验收合入方可开工；C3 严格在本卡之后（共改 summarize.ts/routes.ts）。
- 只 commit 不 push；禁 `git add -A`、禁 `--no-verify`；Conventional 前缀+中文描述，正文 verify:+`Refs: DEC-2026-1127-02`。
- 写集外零改动；卡外问题即停待裁决，非交互禁提问。
- 【防过滤器】不连主库；输出与提交信息禁引小说原文片段（测试夹具假名可用）；files_touched 契约必须非空。
