# 卡 T3：D4 按钮归一 · OutlineTreeSection（11 处）+ DistillPage（2 处）

## 一、根因与目标

`Button` 公共组件已由 T1 落库（`apps/web/src/components/ui.tsx`）。本卡归一两个文件的 13 处裸 `<button>`，**无行为变更**：删卷/删阶段/删卡均为草稿态 L1 单击直删（维持现状），不加确认簇。真值源：`docs/design/spec-button-subtrans-2026-11-16.md` §3.10（:278-293）、§3.5（:230-236）、§2.3（rounded-ctl 统一）；计划真值 `docs/plans/2026-11-16-four-feedbacks.md` Task3（:127-145）。冲突即停报。

## 二、改动文件（仅此二件 + 一测试）

- Modify `apps/web/src/pages/OutlineTreeSection.tsx`（11 处）
- Modify `apps/web/src/pages/DistillPage.tsx`（2 处）
- Test Modify `apps/web/src/pages/DistillPage.test.tsx`（既有 class/裸 button 断言同步改，**用例数不变**；OutlineTreeSection 无既有测试文件，本卡不新建）

## 三、改法（钉死）

1. 全部改 `<Button …>`（从 `../components/ui` 导入；布局类走透传 className）。行号为改前位置：

| 文件 | 行 | 文案 | 目标（变体·tone·尺寸） |
|---|---|---|---|
| OutlineTreeSection | 110 | AI 生成大纲树 | `primary` sm（busy 期间 disabled 形态不变） |
| OutlineTreeSection | 113 | 手动加卷 | `secondary` sm |
| OutlineTreeSection | 116 | 编辑已存树 | `secondary` sm |
| OutlineTreeSection | 119 | 偏离复核 | `secondary` sm |
| OutlineTreeSection | 139 | 加阶段 | `quiet` primary sm |
| OutlineTreeSection | 142 | 删卷 | `quiet` danger sm（L1 单击直删） |
| OutlineTreeSection | 169 | 加卡 | `quiet` primary sm |
| OutlineTreeSection | 172 | 删阶段 | `quiet` danger sm（L1 单击直删） |
| OutlineTreeSection | 217 | 删卡 | `quiet` danger sm（L1 单击直删） |
| OutlineTreeSection | 241 | 保存大纲树 | `primary` sm |
| OutlineTreeSection | 244 | 放弃草稿 | `secondary` sm |
| DistillPage | 60 | 保存模板 | `primary` md |
| DistillPage | 63 | 恢复默认 | `secondary` md |

2. 禁止：改数据请求/状态逻辑、改文案、加图标、加确认簇、动 `inputCls` 圆角。归一后两文件 `grep -c "<button"` 各为 0。

## 四、先红后绿回归测试（以下命令均在项目根目录执行）

1. 先改 `DistillPage.test.tsx` 中锁旧形态的断言（改为断言 `getByRole('button', {name:'保存模板'})` 的 class 含 `bg-primary` 与 `h-ctl`；恢复默认含 `border-line`）→ 跑定向应红（现实现仍是裸 button）。
2. 按三、改两文件 → `pnpm --filter @inkforge/web exec vitest run src/pages/DistillPage.test.tsx` 全绿；用例数不得减少。
3. `grep -c "<button" apps/web/src/pages/OutlineTreeSection.tsx` → 0；同 DistillPage → 0。
4. `pnpm typecheck` → 0 错；`pnpm lint` → 0 错。
5. `pnpm --filter @inkforge/web exec vitest run` → 与 T2 后基线一致全绿（用例数持平，只增不减下限满足）；`pnpm test` 全绿。

## 五、验收命令（主审独立复核）

- 四、2/3/4/5 重跑；`git show --name-only HEAD` 仅触及二、清单三文件。
- GUI 黑盒由**主审**执行：1280×800 与 1600×900 截图，核验 ①大纲树工具条四钮（AI 生成/手动加卷/编辑已存树/偏离复核）同排 32px 对齐、AI 生成 busy 时 disabled 且 opacity 45%；②卷头/卡头行内 quiet 钮 hover 出灰底、删除钮 hover 出红软底且不撑坏行宽；③DistillPage 主/次钮形态；④控制台零新增 error。

## 六、约束

- 禁改：`apps/web/src/components/ui.tsx`、`apps/server/**`、`packages/**`、`index.css`、任何 `package.json`、`OutlineTreeSection.tsx`/`DistillPage.tsx` 之外的页面。
- 只 commit 不 push；`git add` 明确列三文件路径，永不 `git add -A`、永不 `--no-verify`。
- commit 标题：`feat(web): 大纲树与蒸馏页按钮归一 Button（D4-T3，13 处无行为变更）`；正文 `verify:` 行含定向结果、两文件 `<button` 计数 0、web 包与全量结果、typecheck/lint 结果；GUI 状态写「GUI 未验证（目验归主审）」；尾行 `Refs: DEC-2026-1116-01`。
- 卡外问题即停报，不得自行扩面。
