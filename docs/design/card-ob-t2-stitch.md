# 执行卡 OB-T2：finishReason 落库＋顶格续写拼接回路（DEC-2026-1126-07）

前置＝OB-T1 已验收合入（同改 chapter.ts，串行依赖）。

## 一、根因
finishReason 已在 provider 层采集（src/llm/anthropic.ts:75 JSON 路径、:109/:123/:128 流式；types.ts:19 字段已存在）但全 src 零消费——截断静默入库，rewrite 轮对不可达成的目标空转两轮。owner 拍板：顶格（finishReason='length'，OpenAI-compat /v1 通道值）时从断点续写拼接，而非整篇重写；落库走 JSON 字段通道免迁移。

## 二、改动文件与改法
计划真值源=docs/plans/2026-11-26-output-budget-stitch.md 任务 T2（按指针工具读取；卡面与计划只作执行用途，输出与提交正文不得原文摘抄其中引文）。
1. Create `apps/server/src/pipeline/stitch.ts`：纯函数 `stitchSegments(segments: string[], maxOverlapTrim = 40): string`——接缝去重＝相邻段间后缀-前缀最长重叠裁剪（上限 40 字），无重叠原样拼接。
2. Modify `apps/server/src/llm/mock.ts`：文本行为新增可选字段 `finishReason?: string`（默认 'end_turn'，现有测试零波及）。
3. Modify `apps/server/src/pipeline/chapter.ts` draft/rewrite 段：生成调用返回 finishReason==='length' → 以已写全文＋续写指令再发起调用（最多追加 **3 段**），续写 prompt 经 prompts/render.ts 新增 `renderStitchContinuation(writtenSoFar: string): string`（指令字面量见计划 T2）；自然收尾即停；整篇仍只过一次既有 L0/QC/gate（语义零改动）。
4. 落库（无迁移）：draft/rewrite 版本 params_json 增 `finishReason`、触发时增 `stitchSegments`（段数）；对应 run_steps.output_json 同步带上。

## 三、先红后绿回归测试
- R-T2-1 stitch.test.ts：①重叠 ≤40 字正确裁剪；②无重叠原样拼接；③超 40 字公共段不误裁（返回原文）。
- R-T2-2 chapter.test.ts 新增管线用例：draft 步 behavior.sequence=[{text:seg1,finishReason:'length'},{text:seg2,finishReason:'end_turn'}]，qc 用现有 qcPassText → 断言落库版本内容=seg1+裁剪后 seg2、draft 步恰两次调用、params_json.finishReason='length'＋stitchSegments=2。
- R-T2-3 mock.ts finishReason 默认路径一条断言（未设置时仍 'end_turn'）。

## 四、验收命令（以下命令均在项目根目录执行）
1. `pnpm typecheck && pnpm lint` → 零告警。
2. `pnpm --filter @inkforge/server test -- test/pipeline/stitch.test.ts test/pipeline/chapter.test.ts test/llm/mock.test.ts` 全绿；既有 no-stitch 套件（chapter/continue/generate-drift/rewrite）零回归即证明。
3. `pnpm --filter @inkforge/server test` 全量 ≥643（T1 后基线＋本卡 +4，只增不减）。

## 五、约束
禁改：DB migrations、gate/L0 判定逻辑、types.ts 字段形状、anthropic.ts 采集层。**不连主库查数据**——测试一律自持夹具，勿把库内正文带进输出流（本项目成人内容会触发通道过滤器）。每卡一次提交只 commit 不 push，Conventional 前缀＋中文正文含 `verify:` 与 `Refs: DEC-2026-1126-07`；永不 --no-verify / -A。卡外问题即停回报。
