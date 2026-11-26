# 执行卡 BR-7b：web 仿写双端统一（书页立条+蒸馏页摘控件）

## 一、根因
owner 追加拍板 D5：仿写档案并入「列表归蒸馏页、绑定归书页」统一口径。绿步卡内**先立后破**（先加书页仿写条，再摘蒸馏页仿写控件），同卡一提交原子落，全程无绑定无入口窗口。融合门重绑指引随迁改指书页（BR-3 摘框后已失实；主审采纳 planner 补漏，钉死仅一行）。

## 二、改动文件与改法
计划真值源=docs/plans/2026-11-26-bind-relocation-prose-draft.md §3.7（字面量逐条钉死，按指针工具读取）。
1. `apps/web/src/pages/BookDetailPage.tsx`：查询族旁增 ['imitation-profiles']→api.listImitationProfiles（refetchInterval 5000）；handler 族旁增 bindImitationProfile(profileId|null)（api.bindImitation，消息「仿写档案已绑定；AI 建议蓝图时将注入该结构拆解」/「仿写档案已解绑」，catch「仿写档案绑定失败：…」，成功 void refetch()）；sec-style p-4 内 fewshot 块 :1005-1030 之后、p-4 闭合前插 `<div className="mt-2 border-t border-line pt-2"><ProfileBindBar label="仿写档案" .../></div>`（沿 fewshot 先例分隔；StyleBindPanel 与 fewshot 块零触碰）。
2. `apps/web/src/pages/ImitationProfilesSection.tsx`：删 :13 books useQuery、:15 books 变量、:23 bindBook state、:83-100 bind 函数、:132-149 绑定 select+按钮 JSX（useQuery import 保留——:12 查询仍用）；:115 sourcePath span 后加只读徽标（与 BR-3 字面量逐字相同）。分区标题/列表卡结构/表单/文件选择/删除 L2 零改动。
3. `apps/web/src/components/FusionGateDialog.tsx:418`：「要重新绑定，请到「蒸馏」页里对应档案的绑定框。」→「要重新绑定，请到书详情页对应分区的绑定条（剧情／人物光谱／仿写）。」**仅此一行**；:385 文案不动。

## 三、先红后绿回归测试
- R-BR7-2 `it('BR：仿写绑定条——选择档案保存 → PUT /api/books/b1/imitation {profileId}，消息+当前绑定回显')`（BookDetailPage.test.tsx）。
- R-BR7-3 `it('BR：蒸馏页仿写卡无绑定控件，徽标只读显示已绑定书')`（ImitationProfilesSection.test.tsx；PROFILE 夹具加 boundBooks 键，其余六例零干扰 T12 守）。

## 四、验收命令（以下命令均在项目根目录执行）
1. `pnpm --filter @inkforge/web test -- BookDetailPage.test.tsx ImitationProfilesSection.test.tsx` → 全绿；R-F4-3/T7 例零回归。
2. `grep -n "bindBook\|api.bindImitation\|绑定书-" apps/web/src/pages/ImitationProfilesSection.tsx` → 零命中；`grep -n "已绑定" ...同文件` → 徽标渲染 1 处（删除确认文案「已绑定书将自动解绑」按行核对不计入）。
3. `git diff -- apps/web/src/components/FusionGateDialog.tsx` → 仅 :418 一行。

## 五、约束
禁改：PUT /api/books/:bookId/imitation、ProfileBindBar 组件本体（BR-2 产物零改动复用）、StyleBindPanel/fewshot 块本体、融合门确认机制与张力把手（DEC-2026-1124-01/03/04）。依赖 BR-1/2/3/7a 已落。每卡一次提交只 commit 不 push，`verify:`+`Refs:` 尾注；永不 --no-verify/-A。卡外问题即停回报。
