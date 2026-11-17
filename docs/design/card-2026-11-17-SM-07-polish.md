# 卡 SM-07：polish 基准素材走合并档案（计划 Task-07 之 polish 部分）

## 背景/根因
DEC-2026-1117-04 裁决② 一致性：polish.ts L0 基准素材（terms/referenceTexts/voiceRefMetrics）现读单档案，多选后须走同一 merged 形态。critic 4.6 采纳：merged.samples 已在 merge 第 7 步按 chapterNo 轮转，polish 不得再套 slice 二次轮转（会少取且集合漂移）——直取即可；素材块抽成导出纯函数 polishBenchmarks 便于确定性直测。merged undefined → 三值维持现行空缺省。依赖：SM-04/05/06 已入库。

## 改动文件（只允许动这 2 个）
- Modify apps/server/src/pipeline/polish.ts（:41-80 基准素材块）
- Modify apps/server/test/http/polish.test.ts

## 改法
执行真值=docs/plans/2026-11-17-style-mixing-and-wizard-slim.md §Task-07（搜「### Task-07」定位分段读，只执行 polish 两条 checkbox）。要点序：
1. polish.test.ts 先新增用例（直喂手工 bundle 调 polishBenchmarks：断言 terms 含辅条、referenceTexts deep-equal merged.samples 文本序列 3 条不得再 slice、voiceRefMetrics 可解析；再跑 runPolishChapter 既有 harness 断言 task 含 '灵力：代指法力'）→ 红。
2. polish.ts：抽 `export function polishBenchmarks(db, book, chapterNo)`（binding 回落合成/loadStyleBundle/mergeStyleProfiles 与 chapter 同构；terms=merged.terms；referenceTexts=merged.samples.map(text) 空数组→undefined；voiceRefMetrics=merged.primaryMetricsJson 容错→回落 getLatestProfile(主).metrics_json 再容错；merged undefined→三值现行缺省），管线消费返回值，taskText 组装与槽预算不动。

## 先红后绿回归
第 1 步测试先行确认红 → 第 2 步实现 → 定向全绿。

## 验收命令（均在项目根目录执行）
1. `pnpm --filter @inkforge/server exec vitest run test/http/polish.test.ts` → 全绿（本包增量 +1）
2. `pnpm --filter @inkforge/server exec vitest run test/pipeline` → 全绿（无回归）
3. `pnpm typecheck` exit 0；`pnpm lint` 零输出
4. `pnpm -r --if-present run test` → server 302（301+1）；web ≥85（SM-01 已入库则 86）；shared 2；合计 ≥389——**增量口径核对，不得改测试凑数**
5. `pnpm --filter @inkforge/web build` → exit 0
6. `pnpm audit --prod` → 零新增

## 约束
- 卡面自足；cwd 即项目根。只动上列 2 文件；卡外问题即停上报。
- POLISH_PASSES 与槽预算不动；referenceTexts 不得二次轮转。
- 全程零接触生产库与 backups/。
- 验证链任一环失败即停，不得带病提交；回滚点=revert 本卡单提交。
- 只 commit 不 push；永不 --no-verify；永不 git add -A（只 add 上列 2 路径）。
- 提交信息 Conventional 前缀+中文，正文：`verify: <命令 1-6 实际结果摘要>`、`GUI 未验证（纯 server 管线）`、`Refs: DEC-2026-1117-04`。
- 返回报告：commit SHA + 各命令实际输出摘要 + 偏差说明。
