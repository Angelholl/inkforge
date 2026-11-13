# 调研：inkforge 现架构 Python+WebView2+CLI 移植面盘点（2026-11-13，架构选型输入）

> code-reader 只读调研全文报告存档。

## 结论
移植面中等偏小：服务端核心约 3,700 行纯逻辑 TypeScript 可直译 Python；web 前端约 1,009 行 React 可原样保留（WebView2 继续加载同一 SPA）；需重设计仅 5 处 Node/Windows 绑定。Tauri 壳 108 行 Rust 功能简单，可整体替换。

## 体量
| 模块 | 行数 | 说明 |
|---|---|---|
| apps/server/src | 3,701（43 文件） | routes 389/25 端点、chapter.ts 397、l0/l1/gate 311、db/ 798、worker/ 238、llm/ 495、style/ 215 等 |
| apps/web/src | 1,009（16 文件） | React+Vite |
| packages/shared | 192 | 类型+文本工具 |
| apps/server/test | 3,595（38 文件） | vitest，162 it 块 |
| src-tauri | 108 | main.rs 壳 |

## 进程模型
墨炉.exe(Tauri/WebView2) → node server.mjs(Fastify 127.0.0.1:8787 静态托管 web/dist) → node worker.mjs（IPC ready）。单实例=文件锁 O_EXCL（singleinstance.ts:13）；release 态壳用打包内 resources/runtime/node.exe 拉服务，退出 taskkill /T /F 收割（main.rs:96-106）。

## 硬依赖→Python 对应
- better-sqlite3 WAL+FTS5 → sqlite3 stdlib 直译（fts.ts trigram、snippet、每章先删后插）
- worker 子进程+IPC+退避 supervisor → 重设计：建议进程内 asyncio 队列（concurrency=1 + DB 步级租约 takeoverStaleSteps 30s 已保证可恢复）
- tsx 运行链 → Python 消失
- STRATA Anthropic client（fetch/SSE/429 退避）→ httpx 直译
- koffi kernel32（SetThreadExecutionState/procprobe）→ ctypes 各 <30 行
- esbuild+sidecar node.exe+NSIS → PyInstaller onedir / embeddable Python 重做（量小需拍板）
- 单实例锁 → 直译；INKFORGE_* env 注入约定可沿用

## 测试资产
36 文件 162 it（server 158+web 2+shared 2，约 490 expect）；重镇：quality 23/pipeline 12/worker 12/db 9/llm 19/prompts 6/http 7；e2e=进程内 vitest（phaseA mock 全流程、phaseB batch20）。断言语义可逐条迁移作 Python 版验收基线。

## 定性
约 4,900 行 TS 源中 ~3,900 行（70%）可直译；重设计集中进程/打包/壳三层胶水，小体量但需方案拍板。前端 React SPA 建议保留零改（WebView2 加载同一 dist）——若改用 SubTrans 式原生 JS 前端则全部重写。
