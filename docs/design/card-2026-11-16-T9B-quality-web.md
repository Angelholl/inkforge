# 卡 T9B｜B3 评分解释+可调 · web（质量设置分区 + 质量轮数 select + 版本质检明细面板 + 阅读器图例行）

Refs: DEC-2026-1116-01（owner 反馈③）
计划真值：docs/plans/2026-11-16-four-feedbacks.md §Task9B
上游已交付（Task9A，commit `1b06426`，已实测全绿）：
- `GET /api/settings/quality` → `SettingsQualityDto { scoreThreshold: number; isDefault: boolean }`
- `PUT /api/settings/quality` body `{scoreThreshold:number}`（1-10，越界 400，空 body 400）→ `{saved:true, restartRequired:false}`
- `GET /api/versions/:versionId/qc` → `VersionQcDto { attempts: [{ attempt, l0, l1, gate:{action,reasons} }] }`；版本不存在 404；无 qc 记录 → `attempts: []`
- shared 已导出 `SettingsQualityDto` / `VersionQcAttemptDto` / `VersionQcDto`
- qc 任务文本已含【OVERALL 锚点】四档行；管线入库分阈值改读 `app_meta`（章级生效）

## 1. 背景与根因（卡面自足，不必再勘探）

工作树 `I:\inkforge`，分支 `master`。实测事实（直接用，勿再全量勘探）：

- `apps/web/src/api/client.ts`（187 行）：`generateChapter(bookId, chapterNo, maxRounds?)` 已带可选参（:87-91，body `JSON.stringify({ maxRounds })`）；**`generateAll(bookId)` 无 maxRounds 位**（:92，body `'{}'`）；`createRun`（:139，透传 body，`CreateRunBody` 已含 `maxRounds?`，见 shared api.ts:240-246）；`getReport`（:165）；`apiErrorText` 已导出（Task8B 加）。**无 settings 相关封装**。
- 服务端 maxRounds 通道已完整：`schemas.ts:37-39` `generateSchema={maxRounds: int 1..5 optional}`、`:41-47` `createRunSchema` 同界；`routes.ts:443-450`（单章 generate）、`:452-460`（generate-all）、`:463-482`（POST /api/runs）三处都已吃 `body.maxRounds`；rerun（routes.ts:502-511）继承 `run.maxRounds`。→ **本卡不动 server**。
- `apps/web/src/pages/BookDetailPage.tsx`（437 行）：生成调用三处 —— `:102-105` 局部函数 `generate()` 调 `api.generateChapter(bookId, chapterNo)`；`:107-110` `generateAll()` 调 `api.generateAll(bookId)`；`:391` 章节行内「生成」钮内联调 `api.generateChapter(bookId, c.chapterNo)`。JSX 区块：整书生成钮区 `:211-231`（同排已有 `导出格式` select `:218-227`，是本页 select 先例）、行内生成钮 `:386-394`、蓝图区「生成本章」`:419-421`。
- `apps/web/src/pages/NewBookPage.tsx`（241 行）：唯一 run 调用 `:117-138` 的 `startContinue()` 内 `api.createRun({ bookId, fromChapter: chapterNo, toChapter: chapterNo, mode: 'continue' })`（:130-132，未传 maxRounds）；按钮 JSX `:234-236`。
- `apps/web/src/pages/SettingsPage.tsx`（135 行）：本地 `SettingsResponse` 类型 :5-10；`useEffect` GET `/api/settings`（:23-43）；`save()` PUT `/api/settings`（:45-69，body 固定 `{strataBaseUrl, strataModel, mock}` + 可选 `strataApiKey`）；表单 :77-128（mock 勾选 :121-124、保存钮 :125-127）；message/error :129-130。**全页只有 provider 一件事，没有质量分区**。
- `apps/web/src/pages/ChapterReaderPage.tsx`（Task8B 后 133 行）：版本链 `<h2>` 在 **:78**、`<ul>` :79；chip 内 overall 显示 :86-88；正文 `<article>` **:124-126**。
- `apps/web/src/components/ui.tsx`：`BadgeTone = 'ok'|'warn'|'danger'|'info'|'muted'`（:9，已导出）、`BADGE_TONES`（:11-17：ok=`bg-ok-soft text-ok`、warn=`bg-warn-soft text-warn`、danger=`bg-danger-soft text-danger`、muted=`bg-bg text-muted`）、`Badge({tone='muted', children})`（:20）、`Chip`（:25）。
- 既有 web 测试**全部用 `vi.stubGlobal('fetch', …)` + 真实 client.ts**（不 `vi.mock('../api/client')`）：`SettingsPage.test.tsx` 的桩**按 `init.method` 分路**（PUT 一律回 `{saved:true,restartRequired:true}`，其余回 settings 对象，:23-30）；`BookDetailPage.test.tsx` 按 URL 正则/method 分路（:57-70）；`NewBookPage.test.tsx` 按 URL 后缀分路（:16-21）；`ChapterReaderPage.test.tsx`（Task8B 重写）按 URL 分路且**必须先判 `/api/versions/` 再判 `/versions`**。
- `apps/web/src/pages/DistillPage.tsx` 无 select 先例；页内 select 抄样只能取 BookDetailPage:218-227。

## 2. 改动文件清单（改 5 + 新建 1 + 测试改 4 新建 1）

```
Modify  apps/web/src/api/client.ts                     （generateAll 增 maxRounds；新增 getQuality/putQuality/versionQc）
Modify  apps/web/src/pages/SettingsPage.tsx            （主 form 之后新增「质量」分区）
Modify  apps/web/src/pages/BookDetailPage.tsx          （质量轮数 select + 三处生成调用传 maxRounds）
Modify  apps/web/src/pages/NewBookPage.tsx             （质量轮数 select + createRun 传 maxRounds）
Modify  apps/web/src/pages/ChapterReaderPage.tsx       （版本链下图例行 + current 下挂质检明细面板）
Create  apps/web/src/components/VersionQcPanel.tsx     （新组件）
Test Create apps/web/src/components/VersionQcPanel.test.tsx  （+2）
Test Modify apps/web/src/pages/SettingsPage.test.tsx         （桩改按 URL+method 分路 + 新增 1 例）
Test Modify apps/web/src/pages/BookDetailPage.test.tsx       （+1）
Test Modify apps/web/src/pages/NewBookPage.test.tsx          （+1）
Test Modify apps/web/src/pages/ChapterReaderPage.test.tsx    （桩补 /qc 分路，用例数不变）
```

不得改 `apps/server/**`、`packages/shared/**`、`apps/web/src/components/ui.tsx`。

## 3. 改法钉死

### 3.1 `client.ts`

- import 补 `SettingsQualityDto`、`VersionQcDto`（并入既有 type import 列表）。
- `generateAll` 改造 + 三个新方法（新方法插在 `getReport` 之后即可）：

```ts
  generateAll: (bookId: string, maxRounds?: number) =>
    req<{ runId: string }>(`/api/books/${bookId}/generate-all`, { method: 'POST', body: JSON.stringify({ maxRounds }) }),
```

```ts
  getQuality: () => req<SettingsQualityDto>('/api/settings/quality'),
  putQuality: (scoreThreshold: number) =>
    req<{ saved: boolean; restartRequired: boolean }>('/api/settings/quality', { method: 'PUT', body: JSON.stringify({ scoreThreshold }) }),
  versionQc: (versionId: string) => req<VersionQcDto>(`/api/versions/${versionId}/qc`),
```

### 3.2 `SettingsPage.tsx`

- import 改 `import { api, API_BASE, apiErrorText } from '../api/client';`（`API_BASE` 既有 provider 表单仍在用，勿删）。
- state 追加：`const [scoreThreshold, setScoreThreshold] = useState('8');`、`const [qualityMsg, setQualityMsg] = useState('');`
- 追加一个独立 `useEffect`（挂载时读质量阈值；服务未连时静默保持默认显示）：

```tsx
  useEffect(() => {
    let cancelled = false;
    api
      .getQuality()
      .then((q) => {
        if (!cancelled) setScoreThreshold(String(q.scoreThreshold));
      })
      .catch(() => {
        /* 服务未连：保持默认显示，保存时再报错 */
      });
    return () => {
      cancelled = true;
    };
  }, []);
```

- 追加保存函数（**客户端先校验 1-10**，非法不外发）：

```tsx
  const saveQuality = async (): Promise<void> => {
    setQualityMsg('');
    const v = Number(scoreThreshold);
    if (!Number.isFinite(v) || v < 1 || v > 10) {
      setQualityMsg('阈值须为 1-10 之间的数字');
      return;
    }
    try {
      await api.putQuality(v);
      setQualityMsg('已保存：每个 run 的章节管线开始时读取新阈值；进行中的 run 不受影响。');
    } catch (e) {
      setQualityMsg(apiErrorText(e));
    }
  };
```

- 在主 `</form>` 之后、`{message && …}` 之前插入分区（**provider 表单与其 PUT body 一律不动**）：

```tsx
      <section className="mt-8">
        <h2 className="text-lg font-semibold">质量</h2>
        <div className="mt-3 space-y-3">
          <div>
            <label htmlFor="settings-score-threshold" className="block text-sm font-medium">
              入库分阈值 OVERALL（1-10，默认 8.0）
            </label>
            <input
              id="settings-score-threshold"
              type="number"
              min={1}
              max={10}
              step={0.5}
              className="mt-1 w-full rounded border px-3 py-2"
              value={scoreThreshold}
              onChange={(e) => setScoreThreshold(e.target.value)}
            />
          </div>
          <p className="text-xs text-muted">
            保存即时生效：每个 run 的章节管线开始时读取；进行中的 run 不受影响。低于阈值触发重写（轮数未满时）；上一轮增益 &lt;5% 即停（同分即停）。
          </p>
          <Button type="button" variant="primary" onClick={() => void saveQuality()}>
            保存质量设置
          </Button>
        </div>
        {qualityMsg && <p className="mt-2 text-sm text-ok">{qualityMsg}</p>}
      </section>
```

### 3.3 `BookDetailPage.tsx`

- state 追加：`const [maxRounds, setMaxRounds] = useState(2);`
- 三处生成调用一律带上 `maxRounds`（页内一处 select 统管本页三入口）：
  - `:102-105` 的 `generate()` → `api.generateChapter(bookId, chapterNo, maxRounds)`
  - `:107-110` 的 `generateAll()` → `api.generateAll(bookId, maxRounds)`
  - `:391` 行内「生成」钮 → `api.generateChapter(bookId, c.chapterNo, maxRounds)`
- 在整书生成钮区块内、「整书生成」按钮之后、「刷新」之前插入 select（本页已有 `导出格式` select 先例 :218-227，样式照它）：

```tsx
        <label className="flex items-center gap-1.5 text-sm text-muted">
          质量轮数
          <select
            aria-label="质量轮数"
            className="rounded border px-2 py-1.5"
            value={maxRounds}
            onChange={(e) => setMaxRounds(Number(e.target.value))}
          >
            <option value={1}>1 轮</option>
            <option value={2}>2 轮</option>
            <option value={3}>3 轮</option>
          </select>
        </label>
```

（UI 上限 3 轮，服务端上限 5 轮不暴露；默认 2 = 服务端默认。）

### 3.4 `NewBookPage.tsx`

- state 追加 `const [maxRounds, setMaxRounds] = useState(2);`
- `:130-132` 的 createRun 改为 `api.createRun({ bookId, fromChapter: chapterNo, toChapter: chapterNo, mode: 'continue', maxRounds })`
- 在「发起续写」按钮（:234-236）**之前**插入与 §3.3 同款的 `质量轮数` select（同 aria-label、同选项 1/2/3、默认 2）。

### 3.5 `components/VersionQcPanel.tsx`（新建，整文件钉死）

```tsx
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { Badge, type BadgeTone } from '../components/ui';
import type { VersionQcAttemptDto } from '@inkforge/shared';

const ACTION_TONE: Record<string, BadgeTone> = { pass: 'ok', rewrite: 'warn', needs_human: 'danger' };

function findingTone(severity: string): BadgeTone {
  return severity === 'blocker' ? 'danger' : severity === 'major' ? 'warn' : 'muted';
}

/** 版本质检明细（B3 解释性）：逐轮 gate 判定 + 理由 + L1 findings + L0 未过项。 */
export function VersionQcPanel({ versionId }: { versionId: string }) {
  const { data } = useQuery({
    queryKey: ['version-qc', versionId],
    queryFn: () => api.versionQc(versionId),
    enabled: versionId !== '',
  });
  const attempts: VersionQcAttemptDto[] = Array.isArray(data?.attempts) ? data.attempts : [];
  if (attempts.length === 0) {
    return (
      <p className="mt-3 text-xs text-muted" data-testid="qc-panel-empty">
        仅新运行的版本携带质检明细。
      </p>
    );
  }
  return (
    <section className="mt-3 space-y-3" data-testid="qc-panel">
      {attempts.map((a) => {
        const l1 = a.l1 as { overall?: number; findings?: Array<{ severity: string; dimension: string; quote: string; comment: string }> };
        const l0 = a.l0 as { checks?: Array<{ name: string; pass: boolean; details?: string }> };
        const failed = (l0.checks ?? []).filter((c) => !c.pass);
        return (
          <div key={a.attempt} className="rounded border px-3 py-2">
            <div className="flex items-center gap-2 text-sm">
              <span className="font-mono text-xs">第{a.attempt}轮</span>
              <Badge tone={ACTION_TONE[a.gate.action] ?? 'muted'}>{a.gate.action}</Badge>
              {typeof l1.overall === 'number' && <span className="text-xs text-muted">OVERALL {l1.overall.toFixed(1)}</span>}
            </div>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-muted">
              {a.gate.reasons.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
            {(l1.findings ?? []).length > 0 && (
              <ul className="mt-2 space-y-1">
                {(l1.findings ?? []).map((f, i) => (
                  <li key={i} className="text-xs">
                    <Badge tone={findingTone(f.severity)}>{f.severity}</Badge>
                    <span className="ml-2 font-medium">{f.dimension}</span>
                    <span className="ml-2 text-muted">「{f.quote}」</span>
                    <span className="ml-2">{f.comment}</span>
                  </li>
                ))}
              </ul>
            )}
            {failed.length > 0 && <p className="mt-2 text-xs text-muted">L0 未过：{failed.map((c) => c.name).join('、')}</p>}
          </div>
        );
      })}
    </section>
  );
}
```

### 3.6 `ChapterReaderPage.tsx`

- import 补 `import { VersionQcPanel } from '../components/VersionQcPanel';`
- 在 `<h2 className="font-semibold">版本链（新 → 旧）</h2>`（:78）之后插图例行（文案照抄，`<` 用字符串表达式避免 JSX 转义歧义）：

```tsx
        <p className="mt-1 text-xs text-muted">
          {'图例：版本 chip 依次为 类型 · 字数 · 时间 · OVERALL 分；达标线默认 8.0 分（可在「设置 → 质量」调整）；同分即停——本轮较上一轮增益 <5% 视为无改善，停止重写并转人工。'}
        </p>
```

- 在正文 `<article>…</article>`（:124-126）之后插：`{current && <VersionQcPanel versionId={current.id} />}`

## 4. 测试（+5，另有一处既有桩适配）

### 4.1 `components/VersionQcPanel.test.tsx`（新建，+2）

- 桩：`vi.stubGlobal('fetch', vi.fn(async (input) => { const url = String(input); if (url.endsWith('/qc')) return stubResp({ attempts: ATTEMPTS }); … }))`（`/qc` 必须优先判，因 URL 里也含 `/api/versions/`）。
- `ATTEMPTS` 造两枚：attempt1 `gate={action:'rewrite',reasons:['overall 7 < 8']}`、`l1={overall:7, findings:[{severity:'major',dimension:'节奏',quote:'他推开门',comment:'拖沓'}]}`、`l0={checks:[{name:'字数',pass:false},{name:'复文',pass:true}]}`；attempt2 `gate={action:'pass',reasons:['全过且分达标']}`。
- 例①：渲染后断言 `data-testid='qc-panel'` 在场；两轮的 gate Badge 文案含 `rewrite`/`pass`，且 pass 那枚 class 含 `bg-ok-soft`、rewrite 那枚含 `bg-warn-soft`；`overall 7 < 8` 理由文本在场；finding 行含 `拖沓`；`L0 未过：字数` 在场。
- 例②：桩回 `{ attempts: [] }` → `findByTestId('qc-panel-empty')` 文案含「仅新运行的版本携带质检明细」。

### 4.2 `SettingsPage.test.tsx`（+1，且桩需改造）

- **既有桩按 method 分路会把 `GET /api/settings/quality` 也回成 provider 设置对象**（无 scoreThreshold）→ 需改成「URL + method」双条件：
  - `url.endsWith('/api/settings/quality') && method==='PUT'` → `{ saved: true, restartRequired: false }`
  - `url.endsWith('/api/settings/quality')`（GET）→ `{ scoreThreshold: 8, isDefault: true }`
  - 其余 `method==='PUT'` → `{ saved: true, restartRequired: true }`（provider 表单，保持既有用例绿）
  - 其余 GET → provider `settingsResponse`
- 新例：渲染 → `getByLabelText('入库分阈值 OVERALL（1-10，默认 8.0）')` 初值 `8` → 改成 `9` → 点「保存质量设置」→ 断言 fetch 记录里有 `PUT` 且 URL 以 `/api/settings/quality` 结尾、body 为 `{scoreThreshold:9}` → 断言出现「已保存」文案且**不含**「重启」字样（质量分区不吃 restartRequired）。
- 既有用例的 PUT body 全等断言（provider 表单）不得改动 —— 本卡没动 provider PUT body。

### 4.3 `BookDetailPage.test.tsx`（+1）

- 新例：渲染书页 → `getByLabelText('质量轮数')` 默认值 `2` → 改成 `1` → 点「整书生成」→ 断言 fetch 记录里 `POST …/generate-all` 的 body 是 `{maxRounds:1}`；再改回 `3` 点某章行内「生成」→ 断言 `POST …/chapters/1/generate` body `{maxRounds:3}`。（既有桩需保证这两个 POST 返回 `{runId:'r1'}` 形状；若现桩未覆盖，按 URL 补分支。）

### 4.4 `NewBookPage.test.tsx`（+1）

- 新例：走到发起续写那一步 → `getByLabelText('质量轮数')` 默认 `2` → 改 `1` → 点「发起续写…」→ 断言 `POST /api/runs` 的 body 含 `maxRounds: 1` 且 `mode:'continue'`。

### 4.5 `ChapterReaderPage.test.tsx`（既有桩适配，用例数不变）

- 页面新增 `VersionQcPanel` 会打 `GET /api/versions/<id>/qc`；现桩的 `/api/versions/` 分支会把 `/qc` 误当单取版本 → **必须在最前面加分支**：`if (url.endsWith('/qc')) return stubResp({ attempts: [] });`（走空态，既有用例断言不受影响）。

## 5. 验收命令（硬序，任一环失败即停并回报）

以下命令均在项目根目录执行（cwd 已是仓库根）：

```
pnpm --filter @inkforge/web exec vitest run src/components/VersionQcPanel.test.tsx src/pages/SettingsPage.test.tsx src/pages/BookDetailPage.test.tsx src/pages/NewBookPage.test.tsx src/pages/ChapterReaderPage.test.tsx
pnpm typecheck && pnpm lint
pnpm --filter @inkforge/web exec vitest run
pnpm test        # 全仓；开工基线 = 319 全绿（Task9A 后），本卡后应 ≥324，只增不减
```

判据：定向 5 文件全绿；typecheck/lint 0 错；web 包全绿；全仓 ≥324。既有断言一律不得改删来「变绿」（§4 列出的桩分路适配除外）。

## 6. GUI 黑盒目验（必做，截图入库）

- 隔离四件套（lessons [L-20261114-01]）：独立 `INKFORGE_DATA_DIR` / `INKFORGE_CONFIG_FILE`、server 端口 **8796**、vite 端口 **5196**（vite 侧还要 `INKFORGE_API_TARGET=http://127.0.0.1:8796`）；生产库与 `apps/server/data/backups/` 禁碰。脚本与依赖放仓库外临时目录。
- **停栈纪律（本轮实测教训）**：Git Bash 的 `kill $!` 杀不掉 Windows 上的 node 进程；收尾必须按端口 `netstat -ano | grep LISTENING` 取 PID 再 `taskkill //F //PID`，否则残留旧 server 会让新接口「看起来 404」。
- 工具：puppeteer-core + 系统 Chrome headless（`createRequire` 指向 temp deps）；真实鼠标点击（坐标 + hover）、行作用域定位、点击前 sleep ≥1.5s。
- 造数据：`INKFORGE_MOCK=1` 起 server → 建书 + 蓝图 → `POST generate`（`maxRounds:1`）跑完 mock 管线 → 该章 draft 版本即带 qc 明细（qc 步 outputJson 已存 l0/l1/gate）。
- 必测四屏（每屏 1 图，存 `gui-test-screenshots/b3-t9b/`）：
  1. 设置页：改阈值为 9 → 点「保存质量设置」→ 出现「已保存」提示且页面**无**「重启」字样；刷新页面后阈值输入框回读 9（跨进程持久，判据取输入框 value + 网络 GET 响应）。
  2. 书页：`质量轮数` select 存在且默认 2；改成 1 后点「整书生成」→ 抓网络 POST body 含 `"maxRounds":1`（判据取请求 URL + 请求体，不靠看图）。
  3. 阅读器：current 版本下方出现质检明细面板（有 attempt 块、gate Badge 文案与理由列表）；图例行在 1280×800 下不换行错位（判据：图例 `<p>` 的 `getBoundingClientRect().height` 单行高 ≈ 16-22px 且 `scrollWidth <= clientWidth`）。
  4. 空态：对一枚**无 qc 记录**的版本（例如 `POST /api/versions/:id/rewrite-selection` 新产的版本）打开阅读器并选中它 → 面板显示「仅新运行的版本携带质检明细」。
- 判据口径：主审无图像输入 → 判据 = DOM/几何/网络/console（无 error 级 console、无非预期 4xx/5xx）；截图仅存证。
- 断言陷阱（lessons）：URL 判定里 `/api/versions/:id/qc` 也含 `/versions` 与 `/api/versions/`，一律用 `endsWith('/qc')`；成功提示文案可能含被改项名，定位须限定行作用域；className 断言取完整 class 且用 token 正则 `/(^|\s)token(\s|$)/`。

## 7. 约束

- 同工作树只有你在跑；**只 commit 不 push**；逐文件 `git add`；永不 `--no-verify`；永不 `git add -A`。
- 不得改 `apps/server/**`、`packages/shared/**`、`apps/web/src/components/ui.tsx`。
- 生产库与 `apps/server/data/backups/` 禁碰；GUI 一律隔离四件套。
- `.env` 值不得抄入任何入库文件。
- 卡面与实测冲突时以实测为准，并在 commit 正文逐条记「卡面勘正」。

## 8. commit 模板（单 commit，截图另存 docs(gui) 提交）

```
feat(web): 设置「质量」分区、生成入口质量轮数 select、阅读器质检明细面板与图例行

verify: 定向 5 文件 <N> 绿；web 包 <N> 绿；全仓 <N> 绿（基线 319）；typecheck 0 错；lint 0 错
GUI: 已验证（4 屏判据=DOM/几何/网络/console，截图存证 gui-test-screenshots/b3-t9b/）
卡面勘正: <逐条列出实测冲突>
Refs: DEC-2026-1116-01
```

（GUI 未跑成时改写为「GUI 未验证：<原因>」并继续提交，同时在完成通知里重申同句。）

## 9. 计划勘正（写卡时按实测纠正）

1. 计划写「BookDetailPage :209 整书生成旁、:394 生成本章旁增 select」——实测整书生成区在 `:211-231`、蓝图区「生成本章」在 `:419-421`，且**另有第三处**行内「生成」钮 `:391` 也调 `generateChapter`；本卡改为**每页一枚 select 统管本页全部生成入口**（BookDetailPage 三处、NewBookPage 一处都读同一 state），避免同一页出现三个同名控件。
2. 计划写「SettingsPage :120 前质量分区」——实测 :120 落在「模型名」输入块内部；本卡把分区放在主 `</form>` 之后，provider 表单与其 PUT body 完全不动（保住既有 PUT body 全等断言）。
3. 计划未列 `ChapterReaderPage.test.tsx` 需要适配（新面板会打 `/qc`，而现桩的 `/api/versions/` 分支会误吞它）→ 本卡 §4.5 补。
4. `generateChapter` 早带可选 `maxRounds`（client.ts:87-91），只是调用方一直没传——本卡只需补 `generateAll` 的形参与三处调用传参。

## 10. 卡外（勿做）

- rerun 的轮数继承自 run（服务端 routes.ts:502-511），本卡不加 UI 入口。
- 0.3 缓议项（多选绑定风格档案、.epub、persona 模板、仿写预览可编辑）勿动。
