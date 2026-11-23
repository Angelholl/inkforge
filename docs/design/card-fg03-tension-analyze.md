# 卡 FG-03：LLM 张力对照——行协议纯函数 + POST analyze 可见降级（2026-11-24）

## 一、根因/目标

融合门 MVP 第三卡：张力对清单的行协议解析/构造 + analyze 端点（无写），超时/垃圾输出/空对照面→**200+degraded:true**（可见降级，绝不 500 阻断）。计划真值=`docs/plans/2026-11-24-gen-fusion-gate.md` **Task-03**（接口块+步骤 1–5）；规格=`docs/design/proposal-2026-11-23-import-reconcile.md` v3.1 §3.5 钉2。

## 二、改动文件（=计划 Task-03 文件清单，不得越界）

Create `apps/server/src/fusion/tension.ts`；Modify `apps/server/src/http/routes.ts`（PUT spectrum :1151-1161 之后插 POST analyze）、`apps/server/src/http/schemas.ts`（空 body schema）；Test Create `apps/server/test/fusion/tension.test.ts`、`apps/server/test/http/fusion-gate.test.ts`（**本卡建此文件，只含 analyze describe**——FG-04 将在同文件追加 gate/confirm describe，勿预建）。

## 三、改法

按计划 Task-03 步骤 1–5。硬钉：截断常量在模块内定值**不动 config**（冲击 #7）；provider 走 `state.plannerProvider ?? createRoleProvider` 既有缝（mock 形态沿 `apps/server/test/http/blueprint-suggest.test.ts:40-44`）；`meta:{step:'summarize'}`；性质词枚举 拉扯|冗余|缺口，非法行丢弃 invalid++，rows cap 20；降级三态（抛错/垃圾/空对照面）用例必须全绿；canned 文本中性仿形，禁引 v6。

## 四、先红后绿回归测试 + 验收命令（均在项目根目录执行）

- `pnpm -F @inkforge/server exec vitest run test/fusion/tension.test.ts` → 先红后绿
- `pnpm -F @inkforge/server exec vitest run test/http/fusion-gate.test.ts` → analyze describe 四例全绿（含三降级例）
- `pnpm -F @inkforge/server exec vitest run test/http` → 全量 http 目录绿（既有用例零删改）
- `pnpm lint` → 零输出；`pnpm typecheck` → 全 workspace 0 错
- `git show --stat HEAD` → 文件集不越界

## 约束

只 commit 不 push；永不 `--no-verify`；永不 `git add -A`；提交 Conventional 前缀+中文，正文 `verify:` 实测结果+`Refs: docs/plans/2026-11-24-gen-fusion-gate.md Task-03；规格 v3.1`。禁读 `apps/server/data/**`、词表文件、v6 文本。卡外问题即停回报待裁决。执行中读取大于 4KB 的文件或查看改动，用 `python C:/Users/57850/.zcode/tools/pointer_tools.py` 的 pointerize/read_pointer/read_diff_only，禁止整读文件全文（routes.ts ~79KB 必走 pointer）。
