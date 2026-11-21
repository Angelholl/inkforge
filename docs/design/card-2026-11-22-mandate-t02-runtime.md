# 卡：落地策略 T02 层①运行时——合成节拍 + queue 持久化注入 + l0 最小牙 + 渲染跳过 + 预览警示

以下命令均在项目根目录执行（相对路径）。

> 派卡前置：T01 已验收合入（landing-mandate.test 绿）。非禁入卡型，走 hy4。执行中读 >4KB 文件用 pointer 工具，禁整读。

## 根因/目标

DEC-2026-1122-01 层①运行时：cadence 书在 queue 拾章时拿到确定性落地节拍（持久化，drafter 与 QC 同源——critic 条件1）；l0 对 mandate 条目按最小牙判定（≥1 H 词或 ≥2 不同 L 词——critic 条件2）并带「书级H未达·落地策略」归因；render 空关键词行跳过；导入预览警示。计划真值=docs/plans/2026-11-22-landing-mandate.md **Task-02**（步骤 1-13 全钉值照序执行）。

## 改动文件（卡外改动即超范围）

- Create：`apps/server/src/pipeline/mandate.ts`、`apps/server/test/pipeline/mandate.test.ts`
- Modify：`src/worker/queue.ts`（:80-81 resume 门后插一行）、`src/quality/l0.ts`（:191-203 beat_coverage 分支，**旧回调体逐字保留为 else 路径**）、`src/prompts/render.ts`（:22 与 :92-107 关键词段空数组跳过）、`src/settings-import.ts`（outline 预算警示后、章级预填前插「0 落地格∧description 含分级制」警示）
- Test Modify：`test/quality/l0.test.ts`、`test/prompts/contract.test.ts`、`test/settings-import.parse.test.ts` 追加

## 先红后绿

mandate.test 新用例先写先跑红（幂等/零扰动/off↔cadence 切换/非法 JSON 视同 off/targetChars 保现值），实现转绿；l0/contract/parse 追加用例先红后绿；既有钉值用例不改断言。

## 验收命令

```bash
pnpm -F @inkforge/server exec vitest run test/pipeline/mandate.test.ts test/quality/l0.test.ts test/prompts/contract.test.ts test/settings-import.parse.test.ts
pnpm -F @inkforge/server exec vitest run test/pipeline/chapter.test.ts test/pipeline/continue.test.ts test/http/settings-import.test.ts test/worker/queue.test.ts
pnpm lint
```

第一行全绿（新用例含「连续」禁词断言）；第二行=冲击清单 #4/#5/#8/#9/#12 复核全绿（卡源条目/尾部块形态/apply 钉值/queue 旧行为逐字节不变）；lint 零输出。

## 约束

- 卡面首步=计划 Task-02 步骤1 grep 停机步：`grep -n "分级制" apps/server/test/http/settings-import.test.ts apps/server/test/settings-import.parse.test.ts` 预期零命中（主审 2026-11-22 已实测零命中）；有命中即停手上报，不得自行改夹具钉值。
- 合成文案两式禁含「连续」二字（critic 条件3）；`MANDATE_TEXT_PREFIX='〔书级落地策略〕'` 精确值。
- l0 改动不得触碰卡源条目路径与 fail-open 语义；`wordsEmpty` 早退分支保留。
- 1301 纪律：禁读 landing-words 词表原文与 data/**；夹具自造词表（l0.test 既有 LW 夹具形态）。
- 只 commit 不 push；`feat(server):` 前缀+中文，正文 verify: + `Refs: DEC-2026-1122-01`；永不 --no-verify；永不 git add -A，逐文件 add（含本卡面）。
- 现场冲突即停待裁决。
