# 执行卡 2/3：run↔内容深度关联——入队提示可点 + 运行卡内联操作与章节入口

## ① 根因与范围

同卡 1（`docs/design/card-run-content-link-1.md` ①）：续写入队后提示为纯文本不可点、运行卡无操作按钮。实现计划真值=`docs/plans/2026-11-19-run-content-link.md`。本卡=计划 Task-04 + Task-05（按序执行：先 Task-04 后 Task-05，两任务同文件不同区段须串行）。前置依赖 Task-01/02/03 已由卡 1 落库（`RunVersionsDto` 等已在 packages/shared）。Task-06/07 属卡 3，**不得做**。

## ② 改动文件

- 修改 `apps/web/src/pages/BookDetailPage.tsx`（新增 queuedRunId 状态；startContinue `:426` 区改文案+置 id；msg 渲染点 `:902` 加「查看运行面板→」Link；`:907` RunAsideCard 传 bookId）
- 修改 `apps/web/src/pages/BookDetailPage.test.tsx`（新增 1 例）
- 修改 `apps/web/src/components/RunAsideCard.tsx`（props 加 bookId；TERMINAL 集；runAction 助手；活动态暂停/取消、paused 态继续+取消；TERMINAL 态「查看第N章→」Link；actionMsg 错误行）
- 新增 `apps/web/src/components/RunAsideCard.test.tsx`（3 例）

## ③ 改法

严格照计划 Task-04、Task-05 两节执行：测试名、stub、断言精确值（href=`/runs/r1234567890`、文案 `续写已入队 run r1234567`、`查看第1章→`/`查看第4-6章→` href、按钮计数 1/1/2、409 错误文案 `暂停失败：run is done`）逐字采纳。先红后绿：每任务先写测试跑红记录输出，再实现转绿。Task-05 红态说明：vitest 不查类型，红=运行期断言失败；typecheck 的 bookId prop 报错在实现后转绿。改法细节以计划为真值源，卡面不重复。

## ④ 回归测试与验收命令

以下命令均在项目根目录执行。验证链硬序：静态检查→定向测试→全量测试→冒烟；任一环失败即停。

```bash
# ① 静态检查
pnpm lint
pnpm typecheck

# ② 定向测试
pnpm --filter @inkforge/web test src/pages/BookDetailPage.test.tsx
pnpm --filter @inkforge/web test src/components/RunAsideCard.test.tsx

# ③ 全量测试（基线只增不减，既有用例零失败）
pnpm test

# ④ 冒烟
pnpm build:web
```

测试基线只增不减：只新增测试，不改删既有测试（F11：既有续写测试只断言 POST body，改文案零回归）。

## 约束

- 只 commit 不 push；每任务一个 commit，Conventional 前缀+中文描述。
- 不改 `api.pauseRun/resumeRun/cancelRun` 与既有端点语义；暂停/继续/取消只发 `POST body='{}'`。
- GUI 文案一律中文；jsdom 无 EventSource，RunAsideCard 测试必须 stub（FakeEventSource 见计划）。
- 指针令：读取大于 4KB 的文件（含计划/被改源文件），用 `python C:/Users/57850/.zcode/tools/pointer_tools.py` 的 pointerize/read_pointer 按段读，禁止整读文件全文。
- 卡外问题即停待裁决，不得顺手改。
