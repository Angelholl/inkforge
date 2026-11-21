# 卡：落地策略 T01 基座——shared 类型 + migration 0014 + repo/meta 端点 + NSIS 同步

以下命令均在项目根目录执行（相对路径）。

> 派卡前置：同工作树无其他在飞卡。本卡含数据库迁移=hy4 窗口禁入卡型，裁 ZCode Agent 通道。

## 根因/目标

DEC-2026-1122-01 层①存储基座：books.landing_mandate_json 列 + shared `LandingMandate`/`BeatRequirement.source` + PUT /meta 三态校验 + NSIS 0014 同步。计划真值=docs/plans/2026-11-22-landing-mandate.md **Task-01**（接口/步骤 1-14 全钉值，照序执行禁跳步；计划文件全文 ≤300 行可整读）。

## 改动文件（照计划 Task-01 文件清单，卡外改动即超范围）

- Create：`packages/shared/src/mandate.ts`、`apps/server/src/db/migrations/0014_landing_mandate.sql`、`apps/server/test/http/landing-mandate.test.ts`
- Modify：`packages/shared/src/index.ts`、`domain.ts`（BeatRequirement.source）、`api.ts` 三处 DTO；`apps/server/src/db/repositories/books.ts`、`src/http/schemas.ts`、`src/http/routes.ts`（PUT /meta :134-141、GET book :363-368）；`apps/desktop/src-tauri/nsis/inkforge-installer.nsi`（File 节 :1524 行后 + Delete 节仿 0013 行）+ 把 0014.sql 复制进 `apps/desktop/src-tauri/resources/server/db/migrations/`
- Test Modify：`apps/server/test/db/repositories.test.ts` 追加 describe

## 先红后绿

landing-mandate.test.ts 按卡面/计划用例先写先跑（红），实现后转绿；repositories 追加用例同法。api.test 既有断言不改；migrate.test 按**随迁钉值更新惯例**做两类随迁更新（主审裁决 2026-11-22，先例=0012/0013 入列，冲击清单 #13）：6 处 `user_version` 13→14（:33/88/100/135/158/196）+ 4 个回拨夹具各补一行 `ALTER TABLE books DROP COLUMN landing_mandate_json;`（沿该文件 :55-68 既有 books 增量列 DROP 形态）——提交正文逐条列出，此外任何既有断言不得动。

## 验收命令

```bash
pnpm -F @inkforge/shared test
pnpm -F @inkforge/server exec vitest run test/db/migrate.test.ts test/db/repositories.test.ts test/http/landing-mandate.test.ts test/http/api.test.ts
pnpm lint
```

全绿判据：shared ≥2 不减；migrate 幂等纳入 0014；landing-mandate 新用例全绿（cadence 三态往返、heavyEveryN=0/1/-2/1.5 与 mode:'daily' → 400、不带字段不动既有 meta、PUT 同 text 前缀条目去重 source 存活）；api.test 既有断言原样绿（冲击清单 #11）；lint 零输出。

## 约束

- 1301 纪律：禁读 `apps/server/config/quality/landing-words.default.txt` 与 `apps/server/data/**`；测试夹具自造中性词（「玉佩」「窗棂」类）。
- 0014.sql 仿 0013 头形态（首行 ALTER + 注释含 DEC-2026-1122-01 与回滚句）。
- NSIS 三处（File 行/Delete 行/resources 副本）缺一即验收不过——DEC 钉的高危项。
- GET book 响应不得外泄 `landingMandateJson` 原始串（覆盖为 `landingMandate` 并删原键）。
- 只 commit 不 push；Conventional 前缀+中文描述，正文 `verify:` 贴实测输出摘要 + `Refs: DEC-2026-1122-01`；永不 `--no-verify`；永不 `git add -A`，逐文件 add（含本卡面）。
- 现场与卡面/计划冲突（锚点行号漂移、既有断言必须改动才能过）即停手待裁决，不得自行改计划钉值。
