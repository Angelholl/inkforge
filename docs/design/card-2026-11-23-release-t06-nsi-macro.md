# 卡 t06：NSI 模板机器路径宏化 + stamp-nsi 脚本相对改造（0.2.3 发版前置）

以下命令均在项目根目录执行（相对路径）；外部工具用绝对路径。卡面四条=根因/改动/先红后绿/验收+约束。

## 根因/目标

NSIS 模板 `apps/desktop/src-tauri/nsis/inkforge-installer.nsi` 为 tauri build **原样拷贝**的静态快照（已证：生成 NSI 的 :30-60 define 区与模板零差异，tauri 不改写模板字面量——stamp-nsi.mjs 头注释 T14 实测同）。模板里固化了机器依赖绝对路径：3736 条 File 行源 `I:\inkforge\apps\desktop\src-tauri\resources\` 前缀、`!define MAINBINARYSRCPATH`（I:\inkforge\...\target\release\inkforge-desktop.exe）、`!define ADDITIONALPLUGINSPATH`（C:\Users\57850\AppData\Local\tauri\...）、`!define INSTALLERICON`/`!define UNINSTALLERICON`（I:\inkforge\...\icons\icon.ico）——换机（盘符/用户名不同）打包即碎，且开发机路径固化进公开包 NSI。owner 已拍板本轮修（DEC-2026-1123-02 裁决②）。目标：机器依赖面收敛为模板头 **5 条 !define 值**，全部由 stamp-nsi.mjs（本就有盖章语义）用脚本自身位置 `resolve(here,...)` 与 `%LOCALAPPDATA%` env 计算改写；File 行引用宏 `${INKFORGE_RES}`。失败模式安全：忘跑 stamp → makensis 对 File 缺源硬报错，非静默。

## 改动文件与方法（只这两个文件）

**1. `apps/desktop/src-tauri/nsis/inkforge-installer.nsi`**（约 9700 行，**禁止整读**——grep 定位+落盘脚本批处理）：
- a. 在 `!define UNINSTALLERHEADERIMAGE ""` 行（锚点 grep，当前约 :48）之后插入一行：
  `!define INKFORGE_RES "I:\inkforge\apps\desktop\src-tauri\resources"`
- b. 全文件批量替换：`I:\inkforge\apps\desktop\src-tauri\resources\`（**先 grep -c 记录基线=3736**，均在 File 行源引号内；`/oname=` 侧不含此前缀）→ `${INKFORGE_RES}\`。替换用**落盘脚本** `data/tmp-t06/macroize.mjs`（node readFileSync→replaceAll→writeFileSync，打印替换计数，计数须==基线）。**勿用内联 heredoc/-e**：含反斜杠脚本一律落盘再跑（反斜杠吞坑先例）。
- c. 其余一律不动：reuse-previous 守卫 hunk、全部 Delete/RMDir 行、上述 MAINBINARYSRCPATH/ADDITIONALPLUGINSPATH/ICON 三处 define 的当前值（留给 stamp 改写，本卡不改）、`${...}` 变量引用行（File "${MAINBINARYSRCPATH}" 等）。

**2. `apps/desktop/scripts/stamp-nsi.mjs`**（约 2.6KB，可直读）：
- a. 删除 `const ICON_ABS = 'I:\\inkforge\\...icon.ico';` 字面量行；INSTALLERICON/UNINSTALLERICON 两处 replaceLine 的新值改 `resolve(here, '../src-tauri/icons/icon.ico')`（win32 `path.resolve` 输出即反斜杠绝对路径，NSIS !define 直用）。
- b. 新增三条 replaceLine（复用现有「恰一行命中」机制，定位失败即 exit 1 不落盘）：
  - `!define INKFORGE_RES` ← `resolve(here, '../src-tauri/resources')`
  - `!define MAINBINARYSRCPATH` ← `resolve(here, '../src-tauri/target/release/inkforge-desktop.exe')`
  - `!define ADDITIONALPLUGINSPATH` ← `process.env.LOCALAPPDATA` 非空时 `${LOCALAPPDATA}\tauri\NSIS\Plugins\x86-unicode\additional`，**LOCALAPPDATA 缺失 → console.error + exit 1 不落盘**。
- c. --out/--version/--product-name/no-op/幂等语义保持；注释风格随现状。

## 先红后绿回归（序执行，每步一个可核对结果）

- **红（基线留档）**：先 `mkdir -p data/tmp-t06 && git show HEAD:apps/desktop/src-tauri/nsis/inkforge-installer.nsi > data/tmp-t06/orig.nsi`（原版快照，后续所有等价比对此文件为准，勿再引 git）；`grep -c 'I:[^"]*inkforge[^"]*src-tauri[^"]*resources' data/tmp-t06/orig.nsi` = **3736**；`grep -c '^\s*File ' data/tmp-t06/orig.nsi` = **3739**。记入完成通知。
- **绿1（编译=宏展开物理验证，makensis 编译期逐条 File 源验存在）**：
  **主审实测修正（2026-11-23 验收期）**：裸调 makensis 对本模板（UTF-8 无 BOM、含中文行）必在首个非 ANSI 兼容行 `Bad text encoding` abort（对照实验：未改的 orig.nsi 裸调同样 abort 于 :790；tauri build 内部自带 `/INPUTCHARSET UTF8` 故 12:20 能成包）。且 `/V1` `/V2` 级不打印 File 清单、abort 行也可能不进 log——**只许 /V4，且成功判据=「Total size:」完成行+产物 exe 双在，log 体积不是证据**。另两坑：`/OUT=盘:\...` 形态实测打不开（回落脚本目录 OUTFILE），产物落 `src-tauri/nsis/nsis-output.exe` 用完即删；Git Bash 调 makensis 必 `export MSYS2_ARG_CONV_EXCL='*'`（/V1 曾被改写成 D:/Git/V1）。卡面命令以主审复跑版为准：
  `mkdir -p data/tmp-t06 && export MSYS2_ARG_CONV_EXCL='*' && "C:/Users/57850/AppData/Local/tauri/NSIS/makensis.exe" /V4 /INPUTCHARSET UTF8 apps/desktop/src-tauri/nsis/inkforge-installer.nsi > data/tmp-t06/gate-v4.log 2>&1`（cwd=项目根）退出码 0。取证用**落盘 node 脚本**（勿用 grep 内联——ugrep 转义与吞反斜杠双坑）：逐行提 `File: "..."` 展开路径→断言：计数 ≥3739；前缀只落三面 `I:\inkforge\apps\desktop\src-tauri\resources\`（宏展开应=原值，证换机语义等价）/ `...\target\release\` / `C:\Users\57850\AppData\Local\tauri\NSIS\Plugins\`；**个人面零命中**（AppData\Roaming、\.inkforge\、\data\、inkforge.db、config.json、landing-words.txt 非 .default）；log 含 `Total size:` 行、无 `aborting creation`。产物记大小后删除。
- **绿2（stamp 幂等+去字面量）**：`INKFORGE_STAMP_NSI=1 node apps/desktop/scripts/stamp-nsi.mjs` rc=0 → 模板 5 条机器 define 行值=本机路径（grep 核）；再跑一次 → `git diff --stat` 与上次一致（幂等，本机重盖章零字节变化）；`grep -cE '"[A-Z]:' apps/desktop/scripts/stamp-nsi.mjs` = **0**（脚本源码无盘符字面量）。
- **绿3**：`pnpm -r --if-present run test` 全绿（基线 664：server 506+web 156+shared 2，只增不减）+ `pnpm -r --if-present run typecheck` 0 错。

## 验收命令（主审复核用，均在项目根）

```bash
grep -c 'I:[^"]*inkforge[^"]*src-tauri[^"]*resources' apps/desktop/src-tauri/nsis/inkforge-installer.nsi   # 预期 1（仅 INKFORGE_RES define 行）
grep -c '^\s*File ' apps/desktop/src-tauri/nsis/inkforge-installer.nsi   # 预期 3739
grep -c 'INKFORGE_RES' apps/desktop/src-tauri/nsis/inkforge-installer.nsi   # 预期 3737（3736 File + 1 define）
grep -cE '"[A-Z]:' apps/desktop/scripts/stamp-nsi.mjs   # 预期 0
grep -cE '"[A-Z]:' apps/desktop/src-tauri/nsis/inkforge-installer.nsi   # 预期 6（5 define + 头部 !addincludedir，机器面全收敛、全由 stamp 改写——主审补列）
node data/tmp-t06/expand-check.mjs   # 执行者落盘的宏展开等价脚本：新模板 ${INKFORGE_RES} 展开后逐行对 data/tmp-t06/orig.nsi，预期输出 EXPANDED_REPL=3736、DIFF_LINES=1（唯一差异=新增 define 行）；主审须 cat 该脚本核其口径后复跑
pnpm -r --if-present run test
```

（注：主审复跑绿1 编译清点同法；`data/tmp-t06/` 为 scratch 区 gitignored。）

## 约束

- 只许触碰上述 2 个文件；`data/tmp-t06/` scratch 不入库；永不 `git add -A`、永不 `--no-verify`。
- 模板逻辑零改动：只许「前缀替换+1 行 define 插入」，任何守卫/迁移/Delete 语义问题即停报。
- makensis/tauri 工具链硬失败（rc.exe/link.exe 类）即停报，不发明 workaround。
- 执行者只 commit 不 push。提交信息：`fix(desktop): NSI 模板机器路径宏化——3736 条 File 行收敛 ${INKFORGE_RES}，stamp-nsi 脚本相对/env 计算盖章六行`，正文 `verify:` 行=红基线两数+绿1 计数与个人面零命中原文+绿2 幂等结果+绿3 测试计数，`Refs: DEC-2026-1123-02`。
- 完成通知必含：makensis rc 与耗时、log File: 行数、个人面 grep 六项各计数、宏展开等价脚本输出、stamp 两次运行 diff、全量测试计数、nsis-output.exe 大小（已删）。
