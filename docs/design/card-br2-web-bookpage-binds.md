# 执行卡 BR-2：书页双绑定条（剧情+光谱）

## 一、根因
owner 拍板 D1：剧情/人物光谱档案绑定从蒸馏页迁到小说书页，各归各区——剧情条挂「世界观与剧情大纲」卡片剧情大纲 textarea 旁，光谱条挂人物卡分区顶部；样式对齐现有 StyleBindPanel（select+保存绑定 primary+解绑 secondary）。风格面板本身不动。

## 二、改动文件与改法
计划真值源=docs/plans/2026-11-26-bind-relocation-prose-draft.md §3.2（组件 props/JSX 形态逐字钉死，按指针工具读取）。
1. 新增 `apps/web/src/components/ProfileBindBar.tsx`（默认导出约 30 行）：props `{label, profiles:[{id,name}], boundId, onBind(profileId|null)}`；sel state+useEffect 随 boundId 重置；渲染 label span+select(aria-label=`${label}绑定`，首项「（未绑定）」)+保存绑定(primary, disabled=!sel||sel===boundId)+解绑(secondary, disabled=!boundId)+行尾当前绑定文案（已删档案回显「（档案已删除）」）。按钮变体逐字对齐 StyleBindPanel :311-316；import 仅 useEffect/useState、Button(./ui)、selectBase(./Field)。
2. `apps/web/src/pages/BookDetailPage.tsx`：:348 后旁增 ['plot-profiles']/['spectrum-profiles'] 两查询（refetchInterval 5000）；bindStyle:552-560 后并列 bindPlotProfile/bindSpectrumProfile 两 handler（逐字镜像其 try/catch/refetch；消息文案见计划 §3.2）；剧情条插 :825/:826 之间、光谱条插 :844 p-4 内 <ul>:845 前；:961 指引文案改「请先在上方绑定人物光谱档案」（id/aria-describedby 结构不动）。
PUT 路由与 client API（bindPlot/bindSpectrum）零改动复用。

## 三、先红后绿回归测试
- R-BR2-1 `it('BR：剧情绑定条——选择档案保存 → PUT /api/books/b1/plot {profileId}，消息+当前绑定回显')`（承接迁移 T1 的 PUT 断言）。
- R-BR2-2 `it('BR：光谱绑定条——保存 → PUT /api/books/b1/spectrum {profileId}，人物卡分区顶部可见')`（承接 T2）。
- R-BR2-3 `it('BR：绑定条解绑 → PUT {profileId:null}；已绑书回显当前档案名')`。
- T8 随迁：BookDetailPage.test.tsx:495 断言文本改 `/请先在上方绑定人物光谱档案/`，禁用+不静默隐藏两断言逐字保留。

## 四、验收命令（以下命令均在项目根目录执行）
1. `pnpm --filter @inkforge/web test -- BookDetailPage.test.tsx -t 'BR：'` → 先红后绿 3 例；随后该文件全量绿（R-F4-3/:575/:970 守不动）。
2. `grep -n "ProfileBindBar" apps/web/src/pages/BookDetailPage.tsx` → import 1+挂载 2。
3. `git diff -- apps/web/src/pages/BookDetailPage.tsx | grep -c "StyleBindPanel"` → diff 仅新增行，风格面板区块零触碰。

## 五、约束
禁改：StyleBindPanel 组件本体与挂载、四 PUT 路由/schema、R-F4-3 用例（:411-435）。依赖 BR-1 的 BookDto.plotProfileId 类型（执行序已保证）。每卡一次提交只 commit 不 push，`verify:`+`Refs:` 尾注同批次惯例；永不 --no-verify/-A。卡外问题即停回报。
