# 讨论稿：UI 风格改造——平移 SubTrans 设计语言（2026-11-15）

> 状态：讨论稿（待 owner 拍板后转实现计划）。承接 DEC-2026-1113-04 M3「UI token/三栏独立卡组：SubTrans style.css token → Tailwind @theme 映射表 + 单页试点先行，禁止与栈变更捆绑」——该卡组至今未执行，本轮 UI 观感落后的直接原因。背景：owner 指令「项目 UI 还是太古旧，参考下 subtrans 项目的 UI 设计风格和语言，进行讨论下」。

## 一、现状 vs 目标（同一工作台形态的代差）

| 维度 | inkforge 现状 | SubTrans 基准 |
|---|---|---|
| 全局骨架 | 顶部 4 个文字链接（App.tsx 8-21），无栏区概念 | 三栏 grid：rail(220) 导航 / main(1fr) 工作区 / aside(316 可折叠) 运行控制 |
| 导航 | 蓝色文字链接，无图标无分组 | 品牌块 + 分组页签（工作区/设置）+ 图标 + 主题切换 + 底部版本 |
| 设计 token | index.css 共 11 行（背景色 + 前景色） | style.css 19-105 完整 token：色板/间距/圆角/控件高/双字体族/五分色日志 |
| 状态呈现 | 裸文本 + 灰字时间戳 | 流程 chip 条（阶段+门状态+last_run）、状态 badge、进度条、状态点 |
| 运行观测 | RunPage 内嵌展示 | aside 运行控制卡（服务选择+开始/停止+进度+状态点）+ 深色控制台（#0F172A 五分色日志，可折叠/导出） |
| 主题 | 固定浅色（2026-11-12 黑底黑字缺陷后钉死） | 双主题（default/dark），token 双套 + 显式 color-scheme |
| 图标 | 无 | Lucide 内联 SVG 全量覆盖 |

截图基准：I:\SubTrans\artifacts\gui-test-screenshots\d1102-c-1280.png（浅）/ d1102-c-1280-dark.png（深）。

## 二、映射方案（保持 React 19 + Tailwind v4，零换栈）

1. **token 层（Tailwind v4 CSS-first）**：SubTrans style.css token 翻译进 `@theme`——
   `--color-bg #F3F4F6 / --color-surface #FFF / --color-primary #3B82F6 系 / --color-ok #10B981 / --color-warn #B45309 / --color-danger #DC2626 / --color-console-bg #0F172A`；间距 4/8/12/16/24/32；圆角 8/12/16；控件高 36px；字体族 Segoe UI+PingFang SC+YaHei / Cascadia+Consolas。**组件禁硬编码色值，全走 token**（SubTrans 同款纪律）。
2. **AppShell 三栏化**：rail（品牌块「墨炉 inkforge」+分组导航：工作区=书架/新书/续写，系统=设置；底部主题切换+版本号）；main 为 Outlet；aside 仅运行相关页（RunPage/详情）挂载。
3. **书架页试点升级**（单页先行，M3 红线）：书籍卡片网格（书名/时间/章节数/删除）、页首流程 chip 条（建书→设定→生成→导出，点击跳转对应页）、空态引导卡。
4. **运行控制 aside + 控制台**：RunPage 抽 aside 卡（开始/停止/进度/状态点复用 useRunEvents 事件流）；控制台组件吃 SSE 事件渲染五分色日志（--cl-* token 平移）。
5. **图标**：引入 `lucide-react`（与 SubTrans 的 Lucide 内联 SVG 同源同风格；tree-shakable，仅用到的图标入包）。新依赖需 owner 点头。
6. **双主题（可选批次）**：token 双套 + `data-theme` 切换 + 每主题显式 `color-scheme`（2026-11-12 缺陷的根治形态）；不做则维持固定浅色。

## 三、分期（每卡独立可交付，卡间不捆绑）

- **T-U1 token + rail 壳 + 书架试点**：@theme 映射表 + AppShell 三栏 + BooksPage 升级 + lucide-react。验收含 web-gui-tester 黑盒 + 双分辨率截图。
- **T-U2 详情/运行页**：aside 运行控制卡 + 深色控制台 + chip 流程条接入详情页。
- **T-U3 设置页与其余页扫尾**：NewBook/NewBookIdea/Reader/Diff/Settings 统一 token 化 + overlay 形态评估。
- **T-U4 双主题（可选）**：dark token 套 + 切换 + 全页面回归目验。

## 四、风险与取舍

- **动机风险（最大）**：Tailwind class 内联样式若不守纪律，token 表会名存实亡——对策：公共组件先抽（Card/Badge/Chip/Console），页面只组合组件；
- **GUI 目验成本**：布局类改动黑盒目验矩阵（浅色 × 1280/1600）每卡必跑，工时较功能卡高；
- **窗口标题不动**（DEC-2026-1114-04）：rail 品牌块文案属页面内容不受该条限制，但「墨炉 vs inkforge vs Inkforge」需 owner 定；
- **深色主题回归面**：若做 T-U4，所有页面像素级复查一遍（SubTrans 25 张截图矩阵先例）。

## 五、待 owner 拍板

1. 范围：T-U1 先行试点看效果，还是 T-U1..U3 一次排期；
2. lucide-react 依赖引入与否；
3. 双主题（T-U4）本轮做否；
4. rail 品牌块文案（墨炉 / inkforge / Inkforge）。
