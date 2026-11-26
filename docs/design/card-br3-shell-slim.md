# 执行卡 BR-3：蒸馏页共享壳瘦身+只读徽标

## 一、根因
owner 拍板 D2：蒸馏页三卡（风格/剧情/光谱）删绑定下拉和按钮，保留新增/编辑/删除/指纹；卡片行加只读徽标显示该档案当前绑在哪本书。数据=BR-1 已落的 list 端点 boundBooks。

## 二、改动文件与改法
计划真值源=docs/plans/2026-11-26-bind-relocation-prose-draft.md §3.3（行号锚点按指针工具读取）。
1. `apps/web/src/components/DistillProfilesShell.tsx`：DistillApi(:89-95) 删 bind/listBooks；BookLike(:79-82) 无残余引用则一并删；DistillLabels 删 chooseBookMsg/boundMsg/bindFailMsg/bindLabelPrefix 四键（interface+类型推导同步）；:146 books useQuery、:157 bindBook state、:225-242 bind 函数、:281-298 绑定 select+按钮 JSX 全删；DistillProfileBase(:84-87) 增 `boundBooks?: Array<{id;title}>`；卡片行 :259 sourcePath span 后加徽标 `{p.boundBooks && p.boundBooks.length > 0 && (<span className="text-xs text-primary-strong">已绑定：{p.boundBooks.map((b) => `《${b.title}》`).join('')}</span>)}`（无绑定不渲染，无任何 onClick=只读）。
2. `PlotProfilesSection.tsx` :10-16 删 bind/listBooks 两行、labels 删四键；`SpectrumProfilesSection.tsx` 同形。

## 三、先红后绿回归测试（改写不净减）
- R-BR3-1（PlotProfilesSection.test.tsx:175-195 原绑定例改写）`it('BR：蒸馏页剧情卡无绑定控件，徽标只读显示已绑定书')`：stub list 带 boundBooks→queryByLabelText(/绑定书-/)=null、queryByRole('button',{name:'绑定'})=null、getByText(/已绑定：《测试书》/) 在场；徽标元素无 select/button。
- R-BR3-2（SpectrumProfilesSection.test.tsx:134-154）同形。

## 四、验收命令（以下命令均在项目根目录执行）
1. `pnpm --filter @inkforge/web test -- PlotProfilesSection.test.tsx SpectrumProfilesSection.test.tsx DistillProfilesShell.test.tsx DistillPage.test.tsx` → 全绿；T3 file input 三例与 T4 两例零回归。
2. `grep -n "bindBook\|api.bind\|listBooks\|chooseBookMsg\|boundMsg\|bindFailMsg\|bindLabelPrefix" apps/web/src/components/DistillProfilesShell.tsx apps/web/src/pages/PlotProfilesSection.tsx apps/web/src/pages/SpectrumProfilesSection.tsx` → 零命中。
3. `grep -n "已绑定" apps/web/src/components/DistillProfilesShell.tsx` → 徽标渲染 1 处。

## 五、约束
禁改：ProfilesListShell、analyze/save/remove/草稿预览/file input 路径；ImitationProfilesSection（不经本壳，BR-7b 处置）零触碰。每卡一次提交只 commit 不 push，`verify:`+`Refs:` 尾注；永不 --no-verify/-A。卡外问题即停回报。
