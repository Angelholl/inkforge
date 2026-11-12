# Tauri sidecar 真安装包实现计划（2026-11-12）

**目标：** 墨炉 0.1 从「dev 依赖 pnpm 拉服务」升级为「NSIS 真安装包」：sidecar node.exe 跑 esbuild 产物 server.mjs/worker.mjs，安装即用（含 mock 生成闭环 + GUI 设置页），dev 体验零回退。

**决策来源：** DEC-2026-1112-02（owner 拍板 sidecar + 增补设置能力 + SHA-256 发布核对）。decision-critic HIGH_RISK_OBJECTION 已采纳，阻断项 A/B/C/D 分别由 Task-S/T-03/T-06/T-01 闭环。

## 全局约束（钉值）

- **esbuild external 白名单（精确 6 项）**：`fastify`、`@fastify/cors`、`@fastify/static`、`better-sqlite3`、`koffi`、`zod`；`@inkforge/shared` 必须 bundle（TS 源）；tsx/vitest/typescript 禁入产物。
- **资源布局钉值**（`src-tauri/resources/` → 安装后 `<install>\resources\` 同构；NSIS per-user，`<install>` 按 DEC-2026-1112-03 A' 规则=安装包所在非 C 固定盘优先，否则字母序第一个非 C 固定盘 `\墨炉`；无合规盘拒绝安装）：
  ```
  resources/runtime/node.exe
  resources/server/server.mjs
  resources/server/worker/worker.mjs
  resources/server/node_modules/        # 扁平、0 symlink
  resources/server/config/quality/cliches.default.txt
  resources/server/db/migrations/*.sql
  resources/web/dist/
  ```
- **运行时 env（Rust 注入；TS 侧 env 缺省→旧 import.meta.url 推导，dev 回退）**：`INKFORGE_APP_ROOT`、`INKFORGE_WORKER_ENTRY`、`INKFORGE_MIGRATIONS_DIR`、`INKFORGE_WEB_DIST`、`INKFORGE_CLIQUES_PATH`、`INKFORGE_DATA_DIR`、`INKFORGE_WORKER_TSX=0`、`INKFORGE_PORT=8787`、`INKFORGE_CONFIG_FILE`。
- **端口 8787、探活 URL、协议、DTO 不变**。supervisor 既有 4 测试用例基线只增不减。
- 验证链硬序：静态检查→定向测试→全量测试→冒烟→安全扫描比基线。

## 任务板

### 阶段 P0：server 改造
- **Task-01 supervisor 免 tsx 直跑**：`apps/server/src/worker/supervisor.ts:34` 按 `INKFORGE_WORKER_TSX==='0'` 分派 args（不带 `--import tsx`）；新增回归用例（fixture `test/worker/fixtures/worker-plain.mjs`：`process.send?.({type:'ready'}); setInterval(()=>{},1e6)`）→ 5 用例全绿。
- **Task-02 四处路径 env 覆盖**：`index.ts:10` WORKER_ENTRY / `db/migrate.ts:6` MIGRATIONS_DIR / `http/routes.ts:21` WEB_DIST / `pipeline/chapter.ts:26` CLIQUES_PATH，模式统一 `process.env.INKFORGE_X ?? 原表达式`。
- **Task-S 设置存储 + API**（owner 拍板增补）：
  - 新增 `apps/server/src/settings.ts`：`configPath = process.env.INKFORGE_CONFIG_FILE ?? path.join(os.homedir(),'.inkforge','config.json')`；`readSettings()/writeSettings()` 读写 JSON（原子写：tmp+rename）；schema zod：`{strataBaseUrl, strataApiKey, strataModel, cloudBaseUrl?, cloudApiKey?, cloudModel?, mock?: boolean}` 全 optional。
  - `config.ts` loadConfig 改造：env 解析后，若 config 文件存在且字段非空则覆盖对应项（strata 三项在「文件提供」时 env 可缺省）；**dev 回退**：`INKFORGE_CONFIG_FILE` 未设且默认路径无文件 → 行为与现状完全一致。
  - 新增路由 `GET/PUT /api/settings`（GET 不回显 API Key 明文，回 `hasApiKey:boolean`；PUT 全量校验后落盘并触发重启提示——server 不热加载，前端提示"重启应用生效"）；测试 `test/http/settings.test.ts`：PUT 后 GET hasApiKey=true、文件落盘、缺文件时 GET 全空。基线只增不减。
- **Task-03 web API base + 设置页**：
  - `apps/web/src/api/client.ts`：`export function resolveApiBase(isDev: boolean){ return isDev ? '' : 'http://127.0.0.1:8787'; }`，`req()`/`runEventsUrl()`/`App.tsx:8` 健康检查统一走 `resolveApiBase(import.meta.env.DEV)`；新增 `client.test.ts`（resolveApiBase(false)==='http://127.0.0.1:8787'，(true)===''）。
  - 新增 `apps/web/src/pages/SettingsPage.tsx` + 路由 `/settings` + 导航入口：表单（端点/Key/模型名/mock 开关）、保存调 PUT /api/settings、成功提示"重启应用生效"；测试 SettingsPage 基本渲染+提交调用。
  - **GUI 变更：提交前 lessons + web-gui-tester 黑盒目验（Task-15 一并覆盖）。**

### 阶段 P1：sidecar 资源生产
- **Task-04** `pnpm --filter @inkforge/server add -D esbuild`。
- **Task-05** 新增 `apps/desktop/scripts/fetch-node.mjs` + `apps/desktop/NODE_VERSION`（执行者先 `node --version` 实测写入，禁止凭记忆）→ 下载 `https://nodejs.org/dist/v<ver>/win-x64/node.exe` → `resources/runtime/node.exe`，`--version` 核对一致。
- **Task-06** 新增 `apps/server/scripts/build-dist.mjs`（node 直跑）：esbuild 双入口（src/index.ts→server.mjs；src/worker/main.ts→worker/worker.mjs；`bundle,platform:node,target:node22,format:esm`，external=6 项）；external 闭包 BFS 复制（读 dependencies+optionalDependencies，跳过 dev/peer；`cpSync dereference:true`，遇 realpath 冲突 throw）；拷 web/dist、cliches、migrations。验收：0 symlink、server.mjs import 区无 tsx、migrations 2 个 sql。
- **Task-07 stage 冒烟（纯资源自检，不过禁入 P2）**：env 全注入 + 占位 STRATA_* + INKFORGE_MOCK=1，裸跑 `node.exe server.mjs` → `curl /api/health` `{"ok":true,"version":"0.1.0"}`、`curl /` 返回 index.html；GET /api/settings 正常；taskkill 收割。

### 阶段 P2：Tauri 壳
- **Task-08** tauri.conf.json bundle.resources map（布局钉值逐项映射）；JSON 合法性核验。
- **Task-09** main.rs：`CREATE_NO_WINDOW`；`spawn_service()` cfg 分路——debug 保留 pnpm 拉服务（dev-only），release 用 `resource_dir()/resources/runtime/node.exe --env-file-if-exists=<config_dir>/inkforge.env server.mjs` + env 注入（含 `INKFORGE_CONFIG_FILE=app_config_dir/config.json`）；首装写 inkforge.env 模板（mock=1 + 占位 + 指向设置页说明）；探活/taskkill/`Mutex<Option<Child>>` 原样保留；`cargo check` debug+release 双过。

### 阶段 P3：构建与端到端
- **Task-10** dev 回归：dev:server 健康 + desktop dev 窗口「服务已连接」+ 全量 typecheck/test 绿（supervisor 5、client 1、settings 若干，基线只增）。
- **Task-11** `tauri build` → 布局核对（target/release/resources 同构）。
- **Task-12** 静默安装 `/S /D=<非C固定盘>:inkforge-smoke（/D 必须最后、无引号无空格；Git Bash 需 MSYS_NO_PATHCONV=1）
- **Task-13** 装机冒烟：窗口起 → health ok → `%APPDATA%\dev.inkforge.app\data\inkforge.db` 存在 → 关窗后 node 进程消失、service.pid 清理。
- **Task-14** mock 生成一章 API 全链（建书→蓝图→generate→run done→currentVersionId 非空），验证 worker bundle + migrations + cliches 全链路。
- **Task-15** web-gui-tester 黑盒（先调 lessons）：设置页保存→重启→真/mock 生成→SSE 推进→阅读页正文；截图留档。
- **Task-16** 卸载验证：卸载后程序目录消失、`%APPDATA%\dev.inkforge.app` 用户数据保留。
- **Task-17** 收口：全量测试；`.gitignore` 追加 `apps/desktop/src-tauri/resources/`；secret 扫描；SHA-256 计算并记入 `docs/release/0.1.md`（发布页附"S码"）；Conventional 提交（GUI 已验证注明）；tag v0.1.0。

## 依赖图
```
T-01/02/S/04/05 → T-06 → T-07 → T-08/09 → T-10/11 → T-12 → 13 → 14 → 15 → 16 → 17（T-03 随 P0 并行）
```

## 风险与预案
- R1 symlink：cpSync dereference 规避；Task-07 先暴露。
- R2 flat 冲突：脚本 fail loud，升级需回报。
- R3 `--env-file-if-exists` 需 Node≥22.9：版本钉值保证，不成立回退 Rust 解析注入。
- R4 8787 被占：探活兜底（已存在）。
- R5 未签名 SmartScreen：发布说明附"更多信息→仍要运行"+SHA-256 核对。
