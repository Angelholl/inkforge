# 执行卡 OB-T1：自适应输出预算（DEC-2026-1126-06）

## 一、根因
长章生成三次调用 completionTokens 全部正好顶格 8192（config.ts:163/174 local/cloud 硬编码），CJK 约 3.3 token/字 → 单次输出天花板 ≈2500 字，6000 字目标在 token 层结构性不可达、正文停在半截句。owner 拍板：按目标字数自适应估算输出预算，上限 512000（实现细则见计划 T1 钉死值）。

## 二、改动文件与改法
计划真值源=docs/plans/2026-11-26-output-budget-stitch.md 任务 T1（按指针工具读取；卡面与计划只作执行用途，输出与提交正文不得原文摘抄其中引文，锚点核对用存在性/计数）。
1. Create `apps/server/src/pipeline/budget.ts`：常量 TOKENS_PER_CHAR=4.0 / MARGIN_TOKENS=2048 / PROMPT_RESERVE_TOKENS=4096 / CEILING_TOKENS=512000（owner 拍板值）/ FLOOR_TOKENS=1024；纯函数 `estimateOutputBudget(targetChars: number, promptTokensEstimate: number, provider: ProviderConfig): number` = max(FLOOR, min(CEILING, ceil(targetChars×4.0)+MARGIN, provider.contextWindow − promptTokensEstimate − RESERVE))；辅助 `sumSlotBudget(b: Record<string, number>): number`。不做运行期 /models 探测（实现决策注释留痕）。
2. Modify `apps/server/src/pipeline/chapter.ts` 两调用点：`:254`（draft）与 `:379`（rewrite）的 `maxOutputTokens: config.providers.local.maxOutput` → `estimateOutputBudget(targetChars, sumSlotBudget(config.budgets.draft), config.providers.local)` / rewrite 用 `config.budgets.rewrite`。ProviderConfig 形状与 loadConfig 默认值不动（test/config.test.ts 钉值零改动）。

## 三、先红后绿回归测试
- **主审已预置红测试** `apps/server/test/pipeline/budget.test.ts`（5 用例，精确期望值内嵌）：第一步跑它确认全红（模块不存在），实现 budget.ts 后转绿。
- 接线后定向：`pnpm --filter @inkforge/server test -- test/pipeline/budget.test.ts test/config.test.ts` 全绿；既有 pipeline mock 用例零波及。

## 四、验收命令（以下命令均在项目根目录执行）
1. `pnpm typecheck && pnpm lint` → 零告警。
2. 定向见上；`pnpm --filter @inkforge/server test` 全量 ≥639（现基线实测 634＋本卡 +5，只增不减）。
3. `grep -n "estimateOutputBudget" apps/server/src/pipeline/chapter.ts` → 定义外调用恰 2 处（:254/:379 附近）。

## 五、约束
禁改：config.ts ProviderConfig/loadConfig 默认值、gate/L0 语义、shared 包。**不连主库查数据**——所需事实全在卡面/计划，测试自持夹具（本项目成人文学内容会触发通道过滤器，勿把库内正文带进输出流）。每卡一次提交只 commit 不 push，Conventional 前缀＋中文正文含 `verify:` 与 `Refs: DEC-2026-1126-06`；永不 --no-verify / -A。卡外问题即停回报。
