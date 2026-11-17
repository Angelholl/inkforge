# 卡 SM-05：绑定 API——zod 多选校验 + PUT/GET/409 改造（计划 Task-06）

## 背景/根因
DEC-2026-1117-04 裁决② API 层：PUT /api/books/:bookId/style 从单值 {profileId} 扩为多选（1 主+≤3 辅+逐维来源），zod superRefine 七规则人话 400；绑定时组装 V2 bundle 冻结内容落快照；GET 回显 styleBinding；档案删除 409 反查并查关联表（删辅档案同样拦截）。依赖：SM-02 关联表、SM-03 三函数、SM-04 buildStyleBundle 均已入库。

## 改动文件（只允许动这 4 个）
- Modify apps/server/src/http/schemas.ts（styleBindSchema 替换）
- Modify apps/server/src/http/routes.ts（PUT :583-605、GET :198-203、409 :631-644）
- Modify apps/server/test/http/style.test.ts
- Modify apps/server/test/http/style-snapshot.test.ts

## 改法
执行真值=docs/plans/2026-11-17-style-mixing-and-wizard-slim.md §Task-06（搜「### Task-06」定位分段读；superRefine 七规则文案、PUT 流程、测试 payload 与断言值全钉死）。要点序：
1. 先改测试：style.test.ts 新增 3 用例（多绑往返+校验矩阵 5 payload 人话 400+legacy 兼容与辅档案 409）；style-snapshot.test.ts 用例一/二 V1 断言改 V2 形态（snap.v===2/profiles[pid].rulesText 等，属全局约束①列明适配）+新增「重蒸新 id 不刷新绑定快照」用例 → 跑定向确认红。
2. schemas.ts 替换 styleBindSchema（superRefine 七规则，aux max(3) 自定义文案「风格档案最多绑定 4 个（1 主 + 3 辅）」）。
3. routes.ts：PUT 改造（解绑 null→setBookStyleBinding(null)；legacy 字符串归一单主；多绑逐 id 存在性 404 'profile not found' 沿用、解析容错复用 contentFromProfileRow（新增硬化、对齐 polish.ts:52-66 语义，非 chapter 现状——critic 1.2）、buildStyleBundle→setBookStyleBinding 落快照）；GET 加 styleBinding 回显；409 换 listBooksBoundToProfile 并查、文案结构不变。

## 先红后绿回归
第 1 步测试先行确认红 → schema/routes 实现 → 定向全绿。

## 验收命令（均在项目根目录执行）
1. `pnpm --filter @inkforge/server exec vitest run test/http/style.test.ts test/http/style-snapshot.test.ts` → 全绿（style 原 9+3=12、snapshot 原 3 适配+1=4）
2. `pnpm --filter @inkforge/server exec vitest run test/http` → 全绿（无回归）
3. `pnpm typecheck` → exit 0；`pnpm lint` → 零输出
4. `pnpm -r --if-present run test` → server 299（295+4）；web ≥85（SM-01 已入库则 86）；shared 2；合计 ≥386——**增量口径核对，绝对数与卡面不符先核对口径、不得改测试凑数**
5. `pnpm --filter @inkforge/web build` → exit 0
6. `pnpm audit --prod` → 零新增

## 约束
- 卡面自足；cwd 即项目根。只动上列 4 文件；卡外问题即停上报。
- 验证链任一环失败即停，不得带病提交；回滚点=revert 本卡单提交。
- 全程零接触生产库与 backups/。
- GET book 其余字段与既有路由结构不动；400 走 parseBody 人话链、404 文案沿用 :596。
- 只 commit 不 push；永不 --no-verify；永不 git add -A（只 add 上列 4 路径）。
- 提交信息 Conventional 前缀+中文，正文：`verify: <命令 1-6 实际结果摘要>`、`GUI 未验证（纯 server 路由）`、`Refs: DEC-2026-1117-04`。
- 返回报告：commit SHA + 各命令实际输出摘要 + 偏差说明。
