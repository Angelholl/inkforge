# 卡 FG-04：GET gate 直通判定 + POST confirm 单事务批量写（2026-11-24）

## 一、根因/目标

融合门 MVP 第四卡：门状态端点（指纹未变直通/首弹/变化重弹三态）与确认端点（**单一 better-sqlite3 事务**批量写，天然无半写；gen_gate 指纹写在事务后，写失败返回 fingerprintStored:false 宁重弹不误直通）。计划真值=`docs/plans/2026-11-24-gen-fusion-gate.md` **Task-04**（接口块+步骤 1–6）；规格=`docs/design/proposal-2026-11-23-import-reconcile.md` v3.1 §3.5 钉1/钉3/钉4。

## 二、改动文件（=计划 Task-04 文件清单，不得越界）

Create `apps/server/src/fusion/apply.ts`；Modify `apps/server/src/http/routes.ts`（GET gate+POST confirm 插 analyze 旁；GET book 响应剥 genGateJson 沿 :376-378 landingMandateJson 先例）、`apps/server/src/http/schemas.ts`（confirmBody schema——weights 校验沿抄 styleBindSchema :64-119 既有规则：键集恰等绑定全集+Σ=100+辅不重复，不另造口径）；Test Modify `apps/server/test/http/fusion-gate.test.ts`（追加 gate/confirm describe，**保留 FG-03 的 analyze describe 不动**）。

## 三、改法

按计划 Task-04 步骤 1–6。硬钉：存在性校验**必须在事务体内**（提到事务外则故障注入用例失去回滚证明力）；description 写恒最先（回滚覆盖锚点）；全部写复用既有 repo 函数（updateBookMeta/setBookStyleBinding/setBookPlotProfile/setBookSpectrumProfile/setBookImitation），与面板同语义（写入口一致性）；A 类行组装走 imports 归档重解析（splitCompendiumSections+consumedSections+computeFusionRows），无归档书 aClass 空仍 show；取消=不调 confirm 零写零指纹→再 GET 仍 show；夹具中性仿形。

## 四、先红后绿回归测试 + 验收命令（均在项目根目录执行）

- `pnpm -F @inkforge/server exec vitest run test/http/fusion-gate.test.ts` → 计划步骤 5 的十例全绿（含故障注入/取消/直通-suppress-重弹三态/素书/坏 JSON 容错）
- `pnpm -F @inkforge/server exec vitest run test/http/style.test.ts test/http/style-snapshot.test.ts test/http/api.test.ts` → 既有零回归（冲击 #8/#9）
- `pnpm lint` → 零输出；`pnpm typecheck` → 全 workspace 0 错
- `git show --stat HEAD` → 文件集不越界

## 约束

只 commit 不 push；永不 `--no-verify`；永不 `git add -A`；提交 Conventional 前缀+中文，正文 `verify:` 实测结果+`Refs: docs/plans/2026-11-24-gen-fusion-gate.md Task-04；规格 v3.1`。禁读 `apps/server/data/**`、词表文件、v6 文本（夹具归档文件写临时 dataDir）。卡外问题即停回报待裁决。执行中读取大于 4KB 的文件或查看改动，用 `python C:/Users/57850/.zcode/tools/pointer_tools.py` 的 pointerize/read_pointer/read_diff_only，禁止整读文件全文（routes.ts 必走 pointer）。
