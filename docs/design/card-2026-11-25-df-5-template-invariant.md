# 执行卡 DF-5：自定义模板路径逐维下限不变量（纯测试卡）

- 计划真值=`docs/plans/2026-11-25-dims-floor.md`（Task DF-5 + §3.7 + §4 全局约束）；决策归档=DEC-2026-1125-01。
- 前置：DF-1~DF-4 已合入（7592333/39b2ddb/61a4d12/9c81281）。生产代码**零改动卡**——机制已在 DF-2/DF-3 落地，本卡新例预期**首跑即绿**=不变量回归钉（先红后绿条款对纯 pin 卡的形态=「若首跑不绿即停报根因」）。

## 0. 背景（根因）

自定义蒸馏模板整体替换默认指令（analysis.ts:46），量条文案不在其 prompt 中——逐维下限必须由解析层保证、与 instruction 来源无关。此不变量此前无测试钉，本卡补上防未来重构绕过。

## 1. 改动文件（不得越界）

| 文件 | 操作 |
| --- | --- |
| `apps/server/test/http/distill-template.test.ts` | 新增 1 例；禁删改既有用例（含 :105-109 断言与 DF-1 新加两条） |

生产代码零改动：`analysis.ts`、`plainproto.ts`、`distill-job.ts`、shared api.ts 均不得动 diff。

## 2. 钉死规格（照计划 §3.7/§3.8）

- PUT 一个**不含「70 字」字样**的自定义模板（复用文件内既有 `CUSTOM_TEMPLATE` 夹具；若其现含量条字样则新建一条无字量的模板常量）。
- distill → 轮询到 done，断言三件事：①第一次调用 prompt=该模板且不含默认指令六维清单字样；②**第二次解析调用发生**且 user 段含 `低于下限70字` 反馈（逐维缺口触发）；③job result 的 `warnings` 非空。
- **fixture 铁律（DF-3/DF-4 轮教训）**：mock provider 必须保证每次调用都拿到有效响应——解析两轮+可能的自评调用都要喂到，勿用单次即尽队列。

## 3. 改法（每步一个动作 + 可核对结果）

- [ ] A0 实跑 `pnpm test` 记数（应 ≥812=DF-4 收口数）。核对：数字记卡面。
- [ ] S1 写新例（规格 §2）；首跑预期**绿**；若红→即停报根因（不得改生产代码迁就测试）。核对：定向该文件全绿、既有用例零删改。
- [ ] C1 `pnpm lint` → C2 定向（distill-template.test.ts）→ C3 `pnpm test` 全量 ≥A0 只增 → C4 `pnpm typecheck` → C5 `pnpm deadcode`。每步核对：exit 0 / 数字记录。
- [ ] C6 `git diff --stat HEAD~1..HEAD`（提交后）改动=仅 §1 一文件。核对：对表。
- [ ] C7 提交：`test(server): 自定义模板路径逐维下限不变量回归钉（DF-5）`，正文 `verify: ...` + `Refs: docs/plans/2026-11-25-dims-floor.md`。只 commit 不 push。

## 4. 验收命令

以下命令均在项目根目录执行：

```
pnpm --filter @inkforge/server test -- test/http/distill-template.test.ts
pnpm lint
pnpm test
pnpm typecheck
pnpm deadcode
```

## 5. 约束

- 只 commit 不 push；永不 `--no-verify`；永不 `git add -A`。
- 读 >4KB 文件用 `python C:/Users/57850/.zcode/tools/pointer_tools.py` 的 pointerize/read_pointer/read_diff_only，禁止整读文件全文（distill-template.test.ts 超 4KB）。
- 卡外问题即停回报；本卡唯一落盘=测试文件一处新增。
