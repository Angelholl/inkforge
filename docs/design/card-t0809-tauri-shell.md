# 卡 T-08/09：tauri.conf 资源映射 + main.rs 双路 spawn（以下命令均在项目根目录执行）

## 根因
release 态 main.rs 用编译期常量 `env!("CARGO_MANIFEST_DIR")` 定位仓库与 `cmd /c pnpm` 拉服务——安装机上必然失效。需改为 resource_dir 下的 sidecar node.exe 直跑 server.mjs，env 注入全部资源路径；dev 态（debug_assertions）保留原 pnpm 拉服务。

## 改动文件
- `apps/desktop/src-tauri/tauri.conf.json`：`bundle` 内增 resources map（key=相对 conf 目录源，value=相对 resource dir 目标）：
  ```json
  "resources": {
    "resources/server/server.mjs": "resources/server/",
    "resources/server/worker/**": "resources/server/worker/",
    "resources/server/node_modules/**": "resources/server/node_modules/",
    "resources/server/config/**": "resources/server/config/",
    "resources/server/db/**": "resources/server/db/",
    "resources/web/dist/**": "resources/web/dist/",
    "resources/runtime/node.exe": "resources/runtime/"
  }
  ```
  其余字段（frontendDist/beforeBuildCommand/targets/icon）不动。
- `apps/desktop/src-tauri/src/main.rs`（单文件重构，保持单文件）：
  - `const CREATE_NO_WINDOW: u32 = 0x08000000;`
  - `const DEFAULT_ENV_TEMPLATE: &str`：inkforge.env 模板（注释说明可编辑 + `INKFORGE_PORT=8787` + 示例行；模型端点等由 GUI 设置页写 config.json，勿在此写死 STRATA_ 占位——占位由 server mock 兜底逻辑处理）。
  - 抽 `fn spawn_service(app: &tauri::AppHandle) -> Option<std::process::Child>`：先保留现有 curl 探活（http://127.0.0.1:8787/api/health）；健康→None；不健康→cfg 分路：
    - `#[cfg(debug_assertions)]`：现有 `cmd /c pnpm --filter @inkforge/server start`（含 CARGO_MANIFEST_DIR cwd）原样保留；
    - `#[cfg(not(debug_assertions))]`：
      `resource_dir()` → `res`；`app_config_dir()` → `cfg_dir`（%APPDATA%\dev.inkforge.app）；`env_file=cfg_dir/inkforge.env` 不存在则 create_dir_all+write 模板；`server_root=res/resources/server`；
      `Command::new(res.join("resources/runtime/node.exe")).arg(format!("--env-file-if-exists={}", env_file.display())).arg(server_root.join("server.mjs"))`，env 注入：`INKFORGE_APP_ROOT=server_root`、`INKFORGE_WORKER_ENTRY=server_root/worker/worker.mjs`、`INKFORGE_MIGRATIONS_DIR=server_root/db/migrations`、`INKFORGE_WEB_DIST=res/resources/web/dist`、`INKFORGE_CLIQUES_PATH=server_root/config/quality/cliches.default.txt`、`INKFORGE_DATA_DIR=cfg_dir/data`、`INKFORGE_CONFIG_FILE=cfg_dir/config.json`、`INKFORGE_WORKER_TSX=0`、`INKFORGE_PORT=8787`；`.creation_flags(CREATE_NO_WINDOW)`；spawn().ok()。
    - 两路 child 均写回现有 `Mutex<Option<Child>>`。
  - `RunEvent::Exit` 的 `taskkill /T /F` 收割逻辑原样保留。路径拼接用 `.join()`（Windows 反斜杠自动处理）；env 传 PathBuf 用 `.display().to_string()`。

## 验收命令
```bash
node -e "JSON.parse(require('fs').readFileSync('apps/desktop/src-tauri/tauri.conf.json','utf8'))"   # 无异常
cd apps/desktop/src-tauri && cargo check            # debug 编译过
cd apps/desktop/src-tauri && cargo check --release  # release 分支编译过
grep -c "cfg(debug_assertions)" src/main.rs         # ≥2
grep -c "CARGO_MANIFEST_DIR" src/main.rs            # 仅出现在 debug 分支内
```

## 约束
- 只许改上述两文件；探活 URL、Mutex<Option<Child>>、taskkill 三要素逐字符保留；超范围即停；不 commit。
- main.rs 现有依赖 tauri 2（Manager trait 已可用）；如需 `PathExt/creation_flags`，`use std::os::windows::process::CommandExt;` 已有。
