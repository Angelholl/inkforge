# 卡 R1：shared text 工具追加两导出 + 文本单测（写集=2 文件）

**根因：** code-review Standards 建议 #1「双端 regex/normalize 收 shared」挂账开工（DEC-2026-1126-10，owner 已锁 D-A/D-B）。本卡只做 shared 侧新增，消费方切换归 R2/R4。

**改动文件集（只准动这两个）：** `packages/shared/src/text.ts`（M）、`packages/shared/test/text.test.ts`（A）

**改法：**
1. text.ts 末尾追加两个导出（既有 countChars 不动实现）：
```ts
export function collapseWhitespace(s: string): string; // s.replace(/\s+/g, ' ').trim()
export const BRACKET_TAG_RE: RegExp; // /^\[(planted|advanced|resolved)\]\s*(.+)$/ 禁加 g 标志（exec 带 lastIndex 状态）
```
各带一行 docblock 注明语义与「server summarize / web 详情页双端共用」。核对 src/index.ts 已有 `export * from './text'`（只读核对，不改桶文件）。
2. 新建 test/text.test.ts，10 条用例照抄计划真值 docs/plans/2026-11-26-shared-consolidate-and-helper.md Task-01 步 3 代码块（用 pointer_tools read_pointer 读该文件 :51-102 区段）：countChars 2 条、collapseWhitespace 4 条、BRACKET_TAG_RE 4 条，断言精确值内嵌不得改。

**回归测试：** text.test.ts 即新增面；基线 shared 12→≥22 只增不减，无 skipped。

**验收命令（以下均项目根执行）：** `pnpm --filter @inkforge/shared test`（全绿 ≥22）；`pnpm --filter @inkforge/shared typecheck`（零错）。

**约束：** 纯重构零行为变更；只 commit 不 push；commit 只 add 写集两文件、永不 -A/--no-verify；提交信息 Conventional+中文，正文 `verify:` + `Refs: DEC-2026-1126-10`，UTF-8 文件走 `git commit -F`。执行中读 >4KB 文件或查看改动用 python C:/Users/57850/.zcode/tools/pointer_tools.py（pointerize/read_pointer/read_diff_only）。非交互禁提问；files_touched 必须=写集且非空；不连主库；输出与提交信息禁引业务原文串。
