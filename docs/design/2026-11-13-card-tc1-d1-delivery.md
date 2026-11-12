# 卡 T-C1：D1 路线一·协议投递接线（renderQcTask 进 qc 请求）

## 一、根因

`renderQc`（`apps/server/src/prompts/render.ts:19`）已定义、已被契约测试钉住，但 **src 全库零调用**（grep 仅命中定义与测试）——`runL1Qc`（`src/quality/l1.ts:13-61`）的 user 消息从未携带输出协议（OVERALL/SEVERITY/DIMENSION/QUOTE/COMMENT）、七维度清单与格式示例，真模型不知道要按协议输出 → 挂机 run 53658048 的 60/60 qc 步解析失败、overall 恒 null（计划 F1，主审与 critic 均独立复核）。mock 测试全绿系 mock 直接喂协议文样掩盖了缺失。修复=把协议投递进每一轮 qc 请求（含修复重试轮）。DEC-2026-1113-01 拍板路线一。

## 二、改动文件

- Modify `apps/server/src/prompts/render.ts`（:19-35 区域 `renderQc` 删除，新增 `renderQcTask()`；注意 T-D1 已在本文件加入 `renderHardRules`，勿动之）
- Modify `apps/server/src/quality/l1.ts`（qcSlots draft 槽包裹待审标记；firstUser 尾接协议）
- Modify `apps/server/test/prompts/contract.test.ts`（renderQc 用例就地改 renderQcTask + 新增 1 用例：5→6——主审勘正，T-D1 已先行 +1）
- Modify `apps/server/test/quality/l1.test.ts`（3→5，+2 用例）
- server 基线 142→145（+3）。前置：T-A/T-B/T-D1 已合入。

真值细则 = 计划 `docs/plans/2026-11-13-inkforge-0.1.2.md` 任务 T-C1（约 :100-121）；冲突即停报。

## 三、改法（钉死）

1. `export function renderQcTask(): string;` 返回协议块，内容按计划 :109-112 逐行钉死：【评审任务】说明行；七维度逐项列表（`DIMENSIONS` 各出现恰一次，import 自 shared）；【输出格式】四行字段说明（SEVERITY/DIMENSION/QUOTE/COMMENT + 首行 `OVERALL: <1-10 整数>`）；完整 mini 示例块（其 DIMENSION 行取值必须为字面 `'示例维度'`，避免与七维度列表重复计数）；负约束行逐字：`不要输出 JSON、markdown 代码块或任何解释；QUOTE 必须从正文原样摘录，不超过 30 字；无问题则只输出 OVERALL 行。` 函数不接收参数、不嵌正文（正文由槽承载）。`renderQc` 整个删除，l1.ts 成为唯一使用方。
2. l1.ts 行为钉死（计划 :113）：qcSlots 的 draft 槽 content 改为 `` `【待审正文开始】\n${input.draft}\n【待审正文结束】` ``；`firstUser` 改为 `` `${assembled.user}\n\n${renderQcTask()}` ``（修复重试第二请求沿用同一 firstUser）。draft 槽截断语义不变（预算 6000/3000、keep 'head' 不动）；`runL1Qc` 签名不变。

## 四、先红后绿回归测试

1. 先红：l1.test.ts 新增 `'qc 请求携带输出协议与待审正文标记'`——自定义包装 provider（`complete(req)` 先 `seen.push(req.user)` 再透传 `createMockProvider({qc:{text:GOOD_QC}})`），断言 `seen[0]` 依次 toContain `'OVERALL'`、`'SEVERITY:'`、`'【待审正文开始】'`、`'设定一致'`、`'不要输出 JSON'`；再增 `'修复重试请求同样携带协议'`（mock sequence 坏格式→repeat GOOD_QC，断言 `seen[1]` 含 `'OVERALL'`）→ `pnpm --filter @inkforge/server exec vitest run test/quality/l1.test.ts` 红。
2. 实现 → 同命令 5 passed；contract.test.ts：原用例就地改 `'renderQcTask：四字段标记 + 七维度各一次 + 负约束 + 示例块'`（断言含四字段标记、`for (const d of DIMENSIONS) expect(out.split(d).length - 1).toBe(1)`、负约束、`'示例维度'`）+ 新增用例 `'renderQcTask 不嵌入正文'`（`expect(out).not.toContain(DRAFT)`）→ `vitest run test/prompts/contract.test.ts` 6 passed（勘正：基数 5 含 T-D1 用例）。
3. 全量：`pnpm --filter @inkforge/server exec vitest run` 全绿 145（mock 路径零破坏）。

## 五、验收命令（主审独立复核）

- 四、三命令重跑（l1 5、contract 6、全量 145）；`grep -rn "renderQc\b" apps/server/src` 仅命中 `renderQcTask`（旧名零残留）；`grep -c "示例维度" apps/server/src/prompts/render.ts` ≥1。
- `git log -1 --stat` 仅触及二、四文件；diff 抽查：renderHardRules（T-D1 产物）未被误删；l1.ts 两处接线与卡面逐字一致。

## 六、约束

- 禁改：`plainproto.ts`（T-C2 范围）、`mock.ts`、`l0.ts`、`gate.ts`、`chapter.ts`（本卡不动）、`assembler.ts` 预算逻辑、`apps/web/`、docs/。DIMENSIONS 清单文案与 shared 保持一致（引用常量不复制常量）。
- 只 commit 不 push；`git add` 明确四文件；commit：`fix(server): qc 请求投递输出协议与七维度（D1 路线一）`，verify: 行含三命令结果+145，Refs: DEC-2026-1113-01。
- 协议块文案是后续真模型语料过门的契约——逐字按计划落笔，不得自行润色；任何不符即停报。
