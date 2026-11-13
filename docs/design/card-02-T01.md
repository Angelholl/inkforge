# 卡 0.2-T01：基线复测门（计划已入库，本卡只做实测核对）

## 根因/背景
docs/plans/2026-11-13-inkforge-0.2-draft.md（v2，commit d27ca9f）钉定测试基线 shared 2 / web 10 / server 157 / 全量 169。开工前须实测核对，不符即停报（不符=主审停止拆后续卡）。

## 改动文件
无 src 改动。若实测与基线不符，只允许新建 `docs/baseline/0.2-t01-baseline-report.md` 记录实测数，不得改任何代码/测试。

## 改法（步骤，以下命令均在项目根目录执行）
1. `pnpm --filter @inkforge/shared test` → 记录用例数（基线 2）
2. `pnpm --filter @inkforge/web test` → 记录（基线 10）
3. `pnpm --filter @inkforge/server test` → 记录（基线 157；耗时数分钟耐心等）
4. 三项逐一对照基线：一致 → 在最终输出打印 `T01-BASELINE-OK`；任何一项不符 → 打印 `T01-BASELINE-DRIFT <实测值>` 并 exit 1。
5. 约束：挂机 run 进行中（runId 1dd814ed），测试用临时库不会扰它，但禁止重启任何服务/worker；禁止运行 crash-test/launch-hang。

## 先红后绿回归测试
本卡为只读核对卡，无代码回归。

## 验收命令（以下命令均在项目根目录执行）
```bash
node --import tsx -e "const db=require('better-sqlite3')('apps/server/data/inkforge.db',{readonly:true});console.log(db.prepare(\"select status from runs where id='1dd814ed-740d-4dc0-adad-54cd725adc87'\").get().status)"
```
（run 仍为 running=未扰动佐证）

## 约束
- 只 commit 不 push；若产出 report 文件则 commit `docs(baseline): 0.2-T01 基线复测记录`，否则无 commit（工作树保持净）。
- 全程不落盘任何 src/test/config 文件。
