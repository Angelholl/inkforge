# 卡 T10B｜B4 档案删除+解绑修复⑦+逐书文风示例开关 · web

Refs: DEC-2026-1116-01（裁决②、裁决④、回归缺陷⑦）
计划真值：docs/plans/2026-11-16-four-feedbacks.md §Task10B（:534-559）
上游已交付（Task10A，卡面 `docs/design/card-2026-11-16-T10A-style-delete-fewshot.md`）：
- `DELETE /api/style-profiles/:id` → 200 `{ok:true}` | 404 `{error:'not found'}` | 409 `{error:'该风格档案已被书绑定，请先解绑再删除', books:[{id,title},…]}`
- `PUT /api/books/:bookId/style-fewshot` body `{on:boolean}` → `{ok:true, styleFewshotOn:boolean}`；书不存在 404；body 非法 400
- `BookDto.styleFewshotOn: boolean`（GET /api/books/:bookId 与 GET /api/books 都已透出）
- 绑定/解绑（PUT /api/books/:bookId/style）服务端**一律把开关归零**

## 1. 实测事实（卡面自足，勿再全量勘探）

- `apps/web/src/pages/BookDetailPage.tsx`（Task9B 后 454 行）：
  - 页内组件 `StyleBindSelect` 在 **:11-24**：`onBind: (profileId: string) => void`，`onChange={(e) => e.target.value && onBind(e.target.value)}` —— **回归缺陷⑦**：选「（未绑定）」（value=''）时 `&&` 短路，解绑请求根本不发。该 select **无 aria-label**（测试无法 getByLabelText）。
  - 绑定处理 `bindStyle` 在 **:114-120**（`api.bindStyle(bookId, { profileId })`，成功后 `setMsg('风格档案已绑定')` + `void refetch()`）。
  - 风格档案区块 **:364-376**：`<h2>风格档案</h2>` → 一行 flex 内放 `<StyleBindSelect currentProfileId={book?.styleProfileId ?? null} onBind={bindStyle} />` + 已绑定名 span → 末尾 `<p className="mt-1 text-xs text-faint">续写（continue）模式不注入风格，仅生成模式生效。</p>`（开关就挂在这段之后）。
  - 页内另有 `profiles` 查询与 `book` 查询（`api.getBook` 返回 `BookDto & { chapters, runs }`，client.ts:75）。
- `packages/shared/src/api.ts:258-260` `StyleBindBody { profileId: string }` —— **类型滞后**：服务端 `styleBindSchema` 早就允许 `null` 解绑（routes.ts:587-591），web 要发 `{profileId:null}` 必须先放宽此类型，否则 typecheck 红。
- `apps/web/src/api/client.ts`（Task9B 后 195 行）：`bindStyle` :179-180；**无 deleteStyleProfile、无 setBookFewshot**；DELETE 类先例 `deleteBook` :75、`deleteImitationProfile` :132-133、`deleteVersion` :149-151 —— 全部带 `body: '{}'`（Fastify 对「已设 content-type 且空体」直接 400 `FST_ERR_CTP_EMPTY_JSON_BODY`）。
- `apps/web/src/api/client.ts` 的 `req` 非 2xx 抛 `Error("METHOD url → STATUS: 响应体原文")`；`apiErrorText`（:57 起）只取 body 里的 `error` 字段。**409 附带的 `books` 数组它取不到** → 需新增 `apiErrorBody(e)` 取响应体原文供调用方自行 JSON.parse（见 §3.1）。
- `apps/web/src/pages/StyleProfilesSection.tsx`（250 行）：档案列表 `:115-145`，每行 `<li className="rounded border px-4 py-3">`：`:120` 名称 div、`:121-129` 元信息 flex 行（内含 `<Button variant="quiet" tone="primary" size="sm" className="ml-auto">版本/收起版本</Button>` `:126-128`）、`:130-140` 版本展开子列表。**无删除钮、无 confirmingDeleteId state**。文件里 `msg` state 已有（:19），`refetch` 已有（:14）。
- **同页陷阱**：`StyleProfilesSection` 末尾 `:248` 渲染 `<ImitationProfilesSection />`，它自带「删除」「确认删除」钮（ImitationProfilesSection.tsx:103-105 家族）→ 任何 `getByRole('button', {name:'删除'})` 必须**限定在目标档案行 `li` 作用域内**（`within(...closest('li'))`），否则抓到仿写区的钮。
- L2 确认簇既有形态（照抄，勿自创）：`apps/web/src/pages/ChapterReaderPage.tsx:90-113`（确认态 = 警示 span + `Button variant="danger" size="sm" solid loading=…` 「确认删除」 + `Button variant="secondary" size="sm"`「取消」；未确认态 = `Button variant="quiet" tone="danger" size="sm"`「删除」）。
- 测试桩口径：本仓 web 测试一律 `vi.stubGlobal('fetch', …)` + 真实 client.ts，不 mock client。`StyleProfilesSection.test.tsx` 用模块级 `fetchFor(url, init?)`（:38-100）+ 模块级可变开关 `distilled`（:102，各用例首行自行重置）；`BookDetailPage.test.tsx` 用 `installFetchStub()`（:57-80）+ 模块级 `calls[]`，其桩把 `u.includes('/api/books/b1')` 一律回整本 `book` fixture（:8-40，fixture **无 styleProfileId / 无 styleFewshotOn**）。
- 既有 `BookDetailPage.test.tsx` 的 4 个用例都只用 `删除/确认删除/取消/补摘要/保存设定/添加人物` 这些钮与 `世界观/剧情大纲/新卡姓名/新卡设定` 这些 label → 新增 select 的 `aria-label="风格档案绑定"` 与 checkbox 的 `label 文风示例注入` 不与它们撞名（`getByLabelText('风格档案')` 目前无人用，但 `<h2>风格档案</h2>` 不是 label，不冲突）。

## 2. 改动文件清单（改 4 + 测试改 2）

```
Modify  packages/shared/src/api.ts                       （StyleBindBody :258-260 放宽为 string | null）
Modify  apps/web/src/api/client.ts                       （新增 apiErrorBody；新增 deleteStyleProfile / setBookFewshot）
Modify  apps/web/src/pages/BookDetailPage.tsx            （StyleBindSelect 解绑修复⑦ + aria-label；bindStyle 收 null 与文案；风格档案区增示例开关 checkbox）
Modify  apps/web/src/pages/StyleProfilesSection.tsx      （档案行增删除钮 + L2 簇 + removeProfile）
Test Modify apps/web/src/pages/BookDetailPage.test.tsx        （+2，自带专用桩）
Test Modify apps/web/src/pages/StyleProfilesSection.test.tsx  （+2，桩补 DELETE 分支与 409 override）
```

不得改 `apps/server/**`、`apps/web/src/components/ui.tsx`、`apps/web/src/pages/ImitationProfilesSection.tsx`、`apps/web/src/pages/ChapterReaderPage.tsx`。

## 3. 改法钉死

### 3.1 `packages/shared/src/api.ts` + `client.ts`

```ts
export interface StyleBindBody {
  /** null = 解绑（服务端 styleBindSchema 早已接受，web 类型此前滞后） */
  profileId: string | null;
}
```

`client.ts`：在 `apiErrorText` 之后新增（把 apiErrorText 内的「取 body 原文」两步复用过去，行为不得变——`ChapterReaderPage.test.tsx` 的 409 文案用例锁着它）：

```ts
/** 取 req 抛错里的响应体原文（"METHOD url → STATUS: 这里" 的「这里」）；需要读结构化错误字段（如 409 的 books 列表）时用。 */
export function apiErrorBody(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  const i = msg.lastIndexOf(': ');
  return i >= 0 ? msg.slice(i + 2) : msg;
}
```

在 `createStyleProfile`（:171-172 一带）之后新增两方法：

```ts
  deleteStyleProfile: (id: string) =>
    // body '{}' 必需：Fastify 对「已设 content-type 且空体」直接 400（沿 deleteBook/deleteVersion 先例）
    req<{ ok: boolean }>(`/api/style-profiles/${id}`, { method: 'DELETE', body: '{}' }),
  setBookFewshot: (bookId: string, on: boolean) =>
    req<{ ok: boolean; styleFewshotOn: boolean }>(`/api/books/${bookId}/style-fewshot`, { method: 'PUT', body: JSON.stringify({ on }) }),
```

### 3.2 `BookDetailPage.tsx`

- `StyleBindSelect` 签名与 onChange 改为（并补 aria-label 供测试与读屏定位）：

```tsx
function StyleBindSelect({ currentProfileId, onBind }: { currentProfileId: string | null; onBind: (profileId: string | null) => void }) {
  const { data: profiles } = useQuery({ queryKey: ['style-profiles'], queryFn: api.listStyleProfiles, refetchInterval: 5000 });
  const list = Array.isArray(profiles) ? profiles : [];
  return (
    <select
      aria-label="风格档案绑定"
      className="rounded border px-2 py-1"
      value={currentProfileId ?? ''}
      onChange={(e) => onBind(e.target.value === '' ? null : e.target.value)}
    >
```

（其余 JSX 不动。**不得**保留 `e.target.value &&` 短路——那就是缺陷⑦本体。）

- `bindStyle` 收 null 并分文案：

```tsx
  const bindStyle = async (profileId: string | null): Promise<void> => {
    try {
      await api.bindStyle(bookId, { profileId });
      setMsg(profileId === null ? '风格档案已解绑（persona 快照一并清除）' : '风格档案已绑定');
      void refetch();
    } catch (e) {
      setMsg(`绑定失败：${(e as Error).message}`);
    }
  };
```

- 风格档案区（:364-376）在 `<p className="mt-1 text-xs text-faint">续写（continue）模式不注入风格，仅生成模式生效。</p>` **之后**、`</section>` 之前插入（仅绑定态出现开关；说明文案照抄不得改写）：

```tsx
        {book?.styleProfileId && (
          <div className="mt-2">
            <label htmlFor="book-style-fewshot" className="flex items-center gap-2 text-sm font-medium">
              <input
                id="book-style-fewshot"
                type="checkbox"
                checked={book.styleFewshotOn}
                onChange={(e) => {
                  const next = e.target.checked;
                  void api
                    .setBookFewshot(bookId, next)
                    .then((r) => {
                      setMsg(r.styleFewshotOn ? '文风示例注入已开启' : '文风示例注入已关闭');
                      void refetch();
                    })
                    .catch((err: unknown) => setMsg(apiErrorText(err)));
                }}
              />
              文风示例注入
            </label>
            <p className="mt-1 text-xs text-faint">
              关闭后不向写手注入范文片段；抄用检测仍以绑定样本为参考，不随开关关闭。新绑定默认关。
            </p>
          </div>
        )}
```

- import 处补 `apiErrorText`（`import { api, apiErrorText } from '../api/client';`）。

### 3.3 `StyleProfilesSection.tsx`

- state 追加（紧跟 `openVersions` 那两行之后）：`const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);`、`const [deleting, setDeleting] = useState(false);`
- `toggleVersions` 附近新增：

```ts
  const removeProfile = async (profileId: string): Promise<void> => {
    setDeleting(true);
    try {
      await api.deleteStyleProfile(profileId);
      setMsg('档案已删除');
      setConfirmingDeleteId(null);
      void refetch();
    } catch (e) {
      // 409 附带绑定书列表：优先用它拼人话，其余走 error 字段
      let text = apiErrorText(e);
      try {
        const body = JSON.parse(apiErrorBody(e)) as { books?: Array<{ id: string; title?: string }> };
        if (Array.isArray(body.books) && body.books.length > 0) {
          text = `无法删除，已被绑定：${body.books.map((b) => b.title ?? b.id).join('、')}`;
        }
      } catch {
        /* 非 JSON 响应体：沿用 apiErrorText 的兜底 */
      }
      setMsg(text);
      setConfirmingDeleteId(null);
    } finally {
      setDeleting(false);
    }
  };
```

- 档案行元信息 flex 行内、`版本` 那颗 Button（:126-128）**之后**插入（形态照 ChapterReaderPage:90-113，不得自创）：

```tsx
                {confirmingDeleteId === p.id ? (
                  <>
                    <span className="text-danger text-xs">删除该档案行不影响已绑定书的 persona 快照；仍被书绑定的档案不可删。</span>
                    <Button variant="danger" size="sm" solid loading={deleting} onClick={() => void removeProfile(p.id)}>
                      确认删除
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => setConfirmingDeleteId(null)}>
                      取消
                    </Button>
                  </>
                ) : (
                  <Button variant="quiet" tone="danger" size="sm" onClick={() => setConfirmingDeleteId(p.id)}>
                    删除
                  </Button>
                )}
```

- import 改 `import { api, apiErrorBody, apiErrorText } from '../api/client';`

## 4. 测试（+4）

### 4.1 `BookDetailPage.test.tsx`（+2，自带专用桩，不动既有 installFetchStub 与 fixture）

新增模块级桩（放在 `installFetchStub` 之后）：

```tsx
/** 风格绑定/解绑/开关专用桩：bound 与 fewshot 可变，PUT 后 GET 回读新值（模拟服务端 refetch 后状态）。 */
function installStyleStub() {
  let bound: string | null = null;
  let fewshot = false;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      calls.push({ url: u, init });
      if (u.endsWith('/api/books/b1/style-fewshot') && init?.method === 'PUT') {
        fewshot = Boolean((JSON.parse(String(init.body)) as { on: boolean }).on);
        return jsonResponse({ ok: true, styleFewshotOn: fewshot });
      }
      if (u.endsWith('/api/books/b1/style') && init?.method === 'PUT') {
        bound = (JSON.parse(String(init.body)) as { profileId: string | null }).profileId;
        return jsonResponse({ ok: true, styleProfileId: bound });
      }
      if (u.endsWith('/api/style-profiles')) return jsonResponse([{ id: 'sp1', name: '测试档案', version: 1, createdAt: '2026-11-13T08:00:00Z', metrics: {}, sourcePath: 'inline:x' }]);
      if (u.includes('/api/books/b1')) return jsonResponse({ ...book, styleProfileId: bound, styleFewshotOn: fewshot });
      return jsonResponse({});
    }),
  );
}
```

- 例①「解绑不再被短路：先绑 sp1 再选「（未绑定）」→ PUT /style body {profileId:null}」（回归缺陷⑦）：`installStyleStub()` → render → `await screen.findByLabelText('风格档案绑定')` → `fireEvent.change(sel, { target: { value: 'sp1' } })` → 等 `calls` 里出现 `PUT …/api/books/b1/style` 且 body `{profileId:'sp1'}` → `await waitFor(() => expect((screen.getByLabelText('风格档案绑定') as HTMLSelectElement).value).toBe('sp1'))`（证明 refetch 已回读绑定态）→ `fireEvent.change(sel, { target: { value: '' } })` → 等 `PUT …/style` body `{profileId:null}` 出现 → `expect(await screen.findByText(/风格档案已解绑/)).toBeTruthy()`。
  - 关键：解绑那一步必须在「select 当前值已是 sp1」之后做——从 '' 直接选 '' React 的 value tracking 不会触发 onChange，用例本身就会假绿。
- 例②「开关勾选发 PUT style-fewshot {on:true} 且回读后 checked=true」：`installStyleStub()` → render → 先 `fireEvent.change(await screen.findByLabelText('风格档案绑定'), { target: { value: 'sp1' } })` 绑定（未绑定态不渲染开关，见 §3.2）→ `await waitFor(() => expect(screen.queryByLabelText('文风示例注入')).toBeNull())`（绑定后服务端把开关归零 → 此刻 checkbox 出现且未勾）→ `fireEvent.click(screen.getByLabelText('文风示例注入') as HTMLInputElement)` → 等 `PUT …/api/books/b1/style-fewshot` body `{on:true}` → 等 `(screen.getByLabelText('文风示例注入') as HTMLInputElement).checked === true` 且出现「文风示例注入已开启」。

### 4.2 `StyleProfilesSection.test.tsx`（+2）

- 模块级追加 `let deletedIds: string[] = [];`、`let deleteOverride: { status: number; body: unknown } | null = null;`，并在 `fetchFor` **最前面**加分支、在列表分支里过滤：

```ts
  const del = /^\/api\/style-profiles\/([^/]+)$/.exec(url);
  if (del && init?.method === 'DELETE') {
    if (deleteOverride) return new Response(JSON.stringify(deleteOverride.body), { status: deleteOverride.status });
    if (!deletedIds.includes(del[1])) deletedIds = [...deletedIds, del[1]];
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }
```

列表分支（:39-41）改为 `(distilled ? [PROFILE, PROFILE2] : [PROFILE]).filter((p) => !deletedIds.includes(p.id))`。两个新用例**首行**各自重置 `deletedIds = []; deleteOverride = null;`（沿 `distilled = false;` 的既有习惯）。

- 例③「档案行删除：L2 簇确认 → 发 DELETE → 该行消失」：`renderSection()` → `await screen.findByText('测试档案')` → **行作用域**取钮：`const row = screen.getByText('测试档案').closest('li')!` → `fireEvent.click(within(row).getByRole('button', { name: '删除' }))` → `expect(within(row).getByText(/仍被书绑定的档案不可删/)).toBeTruthy()` → `fireEvent.click(within(row).getByRole('button', { name: '确认删除' }))` → 等 `fetchMock.mock.calls` 里出现 `method==='DELETE'` 且 URL 以 `/api/style-profiles/sp1` 结尾 → `await waitFor(() => expect(screen.queryByText('测试档案')).toBeNull())`。
- 例④「DELETE 被 409 拒时展示绑定书列表文案」：`deleteOverride = { status: 409, body: { error: '该风格档案已被书绑定，请先解绑再删除', books: [{ id: 'b1', title: '样本之书' }] } }` → 同上点删除+确认 → `expect(await screen.findByText('无法删除，已被绑定：样本之书')).toBeTruthy()`；并断言行**仍在**（`screen.getByText('测试档案')` 未消失，因桩未把它加入 deletedIds）。
- 既有 10 例一律不得改断言（本卡后该文件 12 例）；`within` 已在 import 列表（:1）无需再加。

## 5. 验收命令（硬序，任一环失败即停并回报）

```
pnpm typecheck && pnpm lint
pnpm --filter @inkforge/web exec vitest run src/pages/BookDetailPage.test.tsx src/pages/StyleProfilesSection.test.tsx src/pages/ChapterReaderPage.test.tsx src/components/VersionQcPanel.test.tsx
pnpm --filter @inkforge/web exec vitest run
pnpm test        # 全仓；开工基线 = Task10A 后的 server 包 +329 口径，本卡后应 ≥333，只增不减（数字以 Task10A 实收为准，见 §9 勘正⑦）
```

判据：定向 4 文件全绿；typecheck/lint 0 错；web 包全绿（Task9B 后实测 65 例 → 本卡后应 69）；全仓 ≥（Task10A 收口数 + 4）。既有断言不得改删来「变绿」。

## 6. 冒烟（vite build；GUI 归 owner 真实测试）

- `pnpm --filter @inkforge/web exec vite build` 必过（bundle 编译门槛，替代 GUI 目验）。
- 若 Task10A 的隔离服务仍在跑，可顺手用 curl 走一遍「绑定→开关 PUT→GET 回读→解绑→DELETE」，但这不是本卡放行条件。
- **不做 puppeteer/截图**：owner 2026-11-16 口径——真实测试由 owner 本人做，agent 只保证验证链跑绿。

## 7. 约束

- 同工作树只有你在跑；**只 commit 不 push**；逐文件 `git add`；永不 `--no-verify`；永不 `git add -A`。
- 生产库 `apps/server/data/` 与其下 `backups/` 禁碰；`.env` 值不得抄入任何入库文件。
- 卡面与实测冲突以实测为准，并在 commit 正文逐条记「卡面勘正」。

## 8. commit 模板（单 commit）

```
feat(web): 风格档案删除钮与绑定书 409 文案、解绑修复（选「未绑定」即发 null）、逐书文风示例开关 checkbox

verify: 定向 4 文件 <N> 绿；web 包 <N> 绿；全仓 <N> 绿（基线 <Task10A 收口数>）；typecheck 0 错；lint 0 错；冒烟=vite build 通过；secret 扫描零新增；pnpm audit --prod 与基线一致
GUI: 未验证（owner 口径：真实测试由 owner 本人做）
卡面勘正: <逐条列出实测冲突>
执行: <派发/亲执情况>
Refs: DEC-2026-1116-01
```

## 9. 计划勘正（写卡时按实测纠正，执行者按本卡为准）

1. 计划 Task10B 文件清单**漏 `packages/shared/src/api.ts`**：`StyleBindBody.profileId` 现类型是 `string`（:258-260），发 `{profileId:null}` 会 typecheck 红；必须放宽成 `string | null`（服务端早已吃 null）。
2. 计划漏 `client.ts` 的**错误体读取**：409 的 `books` 列表在 `apiErrorText` 里被压成 error 文案，取不到列表 → 新增 `apiErrorBody(e)`（§3.1），且不得改 `apiErrorText` 的既有行为（ChapterReaderPage 的 409 用例锁着它）。
3. 计划未写 DELETE 必须带 `body:'{}'`（Fastify 空体 400），照 deleteBook/deleteVersion 先例。
4. 计划说「绑定区 ~:333 增示例开关」——实测绑定区在 **:364-376**（Task9B 已把行号推后），且开关按规格只在 `book.styleProfileId` 存在时渲染；位置钉在那句「续写（continue）模式不注入风格」提示之后。
5. 计划测试①「选择（未绑定）空 option 发 PUT」在实现上有 React value-tracking 陷阱：select 当前值本就是 '' 时再选 '' 不触发 onChange，用例必须**先绑再解**（§4.1 例①），否则是假绿。
6. 计划未写 `StyleProfilesSection` 里嵌了 `ImitationProfilesSection`（:248），它自带「删除/确认删除」钮 → 删除类断言必须 `within(li)` 限定行作用域（lessons 里的行作用域口径）。
7. 计划 §Task10B 步骤写「web-gui-tester 黑盒：解绑流程全走；开关切换与说明文案；档案删除 409 提示」——按 owner 2026-11-16 新口径**取消**（真实测试归 owner），改以 vite build 冒烟 + 上述 DOM 断言覆盖；全仓基线数字要跟着 Task10A 实收数走（计划写的 +4 仍成立）。
8. `StyleBindSelect` 补 `aria-label="风格档案绑定"`：原控件无可访问名，测试与读屏都无法定位（计划未提，但 §4.1 两例依赖它）。

## 10. 卡外（勿做）

- 档案「整族删除」（同 source_hash 全版本一起删）无需求。
- 解绑后服务端清 persona 快照是**预期行为**（routes.ts:587-591），勿在前端加「保留快照」的回滚。
- 0.3 缓议项（多选绑定、.epub、persona 模板、仿写预览可编辑）勿动。
