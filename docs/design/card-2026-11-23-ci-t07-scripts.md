# 卡 t07：CI 发版门两脚本（release-inventory.mjs + ci-verify-install.sh）

以下命令均在项目根目录执行（相对路径）；涉外部路径命令用绝对路径。规格唯一真值=`docs/plans/2026-11-23-ci-release.md` Task t07 + 全局约束 G1-G12（critic 评议后终版），本卡只定执行边界，冲突以计划为准。

## 根因/目标

CI 发版流水线（t08 的 release.yml）需要两个**可通用化入库**的发版门脚本：a) 静态清点——读 tauri 生成 NSI，断言零个人数据面/机器面白名单/计数钉值（本地 scratch 版 data/tmp-t06/gate-check.mjs、nm-coverage.mjs 是机器钉死原型，须按计划 t07-S1 改成从 NSI 自身 define 行读机器面、不硬编码盘符）；b) 物理验证装——净装→首启前落盘全量清点→首启取证→杀树→卸载→ARP 圈定→残留兜底（原型 data/tmp-t06/verify-install.sh，按计划 t07-S2 参数化）。两脚本必须本地可自证且带负例（防恒绿）。

## 改动文件与改法（Create ×2，只这两个）

1. `scripts/release-inventory.mjs`——照计划 t07-S1：用法契约（--nsi/--log、exit 0/2/9、cwd 断言、latin1）、钉值常量 8 项（含 hazard 注释「NSI 内容变更须重录」）、断言 I1-I12 逐条（G8 口径：`line.trimStart().startsWith('File ')` 带尾空格；I2 六行后缀形态白名单不限盘符；I12② 个人面黑名单作用域=全部 File 行拼接文本，勿扩到 Delete 行——卸载语义行含 \data\ 属行为面非泄漏面，critic 已裁）。
2. `scripts/ci-verify-install.sh`——照计划 t07-S2：用法契约（env 三变量+默认值、exit 0/2/9）、结构钉（set -u、export MSYS2_ARG_CONV_EXCL='*' 与 export INSTALL_ROOT_WIN、ROOT_POSIX 双形态、fail 累积器、curl 一律 -o NUL）、§0-§8 步骤表逐步照抄。**§2 表内 grep 式的 `\|` 系 markdown 表格转义，真实 ERE 交替形态照 scratch data/tmp-t06/verify-install.sh:32 原文抄，勿把转义符当语法**。§3 LW 断言与 §6 ARP 断言为计划内已实测钉死的终版形态（含 `\\?\` 前缀剥离与 Trim([char]34,32,13,10)），禁自行改写。

## 先红后绿回归（序执行）

- 前置：`ls apps/desktop/src-tauri/target/release/bundle/nsis/inkforge_0.2.3_x64-setup.exe` 与 `…/resources/runtime/node.exe` 在（缺 node.exe 先 `pnpm sidecar:node`）；8788 探针 ≠200（200=有服务占用，停报勿自杀）。
- 红（门会红证明）：`node scripts/release-inventory.mjs --nsi data/tmp-t06/orig.nsi` rc=2 且 FAILED_CHECKS 含 MACRO；`VERIFY_OUT=data/tmp-t06 INSTALL_ROOT_WIN='I:\inkforge\data\tmp-t06\verifyroot-neg' EXE=apps/desktop/src-tauri/target/release/bundle/nsis/inkforge_0.2.1_x64-setup.exe bash scripts/ci-verify-install.sh` rc=2 且 FAILED_CHECKS 含 LISTING，跑完 verifyroot-neg 目录已清。
- 绿（自证）：计划 t07-S1 自证三项 rc=0（默认跑/--log gate-v4.log/负例）与 t07-S2 自证主项（INSTALL_ROOT_WIN='I:\inkforge\data\tmp-t06\verifyroot-ci' EXE=…0.2.3… bash，rc=0，关键行 LISTING=4131/PERSONAL=0/MIG=14/14/双 CMP_SAME/LW_MATCH/BOOKS=0/MARKER_OK/ARP_LEFT=0/VDIR_GONE_AFTER_CLEANUP/VERIFY PASS）。

## 验收命令（主审复核用）

```bash
node --check scripts/release-inventory.mjs
node scripts/release-inventory.mjs
node scripts/release-inventory.mjs --log data/tmp-t06/gate-v4.log
node scripts/release-inventory.mjs --nsi data/tmp-t06/orig.nsi   # 期望 rc=2 含 MACRO
git status --short   # 只许两新脚本 + 执行者本次提交外零残留
```

（verify-install 主审复跑耗时长，验收时执行者须附完成通知全文含各步打印行，主审抽查 LW/ARP/§7 三处关键行并按需复跑一次。）

## 约束

- 只 Create 上述两文件；禁改模板/stamp-nsi/build-dist/tests/计划/卡面；执行者只 commit 不 push。
- 提交信息照计划 t07-S3 钉死（`feat(release): CI 支撑脚本两件——…`，verify 行含 INVENTORY/VERIFY 关键计数与负例 rc，Refs: DEC-2026-1123-02, DEC-2026-1123-03）。
- 永不 `git add -A`、永不 `--no-verify`；卡外硬失败（8788 占用、参考包缺失、 makensis 类工具链红）即停报保留现场。
- 完成通知必含：两脚本各自跑命令与 rc、负例两件的 FAILED_CHECKS 原文、LISTING 计数、GUI 不适用（无 UI 改动）。
