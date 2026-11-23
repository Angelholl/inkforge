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
    // critic f3：壳被硬杀留孤儿 node.exe 时，新壳探活命中会静默跳过迁移——留痕可观测
    #[cfg(not(debug_assertions))]
    if let (Some(exe_dir), Some(legacy)) = (
      std::env::current_exe().ok().and_then(|p| p.parent().map(|d| d.to_path_buf())),
      app.path().app_config_dir().ok(),
    ) {
      let root = if exe_dir.join("data").is_dir() { exe_dir.join("data") } else { legacy };
      dataroot::log_line(&root, "旧服务占用 8788 端口：本次跳过 spawn 与数据迁移，完全退出（含孤儿 node.exe）后重启生效");
    }
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
    let legacy_dir = app.path().app_config_dir().ok()?;
    let exe_dir = std::env::current_exe().ok().and_then(|p| p.parent().map(|d| d.to_path_buf()))?;
    // DEC-2026-1123-01（owner 拍板）：数据根=安装目录\data\ 扁平放置；一次性迁移旧 %APPDATA%；不可写回退并落日志
    let (cfg_root, notes) = dataroot::choose_data_root(&exe_dir, &legacy_dir);
    for n in &notes {
      dataroot::log_line(&cfg_root, n);
    }
    let env_file = cfg_root.join("inkforge.env");
    if !env_file.exists() {
      let _ = std::fs::create_dir_all(&cfg_root);
      let _ = std::fs::write(&env_file, DEFAULT_ENV_TEMPLATE);
    }
    let server_root = res.join("resources").join("server");
    Command::new(res.join("resources/runtime/node.exe"))
      .arg(format!("--env-file-if-exists={}", env_file.display()))
      .arg(server_root.join("server.mjs"))
      .env("INKFORGE_APP_ROOT", server_root.display().to_string())
      .env("INKFORGE_WORKER_ENTRY", server_root.join("worker").join("worker.mjs").display().to_string())
      .env("INKFORGE_MIGRATIONS_DIR", server_root.join("db").join("migrations").display().to_string())
      .env("INKFORGE_WEB_DIST", res.join("resources").join("web").join("dist").display().to_string())
      .env("INKFORGE_CLIQUES_PATH", server_root.join("config").join("quality").join("cliches.default.txt").display().to_string())
      .env("INKFORGE_LANDING_WORDS_PATH", server_root.join("config").join("quality").join("landing-words.default.txt").display().to_string())
      .env("INKFORGE_LANDING_WORDS_USER_PATH", cfg_root.join("landing-words.txt").display().to_string())
      .env("INKFORGE_DATA_DIR", cfg_root.display().to_string())
      .env("INKFORGE_CONFIG_FILE", cfg_root.join("config.json").display().to_string())
      .env("INKFORGE_WORKER_TSX", "0")
      .env("INKFORGE_PORT", SERVICE_PORT.to_string())
      .creation_flags(CREATE_NO_WINDOW)
      .spawn()
      .ok()
  };

  child
}

/** 数据目录搬迁（DEC-2026-1123-01，owner 拍板「整个数据目录搬安装目录」）：
 *  release 态数据根 = 安装目录\data\（扁平：config.json/inkforge.env/landing-words.txt/inkforge.db±wal/backups/exports/imports/pid）。
 *  一次性迁移：旧 %APPDATA%\dev.inkforge.app 内容扁平拷入（幂等可续跑、永不删旧）；安装目录不可写→回退旧目录并落日志文件
 *  （windows_subsystem=windows 下 eprintln 不可落，critic 硬修正①）。双副本互锁：旧侧标记堵换目录重装的陈旧二次迁移（硬修正②）。
 *  便携语义钉入：exe 旁 data\ 即 portable 默认，复制 exe 别处运行=数据分叉。dev/test 外不参与编译。 */
#[cfg(any(not(debug_assertions), test))]
mod dataroot {
  use std::ffi::OsStr;
  use std::fs::{self, OpenOptions};
  use std::io::Write;
  use std::path::{Path, PathBuf};

  pub const MARKER_NEW: &str = ".inkforge-data-migrated";
  pub const MARKER_LEGACY: &str = ".inkforge-data-migrated-to";
  pub const SHELL_LOG: &str = "inkforge-shell.log";

  /// pid/锁与标记自身不迁移：拷贝来的陈旧 pid 遇 Windows pid 复用会白走陈旧接管判定（critic 硬修正③）
  fn skip_name(name: &OsStr) -> bool {
    let s = name.to_string_lossy();
    s == MARKER_NEW
      || s == MARKER_LEGACY
      || s == SHELL_LOG
      || s == ".write-test"
      || s == "service.pid"
      || s == "worker.lock"
      || s == "worker.pid"
      || s.ends_with(".stale")
  }

  /// 追加一行到 dir/inkforge-shell.log，吞错（无控制台壳的唯一可观测通道）
  pub fn log_line(dir: &Path, msg: &str) {
    let _ = fs::create_dir_all(dir);
    if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(dir.join(SHELL_LOG)) {
      let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs().to_string())
        .unwrap_or_default();
      let _ = writeln!(f, "[{stamp}] {msg}");
    }
  }

  fn write_marker(p: &Path, content: &str) {
    // create_new=O_EXCL 原子写：挡并发重复迁移（critic 硬修正③）
    if let Ok(mut f) = OpenOptions::new().create_new(true).write(true).open(p) {
      let _ = f.write_all(content.as_bytes());
    }
  }

  /// 递归拷贝 src 内容到 dst：目标已存在跳过=半拷崩溃幂等续跑；flatten_data 时 src 的 data 子目录内容并入 dst 根层（旧两层→新扁平）
  fn copy_contents(src: &Path, dst: &Path, flatten_data: bool) -> std::io::Result<()> {
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
      let entry = entry?;
      let name = entry.file_name();
      if skip_name(&name) {
        continue;
      }
      let from = entry.path();
      let file_type = match entry.file_type() {
        Ok(t) => t,
        Err(_) => continue,
      };
      if file_type.is_dir() {
        if flatten_data && name == OsStr::new("data") {
          copy_contents(&from, dst, false)?; // 旧 cfg\data\* 扁平进新根
        } else {
          copy_contents(&from, &dst.join(&name), false)?;
        }
      } else if file_type.is_file() {
        let to = dst.join(&name);
        if to.exists() {
          continue; // 续跑：已拷不覆盖
        }
        // inkforge.db-wal/-shm 原样随拷：旧壳被硬杀未 checkpoint 时 WAL 内事务不丢（critic 硬修正③）
        fs::copy(&from, &to)?;
      }
    }
    Ok(())
  }

  fn has_migratable_content(dir: &Path) -> bool {
    let Ok(rd) = fs::read_dir(dir) else { return false };
    for entry in rd.flatten() {
      let name = entry.file_name();
      if skip_name(&name) {
        continue;
      }
      let Ok(ft) = entry.file_type() else { continue };
      if ft.is_file() {
        return true;
      }
      if ft.is_dir() && has_migratable_content(&entry.path()) {
        return true;
      }
    }
    false
  }

  /// 返回 (所选数据根, 留痕注记)。new_root 可写则迁移判定在其内完成；不可写/迁移失败回退 legacy（半拷残留供下次续跑）。
  pub fn choose_data_root(exe_dir: &Path, legacy_dir: &Path) -> (PathBuf, Vec<String>) {
    let mut notes = Vec::new();
    let new_root = exe_dir.join("data");
    let probe = new_root.join(".write-test");
    let writable = fs::create_dir_all(&new_root).is_ok()
      && fs::write(&probe, "x").is_ok()
      && fs::remove_file(&probe).is_ok(); // 试写残留删除，避免误导未来判定（critic c-3）
    if !writable {
      notes.push(format!(
        "安装目录不可写（{}），回退旧数据目录（%APPDATA%），数据仍落 C 盘",
        new_root.display()
      ));
      return (legacy_dir.to_path_buf(), notes);
    }
    let marker_new = new_root.join(MARKER_NEW);
    if marker_new.exists() {
      return (new_root, notes); // 已迁移或已初始化
    }
    let marker_legacy = legacy_dir.join(MARKER_LEGACY);
    if marker_legacy.exists() {
      // 旧目录已标记迁出（如换目录重装）：拒绝二次迁移陈旧旧库，全新初始化（critic 硬修正②）
      let target = fs::read_to_string(&marker_legacy).unwrap_or_default();
      notes.push(format!(
        "旧数据目录已标记迁出至 {}，本安装全新初始化，不迁移",
        target.trim()
      ));
      write_marker(&marker_new, "fresh-init");
      return (new_root, notes);
    }
    if legacy_dir.exists() && has_migratable_content(legacy_dir) {
      match copy_contents(legacy_dir, &new_root, true) {
        Ok(()) => {
          notes.push(format!("旧数据目录已扁平迁移至 {}", new_root.display()));
          let target = new_root.display().to_string();
          write_marker(&marker_new, &target);
          write_marker(&marker_legacy, &target);
        }
        Err(e) => {
          notes.push(format!("迁移失败（{e}），本次回退旧数据目录，重启可续跑迁移"));
          return (legacy_dir.to_path_buf(), notes);
        }
      }
    } else {
      write_marker(&marker_new, "fresh-install");
    }
    (new_root, notes)
  }

  #[cfg(test)]
  mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};

    static SEQ: AtomicU32 = AtomicU32::new(0);

    struct Sandbox {
      exe_dir: PathBuf,
      legacy: PathBuf,
      root: PathBuf,
    }

    impl Sandbox {
      fn new(tag: &str) -> Self {
        let n = SEQ.fetch_add(1, Ordering::SeqCst);
        let root = std::env::temp_dir().join(format!(
          "inkforge-dataroot-{tag}-{}-{n}",
          std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        let exe_dir = root.join("install");
        fs::create_dir_all(&exe_dir).unwrap();
        Self {
          legacy: root.join("appdata"),
          exe_dir,
          root,
        }
      }
      fn touch(&self, dir: &Path, rel: &str, content: &str) {
        let p = dir.join(rel);
        fs::create_dir_all(p.parent().unwrap()).unwrap();
        fs::write(&p, content).unwrap();
      }
    }

    impl Drop for Sandbox {
      fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.root);
      }
    }

    #[test]
    fn fresh_install_no_legacy() {
      let s = Sandbox::new("fresh");
      let (root, notes) = choose_data_root(&s.exe_dir, &s.legacy);
      assert_eq!(root, s.exe_dir.join("data"));
      assert!(notes.is_empty());
      assert!(root.join(MARKER_NEW).exists());
    }

    #[test]
    fn migration_flattens_keeps_wal_skips_pids() {
      let s = Sandbox::new("mig");
      s.touch(&s.legacy, "config.json", "{\"a\":1}");
      s.touch(&s.legacy, "landing-words.txt", "[H]\n玉佩\n");
      s.touch(&s.legacy, "inkforge.env", "STRATA_MODEL=mock");
      s.touch(&s.legacy, "data/inkforge.db", "DB");
      s.touch(&s.legacy, "data/inkforge.db-wal", "WAL");
      s.touch(&s.legacy, "data/backups/b1/x.txt", "BK");
      s.touch(&s.legacy, "data/service.pid", "123");
      s.touch(&s.legacy, "data/worker.lock", "456");
      s.touch(&s.legacy, "data/worker.pid.stale", "789");
      let new_root = s.exe_dir.join("data");
      let (root, notes) = choose_data_root(&s.exe_dir, &s.legacy);
      assert_eq!(root, new_root);
      assert_eq!(fs::read(new_root.join("config.json")).unwrap(), b"{\"a\":1}");
      assert_eq!(String::from_utf8(fs::read(new_root.join("landing-words.txt")).unwrap()).unwrap(), "[H]\n玉佩\n");
      assert_eq!(fs::read(new_root.join("inkforge.db")).unwrap(), b"DB");
      assert_eq!(fs::read(new_root.join("inkforge.db-wal")).unwrap(), b"WAL"); // 硬修正③：WAL 必随拷
      assert_eq!(fs::read(new_root.join("backups/b1/x.txt")).unwrap(), b"BK");
      assert!(!new_root.join("service.pid").exists()); // 硬修正③：pid/lock 排除
      assert!(!new_root.join("worker.lock").exists());
      assert!(!new_root.join("worker.pid.stale").exists());
      assert!(new_root.join(MARKER_NEW).exists());
      assert_eq!(
        fs::read_to_string(s.legacy.join(MARKER_LEGACY)).unwrap(),
        new_root.display().to_string()
      ); // 硬修正②：互锁标记落旧侧
      assert!(s.legacy.join("data/inkforge.db").exists()); // 旧目录永不删
      assert!(!notes.is_empty());
    }

    #[test]
    fn half_copy_resumes_without_overwrite() {
      let s = Sandbox::new("resume");
      s.touch(&s.legacy, "config.json", "OLD");
      s.touch(&s.legacy, "data/inkforge.db", "DBFULL");
      let new_root = s.exe_dir.join("data");
      fs::create_dir_all(&new_root).unwrap();
      fs::write(new_root.join("config.json"), "NEW").unwrap(); // 半拷残留且内容不同
      let (root, _) = choose_data_root(&s.exe_dir, &s.legacy);
      assert_eq!(root, new_root);
      assert_eq!(fs::read(new_root.join("config.json")).unwrap(), b"NEW"); // 已存在不覆盖
      assert_eq!(fs::read(new_root.join("inkforge.db")).unwrap(), b"DBFULL"); // 缺失补齐
      assert!(new_root.join(MARKER_NEW).exists());
    }

    #[test]
    fn legacy_interlock_blocks_stale_second_install() {
      let s = Sandbox::new("interlock");
      s.touch(&s.legacy, "data/inkforge.db", "STALE");
      fs::write(s.legacy.join(MARKER_LEGACY), "D:\\elsewhere\\data").unwrap();
      let new_root = s.exe_dir.join("data");
      let (root, notes) = choose_data_root(&s.exe_dir, &s.legacy);
      assert_eq!(root, new_root);
      assert!(!new_root.join("inkforge.db").exists()); // 陈旧库不拷入
      assert!(new_root.join(MARKER_NEW).exists()); // 全新初始化
      assert!(notes.iter().any(|n| n.contains("不迁移")));
    }

    #[test]
    fn unwritable_exedir_falls_back_with_note() {
      let s = Sandbox::new("fallback");
      // exe_dir 本身是文件 → create_dir_all(exe_dir/data) 必失败
      let file_exe_dir = s.exe_dir.join("not-a-dir");
      fs::write(&file_exe_dir, "x").unwrap();
      let (root, notes) = choose_data_root(&file_exe_dir, &s.legacy);
      assert_eq!(root, s.legacy);
      assert!(notes.iter().any(|n| n.contains("不可写")));
      // 回退留痕可观测：log_line 落文件（硬修正①）
      log_line(&s.legacy, "回退留痕");
      let log = fs::read_to_string(s.legacy.join(SHELL_LOG)).unwrap();
      assert!(log.contains("回退留痕"));
      assert!(!s.exe_dir.join("data/.write-test").exists()); // 试写残留已清
    }

    #[test]
    fn existing_marker_skips_recopy() {
      let s = Sandbox::new("marker");
      s.touch(&s.legacy, "data/inkforge.db", "OLDDB");
      let new_root = s.exe_dir.join("data");
      fs::create_dir_all(&new_root).unwrap();
      fs::write(new_root.join(MARKER_NEW), "done").unwrap();
      let (root, _) = choose_data_root(&s.exe_dir, &s.legacy);
      assert_eq!(root, new_root);
      assert!(!new_root.join("inkforge.db").exists()); // 标记在=不再迁
    }
  }
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
