# 执行卡 DF-4：warning 透传（层③服务端）

- 计划真值=`docs/plans/2026-11-25-dims-floor.md`（Task DF-4 + §3.6 字面量 + §4 全局约束）；决策归档=DEC-2026-1125-01。
- 前置：DF-1=7592333、DF-2=39b2ddb、DF-3=61a4d12 已合入（`analyzeStyle` 现返回 `{analysis, evaluation, warnings}`）。

## 0. 背景（根因）

三层强制层③的服务端半程：重试后仍不达的维产出 `warnings`，须随蒸馏草稿透传到轮询响应供前端（DF-6）显示人工补厚。落点=DTO 可选字段+result_json 并入；**routes.ts 零改动**（轮询端点已 cast 整个 result 为 DTO，字段自动带出）。

## 1. 改动文件（不得越界）

| 文件 | 操作 |
| --- | --- |
| `packages/shared/src/api.ts` | Modify——仅 `DistillStyleDraftDto`（:385-393 区域）加可选字段 `warnings?: string[]`；禁碰 STYLE_DIMENSIONS/别名函数/StyleAnalysisDto/StyleProfileCreateBody/DistillJobDto |
| `apps/server/src/style/distill-job.ts` | Modify——runDistillJob 解构改收 `warnings`，result_json 由 `{analysis,samples,evaluation,sourceText}` 扩为含 `warnings`；job 状态语义零变化（done/100/done、error=null） |
| `apps/server/test/http/distill-jobs.test.ts` | 新增 1 例（先红）；既有 :18-19 短 DIM 夹具断言不动（G2：其触发重试+warning 属预期，既有断言只查首轮 prompt/落库字段应保持绿——DF-3 收口全量已实证此点） |

## 2. 钉死规格

- `DistillStyleDraftDto` 加 **可选** `warnings?: string[]`（仅草稿层；不进 StyleAnalysisDto / StyleProfileCreateBody / 归档 rules_json）。
- warning 单条字面量（DF-3 已产，逐字）：`维度${dim}仅${chars}字，低于下限70字`。
- routes.ts diff 必须为空；`git add` 只加 §1 三文件。

## 3. 改法（每步一个动作 + 可核对结果）

- [ ] A0 实跑 `pnpm test` 记数（应 ≥811=DF-3 收口数）。核对：数字记卡面。
- [ ] A1（红，先写测试）在 distill-jobs.test.ts 新增 HTTP 例：自建 summarizerProvider fixture——**每次调用都须拿到有效响应**（解析两轮均为短文本→走 warning 路径；勿用单次即尽的队列），轮询到 done → 断言 `job.status='done'`、`job.error=null`、`(job.result as DistillStyleDraftDto).warnings` 含钉死文案（按 fixture 实际维名与字数精确断言）。核对=**红**（字段不存在/undefined）。
- [ ] B1（绿）加 DTO 可选字段+result_json 并入 warnings；重跑 A1 绿。核对：`git diff packages/shared/src/api.ts apps/server/src/http/routes.ts` —— api.ts 仅 DTO 一处、routes.ts **零 diff**。
- [ ] B2（守）既有 distill-jobs.test.ts 全部用例绿且未删改；确认 createStyleProfile 入库路径不带 warnings。核对：定向绿。
- [ ] C1 `pnpm lint` → C2 定向（distill-jobs.test.ts + api 相关 shared 测试）→ C3 `pnpm test` 全量 ≥A0 只增 → C4 `pnpm typecheck` → C5 `pnpm deadcode`。每步核对：exit 0 / 数字记录。
- [ ] C6 `git diff --stat`（含暂存）改动 ⊆ §1 三文件。核对：对表。
- [ ] C7 提交：`feat(shared,server): 蒸馏草稿warnings透传（DF-4）`，正文 `verify: ...` + `Refs: docs/plans/2026-11-25-dims-floor.md`。只 commit 不 push。

## 4. 验收命令

以下命令均在项目根目录执行：

```
pnpm --filter @inkforge/server test -- test/http/distill-jobs.test.ts
pnpm lint
pnpm test
pnpm typecheck
pnpm deadcode
```

## 5. 约束

- 只 commit 不 push；永不 `--no-verify`；永不 `git add -A`。
- 读 >4KB 文件用 `python C:/Users/57850/.zcode/tools/pointer_tools.py` 的 pointerize/read_pointer/read_diff_only，禁止整读文件全文（api.ts、distill-jobs.test.ts 超 4KB）。
- web 显示归 DF-6，本卡不碰 apps/web；卡外问题即停回报。
