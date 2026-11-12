# 卡 T-C2：D1 路线一·解析器最小加固（围栏/全角冒号/杂质分值）

## 一、根因

真模型输出常带 markdown 围栏、全角冒号、`OVERALL: 7/10` 类杂质分值——`parseFindings`（`apps/server/src/llm/plainproto.ts`）现行正则不容忍这些变体，即使 T-C1 投递了协议也会解析失败。本卡做最小宽容化（路线一的一部分，DEC-2026-1113-01），不做路线二式大改。

## 二、改动文件

- Modify `apps/server/src/llm/plainproto.ts`（:15 附近预处理、:32 字段行正则、:40-42 OVERALL 取数）
- Modify `apps/server/test/llm/plainproto.test.ts`（+3 用例）
- server 基线 145→148（+3）。前置：T-C1 已合入。

真值细则 = 计划 `docs/plans/2026-11-13-inkforge-0.1.2.md` 任务 T-C2（约 :123-132）；冲突即停报。

## 三、改法（钉死三条，`parseFindings(raw: string): ParsedFindings` 签名不变，`parseSummary` 不动）

1. 解析前丢弃所有以 ```` ``` ````（三反引号）开头的行（剥 markdown 围栏）。
2. 字段行正则改 `/^([A-Z]+)\s*[:：]\s*(.*)$/`（兼容全角冒号）。
3. OVERALL 取值先 `/(\d+)/` 提取首个整数再验 1-10：`OVERALL: 7/10`→7、`OVERALL: 7分`→7、`OVERALL: abc`→overall null 且 errors 含该行。

## 四、先红后绿回归测试

1. 先红三用例（`vitest run test/llm/plainproto.test.ts` 红）：
   - `'全角冒号字段行可解析'`：`SEVERITY：blocker` 等四行全角文样 → findings 1 条、errors 空；
   - `'markdown 围栏包裹输出可解析'`：整段 ```` ```\n<计划附录 D 风格合法文样>\n``` ```` → findings 3 条、overall 7；
   - `'OVERALL 值含杂质仍取整数'`：`OVERALL: 7/10` → 7；`OVERALL: abc` → null 且 errors 含该行。
2. 实现三处 → 同命令绿；`pnpm --filter @inkforge/server exec vitest run test/llm test/quality` 全绿（既有合法文样解析结果逐字节不变——协议严格性未放松）。

## 五、验收命令（主审独立复核）

- 四、命令重跑（plainproto.test 全绿、llm+quality 全绿、全量 148）；`git log -1 --stat` 仅触及二、二文件。
- diff 抽查：仅三处宽容化落点，`parseSummary` 与其余解析逻辑零改动；既有测试文件 diff 只增不改。

## 六、约束

- 禁改：`render.ts`、`l1.ts`、`mock.ts`、`l0.ts`、`gate.ts`、`chapter.ts`、`apps/web/`、docs/；不得放宽任何既有断言；不得顺手重构无关代码。
- 只 commit 不 push；`git add` 明确二文件；commit：`fix(server): findings 解析器兼容围栏/全角冒号/杂质分值（D1 路线一）`，verify: 行含命令结果+148，Refs: DEC-2026-1113-01。
- 任何不符即停报。
