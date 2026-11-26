# 执行卡 BR-4：风格卡徽标+D3 守护

## 一、根因
owner 拍板 D2/D3：蒸馏页风格卡加只读徽标；风格绑定唯一入口=书页（现状核实蒸馏页风格区已无绑定控件，D3 落地为守护断言钉死不回潮，非删除动作）。数据=BR-1 boundBooks。

## 二、改动文件与改法
计划真值源=docs/plans/2026-11-26-bind-relocation-prose-draft.md §3.4（按指针工具读取）。
1. `apps/web/src/pages/StyleProfilesSection.tsx`：卡片行 :291（metrics span 闭合）后加与 BR-3 同款徽标 span（字面量逐字相同，无绑定不渲染、只读）。
2. 本卡不改任何逻辑。

## 三、先红后绿回归测试
- R-BR4-1（StyleProfilesSection.test.tsx）`it('BR：风格卡徽标显示已绑定书；蒸馏页风格分区无任何绑定入口（D3 守护）')`：list stub 带 boundBooks→getByText(/已绑定：《样本之书》/)；within(section) 断言 queryByLabelText(/绑定书-/)=null 且 queryByRole('button',{name:'保存绑定'})=null。

## 四、验收命令（以下命令均在项目根目录执行）
1. `pnpm --filter @inkforge/web test -- StyleProfilesSection.test.tsx` → 全绿含新例；T5（:594-617 删除 409 拒绝例）零回归。
2. `grep -n "绑定" apps/web/src/pages/StyleProfilesSection.tsx` → 仅 :311 删除确认警示与 :223-228 错误文案两处既有命中，无新增绑定控件行。
3. `git diff -- apps/web/src/pages/ImitationProfilesSection.tsx` → 空（仿写分区此时仍零触碰，BR-7b 才动）。

## 五、约束
禁改：StyleBindPanel 本体与挂载、四 PUT 路由/schema、fusion/apply。每卡一次提交只 commit 不 push，`verify:`+`Refs:` 尾注；永不 --no-verify/-A。卡外问题即停回报。
