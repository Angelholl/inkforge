# 卡 R4：web 四文件切换 shared 导入（写集=4 文件；前置=R1 已 commit）

**根因：** DEC-2026-1126-10 挂账 D-A①/②/③——web 侧内联重复件切 R1 落地的 shared 导出（countChars 既有 + collapseWhitespace/BRACKET_TAG_RE 新增）。与 R2 可并行，写集互斥。

**改动文件集（只准动这四个）：** `apps/web/src/components/DistillProfilesShell.tsx`、`apps/web/src/pages/ImitationProfilesSection.tsx`、`apps/web/src/pages/StyleProfilesSection.tsx`、`apps/web/src/pages/BookDetailPage.tsx`（均 M）

**改法（行号=master 基线，编辑按内容锚为准；照抄计划真值 docs/plans/2026-11-26-shared-consolidate-and-helper.md Task-04 区段 :198-223，用 pointer_tools read_pointer）：**
1. DistillProfilesShell.tsx：顶部新增 `import { countChars } from '@inkforge/shared';`；`:152` 内联式 → `countChars(text)`。
2. ImitationProfilesSection.tsx：新增值导入行（:8 既有 type 行分行）；`:31` 内联式 → `countChars(text)`。
3. StyleProfilesSection.tsx：countChars 并入 `:7` 既有值导入；`:111` → `if (countChars(text) < 200) {`；`:112` 模板串 `${text.replace(/\s/g, '').length}` → `${countChars(text)}`（提示文案其余逐字不动）。
4. BookDetailPage.tsx：collapseWhitespace/BRACKET_TAG_RE 并入 `:62` 既有值导入；`:83`→`collapseWhitespace(f.description)`、`:86`→`BRACKET_TAG_RE.exec(raw)`、`:92`→`collapseWhitespace(desc)`。
5. grep 核对：四文件 `replace(/\s` 零残留（本批目标点收口）。

**回归测试：** 基线 web =222 只增不减；点名既有组件测试 PASS：DistillProfilesShell.test.tsx、ImitationProfilesSection.test.tsx、StyleProfilesSection.test.tsx、BookDetailPage.test.tsx。GUI 黑盒不适用本卡（纯导入切换零 UI 变更，提交信息注明「GUI 未验证（纯重构无界面改动）」）。

**验收命令（以下均项目根执行）：** `pnpm --filter @inkforge/web test` 全绿=222；`pnpm --filter @inkforge/web typecheck` 零错。

**约束：** 纯重构零行为变更；只 commit 不 push；commit 只 add 写集四文件、永不 -A/--no-verify；提交信息 Conventional+中文，正文 `verify:` + `Refs: DEC-2026-1126-10`，UTF-8 走 `git commit -F`。读 >4KB 文件用 pointer_tools。非交互禁提问；files_touched 必须=写集且非空；不连主库；输出与提交信息禁引业务原文串。
