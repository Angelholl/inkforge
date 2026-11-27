# C3 卡面：commit 落库——匹配顺序/建档/alias 写入/冲突回查 + zod

**真值源：** docs/plans/2026-11-27-summary-unmatched-confirm.md「任务 T3」节——SummaryPayload 扩展、zod schema（含 link 必带 characterId 的 refine）、commitSummarize 执行序钉死段、routes commit 映射、11+3 测试用例名全部照计划逐字。
**指针令：** 执行中读取大于 4KB 的文件或查看改动，用 `python C:/Users/57850/.zcode/tools/pointer_tools.py` 的 pointerize/read_pointer/read_diff_only，禁止整读文件全文。

## 根因
真丢弃点在 commitSummarize：STATE `if (charId)` 静默跳过、THREADS 未命中 fall-through。本卡落地 owner 反馈①②④+Q3/Q4：服务端按自算匹配序（精确同名→aliases→裁决载荷）执行 link/create/ignore，确认写入者同步建档（仅 name、baseSetting='{}'），link 裁决写 alias；重名撞车=回查关联既有卡不炸事务（评议 HIGH_RISK 采纳钉死）。

## 改动文件（写集）
- Modify `apps/server/src/pipeline/summarize.ts`：SummaryPayload 两可选字段 + commitSummarize 匹配/裁决/建档/alias 逻辑（全在原单事务内，执行序照计划钉死段逐条）
- Modify `apps/server/src/http/schemas.ts`：summaryCommitSchema 追加两数组 default([]) + link refine（照计划代码块）
- Modify `apps/server/src/http/routes.ts`：commit 端点载荷映射改 include||裁决名单，透传两数组；三守卫（stale-base-version/活 run 409/404）不动
- Test `apps/server/test/pipeline/summarize-commit.test.ts` +8 例、`apps/server/test/http/summarize-confirm.test.ts` +3 例（用例名照计划逐字，含重名撞车回查例、精确优先于他人 alias 例、link 悬空 characterId 整事务回滚例、管道路径零裁决载荷维持跳过例）

## 先红后绿回归测试
计划 T3 四步串逐条执行留痕；既有 summarize-confirm 六例（:98-:221）零改动跑绿。

## 验收命令（以下命令均在项目根目录执行）
1. `pnpm --filter @inkforge/server exec vitest run test/pipeline/summarize-commit.test.ts test/http/summarize-confirm.test.ts test/pipeline/summarize.test.ts` → 全绿
2. server 全量只增不减（开卡前实测基线存证）；`pnpm -w typecheck` 零错；lint 零错后 commit

## 约束
- 前置=C0✓+C1✓+C2✓ 三卡验收合入后方可开工（严格串行位）。
- 只 commit 不 push；禁 `git add -A`、禁 `--no-verify`；Conventional 前缀+中文描述，正文 verify:+`Refs: DEC-2026-1127-02`。
- 写集外零改动；卡外问题即停待裁决，非交互禁提问。
- 【防过滤器】不连主库；输出与提交信息禁引小说原文片段（测试夹具假名可用）；files_touched 契约必须非空。
