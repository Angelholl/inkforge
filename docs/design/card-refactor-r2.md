# 卡 R2：server 管线切换 shared 导入（写集=1 文件；前置=R1 已 commit）

**根因：** DEC-2026-1126-10 挂账 D-A②/③——summarize.ts 本地 normalizeThread 与标签行正则是双端重复件，R1 已在 shared 落 `collapseWhitespace` + `BRACKET_TAG_RE`（经桶导出），本卡切换消费方。

**改动文件集（只准动这一个）：** `apps/server/src/pipeline/summarize.ts`（M）

**改法（行号=master 基线，编辑按内容锚为准；精确值照抄计划真值 docs/plans/2026-11-26-shared-consolidate-and-helper.md Task-02 区段 :109-131，用 pointer_tools read_pointer）：**
1. `:7` type 导入行之后新增值导入行 `import { collapseWhitespace, BRACKET_TAG_RE } from '@inkforge/shared';`（type/value 分行风格保持）。
2. 删 `:24-27` 本地 normalizeThread 函数及其 docblock。
3. `:95` → `collapseWhitespace(f.description)`；`:97` 字面量 exec → `BRACKET_TAG_RE.exec(raw)`（禁加标志位）；`:100` → `collapseWhitespace(desc)`。
4. grep 核对：本文件 `normalizeThread` 零残留。

**回归测试：** 既有 summarize 管线测试全数 PASS 即保护网（行为逐字等价，无新增用例义务；基线 server ≥677 只增不减——若 R3 已并入则对 ≥679 口径以当日实测为准）。

**验收命令（以下均项目根执行）：** `pnpm --filter @inkforge/server test` 全绿；`pnpm --filter @inkforge/server typecheck` 零错。

**约束：** 纯重构零行为变更；只 commit 不 push；commit 只 add 写集文件、永不 -A/--no-verify；提交信息 Conventional+中文，正文 `verify:` + `Refs: DEC-2026-1126-10`，UTF-8 走 `git commit -F`。读 >4KB 文件用 pointer_tools。非交互禁提问；files_touched 必须=写集且非空；不连主库；输出与提交信息禁引业务原文串。
