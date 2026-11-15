# 卡：GUI 一键启动器 start-gui.bat

## 一、背景与根因

owner 需要免安装、可双击的 GUI 启动入口（对齐其他项目"一条命令/一个图标起 GUI"的形态）。当前从源码起桌面 GUI 需手动开两个终端跑两条命令（`pnpm dev:server` + `pnpm --filter @inkforge/desktop dev`），无任何可点击入口。本卡新增一个 BAT：双击后自动补齐后端服务并弹出 Tauri 桌面窗口，关窗后回收自己拉起的服务。

## 二、改动文件

- 新增 `start-gui.bat`（仓库根，**唯一**新文件；不得改动任何既有文件）

## 三、改法（BAT 行为规格）

文件必须**纯 ASCII**（注释与 echo 全英文；禁止依赖 chcp/中文，规避 codepage 乱码）。行为顺序：

1. `@echo off` + `setlocal enabledelayedexpansion` + `cd /d "%~dp0"`。
2. 前置检查：`where pnpm >nul 2>&1` 失败则 echo "pnpm not found in PATH" 并 `pause` + `exit /b 1`（pause 保证双击场景错误可见）。
3. 防双开：若 5173 已处 LISTENING（netstat 过滤），echo "InkForge GUI already running" 并 `exit /b 0`。
4. 服务保障：若 8787 未处 LISTENING：
   - `start "inkforge-server" /min cmd /c "pnpm dev:server"`，置 `STARTED_SERVER=1`；
   - 轮询等就绪：每 2 秒一次 `curl -s -o NUL -m 2 http://127.0.0.1:8787/api/health`，成功即就绪；累计 40 秒未就绪则 echo 超时错误并 `exit /b 1`；
   - 就绪后用 `for /f` 从 `netstat -ano | findstr ":8787" | findstr "LISTENING"` 取监听 PID 存 `SRV_PID`（取不到则留空，后续跳过清理）。
   - 若 8787 原本就在监听：不置 STARTED_SERVER，直接复用。
5. 起 GUI（阻塞直至窗口关闭）：`pnpm --filter @inkforge/desktop dev`。
6. 清理：仅当 `STARTED_SERVER==1` 且 `SRV_PID` 非空 → `taskkill /f /t /pid %SRV_PID% >nul 2>&1`；非本 BAT 启动的服务一律不动。
7. `endlocal` + `exit /b 0`。

实现提示（供参考，可自行微调等价写法）：轮询等待用 label+goto 而非 if 块内 goto；netstat 过滤用两条 findstr 串联避免正则歧义。

## 四、回归测试

不适用——新增独立工具脚本，不触应用代码、不改任何默认值。

## 验收命令

以下命令均在项目根目录执行（**执行者勿运行 start-gui.bat**——会与主审环境端口/窗口冲突；执行者自测限静态检查，实机冒烟由主审执行）：

```bash
# 静态 1：仅新增一个文件
git status --porcelain   # 期望：?? start-gui.bat（及本卡 docs 文件，由主审一并提交）
# 静态 2：BAT 无非 ASCII 字符（期望无输出）
grep -nP "[^\x00-\x7F]" start-gui.bat
# 静态 3：BAT 行数 ≤ 80
wc -l start-gui.bat
```

主审实机冒烟（不属执行者职责）：8787/5173 无监听冷态 → 运行 BAT → 8787 health 200 → 桌面窗口出现 → 关窗 → 8787 被回收（netstat 无 8787 LISTENING）。

## 约束

- 只 commit 不 push；提交信息 Conventional 前缀 + 中文描述，正文带 `verify: 静态检查通过`。
- 禁止运行 start-gui.bat；禁止改动 package.json / tauri.conf.json 等任何既有文件。
- 卡外问题即停待裁决，不得自行扩卡。

## 验收记录（主审，2026-11-15）

- 实机冒烟共三轮。前两轮暴露两处**规格缺陷**（卡面规格漏算，执行者按规格实现无责）：
  1. `dev:server` 实为 `node --watch` 守护进程——按规格杀监听叶子 PID 后，守护父进程立即重启服务，8787 复活。修正：清理改「按窗口标题树杀」（`taskkill /f /t /fi "WINDOWTITLE eq inkforge-server*"`，连带 `--watch` 父进程与 worker）+ 有界（3 轮）端口轮杀兜底。
  2. `pnpm` 在 Windows 是 .cmd 批处理垫片——BAT 中不加 `call` 调用，控制权永不返回，清理段成死代码（前两轮"复活"实为清理从未执行）。修正：`call pnpm --filter @inkforge/desktop dev`。
- 第三轮复测 **PASS**：冷启 18s 内 8787 health 200 + 桌面窗口弹出；关窗后 server 控制台窗口 0、间隔三探针 8787 全 000（无复活）。
- 附注：全量测试存在 **2 个存量红**（`test/quality/regression/qc-regression.test.ts` / `qc-replay.test.ts`——fixture 书 `1130c0e1…` 不在现行开发库，`corpus.ts:27` 语料耦合开发库状态），与本卡无关（变更面不含任何被测文件），另行呈报 owner 处置。
- 桌面快捷方式 `InkForge (Dev).lnk`（图标取 `apps/desktop/src-tauri/icons/icon.ico`）由主审创建，不入库。
