# 执行卡 BR-7a：server 仿写 boundBooks 反查

## 一、根因
owner 追加拍板 D5：四类档案统一「列表归蒸馏页、绑定归书页」，仿写并入本批。server 侧=listImitationProfiles 响应逐条附 boundBooks（复用 BR-1 helper 扩枚举，不另造轮子）。

## 二、改动文件与改法
计划真值源=docs/plans/2026-11-26-bind-relocation-prose-draft.md §3.7（按指针工具读取）。
1. `packages/shared/src/api.ts` ImitationProfileDto(:553-559) 增可选 `boundBooks?: Array<{ id: string; title: string }>;`。BookDto 零改动（imitationProfileId :18 已在，与 plotProfileId 类型缺口不同）。
2. `apps/server/src/db/repositories/books.ts`：BR-1 的 listBooksBoundToProfile kind 联合类型扩 `'imitation'`、列名映射补 imitation_profile_id（镜像列，SQL 与 plot/spectrum 同形）——一处扩枚举。
3. `apps/server/src/http/routes.ts:1117` GET /api/imitation-profiles 改 `.map((p) => ({ ...p, boundBooks: booksRepo.listBooksBoundToProfile(db, 'imitation', p.id) }))`。仓库层 listImitationProfiles 返回形状不动；PUT :1125-1135 与 imitationBindSchema 零改动；无新迁移（列在 0005）。

## 三、先红后绿回归测试
- R-BR7-1（test/http/imitation.test.ts **末位**加，自持夹具——前序 delete 例会清空档案表）`it('BR：GET /api/imitation-profiles 逐条带 boundBooks（绑定书反查）')`：POST {draft} 两存（同 hash 得 v1/v2 行）→建书→PUT imitation 绑 v1→GET list 断言 v1 boundBooks toEqual([{id,title}])、v2 toEqual([])。

## 四、验收命令（以下命令均在项目根目录执行）
1. `pnpm --filter @inkforge/server test -- test/http/imitation.test.ts test/imitation.test.ts` → 全绿；T13（:86-96/:98-120）零回归。
2. `git diff -- apps/server/src/db/migrations` → 空。
3. `grep -n "listBooksBoundToProfile" apps/server/src/db/repositories/books.ts apps/server/src/http/routes.ts` → 定义 1 + 调用 4（style/plot/spectrum/imitation）。

## 五、约束
禁改：PUT /api/books/:bookId/imitation、imitationBindSchema、fusion/apply.ts:98-103、注入槽预算 600。依赖 BR-1 已落（执行序保证）。每卡一次提交只 commit 不 push，`verify:`+`Refs:` 尾注；永不 --no-verify/-A。卡外问题即停回报。
