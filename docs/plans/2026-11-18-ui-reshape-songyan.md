# 墨炉 UI 重塑「松烟」实现计划

**目标：** 按 docs/design/ui-reshape-proposals-2026-11-18.md 提案 A「松烟」全量重塑 apps/web UI——token 值全换、组件库加法升级、全部页面迁移、书详情锚点分区、阅读页沉浸排版；测试零改动通过。
**架构：** Tailwind 4 `@theme` 单一真值源（值换名不换）→ 新增 Field/DataTable/EmptyState/Section 四个样式壳组件 → 页面逐页替换裸表单/裸表格/手写状态色；不碰 Button class 串与任何 data-testid。
**规格：** docs/design/ui-reshape-proposals-2026-11-18.md（§2 基础设施 + §3 提案 A）；owner 拍板 D1=A、D2=捆绑宋体两字重、D4=锚点分区、D3=#F7F6F3、D5=接受缓解。

## 全局约束（违反即返工）

1. **测试钉串红线（评议员修正案：协议改写）**：不准改「被测试逐字断言的 class 串」——Button 全部变体/尺寸/状态串（ui.test 钉）、RailLink 激活串含 `bg-primary-soft`、品牌区独立文本节点 `inkforge`（App.test:47）、章节版本 chip 的 quiet+active 形态（含 `rounded-ctl`、非 `bg-primary text-white`）、NewBookPage 拖放区字面 `rounded border-dashed`、**BooksPage 空态 Link「续写向导」+文案含「还没有书」**（BooksPage.test:46-47）、全部 data-testid（console/qc-panel-empty/qc-panel/diff-added/diff-removed/report-table/selection-rewrite）。测试未钉的面（Badge/Chip 圆角、h1 档位、非钉 hover 串）可改。
2. **色板（@theme 值，含评议员修正）**：bg #F7F6F3 / surface #FFFFFF / line #E7E4DE / line-strong #D6D2C9(新) / **line-control #948E83(新·评议员 HIGH_RISK 修正，控件边界 3.25:1)** / ink #1F1D19 / muted #6E6A63 / faint #A6A199 / primary #26231F / primary-strong #141210 / primary-soft #ECE9E3 / accent #DE5A1F(新) / accent-soft #FBE9DD(新) / accent-strong #9C3A10(新) / ok #267A3E+soft #E2F1E4 / **warn #8A6000(评议员修正，warn-soft 上 4.79:1)**+soft #F7EDCF / danger #B3261E+soft #F7E2DE / console-bg #191613 / console-1..5 #EAE6DF #918B81 #F28A6E #E8B45C #85CB90 / radius-ctl 6px / radius-card 10px / radius-pill 999px(新) / height-ctl 36px 不变 / shadow-overlay(新) 0 1px 2px rgba(31,29,25,.06), 0 8px 24px rgba(31,29,25,.10)。
3. **字体栈（评议员修正：Noto-first， lining 数字一致）**：sans=`'Segoe UI Variable Text', 'Segoe UI', 'Microsoft YaHei', 'PingFang SC', system-ui, sans-serif`；display=`'Noto Serif SC', Georgia, 'Source Han Serif SC', 'SimSun', serif`；mono=`'Cascadia Code', 'Cascadia Mono', Consolas, 'Courier New', monospace`。**捆绑 `@fontsource/noto-serif-sc` 400+600 两档**（实现期修正：阅读正文 400 必需，仅捆 600 会让长文渲染 SemiBold；与 owner 批准的「两字重」体积等量、功能覆盖正文+标题；owner 选项字面 SemiBold+Bold 的偏离裁决，完成通知明示）；装后核验 @font-face 带 font-display:swap 且无 local()（已核：101 块全 swap、0 local()）；node_modules 包内 LICENSE 拷贝至 apps/web/public/fonts/ 随包分发（OFL，已拷）。
4. **字号/字重规则（评议员修正：按钮维持 font-medium）**：正文 400、标题 600、按钮维持基类 font-medium 不动（雅黑无 500/600 档，600 会整字渲染 Bold 过重——设计规格 §2.7「按钮 600」条款由本裁决取代）；全站禁 700+ 中文标题（display 600 上限）；页面 h1=text-xl font-semibold；节标题 text-base font-semibold；大分区 text-lg font-semibold；阅读正文 text-[17px] leading-[2] font-display；中文不加 letter-spacing。
4a. **语义色使用规则（评议员修正）**：accent 三档只做点/线/图形与 accent-soft 底，**<18px 文字一律 accent-strong**；状态徽标永远带文字标签（色彩只是辅助通道，needs_human/failed 同表相邻场景靠文字区分）。
5. **形状/深度**：三档圆角 ctl6/card10/pill；全 1px 边框；卡面零阴影；唯一 shadow-overlay 给浮层；裸 `rounded border`（无色值）清零——唯一例外 NewBookPage/StyleProfilesSection 拖放区保留字面 `rounded border-dashed`（测试钉），但补 `border-line` 色值。
6. **行为冻结**：不改任何 onChange/onSubmit/查询/路由逻辑；不动 aria-label；不加请求（rail 存活点消费既有 health 查询）；锚点条纯样式+IntersectionObserver 高亮。
7. **测试基线 417 只增不减**；验证链顺序=typecheck→lint→定向→全量→build 冒烟→audit --prod 比基线。
8. 提交三段：T1-T3 基座一提交、T4-T8 页面一提交、T9-T10 复杂页一提交（Conventional+中文正文，注 GUI 未验证）。

## 任务 1：设计系统基座（index.css + 字体）

**文件：** Modify apps/web/src/index.css（全量重写 @theme 块）；Modify apps/web/src/main.tsx（+2 行字体 import）；Modify apps/web/package.json（+@fontsource/noto-serif-sc）
**接口：** Produces 全部 token 名（后续所有任务消费）；`.ember-dot` 类（T8/T9 消费）
**步骤：**
- [ ] `pnpm --filter @inkforge/web add @fontsource/noto-serif-sc`（若下载 <200KB/s 持续 30s → 跑 v2rayn-fastest.ps1 后重试；再败改方案 B：jsDelivr 拉 600.css+切片落 public/fonts/，CSS 本地 @font-face）
- [ ] index.css `@theme` 按约束 2 全表替换值 + 追加 7 个新 token（--color-line-strong/--color-line-control/--color-accent 三件套/--font-display/--font-mono/--radius-pill/--shadow-overlay）；--font-sans/display/mono 按约束 3 逐字替换
- [ ] index.css 追加：`:root { color-scheme: light }` 保留、body 不动、`::selection { background: var(--color-primary-soft); }`、全局 `:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }`（评议员修正：链接/卡片键盘焦点）、`html { scroll-behavior: smooth }` + reduced-motion 下 auto、`@keyframes ember-breathe { 50% { opacity: .35 } }`、`.ember-dot { width:6px; height:6px; border-radius:9999px; animation: ember-breathe 2.4s ease-in-out infinite; }` + `@media (prefers-reduced-motion: reduce) { .ember-dot { animation: none } }`
- [ ] main.tsx 在 `import './index.css'` 前插入 `import '@fontsource/noto-serif-sc/600.css';`（仅 600，评议员修正）；核验 600.css 的 @font-face 含 `font-display: swap` 且不含 `local(`
- [ ] `cp node_modules/@fontsource/noto-serif-sc/LICENSE apps/web/public/fonts/`（先 mkdir public/fonts）
- [ ] 核对：`pnpm --filter @inkforge/web typecheck` 零错；`grep -c "3b82f6\|e5e7eb\|111827\|0f172a" apps/web/src/index.css` = 0（旧值清零）

## 任务 2：组件库升级（ui.tsx 加法 + 四新组件）

**文件：** Modify apps/web/src/components/ui.tsx（Badge/Chip/runStatusTone）；Create apps/web/src/components/Field.tsx / DataTable.tsx / EmptyState.tsx / Section.tsx
**接口：** Produces——`BadgeTone` 增 `'inflight'`；`runStatusTone('running'|'queued')→'inflight'`（paused 仍 warn，其余不动）；Field 常量 `fieldLabel/fieldHelp/fieldError/inputBase/textareaBase/selectBase/checkboxBase/numberBase`（规格 §2.2 逐字）；`<DataTable>` 接受 table 透传 props（含 data-testid）；`<EmptyState icon title hint action?>`；`<SectionHeader title action?>`、`CardHeader`（规格 §2.4）
**步骤：**
- [ ] ui.tsx：BadgeTone 加 'inflight'，BADGE_TONES 增 `inflight: 'bg-accent-soft text-accent-strong'`；Badge 圆角 `rounded-ctl`→`rounded-[4px]`，tone 串不动；Chip 圆角 `rounded-ctl`→`rounded-full`，idle 串追加 ` border border-line`（active 串不动）；runStatusTone：`running/queued→'inflight'`，paused→'warn'，done/failed/cancelled 不变；`'info'` tone 保留不删；BUTTON_BASE 追加（加法，评议员修正：按压反馈）` active:brightness-95`
- [ ] Field.tsx 常量（评议员 HIGH_RISK 修正版——边界用 line-control、焦点改 outline）：
  - `inputBase = 'h-ctl w-full rounded-ctl border border-line-control bg-surface px-3 text-sm text-ink placeholder:text-faint transition-colors duration-150 hover:border-ink/50 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary'`
  - `textareaBase = 'min-h-24 w-full rounded-ctl border border-line-control bg-surface p-3 text-sm text-ink leading-6 placeholder:text-faint transition-colors duration-150 hover:border-ink/50 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary'`
  - `selectBase = 'h-ctl rounded-ctl border border-line-control bg-surface px-2.5 text-sm text-ink transition-colors hover:border-ink/50 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary'`
  - `checkboxBase = 'size-4 accent-primary'`；`numberBase = inputBase + ' tabular-nums'`；`fieldLabel = 'text-xs font-medium text-muted'`；`fieldHelp = 'mt-1.5 text-xs text-faint'`；`fieldError = 'mt-1.5 text-xs text-danger'`
  - `<Field label htmlFor help error children>`（space-y-1.5 垂直式）
- [ ] DataTable.tsx：外层 `overflow-hidden rounded-card border border-line bg-surface` > table `w-full text-sm`（rest props 落 table 元素）；约定 thead 行 `border-b border-line bg-bg/60 text-left text-xs text-muted` th `px-4 py-2.5 font-medium`；tbody 行 `border-b border-line/60 transition-colors last:border-0 hover:bg-bg/50` td `px-4 py-2.5`（数字列 tabular-nums）——以导出常量 `dataTableHead/dataTableRow/dataTableCell` 提供，页面拼装
- [ ] EmptyState.tsx：`rounded-card border border-dashed border-line-strong bg-surface/50 px-6 py-10 text-center` + 图标 20 text-faint + 说明 text-sm text-muted + 可选 action（**action 传 ReactNode；BooksPage 必须传 Link 续写向导**）
- [ ] Section.tsx：`SectionHeader`（flex items-center gap-2.5 + 标题档位 + ml-auto 动作位）、`CardHeader`（flex items-center justify-between border-b border-line px-4 py-3）
- [ ] Create apps/web/src/design/tokens.test.ts：读 index.css 正则提取 token hex，纯函数算 WCAG 对比度，断言——ink/bg ≥7、muted/bg ≥4.5、muted/surface ≥4.5、line-control/surface ≥3、line-control/bg ≥3、ok/ok-soft ≥4.5、warn/warn-soft ≥4.5、danger/danger-soft ≥4.5、accent-strong/accent-soft ≥4.5、primary-strong/primary-soft ≥4.5（评议员验证建议采纳：长期防「换色换出不可见」）
- [ ] `pnpm --filter @inkforge/web test -- ui.test tokens.test` 绿

## 任务 3：AppShell 品牌区与导航

**文件：** Modify apps/web/src/App.tsx
**接口：** Consumes T1 token；Produces rail 结构（T9 不动壳）
**步骤：**
- [ ] 品牌区：`墨炉`（font-display text-[22px] font-semibold text-ink）+ 独立 `<div>inkforge</div>`（font-mono text-xs text-faint）——inkforge 必须是独立文本节点
- [ ] 分组标签：工作台→`创作`（书架/新书/续写），新增 `工坊` 组（蒸馏），系统组（设置）不动；五个 NavLink 文案/路由/图标冻结，nav 图标 strokeWidth={1.8}
- [ ] RailLink 激活态追加（加法，评议员修正：墨晕对纸底仅 1.12:1，左标加粗到 3px 承担激活识别）：active 时加 `border-l-[3px] border-l-primary rounded-l-none`——既有 `bg-primary-soft font-semibold text-primary-strong` 串保留
- [ ] 底部版本行加存活点：`<span className={health ? 'bg-ok' : 'bg-faint'} + ' inline-block h-1.5 w-1.5 rounded-full' />`（消费既有 health 查询，无新请求）
- [ ] `pnpm --filter @inkforge/web test -- App.test` 绿

## 任务 4：书架 BooksPage

**文件：** Modify apps/web/src/pages/BooksPage.tsx
**步骤：**
- [ ] Card 加书脊：`border-l-[3px] border-l-ink/70`（加在 Card className）；书名 Link 改 `font-display text-lg font-semibold text-ink hover:text-primary-strong`
- [ ] 底部流程 Badge 改 pill Chip 组或保留 Badge（用 Chip idle/active 语义）——以「世界观→人物→蓝图→生成→校对」文字不动为前提
- [ ] 空态换 EmptyState：**hint 内联保留 Link `续写向导`（href=/continue）且文案含「还没有书」**（BooksPage.test:46-47 钉）——`hint={<>还没有书。去 <Link to="/continue" className="text-primary-strong">续写向导</Link> 建第一本。</>}`
- [ ] BooksPage.test 绿

## 任务 5：设置页两栏化

**文件：** Modify apps/web/src/pages/SettingsPage.tsx
**步骤：**
- [ ] 表单行两栏：`grid grid-cols-[160px_minmax(0,1fr)] items-center gap-3`，label 用 fieldLabel；4 处 input 换 inputBase/numberBase；「服务未连接」warn 框换 `rounded-card border border-warn/30 bg-warn-soft px-3 py-2 text-sm text-warn`
- [ ] 质量 section 用 SectionHeader(text-lg) + Field；message/error 行用 text-ok/text-danger text-sm
- [ ] SettingsPage.test 绿（零 class 断言，纯 typecheck+测试通过）

## 任务 6：向导两页（新书/续写）

**文件：** Modify apps/web/src/pages/NewBookPage.tsx、NewBookIdeaPage.tsx
**步骤：**
- [ ] 全部裸 `rounded border px-3 py-2` 输入件换 inputBase/textareaBase/numberBase；人物卡行 `rounded border px-3 py-2` 容器换 `rounded-card border border-line bg-surface px-3 py-2`
- [ ] 拖放区（两页 file label）保留字面 `rounded border border-dashed`，补 `border-line` 并 hover 串改 `hover:border-line-strong hover:bg-primary-soft/40`
- [ ] 错误框：`rounded border border-danger bg-danger-soft px-3 py-2 text-sm text-danger`（保留 border-danger 语义，NewBookPage.test 钉 `border-dashed`+`text-danger` 不受影响）
- [ ] 拆章预览行容器换 `rounded-card border border-line bg-surface px-3 py-2`
- [ ] NewBookPage.test + NewBookIdeaPage.test 绿

## 任务 7：蒸馏三件

**文件：** Modify apps/web/src/pages/DistillPage.tsx、StyleProfilesSection.tsx、ImitationProfilesSection.tsx
**步骤：**
- [ ] DistillPage：容器 max-w-2xl→max-w-5xl 统一列宽（P2）；h2 档位对齐约束 4；模板 textarea 换 textareaBase+font-mono；h1 text-xl font-semibold
- [ ] StyleProfilesSection：档案列表 li→`rounded-card border border-line bg-surface px-4 py-3`；空态换 EmptyState；表单 11 处裸 border→Field 常量；草稿预览容器 `rounded-card border border-line bg-bg p-3`；拖放区同任务 6 处理
- [ ] ImitationProfilesSection：列表/表单同上；style 内联 `background: '#F3F4F6'` → `bg-bg` 类（杀硬编码色）
- [ ] DistillPage.test 绿（保存模板按钮 bg-primary+h-ctl 不动）

## 任务 8：运行两页 + aside 运行卡

**文件：** Modify apps/web/src/pages/RunPage.tsx、DashboardPage.tsx、components/RunAsideCard.tsx
**步骤：**
- [ ] RunPage：statusBadge 函数删掉，改用 Badge+runStatusTone（inflight→accent）；表头状态徽标旁加 `.ember-dot bg-accent`（仅 run.status 为 running/queued 时渲染）；步骤表换 DataTable（步/run id 列 font-mono text-[13px]，轮/状态列 Badge）；容器 max-w-4xl→max-w-6xl
- [ ] DashboardPage：表换 DataTable，data-testid="report-table" 透传到 table 元素；数字列 tabular-nums；容器 max-w-6xl
- [ ] RunAsideCard：列表 Badge 用 runStatusTone（inflight 自动 accent）；控制台 header 处 latest run 为 running/queued 时加 `.ember-dot bg-accent`；VersionQcPanel 不动
- [ ] 无 RunPage.test → typecheck+全量兜底

## 任务 9：书详情页（大）

**文件：** Modify apps/web/src/pages/BookDetailPage.tsx（834 行全量重排骨架，逻辑零改动）
**步骤：**
- [ ] 先读 BookDetailPage.test.tsx 全文，列出会被新 DOM 影响的查询（getByRole name 冲突），锚点条文案避开冲突名
- [ ] 动作行收敛（L2）：整书生成=唯一 primary；质量轮数 select 配 fieldLabel 可见标签（已有）+selectBase；刷新改 quiet 图标钮（RefreshCw 16）aria-label 保留「刷新」；导出=select+按钮一组 `inline-flex items-center gap-2`（逻辑不动）
- [ ] 七节锚点分区（评议员 R4/R6 修正全采纳）：锚点条 `sticky top-0 z-10 -mx-8 border-b border-line bg-bg/85 px-8 py-2 backdrop-blur`（内容列内 sticky，祖先无 overflow-hidden/auto）；7 个锚点=**纯文本 `<a href="#sec-x">`**（禁 aria-label 节名——与 textarea getByLabelText 撞车，评议员反例二；链接名用 设定/大纲/伏笔/人物卡/风格/章节/蓝图，已核与全部测试查询无冲突）；各 section 包 `<Card className="scroll-mt-16">` + CardHeader；**滚动跟随用 scroll 监听+rAF 节流+getBoundingClientRect（禁 IntersectionObserver——jsdom 无此 API 会 720 行全红，评议员反例四）**；首屏无命中高亮首锚、触底高亮末锚；实现收敛在组件内 useEffect
- [ ] Field 化 15 处裸 border（世界观/大纲 textarea→textareaBase、人物卡行/编辑框→inputBase、章号/字数→numberBase、蓝图 JSON textarea→textareaBase+font-mono）；OutlineTreeSection/ForeshadowingsSection 裸 border 同步 Field 化、根容器对齐 Card 形态（其测试仅查询文本/label/按钮名，容器重塑安全已核）
- [ ] 人物卡/伏笔/章节状态手写色统一 Badge（C6）：章节状态 span→Badge(done=ok/needs_human=warn/其他 muted)；下线章号 number input→numberBase
- [ ] aside sticky + 断点修正（评议员 R6：Tauri 默认窗 1280 含边框后 xl 不触发——正是现状 L3 缺陷根源）：aside 网格 `xl:grid-cols-[…]`→`lg:grid-cols-[minmax(0,1fr)_340px]`；aside `lg:sticky lg:top-6`；RunAsideCard 内运行列表 Badge 语义已由 T8 承接
- [ ] 页头：书名 h1→`font-display text-[22px] font-semibold`；chip 条保留 Chip；「← 书架」Link 保留
- [ ] BookDetailPage.test 720 行零改动全绿（本任务硬门）

## 任务 10：阅读沉浸 + diff

**文件：** Modify apps/web/src/pages/ChapterReaderPage.tsx、DiffPage.tsx、NotFoundPage.tsx（顺手）
**步骤：**
- [ ] 阅读页容器 max-w-4xl→`max-w-[42rem]`；章名 h1→`font-display text-xl font-semibold`；正文 article→`bg-surface px-2 py-4 text-[17px] leading-[2] font-display`（去边框 rounded/border/bg-white→纯面）；版本链与选段重写移到正文之下（DOM 顺序调整，组件与按钮文案不动）；「导出全书正文（TXT）」按钮文案冻结（DEC-2026-1118-01 测试钉）
- [ ] 工具区（回滚/导出/版本链/选段重写）包 Card 置正文后；diff 链接保留 text-primary-strong
- [ ] DiffPage：正文容器同沉浸形态；added span→`bg-ok-soft/60 border-l-2 border-ok` removed→`bg-danger-soft/60 border-l-2 border-danger line-through`（testid 不动）
- [ ] NotFoundPage：h1 墨炉 加 font-display（对齐品牌）
- [ ] ChapterReaderPage.test + SelectionRewrite.test 绿

## 任务 11：验证链 + 截图自评 + 提交

**步骤：**
- [ ] `pnpm typecheck`（全 workspace 零错）→ `pnpm lint`（零输出）→ 定向 `pnpm --filter @inkforge/web test`（web 98 全绿）→ 全量 `pnpm test`（基线 417 只增不减）→ `pnpm build:web` 冒烟 + `pnpm -r audit --prod`? （audit 走 pnpm -r --if-present；零新增）
- [ ] 隔离环境（已起：8791/5199）重截同机位截图，**两档尺寸各 9 张（1440×1000 + 1280×820 默认窗口——评议员验证建议：验收 lg 断点下 aside/锚点条形态）**（tools/shot.mjs），对照旧图自查：裸边框清零/墨色主色/控件边界可辨（line-control）/锚点条/阅读排版；反例自检（暖纸+宋体+橙模板感）与灰度 sanity；发现违和就地修（frontend-design 自评环节，不替代 owner 验收；CVD 模拟列 owner 实测观察项）
- [ ] 三段提交（基座/页面/复杂页），每段：secret 扫描→commit（Conventional+中文+verify: 验证结果+GUI 未验证（owner 真实测试））→push 前远程核对（本轮 owner 令不外推则只 commit 不 push，收口时问 owner）
- [ ] 决策归档 docs/decision-log.md（DEC-2026-1118-02：owner 拍板 D1-D5+执行留痕）

## 自审五查记录

1. 规格覆盖：报告 §1 审计 24 条的修复落点——T1(token/字体) T2(C1/C3/C4/C5/C6/P3/P4) T3(Q1) T4(P1/P4/Q3) T5(C3/L5) T6(C1) T7(C1/P2) T8(C5/C6/L4/Q4) T9(L1/L2/L3/L5/P3) T10(P5/Q1)——全覆盖，无缺口。
2. 步骤唯一性：每步落点文件+精确 class 串来源（规格行号），实现者只有一种合理写法；IntersectionObserver 实现收敛在 T9 组件内（唯一自由度=IO 阈值，钉 0.1）。
3. 类型一致：BadgeTone 加 'inflight' 后 runStatusTone 返回类型不动；DataTable 以常量+组件双形态提供，T8/T9 消费同一套。
4. 输入类咬人点：①BookDetailPage.test 查询名冲突→T9 首步读测试排雷（死行禁令例外：该步产出排雷清单入实现备注）；②字体包下载失败→T1 步内含方案 B；③select 元素 selectBase 无 focus ring→规格 §2.2 原文如此，保持；④Chip idle 加 border 后 ChapterReader idle 断言 `!bg-primary-soft` 仍真；⑤EmptyState action 传 Link 时 a 内嵌按钮禁——设计为传 ReactNode 由调用方保证。
5. 比例：本计划 ~120 行 vs 规格 514 行，无代码块抄写（class 串引用规格行号不复制全文，约束节例外=真值必须逐字）。
