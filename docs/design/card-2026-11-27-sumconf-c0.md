# C0 卡面：shared DTO（裁决载荷 + aliases）

**真值源：** docs/plans/2026-11-27-summary-unmatched-confirm.md「任务 T0」节——签名钉死代码块逐字照抄，勿自行发挥。
**指针令：** 执行中读取大于 4KB 的文件或查看改动，用 `python C:/Users/57850/.zcode/tools/pointer_tools.py` 的 pointerize/read_pointer/read_diff_only，禁止整读文件全文。

## 根因
补摘要未匹配条目现被代码层静默丢弃（commit filter + `if (charId)` fall-through），批量确认需 shared DTO 先扩出裁决载荷；本卡是全批六卡的类型地基。

## 改动文件（写集，仅此一个）
- `packages/shared/src/api.ts`：追加两个导出接口（SummaryUnmatchedThreadChoice / SummaryUnmatchedCharacterChoice）、`SummaryCommitBody` 两个**可选**数组字段、`CharacterDto.aliases?`——全部照计划 T0 代码块签名逐字。

## 改法
零逻辑改动纯类型追加；既有 `SummaryThreadChoice`/`SummaryStateChoice`/`SummaryGenerateResultDto` 形状一律不动（计划 T0 钉死值段）。字段注释照计划代码块保留。

## 先红后绿回归测试
本卡无新测试（shared 用例数不变即过）；门禁=typecheck 全仓零错 + shared 全量绿。

## 验收命令（以下命令均在项目根目录执行）
1. `pnpm -w typecheck` → 三包零错
2. `pnpm --filter @inkforge/shared exec vitest run` → 全绿且用例数与开卡前一致（先跑一次记基线再改）
3. lint 零错后 commit

## 约束
- 只 commit 不 push；禁 `git add -A`、禁 `--no-verify`；commit 用 Conventional 前缀+中文描述，正文带 verify: 实测结果 + `Refs: DEC-2026-1127-02`。
- 写集外零改动；卡外问题即停待裁决，非交互禁提问。
- 【防过滤器】不连主库；输出与提交信息禁引小说原文片段（测试夹具假名可用）；files_touched 契约必须非空（=api.ts）。
