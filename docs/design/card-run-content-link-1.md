# 执行卡 1/3：run↔内容深度关联——共享 DTO + 新端点 + 报表 versionId

## ① 根因与范围

owner 实测：书详情发起续写后无调整入口、无法直接查看续写内容。根因调研报告 `docs/design/research-run-continuation-gui.md`（只读背景，可分段读）；实现计划真值=`docs/plans/2026-11-19-run-content-link.md`。本卡=计划 Task-01/02/03（后端契约层）：共享 DTO、`GET /api/runs/:runId/versions` 新端点、报表步行补 `versionId`。Task-04~07 属后续卡，**不得做**。

## ② 改动文件

- 修改 `packages/shared/src/api.ts`（RunVersionItemDto/RunVersionsDto/ReportStepDto.versionId?）
- 修改 `apps/web/src/api/client.ts`（getRunVersions 一行封装）
- 修改 `apps/server/src/db/repositories/chapters.ts`（listVersionsByRun）
- 修改 `apps/server/src/http/routes.ts`（新路由 + 报表步行 return）
- 新增 `apps/server/test/http/run-versions.test.ts`（4 例）
- 新增 `apps/server/test/http/run-report-versionid.test.ts`（1 例）

## ③ 改法

严格照计划 `docs/plans/2026-11-19-run-content-link.md` 的 Task-01、Task-02、Task-03 三节执行：签名、SQL、路由代码、测试 stub 与断言值均已在计划中写死，逐字采纳，不得改名不得增删接口。先红后绿：每任务先写测试跑红（记录输出），再实现转绿。改法细节以计划为真值源，卡面不重复。

## ④ 回归测试与验收命令

以下命令均在项目根目录执行。验证链硬序：静态检查→定向测试→全量测试→冒烟；任一环失败即停。

```bash
# ① 静态检查
pnpm lint
pnpm typecheck

# ② 定向测试（先红后绿的最终态须全绿；api.test.ts 为报表既有行为回归）
pnpm --filter @inkforge/server test test/http/run-versions.test.ts
pnpm --filter @inkforge/server test test/http/run-report-versionid.test.ts
pnpm --filter @inkforge/server test test/http/api.test.ts

# ③ 全量测试（基线只增不减，既有用例零失败）
pnpm test

# ④ 冒烟
pnpm build:web
```

测试基线只增不减：只新增测试，不改删既有测试。

## 约束

- 只 commit 不 push；每任务一个 commit，Conventional 前缀+中文描述（如 `feat(server): 新增按 runId 查章节版本端点`）。
- 不改既有 API 语义，只新增；`versionId` 为可选键，`versionDeleted` 语义不变。
- 不新增 DB 迁移；不改 `listVersions`/`getVersion` 等既有仓储函数行为。
- 指针令：读取大于 4KB 的文件（含计划/调研报告/被改源文件），用 `python C:/Users/57850/.zcode/tools/pointer_tools.py` 的 pointerize/read_pointer 按段读，禁止整读文件全文。
- 卡外问题即停待裁决，不得顺手改。
