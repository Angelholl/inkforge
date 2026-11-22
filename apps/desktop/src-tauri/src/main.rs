#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use std::os::windows::process::CommandExt;
use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::{Manager, RunEvent};

const CREATE_NO_WINDOW: u32 = 0x08000000;

/** 服务端口：dev 态复用开发服务（8787）；release 态独占 8788 与 dev 隔离，
 *  避免正式版壳误连开发版进程导致数据互通（DEC-2026-1120-05）。 */
#[cfg(debug_assertions)]
const SERVICE_PORT: u16 = 8787;
#[cfg(not(debug_assertions))]
const SERVICE_PORT: u16 = 8788;

/** 首次启动写入用户配置目录的 inkforge.env 模板：可自由编辑，重启应用生效。
 *  默认 mock 开箱即用；模型端点等在「设置」页填写后写入 config.json（优先级高于本文件）。
 *  仅 release 分支使用（dev 走 pnpm，无需 env 文件）。 */
#[cfg(not(debug_assertions))]
const DEFAULT_ENV_TEMPLATE: &str = "\
# 墨炉 Inkforge 服务环境文件（可编辑，重启应用后生效）
# 注意：INKFORGE_PORT 由桌面壳固定注入，改这里不生效，勿改。
# 模型端点、密钥等请在桌面端「设置」页填写，由应用写入 config.json（优先级更高）。
# 以下占位仅保证开箱即用的 mock 演示模式，不连任何真实服务。
STRATA_BASE_URL=http://127.0.0.1:1
STRATA_API_KEY=placeholder
STRATA_MODEL=mock
INKFORGE_MOCK=1
INKFORGE_PORT=8788
";

/** 探活服务端口 → 未起则 spawn service；健康返回 None，否则返回子进程。 */
fn spawn_service(app: &tauri::AppHandle) -> Option<Child> {
  let healthy = Command::new("curl")
    .args([
      "-s",
      "-o",
      "NUL",
      "-w",
      "%{http_code}",
      &format!("http://127.0.0.1:{SERVICE_PORT}/api/health"),
    ])
    .output()
    .map(|o| String::from_utf8_lossy(&o.stdout).trim() == "200")
    .unwrap_or(false);
  if healthy {
    return None;
  }

  // 双路：dev 态 cfg(debug_assertions) 走 pnpm；release 态 cfg(not(debug_assertions)) 走 sidecar node。
  // dev：cwd = 仓库根（src-tauri → desktop → apps → 根），用 pnpm 拉服务
  #[cfg(debug_assertions)]
  let child = {
    let _ = app; // dev 路径不取 resource_dir/app_config_dir，压掉未用形参告警
    let repo_root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).ancestors().nth(2).unwrap().to_path_buf();
    Command::new("cmd")
      .args(["/c", "pnpm --filter @inkforge/server start"])
      .current_dir(&repo_root)
      .spawn()
      .ok()
  };

  // release：安装目录 resource_dir 下的 sidecar node.exe 直跑 server.mjs
  #[cfg(not(debug_assertions))]
  let child = {
    let res = app.path().resource_dir().ok()?;
    let cfg_dir = app.path().app_config_dir().ok()?;
    let env_file = cfg_dir.join("inkforge.env");
    if !env_file.exists() {
      let _ = std::fs::create_dir_all(&cfg_dir);
      let _ = std::fs::write(&env_file, DEFAULT_ENV_TEMPLATE);
    }
    let server_root = res.join("resources").join("server");
    let data_dir = cfg_dir.join("data");
    let _ = std::fs::create_dir_all(&data_dir);
    Command::new(res.join("resources/runtime/node.exe"))
      .arg(format!("--env-file-if-exists={}", env_file.display()))
      .arg(server_root.join("server.mjs"))
      .env("INKFORGE_APP_ROOT", server_root.display().to_string())
      .env("INKFORGE_WORKER_ENTRY", server_root.join("worker").join("worker.mjs").display().to_string())
      .env("INKFORGE_MIGRATIONS_DIR", server_root.join("db").join("migrations").display().to_string())
      .env("INKFORGE_WEB_DIST", res.join("resources").join("web").join("dist").display().to_string())
      .env("INKFORGE_CLIQUES_PATH", server_root.join("config").join("quality").join("cliches.default.txt").display().to_string())
      .env("INKFORGE_LANDING_WORDS_PATH", server_root.join("config").join("quality").join("landing-words.default.txt").display().to_string())
      .env("INKFORGE_LANDING_WORDS_USER_PATH", cfg_dir.join("landing-words.txt").display().to_string())
      .env("INKFORGE_DATA_DIR", data_dir.display().to_string())
      .env("INKFORGE_CONFIG_FILE", cfg_dir.join("config.json").display().to_string())
      .env("INKFORGE_WORKER_TSX", "0")
      .env("INKFORGE_PORT", SERVICE_PORT.to_string())
      .creation_flags(CREATE_NO_WINDOW)
      .spawn()
      .ok()
  };

  child
}

/** 墨炉桌面壳：探活服务端口 → 未起则 spawn service（进程树），退出时 taskkill /T 收割。 */
fn main() {
  let child: Mutex<Option<Child>> = Mutex::new(None);

  tauri::Builder::default()
    .manage(child)
    .setup(move |app| {
      let spawned = spawn_service(app.handle());
      if spawned.is_some() {
        println!("[inkforge-shell] service spawned");
      } else {
        println!("[inkforge-shell] service already running, skip spawn");
      }
      *app.state::<Mutex<Option<Child>>>().inner().lock().unwrap() = spawned;
      Ok(())
    })
    .build(tauri::generate_context!())
    .expect("error while building tauri application")
    .run(|app_handle, event| {
      if let RunEvent::Exit = event {
        if let Some(c) = app_handle.state::<Mutex<Option<Child>>>().inner().lock().unwrap().take() {
          let pid = c.id();
          let _ = Command::new("taskkill")
            .args(["/T", "/F", "/PID", &pid.to_string()])
            .creation_flags(CREATE_NO_WINDOW)
            .output();
          println!("[inkforge-shell] service tree killed (pid {})", pid);
        }
      }
    });
}
