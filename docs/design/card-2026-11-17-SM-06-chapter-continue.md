# 卡 SM-06：chapter 管线消费改造——混合注入 + continue 注入（计划 Task-07 之 chapter/continue 部分）

## 背景/根因
DEC-2026-1117-04 裁决②③：生成管线素材块从「读单档案」改为「loadStyleBundle + mergeStyleProfiles 得 merged」，dims/axes/rules/terms/samples 全部走合并形态流入既有槽（inject.ts/rewrite.ts/assembler.ts 零改动）；裁决③：删除 `runMode !== 'continue'` 注入门——续写也注入混合风格，前 3 章声线锚保留，task 段末尾追加指令行「前文腔调优先，文风档案作质感参照。」。polish.ts 不在本卡（SM-07 做）。依赖：SM-03/04/05 已入库。

## 改动文件（只允许动这 3 个）
- Modify apps/server/src/pipeline/chapter.ts（:23 import、:110-121 voiceRef、:176-218 素材块、:245 task）
- Modify apps/server/test/pipeline/chapter.test.ts
- Modify apps/server/test/pipeline/continue.test.ts

## 改法
执行真值=docs/plans/2026-11-17-style-mixing-and-wizard-slim.md §Task-07（搜「### Task-07」定位分段读，只执行 chapter/continue 相关 checkbox，polish 条目留 SM-07）。要点序：
1. 测试先行：chapter.test.ts 新增「混合档案」用例（repo 直绑手工 bundle：主 4 维 70/辅 3 维 56 → 断言 system 含主辅维文本、含「（值 64）」、含主辅规则行；continue 同 bundle 再跑 → system 仍含【文风画像】、user 含指令行）；continue.test.ts 用例一改名+适配（ids 断言 `'[]'`→`'["mock-profile:s3","mock-profile:s1","mock-profile:s2"]'` 按 B4 裁决④ ids 不看开关 + critic 4.5 id 命名空间 `${profileId}:`；capture harness 沿 chapter.test.ts:229-240 形态抓 prompt 断言 system 含 'RULES: 句长 10-20 字。'、user 含指令行且不含【范例片段】）+新增 fewshot 开用例（user 含【范例片段】与'样本三'）→ 定向确认红。
2. chapter.ts：import 换 merge 模块；素材块重写（binding=getBookStyleBinding ?? 主镜像合成 → loadStyleBundle → merged → 六变量赋值；删 continue 门）；voiceRef generate 改 merged.primaryMetricsJson 容错回落 live 行；task 追加 continue 指令行（精确一行句号结尾）。
3. 不动项：fewShot 门 :216、:296 抄用检测 generate 门、inject.ts/rewrite.ts/assembler.ts、槽预算。

## 先红后绿回归
第 1 步测试先行确认红（continue 现不注入、ids 现 '[]'）→ 改 chapter.ts → 定向全绿。

## 验收命令（均在项目根目录执行）
1. `pnpm --filter @inkforge/server exec vitest run test/pipeline/chapter.test.ts test/pipeline/continue.test.ts test/pipeline/generate-drift.test.ts` → 全绿（chapter 原+1、continue 原 2 例适配+1 新）
2. `pnpm --filter @inkforge/server exec vitest run test/http/style-snapshot.test.ts` → 全绿（用例三快照优先语义不变）
3. `pnpm typecheck` → exit 0；`pnpm lint` → 零输出
4. `pnpm -r --if-present run test` → server 301（299+2）；web ≥85（SM-01 已入库则 86）；shared 2；合计 ≥388——**增量口径核对，绝对数与卡面不符先核对口径、不得改测试凑数**
5. `pnpm --filter @inkforge/web build` → exit 0
6. `pnpm audit --prod` → 零新增

## 约束
- 卡面自足；cwd 即项目根。只动上列 3 文件；卡外问题即停上报。
- 既有断言仅允许计划 §Task-07 与全局约束①列明的 continue 用例适配，其余不得动。
- 验证链任一环失败即停，不得带病提交；回滚点=revert 本卡单提交。
- 全程零接触生产库与 backups/。
- 只 commit 不 push；永不 --no-verify；永不 git add -A（只 add 上列 3 路径）。
- 提交信息 Conventional 前缀+中文，正文：`verify: <命令 1-6 实际结果摘要>`、`GUI 未验证（纯 server 管线）`、`Refs: DEC-2026-1117-04`。
- 返回报告：commit SHA + 各命令实际输出摘要 + 偏差说明。
