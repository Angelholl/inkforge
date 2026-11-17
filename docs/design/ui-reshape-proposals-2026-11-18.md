# 墨炉 InkForge UI 重塑设计提案（2026-11-18）

> 状态：设计提案（只读卡产物，待 owner 拍板后转实现卡）。
> 证据基线：`I:/inkforge/artifacts/ui-reshape/shots/01..09.png`（1440x1000）+ `apps/web/src` 源码（引用均带 path:line）。
> 硬约束：浅色单主题；Tailwind 4 `@theme` 机制保留（值全可换，token 名尽量保留）；vitest 对语义 class 的字面断言不断（§6）；**现代化第一诉求**；技术栈不动（React 19 + Tailwind 4 + lucide-react + Vite 7）；桌面 WebView2、无网络字体。

---

## 0. 结论先行

**推荐：提案 A「松烟」。** 排序 A > B > C，理由四条：

1. **在根因上解决「管理后台感」**：后台感的最大来源是默认蓝主色（Tailwind blue-500/600 原值，index.css:18-20）。A 把 primary 换成松烟墨色（实底墨按钮 + 墨色文字链），主色即品牌，这是三个方向里唯一不靠「换一个彩色」而是「取消彩色依赖」的方案；
2. **零语义色冲突**：primary=中性墨后，ok/warn/danger/info 四组语义色全部保住原有色相与用户直觉，不用为 accent 让路；
3. **名字即方案**：「墨炉」二字本身=墨（书卷）+ 炉（流水线）。A 用墨色承担书卷气、用「炉火」状态色承担工业化——运行中的 run 泛炉火橙、完成即出炉转绿。这个状态语言只有叫「墨炉」的中文创作工具能 claim；
4. **迁移最便宜**：对测试与组件结构的改动面最小（见 §6，7 个测试文件可零改动通过）。

B「青瓷」适合 owner 想要更柔、更「器物」的气质；C「铸字」适合想让流水线气质压倒书卷气。三案共用 §2 基础设施（Field/DataTable/EmptyState/壳层），差异集中在 token 值、字体、形状语言与标志性瞬间。

**迁移总原则（三案通用）：`class 名集合只增不改、值全部在 @theme 换、页面只换容器与表单皮肤`。** Button 的 class 串被 ui.test.tsx 逐字钉死（§6.1），恰好说明：气质差异可以完全由 token 值承担，组件层零破坏。

### [DECISION_NEEDED] 待 owner 拍板

| # | 决策点 | 选项与权衡 | 推荐 |
|---|---|---|---|
| D1 | 方向选择 | A 松烟 / B 青瓷 / C 铸字（§3-§5） | A |
| D2 | 中文显示字体是否捆绑 | 不捆绑（零成本，标题用雅黑 600）；捆绑 Noto Serif SC 切片 woff2 SemiBold+Bold（约 4.4-6MB，书卷气立现，见 §2.6） | 捆绑两字重（桌面本地加载，一次性体积，收益全局） |
| D3 | A 案纸色温度 | `#F7F6F3`（微暖纸白）或 `#F6F6F5`（近中性，与被禁奶油底距离最大） | `#F7F6F3`（§3.8 有与反例的色距论证） |
| D4 | 书详情 IA | 锚点分区（测试零改动）/ 标签页（更紧凑，BookDetailPage.test 720 行需改） | 锚点分区（§3.5） |
| D5 | 炉火橙 vs danger 红的邻近性 | A/C 案引入炉火/铸铜暖色承担「运行中」，与 danger 深红存在色相邻近；缓解=状态永远成对出现图标+文字、danger 加深至胭脂红域 | 接受（§3.7 披露） |

---

## 1. 现状审计（结论先行式清单）

### 1.1 token 层缺陷

| # | 缺陷 | 证据 |
|---|---|---|
| T1 | 中性色全是 Tailwind 默认冷灰：bg `#f3f4f6` / line `#e5e7eb` / ink `#111827` / muted `#6b7280` / faint `#9ca3af` 五值皆为 gray 系默认档——「默认值即无人选择」，无任何品牌倾向 | index.css:11-16 |
| T2 | primary 三件套 `#3b82f6/#2563eb/#dbeafe` = blue-500/600/100 默认值，是全站「通用后台蓝」的直接根源 | index.css:18-20；截图 01/02/03/05 蓝色按钮与高亮 |
| T3 | 单一字体族打天下：只有 `--font-sans`（index.css:41-42）；无 display/mono token，页面 `font-mono` 走 Tailwind 默认栈，未显式落到 Windows 的 Cascadia/Consolas；正文阅读档（长文）无定义 | index.css:41-43；BookDetailPage.tsx:819（蓝图 JSON textarea font-mono）、RunPage.tsx:61 |
| T4 | 形状/深度层缺失：圆角只有 ctl 8px / card 16px 两档，无 pill 档（chips/badges 只能借用 ctl）；无 overlay 阴影 token，浮层无规范 | index.css:36-39 |
| T5 | 已识别未落地的 token 缺口：line-strong（hover 线色）、height-ctl-sm、primary-deep 在 Button 规范 §0.2 列为 backlog，至今未建 | docs/design/spec-button-subtrans-2026-11-16.md §0.2 |

### 1.2 组件层缺陷

| # | 缺陷 | 证据 |
|---|---|---|
| C1 | **70 处裸 `rounded border`（无色值）**：Tailwind v4 默认边框色 = currentColor → 渲染为近黑 1px 硬边；全站仅 8 处 token 化 `border-line`。四角 4px 默认 radius，与 token 两档（8/16）全部脱节。这是「裸表单深色粗边框」的唯一根因 | grep 统计（BookDetailPage 15 处、NewBookIdeaPage 12 处、StyleProfilesSection 11 处、NewBookPage 7 处、ImitationProfilesSection 6 处、SettingsPage 5 处…合计 70）；截图 02/03/04/05 全部输入框黑硬边 |
| C2 | Button 四变体已统一（ui.tsx:92-111），但 `<Link>` 是「野生按钮」：书架「打开/删除」、详情「阅读」、运行页「仪表盘→」——同一交互层级无同一皮肤，且无图标 | BooksPage.tsx:57-63、BookDetailPage.tsx:768、RunPage.tsx:66-68 |
| C3 | 无表单控件组件：label+input 每页手写（`mt-1 w-full rounded border px-3 py-2`），placeholder 色、focus 态、错误态全站未定义（浏览器默认 outline） | SettingsPage.tsx:113-123、136、144；DistillPage.tsx:53-59 |
| C4 | Badge 与 Chip 同用 `rounded-ctl` 8px——状态语义与流程语义无形状区分 | ui.tsx:21、28 |
| C5 | 表格无规范：RunPage/DashboardPage 各写裸 table，`border-b` 无色 → 黑行线，th 无样式无层级 | RunPage.tsx:82-105（84、94 行 border-b 无色）；DashboardPage.tsx:23-38；截图 08/09 黑色行线 |
| C6 | 状态色旁路：BookDetail/RunPage 手写 statusBadge 色映射而不用 Badge 组件，同一状态色重复定义两份 | BookDetailPage.tsx:744-753、RunPage.tsx:9-24 |

### 1.3 页面层不一致

| # | 缺陷 | 证据 |
|---|---|---|
| P1 | 三种皮肤并存：书架=Card 组件化（截图 01）；新书/续写/蒸馏/设置=裸表单（02/03/04/05）；运行/仪表盘=裸表格（08/09） | BooksPage.tsx:31 vs SettingsPage.tsx:116 vs RunPage.tsx:82 |
| P2 | 容器宽度五派：max-w-5xl / max-w-2xl / max-w-4xl / max-w-6xl / 无约束，同屏切换页面时内容宽度跳动 | BooksPage.tsx:27、SettingsPage.tsx:100、DistillPage.tsx:45、RunPage.tsx:59、ChapterReaderPage.tsx:63、BookDetailPage.tsx:502、DashboardPage.tsx:17（无 max-w） |
| P3 | 标题层级混乱：同为二级标题，Distill 用 `text-xl font-bold`、Settings 用 `text-lg font-semibold`、BookDetail/各 Section 用裸 `font-semibold`（14px 与正文同大） | DistillPage.tsx:49、SettingsPage.tsx:154、BookDetailPage.tsx:558、OutlineTreeSection.tsx:97 |
| P4 | 空态三样：书架一句话（BooksPage.tsx:70-72）、蒸馏「暂无档案，先用下方表单蒸馏一个」（截图 04）、人物卡「暂无」——无统一空态组件与引导动作 | BooksPage.tsx:69-72、BookDetailPage.tsx:586、StyleProfilesSection.tsx:241 |
| P5 | 阅读页正文 `text-sm` 14px / leading-7（1.75 倍）、容器 max-w-4xl 直接铺满（≈每行 55+ 字），长文阅读既小又长；工具区（版本链/选段重写/diff）全部堆在正文上方，阅读动线被工作流打断 | ChapterReaderPage.tsx:129、63-132；截图 07 |

### 1.4 布局与 IA 缺陷

| # | 缺陷 | 证据 |
|---|---|---|
| L1 | 书详情 7 个 section 垂直平铺无导航：世界观→大纲树→伏笔→人物卡→风格档案→章节→蓝图，无层级无锚点无折叠，长滚动里迷路（owner 判定的 IA 问题） | BookDetailPage.tsx:557-825；截图 06 |
| L2 | 动作行混装：primary 按钮、两个无标签 select、两个 secondary 平铺一行，主次不分 | BookDetailPage.tsx:519-553；截图 06 顶部 |
| L3 | aside 运行卡仅 xl 断点右挂（340px），窄窗时控制台掉到页底，生成进行中看不到进度 | BookDetailPage.tsx:554 |
| L4 | 运行态与链接态同色（都是 primary 蓝）：「机器在烧」这件事在界面上零感知，唯一的活动指示是控制台日志本身 | RunPage.tsx:16（inflight=primary-soft）；截图 08 |
| L5 | 原生控件裸奔：checkbox 无样式（默认方框）、number input 默认 spinbox、select 默认 chrome——2010 年代观感的直接来源 | BookDetailPage.tsx:148-156、711-724；BookSamplePicker.tsx:82-88；截图 06 |

### 1.5 气质层（品牌、字体、色彩性格）

| # | 缺陷 | 证据 |
|---|---|---|
| Q1 | 品牌栏是小写英文 "inkforge"，中文品牌「墨炉」零露出，无任何品牌符号 | App.tsx:30；全部 9 张截图左上角 |
| Q2 | 色彩无性格：全站唯一非中性色=默认蓝+语义色，没有任何指向「中文创作」的视觉语汇（对比：产品名里的墨、炉、中文长文阅读场景全部未被视觉化） | index.css 全量 token（11-34） |
| Q3 | 字体层级无对比：标题正文同族同色，24px bold + 14px 正文=文档感而非产品感；中文标题无字重可用档位说明（YaHei 仅 Regular/Bold） | 各页 h1 `text-2xl font-bold`（BooksPage.tsx:28 等） |
| Q4 | 状态语言贫弱：done/failed 有色点，但 queued/running/paused 与普通文本无差异，无任何「进行中」的物理隐喻 | RunAsideCard.tsx:17-28、runStatusTone（ui.tsx:71-77） |


---

## 2. 共享基础设施（三提案公用，先于方向落地）

> 方向无关的「补课」项：无论选哪个方向都要做。新增组件一律新文件、页面逐页替换；现有组件签名与业务逻辑不动。

### 2.1 新增 token（infrastructure 不变量，值随方向填）

| 变量 | 用途 | 现状 |
|---|---|---|
| `--color-line-strong` | 控件 hover 线、空态虚线（比 line 深一档） | 缺（Button 规范 §0.2 backlog） |
| `--color-accent` / `-soft` / `-strong` | 方向 accent 三件套（A=炉火 / B=窑变胭脂 / C=铸铜），承担「运行中/品牌」语义，与 danger 拉开色相 | 缺（L4 根治位） |
| `--font-display` | 品牌区/页标题/阅读正文显示族 | 缺（T3） |
| `--font-mono` | 显式钉到 Windows 等宽栈 | 缺（T3） |
| `--radius-pill` | Chip/badge pill 档 | 缺（T4） |
| `--shadow-overlay` | 唯一阴影：浮层专用；卡面不用阴影 | 缺（T4） |

保留不动：`bg/surface/line/ink/muted/faint/primary/primary-strong/primary-soft/ok(-soft)/warn(-soft)/danger(-soft)/console-bg/console-1..5/radius-ctl/radius-card/height-ctl/font-sans`——名字全保留（测试零改动根基，§6），值随方向全换或微调。

### 2.2 Field 表单组件规格（新组件，治 C1/C3/L5 主刀）

```tsx
// components/Field.tsx —— 纯样式壳；受控逻辑留在页面（不改任何 onChange/onSubmit 行为）
export const fieldLabel   = 'text-xs font-medium text-muted';            // 12px 标签，与控件 6px 间距
export const fieldHelp    = 'mt-1.5 text-xs text-faint';
export const fieldError   = 'mt-1.5 text-xs text-danger';
export const inputBase    = 'h-ctl w-full rounded-ctl border border-line bg-surface px-3 text-sm text-ink '
                        + 'placeholder:text-faint transition-colors duration-150 '
                        + 'hover:border-line-strong focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15';
export const textareaBase = 'min-h-24 w-full rounded-ctl border border-line bg-surface p-3 text-sm text-ink leading-6 '
                        + 'placeholder:text-faint transition-colors duration-150 '
                        + 'hover:border-line-strong focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15';
export const selectBase   = 'h-ctl rounded-ctl border border-line bg-surface px-2.5 text-sm text-ink '
                        + 'transition-colors hover:border-line-strong focus:border-primary focus:outline-none';
export const checkboxBase = 'size-4 accent-primary';                     // accent-color 原生化，治 L5
export const numberBase   = inputBase + ' tabular-nums';
```

表单行布局：`<div class="space-y-1.5">` 包 label+control+help（垂直式）；设置页两栏式（§2.5）。迁移规则：页面上每一处裸 `rounded border px-3 py-2` 替换为对应 base——70 处清零（C1 验收标准）。

### 2.3 DataTable 规格（新组件，治 C5）

```tsx
<div className="overflow-hidden rounded-card border border-line bg-surface">
  <table className="w-full text-sm">   {/* data-testid 原样保留 */}
    <thead><tr className="border-b border-line bg-bg/60 text-left text-xs text-muted">
      <th className="px-4 py-2.5 font-medium">
    <tbody><tr className="border-b border-line/60 transition-colors last:border-0 hover:bg-bg/50">
      <td className="px-4 py-2.5">
      <td className="px-4 py-2.5 tabular-nums">          {/* 数字/时间列 */}
      状态列 → <Badge/>
```

行线统一 `border-line/60` 半透明，杀死 currentColor 黑线；数字时间一律 `tabular-nums`。

### 2.4 EmptyState / SectionHeader / CardHeader（新组件，治 P3/P4）

```tsx
EmptyState:    'rounded-card border border-dashed border-line-strong bg-surface/50 px-6 py-10 text-center'
               + lucide 图标(20 text-faint) + 一句说明(text-sm text-muted) + 可选引导 Button
SectionHeader: 'flex items-center gap-2.5' + 标题档位(§2.7) + 右侧动作位 ml-auto
CardHeader:    'flex items-center justify-between border-b border-line px-4 py-3'
```

### 2.5 AppShell 与导航（labels 冻结）

- **五个链接文案冻结**：书架/新书/续写/蒸馏/设置（App.test.tsx:38-42 按 name 查询）；分组标签文案（工作台/系统）可改。
- **品牌区双语**（治 Q1）：主位「墨炉」（font-display 22px/600），副位 `inkforge`（12px text-faint）。**硬约束：`inkforge` 必须是独立文本节点**（App.test.tsx:47 `getByText('inkforge')`）。
- rail 宽 224 不变；激活项在 `bg-primary-soft` 之上加 2px 主色左标（`border-l-2` 加法，不动断言）；nav 图标 lucide 16px / strokeWidth 1.8。
- rail 底部版本号旁加后端存活点（App.tsx:26 health 查询已有，纯样式消费，不加请求）。
- 设置页表单两栏式：label 左列 160px + 控件右列（Windows 11 设置应用原生形态）。

### 2.6 字体捆绑成本评估（D2）

| 方案 | 内容 | 体积 | 说明 |
|---|---|---|---|
| 不捆绑 | 显示族回退 Microsoft YaHei，标题 600→Bold | 0 | 书卷气打折，零工程成本 |
| 捆绑 2 字重（推荐） | Noto Serif SC SemiBold+Bold，**切片 woff2**（unicode-range 约 100-120 片/字重，全 CJK 覆盖） | 约 2.2MB/字重，合计 4.4-6MB | 切片 CSS 自托管进 Vite public/fonts/，WebView2 完整支持；仅作用于 --font-display 作用域；OFL 可随应用分发 |

（切片体积依据 transang.me 对 Google Fonts CJK 切片的分析；Fontsource 与 jfcherng/Noto-Serif-SC-CSS 提供现成自托管切片 CSS。整包单文件 woff2≈8.6MB/字重，不推荐。）

### 2.7 字号与字重阶梯（三案通用规则，Tailwind 档值不动）

| 档位 | class | 用途 |
|---|---|---|
| 12px | text-xs | meta/标签/徽标/表头 |
| 14px | text-sm | 正文默认、按钮 md |
| 16px | text-base | h2 节标题 font-semibold |
| 18px | text-lg | 大分区标题 font-semibold |
| 20px | text-xl | 页面 h1 font-semibold（从 24 降档） |
| 22/28px | text-[22px] / text-[28px] | 仅 display 时刻：品牌区、书详情书名（font-display） |
| 17px | text-[17px] leading-[2] | 阅读页正文专用 |

字重规则：正文 400；标题/按钮标签 600；`font-medium`(500) 仅用于拉丁数字与图标旁标签——**雅黑只有 Regular/Bold 两档，500 对中文不生效**，中文强调靠 600 或色彩。中文文本不加 letter-spacing；拉丁 display 可 tracking-tight。全站禁 700+ 中文标题。

---

## 3. 提案 A「松烟」（推荐，rank 1）

### 3.1 命名与定位

**「松烟」**——松烟制墨之法：烟缕入灰、和胶成墨。一句话定位：**把界面做成一方砚台——静时是墨，运转时是火。** 书卷气由墨色骨架+宋体标题+纸面层次承担；工业化由炉火状态语言+精密表格承担。

**为什么只属于墨炉**：产品名「墨炉」= 墨 + 炉。A 的两根视觉支柱（墨=primary 骨架、炉火=运行态 accent）就是产品名的直接视觉翻译：待机是一砚静墨，run 发起后炉火亮起（accent），章节出炉转绿（ok）。生成流水线的每个阶段在 UI 上有了物理隐喻——别的工具抄不走这个名字，也就抄不走这套状态语言。

### 3.2 色板（完整 token 对照表）

| token | 现值 | A 值 | 用途 |
|---|---|---|---|
| `--color-bg` | #f3f4f6 | **#F7F6F3** | 纸面（微暖纸白，D3 可换 #F6F6F5） |
| `--color-surface` | #ffffff | **#FFFFFF** | 卡面/控件面 |
| `--color-line` | #e5e7eb | **#E7E4DE** | 暖调发丝线 |
| `--color-line-strong`（新增） | — | **#D6D2C9** | hover 线/空态虚线 |
| `--color-ink` | #111827 | **#1F1D19** | 松烟墨正文 |
| `--color-muted` | #6b7280 | **#6E6A63** | 次要文字（对白 4.9:1） |
| `--color-faint` | #9ca3af | **#A6A199** | placeholder/时间戳（不承载必读信息） |
| `--color-primary` | #3b82f6 | **#26231F** | 墨色主面（实底按钮/rail 左标/勾选） |
| `--color-primary-strong` | #2563eb | **#141210** | primary hover 深墨；文字链色 |
| `--color-primary-soft` | #dbeafe | **#ECE9E3** | 墨晕（激活 rail/选中 chip/focus 底） |
| `--color-accent`（新增） | — | **#DE5A1F** | 炉火橙：仅「运行中/inflight/live」 |
| `--color-accent-soft`（新增） | — | **#FBE9DD** | 炉火软底 |
| `--color-accent-strong`（新增） | — | **#9C3A10** | 炉火软底上的文字（4.6:1） |
| `--color-ok` / `-soft` | #16a34a / #dcfce7 | **#267A3E / #E2F1E4** | 完成/通过 |
| `--color-warn` / `-soft` | #d97706 / #fef3c7 | **#9A6A00 / #F7EDCF** | 暂停/需人工/重写 |
| `--color-danger` / `-soft` | #dc2626 / #fee2e2 | **#B3261E / #F7E2DE** | 失败/删除（深胭脂红） |
| `--color-console-bg` | #0f172a | **#191613** | 炉膛：暖墨黑控制台 |
| `--color-console-1..5` | #e2e8f0/#94a3b8/#f87171/#fbbf24/#4ade80 | **#EAE6DF / #918B81 / #F28A6E / #E8B45C / #85CB90** | 日志五分色随炉膛转暖 |
| `--radius-ctl` | 8px | **6px** | 控件锐一点，去圆胖感 |
| `--radius-card` | 16px | **10px** | 卡面 |
| `--radius-pill`（新增） | — | **999px** | Chip/badge |
| `--height-ctl` | 36px | 36px 不变（sm 维持 h-8=32，测试钉 h-8） | 控件高 |
| `--shadow-overlay`（新增） | — | **0 1px 2px rgba(31,29,25,.06), 0 8px 24px rgba(31,29,25,.10)** | 仅浮层 |

落地形态：index.css `@theme` 块整表替换值、追加新增行；`:root { color-scheme: light }` 与 body 引用不变（index.css:45-53）。追加一行全局选区色 `::selection { background: var(--color-primary-soft); }`（墨晕选区，A 特有的低噪细节）。

### 3.3 字体方案（font-family 逐字给出）

```css
--font-sans: 'Segoe UI Variable Text', 'Segoe UI', 'Microsoft YaHei', 'PingFang SC', system-ui, sans-serif;
--font-display: Georgia, 'Noto Serif SC', 'Source Han Serif SC', 'SimSun', serif;
--font-mono: 'Cascadia Code', 'Cascadia Mono', Consolas, 'Courier New', monospace;
```

- UI 正文/控件：--font-sans（Segoe UI Variable + 雅黑，Win11 原生质感）。
- 标题/品牌/书名：--font-display 600/700。D2 捆绑后中文=思源宋；不捆绑回退雅黑 Bold，页面仍成立（宋体只做加分项）。
- 阅读页长文：--font-display 17px/leading-[2]（微信读书式宋体长文）；未捆绑用 --font-sans 17px/2。
- 数据/等宽：--font-mono 用于蓝图 JSON、run id、step 名、控制台；数据列 tabular-nums。

### 3.4 形状与密度语言

- 圆角三档：控件 6 / 卡面 10 / pill。**层次靠半径差异表达，不是万物同圆角**。
- 边框：全部 1px；三级线色 line（静态）→ line-strong（hover/强调）→ primary/40（选中描边）。currentColor 裸边清零（C1）。
- 阴影：卡面零阴影，深度靠 bg→surface 两级面色+发丝线；唯一阴影 --shadow-overlay 给浮层。深色元素只有炉膛控制台。
- 控件高：md 36 / sm 32 / rail 36；图标钮 32 方形。
- 间距：4px 基数；页 padding px-8 py-8；节间距 24（space-y-6）；卡内 16-20；label→控件 6。
- 内容宽度归一：默认内容列 max-w-5xl、阅读列 max-w-[42rem]、仪表盘表格 max-w-6xl——替换现状五派（P2）。

### 3.5 布局与 IA

**AppShell**（§2.5 通用方案 + A 特化）：

```
┌─ rail 224 ─┬────────────────────────────────────┐
│ 墨炉        │  ← font-display 宋体 22            │
│ inkforge    │  ← mono 12 faint                   │
│ 创作        │                                    │
│  ▍书架      │  ← 激活态：墨晕底 + 2px 墨左标       │
│  新书/续写   │                                    │
│ 工坊  蒸馏   │                                    │
│ 系统  设置   │                                    │
│ ──────────  │                                    │
│ ● v0.2.0    │  ← 存活点(ok 绿) + 版本             │
└────────────┴────────────────────────────────────┘
```

**书详情页（D4 推荐案：锚点分区；全部 section 保持渲染 → BookDetailPage.test 720 行零改动）**：

```
┌ rail ─┬──────────────────────────────────────┬─ aside 340 ──┐
│       │ ← 书架                                │ 运行 (sticky) │
│       │ R1 基线书 [章节12][完成8][已绑定风格]    │ ● done        │
│       │ [整书生成][质量轮数][导出][刷新]         │ ┌ 炉膛──────┐ │
│       ├ 设定│大纲│伏笔│人物│风格│章节│蓝图 ─────────┤ │ $ run …   │ │
│       │  ↑ sticky 锚点条 top-0 z-10           │ │ step ●→   │ │
│       │ ┌ Card：当前锚点对应 section ┐          │ └───────────┘ │
│       │ └────────────────────────────────┘   │               │
└───────┴──────────────────────────────────────┴───────────────┘
```

- 锚点条：`sticky top-0 z-10 bg-bg/85 backdrop-blur border-b border-line`，锚点 Chip 形态+滚动跟随高亮；各 section 加 `scroll-mt-20` 并包进 Card（CardHeader 带该节标题+动作位）。
- 动作行收敛（L2）：primary 唯一（整书生成）；select 全部配可见 label；「刷新」降 quiet 图标钮；导出=格式 select+按钮合并为拆分按钮形态（纯样式层，导出逻辑不动）。
- 备选标签页案：七节改真 Tabs——更紧凑，但 display:none 会让 720 行测试的可见性查询失败，需全面改测试（成本=大）。这是 D4 推荐锚点案的依据。
- aside 运行卡 `sticky top-6`；窄屏折叠为页顶细进度条（断点样式，运行数据流不动）。

**书架**：Card 加 3px 墨书脊（`border-l-[3px] border-l-ink/70`）+ 书名 display 宋体 18px；流程 chip 条改 pill；空态换 EmptyState。

**阅读页沉浸**：正文列 `mx-auto max-w-[42rem] px-6 py-10 text-[17px] leading-[2]`；章名 display 20px + meta 行（字数/版本/时间，text-xs text-faint）；版本链与选段重写收进「工具」Card 置于正文之下（阅读动线优先）；正文容器去边框改纯面（bg-surface 无 border，阅读无框）。沉浸开关/字号调节是行为变更 → `[HANDOFF_TO_CODING]`。

### 3.6 组件规格（class 级；测试钉死的串原样保留）

| 组件 | class 串 | A 下呈现 |
|---|---|---|
| Button primary | `bg-primary text-white hover:bg-primary-strong`（ui.test 钉） | **实底墨按钮**，hover 深墨——全站脱离默认蓝 |
| Button secondary | `border border-line bg-surface text-ink hover:bg-bg` | 白面暖灰线 hover 纸面 |
| Button danger | `border border-danger/40 bg-danger-soft text-danger hover:bg-danger/25` | 胭脂红系 |
| Button danger solid | `bg-danger text-white hover:brightness-90` | 第二步实底 |
| Button quiet | `text-muted hover:bg-bg hover:text-ink`；tone primary→`text-primary-strong`；danger→`text-danger` | 文字钮；墨色文字链 |
| Button 尺寸 | md `h-ctl px-3.5 text-sm` / sm `h-8 px-2.5 text-xs` / icon `w-8 px-0` | 不变 |
| Card | `rounded-card border border-line bg-surface p-4` + CardHeader(§2.4) | 基础不变 |
| Badge | `rounded-[4px] px-2 py-0.5 text-xs font-medium` + 五 tone 串不变；新增 inflight=`bg-accent-soft text-accent-strong` | 4px 锐角状态语言 |
| Chip | `rounded-full px-2.5 py-0.5 text-xs`；active `bg-primary-soft text-primary-strong`；idle `bg-bg text-faint border border-line` | pill 与 Badge 4px 形成分工 |
| Console | `rounded-card bg-console-bg p-3 font-mono text-xs leading-5`（data-testid=console 保留） | 炉膛暖墨黑 |
| 表单 | §2.2 全套（focus ring primary/15 = 淡墨晕） | 裸表单清零 |
| 表格 | §2.3；数字列 tabular-nums；run id/step 列 `font-mono text-[13px]` | 黑行线清零 |
| Link 收编 | 正文链 `text-primary-strong underline-offset-2 hover:underline`；行内动作统一 Button quiet 或 Link+icon | 野生按钮清零 |

### 3.7 标志性瞬间：「炉火」状态语言

全站唯一主动动画：**炉火呼吸点**。run inflight 时，运行卡与控制台 header 各亮一枚 6px 炉火橙点（`bg-accent` + `animate-[ember-breathe_2.4s_ease-in-out_infinite]`，keyframes 仅 `50%{opacity:.35}`），步骤完成点转绿、失败转红。其余一切静止（无入场动画、无 hover 位移，仅 150ms 色彩过渡）；`prefers-reduced-motion` 退化为常亮点。一个动画、一处隐喻：机器在烧，一目了然。

### 3.8 反例规避自检（对任务卡禁用清单逐条）

| 禁用反例 | A 的规避 |
|---|---|
| 暖奶油底 #F4F1EA+衬线大标题+赤陶橙 | bg=#F7F6F3：R-B 色距仅 4（#F4F1EA 为 10）——纸白非奶油；宋体只用于品牌/标题/阅读三处 display 时刻；炉火橙 #DE5A1F 是状态色非装饰点缀，与赤陶 #D97757 相位差明确（更红更亮）。仍要最大距离则 D3 切 #F6F6F5 |
| 纯黑底+单一荧光绿 | 浅色单主题；黑只存在于炉膛控制台（功能性非风格） |
| broadsheet 细线+零圆角 | 三档圆角 6/10/pill；线色三级；无 hairline 铺满 |
| SaaS 圆角卡片全家桶 | 半径分层（6≠10≠pill）、卡面零阴影零渐变、书脊/墨左标等非对称元素打破均质 |
| 全大写 eyebrow+中点 meta 串 | 无大写标签；meta 用 text-xs text-faint 常规句读；时间戳 tabular-nums |

---

## 4. 提案 B「青瓷」（rank 2）

### 4.1 命名与定位

**「青瓷」**——窑火淬成的器物。一句话定位：**每本书是一件窑器：档案是釉方、绑定是上釉、生成是烧制、质检是出窑检。** 气质比 A 更柔、更「器物」，流水线感弱于 A。rank 2 理由：瓷青主色与 ok 绿存在色相邻近（同为绿系），语义辨识度要让位给克制；书卷气的直接性也不如「墨」——名字里是墨炉不是瓷炉。

**为什么只属于墨炉**：窑=炉的另一种形态。蒸馏档案=釉方（风格配方）、注入=施釉、run=烧制、QC 分数=出窑检验——产品全流程能被窑比喻完整覆盖。

### 4.2 色板

| token | B 值 | 用途 |
|---|---|---|
| `--color-bg` | **#F1F4F1** | 瓷雾底（青灰冷白） |
| `--color-surface` | **#FBFDFB** | 釉面卡 |
| `--color-line` | **#DCE4DC** | 青灰线 |
| `--color-line-strong` | **#C3CFC3** | hover 线 |
| `--color-ink` | **#1D2A24** | 松烟绿墨 |
| `--color-muted` | **#5D7067** | 青灰次要文字（4.9:1） |
| `--color-faint` | **#93A59B** | 弱文字 |
| `--color-primary` | **#2E6A5C** | 瓷青主面（白字 5.5:1） |
| `--color-primary-strong` | **#235349** | hover 深青 |
| `--color-primary-soft` | **#DCEBE3** | 青瓷晕 |
| `--color-accent` / `-soft` / `-strong` | **#A24A58 / #F3E2E6 / #7C3340** | 窑变胭脂（仅出窑印/品牌印） |
| `--color-ok` / `-soft` | #267A3E / #E2F1E4 | 与瓷青披露邻近性（§4.7） |
| `--color-warn` / `-soft` | #9A6A00 / #F7EDCF | 同 A |
| `--color-danger` / `-soft` | #B3261E / #F7E2DE | 同 A |
| `--color-console-bg` | **#131F1A** | 窑室内壁（绿墨黑） |
| `--color-console-1..5` | **#DFE9E2 / #8CA096 / #F08573 / #E5B45C / #7FC98E** | 五分色绿相 |
| `--radius-ctl` / `-card` / pill | **6 / 12 / 999** | 卡面比 A 更圆（器物感） |
| `--shadow-overlay` | 0 1px 2px rgba(29,42,36,.06), 0 8px 24px rgba(29,42,36,.10) | 仅浮层 |

### 4.3 字体

--font-sans / --font-mono 与 A 完全一致（§3.3）；--font-display 同 A（Georgia, Noto Serif SC…）。差异点：B 更依赖宋体成功与否——瓷青+雅黑的组合性格偏弱，**若 D2 不捆绑宋体，B 不建议选**。

### 4.4 形状与密度

与 A 的差异：卡面 12px（更圆）；Badge 圆角 4px 保持（同 A）；控件/表格/间距全部沿用 §2/§3.4 数字。整体密度同 A。

### 4.5 布局与 IA

AppShell / 书详情锚点案 / 阅读页方案全部沿用 §2.5 与 §3.5 结构，仅换 token 值。B 特化：书详情书名旁加「窑变」竖排小字装饰位（`writing-mode: vertical-rl` 的一列 12px faint 小字，写书名拼音或卷数——器物铭牌感，克制不做动画）。

### 4.6 组件规格差异（相对 A，未列项同 §3.6）

| 组件 | B 差异 |
|---|---|
| Button primary | 同串（测试钉），值=瓷青实底 |
| Card | `rounded-card border border-line/80 bg-surface` + 顶部 2px 窑变发丝（`border-t-2 border-t-accent/30`，书架卡专用） |
| Badge done | 出窑印形态：ok tone 基础上加 `ring-1 ring-inset ring-ok/25`（印章内圈）；-inflight 同 A 用 primary-soft（B 的 accent 只给「完成印」不给运行态） |
| EmptyState | 虚线换 `border-line-strong`，底 `bg-primary-soft/40`（釉水渍感） |

### 4.7 标志性瞬间 + 自检

- **出窑印**：done 徽标带印章内圈（ring-inset），书架卡顶部一道窑变发丝线——完成态像盖了窑印。静态、无动画。
- 邻近性披露（D5 同源风险）：瓷青 #2E6A5C（teal）与 ok #267A3E（黄绿）色相距约 40°，正常视觉可分，色弱用户靠文字标签兜底（Badge 永远带字）。这是 B 排 rank 2 的核心减分项。
- 反例自检：瓷雾底是冷灰绿（与奶油反例无关）；无大面积单色荧光；圆角分层同样成立。

---

## 5. 提案 C「铸字」（rank 3）

### 5.1 命名与定位

**「铸字」**——铅字铸造车间。一句话定位：**章节是铸字，run 是浇铸流程单，QC 是验字台——数据即规格表。** 最工业化的一案：表格一等公民、等宽数据字体、锐角几何、零装饰。rank 3 理由：书卷气最弱（宋体完全不出现），与 owner「文人书卷气与工业化并存」的配比偏向了工业一端；且铸铜 accent 与 warn 琥珀存在邻近性（§5.7）。

**为什么只属于墨炉**：产品的内核本来就是文本生产线（蓝图→生成→QC→重写循环），C 把这条流水线的工程感做成正面气质——铸字排印恰是「中文文本工业」的历史原型。

### 5.2 色板

| token | C 值 | 用途 |
|---|---|---|
| `--color-bg` | **#F4F4F5** | 锌灰底（零温度，工业中性） |
| `--color-surface` | **#FFFFFF** | 面板 |
| `--color-line` | **#E2E2E6** | 钢灰线 |
| `--color-line-strong` | **#C9CAD1** | hover 线 |
| `--color-ink` | **#17171A** | 铸铁黑 |
| `--color-muted` | **#55555E** | 次要（6.9:1） |
| `--color-faint` | **#9B9BA4** | 弱文字 |
| `--color-primary` | **#17171A** | 铸铁主面（同 A 的墨底策略，更冷） |
| `--color-primary-strong` | **#0A0A0C** | hover |
| `--color-primary-soft` | **#E7E7EA** | 钢晕 |
| `--color-accent` / `-soft` / `-strong` | **#C9982A / #F2EAD4 / #6E5416** | 铸铜：仅「成品/产物」标记（完成铸件挂铜牌） |
| `--color-ok/warn/danger`(+soft) | #267A3E / #9A6A00 / #B3261E（soft 同 A） | 常规语义 |
| `--color-console-bg` | **#131316** | 真铁黑 |
| `--color-console-1..5` | **#E4E4E8 / #8E8E96 / #F08080 / #E0B050 / #7BC98A** | 五分色 |
| `--radius-ctl` / `-card` / badge | **4 / 8 / 3px** | 全站最锐；**无 pill**（chip/badge 用 3-4px 方角，反 SaaS） |
| `--shadow-overlay` | 0 1px 2px rgba(23,23,26,.08), 0 12px 28px rgba(23,23,26,.14) | 仅浮层 |

### 5.3 字体

```css
--font-sans: 'Segoe UI Variable Text', 'Segoe UI', 'Microsoft YaHei', 'PingFang SC', system-ui, sans-serif;  /* 同 A */
--font-display: 'Segoe UI Variable Display', 'Segoe UI', 'Microsoft YaHei', sans-serif;  /* 无衬线，≥20px 配 tracking-tight */
--font-mono: 'Cascadia Code', 'Cascadia Mono', Consolas, 'Courier New', monospace;        /* 数据一等公民 */
```

差异：**宋体退场**；数据标签（run id、step 名、耗时、tok 数）全部 `font-mono text-xs`——此处的 mono 有内容正当性（它们本来就是英文技术令牌），不是风格贴纸。

### 5.4 形状与密度

控件 4 / 卡面 8 / 徽标 3；**密度提高一档**：表单 label 与控件同行（`flex items-center gap-2`）、表格行高 py-2、节间距 20；rail 200px。整体比 A 紧 10-15%。

### 5.5 布局与 IA

AppShell / 书详情 / 阅读页沿用 §2.5、§3.5 结构。C 特化：书详情的章节列表改为**规格表形态**（DataTable，列=章号/标题/状态/字数/动作）；运行仪表盘是 C 的主场——报表表格配铸铜产物标记。

### 5.6 组件规格差异（相对 A）

| 组件 | C 差异 |
|---|---|
| 全部圆角 | rounded-ctl=4px / rounded-card=8px（值换，类不变）；Chip/Badge 不用 pill，3px 方角 |
| Badge inflight | `bg-primary-soft text-primary-strong`（钢色，不用暖 accent——C 的暖色只给成品） |
| 产物标记 | 完成章节/导出文件行尾挂 `text-accent-strong` lucide `Stamp`/`FileCheck` 14px + title |
| 表格 | §2.3 基础上表头加 `border-b-2 border-ink/15`（规格单的加重顶栏） |

### 5.7 标志性瞬间 + 自检

- **浇筑条**：run 进度条 `h-1.5 rounded-full bg-line`，填充 `linear-gradient(90deg, var(--color-accent-soft), var(--color-accent))`——铜水浇铸，静态渐变，完成即整条铜色。
- 邻近性披露：铸铜 #C9982A 与 warn #9A6A00 同为暖黄域；缓解=C 案 accent 只出现在「产物」列与完成态，永不出现在警示语境；两者明度差（L* 66 vs 48）可分。
- 反例自检：**C 是三案中最接近「broadsheet 细线+零圆角」禁用项的**——规避手段=4/8px 锐角而非零圆角、加重顶栏（border-b-2）代替 hairline 铺满、bg 面色两级分明；mono 数据标签有内容正当性而非风格贴纸。若 owner 对该反例零容忍，直接排除 C。

---

## 6. 测试与迁移影响评估

### 6.1 必须保留的 class 名（测试字面断言清单 = 零改动通道）

| 测试文件 | 断言内容 | 行号 | 重塑对策 |
|---|---|---|---|
| components/ui.test.tsx | `bg-primary` `text-white` `hover:bg-primary-strong` | 13-15 | Button primary 串不变；值换（A=墨底白字） |
| 同上 | `border-line` `bg-surface` | 19-20 | secondary 串不变 |
| 同上 | `border-danger/40` `bg-danger-soft`；solid `bg-danger text-white` 且非 `border-danger/40` | 24-31 | danger 串不变 |
| 同上 | `text-muted` / `text-primary-strong` / `text-danger`（quiet 三 tone） | 34-40 | tone 串不变 |
| 同上 | `h-ctl px-3.5 text-sm` / `h-8 px-2.5 text-xs` / `w-8 px-0` | 45-51 | 尺寸串不变（h-ctl 值可调，h-8 是 Tailwind 内建档） |
| 同上 | `disabled:opacity-45` `disabled:cursor-not-allowed`；`focus-visible:outline-2` `focus-visible:outline-primary` | 57-65 | 基类串不变 |
| App.test.tsx | 激活 rail `bg-primary-soft`（含 not 检查）×4 | 45-46, 57-58 | RailLink 激活串保留 + 加法左标 |
| App.test.tsx | `getByText('inkforge')` | 47 | 品牌区保留独立 `inkforge` 文本节点（§2.5） |
| pages/ChapterReaderPage.test.tsx | 版本 chip 选中=`bg-primary-soft`+`text-primary-strong`+`rounded-ctl`，禁 `bg-primary text-white`；idle=`text-muted` | 88-96, 122 | quiet+active 形态保留（ui.tsx:133 activeClass 串不动） |
| pages/DistillPage.test.tsx | `bg-primary` `h-ctl` `border-line` | 51-53 | Button 串不变 |
| pages/NewBookPage.test.tsx | `bg-primary` `h-ctl`；拖放区 `border-dashed` + `rounded`（内建 4px）；`border-line` `text-danger` | 55-82 | 拖放区保留字面 `rounded border-dashed` 类；其余 Button 串不变 |
| pages/NewBookIdeaPage.test.tsx | `border-line` `text-danger` `text-primary-strong` `bg-primary` `h-ctl` | 96-142 | Button 串不变 |
| pages/SelectionRewrite.test.tsx | 预设钮 `text-muted` | 32 | quiet 串不变 |
| components/VersionQcPanel.test.tsx | `bg-warn-soft` / `bg-ok-soft`（词边界正则 `(^|\s)…(\s|$)`） | 61-62 | Badge tone 串不动（新增类只能加在 tone 串之外） |

**data-testid 清单（全部原样保留）**：`console`（ui.tsx:57）、`qc-panel-empty`/`qc-panel`（VersionQcPanel.tsx:22,28）、`diff-added`/`diff-removed`（DiffPage.tsx:71）、`report-table`（DashboardPage.tsx:23）、`selection-rewrite`（SelectionRewrite.tsx:43）。

**结论：走「class 名只增不改、值在 @theme 换」路线，上述 8 个测试文件 0 改动通过。**

### 6.2 可废弃 token（无强制项）

- 无任何 token 被测试钉死到值层面，也不存在必须删除的名字。
- 可选清理（不建议本轮）：`--color-faint` 若想并入 muted，需替换页面 30+ 处 `text-faint`——收益低，不动。

### 6.3 页面迁移工作量分级

| 页面/文件 | 量级 | 内容 | 测试影响 |
|---|---|---|---|
| index.css | 小 | @theme 值表替换 + 新增 6 token + ::selection | 无 |
| components/ui.tsx | 小 | Badge/Chip 半径与 inflight tone（加法）；Button 不动 | ui.test 零改动（§6.1 已核） |
| components/Field.tsx / DataTable.tsx / EmptyState.tsx（新） | 中 | §2.2-2.4 三组件 | 无（新文件） |
| App.tsx（壳+品牌区） | 小 | §2.5；链接名与 bg-primary-soft 串冻结 | App.test 零改动 |
| BooksPage.tsx | 小 | 书脊卡/书名 display/pill chip/EmptyState | BooksPage.test 无 class 断言，零改动 |
| SettingsPage.tsx | 中 | 两栏式 Field 化（5 处裸 border） | 零 class 断言 |
| DistillPage.tsx + StyleProfilesSection.tsx + ImitationProfilesSection.tsx | 中 | 1+11+6 处裸 border → Field；档案列表 → Card 行 | Distill.test 只断 Button 串，零改动 |
| NewBookPage.tsx + NewBookIdeaPage.tsx | 中 | 7+12 处裸 border；拖放区保字面类 | 零改动（§6.1 对策） |
| BookDetailPage.tsx | **大** | 15 处裸 border + 锚点分区 + 动作行收敛 + aside sticky | 锚点案=零改动；标签页案=720 行测试大改（D4） |
| OutlineTreeSection / ForeshadowingsSection | 小 | 3+4 处裸 border → Field | 无 class 断言 |
| ChapterReaderPage.tsx | 中 | 阅读排版重做 + 工具区移位；chip 串冻结 | 零改动（§6.1） |
| RunPage.tsx + DashboardPage.tsx | 小 | DataTable 化（黑行线清零） | 无 class 断言 |
| DiffPage.tsx | 小 | 增删行色改 token（`bg-ok-soft/40 border-l-2 border-ok` 形态）+ testid 保留 | 无 |
| SelectionRewrite.tsx / BookSamplePicker.tsx / VersionQcPanel.tsx | 小 | 3/2/0 处裸 border；qc 面板已 token 化 | SelectionRewrite.test 断 text-muted（quiet 串不变） |

总计：1 大 + 6 中 + 8 小；测试侧 0 文件必改。最大不确定点是 D4（若选标签页案，BookDetailPage.test 追加大改）。

---

## 7. 决策记录

| 决策 | 内容 | 理由 |
|---|---|---|
| DEC-A-01 | 三案共用「class 名只增不改」迁移协议 | ui.test 逐字断言 Button class 串；气质差异可完全由 token 值承担（§0） |
| DEC-A-02 | primary 语义色化（A/C=墨，B=瓷青），accent 只承担「运行/品牌」 | 治 L4（运行态无感知）且保住 ok/warn/danger 用户直觉 |
| DEC-A-03 | 中文字重规则：400/600 两档，500 仅拉丁 | YaHei 无中字重，避免伪字重渲染（§2.7） |
| DEC-A-04 | 卡面零阴影、唯一 --shadow-overlay 浮层 | SaaS 全家桶反例的主鉴别器；桌面 WebView 下边框深度更稳 |
| DEC-A-05 | 字号阶梯沿用 Tailwind 默认档值，只定使用规则 | 改 --text-sm=13px 会全站静默涟漪，收益不抵风险 |
| OPEN-D1..D5 | 见 §0 [DECISION_NEEDED] 表 | 待 owner |

### 行为变更移交清单（本卡不做，标 [HANDOFF_TO_CODING]）

1. 阅读页沉浸开关/字号调节（§3.5）；
2. 导出拆分按钮的交互态合并（样式层已并，点击行为需编码卡确认焦点管理）；
3. 炉火呼吸点依赖的 runStatusTone 映射扩展（inflight→accent，ui.tsx:71-77 加一档，属组件层但涉状态语义，交编码卡随 A 案落地）；
4. rail 存活点消费 health 数据（已有查询，无新请求）。

> 附：现状截图证据索引——01 书架（token 卡）/ 02 新书 / 03 续写 / 04 蒸馏 / 05 设置（裸表单黑边）/ 06 书详情（平铺+炉膛控制台）/ 07 阅读（小字长行）/ 08 运行 / 09 仪表盘（裸表格黑行线）。
