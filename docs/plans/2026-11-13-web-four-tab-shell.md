# 墨炉（Inkforge）Web 四 TAB 壳实现计划（2026-11-13）

**目标：** 前端改为 TAB 壳，四 TAB：①书架（默认首页 `/`）②新书（`/new`，占位）③续写（`/continue`，现有三步向导整体迁入）④设置（`/settings`，收纳服务连接 + 风格档案管理）。书架去内联建书表单，建书入口归一续写向导 step1。后端 `apps/server`、`packages/shared`、`apps/desktop` 与 web API client 零改动。验证链全绿 + GUI 黑盒目验后收口。

**规格路径：** 本计划为唯一施工真值；owner「待确认」三项（第二节）有答复后追加至 `docs/decision-log.md`，无异议按本计划执行。

---

## 一、路线决策（唯一选择，施工不得偏离）

### D1 路由形态：嵌套路由（App 壳 + Outlet），不用平铺 + 常驻 header

理由：① react-router v7（`apps/web/package.json` `"react-router": "^7"`，import 来自 `'react-router'`）的 layout route 惯用法，`<Route element={<AppShell />}>` 无 path，**所有现存 URL（书详情/章/运行/diff/dashboard）原样保留**；② TAB 导航 + 激活态（NavLink）单点收敛在 AppShell，根治现状「页头仅随 `*`/settings 兜底渲染」的缺陷（`App.tsx:19-32` 仅在 App 挂载时出现，故 BooksPage 才被迫内联「设置」链接——见 `BooksPage.test.tsx:7` 回归注释）；③ 平铺方案需在每页手工插 header 或再造 Provider 包裹，组件树更绕、深页入壳无着落。

### D2 设置页形态：单页双分区（服务连接 + 风格档案），不用子路由

理由：两分区内容量小（服务表单 4 个输入 + 风格档案 = 列表 + 单蒸馏表单），无页内导航必要；子路由方案（`/settings` + `/settings/styles`）需拆 SettingsTab 壳 + 子页并重构 SettingsPage 既有 2 用例的渲染结构，churn 大收益小。落地：`SettingsPage.tsx` 在既有消息/错误块之后渲染 `<StyleProfilesSection />`。

### D3 命名与路由表（main.tsx 目标态，逐行钉死）

- 续写 TAB 挂载现有 `NewBookPage`，**文件名不改**（避免测试/import 连锁改名），路由 `/new` → `/continue`。全库调研：`/new`、`/styles`、`StyleProfilesPage` 的引用仅存于 `App.tsx:23,26`、`main.tsx:8,24-25` 及其自身测试——路径切换零外溢。
- 旧 `/new` 落在新书占位页、旧 `/styles` 以 `<Navigate to="/settings" replace />` 重定向（书签兼容）；**不给旧向导设重定向**（`/new` 语义已让渡给新书 TAB）。
- 404 页放壳外（`*` 与 layout 同级），无 TAB 导航，突出「此页不存在」；health 拉取随兜底页迁入 NotFoundPage（承接现 `App.tsx:8-15`）。
- 深页（书详情/章/运行/dashboard/diff）纳入壳内：TAB 头常驻可见，四 TAB 激活态在深页不点亮。

```tsx
// apps/web/src/main.tsx <Routes> 目标态
<Routes>
  <Route element={<AppShell />}>
    <Route path="/" element={<BooksPage />} />
    <Route path="/new" element={<NewBookIdeaPage />} />
    <Route path="/continue" element={<NewBookPage />} />
    <Route path="/settings" element={<SettingsPage />} />
    <Route path="/books/:bookId" element={<BookDetailPage />} />
    <Route path="/books/:bookId/chapters/:chapterNo" element={<ChapterReaderPage />} />
    <Route path="/books/:bookId/chapters/:chapterNo/diff" element={<DiffPage />} />
    <Route path="/runs/:runId" element={<RunPage />} />
    <Route path="/runs/:runId/dashboard" element={<DashboardPage />} />
    <Route path="/styles" element={<Navigate to="/settings" replace />} />
  </Route>
  <Route path="*" element={<NotFoundPage />} />
</Routes>
```

### D4 组件签名清单（本轮全部新增/修改组件，均无 props）

| 文件 | 导出 | 要点 |
|---|---|---|
| `apps/web/src/App.tsx`（重写） | `export default function AppShell()` | 四 NavLink（书架**加 `end`**，否则 `/` 前缀匹配全路由常亮）+ `<Outlet />`；去 health 拉取；激活类 `({ isActive }) => isActive ? 'font-bold text-blue-700' : 'text-blue-700'`；header 容器沿用 `mx-auto mt-8 flex max-w-2xl gap-4 px-6 text-sm` |
| `apps/web/src/pages/NotFoundPage.tsx`（新增） | `export default function NotFoundPage()` | 承接现 App.tsx:8-15 health fetch 与 :38-49 展示 JSX 原样搬移；追加 `← 返回书架` Link |
| `apps/web/src/pages/NewBookIdeaPage.tsx`（新增） | `export default function NewBookIdeaPage()` | 纯静态 JSX，零 state 零 fetch；禁用态表单壳 |
| `apps/web/src/pages/StyleProfilesSection.tsx`（新增） | `export default function StyleProfilesSection()` | 逻辑整体搬自 StyleProfilesPage.tsx:8-28（useQuery `['style-profiles']` refetchInterval 5000、distill 表单态机）与 :37-68 JSX；差异三点：去 `<main>`/h1 改自身 `<section className="mt-10">` + `<h2 className="text-xl font-bold">风格档案</h2>`；去「← 书架」Link（→ 组件无 react-router 依赖）；placeholder/按钮名/空态文案逐字保留 |
| `apps/web/src/pages/SettingsPage.tsx`（修改） | 默认导出签名不变 | 渲染 `<StyleProfilesSection />`；删「← 返回书架」Link（:73-75）与 react-router import |
| `apps/web/src/pages/BooksPage.tsx`（修改） | 默认导出签名不变 | 删 title state（:9）、create()（:11-16）、内联表单（:26-36）、「设置」Link 及 flex 容器（:20-25 → 保留 `<h1 className="text-2xl font-bold">墨炉 · 书架</h1>`）；空态改链 |

### D5 「绑定书籍」功能去留：保留在 BookDetailPage，设置分区不重复绑定 UI

调研实证：绑定功能已存在于 `BookDetailPage.tsx:7`（StyleBindSelect）、`:63-66`（bindStyle → `api.bindStyle`，`client.ts:76-77` PUT `/api/books/:bookId/style`）、`:101` 挂载。绑定是**每书上下文**动作，设置页内绑定需再造选书下拉且与书详情页形成双入口双真相。故「风格档案管理收进设置」= 档案列表 + 蒸馏表单迁入；绑定 UI 留在书详情页原位不动。**此解读列入待 owner 确认（第二节 2）。**

---

## 二、待 owner 确认（默认假设施工，答复后如有变更仅影响下列任务局部）

1. **新书 TAB 占位页**：立项意向书入口 B（预设世界观/角色卡 → 蓝图 → 全新生成）本期只交付「说明文案 + 禁用态表单壳」，不实现流水线 —— owner 已给默认假设但未最终确认（影响 T-02）。
2. **绑定书籍功能位置**：按 D5 留在书详情页；若 owner 要求设置页内绑定（含选书下拉），需追加任务（影响 T-03/T-04 边界）。
3. **旧向导地址**：`/new` → `/continue` 后不给旧地址设重定向（旧 `/new` 书签将落在新书占位页）——若有书签存量顾虑可改为 `/new` 设二次重定向，影响 T-05 一行路由。

---

## 三、全局约束（钉值）

1. 同工作树串行 ≤1 卡；执行者只 commit 不 push；commit 纪律：Conventional 前缀 + 中文描述，正文 `verify: <验证命令与结果>`；**GUI 相关提交注明「GUI 已验证/未验证」**（T-02~T-06 一律未验证，T-07 收口注明已验证）；禁 `git add -A`，只 add 明确路径；commit 前 secret 自查。
2. **测试基线只增不减账本（web，T-01 实测钉值，实测 14——2026-11-13 实测修订，原预估 7 漏计 `client.test.ts` 2 例与 `test/t30.test.tsx` 5 例）**：

   ```
   14 ─T-02 +1→ 15 ─T-03 +2→ 17 ─T-04 ±0→ 17 ─T-05 +2−1→ 18 ─T-06 −1+2→ 19（终态）
   ```
   每个 commit 点 web 用例数严格 ≥ 前一 commit 点；shared/server 零改动（shared 2 / server 173 实测锚定），suite 总数随 web 净 +5（189 → 194）。
3. **禁改清单**：`apps/server/**`、`packages/shared/**`、`apps/desktop/**`、`apps/web/src/api/**`（本轮零 API 变更）、`apps/web/src/pages/` 未列文件（`NewBookPage`、`BookDetailPage`、`ChapterReaderPage`、`RunPage`、`DashboardPage`、`DiffPage`、`SelectionRewrite` 及各自测试；测试仅 T-05 明确删除的两个文件例外）。
4. 命令约定（Windows + Git Bash，cwd = `I:\inkforge`）：定向测试 `pnpm --filter @inkforge/web exec vitest run src/pages/X.test.tsx`；全量验证链 `pnpm -w lint && pnpm -w typecheck && pnpm -w test`；web 构建 `pnpm build:web`。

---

## 四、探查结论（实证事实，均由本轮只读调研核到 文件:行号）

- **F1 路由现状**：`apps/web/src/main.tsx:22-32` 九条路由（`/`=BooksPage、`/new`=NewBookPage、`/styles`=StyleProfilesPage、书详情/章/运行/dashboard/diff、`*`=App 兜底）；`App.tsx:19-32` header 四 Link（书架/新建小说/风格/设置）仅随 App 渲染，`:34` 内嵌 settings 路由，`:35-51` 兜底页含 `:8-15` 的 health fetch。
- **F2 三步向导**：`NewBookPage.tsx:33-36` WizardState（step1/2/3 判别联合）；`:41-61` step1 建书（createBook，书名空校验）；`:63-85` step2 拆章预览/导入；`:87-137` step3 补摘要/AI 蓝图/发起续写（成功 `navigate('/runs/${r.runId}')`）；`:139-142` h1「新建小说（续写）」+ 副标题。组件零 URL 依赖，迁移仅需换挂载路由。
- **F3 书架**：`BooksPage.tsx:9-16` 内联建书（title state + create→`api.createBook`）；`:20-25` h1 行内「设置」Link；`:26-36` 内联「新书标题 + 建书」表单；`:47` 空态「还没有书——先建一本。」。
- **F4 设置**：`SettingsPage.tsx:23-43` GET `/api/settings` 回填；`:45-69` save→PUT；`:71-76` 「← 返回书架」Link。测试 `SettingsPage.test.tsx` 2 用例（渲染断言 :45-56、PUT 契约断言 :58-83），stubFetch（:22-29）仅按 method 区分、**无 `/api/style-profiles` 分支**——收纳分区后组件 useQuery 需 Provider + stub 补分支，否则 GET 返回 settings 对象被当数组 `.map` 崩溃。
- **F5 风格档案**：`StyleProfilesPage.tsx:8` useQuery `['style-profiles']`；`:14-28` distill；`:31-35` 「← 书架」Link；`:37-68` 列表 + 蒸馏表单。测试 1 用例（蒸馏后列表 1→2 行）。
- **F6 绑定现状**：绑定 UI 已在 `BookDetailPage.tsx:7,:63-66,:101`，API 为 `client.ts:76-77` bindStyle——设置分区无需也不应重复。
- **F7 测试基线实测（2026-11-13 重锚，原记录 7 为漏计）**：web **14** 用例 = client 2 + BookDetailPage 1 + BooksPage 1 + NewBookPage 2（拆章交互 + splitChapters 纯函数）+ SettingsPage 2 + StyleProfilesPage 1 + test/t30.test.tsx 5（DiffPage/DashboardPage/SelectionRewrite）；`vite.config.ts:15-17` jsdom 环境；定向测试路径相对 `apps/web/`。shared 2 / server 173（= 0.2 增量链终值，实测全绿）。
- **F8 引用面**：`/new`、`/styles`、`StyleProfilesPage` 全库引用仅 F1 所列两文件 + 其自身测试；`NewBookPage` 另被 `main.tsx:7` import——路径改名零外溢，F3/F4/F5 三个内联返回/入口链接删除均有壳导航接管。

---

## 五、执行顺序（串行，≤1 卡）

**T-01 → T-02 → T-03 → T-04 → T-05 → T-06 → T-07**

新建先行（T-02/T-03 独立成绿）→ 收纳（T-04）→ 切壳换路由 + 删旧页（T-05）→ 书架瘦身（T-06）→ 验证链 + GUI 目验收口（T-07）。任何一环验证失败即停，回退修正后重跑该环。

---

## 六、任务

### 任务 T-01：计划入库 + web 基线锚定（docs-only）

**文件：** 本计划文件 `docs/plans/2026-11-13-web-four-tab-shell.md`（唯一改动）。

**步骤：**
- [x] 实测基线：`pnpm --filter @inkforge/web test` → 记录用例总数（**实测 14**，构成见 F7 重锚；账本已按实测修订，2026-11-13 lint/typecheck/全量 189 全绿佐证）。
- [ ] `git add docs/plans/2026-11-13-web-four-tab-shell.md && git commit -m "docs: web 四 TAB 壳实现计划入库"`。

**验收：** 计划入库；web 基线数字钉死在卡面（14）。

### 任务 T-02：新书占位页 NewBookIdeaPage（路由暂不动）

**文件：** 新增 `apps/web/src/pages/NewBookIdeaPage.tsx`、`apps/web/src/pages/NewBookIdeaPage.test.tsx`。

**接口/决策：** 签名见 D4 表；文案钉值 `以「立项意向书」起步：预设世界观与角色卡 → 生成蓝图 → 全新成书。该流程本期尚未开放。`；表单壳三件：input disabled placeholder `世界观预设（如：修真大陆、末世废土…）`、textarea disabled rows=4 placeholder `角色卡（主角/配角/关系…）`、button disabled 文案 `生成立项蓝图` 且 title=`本期未开放`。

**步骤：**
- [ ] 新建组件（纯静态 JSX，无 state/无 fetch/无 router 依赖）。
- [ ] 新建测试，用例名 `'新书占位页渲染说明文案与禁用表单壳'`，断言要点：getByRole('heading', { name: '新书' }) 存在；getByText(/本期尚未开放/) 存在；世界观预设 input `(as HTMLInputElement).disabled === true`；角色卡 textarea disabled === true；button 生成立项蓝图 disabled === true。
- [ ] 跑 `pnpm --filter @inkforge/web exec vitest run src/pages/NewBookIdeaPage.test.tsx` → 1 passed（纯新增，直接绿验证）。
- [ ] `pnpm --filter @inkforge/web typecheck` → 0 error。
- [ ] commit：`feat(web): 新书 TAB 占位页（立项意向书入口 B 预留，禁用态）`（正文 verify 结果；GUI 未验证，随 T-07 黑盒目验）。

**验收：** web 用例 15；路由表未动（页面尚无挂载点）。

### 任务 T-03：抽出 StyleProfilesSection（列表 + 蒸馏）

**文件：** 新增 `apps/web/src/pages/StyleProfilesSection.tsx`、`apps/web/src/pages/StyleProfilesSection.test.tsx`（旧页/旧测试本任务**不删**，T-05 删）。

**接口/决策：** 签名与差异三点见 D4 表。

**步骤：**
- [ ] 新建组件（搬运 F5 逻辑 + 三差异）。
- [ ] 新建测试：**迁移用例** `'蒸馏表单：提交后列表新增一行'`（自 `StyleProfilesPage.test.tsx:37-61` 逐条保留断言：初始 1 行 → 填 `档案名称` + `'x'.repeat(200)` 样本 → 点 `蒸馏` → fetch 被以 `/api/style-profiles/distill` 调用 → 出现 `新档案` → 2 行）；调整点仅 render 目标组件、去 MemoryRouter 包裹（组件无路由依赖），夹具与 `distilled` 旗标结构原样保留。
- [ ] **新增用例** `'档案列表渲染版本与句长中位数'`：以 PROFILE 夹具（version 1、medianSentenceLen 24）断言 getByText(/v1 ·/) 与 getByText(/句长中位数 24/) 可见。
- [ ] 跑 `pnpm --filter @inkforge/web exec vitest run src/pages/StyleProfilesSection.test.tsx` → 2 passed。
- [ ] typecheck → 0 error。
- [ ] commit：`feat(web): 抽出风格档案分区组件（列表+蒸馏，供设置 TAB 收纳）`（GUI 未验证…）。

**验收：** web 用例 17（+2）；旧 `/styles` 路由行为不变。

### 任务 T-04：设置页收纳风格档案分区（单页双分区）

**文件：** Modify `apps/web/src/pages/SettingsPage.tsx`、`apps/web/src/pages/SettingsPage.test.tsx`。

**接口/决策：** SettingsPage 在既有 message/error 块（现 :132-133）之后渲染 `<StyleProfilesSection />`；「← 返回书架」Link 本任务不动（T-05 与壳同步清理）。

**步骤：**
- [ ] SettingsPage.tsx：import StyleProfilesSection 并插入渲染点。
- [ ] SettingsPage.test.tsx 两处调整（**断言逐字不变、用例数不变**）：① `renderPage()` 增 `QueryClientProvider` 包裹（分区组件 useQuery 依赖，补 import `QueryClient, QueryClientProvider`）；② `stubFetch` 增分支：url 以 `/api/style-profiles` 结尾且非 PUT → `jsonResponse([])`（防 F4 所述 .map 崩溃）。
- [ ] 跑 `pnpm --filter @inkforge/web exec vitest run src/pages/SettingsPage.test.tsx` → 2 passed。
- [ ] typecheck → 0 error。
- [ ] commit：`feat(web): 设置页收纳风格档案管理分区`（GUI 未验证…）。

**验收：** web 用例 17（不变）；`/settings` 直达时两分区同屏渲染。

### 任务 T-05：App 壳重构 + 路由表切换（核心）

**文件：** Modify `apps/web/src/App.tsx`（重写为壳）、`apps/web/src/main.tsx`（路由表）、`apps/web/src/pages/SettingsPage.tsx`（删返回链接）；新增 `apps/web/src/pages/NotFoundPage.tsx`、`apps/web/src/App.test.tsx`；删除 `apps/web/src/pages/StyleProfilesPage.tsx`、`apps/web/src/pages/StyleProfilesPage.test.tsx`。

**接口/决策：** 壳与路由表逐行见 D1/D3/D4；`main.tsx` import 改为 `{ BrowserRouter, Navigate, Route, Routes } from 'react-router'`，删 StyleProfilesPage import（:8）。

**步骤：**
- [ ] 重写 App.tsx 为 AppShell（去 health、NavLink×4（书架加 end）+ Outlet，激活类钉值见 D4）。
- [ ] 新建 NotFoundPage.tsx（health fetch 与展示 JSX 自 App.tsx 原样搬移 + 返回书架 Link）。
- [ ] 重写 main.tsx 路由表为 D3 目标态（逐行核对）。
- [ ] 删 SettingsPage.tsx:73-75 返回书架 Link；若 `Link`/react-router import 随之无引用则一并删除（typecheck 兜底验证）。
- [ ] `git rm apps/web/src/pages/StyleProfilesPage.tsx apps/web/src/pages/StyleProfilesPage.test.tsx`（用例已于 T-03 迁移，账本 −1）。
- [ ] 新建 App.test.tsx 两用例并跑绿：
  1. `'壳渲染四 TAB 且激活态跟随当前路由'`：MemoryRouter initialEntries=['/'] + Routes + `<Route element={<AppShell />}><Route path="/" element={<div>书架占位</div>} /></Route>`；断言四 link href 分别为 `/`、`/new`、`/continue`、`/settings`；书架 link className 含 `font-bold`，设置 link 不含。
  2. `'/styles 重定向至 /settings'`：initialEntries=['/styles']，Routes 内 `/styles`=Navigate(to=/settings, replace)、`/settings`=marker div；断言 marker 可见。
  - 命令 `pnpm --filter @inkforge/web exec vitest run src/App.test.tsx` → 2 passed。
- [ ] web 全量：`pnpm --filter @inkforge/web test` → **18 passed**（17 + App 2 − StyleProfilesPage 1）；特别核对 NewBookPage.test 2 例、SettingsPage.test 2 例仍绿（组件零改动，仅挂载点变化）。
- [ ] typecheck → 0 error。
- [ ] commit：`feat(web): 四 TAB 壳重构（AppShell+Outlet），续写迁 /continue，/styles 重定向设置`（GUI 未验证…）。

**验收：** web 用例 18；`/styles` 重定向；404 页保留健康状态展示；四 TAB 激活态正确。

### 任务 T-06：书架去内联建书表单 + 空态指向续写向导

**文件：** Modify `apps/web/src/pages/BooksPage.tsx`、`apps/web/src/pages/BooksPage.test.tsx`。

**接口/决策：** 删除项见 D5 表（title state、create()、内联表单、设置 Link 及 flex 容器，保留裸 h1）；空态钉值：`还没有书。去 <Link to="/continue" className="text-blue-700">续写向导</Link> 建第一本。`——建书入口唯一化为续写向导 step1（`NewBookPage.tsx:49-61`）。

**步骤：**
- [ ] BooksPage.tsx 按上述删除/改造；确认 `useState`、`api.createBook` 相关 import 随之清理。
- [ ] BooksPage.test.tsx：**删**用例 `'书架页渲染「设置」入口并指向 /settings'`（:24-36；由 T-05 App.test 用例 1 等价覆盖——该用例断言含设置 TAB href=/settings，0.1.1 回归意图由常驻壳根治）；**增**两用例：
  1. `'书架页不再渲染内联建书表单'`：沿用现有全局 fetch stub（全 [] 模式，:8-16）→ render → queryByPlaceholderText('新书标题') 为 null 且 queryByRole('button', { name: '建书' }) 为 null。
  2. `'书架空态提供续写向导入口'`：await waitFor(() => getByText(/还没有书/)) → getByRole('link', { name: '续写向导' }).getAttribute('href') === '/continue'。
- [ ] 跑 `pnpm --filter @inkforge/web exec vitest run src/pages/BooksPage.test.tsx` → 2 passed。
- [ ] web 全量：`pnpm --filter @inkforge/web test` → **19 passed**（终态）。
- [ ] typecheck → 0 error。
- [ ] commit：`feat(web): 书架去内联建书表单，建书入口归一续写向导 step1`（GUI 未验证…）。

**验收：** web 用例 19；书架仅剩列表 + 进入 + 空态链接。

### 任务 T-07：全量验证链 + GUI 黑盒目验 + 收口

**步骤：**
- [ ] `pnpm -w lint` → 0 error。
- [ ] `pnpm -w typecheck` → 全包 0 error。
- [ ] `pnpm -w test` → 全绿；web = 19（= 账本终态，≥ T-01 基线 14）；server 173 / shared 2 与 T-01 记录一致（零改动零漂移）。
- [ ] `pnpm build:web` → vite build 成功。
- [ ] **GUI 黑盒目验**（派 web-gui-tester；目验前先调 lessons）：起 `pnpm dev:server` + `pnpm dev:web`（settings 勾 mock 或 .env 已 mock），清单逐项过并留证：
  1. `/` 书架 TAB 高亮，无建书表单，列表/空态与进入书详情正常；
  2. 依次点击 新书/续写/设置，激活态随路由迁移；
  3. 续写向导三步走通（mock）：建书 → 粘贴文本拆章导入 → AI 建议蓝图 → 发起续写跳 `/runs/:runId`；
  4. `/settings` 双分区：服务连接输入 + 保存出「已保存，重启应用后生效」；风格档案蒸馏（样本 ≥200 字）后列表新增一行；
  5. 地址栏直入 `/styles` → 落 `/settings` 且设置 TAB 高亮；
  6. 未知路径（如 `/nope`）→ 404 页含健康状态与「← 返回书架」；
  7. 从书架进入书详情页，TAB 头常驻可见。
- [ ] 收口 commit（若有目验后微调）：`test(web): 四 TAB 壳黑盒目验通过与验证链收口`（正文 verify: 上述命令结果 + 目验清单；**GUI 已验证**）。

**验收：** 验证链 lint→typecheck→test→build 全绿 + 目验清单 7 项通过；suite 总数 = 194（基线 189 + web 净 +5）。

---

## 七、测试策略：既有用例处置与断言迁移清单（基线只增不减的依据）

| # | 既有用例（文件:行） | 处置 | 调整点 / 等价覆盖 |
|---|---|---|---|
| 1 | BooksPage.test `书架页渲染「设置」入口并指向 /settings`（:24-36） | 删除 | 由 T-05 App.test 用例 1 覆盖（断言含 设置→/settings 且激活态）；0.1.1 回归针对的「页头仅覆盖 fallback 路由」缺陷被常驻壳根治 |
| 2 | NewBookPage.test `拆章预览：粘贴 3 章渲染 3 条且可删一条`（:29-55） | 原样保留 | 组件与测试文件零改动，挂载路由 /new→/continue 不影响 MemoryRouter 渲染 |
| 3 | NewBookPage.test `splitChapters：零章题命中 → 整篇单章`（:57-61） | 原样保留 | 纯函数用例，无路由依赖 |
| 4 | SettingsPage.test `渲染三个输入框与 mock 开关`（:45-56） | 保留 | 调整仅 renderPage 增 QueryClientProvider；断言逐字不变 |
| 5 | SettingsPage.test `填写并提交后以 PUT 调用 /api/settings…`（:58-83） | 保留 | 调整仅 stubFetch 增 `/api/style-profiles`→`[]` 分支；PUT 契约断言（:74-82）逐字不变 |
| 6 | StyleProfilesPage.test `蒸馏表单：提交后列表新增一行`（:37-61） | 迁移至 StyleProfilesSection.test | 断言逐条保留（placeholder/按钮名/行数/fetch URL）；调整仅 render 目标组件、去 MemoryRouter |
| 7 | BookDetailPage.test `original 章渲染「补摘要」按钮…`（:57） | 原样保留 | 深页入壳不改组件；绑定 UI（D5）不动 |

净账：删除 1（#1）+ 迁移保留 1（#6）+ 新增 7（T-02 一、T-03 一、T-05 二、T-06 二）= web 14 → 19。**任何 commit 点用例数不得低于前一 commit 点。**

---

## 八、自审五查结论（计划入库前已执行）

1. **规格覆盖**：owner 五项需求全部映射成任务——TAB 壳→T-05；续写迁入→T-05(/continue)+T-06(入口归一)；新书占位→T-02+T-05(/new)；设置收纳风格档案→T-03+T-04+T-05(壳导航)；书架去表单→T-06；GUI 黑盒→T-07；路由决策唯一选择+理由→D1；断言迁移→第七节。无遗漏。
2. **步骤扫描**：每任务 4-8 个 checkbox，单步 2-5 分钟且带可核对验证命令（定向 vitest / typecheck / git 核对）；每任务以 commit 收尾，T-07 收口验证链；无孤立步骤，无跨任务未声明依赖（T-05 依赖 T-02/T-03/T-04 产物已挂载，串行序保证）。
3. **类型一致**：五个新/改组件签名均无 props（D4 表）；路由表 import 名与文件导出名逐一对应；NavLink className 函数签名、Navigate 用法、WizardState 不动；测试断言的类型窄化（as HTMLInputElement）与既有测试惯例一致；shared 类型零新增零变更。
4. **输入类测试**：输入驱动用例覆盖——蒸馏表单（200 字样本→列表增长，迁移保留）、设置三输入+mock 开关+PUT body 契约（保留）、续写向导书名/粘贴/拆章（保留）、新书占位禁用输入与按钮（新增断言 disabled）、书架表单缺席与空态链接 href（新增）。
5. **比例**：7 任务对应 ~6 个源文件改动 + 4 个测试文件新增/调整 + 2 个删除，测试净增 5 例对净增 UI 约 3 个组件，测试/源码改动比例健康；单任务最大块 T-05 已按步骤拆至逐文件逐断言粒度，无巨型任务。

---

## 九、修订记录（2026-11-13，owner 指令后）

1. **账本重锚**：T-01 实测 web = 14（原预估 7 漏计 `client.test.ts` 2 例与 `test/t30.test.tsx` 5 例），账本全线 +7 重锚为 14 → 19（终态），suite 总数 189 → 194；shared 2 / server 173 实测锚定不变。
2. **T-02 占位页与入口 B 的关系（owner 指令「项目继续推进，直到项目立项时的功能全部落地实现」）**：T-02 占位页仍按本计划落地（路由/壳完整性需要挂载点），随后入口 B 生成模式另立计划将该页升级为真实新书向导——第二节待确认项 1 的「本期只交付占位」就此被 owner 指令覆盖。
3. **执行模式**：本计划由主模型独自执行（owner 本会话明示不外派，同 DEC-2026-1111-04 第 2 条口径），验证链/提交纪律/verification-before-completion 照旧。
