# 执行卡 3/3：run↔内容深度关联——运行卡 done 态产物展开 + 仪表盘正文展开

## ① 根因与范围

同卡 1（`docs/design/card-run-content-link-1.md` ①）。实现计划真值=`docs/plans/2026-11-19-run-content-link.md`。本卡=计划 Task-06 + Task-07（按序：先 Task-06 后 Task-07）。前置已落库：卡 1 的 `getRunVersions`/`RunVersionsDto`/`ReportStepDto.versionId`（卡 3 的 Task-07 消费 `versionId`），卡 2 的 RunAsideCard `{ runs, bookId }` props 与测试 fixture（`base`/`runs` 已预留复用）。

## ② 改动文件

- 修改 `apps/web/src/components/RunAsideCard.tsx`（showOutput 状态 + useQuery(enabled=展开且 done) + done 态「产物/收起产物」按钮 + 版本卡片列表，插在控制台 div 之后 `</Card>` 之前）
- 修改 `apps/web/src/components/RunAsideCard.test.tsx`（追加新 describe 3 例，复用 `base` fixture）
- 修改 `apps/web/src/pages/DashboardPage.tsx`（新增 runVersions 查询 + expandedVersionId 状态 + contentById 映射；产物列三分支；`.map` 改 `.flatMap` + 展开行 colSpan={6}）
- 新增 `apps/web/src/pages/DashboardPage.test.tsx`（3 例）

## ③ 改法

严格照计划 Task-06、Task-07 两节执行：JSX 骨架、queryKey（`['run-versions', latest?.id]` / `['run-versions', runId]`）、enabled 条件、精确断言（标签模板 `第1章 · final · 8字 · 当前`、空态文案 `该 run 没有产物版本`、`getAllByRole('button', { name: '正文' }).length === 1`）逐字采纳。命中规则钉死：`s.versionId && !s.versionDeleted && contentById.has(s.versionId)`；`版本已删` Badge 行为逐字不变。先红后绿：每任务先写测试跑红记录输出，再实现转绿。改法细节以计划为真值源，卡面不重复。

## ④ 回归测试与验收命令

以下命令均在项目根目录执行。验证链硬序：静态检查→定向测试→全量测试→冒烟；任一环失败即停。

```bash
# ① 静态检查
pnpm lint
pnpm typecheck

# ② 定向测试
pnpm --filter @inkforge/web test src/components/RunAsideCard.test.tsx
pnpm --filter @inkforge/web test src/pages/DashboardPage.test.tsx

# ③ 全量测试（基线只增不减，既有用例零失败）
pnpm test

# ④ 冒烟
pnpm build:web
```

测试基线只增不减：只新增测试，不改删既有测试（含卡 2 的 6 例 RunAsideCard 用例必须保持全绿）。

## 约束

- 只 commit 不 push；每任务一个 commit，Conventional 前缀+中文描述。
- 正文只在展开时请求（enabled 条件），收起不卸查询缓存不发新请求。
- GUI 文案一律中文；EventSource stub 沿卡 2 既有写法（每测试重挂）。
- 指针令：读取大于 4KB 的文件（含计划/被改源文件），用 `python C:/Users/57850/.zcode/tools/pointer_tools.py` 的 pointerize/read_pointer 按段读，禁止整读文件全文。
- 卡外问题即停待裁决，不得顺手改。
