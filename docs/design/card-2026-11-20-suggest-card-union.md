# 卡：blueprint-suggest 接大纲卡 + 确定性叠加 + PUT 保留必含节拍（Task-02）

以下命令均在项目根目录执行（你 cwd 即仓库根）。

## 根因/目标

blueprint-suggest 槽里无 outline、task 300 字被协议行占 ~210（简介只剩 ~90 字），模型拟的蓝图无性场景节拍；且 PUT blueprint 全量覆盖会把 Task-01 预填的 mustHaveBeats 洗掉（「重新建议+保存」一次即静默退化）。本卡：suggest 注入命中章的大纲卡 + 解析后服务端确定性叠加落地格（不赌模型输出，含 grade）；PUT 保存并集保留；planner task 预算 300→800。

## 施工真值（先读这两个区，按钉值执行，不得偏离）

`docs/plans/2026-11-20-gen-landing-style-inject.md`：
- 全局约束：第 9–17 行
- Task-02 全文：从「## Task-02」标题行读到「## Task-03」标题行为止（offset/limit 分段读；2-1 suggest 路由五步含 findOutlineCardForChapter/outlineCard 槽/确定性叠加 / 2-2 PUT 并集 / 2-3 planner 预算 / 2-4 测试 / 2-5 验收 / 2-6 命令）

依赖 Task-01 已提交（复用 `parseLandingCell` 与 grade 字段）。槽插入点锚=`name: 'spectrumReference'` 行之后（光谱线先例）。大文件按锚文本局部读，勿整读。

## 改动文件

1. `apps/server/src/http/routes.ts`：suggest 路由（shared type import 并 OutlineCardDto/OutlineTreeDto；模块级 `findOutlineCardForChapter` 不导出；outlineCardBrief 于 `const spectrumBrief` 之后；slots 插 outlineCard 槽 600；确定性叠加于错误闸门后）；PUT blueprint 路由并集保留（去重键=text trim 全等，不含 grade）
2. `apps/server/src/config.ts`：BUDGETS_PLANNER task 300→800
3. 测试：新建 `test/http/blueprint-suggest.test.ts`（计划 2-4A 全文可照抄，harness 模式照抄 test/plot.test.ts capturing plannerProvider）；`test/config.test.ts` planner 钉值更新

## 验收命令（按序，任一环失败即停）

```bash
pnpm lint
pnpm --filter @inkforge/server typecheck
pnpm --filter @inkforge/server exec vitest run test/http/blueprint-suggest.test.ts test/config.test.ts
pnpm --filter @inkforge/server test
```

全绿且测试基线只增不减。

## 约束

- 基线=派卡时 HEAD（开工记录哈希随回报）；只 commit 不 push；禁 `git add -A`（逐文件 add，含本卡面）；永不 `--no-verify`。
- 提交信息：`feat(server): blueprint-suggest 接大纲卡并确定性叠加落地格，PUT 保存保留必含节拍`，正文 `verify: <实测结果>；Refs: DEC-2026-1120-10`；注明「GUI 未验证（owner 真实测试）」。
- 不动清单照计划全局约束 4（不加 LANDING 协议行；blueprint 槽 1000 不动；光谱端点/spectrumReference 槽不碰）。
- 已知代价照计划 2-2（手工删节拍会被并集回填），勿自行加删除开关。
- 现场与卡面冲突即停待裁决。预计工时 ≤40 分钟，超时先回报进度。
