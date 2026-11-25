# FB-Lane-X 卡：F1 高频词链（FB-F1-1→F1-5 串行，DEC-2026-1125-03）

## 工作树与分支（先读这条）

你只在 **worktree `I:\inkforge-wt-x`**（分支 `fb-f1`，依赖已装好）内干活：改文件、跑测试、commit 全在这棵树；**禁止进入或改动 I:\inkforge 主树**。每任务一次 commit（Conventional 前缀+中文描述，正文 `verify:` 写红绿计数，尾行 `Refs: docs/plans/2026-11-25-four-feedbacks-batch.md`），只 commit 不 push；永不 --no-verify、永不 git add -A。

## 真值与执行范围

计划真值=`docs/plans/2026-11-25-four-feedbacks-batch.md`（本树内，>4KB 用 pointer_tools pointerize/read_pointer 读）。执行任务组=§5 之 **FB-F1-1 → FB-F1-2 → FB-F1-3 → FB-F1-4 → FB-F1-5**，逐卡红→绿→守三步照计划步骤串执行；精确字面量照 §3.1；先红后绿——红未出现即停回报，不得直接写绿。测试基线：分支起点 818（server）只增不减，本 lane 收口 ≥821（+R-F1-1/2/5 三新增例），web 测试若被 D14/DistillProfilesShell 牵连则照计划处置、计数不减。

## 红线（越界即停回报）

- 禁改：`style/merge.ts`（FREQ_TERMS_MAX=10）、`worker/queue.ts:62`、`apps/server/data/**`、fewShot 门控 `chapter.ts:209-212` 逐字不动、`expectsLanding` 判定。
- 逃生门「无则省略本行」在 analysis.ts FREQTERMS 行**逐字保留**——硬下限只对写了但不足的行触发，样本真无高频词不得被重试强造（§3.1）。
- NAMES 过滤先于缺口统计（被剔除项不产生缺口）。
- warning 文案精确串：`高频词「X」说明仅N字，低于下限30字`；第二轮仍不足**只透传 warning 不抛错**。
- DF-5 自定义模板不变量测试随迁（R-F1-3）=扩断言非删例。

## 验收命令（均在本 worktree 根执行）

每卡守步照计划 §5 grep/定向核对；lane 收口：`pnpm --filter @inkforge/server test` 全绿 ≥821、`pnpm typecheck && pnpm lint` 全绿、web 受牵连文件定向绿；`git diff master..fb-f1 -- apps/server/src/style/merge.ts apps/server/src/worker/queue.ts apps/server/data` 输出为空。

## 执行指针令

执行中读取大于 4KB 的文件用 `python C:/Users/57850/.zcode/tools/pointer_tools.py` 的 pointerize/read_pointer，禁止整读全文；卡外问题即停回报，不得自行发明计划没写的东西。
