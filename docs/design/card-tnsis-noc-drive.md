# 卡 T-NSIS：安装器禁 C 盘与 A' 默认目录（DEC-2026-1112-03，以下命令均在项目根目录执行）

## 根因
owner 明令「项目禁止安装到C盘」（2026-11-12）；Tauri NSIS 默认装 `%LOCALAPPDATA%\墨炉`（C 盘）违令。裁决采纳 A'：默认目录=安装包所在盘（DriveType=3 固定盘、非 C）`\墨炉`，否则字母序第一个 DriveType=3 非 C 固定盘 `\墨炉`；无合规盘报错中止非零退出，绝不回退 C。目录页可改但拒绝任何归一化后落 C 的路径（大小写/junction/UNC 映射 C）；静默 `/D` 同校验。

## 改动文件
- 基线模板：`apps/desktop/src-tauri/target/release/nsis/x64/installer.nsi`（上轮构建生成，若无先跑一次 build）复制为 **`apps/desktop/src-tauri/nsis/inkforge-installer.nsi`**（新目录）。基线锚点：`:82` `InstallDir "${PLACEHOLDER_INSTALL_DIR}"`；`:409` `!insertmacro MUI_PAGE_DIRECTORY`；`:500` `Function .onInit`；`:536-540` currentUser 分支 `StrCpy $INSTDIR "$LOCALAPPDATA\${PRODUCTNAME}"` + `RestorePreviousInstallLocation`；`:9349-9353` restore 读注册表覆盖 $INSTDIR。
- 模板改造（NSIS 脚本，只增不删上游逻辑）：
  1. 新增宏/函数 `InkforgePickInstallDir`：`System::Call 'kernel32::GetLogicalDrives() i .r0'` 枚举盘符（DWORD 位图，位 0=A）；逐盘 `System::Call 'kernel32::GetDriveTypeW(w "R0:\") i .r1'` 只收 `3`(DRIVE_FIXED)；排除与 `$SYSTEMDRIVE` 同根（`StrCmp` 大小写不敏感）。优先级：安装包所在盘（`$EXEDIR` 取根，`(${GetRoot})`）为合格非 C 固定盘则首选；否则按字母序。合格判定加：目标目录 `<盘>:\${PRODUCTNAME}` 可写探针（`FileOpen` 写+`Delete` 清理，探针在目标子目录而非盘根）+ `System::Call 'kernel32::GetDiskFreeSpaceExW(...)'` 剩余 ≥1GB。命中 `StrCpy $INSTDIR "<盘>:\${PRODUCTNAME}"`；无合格盘置全局标志 `InkforgeNoDrive`。
  2. `.onInit`：currentUser 分支默认 `$INSTDIR` 计算后调用 `InkforgePickInstallDir`；**在 `RestorePreviousInstallLocation` 之后复验**——若恢复出的注册表旧路径根==$SYSTEMDRIVE，覆盖为计算默认值（不得继承 C 路径）。
  3. 双校验门：目录页 `!define MUI_PAGE_CUSTOMFUNCTION_LEAVE "InkforgeLeaveDirPage"`（函数内 `${GetRoot}` $INSTDIR 与 $SYSTEMDRIVE 比较，命中 `MessageBox MB_ICONEXCLAMATION "禁止安装到 C 盘，请选择其他磁盘。" + Abort`）；Section 解包前再校验一次（防静默 `/D=C:\` 绕过），命中时静默模式 `SetErrorLevel 2` + `Quit`，交互模式 MessageBox+Abort。
  4. `InkforgeNoDrive`（无合规盘）：交互模式 MessageBox 说明后 Quit；静默模式 `SetErrorLevel 3` + Quit。全程不写任何文件到 C。
  5. 安装日志：`FileOpen` 追加 `%TEMP%\inkforge-install.log`（选定目录、枚举淘汰原因、卷剩余空间），失败静默容忍。
- `apps/desktop/src-tauri/tauri.conf.json`：bundle 内增 `"windows": { "nsis": { "template": "nsis/inkforge-installer.nsi", "installMode": "currentUser" } }`。
- `apps/desktop/package.json`：`@tauri-apps/cli` 从 `^2` 改为精确锁定当前 lock 解析版本（`pnpm ls @tauri-apps/cli --depth 0` 实测，预计 2.12.4；**禁止凭记忆写**），防模板漂移（发布门③）。
- `apps/desktop/src-tauri/nsis/README.md`：3 行说明模板基线来源（Tauri CLI 版本+生成命令）与升级重放约束。

## 验收命令（发布门②的部分矩阵，真机可测项）
```bash
pnpm --filter @inkforge/desktop build                 # 模板可编译、打包成功
# 静默装 D/非C 盘（本机取实测合格盘，如 I:）：
MSYS_NO_PATHCONV=1 "apps/desktop/src-tauri/target/release/bundle/nsis/墨炉_0.1.0_x64-setup.exe" "/S" "/D=<非C固定盘>:\inkforge-smoke"   # 成功装到指定非C目录
ls <非C固定盘>:\inkforge-smoke/inkforge-desktop.exe
MSYS_NO_PATHCONV=1 "..." "/S" "/D=C:\inkforge-smoke-c"   # 必须失败：退出码非 0 且 C:\inkforge-smoke-c 不存在（echo $? 核对）
cat "$TEMP/inkforge-install.log"                          # 日志含枚举与淘汰记录
```

## 约束
- 只许改/增上述文件；上游 installer.nsi 其余逻辑（卸载/升级/WebView2/语言）逐字保留；超范围即停；不 commit。
- 模板内不得出现默认回退 C 的分支。
- 本机 DriveType=3 实测注意：F: 为 Google Drive 云同步盘（呈 DRIVE_FIXED）——探针+空间校验必须能淘汰明显异常盘，实测结论写进卡回执（发布门①证据，真云盘挂载态实测）。
