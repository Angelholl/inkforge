# 卡 T5：D4 按钮归一 · 仿写/伏笔/风格档案/设置四文件（13 处，含 3 处行为变更）

## 一、根因与目标

`Button` 公共组件已由 T1 落库。本卡归一 4 个文件的 13 处裸 `<button>`，并随卡落三处规格钉死的行为变更（仿写档案删除 L2 确认簇、伏笔删除 L2 确认簇、SettingsPage 保存钮 loading 态）。真值源：`docs/design/spec-button-subtrans-2026-11-16.md` §3.7（:245-254）、§3.6（:237-244）、§3.14（:315-323）、§3.13（:309-314）、§3.15-2/4（:333/:335）、§1.5 L2（:140）、§1.3 loading（:122）；计划真值 `docs/plans/2026-11-16-four-feedbacks.md` Task5（:171-200）。冲突即停报。

## 二、改动文件（仅此六件）

- Modify `apps/web/src/pages/ImitationProfilesSection.tsx`（5 处 + :96 span）
- Modify `apps/web/src/pages/ForeshadowingsSection.tsx`（3 处）
- Modify `apps/web/src/pages/StyleProfilesSection.tsx`（4 处 + :121 span）
- Modify `apps/web/src/pages/SettingsPage.tsx`（1 处）
- Test Create `apps/web/src/pages/ImitationProfilesSection.test.tsx`（+2）
- Test Modify `apps/web/src/pages/ForeshadowingsSection.test.tsx`（+2）、`apps/web/src/pages/SettingsPage.test.tsx`（+1）、`apps/web/src/pages/StyleProfilesSection.test.tsx`（既有断言同步改，用例数不变）

## 三、改法（钉死）

1. 全部改 `<Button …>`（从 `../components/ui` 导入；布局类走透传）。行号为改前位置：

| 文件 | 行 | 文案 | 目标（变体·tone·尺寸） |
|---|---|---|---|
| ImitationProfilesSection | 97 | 删除（仿写档案） | `quiet` danger sm → 升 L2（三、2） |
| ImitationProfilesSection | 115 | 绑定 | `secondary` sm |
| ImitationProfilesSection | 149 | 拆解分析 | `primary` md |
| ImitationProfilesSection | 179 | 确认入库 | `primary` sm |
| ImitationProfilesSection | 182 | 放弃 | `secondary` sm |
| ForeshadowingsSection | 90 | 标记回收 | `quiet` primary sm |
| ForeshadowingsSection | 95 | 删除（伏笔） | `quiet` danger sm → 升 L2（三、2） |
| ForeshadowingsSection | 121 | 登记伏笔 | `secondary` sm |
| StyleProfilesSection | 125 | 版本/收起版本 | `quiet` primary sm（ml-auto 走透传） |
| StyleProfilesSection | 177 | 蒸馏 | `primary` md（**本卡仅形态替换**，busy 维持 disabled；改 loading 归 T11B） |
| StyleProfilesSection | 234 | 确认入库 | `primary` sm |
| StyleProfilesSection | 237 | 放弃 | `secondary` sm |
| SettingsPage | 124 | 保存 | `primary` md，`type="submit"` 保留，改 `loading`（三、3） |

2. **L2 确认簇**（仿写档案删除、伏笔删除两处，形态同 T2）：警示文案 `<span className="text-danger text-xs">`，仿写=「该拆解档案将删除，已绑定书将自动解绑，不可恢复。」、伏笔=「该伏笔记录将删除，不可恢复。」；「确认删除」=`danger` solid sm、「取消」=`secondary` sm；确认或取消后收簇、不自动回退、请求语义不变。
3. **SettingsPage 保存钮 loading**：废止「保存中…」换字，children 恒「保存」，`loading={saving}`（组件内部 disabled+aria-busy+保宽 spinner）。
4. span 微调：`ImitationProfilesSection.tsx:96` sourcePath span 加 `min-w-0 break-all`；`StyleProfilesSection.tsx:121` meta span 加 `min-w-0`。
5. 禁止：改数据请求语义、改文案、加图标、动 `inputCls` 圆角、改 StyleProfilesSection 蒸馏的轮询/请求逻辑。归一后四文件 `grep -c "<button"` 各为 0。

## 四、先红后绿回归测试（以下命令均在项目根目录执行）

1. 先写 5 个失败用例（沿用各文件既有 render/fetch-stub 手法；新建的 `ImitationProfilesSection.test.tsx` 照 `ForeshadowingsSection.test.tsx` 写法）：
   - 伏笔：①点「删除」→ 簇出现 → 点「取消」→ 簇收起且未发 DELETE；②点「删除」→ 点「确认删除」→ 发出 DELETE 且行消失。
   - 仿写：同款 ③④（确认发出 `DELETE /api/imitation-profiles/<id>` 形态按该文件既有 api 调用为准）。
   - SettingsPage：⑤`saving` 期间保存钮 `aria-busy="true"`、disabled、可见文本仍为「保存」。
2. `pnpm --filter @inkforge/web exec vitest run src/pages/ImitationProfilesSection.test.tsx src/pages/ForeshadowingsSection.test.tsx src/pages/SettingsPage.test.tsx src/pages/StyleProfilesSection.test.tsx` → 新用例红。
3. 按三、改四文件 → 定向全绿；既有断言同步改但用例数只增不减（web 包用例数较本卡开工前 +5，数字写进 commit verify）。
4. 四文件 `grep -c "<button"` 各 0；`pnpm typecheck` → 0 错；`pnpm lint` → 0 错；`pnpm --filter @inkforge/web exec vitest run` 全绿；`pnpm test` 全绿。

## 五、验收命令（主审独立复核）

- 四、2/3/4 重跑；`git show --name-only HEAD` 仅触及二、清单六文件。
- GUI 黑盒由**主审**执行：1280×800 与 1600×900 截图，核验 ①仿写档案 L2 簇全流程、sourcePath 长路径 break-all 不撑坏；②伏笔 L2 簇；③SettingsPage 保存钮 loading spinner 居中保宽不换字；④风格档案 meta 长文案 min-w-0、行内 quiet 钮不撑坏；⑤控制台零新增 error。

## 六、约束

- 禁改：`apps/web/src/components/ui.tsx`、`apps/server/**`、`packages/**`、`index.css`、任何 `package.json`、本卡六文件之外的页面。
- 只 commit 不 push；`git add` 明确列六文件路径，永不 `git add -A`、永不 `--no-verify`。
- commit 标题：`feat(web): 仿写/伏笔/风格档案/设置四文件按钮归一并落 L2 确认簇与 loading（D4-T5）`；正文 `verify:` 行含定向结果、四文件 `<button` 计数 0、web 用例数 +N 与全量结果、typecheck/lint 结果；GUI 状态写「GUI 未验证（目验归主审）」；尾行 `Refs: DEC-2026-1116-01`。
- 卡外问题即停报，不得自行扩面。
