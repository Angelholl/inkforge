# 蒸馏升独立 TAB + 导入选项 实现计划

**目标：** 蒸馏能力升独立 `/distill` 一级 TAB，蒸馏表单新增「本地 txt/md 文件」与「书架选书带章」两种样本导入，纯前端零后端改动。

**架构：** 新页 `apps/web/src/pages/DistillPage.tsx` 承接设置页蒸馏模板分区与 `StyleProfilesSection` 全树（含仿写档案）；新组件 `apps/web/src/pages/BookSamplePicker.tsx` 负责选书带章采样（react-query 门控读取 + 命令式逐章取 current 版本拼接）；`main.tsx`/`App.tsx` 各接一条路由与 rail 项；`SettingsPage` 瘦身至仅模型设置。

**规格：** owner brief 2026-11-15（无独立设计文档）；本文「规格钉」节即规格，随计划走。server 事实（只读引用，禁改）：`apps/server/src/http/routes.ts:656-673`（maxSegments/temperature 已消费）、`apps/server/src/http/schemas.ts:64-69`、`packages/shared/src/api.ts:248-253`。

## 全局约束

- 纯前端：禁改 `apps/server/**` 与 `packages/shared/**`。
- 测试基线 262 只增不减。收口数：不做任务 5 = 269；做任务 5 = 270（新 it 清单见规格钉 10）。
- 类型 `pnpm typecheck` 过；commit 前 `pnpm lint` 过；提交 Conventional 前缀 + 中文描述，正文 `verify:` 注明验证结果。
- UI token 沿用 `index.css` @theme 现有值（bg-primary-soft / text-primary-strong / h-ctl / rounded-ctl / text-ink / text-faint / border-line / bg-surface），不新增 token。
- 测试惯例（照抄现有）：`vi.stubGlobal('fetch', fetchMock)` stub fetch 层（不 vi.mock api 模块）；渲染包 `QueryClientProvider client={new QueryClient()}`，需路由才加 `MemoryRouter`；`afterEach` 里 `cleanup()` + `vi.unstubAllGlobals()`；断言用 `toBeTruthy()`/`getByText` 风格，不引 jest-dom 新 matcher；fetch 分发器参照 `StyleProfilesSection.test.tsx:30-51` 的 `fetchFor` 与 `SettingsPage.test.tsx:14-21` 的 `jsonResponse`。
- 行号锚点均基于当前 HEAD；同文件多处删除按**从底部向顶部**顺序执行以保锚点有效。

## 规格钉（实现者不得自行变更的决策）

1. **数据获取选型 = react-query**：仓库已有 `@tanstack/react-query` v5 且页面读取统一走 `useQuery`（App.tsx:26、StyleProfilesSection.tsx:11、ChapterReaderPage.tsx:11-15）。选书器 books/getBook 用 `enabled` 门控读取；章内容拼接是提交动作，命令式 `await api.listVersions(...)`。
2. **文案与图标**：rail 标签「蒸馏」、图标 `FlaskConical` size 16（lucide-react）；DistillPage h1「蒸馏工作台」，容器 `mx-auto max-w-2xl px-6 py-10`（沿 SettingsPage.tsx:97 惯例）。
3. **重定向**：`main.tsx:35` 的 `/styles` Navigate 改 `to="/distill"`，replace 语义保留。
4. **current 版本判定**：`listVersions` 返回新→旧（apps/server/src/db/repositories/chapters.ts:235-237）。取 current = 优先取 `id === chapter.currentVersionId` 的版本；`currentVersionId` 缺失或无命中取 `versions[0]`；`versions` 为空数组则该章跳过（不产分隔行）。
5. **拼接格式**：每章块 = `【第${chapterNo}章 ${title}】\n${content}`，块间 `'\n\n'` 相接，按 chapterNo 升序；首块同样带分隔行（确定性格式，测试断言精确串）。
6. **章数上限**：`MAX_CHAPTERS = 20`。勾选数达 20 后，其余未勾选 checkbox 置 `disabled` 并渲染提示文案「最多可选 20 章（对齐采样基准）」；恰 20 章可全选且无提示；>20 章的书走同一禁选逻辑（不整书禁入）。对齐 `schemas.ts:68` maxSegments max=20 与 MirrorNovel 采样基准。
7. **文件导入**：`input type="file" accept=".txt,.md"` + `aria-label="导入样本文件"`，FileReader.readAsText 灌入 text state（NewBookPage.tsx:164-174 模式；aria-label 为测试定位所需的新增偏离）。
8. **高级项（任务 5，裁断=做）**：temperature 取值 [0,1]（native `min=0 max=1 step=0.1`）、maxSegments 整数 [4,20]（native `min=4 max=20`）；输入为 string state，空串 = 不传字段（走服务端默认）；不做前端数值钳制，越界由 server schema 400 → 现有「蒸馏失败：」消息链路暴露（schema 是唯一真值，理由见裁量点）。
9. **模板保存防抖**：DistillPage 新增本地 `tplBusy` state，模板按钮 `disabled={tplBusy}`（原实现借用模型表单 `saving` 的行为随迁移废止）。
10. **新 it 清单**（269/270 的来源）：DistillPage.test +2、SettingsPage.test +1、App.test +1、StyleProfilesSection.test +3（任务 3 一个、任务 4 两个）+ 任务 5 一个（做则 +1）。

## 任务 1：蒸馏页建页与设置页瘦身（卡A）

**文件：**
- Create `apps/web/src/pages/DistillPage.tsx`
- Create `apps/web/src/pages/DistillPage.test.tsx`
- Modify `apps/web/src/pages/SettingsPage.tsx`（删 :3 import StyleProfilesSection；删 :22-23 distillTemplate/tplMsg state；删 :42-48 distill-template fetch 分支；删 :54-68 saveTemplate；删 :157-178 蒸馏模板 section；删 :180 `<StyleProfilesSection />`。保留：API_BASE import、模型表单、saving/message/error 逻辑）
- Modify `apps/web/src/pages/SettingsPage.test.tsx`（:26 删 style-profiles stub 分支；追加 1 it）

**接口：**
- Consumes：`API_BASE`（apps/web/src/api/client.ts:44）；`StyleProfilesSection` 默认导出（pages/StyleProfilesSection.tsx:10）。
- Produces：`export default function DistillPage()`（任务 2 路由消费）。

**步骤：**
- [ ] 1.1 写 `DistillPage.test.tsx` 两个 it，跑 `pnpm --filter @inkforge/web test DistillPage` 确认红（模块不存在）：
  - it「渲染蒸馏模板编辑与蒸馏表单」：stub fetch——GET `/api/settings/distill-template` → `{ template: 'DIM 测试模板' }`，GET `/api/style-profiles` → `[]`，其余 URL → `new Response('[]', { status: 200 })`（兜住 ImitationProfilesSection 的 GET `/api/imitation-profiles`）；断言：`await waitFor(() => expect((screen.getByLabelText('蒸馏模板') as HTMLTextAreaElement).value).toBe('DIM 测试模板'))`；`screen.getByPlaceholderText('档案名称')` 在场；`screen.getByText('风格档案')` 在场；`await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/imitation-profiles', expect.anything()))`。
  - it「保存模板 PUT 且提示」：改 textarea 值为「新模板」→ 点「保存模板」→ `waitFor` fetchMock 收到 `PUT /api/settings/distill-template` 且 body `JSON.parse` 后 `{ template: '新模板' }` → `screen.getByText('蒸馏模板已保存')` 在场。
- [ ] 1.2 写 `DistillPage.tsx` 最小实现让上一步绿。结构锚：`import { useEffect, useState } from 'react'` + `import { API_BASE } from '../api/client'` + `import StyleProfilesSection from './StyleProfilesSection'`；state `distillTemplate/tplMsg/tplBusy`；useEffect GET `${API_BASE}/api/settings/distill-template`（失败静默，沿 SettingsPage.tsx:42-48 原样）→ `setDistillTemplate(t.template ?? '')`；`saveTemplate(template: string): Promise<void>` 逻辑与文案照搬 SettingsPage.tsx:54-68（成功「蒸馏模板已保存」/空串「已恢复默认模板」/失败「模板保存失败，请确认服务已连接后重试」，增 tplBusy true/false 包裹）；JSX = `<main className="mx-auto max-w-2xl px-6 py-10">` + `<h1 className="text-2xl font-bold">蒸馏工作台</h1>` + 蒸馏模板 section（textarea `aria-label="蒸馏模板"`、placeholder「（空 = 使用默认模板）」、h-48 沿原样）+ `<StyleProfilesSection />`。→ 定向测试绿。
- [ ] 1.3 SettingsPage 瘦身（按全局约束从底部向顶部删锚点行；h1「设置」保留）→ `pnpm --filter @inkforge/web test SettingsPage` 绿（现有 2 it 不变）。
- [ ] 1.4 SettingsPage.test.tsx：删 :26 style-profiles stub 分支；追加 it「设置页不再含蒸馏分区与风格档案表单」：stubFetch 后断言 `screen.queryByLabelText('蒸馏模板')`、`screen.queryByText('风格档案')`、`screen.queryByPlaceholderText('档案名称')` 均 null。→ 绿。
- [ ] 1.5 `pnpm --filter @inkforge/web test` 全绿（此刻全仓计数应为 265）。
- [ ] 1.6 `pnpm typecheck` 过 → commit `refactor(web): 蒸馏分区迁出设置页至独立 DistillPage`。

## 任务 2：路由与 rail 接线（卡A，依赖任务 1）

**文件：**
- Modify `apps/web/src/App.tsx`（:3 lucide import 加 `FlaskConical`；:35 续写 RailLink 后插一行）
- Modify `apps/web/src/main.tsx`（:9 `import SettingsPage` 行后加 `import DistillPage from './pages/DistillPage';`；:29 settings Route 后加 distill Route；:35 Navigate 改向）
- Modify `apps/web/src/App.test.tsx`（renderShell :22-25 路由表；:35-46 rail it 加断言；:48-51 redirect it 改目标；追加 1 it）

**接口：**
- Consumes：任务 1 的 `DistillPage` 默认导出；现有 `RailLink`（App.tsx:7）。
- Produces：`/distill` 可达、`/styles` → `/distill`、rail 五项（书架/新书/续写/蒸馏 | 设置）。

**步骤：**
- [ ] 2.1 先改 App.test.tsx 确认红（跑 `pnpm --filter @inkforge/web test App`）：
  - renderShell 路由表：`/styles` 的 Navigate 改 `to="/distill"`；新增 `<Route path="/distill" element={<div>蒸馏页标记</div>} />`（`/settings` 占位保留）。
  - rail it（:35-46）追加：`expect(screen.getByRole('link', { name: '蒸馏' }).getAttribute('href')).toBe('/distill');`
  - redirect it（:48-51）改名与断言：`'/styles 重定向至 /distill'` → `renderShell('/styles')` 后 `expect(screen.getByText('蒸馏页标记')).toBeTruthy()`。
  - 追加 it「蒸馏 TAB 激活态跟随路由」：`renderShell('/distill')` → 蒸馏链接 `className` 含 `bg-primary-soft`，书架链接不含。
- [ ] 2.2 App.tsx：:3 改 `import { BookMarked, FilePlus2, FlaskConical, PenLine, Settings } from 'lucide-react';`；:35 后插 `<RailLink to="/distill" label="蒸馏" icon={<FlaskConical size={16} />} />`（工作台组末、系统组 div 之前）。→ `pnpm --filter @inkforge/web test App` 绿。
- [ ] 2.3 main.tsx：:9 后加 DistillPage import；:29 后加 `<Route path="/distill" element={<DistillPage />} />`；:35 改 `<Route path="/styles" element={<Navigate to="/distill" replace />} />`。
  - 已知测试局限：App.test 的 redirect 断言基于测试内复刻的 Navigate，不经过 main.tsx；main.tsx 实际接线由任务 6 GUI 冒烟核验（现状即此格局）。
- [ ] 2.4 `pnpm --filter @inkforge/web test` 全绿（全仓计数 266）→ `pnpm typecheck` 过。
- [ ] 2.5 commit `feat(web): 新增 /distill 一级 TAB，/styles 重定向改指蒸馏页`。

## 任务 3：本地文件导入（卡B）

**文件：**
- Modify `apps/web/src/pages/StyleProfilesSection.tsx`（:149 textarea 之后、:150 蒸馏按钮之前插入 file input）
- Modify `apps/web/src/pages/StyleProfilesSection.test.tsx`（追加 1 it）

**接口：**
- Consumes：`text` state 的 setter（StyleProfilesSection.tsx:13）；NewBookPage.tsx:164-174 的 FileReader 模式。
- Produces：`aria-label="导入样本文件"` 的 file input，灌入后 textarea（placeholder 匹配 `/粘贴风格样本/`）值 = 文件内容（任务 4 与任务 6 冒烟依赖此定位锚）。

**步骤：**
- [ ] 3.1 StyleProfilesSection.test.tsx 追加 it「文件导入 txt 灌入样本框」，跑定向确认红（无该 input）：`fireEvent.change(screen.getByLabelText('导入样本文件'), { target: { files: [new File(['文件样本正文'], 's.txt', { type: 'text/plain' })] } })` → `await waitFor(() => expect((screen.getByPlaceholderText(/粘贴风格样本/) as HTMLTextAreaElement).value).toBe('文件样本正文'))`。
- [ ] 3.2 StyleProfilesSection.tsx 表单态插入（onChange 处理器与 NewBookPage.tsx:167-173 逐字同构：`const f = e.target.files?.[0]; if (!f) return; const reader = new FileReader(); reader.onload = () => setText(String(reader.result ?? '')); reader.readAsText(f);`）→ 绿。
- [ ] 3.3 `pnpm --filter @inkforge/web test` 全绿（全仓计数 267）→ `pnpm typecheck` 过。
- [ ] 3.4 commit `feat(web): 蒸馏表单支持本地 txt/md 样本导入`。

## 任务 4：书架选书带章导入（卡B，依赖任务 3 同文件顺延）

**文件：**
- Create `apps/web/src/pages/BookSamplePicker.tsx`
- Modify `apps/web/src/pages/StyleProfilesSection.tsx`（:5 后加 `import BookSamplePicker from './BookSamplePicker';`；:150 蒸馏按钮之前、file input 之后挂 `<BookSamplePicker onImport={setText} />`）
- Modify `apps/web/src/pages/StyleProfilesSection.test.tsx`（fetchFor 扩展 + 追加 2 it）

**接口：**
- Consumes：`api.listBooks`（client.ts:57）、`api.getBook`（client.ts:58，chapters 无正文）、`api.listVersions(bookId, chapterNo)`（client.ts:131-132，新→旧）；`ChapterDto.currentVersionId?`（packages/shared/src/api.ts:29）。
- Produces：`export default function BookSamplePicker({ onImport }: { onImport: (text: string) => void })`；拼接文本经 `onImport` 灌入父级 text state（`setText` 与 `(text: string) => void` 签名 TS 相容）。

**BookSamplePicker 结构钉：**
- 常量 `const MAX_CHAPTERS = 20;`
- state：`open: boolean`（初 false）、`bookId: string`（初 ''）、`checked: Set<number>`（存 chapterNo，初空）、`error: string`（初 ''）。
- queries：`useQuery({ queryKey: ['books'], queryFn: api.listBooks, enabled: open })`；`useQuery({ queryKey: ['book', bookId], queryFn: () => api.getBook(bookId), enabled: open && bookId !== '' })`。
- 章列表：`[...(book?.chapters ?? [])].sort((a, b) => a.chapterNo - b.chapterNo)`。
- checkbox disabled 条件：`checked.size >= MAX_CHAPTERS && !checked.has(chapterNo)`；达上限时渲染 `<p>最多可选 20 章（对齐采样基准）</p>`。
- `importChapters(): Promise<void>`：`try` 内按升序遍历 checked 章 → `const versions = await api.listVersions(bookId, c.chapterNo)` → 按规格钉 4 取 current → 块按规格钉 5 拼接 → `onImport(joined)` 后 `setOpen(false); setChecked(new Set()); setBookId(''); setError('')`；`catch` → `setError('章节导入失败，请重试')`。
- UI 元素钉（测试与冒烟依此定位）：切换按钮「从书架选书」；select `aria-label="选择书籍"`（option label=`book.title` value=`book.id`）；books 为空渲染文本「书架暂无书籍」不渲染 select；checkbox `aria-label={`选择第${c.chapterNo}章 ${c.title}`}`；导入按钮文案 `` `导入所选 ${checked.size} 章` `` 且 `disabled={checked.size === 0}`；error 渲染 `<p className="mt-2 text-sm text-danger">{error}</p>`。

**测试 mock 钉（fetchFor 扩展）：**
- GET `/api/books` → `[{ id: 'b1', title: '样本之书', description: '', outline: '', createdAt: '', updatedAt: '' }, { id: 'b2', ... 21章书 }]`（b2 同构，title: '长篇之书'）。
- GET `/api/books/b1` → b1 + `chapters: [{ chapterNo: 1, title: '章标题1', currentVersionId: 'ver-old' }, { chapterNo: 2, title: '章标题2' }]`、`runs: []`；GET `/api/books/b1/chapters/1/versions` → `[{ id: 'ver-new', content: '新版正文一' }, { id: 'ver-old', content: '旧版正文一' }]`（新→旧）；`/chapters/2/versions` → `[{ id: 'v2a', content: '唯一正文二' }]`。mock 只含组件读取字段（chapterNo/title/currentVersionId），运行时无类型校验。
- GET `/api/books/b2` → b2 + `chapters: Array.from({ length: 21 }, (_, i) => ({ chapterNo: i + 1, title: \`章标题${i + 1}\` }))`；b2 各章 versions → `[{ id: \`v-${n}\`, content: \`正文${n}\` }]`。

**步骤：**
- [ ] 4.1 先写 2 it 确认红（跑 `pnpm --filter @inkforge/web test StyleProfilesSection`）：
  - it「选书带章：current 版本判定、空章跳过与分隔行拼接」：点「从书架选书」→ select 选 b1 → `waitFor` 出现「选择第1章 章标题1」checkbox → 勾选两章 → 点「导入所选 2 章」→ 断言：textarea 值**精确等于** `'【第1章 章标题1】\n旧版正文一\n\n【第2章 章标题2】\n唯一正文二'`（一次覆盖：current 判定取旧版、currentVersionId 缺失回退 versions[0]、规格钉 5 格式）；fetchMock 收到 `/api/books/b1/chapters/1/versions` 与 `/chapters/2/versions` 调用。
  - it「20 章上限：达 20 后禁选并提示」：选 b2 → 依次勾选第 1-20 章（`fireEvent.click(screen.getByLabelText(\`选择第${n}章 章标题${n}\`))`）→ 断言「选择第21章 章标题21」checkbox `.disabled === true`、`screen.getByText('最多可选 20 章（对齐采样基准）')` 在场 → 点「导入所选 20 章」→ 断言 `(textarea.value.match(/【第\d+章 /g) ?? []).length === 20` 且 `textarea.value` 不含 `第21章`。
- [ ] 4.2 写 BookSamplePicker.tsx（按结构钉）→ StyleProfilesSection.tsx 挂载 → 两 it 绿，既有 6 it 不回归。
- [ ] 4.3 `pnpm --filter @inkforge/web test` 全绿（全仓计数 269）→ `pnpm typecheck` 过。
- [ ] 4.4 commit `feat(web): 蒸馏样本支持书架选书带章导入（≤20 章上限）`。

## 任务 5（可裁）：maxSegments / temperature 高级项

**裁断 = 做。** 理由：shared 类型已含字段（api.ts:248-253）、server schema 已消费（routes.ts:663,670），前端仅需两个 number input + body 条件展开，成本约 15 行实现 + 1 it；收益为解锁采样条数与温度控制。独立成任务，裁掉不影响卡A/卡B其余任务；若执行中发现实现超 30 行（不含测试）即裁，裁则收口基线为 269。

**文件：**
- Modify `apps/web/src/pages/StyleProfilesSection.tsx`（:25 distill 调用扩展；表单态蒸馏按钮之前加一行两个 input）
- Modify `apps/web/src/pages/StyleProfilesSection.test.tsx`（追加 1 it）

**接口：**
- Consumes：`api.distillStyle(body: DistillStyleBody)`（client.ts:151-152）；schema 钳制事实 `temperature: number 0-1 optional`、`maxSegments: int 4-20 optional`（schemas.ts:67-68）。
- Produces：无下游消费者（叶子交互）。

**结构钉：**
- state：`maxSegments: string`、`temperature: string`（均初 ''）。
- input：`type="number"`，aria-label 分别「采样段数（4-20，留空默认）」「采样温度（0-1，留空默认）」，native `min`/`max`（temperature 另加 `step="0.1"`）；不做 onChange 钳制（规格钉 8）。
- :25 调用改：
  ```ts
  const r = await api.distillStyle({
    name: name.trim(),
    text,
    ...(maxSegments.trim() !== '' ? { maxSegments: Number(maxSegments) } : {}),
    ...(temperature.trim() !== '' ? { temperature: Number(temperature) } : {}),
  });
  ```

**步骤：**
- [ ] 5.1 追加 it「高级项随蒸馏提交、留空不传键」确认红：填名称 + 样本 + 采样段数 `7` + 采样温度 `0.5` → 点「蒸馏」→ 从 fetchMock 取 `/api/style-profiles/distill` 的 POST body 断言 `body.maxSegments === 7`、`body.temperature === 0.5`；再清空两输入重新蒸馏，断言 body 无 `maxSegments`/`temperature` 键。
- [ ] 5.2 按 结构钉 实现 → 绿，既有 it 不回归。
- [ ] 5.3 `pnpm --filter @inkforge/web test` 全绿（全仓计数 270）→ `pnpm typecheck` 过。
- [ ] 5.4 commit `feat(web): 蒸馏暴露 maxSegments/temperature 可选高级项`。

## 任务 6：收口核验（依赖全部先行任务）

**文件：** 无代码改动（若前任务有修正则随对应任务 commit）。

**步骤：**
- [ ] 6.1 `pnpm test` 全仓绿，总数核对：做任务 5 = 270、裁任务 5 = 269（均 ≥262 基线，只增不减）。
- [ ] 6.2 `pnpm typecheck` 过；`pnpm lint` 过。
- [ ] 6.3 GUI 黑盒冒烟（AGENTS.md GUI 变更要求；目验前先调 lessons）：`pnpm dev:server` + `pnpm dev:web`，核验 5 点——rail 出现「蒸馏」TAB 且激活态正确；`/distill` 渲染蒸馏模板 + 风格档案 + 仿写档案；浏览器直入 `/styles` 落在 `/distill`；文件导入灌入 textarea；选书带章达 20 章后禁选 + 提示。提交信息注明「GUI 已验证」。
- [ ] 6.4 若 6.3 发现偏离：回报执行者修正（对应任务补 commit），不扩卡。

## 自审五查记录

1. **规格覆盖**：brief 点1/点2 → 任务 1+2；点3a → 任务 3；点3b → 任务 4；点4 → 任务 5（裁断做）；设置页瘦身/重定向/测试钉逐条落在任务 1/2 步骤。无缺口。
2. **步骤扫描**：每步 = 动作 + 定向命令 + 红绿或计数核对；组件与处理器只给签名/结构锚/逐字同构引用，未抄函数体；无 TBD/「适当处理」死行。
3. **类型一致**：`onImport: (text: string) => void` ↔ `setText` 相容；queryKey `['books']`/`['book', bookId]` 与仓库 `['versions', bookId, no]` 惯例同形；`DistillStyleBody` 可选字段条件展开与 schemas.ts:67-68 钳制一致。
4. **输入类**：>20 章书（it C）、章无版本跳过（it B ch2 无版本变体并入 current 判定断言）、currentVersionId 缺失回退（it B）、空书架与空文件导入 → 行为钉死（「书架暂无书籍」/灌空串）由任务 6 冒烟覆盖，不建 it（纯展示分支，理由已录裁量点）。
5. **比例**：计划以决策与测试钉为主，无成段实现代码；唯一代码块为任务 5 的 body 展开（签名+测试定不了的展开语义）。
