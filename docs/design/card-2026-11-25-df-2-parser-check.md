# 执行卡 DF-2：解析端逐维字数下限校验 dimShortfalls（层②数据基础）

- 计划真值=`docs/plans/2026-11-25-dims-floor.md`（Task DF-2 + §3.3/§3.4 钉死规格 + §4 全局约束）；决策归档=DEC-2026-1125-01。
- 前置：DF-1 已合入 7592333（指令量条）。本卡**不做**反馈重试与 warning（归 DF-3/DF-4），只落解析层数据基础。

## 0. 背景（根因）

六维统一单维字数下限=70 字/维（owner 拍板，合并维不双倍、不分组合并待遇）。校验落点钉在 `parseAnalysis`——因为「未知维度丢弃→补空」在此发生，缺口必须包含被丢行后补空的维；自定义模板整体替换默认指令也绕不过此层。解析结果经新字段 `dimShortfalls` 独立通道输出，**不并入 errors**（既有 errors 断言须保持绿）。

## 1. 改动文件（不得越界）

| 文件 | 操作 |
| --- | --- |
| `apps/server/src/llm/plainproto.ts` | Modify——`ParsedAnalysis` 接口加字段；模块级加导出常量与私有计数函数；`parseAnalysis` 在既有「缺行补 ''」循环之后、return 之前按 §2-B1 计算 |
| `apps/server/test/llm/plainproto.test.ts` | 新增 describe（禁删改既有用例，含 :296/:307-322 errors 断言） |

禁改：`analysis.ts`、`distill-job.ts`、`packages/shared/src/api.ts`（含 STYLE_DIMENSIONS/别名函数）、任何 `apps/server/data/**`；行协议解析分支结构零改动。

## 2. 钉死规格（逐字照计划，不得自创）

- **B1 计数法**：私有 `countDimChars(s: string): number = Array.from(s.trim()).length`（不导出）；trim 后按 Unicode 码点计，CJK/ASCII/标点/串内空白各计 1；空串或纯空白=0。用 `Array.from` 防代理对双计。
- **B2 常量**：`export const STYLE_DIM_MIN_CHARS = 70`（定义在 parseAnalysis 附近）。主审微调入账：DF-2 测试须 import 该常量作断言源（保证 knip 有消费者；DF-3 起生产侧引用）。
- **B3 接口扩展**：`ParsedAnalysis` 加 `dimShortfalls: Array<{ dim: string; chars: number }>`。
- **B4 计算时机与顺序**：在既有「缺行补 ''」循环之后、return 之前；遍历 `STYLE_DIMENSIONS`（api.ts:402 表序），逐维 `countDimChars(dims[d]) < STYLE_DIM_MIN_CHARS` 者 push `{ dim, chars }`。
- **B5 通道隔离**：dimShortfalls 不并入 errors；既有「未知维度: 对话（现行六维…）」报错行为零变化。

## 3. 改法（每步一个动作 + 可核对结果）

- [ ] A0 实跑 `pnpm test` 记数（应 ≥804=DF-1 收口数）。核对：数字记卡面。
- [ ] A1 新增 describe 四例（先红，红因=`dimShortfalls` undefined）：①空维文本 `DIM: 情感基调: ` → 断言含 `{dim:'情感基调',chars:0}`；②纯空白值（空格/制表）→ trim 后 chars=0 同上，且串内空白照计 1；③旧名行 `DIM: 对话: 甲` 被丢+补空 → dimShortfalls 含 `{dim:'语言与描写',chars:0}` **且** errors 仍含「未知维度: 对话」/「现行六维」两类信息并存互不覆盖；④六名齐行、其中一条 `字`.repeat(42) 其余 `.repeat(80)` → dimShortfalls 恰一条 chars=42。核对=**4 红**。
- [ ] A2 边界例（先红）：`'字'.repeat(STYLE_DIM_MIN_CHARS - 1)`=69 → 缺口 chars=69；`.repeat(STYLE_DIM_MIN_CHARS)`=70 → dimShortfalls 为空。断言源用 import 的常量（B2）。核对=**1 红**。
- [ ] B6 实现 §2 后重跑 A1/A2，核对=6 绿且既有 errors 断言未回归、既有用例零删改。
- [ ] C1 `pnpm lint` → C2 定向（plainproto.test.ts）→ C3 `pnpm test` 全量 ≥A0 只增 → C4 `pnpm typecheck` → C5 `pnpm deadcode`（新导出经测试 import 后须零告警）。每步核对：exit 0 / 数字记录。
- [ ] C6 `git diff --stat` 改动 ⊆ §1 两文件。核对：对表。
- [ ] C7 提交：`feat(llm): parseAnalysis逐维字数下限校验dimShortfalls（DF-2）`，正文 `verify: ...` + `Refs: docs/plans/2026-11-25-dims-floor.md`。只 commit 不 push。

## 4. 验收命令

以下命令均在项目根目录执行：

```
pnpm --filter @inkforge/server test -- test/llm/plainproto.test.ts
pnpm lint
pnpm test
pnpm typecheck
pnpm deadcode
```

## 5. 约束

- 只 commit 不 push；永不 `--no-verify`；永不 `git add -A`。
- 读 >4KB 文件用 `python C:/Users/57850/.zcode/tools/pointer_tools.py` 的 pointerize/read_pointer/read_diff_only，禁止整读文件全文（plainproto.ts 超 4KB）。
- 行号=2026-11-25 快照，施工以锚点文本定位；卡外问题即停回报，不得越界顺手改。
