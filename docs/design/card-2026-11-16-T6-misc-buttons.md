# 卡 T6：D4 按钮归一 · 书架/选样/阅读器/运行页/选段重写（13 处，D4 收口标志）

## 一、根因与目标

`Button` 组件已由 T1 落库，T2-T5 已归一 52 处。本卡收尾剩余 13 处，并落两处规格钉死的行为变更（版本链 chip 选中态改软底、选段重写 busy 改 loading），并带 D4 全站完成标志。真值源：`docs/design/spec-button-subtrans-2026-11-16.md` §3.3（:214-221）、§3.2（:207-213）、§3.4（:222-229）、§3.11（:294-301）、§3.12（:302-308）、§2.2（:164-169）、§1.3 loading（:122）、§4.3 静态命令（:369-373）；计划真值 `docs/plans/2026-11-16-four-feedbacks.md` Task6（:204-235）。冲突即停报。

## 二、改动文件（仅此五件 + 三测试）

- Modify `apps/web/src/pages/BooksPage.tsx`（3 处）
- Modify `apps/web/src/pages/BookSamplePicker.tsx`（2 处）
- Modify `apps/web/src/pages/ChapterReaderPage.tsx`（3 处，含版本链 chip）
- Modify `apps/web/src/pages/RunPage.tsx`（3 处）
- Modify `apps/web/src/pages/SelectionRewrite.tsx`（2 处，含 loading）
- Test Create `apps/web/src/pages/ChapterReaderPage.test.tsx`（+1）、`apps/web/src/pages/SelectionRewrite.test.tsx`（+1）
- Test Modify `apps/web/src/pages/BooksPage.test.tsx`（既有两步确认断言同步改，**用例数不变**）

## 三、改法（钉死）

1. 全部改 `<Button …>`（从 `../components/ui` 导入；布局类走透传）。行号为改前位置：

| 文件 | 行 | 文案 | 目标（变体·tone·尺寸） |
|---|---|---|---|
| BooksPage | 48 | 确认删除 | `danger` solid sm（L3 结构不变，仅收编形态） |
| BooksPage | 51 | 取消 | `secondary` sm |
| BooksPage | 60 | 删除 | `quiet` danger sm |
| BookSamplePicker | 56 | 从书架选书 | `secondary` md（补 `bg-surface` 归标准 secondary） |
| BookSamplePicker | 93 | 导入所选 N 章 | `primary` md（旧 `disabled:opacity-50` 交组件统一 45） |
| ChapterReaderPage | 42 | 回滚到当前所选 | `secondary` md |
| ChapterReaderPage | 45 | 导出 markdown | `primary` md |
| ChapterReaderPage | 56 | 版本链 chip | `quiet` sm + `active={current?.id === v.id}`（选中软底 `bg-primary-soft text-primary-strong`，**废止实底选中**；chip 文案不变） |
| RunPage | 70 | 暂停 | `secondary` md（**warn 实底废止**） |
| RunPage | 73 | 继续 | `secondary` md |
| RunPage | 76 | 取消 | `danger` md（soft 形态，不加确认） |
| SelectionRewrite | 52 | 预设 chip（×N） | `quiet` sm |
| SelectionRewrite | 69 | 提交选段重写 | `primary` sm + `loading`（废止「重写中…」换字，children 恒「提交选段重写」） |

2. 禁止：改数据请求/状态语义（除 chip 选中判定与两处 loading 形态）、改文案、加图标、动 `inputCls` 圆角。
3. 归一后五文件 `grep -c "<button"` 各为 0。

## 四、先红后绿回归测试（以下命令均在项目根目录执行）

1. 先写 2 个失败用例：
   - `ChapterReaderPage.test.tsx`（新建，照 BooksPage.test.tsx 的 fetch-stub 手法）：渲染版本链 chip → 选中项 class 含 `bg-primary-soft`，未选中项含 `text-muted`。
   - `SelectionRewrite.test.tsx`（新建）：busy 期间提交钮 `aria-busy="true"`、disabled、可见文本仍为「提交选段重写」。
2. BooksPage.test.tsx 既有两步确认用例的 class/角色断言同步改新形态（用例数不变）。
3. 定向跑红 → 按三、改五文件 → 定向全绿。
4. **D4 完成标志三条静态命令**：
   - `grep -rn "<button" apps/web/src/pages --include=*.tsx | wc -l` → **0**
   - `grep -rn "bg-warn px-4 py-2\|disabled:opacity-50" apps/web/src --include=*.tsx | wc -l` → 0
   - `grep -rEn 'className="[^"]*text-danger[^"]*"' apps/web/src/pages --include=*.tsx | wc -l` → 0
5. `pnpm typecheck` → 0 错；`pnpm lint` → 0 错；`pnpm --filter @inkforge/web exec vitest run` 全绿（用例数较开工前 +2）；`pnpm test` 全绿。

## 五、验收命令（主审独立复核）

- 四、3/4/5 重跑；`git show --name-only HEAD` 仅触及二、清单八文件。
- GUI 黑盒由**主审**执行（规格 §4.1 三类代表页全走）：1280×800 与 1600×900 截图，核验 ①BooksPage L3 全流程（删除→确认簇→确认删除成功/取消收簇，确认钮=全站唯一实底红）；②RunPage 暂停/继续/取消三钮同排、取消为 soft 红非实底、暂停不再是 warn 实底；③ChapterReaderPage 版本链 chip 选中软底蓝字/未选中灰字；④选段重写 loading spinner 保宽不换字；⑤控制台零新增 error。

## 六、约束

- 禁改：`apps/web/src/components/ui.tsx`、`apps/server/**`、`packages/**`、`index.css`、任何 `package.json`、本卡八文件之外的页面。
- 只 commit 不 push；`git add` 明确列八文件路径，永不 `git add -A`、永不 `--no-verify`。
- commit 标题：`feat(web): 书架/选样/阅读器/运行页/选段重写按钮归一，D4 全站裸按钮清零（T6）`；正文 `verify:` 行含三条静态命令计数 0、定向与 web 包（+2）与全量结果、typecheck/lint 结果；GUI 状态写「GUI 未验证（目验归主审）」；尾行 `Refs: DEC-2026-1116-01`。
- 卡外问题即停报，不得自行扩面。
