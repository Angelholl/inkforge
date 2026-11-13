# 调研：SubTrans 技术栈与 UI 资产盘点（2026-11-13，架构选型输入）

> code-reader 只读调研 I:\SubTrans 的全文报告存档。

## 结论
SubTrans 是 Python 3.10-3.13 + pywebview(6.2+) + WebView2 的 Windows 桌面字幕翻译工具，前端为纯静态 HTML/CSS/JS（零框架、零 CDN、token 化双主题），后端经 pywebview JS bridge（`TranslateAPI`）以「薄壳 + CLI 子进程」方式委托 `subtrans.refine` 流水线，事件流回传进度。UI 是成熟的三栏工作台（rail 导航 | main 页签工作区 | aside 运行控制），设计 token 体系完整、可直接平移到小说生成工作台。CLI 独立存在（`subtrans-refine`）。打包：PyInstaller onedir + Inno Setup 6。

## 关键锚点
- `I:\SubTrans\pyproject.toml`（196-198 行：subtrans-gui / subtrans-refine 双入口）
- `subtrans\webview_gui\main.py`（venv 自举 :53 _auto_setup、WebView2 提示 :150、拖放 :200-250、file:// 加载 :405、origin 自检 :440）
- `subtrans\webview_gui\api.py`（:5-6 薄壳委托 CLI 子进程）
- `subtrans\webview_gui\event_stream.py`（事件流解析）
- `subtrans\paths.py:98`（SQLite tm.db：WAL+FTS5）
- `packaging\setup.iss`（Inno Setup 6）

## 架构
- 目录：subtrans/ 四层：refine/（~60 模块流水线）、translate/（llm_client）、webview_gui/（壳+assets 前端）、utils/（进程树管理）
- 前端无框架原生 JS，~40 个 assets/*.js；进程内 pywebview JS bridge；子进程经 process_manager 单点收敛；事件流→evaluate_js 推前端
- 存储：无服务端；SQLite tm.db + YAML 配置 + CSV 术语表 + JSON manifest

## UI 资产
- 三栏 grid：rail(220) | main(1fr) | aside(316 可折叠)（style.css:8）
- rail：品牌块+分组页签+主题切换（default/dark，index.html:37-96）
- main：.tab-page 页签；.flow-overview 流程 chip 条（阶段+门状态+last_run）；.file-list 文件列表；.console-section 深色控制台
- aside：运行控制卡（服务选择+开始/停止+进度条+状态点+badge）
- 设置页：全屏 overlay 分 4 panel
- token（style.css:19-105）：--bg #F3F4F6、--surface #FFF、--primary #3B82F6 系、--ok #10B981 / --warn #B45309 / --danger #DC2626、--console-bg #0F172A、日志五分色 --cl-*；--space-1..6=4/8/12/16/24/32px；--radius 8/12/16；--h-ctl 36px；--font 14/13/12px Segoe UI+PingFang SC+YaHei / Cascadia+Consolas；组件禁硬编码色值全走 var()；零外部资源；Lucide 内联 SVG；data-i18n+strings.py
- 截图：I:\SubTrans\artifacts\gui-test-screenshots\*.png（~25 张含深色/多分辨率）、I:\SubTrans\Temp\gui-blackbox-d1102sel\out\*.png

## 可平移面
三栏骨架、aside 运行控制卡、流程 chip 条、整套 token 与双主题机制、file-list/review 模式、控制台五分色日志、overlay 设置 hub、拖放导入、evaluate_js 进度推送、薄壳+CLI+事件流工程模式、strings.py i18n、frozen 判定与数据目录收口。
