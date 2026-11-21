# 卡：落地策略 T04——apply 勾选落 mandate + 导入面板勾选 + 书籍设置落地策略下拉

以下命令均在项目根目录执行（相对路径）。

> 派卡前置：T03 已验收合入。非禁入卡型（apply 事务内加一段写入+web 两控件），走 hy4。执行中读 >4KB 文件用 pointer 工具，禁整读。

## 根因/目标

DEC-2026-1122-01 端到端接线：导入 apply 显式勾选才写 mandate（不自动猜，勾选与建书同事务同生共死）；SettingsImportPanel 加「启用书级落地策略」勾选（N 固定 2）；BookDetailPage 工具行加「落地策略」下拉（关/分级制每2章重/自定义N，变更即 PUT /meta）。计划真值=docs/plans/2026-11-22-landing-mandate.md **Task-04**（步骤 1-8 全钉值照序执行）。

## 改动文件（卡外改动即超范围）

- Modify：`apps/server/src/http/routes.ts`（apply 事务体 :295 foreshadowings 之后写 mandate）、`apps/web/src/components/SettingsImportPanel.tsx`（state+勾选行+apply body）、`apps/web/src/pages/BookDetailPage.tsx`（:606-622 工具行 select+custom 数字输入、:475 保存接线走 api.putBookMeta）
- Test Modify：`apps/server/test/http/settings-import.test.ts`、`SettingsImportPanel.test.tsx`、`BookDetailPage.test.tsx` 追加

## 先红后绿

新用例先写先红：server 两例（enabled:true+heavyEveryN:3 钉值往返 / 不带字段 null）；panel 两例（勾选→body 钉 `landingMandate:{enabled:true,heavyEveryN:2}`、默认 false）；BookDetail 两例（下拉渲染当前值、切分级制→PUT body 钉 `{mode:'cadence',heavyEveryN:2}`）；实现转绿。既有 settings-import 钉值用例断言不动。

## 验收命令

```bash
pnpm -F @inkforge/server exec vitest run test/http/settings-import.test.ts
pnpm -F @inkforge/web test
pnpm -F @inkforge/web build
pnpm typecheck
pnpm lint
```

全绿判据：server/web 两包新用例绿且 web ≥144 不减（冲击 #8 复核）；build 冒烟过；**typecheck 全 workspace 0 错**（L-20261113-01：typecheck 必须进卡面验收链）；lint 零输出。

## 约束

- 勾选默认不勾；apply 不带 enabled=true 时零写入（新书默认 null=off）。
- web 控件 aria-label 精确值：「启用书级落地策略」「落地策略」「每N章一重」（测试依赖）。
- 1301 纪律：禁读 landing-words 词表原文与 data/**。
- GUI 未验证（owner 真实测试）——提交信息必须注明，不得自行起浏览器目验。
- 只 commit 不 push；`feat(web,server):` 或分两提交均可，中文描述，正文 verify: + `Refs: DEC-2026-1122-01`；永不 --no-verify；永不 git add -A，逐文件 add（含本卡面）。
- 现场冲突即停待裁决。
