# 卡：修复 release 版附带 CMD 控制台框（owner 新发版阻塞项）

## 根因
`apps/desktop/src-tauri/src/main.rs` 文件头无 `windows_subsystem` 属性（全文件 grep 零命中，`fn main()` 于 :78，无 lib.rs 双入口），release 构建为 console 子系统，NSIS 安装版启动附带 CMD 黑框。与 tauri.conf.json / NSIS 模板无关（nsis template 只影响安装器）。

## 改动文件
- `apps/desktop/src-tauri/src/main.rs`：仅文件头新增一行内联属性。

## 改法
在 main.rs 第 1 行（所有 `use` 之前）加入：

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
```

不加 `[profile.release]`，不改其他任何文件。

## 先红后绿回归测试
新建 `apps/desktop/src-tauri/tests/pe_subsystem_regression.ps1`（一次性回归脚本）：
1. 红：对当前 `src-tauri/target/release/inkforge-desktop.exe` 读 PE 可选头 Subsystem 字段（offset：DOS 头 e_lfanew@0x3C → PE 签名+4 → 可选头+68，1 字节），断言输出 `SUBSYSTEM=2(GUI)`——现状输出 3(console)，红。
2. 修复+重新 `pnpm build`（cwd=apps/desktop）后重跑同一脚本断言 `SUBSYSTEM=2`，绿。
脚本实现要点：`[System.IO.FileStream]`+二进制读取，禁止依赖第三方模块；输出两行 `BEFORE=3` / `AFTER=2` 式对比结论。

## 验收命令（以下命令均在项目根目录执行）
```bash
head -2 apps/desktop/src-tauri/src/main.rs        # 含 windows_subsystem 属性
powershell -NoProfile -ExecutionPolicy Bypass -File apps/desktop/src-tauri/tests/pe_subsystem_regression.ps1   # 输出 AFTER=2
git diff --stat                                    # 仅 main.rs +1 行、新增 1 个测试脚本
```

## 约束
- 只 commit 不 push；commit 前缀 `fix(desktop)`+中文描述，正文含 verify: PE SUBSYSTEM=2 与 GUI 已验证（装包冒烟由主审执行，执行者只做二进制层验证）。
- 不动 server/worker 进程（20 章挂机 run 在跑，勿重启任何服务）。
- 构建产物不 commit；测试脚本落 apps/desktop/src-tauri/tests/。
- 超出本卡范围（NSIS/图标/版本号）一律不动，遇阻塞停报。
