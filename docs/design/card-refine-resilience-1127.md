# 卡面：refine map-reduce 容错三件套（DEC-2026-1127-01，A 案）

## 根因（已实证，勿重查）

活体复现三连、失败点漂移：owner 实测死在 segment 5/14 空返回；主审 run1 死 seg3 空返回；run2 死 seg2 provider 异常（~180s 顶满每段超时）。输入=设定集降噪全文 40475 字（屏显逐字对上），切 14 段后 **seg 1/3/5/7/9/11 全是「（一）…（六）」三字段章节标记行**——模型对这种微段合理返回空串，`refine.ts:84` 裸 `trim()===''` 即整单 throw；provider 异常路径（`refine.ts:80-81`）同样一票否决。anthropic 层只重试 HTTP 429/5xx（`llm/anthropic.ts:6`），超时=AbortError 立即抛、200 空 content 静默返回，容错全在调用方。

## 改动文件与改法（只动这两件）

1. `apps/server/src/refine.ts` — `splitRefineSegments`：`\n\n` 切出的段落 **<50 字**者并入下一段（以 `\n\n` 连接）；末段为微段则并入前段尾部。超长 >10666 硬切逻辑不变。
2. `apps/server/src/refine.ts` — map 循环逐段容错（对齐 l1/imitation「重试一次再回退」既有模式）：单段**异常或 trim 后空返回** → 立即原样重试一次；重试仍失败/仍空 → **把该段原文压入 mapOutputs 继续**（超 chunkBudgetChars 按现有 slice 截）。外部 signal.aborted 不得吞——立即抛出结束整单，不重试不回退。
3. reduce 判定不动（reduce-empty/failed 照旧致命）。容错降级不留痕字段、DTO 不动（面板成品可编辑，用户可见）。
4. `apps/server/test/refine.test.ts` — 见下。

## 先红后绿回归测试（先写断言确认红，再实现）

- **分段器**：微段并入下一段；末位微段向前并；现有「段落边界 [5000,10666,9334,1000]」例不受扰（全部 ≥50 字）。
- **空返回容错**：假 provider 对某段首次返回 `''`、重试给正常文本 → 整体成功，产出含重试结果。
- **异常容错**：某段首次 throw、第二次成功 → 整体成功；两次都失败 → mapOutputs 含该段原文（reduce prompt 里可见）。
- **abort 不吞**：signal 已 aborted → provider 调用恰 1 次即抛，无重试。
- **既有两例改新行为**：原「map 段报错→throw refine-map-failed: segment 3/4」「map 段空输出→throw」按上述语义更新（名目可保留、断言改容错成功路径）；测试条数只增不减。

## 验收命令（以下命令均在项目根目录执行）

- `pnpm --filter @inkforge/server exec vitest run test/refine.test.ts` → 全绿
- `pnpm --filter @inkforge/server test` → 全量绿、不低于当前实测基线
- `pnpm --filter @inkforge/server typecheck` → 零错

## 约束

- 只 commit 不 push；Conventional 前缀+中文描述，正文 `verify:` 写测试结果。
- 防过滤器条款：不连主库（apps/server/data）；输出与提交信息禁引原文，测试夹具用合成串。
- 非交互禁提问；files_touched 精确=上述两文件。
- GUI 不适用（无界面改动），提交信息注明「GUI 未验证（无界面改动）」。
