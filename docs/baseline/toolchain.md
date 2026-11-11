# 工具链核验（T00，2026-11-11）

| 组件 | 要求 | 实测 | 结论 |
|---|---|---|---|
| node | ≥22.11 <25 | v24.21.0 | OK |
| git | 任意 | 2.50.1.windows.1 | OK |
| pnpm | ≥9 | 12.18.0（corepack） | OK |
| VS Build Tools | MSVC C++ 工具集（Rust MSVC 前置） | 2022 BuildTools @ C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools | OK |
| rustc/cargo | ≥1.77.2 | rustup 已装，stable 工具链后台下载中 | 待落定 |
| WebView2 | 注册表 HKLM/HKCU {F3017226-…} | 未注册（Win11 常内置 Evergreen，Tauri dev 自检） | 待 T26 实测 |
| tauri-cli | ^2 | 未单独安装（经 @tauri-apps/cli devDep 使用） | T26 落定 |

**Tauri 结论：** （待 rustup 完成后写入 AVAILABLE 或 FALLBACK_BROWSER_APP）

**备注：**
- owner 拍板 Tauri（DEC-2026-1111-02），主模型自主决策安装 Rust 工具链（MSVC 前置已就绪、一次约 300MB 下载）；若失败/超时 → 计划内回退 FALLBACK_BROWSER_APP（@fastify/static 托管 + 浏览器 --app），桌面壳 0.2 再议。
- pnpm 12 构建白名单需写 pnpm-workspace.yaml（package.json pnpm 字段在 pnpm 12 不生效），已配 onlyBuiltDependencies: better-sqlite3/esbuild/koffi。
- WebView2 注册表 GUID 未命中不代表运行时缺失；T26 用 tauri dev 实测判定。
