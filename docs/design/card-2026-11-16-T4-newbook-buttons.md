# 卡 T4：D4 按钮归一 · NewBookPage（7 处）+ NewBookIdeaPage（6 处）

## 一、根因与目标

`Button` 公共组件已由 T1 落库。本卡归一建书两向导页的 13 处裸 `<button>`，**无行为变更**：拆章预览行删除与草稿人物卡移除均为 L1 草稿态单击直删（维持现状）。真值源：`docs/design/spec-button-subtrans-2026-11-16.md` §3.9（:266-277）、§3.8（:255-265）、§3.15-3（:334）；计划真值 `docs/plans/2026-11-16-four-feedbacks.md` Task4（:149-167）。冲突即停报。

## 二、改动文件（仅此四件）

- Modify `apps/web/src/pages/NewBookPage.tsx`（7 处）
- Modify `apps/web/src/pages/NewBookIdeaPage.tsx`（6 处 + :223 goal span）
- Test Modify `apps/web/src/pages/NewBookPage.test.tsx`、`apps/web/src/pages/NewBookIdeaPage.test.tsx`（既有 class/裸 button 断言同步改，**用例数不变**）

## 三、改法（钉死）

1. 全部改 `<Button …>`（从 `../components/ui` 导入；布局类走透传）。行号为改前位置：

| 文件 | 行 | 文案 | 目标（变体·tone·尺寸） |
|---|---|---|---|
| NewBookPage | 149 | 建书并进入导入 | `primary` md |
| NewBookPage | 176 | 拆章预览 | `secondary` md |
| NewBookPage | 179 | 导入 N 章 | `primary` md（disabled 透明度归一到 45，走组件 disabled） |
| NewBookPage | 194 | 删除（拆章预览行） | `quiet` danger sm（L1 直删） |
| NewBookPage | 215 | 补摘要·第 N 章 | `secondary` sm |
| NewBookPage | 222 | AI 建议蓝图 | `secondary` md |
| NewBookPage | 233 | 发起续写 | `primary` md |
| NewBookIdeaPage | 144 | 添加人物 | `secondary` sm |
| NewBookIdeaPage | 164 | 移除（草稿人物卡） | `quiet` danger sm（L1 直删） |
| NewBookIdeaPage | 199 | 建书并生成蓝图 | `primary` md |
| NewBookIdeaPage | 224 | 收起/编辑 | `quiet` primary sm |
| NewBookIdeaPage | 247 | 保存蓝图并继续 | `primary` md |
| NewBookIdeaPage | 262 | 发起生成 | `primary` md |

2. `NewBookIdeaPage.tsx:223` goal `span` 加 `min-w-0 truncate`（§3.15-3）。
3. 禁止：改数据请求/状态逻辑、改文案、加图标、加确认簇、动 `inputCls` 圆角。归一后两文件 `grep -c "<button"` 各为 0。

## 四、先红后绿回归测试（以下命令均在项目根目录执行）

1. 先把两测试文件中锁旧形态的断言改为断言新形态（如 `getByRole('button', { name: '发起生成' })` 的 class 含 `bg-primary`+`h-ctl`；`secondary` 钮含 `border-line`）→ 定向跑应红。
2. 按三、改两页面 → 定向两文件全绿；用例数不得减少。
3. `grep -c "<button" apps/web/src/pages/NewBookPage.tsx` → 0；同 NewBookIdeaPage → 0。
4. `pnpm typecheck` → 0 错；`pnpm lint` → 0 错。
5. `pnpm --filter @inkforge/web exec vitest run` → 全绿（用例数持平）；`pnpm test` → 全绿。

## 五、验收命令（主审独立复核）

- 四、2/3/4/5 重跑；`git show --name-only HEAD` 仅触及二、清单四文件。
- GUI 黑盒由**主审**执行：1280×800 与 1600×900 截图，核验 ①三枚主钮（建书并进入导入/导入 N 章/发起续写/建书并生成蓝图/保存蓝图并继续/发起生成）实底蓝 md；②拆章预览行「删除」quiet·danger·sm 单击直删、行不折行不撑坏（1280 宽）；③idea 卡「收起/编辑」quiet·primary·sm、goal 长文本 truncate 不挤压；④disabled 钮 opacity 45%+not-allowed；⑤控制台零新增 error。

## 六、约束

- 禁改：`apps/web/src/components/ui.tsx`、`apps/server/**`、`packages/**`、`index.css`、任何 `package.json`、本卡四文件之外的页面。
- 只 commit 不 push；`git add` 明确列四文件路径，永不 `git add -A`、永不 `--no-verify`。
- commit 标题：`feat(web): 建书两向导页按钮归一 Button（D4-T4，13 处无行为变更）`；正文 `verify:` 行含定向结果、两文件 `<button` 计数 0、web 包与全量结果、typecheck/lint 结果；GUI 状态写「GUI 未验证（目验归主审）」；尾行 `Refs: DEC-2026-1116-01`。
- 卡外问题即停报，不得自行扩面。
