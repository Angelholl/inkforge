# 卡 T2：D4 按钮归一 · BookDetailPage（13 处 + 人物卡 L2 两步确认）

## 一、根因与目标

全站 65 处裸 `<button>` 无统一形态（R1 清点）。T1 已落 `Button` 公共组件（`apps/web/src/components/ui.tsx`，已合入 HEAD）。本卡把 `BookDetailPage.tsx` 的 13 处按规范归一，并把落库删除入口（人物卡）升 L2 两步确认。真值源：`docs/design/spec-button-subtrans-2026-11-16.md` §3.1（:189-206 映射表）、§1.5 L2（:140）、§3.15-1（:332）、§2.3（rounded-ctl 统一）；计划真值 `docs/plans/2026-11-16-four-feedbacks.md` Task2（:100-124）。冲突即停报。

## 二、改动文件（仅此二件）

- Modify `apps/web/src/pages/BookDetailPage.tsx`
- Test Modify `apps/web/src/pages/BookDetailPage.test.tsx`（+2 用例，web 基线 12 文件/44 用例 → 46 用例）

## 三、改法（钉死）

1. 全部 13 处改 `<Button …>`（从 `../components/ui` 导入；`className` 透传放最后，布局类走透传）。行号→目标形态（`变体·tone·尺寸`，行号为改前位置）：

| 行 | 文案 | 目标 | 备注 |
|---|---|---|---|
| 209 | 整书生成 | `primary` md | — |
| 212 | 刷新 | `secondary` md | — |
| 225 | 导出 | `secondary` md | — |
| 250 | 保存设定 | `primary` md | 原 `mt-2` 走透传 className |
| 280 | 保存（人物卡编辑） | `primary` sm | — |
| 283 | 取消 | `secondary` sm | — |
| 292 | 编辑 | `quiet` primary sm | — |
| 300 | 删除（人物卡） | `quiet` danger sm | 升 L2，见三、3 |
| 324 | 添加人物 | `secondary` sm | — |
| 363 | 补摘要 | `quiet` primary sm | — |
| 367 | 生成 | `quiet` primary sm | 原 `ml-auto` 走透传 |
| 391 | 保存蓝图 | `primary` md | — |
| 394 | 生成本章 | `secondary` md | 行为不变 |

2. `:291` 预览 `span` 加 `min-w-0`（防挤压微调，§3.15-1）。
3. **人物卡删除 L2 确认簇**（替换单击直删）：点「删除」→ 原地展开确认簇 = 警示文案 `<span className="text-danger text-xs">该人物卡及其历史状态将一并删除，不可恢复。</span>` + `<Button variant="danger" size="sm" solid>确认删除</Button>` + `<Button variant="secondary" size="sm">取消</Button>`；点「取消」收簇且**不发** DELETE；点「确认删除」调既有 `api.deleteCharacter` 成功后收簇。不自动回退、不改请求语义、不加图标。
4. 禁止：改任何数据请求/状态逻辑（除三、3 的确认簇状态）、改文案、动其它文件、动 `inputCls` 圆角（非目标）。归一后该文件 `grep -c "<button"` 必须为 0。

## 四、先红后绿回归测试（以下命令均在项目根目录执行）

1. 先在 `BookDetailPage.test.tsx` 追加 2 用例（沿用该文件既有 render/stub 手法）：
   - ①点人物卡「删除」→ 确认簇出现 → 点「取消」→ 簇收起且 fetch 未发出 `DELETE` 请求。
   - ②点「删除」→ 点「确认删除」→ 发出 `DELETE /api/books/<bookId>/characters/<id>` 且该行消失。
2. `pnpm --filter @inkforge/web exec vitest run src/pages/BookDetailPage.test.tsx` → 新用例红（现实现单击直删/无 Button）。
3. 按三、改页面 → 定向全绿；既有断言若锁旧 class/裸 button，同步改但**不得删除用例**（只增不减）。
4. `grep -c "<button" apps/web/src/pages/BookDetailPage.tsx` → 0。
5. `pnpm typecheck` → 0 错；`pnpm lint` → 0 错；`pnpm --filter @inkforge/web exec vitest run` → 46 用例全绿；`pnpm test` → 279 全绿。

## 五、验收命令（主审独立复核）

- 四、2/3/4/5 重跑；`git show --name-only HEAD` 仅触及二、清单二文件。
- GUI 黑盒由**主审**执行（执行者无浏览器通道）：1280×800 与 1600×900 各截图，核验 ①整书生成钮 36px 与同排 select/刷新/导出顶底对齐；②人物卡 L2 簇全流程（删除→簇→确认成功/取消收簇）；③Tab 聚焦出现 2px 主色描边；④控制台零新增 error。主审另核 `grep -rn "<button" apps/web/src/pages/BookDetailPage.tsx | wc -l` → 0。

## 六、约束

- 禁改：`apps/web/src/components/ui.tsx`（T1 产物，发现问题即停报）、`apps/server/**`、`packages/**`、`index.css`、任何 `package.json`。
- 只 commit 不 push；`git add` 明确列二文件路径，永不 `git add -A`、永不 `--no-verify`。
- commit 标题：`feat(web): BookDetailPage 按钮归一 Button 并升人物卡删除 L2 两步确认（D4-T2）`；正文 `verify:` 行含定向结果、`<button` 计数 0、web 包 46 全绿、全量 279 全绿、typecheck/lint 结果；GUI 状态写「GUI 未验证（目验归主审）」；尾行 `Refs: DEC-2026-1116-01`。
- 卡外问题即停报，不得自行扩面。
