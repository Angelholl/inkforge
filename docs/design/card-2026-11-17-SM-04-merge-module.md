# 卡 SM-04：风格合并模块 merge.ts 纯函数（计划 Task-05，20 用例）

## 背景/根因
DEC-2026-1117-04 裁决② 杂糅核心：七维各自来源、六轴按实际贡献维数加权（主保底 1）、规则主全量+辅去重补充（400 封顶）、术语并集上限 10、样本最大余数 3 席位+顺延循环+池内轮转+id 命名空间——集中新模块 apps/server/src/style/merge.ts，供管线以 merged 形态消费（与现单档案同形）。算法风险集中处，20 例装配单测=确定性 fixture 直喂，零 LLM。依赖：SM-02 已入库（关联表/仓储/shared 类型）。

## 改动文件（只允许动这 2 个）
- Create apps/server/src/style/merge.ts
- Create apps/server/test/style/merge.test.ts

## 改法
执行真值=docs/plans/2026-11-17-style-mixing-and-wizard-slim.md §Task-05（搜「### Task-05」定位分段读；常量/类型（含 mergeVersion）/签名/算法第 0-8 步/20 用例名与断言值全钉死，逐字执行）。要点序：
1. 先写 merge.test.ts 20 用例（计划逐条列名+断言值：原 13+critic 补 7——实际贡献计权、轴参与 w>0、规则多辅 break 语义、样本顺延多轮、辅含主去重、contentFromProfileRow 坏 JSON 降级、确定性 meta 测）→ 定向确认红。
2. 实现 merge.ts：常量 RULES_TOTAL_BUDGET=400/TERMS_MAX=10/SAMPLE_QUOTA=3；类型 StyleProfileContent/StyleBundleV2（v:2+mergeVersion）/MergedStyleProfile；buildStyleBundle（mergeVersion 恒 1）/parseStyleBundle（V1 适配+损坏→undefined+mergeVersion 缺省容忍=1）/loadStyleBundle（无快照回落 live 行、行解析复用 contentFromProfileRow）/normalizeDimsSource/contentFromProfileRow（缺键坏 JSON→空内容不抛）/mergeStyleProfiles（算法 0-8 步：去重防御、dims 实际来源+回落链、权重按实际贡献主保底 1、轴参与需 w>0、规则主全量辅 break-continue 语义、术语 10 上限、样本最大余数+while 顺延循环+pickStyleSamples 池内轮转+id 前缀 `${profileId}:${s.id}` map 新对象、primaryMetricsJson 透传）。

## 先红后绿回归
20 用例先行全红 → 实现 → 20 passed。

## 验收命令（均在项目根目录执行）
1. `pnpm --filter @inkforge/server exec vitest run test/style/merge.test.ts` → 20 passed
2. `pnpm typecheck` exit 0；`pnpm lint` 零输出
3. `pnpm -r --if-present run test` → server 295（275+20）；web ≥85（SM-01 已入库则 86）；shared 2；合计 ≥382——**增量口径核对，不得改测试凑数**
4. `pnpm --filter @inkforge/web build` → exit 0
5. `pnpm audit --prod` → 零新增

## 约束
- 卡面自足；cwd 即项目根。只动上列 2 文件；卡外问题即停上报。
- merge.ts 算法函数纯函数确定性无随机；仅 loadStyleBundle 读 db；复用 inject.ts pickStyleSamples 不另造轮转；pick 返回池对象只 map 不改池。
- 验证链任一环失败即停，不得带病提交；回滚点=revert 本卡单提交。
- 只 commit 不 push；永不 --no-verify；永不 git add -A（只 add 上列 2 路径）。
- 提交信息 Conventional 前缀+中文，正文：`verify: <命令 1-5 实际结果摘要>`、`GUI 未验证（纯 server 模块）`、`Refs: DEC-2026-1117-04`。
- 返回报告：commit SHA + 各命令实际输出摘要 + 偏差说明。
