# 调研报告：续写 run 的 GUI 交互路径（运行卡展示 / 调整入口 / 内容查看）

范围：`apps/web` + `apps/server` + `packages/shared`。只读调研；依据调研卡 `docs/design/card-research-run-continuation-gui.md` ①②③④ 执行。大文件（>4KB）经 `pointer_tools.py pointerize/read_pointer` 分段读取，未整读。

---

## 一、结论先行（逐题直接结论）

**问题 1（文案锚点在哪渲染）**：文案 `续写已入队 run ${id.slice(0,8)}，进度见右侧「运行」卡` 由 `apps/web/src/pages/BookDetailPage.tsx:426` 的 `startContinue()` 生成，经 `setMsg` 落状态；渲染点是同文件 `:902` 的 `{msg && <p …>{msg}</p>}`（蓝图编辑区内）。它是**纯文本提示**，无链接、无按钮、无可点击区域——所谓「进度见右侧」只是一句指示语，本身不构成跳转。

**问题 2（右侧「运行」卡是哪个组件 / 展示什么 / 有哪些交互）**：组件是 `apps/web/src/components/RunAsideCard.tsx`（`BookDetailPage.tsx:8` 导入、`:907` 挂到 `<aside>`）。各状态表现：run 列表每行 = 状态徽标 + run id 前 8 位 + 一个「报表」链接（→ `/runs/:id/dashboard`）；空列表显示「尚无运行记录」；控制台显示连接圆点 + `run XXXXXXXX` / 「无活动 run」，运行态加 `ember-dot` 呼吸点，日志为 `$ run status: <status>` 与 `step X #N → <status>`（按 done/inflight/failed 分色）。状态全集来自 `packages/shared/src/domain.ts:15`（queued/running/paused/cancelled/done/failed）。**该组件全部可交互元素只有「报表」`<Link>`（每条 run 一个）**；其余都是徽标、ID 文本、控制台行。没有任何取消/暂停/继续/调参/展开内容的按钮或输入。

**问题 3（run 生命周期操作 API / 后端路由 / 前端是否调用）**：API 层齐全——前端 `apps/web/src/api/client.ts:149-155` 定义 `createRun/getRun/cancelRun/pauseRun/resumeRun/rerunChapter`，`:174-176` 定义 `adoptPartial/getReport`；后端 `apps/server/src/http/routes.ts` 实现 `POST /api/runs`(:465)、`/pause`(:486)、`/resume`(:495)、`/chapters/:chapterNo/rerun`(:504)、`GET /api/runs/:runId`(:515)、`/events` SSE(:522)、`/cancel`(:537)、`/partial`(:547)、`/partial/adopt`(:562)、`/report`(:886)。**实际调用情况**：`pauseRun/resumeRun/cancelRun` 只在 `RunPage.tsx:59/62/65` 三个按钮上被调用（路由 `/runs/:runId`）；`rerunChapter`、`adoptPartial` 在 client 有定义但**全前端无任何调用**；`GET /partial` 连 client 封装都没有。不存在 `DELETE /api/runs/:runId`（无删除 run 路由）；不存在「运行中调整参数/选择」的 API（`CreateRunBody` 仅 `maxRounds`/`mode`，见 `packages/shared/src/api.ts:248-253`）。cancel 是真生效的：`routes.ts:541` 把 run 置 `cancelled` 并 abort 兼容 controller，`queue.ts:51-54` 每 400ms 轮询到 cancelled 就 abort 当前章；pause 是「当前章完成后退出」（`queue.ts:22`），resume 置回 `queued`。**定性：功能已实现，入口存在但不在续写所在的书详情「运行」卡上——属于「实现但入口不可达（从续写路径）」，而非「未实现」。**

**问题 4（续写内容落盘到哪 / GUI 从哪看 / 运行卡有无内容入口 / 书详情与 run 结果关联）**：内容落盘为版本链——`apps/server/src/pipeline/chapter.ts:259/370` `appendChapterVersion` 写 draft/revised 版到 `chapter_versions`，`:443` finalize 时 `setCurrentVersion(db, chapterId, best.id)` 并同步 FTS；版本行带 `run_id`（`apps/server/src/db/repositories/chapters.ts:190-219`、`packages/shared/src/api.ts:37-53`）。残稿另写 `partial_outputs`（`routes.ts:547-581`）。GUI 看内容的唯一路径是章节阅读页 `ChapterReaderPage.tsx`（路由 `/books/:bookId/chapters/:chapterNo`，`main.tsx:36`），按**章号** `listVersions` + `getVersion` 渲染正文并有版本链切换/回滚/选段重写/QC/对比；书详情章节列表「阅读」链接（`BookDetailPage.tsx:844-846`）即进此页。**运行卡、RunPage、仪表盘均无内容入口**：运行卡只有「报表」→ DashboardPage（只展示耗时/token/步表，「产物」列仅「版本已删」徽标，`DashboardPage.tsx:37-45`），DashboardPage 只有「← 运行面板」回到 RunPage；RunPage 只有三个控制按钮 + 步状态表。没有「按 runId 查版本」的端点，也没有从 run 跳到版本的按钮/展开项。结论：内容看得到，但只能按章号看；run 与内容的 GUI 关联缺失。

**问题 5（近期 UI 重塑是否动过这些代码）**：指定三提交中 `b106878` 是纯文档（`docs/decision-log.md` +2 行，无代码）；`4095e8d` 确实大改 `BookDetailPage.tsx`（576 行 IA 分区），但「发起续写」按钮、`RunAsideCard`、「阅读」链接均被保留（按钮是移位而非删除，aside 仅加 `lg:sticky`）；`d5a5842` 中 `RunAsideCard` 仅新增一枚 `ember-dot`，`RunPage` 仅做 DataTable/Badge/呼吸点换肤，**暂停/继续/取消三按钮原样保留**（父版本 `71-79` 行与现状逐字一致），`DashboardPage` 仅样式。**结论：重塑没有弄丢 run 控制或内容入口；入口缺失是既有交互设计。** 补充不对称证据：新书向导 `NewBookIdeaPage.tsx:96` 在 `createRun` 后直接 `navigate('/runs/…')`，而书详情续写 `:426` 只 `setMsg`——两条发起路径的可达性不同，这是 owner 体感差异的直接来源。

---

## 二、证据（path:line + 关键摘录，每段 ≤15 行）

### E1 — Q1 文案产生与渲染

`apps/web/src/pages/BookDetailPage.tsx:424-429`
```tsx
    try {
      const r = await api.createRun({ bookId, fromChapter: chapterNo, toChapter: chapterNo, mode: 'continue', maxRounds });
      setMsg(`续写已入队 run ${r.runId.slice(0, 8)}，进度见右侧「运行」卡`);
    } catch (e) {
      setMsg(`发起续写失败：${apiErrorText(e)}`);
    }
```
`apps/web/src/pages/BookDetailPage.tsx:902`
```tsx
          {msg && <p className="mt-2 text-sm text-muted">{msg}</p>}
```
`apps/web/src/pages/BookDetailPage.tsx:907`
```tsx
          <RunAsideCard runs={book?.runs ?? []} />
```

### E2 — Q2 运行卡结构与交互元素（全部可点元素仅「报表」）

`apps/web/src/components/RunAsideCard.tsx:9-16`
```tsx
export default function RunAsideCard({ runs }: { runs: RunDto[] }) {
  const latest = runs.find((r) => ACTIVE.has(r.status)) ?? runs[0];
  const live = useRunEvents(latest?.id ?? null);
  const lines = consoleLines(live.run?.status, live.steps);
  return (
    <Card className="space-y-3">
      <h2 className="font-semibold">运行</h2>
```
`apps/web/src/components/RunAsideCard.tsx:18-27`
```tsx
        {runs.slice(0, 6).map((r) => (
          <li key={r.id} className="flex items-center gap-2">
            <Badge tone={runStatusTone(r.status)}>{r.status}</Badge>
            <span className="font-mono text-faint">{r.id.slice(0, 8)}</span>
            <Link to={`/runs/${r.id}/dashboard`} className="ml-auto text-primary-strong hover:underline">
              报表
            </Link>
          </li>
        ))}
        {runs.length === 0 && <li className="text-faint">尚无运行记录</li>}
```
`apps/web/src/components/RunAsideCard.tsx:29-37`
```tsx
      <div>
        <div className="mb-1 flex items-center gap-2 text-xs text-muted">
          控制台
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${live.connected ? 'bg-ok' : 'bg-faint'}`} />
          {latest ? `run ${latest.id.slice(0, 8)}` : '无活动 run'}
          {latest && isInflightStatus(latest.status) && <span className="ember-dot bg-accent" aria-label="运行中" />}
        </div>
        <Console lines={lines} className="max-h-72" />
      </div>
```
`apps/web/src/components/RunAsideCard.tsx:43-55`（状态→控制台行，failed=error / done=ok / inflight=warn / 其余=dim）
```tsx
function consoleLines(runStatus: string | undefined, steps: RunStepDto[]): ConsoleLine[] {
  const lines: ConsoleLine[] = [];
  if (runStatus) {
    lines.push({
      text: `$ run status: ${runStatus}`,
      tone: runStatus === 'failed' ? 'error' : runStatus === 'done' ? 'ok' : 'warn',
    });
  }
  for (const s of steps) {
    const tone = s.status === 'failed' ? 'error' : s.status === 'done' ? 'ok' : s.status === 'inflight' ? 'warn' : 'dim';
    lines.push({ text: `  step ${s.step} #${s.attempt} → ${s.status}`, tone });
  }
  return lines;
```

### E3 — Q3 控制入口实际所在页（书详情「运行」卡之外的 `/runs/:runId`）

`apps/web/src/pages/RunPage.tsx:58-67`
```tsx
      <div className="mt-4 flex gap-2">
        <Button onClick={() => api.pauseRun(run.id).then(() => setMsg('已请求暂停'))}>
          暂停
        </Button>
        <Button onClick={() => api.resumeRun(run.id).then(() => setMsg('已请求继续'))}>
          继续
        </Button>
        <Button variant="danger" onClick={() => api.cancelRun(run.id).then(() => setMsg('已请求取消'))}>
          取消
        </Button>
      </div>
```
`apps/web/src/pages/RunPage.tsx:53-56`（通往仪表盘的链接；仪表盘再靠 `:16` 的「← 运行面板」回来，形成两跳）
```tsx
        SSE {live.connected ? '已连接' : '未连接（3s 重连）'} · 章节范围 {run.chapterScope.from}-{run.chapterScope.to} ·{' '}
        <Link className="text-primary-strong hover:underline" to={`/runs/${run.id}/dashboard`}>
          仪表盘 →
        </Link>
```
`apps/web/src/api/client.ts:149-155`（API 层定义）
```ts
  createRun: (body: CreateRunBody) => req<{ runId: string }>('/api/runs', { method: 'POST', body: JSON.stringify(body) }),
  getRun: (runId: string) => req<RunWithStepsDto>(`/api/runs/${runId}`),
  cancelRun: (runId: string) => req<{ ok: boolean }>(`/api/runs/${runId}/cancel`, { method: 'POST', body: '{}' }),
  pauseRun: (runId: string) => req<{ ok: boolean }>(`/api/runs/${runId}/pause`, { method: 'POST', body: '{}' }),
  resumeRun: (runId: string) => req<{ ok: boolean }>(`/api/runs/${runId}/resume`, { method: 'POST', body: '{}' }),
  rerunChapter: (runId: string, chapterNo: number) =>
    req<{ runId: string }>(`/api/runs/${runId}/chapters/${chapterNo}/rerun`, { method: 'POST', body: '{}' }),
```
`apps/server/src/http/routes.ts:486-493` / `:495-502`（pause / resume 路由）
```ts
  app.post('/api/runs/:runId/pause', async (req, reply) => {
    const { runId } = req.params as { runId: string };
    const run = runsRepo.getRun(db, runId);
    if (!run) return reply.code(404).send({ error: 'not found' });
    if (run.status !== 'running' && run.status !== 'queued') return reply.code(409).send({ error: `run is ${run.status}` });
    runsRepo.updateRunStatus(db, runId, 'paused');
    reply.code(202).send({ ok: true });
  });
```
```ts
  app.post('/api/runs/:runId/resume', async (req, reply) => {
    const { runId } = req.params as { runId: string };
    const run = runsRepo.getRun(db, runId);
    if (!run) return reply.code(404).send({ error: 'not found' });
    if (run.status !== 'paused') return reply.code(409).send({ error: `run is ${run.status}` });
    runsRepo.updateRunStatus(db, runId, 'queued');
    reply.code(202).send({ ok: true });
  });
```
`apps/server/src/http/routes.ts:537-543`（cancel 路由）
```ts
  app.post('/api/runs/:runId/cancel', async (req, reply) => {
    const { runId } = req.params as { runId: string };
    if (!runsRepo.getRun(db, runId)) return reply.code(404).send({ error: 'not found' });
    // 队列模式：置 cancelled，队列轮询负责 abort 当前章；兼容旧内联 AbortController
    runsRepo.updateRunStatus(db, runId, 'cancelled');
    runAborts.get(runId)?.abort();
    reply.code(202).send({ ok: true });
  });
```
`apps/server/src/worker/queue.ts:22-23, 51-54`（cancel/pause 语义与 abort 轮询）
```ts
 * pause：run.status='paused' → 当前章完成后退出（不 abort 当前请求）；/resume 置 queued 后继续。
 * cancel：轮询到 cancelled → abort 当前章 → run cancelled，剩余章节无 step 行。
  const ac = new AbortController();
  // cancel 轮询：服务侧把 run 置 cancelled → 本地 abort 当前章（pause 不 abort）
  const poll = setInterval(() => {
    const cur = getRun(db, runId);
    if (!cur || cur.status === 'cancelled') ac.abort();
  }, 400);
```
`packages/shared/src/api.ts:248-253`（CreateRunBody 无运行中调参字段）
```ts
export interface CreateRunBody {
  bookId: string;
  fromChapter: number;
  toChapter: number;
  maxRounds?: number;
  mode?: 'generate' | 'continue';
}
```

### E4 — Q4 内容落盘与查看路径

`apps/server/src/pipeline/chapter.ts:443-451`（finalize：定版本 + 同步 FTS）
```ts
  chaptersRepo.setCurrentVersion(db, chapterId, best.id);
  const content = chaptersRepo.getVersion(db, best.id)!.content;
  ftsRepo.syncFts(db, chapterId, content);
  chaptersRepo.setChapterStatus(db, chapterId, outcome === 'done' ? 'done' : 'needs_human');
  emit({ type: 'step.status', runId: args.runId, chapterNo: args.chapterNo, step: 'finalize', attempt: finAttempt, status: 'done', ts: now() });
  // run 层语义：本章处理完毕即 done（needs_human 是章状态，由章节行承载）
  emit({ type: 'run.status', runId: args.runId, status: 'done', ts: now() });
  const rounds = runsRepo.listSteps(db, args.runId).filter((s) => s.chapterId === chapterId && s.step === 'rewrite' && s.status === 'done').length;
  return { status: outcome, finalVersionId: best.id, rounds };
```
`apps/web/src/pages/ChapterReaderPage.tsx:15-18, 29-32`（内容按章号取）
```tsx
  const { data: versionData, refetch } = useQuery({
    queryKey: ['versions', bookId, no],
    queryFn: () => api.listVersions(bookId, no),
    refetchInterval: 5000,
```
```tsx
  const { data: currentFull } = useQuery({
    queryKey: ['version', current?.id],
    queryFn: () => api.getVersion(current?.id ?? ''),
    enabled: !!current,
```
`apps/web/src/pages/ChapterReaderPage.tsx:79`
```tsx
        {currentFull?.content ?? '（本章尚无版本）'}
```
`apps/web/src/pages/BookDetailPage.tsx:844-846`（书详情→章节阅读入口，按章号而非 runId）
```tsx
              <Link
                className="inline-flex h-8 items-center gap-1.5 rounded-ctl border border-line bg-surface px-3 text-xs text-ink transition-colors hover:bg-bg"
                to={`/books/${bookId}/chapters/${c.chapterNo}`}
```
`apps/web/src/pages/DashboardPage.tsx:37-45`（仪表盘「产物」列只有「版本已删」徽标，无正文入口）
```tsx
          {(r?.chapters ?? []).flatMap((c) =>
            c.steps.map((s, i) => (
              <tr key={`${c.chapterNo}-${s.step}-${s.attempt}-${i}`} className={dataTableRow}>
                <td className={dataTableCellNum}>{i === 0 ? `第${c.chapterNo}章` : ''}</td>
                <td className={dataTableCellMono}>{s.step}</td>
                <td className={dataTableCellNum}>{s.attempt}</td>
                <td className={dataTableCellNum}>{s.ms}</td>
                <td className={dataTableCellNum}>{s.usage.completionTokens}</td>
                <td className={dataTableCell}>{s.versionDeleted ? <Badge tone="muted">版本已删</Badge> : ''}</td>
              </tr>
```

### E5 — Q5 UI 重塑历史（关键 diff 行）

`git show 4095e8d -- apps/web/src/pages/BookDetailPage.tsx`（发起续写按钮移位保留、aside 仅加 sticky）
```diff
-          <Button variant="primary" onClick={() => void startContinue()}>
-            发起续写（第{chapterNo}章）
-          </Button>
+            <Button variant="primary" onClick={() => void startContinue()}>
+              发起续写（第{chapterNo}章）
+            </Button>
-        <aside className="space-y-4">
+        <aside className="space-y-4 lg:sticky lg:top-6">
           <RunAsideCard runs={book?.runs ?? []} />
         </aside>
```
`git show d5a5842 -- apps/web/src/components/RunAsideCard.tsx`（仅加呼吸点）
```diff
 import { Badge, Card, Console, runStatusTone, type ConsoleLine } from './ui';
+import { Badge, Card, Console, isInflightStatus, runStatusTone, type ConsoleLine } from './ui';
           {latest ? `run ${latest.id.slice(0, 8)}` : '无活动 run'}
+          {latest && isInflightStatus(latest.status) && <span className="ember-dot bg-accent" aria-label="运行中" />}
```
`git show d5a5842^:apps/web/src/pages/RunPage.tsx:71-79`（控制按钮在重塑前即存在，重塑 diff 未触及）
```tsx
        <Button onClick={() => api.pauseRun(run.id).then(() => setMsg('已请求暂停'))}>
          暂停
        </Button>
        <Button onClick={() => api.resumeRun(run.id).then(() => setMsg('已请求继续'))}>
          继续
        </Button>
        <Button variant="danger" onClick={() => api.cancelRun(run.id).then(() => setMsg('已请求取消'))}>
          取消
        </Button>
```
`apps/web/src/pages/NewBookIdeaPage.tsx:93-97`（对照：向导路径直达 RunPage）
```tsx
      const toChapter = items.length > 0 ? items[items.length - 1].chapterNo : chapterCount;
      const r = await api.createRun({ bookId, mode: 'generate', fromChapter: 1, toChapter });
      navigate(`/runs/${r.runId}`);
```

---

## 三、未找到项与已试搜索词（逐条）

1. **「调整选择」入口 / 运行中调整参数**：全前端无此 UI（`grep -rn "调整\|终止\|中止" apps/web/src --include="*.ts*"`，仅命中无关文案）；`CreateRunBody` 无运行中调参字段，后端无对应路由。**未找到。** 已试词：调整、终止、中止、adjust、参数。
2. **书详情「运行」卡上的取消/暂停/重试/删除按钮**：`RunAsideCard.tsx` 全文仅一个 `<Link>`（`报表`），无 `<Button>`。**未找到。** 已试词：cancel、abort、stop、retry、delete、Button、`/api/runs`。
3. **`DELETE /api/runs/:runId` / run 删除路由**：后端无此路由（仅有 deleteBook/deleteVersion）。**未找到。** 已试：`grep -rn "delete('/api/runs\|run.*delete" apps/server/src`。
4. **`rerunChapter`（重试）/ `adoptPartial`（残稿采纳）的前端调用**：client 有定义，`grep -rn "rerunChapter\|adoptPartial" apps/web/src` 除 `client.ts` 与测试外零命中。**未找到调用点。** 已试：rerunChapter、adoptPartial、partial/adopt。
5. **按 runId 查内容/版本的端点与 GUI 入口**：后端 `/api/runs/:runId` 下只有 partial / report / events / cancel / pause / resume / rerun，无 versions/content；`VersionDto.runId` 虽存在但不用于查询。**未找到。** 已试：`run_id`、`runId` + version/content、`/api/runs/:runId` 全路由枚举。
6. **「进度见右侧」的精确出处**：仅在 `BookDetailPage.tsx:426` 一处命中；近似文案「入队」另见 `:434`、`:439`。已试：`grep -rn "续写已入队\|进度见右侧" apps/web/src --include="*.ts*"`。
7. **重塑提交中删除 run 控制的证据**：未发现任何删除；`b106878` 纯文档、`4095e8d` 移位保留、`d5a5842` 换肤保留。已试：`git log --oneline -20`、`git show --stat b106878/4095e8d/d5a5842`、`git show <c> -- <path>` 过滤 cancel/暂停/继续/取消/报表/阅读。

---

## 四、④ 验收命令自检（项目根目录）

| 验收命令 | 结果 |
| --- | --- |
| `grep -rn "续写已入队\|进度见右侧" apps/web/src --include="*.ts*" \| head -20` | 命中 `BookDetailPage.tsx:426`（唯一） |
| `grep -rln "run" apps/web/src --include="*.tsx" \| head -30` | 含 `components/RunAsideCard.tsx`、`pages/RunPage.tsx`、`pages/DashboardPage.tsx`、「运行」卡组件在列 |
| `grep -rn "cancel\|abort\|retry" apps/server/src --include="*.ts" -i \| grep -i run \| head -20` | 命中 `app.ts:43,49`、`routes.ts:70,74,537,541,542`、`sse.ts:30`、`worker/queue.ts:22,23,26,51` 等 |
| 报告存在且逐题有结论 | 本文件，第一、二节覆盖问题 1–5 |

## 五、总判定

owner 反馈的三点中：（a）「无调整/取消/终止入口」——**入口确实存在但位于 `/runs/:runId`（RunPage），不在续写所在的书详情「运行」卡上；从续写提示无法到达**，属「实现但入口不可达（在该路径下）」；（b）「无法直接查看生成内容」——**内容落盘为 chapter_versions，可在章节阅读页按章号查看，但 run 与内容无 GUI 关联、运行卡/报表/RunPage 均无展开入口**；此外「重试(rerun)/残稿采纳(adoptPartial)」有 API 无 UI。近期 UI 重塑未移除这些能力，问题源于既有 IA 设计。
