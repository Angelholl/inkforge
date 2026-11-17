# 卡 SM-08：详情页风格绑定面板——多选+逐维来源（计划 Task-08，web +3）

## 背景/根因
DEC-2026-1117-04 裁决② UI：StyleBindSelect 单选下拉（BookDetailPage.tsx:11-29）替换为 StyleBindPanel——档案勾选列表（上限 4，第 5 个 disabled）、主风格 select、七维来源 select（选项=主+已勾辅，默认主）、保存绑定/解绑 Button。critic 2.4 采纳：面板必须书加载完成才挂载+key 重建（useState 初值首帧捕 null 永不重算的 bug）、换主重映射未动维度、无主禁用保存、chip 改多选语义、fewshot 归零显性化。依赖：SM-04 shared 类型、SM-05 GET 回显已入库。

## 改动文件（只允许动这 3 个）
- Modify apps/web/src/pages/BookDetailPage.tsx（:11-29 组件、:175-184 bindStyle fn、:294 chip、:474 调用点、:481 提示语）
- Modify apps/web/src/api/client.ts（仅 :202-203 注释，签名不动）
- Modify apps/web/src/pages/BookDetailPage.test.tsx

## 改法
执行真值=docs/plans/2026-11-17-style-mixing-and-wizard-slim.md §Task-08（搜「### Task-08」定位分段读；组件 state/aria-label/PUT body 精确断言/挂载形态全钉死）。要点序：
1. BookDetailPage.test.tsx 先新增 describe 3 用例（stub fetch 沿 :57-83；fixture 补 styleBinding/styleFewshotOn/styleProfileId 键）：①勾 2 档案保存→PUT body deep-equal `{primaryProfileId:'p1', auxProfileIds:['p2'], dimsSource:{七键全值}}`；②5 档案勾满 4 第 5 个 disabled+解绑发 `{profileId:null}`；③binding 非空初值渲染（book stub 首帧 undefined 次帧真书；断言勾选/主风格/维度来源值全落对+保存 enabled）→ 红。
2. BookDetailPage.tsx：StyleBindPanel（checked/primary/dims/touched 四 state；上限 4 disabled+title；主 select 选项=已勾选；七维 select 选项=主+已勾辅；失勾回落 primary→checked[0]、dims 失勾键→主；**换主时未 touched 且值===旧主的 dims 键改指新主**；保存 Button disabled={!primary || checked.length===0}，提交补齐七键；解绑 onBind({profileId:null})）；调用点 `{book ? <StyleBindPanel key={book.id} .../> : null}`；bindStyle fn 签名改 `(body: StyleBindBody)`、成功消息追加「绑定保存后文风示例开关已归零」；chip 改 `已绑定 N 个（主：<档案名>）`；:481 提示语改「续写也注入混合风格：前文腔调优先，文风档案作质感参照。」
3. client.ts 注释补充，签名与透传不动。

## 先红后绿回归
第 1 步测试先行确认红 → 第 2-3 步实现 → 定向全绿。

## 验收命令（均在项目根目录执行）
1. `pnpm --filter @inkforge/web exec vitest run src/pages/BookDetailPage.test.tsx` → 全绿（本包增量 +3）
2. `pnpm --filter @inkforge/web exec vitest run` → 89 passed（85+4，含 SM-01 的 +1）
3. `pnpm typecheck` exit 0；`pnpm lint` 零输出
4. `pnpm -r --if-present run test` → server 302；web 89；shared 2；合计 393 ≥ 359——**增量口径核对，不得改测试凑数**
5. `pnpm --filter @inkforge/web build` → exit 0
6. `pnpm audit --prod` → 零新增

## 约束
- 卡面自足；cwd 即项目根。只动上列 3 文件；卡外问题即停上报。
- 按钮用 ui.tsx 既有 Button 组件；aria-label 逐字按计划（「风格档案勾选-${p.name}」「主风格」「维度来源-${d}」）。
- 验证链任一环失败即停，不得带病提交；回滚点=revert 本卡单提交。
- 只 commit 不 push；永不 --no-verify；永不 git add -A（只 add 上列 3 路径）。
- 提交信息 Conventional 前缀+中文，正文：`verify: <命令 1-6 实际结果摘要>`、`GUI 未验证（owner 真实测试）`、`Refs: DEC-2026-1117-04`。
- 返回报告：commit SHA + 各命令实际输出摘要 + 偏差说明。
