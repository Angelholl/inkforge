# 执行卡 BR-1：server 徽标数据链（boundBooks）

## 一、根因
蒸馏页三卡要显示「该档案当前绑在哪本书」的只读徽标，但三个 list 端点现状均不返回已绑书信息（已核实）；共享 BookDto 类型面缺 `plotProfileId`（服务端 toBook 早已回传）。本卡只做 server 最小加法，UI 在 BR-3/4。

## 二、改动文件与改法
计划真值源=docs/plans/2026-11-26-bind-relocation-prose-draft.md §3.1（细节按指针工具读取）。
1. `packages/shared/src/api.ts`：BookDto(:9-27) 在 spectrumProfileId:20 后增 `plotProfileId?: string | null;`（注释沿 :19-20 先例）；StyleProfileDto(:339-346)/PlotProfileDto(:573-579)/SpectrumProfileDto(:598-605) 各增可选 `boundBooks?: Array<{ id: string; title: string }>;`。
2. `apps/server/src/db/repositories/books.ts`（listBooks:103-105 后新增）：`export function listBooksBoundToProfile(db: Database, kind: 'style' | 'plot' | 'spectrum', profileId: string): Array<{ id: string; title: string }>` —— style=JOIN book_style_profiles 关联表（引用真相，辅档命中）；plot/spectrum=books 镜像列固定字面量映射（无用户输入拼接）。
3. `apps/server/src/http/routes.ts`：GET /api/style-profiles(:919-931)、/api/plot-profiles(:1156)、/api/spectrum-profiles(:1195) 响应逐条 map 附 boundBooks。仓库层 listPlotProfiles/listSpectrumProfiles 返回形状不动。

## 三、先红后绿回归测试
- R-BR1-1（test/plot.test.ts）`it('BR：GET /api/plot-profiles 逐条带 boundBooks（绑定书反查）')`：建书→存档案→PUT plot 绑定→GET list 断言 `toEqual([{id,title}])`；未绑第二档案 `toEqual([])`。
- R-BR1-2（test/spectrum.test.ts）同形（PUT /spectrum）。
- R-BR1-3（test/http/style.test.ts）一主一辅两档案多选绑定→GET list 断言两者 boundBooks 均含该书（辅档命中=关联表反查语义钉死）。
顺序：先加三例跑红，再实现转绿；随后三文件全量零回归（T10 守：plot.test.ts:158-168、spectrum.test.ts:250-257 不动）。

## 四、验收命令（以下命令均在项目根目录执行）
1. `pnpm --filter @inkforge/server test -- test/plot.test.ts test/spectrum.test.ts test/http/style.test.ts` → 全绿含新 3 例。
2. `git diff -- apps/server/src/db/migrations` → 空（无新迁移）。
3. `grep -n "listBooksBoundToProfile" apps/server/src/db/repositories/books.ts apps/server/src/http/routes.ts` → 定义 1 + 调用 3。

## 五、约束
禁改：四个 PUT 绑定路由与 schema、fusion/apply.ts、存储面（无新迁移）、既有仓库 list 签名。执行序=本卡是批次首卡。每卡一次提交只 commit 不 push，提交信息 Conventional 前缀+中文+`verify:`（定向结果+基线数+GUI 未验证）+`Refs: docs/plans/2026-11-26-bind-relocation-prose-draft.md`；永不 --no-verify、永不 git add -A。卡外问题即停回报。
