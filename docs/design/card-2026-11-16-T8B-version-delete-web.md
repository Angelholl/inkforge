# 卡 T8B｜B2 章节版本硬删 · web（删除钮 + current 回退锚 + Diff 按 parent 链配对 + 报表「版本已删」列）

Refs: DEC-2026-1116-01（owner 裁决①）
计划真值：docs/plans/2026-11-16-four-feedbacks.md §Task8B
上游已交付（Task8A，commit 57296ca，已实测绿）：
- `GET /api/books/:bookId/chapters/:no/versions` 现返回 **`{ currentVersionId: string | null; versions: VersionListItemDto[] }`**，列表项**不含 content 键**；
- `DELETE /api/versions/:versionId` → 404 `{error:'not found'}` / 409 `{error:<中文文案>, reason:'current'|'run-active', runStatus?}` / 200 `{ok:true}`；**请求必须带 JSON body**（Fastify 对「已设 content-type 且空体」直接 400 `FST_ERR_CTP_EMPTY_JSON_BODY`，冒烟实测踩到）→ 前端一律发 `body: '{}'`；
- `ReportStepDto.versionDeleted?: boolean`（仅为真时附键）；
- shared 已导出 `VersionListItemDto` / `VersionListDto`。

## 1. 背景与根因（卡面自足，不必再勘探）

工作树 `I:\inkforge`，分支 `master`，pnpm workspace（`apps/web` = React 19 + @tanstack/react-query + react-router + Tailwind 4，测试 vitest jsdom + @testing-library/react 16，测试里用 `vi.stubGlobal('fetch', …)` 打桩）。

实测事实（直接用，勿再全量勘探）：
- `apps/web/src/api/client.ts`：`req<T>` 在 :46-53 —— 非 2xx 时 `throw new Error(\`${method} ${url} → ${status}: ${body文本}\`)`；`listVersions` :131-132 现声明返回 `VersionDto[]`（已与 server 实际形状不符）；`getVersion` :133；`rollback` :134-135（POST 且 `body:'{}'`，DELETE 照此形态）；仓库里已有 DELETE 封装先例 `deleteForeshadowing` :143-144（`{ method:'DELETE', body:'{}' }`）。
- `apps/web/src/pages/ChapterReaderPage.tsx`（77 行）：:12-16 useQuery 取 `versions`（数组语义）；:20-21 `const list: VersionDto[] = versions ?? []`、`const current = list.find(v => v.id === selected) ?? list.find(v => v.id === list[0]?.id)`（**回退锚是 list[0]，不是服务端 current**）；:55-64 版本链 `<li>` 内只有 chip（`Button variant="quiet" size="sm" active=…`）；:72-74 正文渲染 `current?.content`（**强依赖列表 content，硬删瘦身后必须改单取**）；:43-48 顶部两钮（回滚/导出）；:68 `<SelectionRewrite versionId={current.id} …>`。
- `apps/web/src/pages/DiffPage.tsx`（58 行）：:23-27 取相邻对 `[list[1], list[0]]`（**按列表位置配对，硬删后相邻≠父子**）；:28 `computeVersionDiff(older.content, newer.content)`（依赖 content）；:40 「（不足两个版本，无法对比）」。
- `apps/web/src/pages/DashboardPage.tsx`（48 行）：:22-45 报表表，表头 5 列（章/步/轮/耗时ms/输出tok），无「产物」列，未 import Badge。
- `apps/web/src/pages/BookSamplePicker.tsx`（100 行）：:40-43 `const versions = await api.listVersions(bookId, no)` → `versions.find(v => v.id === c.currentVersionId) ?? versions[0]` → `blocks.push(\`【第${no}章 ${c.title}】\n${current.content}\`)`（**计划 Task8B 文件清单漏列本文件，主审补入**）；:57 打开钮文案「从书架选书」；:94-96 导入钮文案「导入所选 N 章」；:15-20 两个 useQuery（`['books']` 走 `api.listBooks`、`['book', bookId]` 走 `api.getBook(bookId)`，`enabled` 门控）。
- `apps/web/src/components/ui.tsx`：`Button` props = `{variant?: 'primary'|'secondary'|'quiet'|'danger', size?: 'md'|'sm', tone?: 'neutral'|'primary'|'danger'（仅 quiet 生效）, solid?, active?, iconOnly?, loading?, disabled?, …}`；`Badge({ tone = 'muted', children })` 已在 :20 导出。
- 既有测试 `apps/web/src/pages/ChapterReaderPage.test.tsx`（62 行）：`beforeEach` 里 `vi.stubGlobal('fetch', vi.fn(async () => stubResp([mkVersion('v-current','draft'), mkVersion('v-old','revised')])))` —— **所有 URL 一律回同一个数组**，用例 1 条（chip 软底/灰字/废止实底），断言 `findAllByRole('button', {name:/字 ·/})` 得 2 个。

## 2. 改动文件清单（改 5 + 测试改 1 新建 2）

```
Modify  apps/web/src/api/client.ts                    （listVersions 返回类型；新增 deleteVersion；新增导出 apiErrorText）
Modify  apps/web/src/pages/ChapterReaderPage.tsx      （current 回退锚 + 正文单取 + 每行删除钮与 L2 确认簇）
Modify  apps/web/src/pages/DiffPage.tsx               （按 parent 链配对 + 两版正文各走 getVersion + 缺 parent 文案）
Modify  apps/web/src/pages/DashboardPage.tsx          （增「产物」列 + Badge「版本已删」）
Modify  apps/web/src/pages/BookSamplePicker.tsx       （正文改走 getVersion）
Test Modify apps/web/src/pages/ChapterReaderPage.test.tsx  （mock 改为按 URL 分路 + 新增 3 例）
Test Create apps/web/src/pages/DiffPage.test.tsx           （+2 例）
Test Create apps/web/src/pages/BookSamplePicker.test.tsx   （+1 例）
```

不得改 `apps/server/**`、`packages/shared/**`（Task8A 已交付）；不得改 `apps/web/src/components/ui.tsx`。

## 3. 改法钉死

### 3.1 `client.ts`

- import 处补 `VersionListDto`（`VersionDto` 保留，`getVersion` 仍用它）。
- 三个 API 成员钉成：

```ts
  listVersions: (bookId: string, chapterNo: number) =>
    req<VersionListDto>(`/api/books/${bookId}/chapters/${chapterNo}/versions`),
  getVersion: (versionId: string) => req<VersionDto>(`/api/versions/${versionId}`),
  deleteVersion: (versionId: string) =>
    // body '{}' 必需：Fastify 对「已设 content-type 且空体」直接 400 FST_ERR_CTP_EMPTY_JSON_BODY
    req<{ ok: boolean }>(`/api/versions/${versionId}`, { method: 'DELETE', body: '{}' }),
```

- 文件内新增导出（紧接 `req` 之后）：

```ts
/** 把 req 抛出的 "METHOD url → STATUS: 响应体" 还原成服务端 error 文案；响应体非 JSON 或无 error 字段则原样返回。 */
export function apiErrorText(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  const i = msg.lastIndexOf(': ');
  const body = i >= 0 ? msg.slice(i + 2) : msg;
  try {
    const j = JSON.parse(body) as { error?: unknown };
    if (typeof j.error === 'string' && j.error.length > 0) return j.error;
  } catch {
    /* 非 JSON 响应体 */
  }
  return msg;
}
```

### 3.2 `ChapterReaderPage.tsx`

- 类型 import 改 `import type { VersionListItemDto } from '@inkforge/shared';`；api import 改 `import { api, apiErrorText } from '../api/client';`。
- 状态与取数钉成（**回退锚 = 服务端 currentVersionId，正文一律单取**）：

```tsx
  const { data: versionData, refetch } = useQuery({
    queryKey: ['versions', bookId, no],
    queryFn: () => api.listVersions(bookId, no),
    refetchInterval: 5000,
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const list: VersionListItemDto[] = versionData?.versions ?? [];
  const currentVersionId = versionData?.currentVersionId ?? null;
  const current = list.find((v) => v.id === (selected ?? currentVersionId)) ?? null;
  const { data: currentFull } = useQuery({
    queryKey: ['version', current?.id],
    queryFn: () => api.getVersion(current?.id ?? ''),
    enabled: !!current,
  });

  const remove = async (versionId: string): Promise<void> => {
    setDeleting(true);
    try {
      await api.deleteVersion(versionId);
      setMsg('已删除该版本（删前快照已留 -predelete-）');
      setSelected(null);
      setConfirmingDeleteId(null);
      void refetch();
    } catch (e) {
      setMsg(apiErrorText(e));
      setConfirmingDeleteId(null);
    } finally {
      setDeleting(false);
    }
  };
```

- 版本链 `<ul>` 内每个 `<li>` 钉成（chip 文案与 `active` 判据不变；删除钮在 current 行 `disabled`）：

```tsx
          {list.map((v) => {
            const isCurrent = v.id === currentVersionId;
            return (
              <li key={v.id} className="flex items-center gap-1">
                <Button variant="quiet" size="sm" active={current?.id === v.id} onClick={() => setSelected(v.id)}>
                  {v.kind} · {v.wordCount}字 · {v.createdAt.slice(11, 19)}
                  {v.params && (v.params as { overall?: number }).overall != null && (
                    <> · {((v.params as { overall?: number }).overall as number).toFixed(1)}分</>
                  )}
                </Button>
                {confirmingDeleteId === v.id ? (
                  <>
                    <span className="text-danger text-xs">
                      删除将从磁盘永久移除该版本正文，不可恢复（删前自动留 -predelete- 快照，同书保留最近 3 份）。
                    </span>
                    <Button variant="danger" size="sm" solid loading={deleting} onClick={() => void remove(v.id)}>
                      确认删除
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => setConfirmingDeleteId(null)}>
                      取消
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="quiet"
                    tone="danger"
                    size="sm"
                    disabled={isCurrent}
                    title={isCurrent ? '当前版本不可删除（先回滚到其他版本）' : undefined}
                    onClick={() => setConfirmingDeleteId(v.id)}
                  >
                    删除
                  </Button>
                )}
              </li>
            );
          })}
```

- 正文 `<article>` 内 :73 改 `{currentFull?.content ?? '（本章尚无版本）'}`。
- `rollback` / `exportBook` 两函数与顶部两钮不动；`SelectionRewrite` 仍传 `current.id`。

### 3.3 `DiffPage.tsx`

- 类型 import 改 `VersionListItemDto`；`api` import 不变。
- 配对逻辑钉成 **parent 链**（旧→新方向不变）：

```tsx
  const list: VersionListItemDto[] = versionsData?.versions ?? [];
  const currentVersionId = versionsData?.currentVersionId ?? null;
  const newer = useMemo(() => list.find((v) => v.id === currentVersionId) ?? list[0], [list, currentVersionId]);
  const older = useMemo(() => (newer?.parentVersionId ? list.find((v) => v.id === newer.parentVersionId) : undefined), [list, newer]);
  const { data: newerFull } = useQuery({ queryKey: ['version', newer?.id], queryFn: () => api.getVersion(newer?.id ?? ''), enabled: !!newer });
  const { data: olderFull } = useQuery({ queryKey: ['version', older?.id], queryFn: () => api.getVersion(older?.id ?? ''), enabled: !!older });
  const parts = useMemo(
    () => (olderFull && newerFull ? computeVersionDiff(olderFull.content, newerFull.content) : []),
    [olderFull, newerFull],
  );
```

（useQuery 的解构名 `versionsData` = `const { data: versionsData } = useQuery({ queryKey: ['versions', bookId, no], queryFn: () => api.listVersions(bookId, no), refetchInterval: 5000 });`，queryKey 不变。）
- 提示文案钉成三态：`older && newer` → 现状不变；`list.length < 2` → `（不足两个版本，无法对比）`；否则（有新版但 parent 不在列表）→ `上一版已删或不存在，无法对比`。判据用 `!older && list.length >= 2`。
- diff 渲染块（:42-54）不动。

### 3.4 `DashboardPage.tsx`

- import 补 `import { Badge } from '../components/ui';`
- 表头 :29 后加 `<th>产物</th>`；`<tr>` 内 :40 后加 `<td>{s.versionDeleted ? <Badge tone="muted">版本已删</Badge> : ''}</td>`。

### 3.5 `BookSamplePicker.tsx`

:40-43 钉成（列表只给 id/元数据，正文单取）：

```ts
        const list = await api.listVersions(bookId, no);
        if (list.versions.length === 0) continue;
        const current = list.versions.find((v) => v.id === c.currentVersionId) ?? list.versions[0];
        const full = await api.getVersion(current.id);
        blocks.push(`【第${no}章 ${c.title}】\n${full.content}`);
```

其余（勾选、上限提示、两钮、错误文案）不动。

## 4. 测试（+6：ChapterReaderPage +3、DiffPage +2、BookSamplePicker +1）

### 4.1 `ChapterReaderPage.test.tsx`（改造 + 新增 3 例）

- **mock 必须按 URL 分路**（现桩对所有 URL 回同一数组，8B 后页面还会打 `GET /api/versions/:id`）：钉成统一工厂——

```ts
type StubResp = { ok: boolean; status: number; json: () => Promise<unknown>; text: () => Promise<string> };
const stubResp = (body: unknown): StubResp => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
const stubErr = (status: number, body: unknown): StubResp => ({ ok: false, status, json: async () => body, text: async () => JSON.stringify(body) });

const LIST_ITEMS = [
  { id: 'v-current', chapterId: 'c1', kind: 'draft', wordCount: 1000, params: { overall: 9 }, styleSampleIds: [], createdAt: '2026-11-16T10:00:00.000Z' },
  { id: 'v-old', chapterId: 'c1', kind: 'revised', wordCount: 900, parentVersionId: 'v-x', params: {}, styleSampleIds: [], createdAt: '2026-11-16T09:00:00.000Z' },
]; // 列表项一律不带 content 键
const FULL = (id: string) => ({ id, chapterId: 'c1', kind: 'draft', content: `正文内容 ${id}`, wordCount: 1000, params: {}, styleSampleIds: [], createdAt: '2026-11-16T10:00:00.000Z' });

function mockFetch(opts: { deleteResp?: StubResp } = {}) {
  const calls: Array<{ method: string; url: string }> = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ method: init?.method ?? 'GET', url });
    if (url.includes('/versions')) return stubResp({ currentVersionId: 'v-current', versions: LIST_ITEMS });
    if (url.includes('/api/versions/')) return stubResp(FULL(url.split('/').pop() as string));
    if (init?.method === 'DELETE') return opts.deleteResp ?? stubResp({ ok: true });
    return stubResp({ ok: true });
  });
  vi.stubGlobal('fetch', fn);
  return calls;
}
```

- 既有用例 1 改用 `mockFetch()`，断言不变（chip 名正则 `/字 ·/` 不会命中「删除」钮，故 `chips.length === 2` 仍成立）；另补一条断言：正文区渲染 `正文内容 v-current`（证正文走 getVersion 单取）。
- 新例①：current 行「删除」钮 `expect(btn).toBeDisabled()`，非 current 行「删除」钮可点（按 `findAllByRole('button', { name: '删除' })`，两枚，第一枚对应 current）。
- 新例②：点非 current 行「删除」→ `findByText('确认删除')` 出现 → 点击 → 断言 `calls` 含 `{ method:'DELETE', url:'/api/versions/v-old' }`，且删除后（`stubResp({ok:true})` + refetch）chip 高亮项仍是 `v-current`（`bg-primary-soft` 的那枚文案含 `draft`）。
- 新例③：`mockFetch({ deleteResp: stubErr(409, { error: '当前版本不可删除（先回滚到其他版本）', reason: 'current' }) })` → 点删除 → 确认 → `findByText(/当前版本不可删除/)` 出现在页面（走 `apiErrorText` 还原服务端文案）。

### 4.2 `DiffPage.test.tsx`（新建，+2）

- 手法同 4.1 的按 URL 分路 mock（`versions` → 信封；`/api/versions/:id` → 带 content 的完整版）。
- 例①「按 parent 链配对」：信封 `{currentVersionId:'v2', versions:[{id:'v2',parentVersionId:'v1',kind:'revised',…无 content},{id:'v1',kind:'draft',…}]}`；`getVersion('v1')→content:'旧正文ABC'`、`getVersion('v2')→content:'新正文ABD'` → 断言 `data-testid='diff-removed'` 段文本含 `C`、`diff-added` 段含 `D`（旧→新方向不变）。
- 例②「parent 已删」：信封 `{currentVersionId:'v2', versions:[{id:'v2',parentVersionId:'gone',kind:'revised',…},{id:'v1',kind:'draft',…}]}`（列表无 id=gone 的行）→ `findByText('上一版已删或不存在，无法对比')`，且不发 `getVersion('gone')`（断言 calls 里无该 URL）。

### 4.3 `BookSamplePicker.test.tsx`（新建，+1）

- 渲染 `<BookSamplePicker onImport={fn} />`（外层 QueryClientProvider + 无需 Router）：先点「从书架选书」→ mock 分路：`/api/books` → `[{id:'b1',title:'书一',…}]`；`/api/books/b1` → `{id:'b1',title:'书一',chapters:[{chapterNo:1,title:'第一章',currentVersionId:'v-cur',…}]}`；`/api/books/b1/chapters/1/versions` → `{currentVersionId:'v-cur',versions:[{id:'v-cur',kind:'original',wordCount:10,content:'不该出现在列表的正文',…}]}`（**列表项带 content 也不许被用**）；`/api/versions/v-cur` → `{…content:'真实正文XYZ'}`。
- 勾选 `aria-label` 为 `选择第1章 第一章` 的 checkbox → 点「导入所选 1 章」→ 断言 `onImport` 收到 `'【第1章 第一章】\n真实正文XYZ'`（正文只可能来自 getVersion）。

## 5. 验收命令（硬序，任一环失败即停并回报）

以下命令均在项目根目录执行（cwd 已是仓库根）：

```
pnpm --filter @inkforge/web exec vitest run src/pages/ChapterReaderPage.test.tsx src/pages/DiffPage.test.tsx src/pages/BookSamplePicker.test.tsx
pnpm typecheck && pnpm lint
pnpm --filter @inkforge/web exec vitest run
pnpm test        # 全仓；开工基线 = 307 全绿（Task8A 后），本卡后应 ≥313，只增不减
```

判据：定向 3 文件全绿；typecheck/lint 0 错；web 包全绿；全仓全绿且 ≥313。除 §4 列出的改造外，既有断言一律不得改删来「变绿」。

## 6. GUI 黑盒目验（必做，截图入库）

- 隔离四件套（lessons [L-20261114-01]）：独立 `INKFORGE_DATA_DIR`、独立 `INKFORGE_CONFIG_FILE`、server 端口 **8794**（禁 8787）、vite 端口 **5194**；生产库 `apps/server/data/` 与其下 `backups/` 禁碰。脚本与依赖放仓库外临时目录（`scripts/` 与 `deps/` 分开），node 跑脚本时 cwd 不在依赖目录内。
- 工具：puppeteer-core + 系统 Chrome headless（`createRequire` 指向 temp deps）；真实鼠标点击（坐标 + hover）、行作用域定位、每次点击前 sleep ≥1.5s。
- 造数据：mock server（`INKFORGE_MOCK=1`）跑完一章生成（产生 draft + revised 两版，current=revised）。
- 必测四屏（每屏 1 图，存 `gui-test-screenshots/b2-t8b/`）：
  1. 阅读器：current 行「删除」钮 disabled（DOM `disabled` 属性 + `aria-disabled`），非 current 行可点；
  2. 点非 current 行「删除」→ 确认簇出现 → 点「确认删除」→ 该行消失、chip 高亮仍在 current 版本、正文区仍是 current 全文（**判据取 DOM 文本，不靠看图**）；
  3. 删除后打开 Diff 页 → 显示「上一版已删或不存在，无法对比」（因 draft 被删、revised.parent 已置 NULL）；
  4. 打开该 run 的仪表盘 → draft 所在步的「产物」列出现 Badge「版本已删」，其余步该列为空。
- 判据口径：本会话主审无图像输入，目验判据 = DOM/几何/网络/console（无 error 级 console、无 4xx/5xx 意外请求）；截图仅作存证入库，不作为判据。
- 断言陷阱（lessons）：成功提示里可能含被删项名 → 定位须限定在「有直接子按钮的行」；className 断言前先取完整 class（勿截断），且用 token 正则 `/(^|\s)token(\s|$)/` 防 `hover:` 前缀误判。

## 7. 约束

- 同工作树只有你在跑；**只 commit 不 push**；逐文件 `git add`；永不 `--no-verify`；永不 `git add -A`。
- 不得改 `apps/server/**`、`packages/shared/**`、`apps/web/src/components/ui.tsx`。
- 生产库与 `apps/server/data/backups/` 禁碰；GUI 一律隔离四件套。
- `.env` 值不得抄入任何入库文件。
- 卡面与实测冲突时以实测为准，并在 commit 正文逐条记「卡面勘正」。

## 8. commit 模板（单 commit）

```
feat(web): 版本删除钮与 current 回退锚、Diff 按 parent 链配对、报表「版本已删」列

verify: 定向 3 文件 <N> 绿；web 包 <N> 绿；全仓 <N> 绿（基线 307）；typecheck 0 错；lint 0 错
GUI: 已验证（4 屏判据=DOM/网络/console，截图存证 gui-test-screenshots/b2-t8b/）
卡面勘正: <逐条列出实测冲突>
Refs: DEC-2026-1116-01
```

（GUI 未跑成时改写为「GUI 未验证：<原因>」并继续提交，同时在完成通知里重申同句。）

## 9.5 主审实测勘正（亲执期回填，后续卡照此避坑）

1. **§4.1 mock 的 URL 分支顺序必须先判 `/api/versions/`、再判 `/versions`**：单取端点 URL 本身也含 `/versions`，按卡面原序会把单取请求误吞进列表分支（三个新测试文件全踩）。
2. **本仓库 web 测试未配置 @testing-library/jest-dom**：`toBeDisabled()` 报 `Invalid Chai property`，禁用态断言一律写 `expect(btn.disabled).toBe(true)`（需 `as HTMLButtonElement`）。
3. **计划与本卡文件清单均漏两处既有测试的形状适配**：`apps/web/test/t30.test.tsx`（`vi.mock('../src/api/client')` 的 `listVersions` 要改回信封并补 `getVersion`，否则 DiffPage 直接炸）与 `apps/web/src/pages/StyleProfilesSection.test.tsx`（`fetchFor` 三处 chapters/versions 分支改信封 + 新增 `/api/versions/` 分支）。二者属既有测试适配，不算新增用例。
4. **DiffPage 提示文案改独立 `<p>`**：原实现把提示拼在计数同一行，既让 `findByText` 精确匹配失败，也让 UI 挤成一句。
5. **GUI 判据同坑 + 响应体截断**：列表响应判定须用 `url.endsWith('/versions')`；`page.on('response')` 里 `res.text()` 的截断上限要给到 8000 字符（600 会把 3 项列表截断、JSON.parse 失败而误判 FAIL）。
6. 实测测试数：新增 +6（Reader 3 / Diff 2 / BookSamplePicker 1），既有 2 文件用例数不变 → 全仓 307 → **313** 全绿。GUI 黑盒 13/13 PASS，5 图存 `gui-test-screenshots/b2-t8b/`。

## 9. 卡外（勿做）

- 多选绑定风格档案、.epub、persona 模板、仿写预览可编辑 = 0.3 缓议项，勿动。
- B1 效果门（owner 盲评）由主模型另做，不属本卡。
