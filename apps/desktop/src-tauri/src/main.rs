use std::os::windows::process::CommandExt;
use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::{Manager, RunEvent};

/** 墨炉桌面壳：探活 8787 → 未起则 spawn service（进程树），退出时 taskkill /T 收割。 */
fn main() {
  let child: Mutex<Option<Child>> = Mutex::new(None);

  tauri::Builder::default()
    .setup(move |app| {
      let healthy = Command::new("curl")
        .args(["-s", "-o", "NUL", "-w", "%{http_code}", "http://127.0.0.1:8787/api/health"])
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).trim() == "200")
        .unwrap_or(false);
      if !healthy {
        // cwd = 仓库根（src-tauri → desktop → apps → 根）
        let repo_root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).ancestors().nth(2).unwrap().to_path_buf();
        let spawned = Command::new("cmd")
          .args(["/c", "pnpm --filter @inkforge/server start"])
          .current_dir(&repo_root)
          .spawn()
          .ok();
        *app.state::<Mutex<Option<Child>>>().inner().lock().unwrap() = spawned;
        println!("[inkforge-shell] service spawned");
      } else {
        println!("[inkforge-shell] service already running, skip spawn");
      }
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
            .creation_flags(0x08000000) // CREATE_NO_WINDOW
            .output();
          println!("[inkforge-shell] service tree killed (pid {})", pid);
        }
      }
    });
}
