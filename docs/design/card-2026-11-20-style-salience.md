# 卡：风格显著性——预算扩容 + 块序反转 + 设定集元信息降噪（Task-04）

以下命令均在项目根目录执行（你 cwd 即仓库根）。

## 根因/目标

离线重放实测（DEC-2026-1120-10 取证）：styleDims 合并 1411 字→600 头部截断（特色词汇/章节结构/六轴锚点整块消失）、fewShot 1746→1500 截且参考小说人名术语表 ~450 字排在范例前挤占预算、辅档案 rules 400 封顶致第三档案零注入、设定集版本/修订/决策记录等元信息混进世界观槽成模仿噪声。本卡：预算扩容、renderStyleBlock 块序反转（范例在前术语截 5 殿后）、辅封顶 400→800、refineForDescription 元信息降噪。

## 施工真值（先读这两个区，按钉值执行，不得偏离）

`docs/plans/2026-11-20-gen-landing-style-inject.md`：
- 全局约束：第 9–17 行
- Task-04 全文：第 848–1023 行（4-1 预算钉值 / 4-2 merge 封顶 / 4-3 renderStyleBlock 全文替换 / 4-4 降噪两正则+跳节逻辑 / 4-5 测试冲击清单 1-5 / 4-6 验收 / 4-7 命令）

依赖 Task-03 已提交（config.ts/config.test.ts 串行）。8k 表与 freqTerms 注入隔离不动。

## 改动文件

1. `apps/server/src/config.ts`：BUDGETS_DRAFT styleDims 600→1600、fewShot 1500→2500
2. `apps/server/src/style/merge.ts`：RULES_TOTAL_BUDGET 400→800
3. `apps/server/src/style/inject.ts`：renderStyleBlock 整体替换（计划 4-3 全文）
4. `apps/server/src/settings-import.ts`：META_LINE_RE/META_SECTION_RE + refineForDescription 跳节/跳行（计划 4-4 全文）
5. 测试：`test/config.test.ts`（draft 两值）、`test/style/merge.test.ts`（两例替换为三例钉 800，计划全文）、`test/style/analysis.test.ts`（块序用例反转）、`test/style/inject-blocks.test.ts`（新增顺序用例）、`test/settings-import.parse.test.ts`（降噪用例）

## 验收命令（按序，任一环失败即停）

```bash
pnpm lint
pnpm --filter @inkforge/server typecheck
pnpm --filter @inkforge/server exec vitest run test/config.test.ts test/style/merge.test.ts test/style/inject-blocks.test.ts test/style/analysis.test.ts test/settings-import.parse.test.ts
pnpm --filter @inkforge/server test
pnpm -r --if-present run typecheck
pnpm deadcode
```

全绿、测试基线只增不减、knip 零新增死导出。

## 约束

- 基线=派卡时 HEAD（开工记录哈希随回报）；只 commit 不 push；禁 `git add -A`（逐文件 add，含本卡面）；永不 `--no-verify`。
- 提交信息：`feat(server): 风格注入扩容显著性预算并反转风格块序与设定集元信息降噪`，正文 `verify: <实测结果>；Refs: DEC-2026-1120-10`；注明「GUI 未验证（owner 真实测试）」。
- 不动清单照计划全局约束 4（8k 表/蒸馏模板/freqTerms 隔离/DESCRIPTION_BUDGET 16000）。
- 现场与卡面冲突即停待裁决。预计工时 ≤40 分钟，超时先回报进度。
