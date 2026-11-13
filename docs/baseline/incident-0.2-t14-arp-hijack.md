# 事故记录：0.2-T14 装机芽覆盖主安装（2026-11-13 15:54 前后）

## 事实（均已取证）

1. 首次静默安装芽时 Git Bash 转义把 `/D=D:\\墨炉0.2芽` 破坏 → NSIS 回退默认目录=上次安装位 `D:\墨炉`（owner 在用 0.1.2 安装位）→ **0.2芽程序文件覆盖主安装**（`D:\墨炉\inkforge-desktop.exe` ProductVersion 现为 0.2.0-dev；uninstall.exe LastWriteTime 15:54）。
2. nsi 模板 :61 `UNINSTKEY=...${PRODUCTNAME}`，模板 PRODUCTNAME 为字面量「墨炉」且 tauri 不替换（F6 结论扩展）→ 芽与主安装共用 ARP 键 `墨炉`，键被劫持指向 `D:\墨炉0.2芽`（第二次安装转义正确，文件落对位置）。
3. 完好项：生产库 `apps/server/data/inkforge.db`（4.1MB）在仓库内、8787 服务全程在线零波及；物证 `0.1.2-rc-6e3dfd4b.exe` S码 前后一致（6e3dfd4b…）；数据目录不在安装目录内，无数据损失。

## 根因与修复（代码侧已修，待提交）

- stamp 脚本按卡面只盖四键，未盖 PRODUCTNAME（卡面隐含「tauri --config 覆盖 productName 会隔离」的前提被实测证伪）。
- 修复：stamp-nsi.mjs 增 `--product-name` 参数（--out 模式下盖 PRODUCTNAME，ARP 键独立）；VERSIONWITHBUILD 修为纯数字段+.0（VIProductVersion X.X.X.X 格式门）。
- 重打芽包：PRODUCTNAME=墨炉0.2芽，ARP 键将独立为 `墨炉0.2芽`。

## 待 owner 裁决（装机态动作，未经 owner 不执行）

- 卸芽（`D:\墨炉0.2芽\uninstall.exe /S`，清掉被劫持的共享键）+ 物证回装 0.1.2（`0.1.2-rc-6e3dfd4b.exe /S /D=D:\墨炉`）→ 复核 health 0.1.2。
- 回装后 ARP DisplayVersion 将显示 0.1.0（0.1.2 物证构建早于 T13，模板 VERSION 未盖章——即事故前状态）。

## 防复发

- 装机态验证必须先以只读方式断言 PRODUCTNAME/UNINSTKEY 隔离（grep stamped.nsi）再执行安装器；
- Git Bash 下 NSIS `/D=` 参数禁止手写反斜杠转义，用单引号 `/D='D:\墨炉0.2芽'` 或 MSYS_NO_PATHCONV+双引号内单反斜杠，并装后立即 `Test-Path` 断言目录；
- 涉 owner 在用安装位的一切安装器运行，先问 owner（DEC-2026-1113-02 精神）。
