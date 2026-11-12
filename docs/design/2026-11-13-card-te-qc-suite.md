# 卡 T-E：QC 召回回归集 + qc-recall 脚本

## 一、根因/动机

原 0.1 计划遗留项（v1 Task 34）：`test/quality/regression/` 与 `scripts/qc-recall.mjs` 均不存在——质检（L0 八检查 + L1 协议解析）缺一套钉死的召回/误报回归集，后续质检迭代无防退化网。本轮在 T-C3 真模型夹具与 T-D2 新检查之上建回归集（owner 2026-11-13 追加拍板项）。

## 二、改动文件

- Create `apps/server/test/quality/regression/corpus.ts`
- Create `apps/server/test/quality/regression/qc-regression.test.ts`（+4 用例）
- Create `apps/server/scripts/qc-recall.mjs`
- Modify `apps/server/package.json`（scripts 增 `"qc:recall": "tsx scripts/qc-recall.mjs"`）
- server 基线 153→157（+4）。前置：T-C3、T-D2 已合入（语料与 tail_replay 在场）。

真值细则 = 计划 `docs/plans/2026-11-13-inkforge-0.1.2.md` 任务 T-E（约 :166-188）；冲突即停报。

## 三、改法（钉死，计划 :172-180 接口块为准）

1. **corpus.ts**：`L0_BAD` 8 条（length_short / length_long / cliche_hard / replay / plagiarism / beat_missing / continuity_ghost / tail_replay——后六条复用 `test/quality/fixtures.ts` 既有导出，tail_replay 用 T-D2 的 TAIL_REPLAY_*），每条含 name、构造输入（draft/targetChars/prevTexts/blueprint）与 expectFail 检查名；`L0_GOOD` 4 条（happy_120 / soft_cliche_only（含「宛如」→ pass 且 cliche details 非空）/ band_edge（charCount 落 ±20% 边界内 ±2 字）/ no_prev_fresh（TAIL_REPLAY_DRAFT 无 prev 全过））；`L1_GOOD_RAW`/`L1_BAD_RAW` 各 3 条 = fs 读 `real/l1-good-00{1..3}.txt` / `l1-bad-00{1..3}.txt`，good 附 CAPTURE_CHAPTERS 章号供 quote⊆draft 校验。
2. **qc-recall.mjs**：import corpus 与 `src/quality/l0`、`src/llm/plainproto`（tsx 直跑）→ 输出五行指标：L0 recall=8 条坏样本 hardFail 且 expectFail 项 fail 的占比；L0 FPR=4 好样本 hardFail 占比；L1 协议解析通过（good 逐份 errors 空、overall∈1-10、quote 全⊆对应章 draft）/3；L1 合计合法 findings ≥1；L1 坏语料不抛 /3。退出码：8/8 且 FPR=0 且 3/3 且 findings≥1 → 0，否则 1（stderr 列未达标项）。
3. **package.json**：仅 scripts 加一行，版本行不动（0.1.2 已在）。

## 四、回归测试（新增即绿门）

1. `pnpm --filter @inkforge/server exec vitest run test/quality/regression/qc-regression.test.ts` → 4 passed（四用例逐字按计划 :185：L0 召回 / L0 误报 / L1 协议语料（M4 判据）/ L1 坏语料不抛）。
2. `pnpm --filter @inkforge/server run qc:recall` → 退出码 0，stdout 五行指标（8/8、0/4、3/3、≥1、3/3）。
3. 全量：`pnpm --filter @inkforge/server exec vitest run` → 全绿且 **实测 ≥157 且与逐任务增量和一致（+1/T-B、+1/T-D1、+3/T-C1、+3/T-C2、+2/T-C3、+3/T-D2、+4/T-E）**；把实测数写进 commit verify: 行。

## 五、验收命令（主审独立复核）

- 四、三命令重跑（4 passed、qc:recall 退出 0 五行指标、全量 ≥157 且=157）。
- `git log -1 --stat` 仅触及二、四文件；`git diff HEAD~1 -- apps/server/src` 为空（src 零改动）；corpus 对 fixtures 是 import 复用非复制（diff 抽查）。

## 六、约束

- 禁改：全部 `src/`、既有测试文件、`real/` 夹具、cliches 表、docs/；corpus 不得新造正文文本样本（一律复用 fixtures/夹具导出，保持单一真值）。
- 只 commit 不 push；`git add` 明确四文件；commit：`test(server): QC 召回回归集与 qc-recall 脚本`，verify: 行含 qc:recall 五行指标原文+全量实测计数，Refs: DEC-2026-1113-01。
- 任何指标不达标即停报（不得调样本凑通过率）；命令均在仓库根执行。
