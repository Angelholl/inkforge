# 实现计划：0.2.3 发版链 CI 化（CI 支撑脚本 t07 + release.yml/PE 适配 t08 + 发版收尾序 R）

- **日期：** 2026-11-23
- **决策真值源：** `docs/decision-log.md:577`（DEC-2026-1123-02，0.2.3 发版两裁决：双物理证明/模板机制）与 `docs/decision-log.md:587`（DEC-2026-1123-03，CI 化两拍板：0.2.3 等 CI 链建成再发/全链上 CI、0.2.4 起 push tag 即发版）。两 DEC 均已 owner 拍板，本计划只编码、不重开。
- **参考先例：** `docs/release/0.2.2-release.md`、`docs/release/0.2.1-release.md`（发版静检项、上载形态、存证章节模板）；`docs/design/card-2026-11-23-release-t06-nsi-macro.md`（makensis charset 实测修正段，G1 之源）。
- **任务数：** 2 张执行卡（t07 → t08，串行，同工作树 ≤1 卡）+ 1 个发版收尾序 R（主模型亲执，6 步）。
- **执行域定界（只定界，派卡纪律归主审）：** t07/t08 均为打包/CI 层非禁入型（DEC-2026-1123-03 执行安排）；首跑调试（dispatch 反复触发至全绿）= 主模型亲执，不进卡。

## 目标

1. 把 0.2.3 发版链全量上 CI：tag `v*.*.*` 触发 windows-latest 单 job——依赖安装（pnpm/rust 缓存）→ 版本门 → 测试四连 → 打包链 → PE 门 → 静态清点 → 物理验证装 → artifact →（仅 tag）Release 上载 + digest 回读 + 公开三验；`workflow_dispatch` = 验证模式不建 Release。
2. 打包层的「换机可打包」由 stamp 步兑现：CI 上 tauri build 前必须跑一次 `INKFORGE_STAMP_NSI=1 node apps/desktop/scripts/stamp-nsi.mjs`（runner 路径 ≠ 仓库存放值，模板 6 行机器面由 stamp 以 import.meta.url/LOCALAPPDATA 改写，`apps/desktop/scripts/stamp-nsi.mjs:61-74`）。
3. 发版包零个人数据 = 双物理证明入流水线：a) 生成 NSI 静态清点（`scripts/release-inventory.mjs`）；b) 正式包验证装落盘全量清点（`scripts/ci-verify-install.sh`）。

## 非目标

- 不改打包产物语义（NSI 模板零改动、stamp-nsi.mjs 零改动、build-dist 零改动）。
- 不做 owner 真实 GUI 测试、不做本机旧数据升级路径演练（CI 只能净装，DEC-2026-1123-03 已明示边界）。
- 不发 0.2.3 本身（发版动作=收尾序 R，且以 CI 全绿为前置）。

## 架构与数据流

```
push tag v*.*.* / workflow_dispatch
  └─ job release (windows-latest, contents:write, concurrency release-${{ github.ref }}, timeout 90m——critic 中低风险纳保：首跑冷缓存逼近 60m，失败 run 的 cache post 仍存、二轮收敛)
     checkout(fetch-tags) → pnpm setup(读 packageManager) → node22+pnpm缓存 → rust-cache
     → pnpm install --frozen-lockfile
     → [仅tag] 版本门：ref 去 v == tauri.conf.json version
     → 测试四连：test(664) / typecheck / lint / audit --prod(单次网络重试)
     → pnpm sidecar:node（node.exe → resources/runtime，gitignored，CI 必显式跑）
     → node apps/server/scripts/build-dist.mjs
     → INKFORGE_STAMP_NSI=1 stamp-nsi.mjs（就地盖章 6 行机器面）
     → pnpm --filter @inkforge/desktop build（tauri build，2>&1 | tee → tauri-build.log）
     → PE 门（INKFORGE_PE_ASSERT=1）
     → release-inventory.mjs --log tauri-build.log（生成 NSI 静态清点=物理证明 a）
     → ci-verify-install.sh（/S 净装 D:\inkforge-ci → 清点 → 首启取证 → 杀树 → 卸载=物理证明 b）
     → sha256sums.txt → upload-artifact@v4
     → [仅tag] body(tag注记+SHA256行) → action-gh-release@v2 → REST digest 回读比对 → 公开三验(302/MZ/latest)
```

本地打包事实基线（计划全部建立其上，均已读源核实）：3736 条 File 行源=`${INKFORGE_RES}` 宏（模板 :1544-:5285）；机器面仅 6 行（:3 `!addincludedir`、:44/:47 ICON、:49 INKFORGE_RES、:51 MAINBINARYSRCPATH、:56 ADDITIONALPLUGINSPATH）；tauri build 原样拷贝模板 → `target/release/nsis/x64/installer.nsi`；tauri 内部 makensis 低冗长度（本地 tauri-build-023.log 仅 `Running makensis…`/`Finished 1 bundle at:`，无 `Total size:`）；参考包 `target/release/bundle/nsis/inkforge_0.2.3_x64-setup.exe`（作废为参考件，sha=eed2a8b4…，不上载）。

## 全局约束（钉死清单）

- **G1 makensis charset（t06 卡面实测钉）：** 裸调 makensis 编 UTF-8 无 BOM 模板必须 `/V4 /INPUTCHARSET UTF8`（`/V1`/`/V2` 不打印 File 清单、abort 行可能不进 log；成功判据=`Total size:` 完成行 + 产物 exe 双在）；`/OUT=` 形态打不开，产物落脚本目录 `nsis-output.exe`；Git Bash 调 makensis 必 `export MSYS2_ARG_CONV_EXCL='*'`。tauri build 内部自带 charset 探测，无需干预。
- **G2 rc 直取纪律：** 禁 `cmd | grep` 判成败、禁管道吞 rc。GitHub `shell: bash` = `bash --noprofile --norc -eo pipefail {0}`（已核 docs.github.com workflow-syntax），tee 管道不吞 rc，可放心 `build 2>&1 | tee log`。
- **G3 Git Bash 吞反斜杠：** 一切含反斜杠的生成/改写脚本一律落盘 `.mjs`/`.sh` 执行，禁 heredoc/`-e` 内联（唯一豁免：无反斜杠的单行 node -e，如 digest 回读 JSON 解析）。
- **G4 MSYS2_ARG_CONV_EXCL 与 //c 互斥：** `ci-verify-install.sh` 顶部 `export MSYS2_ARG_CONV_EXCL='*'` 后，`//f` 形态失效——全脚本禁 `taskkill //`，杀树统一走 powershell 单引号 `-Command` + `$env:` 传路径（CI powershell 调用一律单引号包 -Command）。
- **G5 提交纪律：** 永不 `git add -A`、永不 `--no-verify`；执行者只 commit 不 push（收尾序 R 主模型除外）；Conventional 前缀 + 中文描述 + `verify:`/`Refs:` 正文。
- **G6 测试基线 664 只增不减**（server 506 + web 156 + shared 2）。
- **G7 hy4 窗口内非禁入**（t07/t08 均打包/CI/测试基建层，DEC-2026-1123-01 通道拍板兼容）。
- **G8 NSI 计数口径钉（防双坑）：** 统计 File 指令行一律 JS `line.trimStart().startsWith('File ')`（**带尾空格**）。双坑实证：① grep 工具/`\s*` 正则会把 `FileOpen/FileWrite/FileClose`（模板 :539-:715 共 6 行，inkforge 安装日志/探针 hunk）当 `File` 前缀误计入（`^\s*File`=3746、`^ {0,8}File`=3745 均伪值）；② `\s` 可跨行放大计数。形态分账（本次逐面实测）：File 指令行总数 **3739** = `/a` 宏 3732 + `/r` 宏 2 + 引号宏 2（favicon/index.html）+ 主二进制 1（:1054）+ WebView2 条件 2（:973/:981）；`INKFORGE_RES` 全文出现 3737（1 define + 3736 File）；引号内盘符绝对路径 `"[A-Z]:\` 恰 6 处；个人面黑名单在 File 行零命中（全模板 `\data\` 仅 2 处 `;` 注释行 :5276/:9741）。
- **G9 数据面观察口径（`apps/desktop/src-tauri/src/main.rs`）：** 新根标记 `MARKER_NEW=.inkforge-data-migrated`，净装内容=`fresh-install`（:253）、互锁重装内容=`fresh-init`（:236）；`inkforge-shell.log` 仅在有 note 时创建（:54 端口占用、:81 迁移注记）——**CI 净装=文件不存在，本机自证=存在且含「本安装全新初始化，不迁移」**（本机 %APPDATA% 已有互锁标记），两态都算绿，红态=含「迁移失败」/「回退旧数据目录」。壳写 env 模板含 `STRATA_MODEL=mock`；`/api/landing-words` 返回 `path` 字段=生效词表全路径；`/api/books` 净装长度 0。
- **G10 版本戳真值：** `apps/desktop/src-tauri/tauri.conf.json` version `0.2.3`；tag 名 `v0.2.3` 必须与之相等（CI 版本门）。root `package.json` 同为 0.2.3，门只对 conf（单一真值）。
- **G11 runner 事实（已核实）：** windows-latest = Windows Server 2025（VS2026）；Rust/rustup/cargo 预装（Rustup 1.29.3）；Git Bash 预装（`C:\Program Files\Git\bin\bash.exe`，sha256sum/find/sed/awk 随附）；jq 1.8.2 预装；**WebView2 Runtime 未预装**（装机期 NSIS `INSTALLWEBVIEW2MODE=downloadBootstrapper`+`/silent` 静默下载安装，模板 :59-:60 已钉，runner 直连可用）；D: 盘存在（runner-images 官方公告「D: 盘文件系统 2026-11-30 起 NTFS→ReFS」+ Windows workspace 位于 `D:\a` 惯例）→ `INSTALL_ROOT_WIN` 默认 `D:\inkforge-ci` 判据成立，脚本仍带写入探针兜底。时效注（主审补）：官方公告 D 盘 2026-11-30 起 NTFS→ReFS——本轮发版（11-23/24）仍在 NTFS 窗口内；11-30 后跑 CI 亦不阻（sqlite WAL 与 NSIS 均支持 ReFS），届时若 §1 装机探针红按 F 系停报流程处理，不预改判据。
- **G12 yml 语法自证命令（主审定正）：** `python -c "import yaml,sys; yaml.safe_load(open('.github/workflows/release.yml', encoding='utf-8-sig')); print('YAML_PARSE_OK')"`——主审 2026-11-23 本机实测 `PYYAML_OK`（planner 无 Bash 未实测的 [INFO_GAP] 就此销号）；零网络（dlx 走 registry 吃代理波动，弃）。utf-8-sig 兼容带/不带 BOM。

---

## Task t07：CI 支撑脚本两件（Create ×2，cwd=项目根相对可跑）

### t07-S1 Create `scripts/release-inventory.mjs`

**用法契约：**

```
node scripts/release-inventory.mjs [--nsi <path>] [--log <path>]
  --nsi  默认 apps/desktop/src-tauri/target/release/nsis/x64/installer.nsi（生成 NSI）
  --log  可选：makensis /V4 log 或 tauri build log（二选一来源，断言见 I12）
exit：0 全绿 / 2 有红（末尾打印 FAILED_CHECKS 逐行）/ 9 cwd 非项目根
输出：逐行 `CHECK <名称>: PASS|FAIL <详情>`；末行 `INVENTORY PASS` 或 `INVENTORY FAIL`
读文件编码 latin1（scratch gate-check.mjs 同法，ASCII 正则稳定）；cwd 断言=存在 apps/desktop/src-tauri/tauri.conf.json
```

**钉值常量（0.2.3 基线；hazard 注释须写进脚本头：NSI 内容变更须重录，同 0.2.2 backlog）：**

```js
const EXPECT_FILE_TOTAL = 3739;   // = MACRO 3736 + MAINBIN 1 + WEBVIEW2COND 2
const EXPECT_MACRO      = 3736;   // File 行含 "${INKFORGE_RES}
const EXPECT_MAINBIN    = 1;      // File "${MAINBINARYSRCPATH}"
const EXPECT_WEBVIEW2COND = 2;    // File "/oname=$TEMP\...${WEBVIEW2BOOTSTRAPPERPATH|WEBVIEW2INSTALLERPATH}
const EXPECT_QUOTED_ABS = 6;      // 全文 /"[A-Z]:\\/g 命中数（仅 6 机器 define 行）
const EXPECT_TABLES     = 2;      // config\quality\ 两个 .default.txt 装载行
const EXPECT_FONTS_FILE = 1;      // dist\fonts 装载行
const EXPECT_FONTS_DELETE = 1;    // fonts 卸载行
```

**断言清单（I1..I12，全 JS 口径，`t = line.trimStart()`，File 行判据 `t.startsWith('File ')` 带尾空格、Delete 行 `t.startsWith('Delete ')`）：**

| # | 名称 | 口径（正则/比较） | 期望 |
|---|------|------|------|
| I1 | VERSION 门 | `/^!define VERSION "(\d+\.\d+\.\d+)"$/m` 提取值 == tauri.conf.json version | 相等 |
| I2 | 6 机器行白名单 | 下列 6 式各恰 1 行命中（m 标志、锚定行首）：`/^!addincludedir ".*target\\release\\nsis\\x64"$/`、`/^!define INSTALLERICON ".*icons\\icon\.ico"$/`、`/^!define UNINSTALLERICON ".*icons\\icon\.ico"$/`、`/^!define INKFORGE_RES ".*src-tauri\\resources"$/`、`/^!define MAINBINARYSRCPATH ".*target\\release\\inkforge-desktop\.exe"$/`、`/^!define ADDITIONALPLUGINSPATH ".*tauri\\NSIS\\Plugins\\x86-unicode\\additional"$/` | 各 1 命中（后缀形态白名单，不限盘符/用户名=换机语义） |
| I3 | File 总数 | trimStart startsWith `'File '` 计数 | == 3739 |
| I4 | 宏形态 | I3 子集含 `"${INKFORGE_RES}` | == 3736 |
| I5 | 主二进制 | 含 `"${MAINBINARYSRCPATH}"` | == 1 |
| I6 | WebView2 条件行 | 含 `${WEBVIEW2BOOTSTRAPPERPATH}` 或 `${WEBVIEW2INSTALLERPATH}` | == 2 |
| I7 | 非白名单残余 | I3 − I4 − I5 − I6 | == 0 |
| I8 | 绝对路径零 File | I3 子集匹配 `/[A-Za-z]:\\/` | == 0 |
| I9 | 全文引号绝对路径 | `/"[A-Z]:\\/g` 计数 | == 6 |
| I10 | 迁移对 | expected=`readdirSync('apps/server/src/db/migrations').filter(/^0\d{3}_.*\.sql$/)` 长度；file=I3 子集 `/migrations\\0\d{3}_.*\.sql/`；del=Delete 子集同式 | file==del==expected（现 14） |
| I11 | 字体+词表 | fonts file=`/dist\\fonts/` 计数、fonts delete=Delete 子集 `/fonts/` 计数、tables=I3 子集 `/config\\quality\\(landing-words\|cliches)\.default\.txt/` | 1 / 1 / 2 |
| I12 | node_modules 覆盖 + 个人面 + 无 abort | ① tops=`readdirSync('apps/desktop/src-tauri/resources/server/node_modules')` 去点开头，needle 算法照抄 scratch `data/tmp-t06/nm-coverage.mjs:8-12`（含 `@` scope 与 .dll 分支），missing==0（TOPS 数打印，现为 65）；② 个人面黑名单作用于**全部 File 行拼接文本**，7 式零命中：`/AppData\\Roaming/i`、`/\\\.inkforge\\/`、`/\\data\\/`、`/inkforge\.db/i`、`/landing-words\.txt/`（default 含 `-default.` 不命中本式）、`/(^|[\\"/])config\.json/`、`/(^|[\\"/])\.env/`；③ 无 abort——给了 `--log`：文本不含 `aborting creation` 且含 `Total size:`（/V4 log）**或** `Finished 1 bundle at:`（tauri log）；未给 `--log`：`target/release/bundle/nsis/inkforge_<I1版本>_x64-setup.exe` 存在且 size>0（tauri build rc0+产物在=无 abort 结构性证明） | 全绿 |

**自证（t07 执行者在本地跑，全绿为完成条件）：**

- [ ] `node scripts/release-inventory.mjs` → 期望 rc=0，关键行 `CHECK FILE_TOTAL: PASS 3739`、`CHECK MACRO: PASS 3736`、`CHECK MAINBIN: PASS 1`、`CHECK WEBVIEW2COND: PASS 2`、`CHECK REMAINDER: PASS 0`、`CHECK ABS_FILE: PASS 0`、`CHECK QUOTED_ABS: PASS 6`、`CHECK MIGRATIONS: PASS 14/14`、`CHECK FONTS: PASS 1/1`、`CHECK TABLES: PASS 2`、`CHECK TOPS: PASS 65 MISSING 0`、`CHECK PERSONAL: PASS 0`、`CHECK NO_ABORT(bundle exe): PASS`、末行 `INVENTORY PASS`
- [ ] `node scripts/release-inventory.mjs --log data/tmp-t06/gate-v4.log` → 期望 `CHECK NO_ABORT(/V4 log): PASS`（含 `Total size:`），末行 `INVENTORY PASS`
- [ ] 负例抽查（验证门会红而非恒绿）：`node scripts/release-inventory.mjs --nsi data/tmp-t06/orig.nsi` → 期望 `INVENTORY FAIL` 且 FAILED_CHECKS 含 `MACRO`（orig 为宏化前快照）rc=2

**提交（t07-S3，只 commit 不 push）：**

```
feat(release): CI 支撑脚本两件——release-inventory.mjs 静态清点门 + ci-verify-install.sh 物理验证装门
verify: INVENTORY PASS 3739/3736/1/2/6/14/1/1/2/65/0；VERIFY PASS rc=0 LISTING=4131 PERSONAL=0；
        负例 orig.nsi FAIL rc=2
Refs: DEC-2026-1123-02, DEC-2026-1123-03
```

### t07-S2 Create `scripts/ci-verify-install.sh`

**用法契约：**

```
bash scripts/ci-verify-install.sh   （cwd=项目根）
env（均可覆盖）：
  INSTALL_ROOT_WIN  默认 'D:\inkforge-ci'（G11 判据；Windows 形态反斜杠，供 /D= 与 powershell）
  EXE               默认 glob apps/desktop/src-tauri/target/release/bundle/nsis/inkforge_*_x64-setup.exe，须恰一命中
  VERIFY_OUT        默认 ${RUNNER_TEMP:-data/tmp-t06}（verify-listing.txt 落此）
exit：0 全绿 / 2 有红（末尾 FAILED_CHECKS: 逐行）/ 9 cwd 非项目根
```

**结构钉：** `set -u`；顶部 `export MSYS2_ARG_CONV_EXCL='*'`（G4）与 `export INSTALL_ROOT_WIN`（§5/§6 powershell 子进程读 `$env:INSTALL_ROOT_WIN` 的必要条件）；路径双形态：`ROOT_POSIX="${INSTALL_ROOT_WIN//\\//}"`（bash find/ls/rm 用），powershell 一律读 `$env:INSTALL_ROOT_WIN`；失败累积器 `FAILED_CHECKS` 字符串，`fail <名称> <详情>` 函数追加并打印；curl 输出设备一律 `-o NUL`（MSYS/原生 curl 双兼容，scratch 实证）。

**步骤表（每步=断言+精确期望；§n 名称打印 `== n <名> ==`）：**

| § | 动作 | 断言/期望 |
|---|------|------|
| 0 | 前置 | cwd 断言（tauri.conf.json 存在，否则 exit 9）；EXE glob 恰 1 命中（nullglob 数组计数，≠1 → fail `EXE_GLOB_N`）；8788 空闲：`code=$(curl -s -o NUL -w '%{http_code}' http://127.0.0.1:8788/api/health 2>/dev/null || true)` ≠200（200 → fail `PORT_BUSY`，提示先收摊 dev/t05 残留）；`INSTALL_ROOT_WIN` 写入探针：`mkdir -p "$ROOT_POSIX" && : > "$ROOT_POSIX/.write-probe" && rm "$ROOT_POSIX/.write-probe"` 失败 → fail `INSTALL_ROOT_NOT_WRITABLE`（D 盘缺失兜底：执行者改 workflow `env: INSTALL_ROOT_WIN` 并停报重录，禁改脚本默认值迁就坏境） |
| 1 | /S 净装 | `rm -rf "$ROOT_POSIX"` → `"$EXE" /S "/D=$INSTALL_ROOT_WIN"`（/D= 必须末参）→ 轮询 60×5s `[ -f "$ROOT_POSIX/inkforge-desktop.exe" ]`，超时 fail `INSTALL_TIMEOUT`。装机期含 WebView2 静默下载（G11），预算充裕；首次超时看 §1 输出与 GitHub 步骤日志定位（首跑已知风险点，见失败模式速查 F1） |
| 2 | 首启前落盘清点（纯包内容） | `find "$ROOT_POSIX" -type f | sed "s\|$ROOT_POSIX/\|\|" \| sort > "$VERIFY_OUT/verify-listing.txt"`；`LISTING=4131`（wc -l，本地轮同值——CI 复现同构结论，不符即停报勿改数）；`PERSONAL=$(grep -icE 'AppData\|\.inkforge\|/data/\|inkforge\.db\|landing-words\.txt$\|(^\|/)config\.json$\|(^\|/)\.env\|(^\|/)inkforge\.env' …)==0`（scratch verify-install.sh:32 同式）；`MIG=$(grep -c 'resources/server/db/migrations/0' …)` == `ls apps/server/src/db/migrations/0*.sql \| wc -l`（现 14/14）；`cmp` 双默认表 `resources/server/config/quality/landing-words.default.txt`、`…cliches.default.txt` 对 `apps/server/config/quality/*` → 打印 `WORDS_CMP_SAME`/`CLICHES_CMP_SAME`；RUNTIME_PRESENT（node.exe+server.mjs 双在） |
| 3 | 首启取证 | `powershell -NoProfile -Command 'Start-Process -FilePath "$env:INSTALL_ROOT_WIN\inkforge-desktop.exe" -WorkingDirectory "$env:INSTALL_ROOT_WIN"'`（单引号+env，G4）→ health 轮询 12×5s 至 200，超时 fail `HEALTH_TIMEOUT`（打印末轮 code）；LW（主审按本机轮实证修正两处）：期望串 `EXPECT="$INSTALL_ROOT_WIN\\resources\\server\\config\\quality\\landing-words.default.txt"`（**含 `server\` 段**——planner 原钉漏该段）；API 实测返回带扩展路径前缀 `\\?\`（本机轮取证原文 `\\?\I:\...\landing-words.default.txt`），比较前先剥：`V=$(curl -s http://127.0.0.1:8788/api/landing-words \| node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).path))")`；`V=${V#'\\?\'}`（单引号形态剥前缀，无则原样）；`${V,,}` 与 `${EXPECT,,}` 全等 → `LW_MATCH`，不等 fail `LW_PATH` 打印 V 与 EXPECT 双值；BOOKS：`/api/books` JSON 长度==0 |
| 4 | 数据面观察（G9 两态） | 标记 `$ROOT_POSIX/data/.inkforge-data-migrated` 内容 ∈ {`fresh-install`, `fresh-init`} → `MARKER_OK`；shell.log 两态：不存在 → OK（CI 净装期望态）；存在 → 必含 `本安装全新初始化，不迁移` 且不含 `迁移失败`/`回退旧数据目录`，否则 fail `SHELLLOG_BAD`；`grep -c 'STRATA_MODEL=mock' "$ROOT_POSIX/data/inkforge.env"` ≥1 |
| 5 | 杀树 | `powershell -NoProfile -Command 'Get-Process \| Where-Object { $_.Path -like "$env:INSTALL_ROOT_WIN\*" } \| ForEach-Object { Stop-Process -Id $_.Id -Force }'` → sleep 2 → health 探针必须**不再** 200（含 curl 失败）否则 fail `KILL_INCOMPLETE` |
| 6 | 卸载 | `"$ROOT_POSIX/uninstall.exe" /S` → 轮询 30×2s：`LEFT=$(powershell -NoProfile -Command '@(Get-ItemProperty "HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*" -ErrorAction SilentlyContinue \| Where-Object { $_.InstallLocation -and $_.InstallLocation.Trim([char]34,[char]32,[char]13,[char]10) -ieq $env:INSTALL_ROOT_WIN }).Count')` 至 0，超时 fail `UNINSTALL_TIMEOUT`；终值 `ARP_LEFT=0`。（演进两轮：planner 原 DisplayName 式在本机永红→主审改 InstallLocation 剥引号式；critic H1 实测再纠——`Out-String` 追加 CRLF 致 `-ieq` 恒 False=空洞绿灯，终版 `Trim([char]34,[char]32,[char]13,[char]10)` 为 critic 本机验证过的语义，禁再改写） |
| 7 | 残留兜底 | 若目录仍存：`RESIDUE_N=$(find … -type f \| wc -l)` 打印（卸载残留为 0.2.2 起挂账，**不判红**）→ `rm -rf "$ROOT_POSIX"`；断言目录已不存在，否则 fail `RESIDUE_CLEANUP`；打印 `VDIR_GONE_AFTER_CLEANUP` |
| 8 | 终局 | FAILED_CHECKS 空 → 打印 `VERIFY PASS` exit 0；非空 → 逐行打印后 `VERIFY FAIL` exit 2 |

**自证（t07 执行者本地跑；EXE 必显式传——本机 bundle 目录有 8 个历史 exe，glob 会多命中）：**

- [ ] 前置：`pnpm sidecar:node` 已跑过（`ls apps/desktop/src-tauri/resources/runtime/node.exe` 在）；8788 空闲
- [ ] `VERIFY_OUT=data/tmp-t06 INSTALL_ROOT_WIN='I:\inkforge\data\tmp-t06\verifyroot-ci' EXE=apps/desktop/src-tauri/target/release/bundle/nsis/inkforge_0.2.3_x64-setup.exe bash scripts/ci-verify-install.sh; echo rc=$?` → 期望 rc=0，关键行：`LISTING=4131`、`PERSONAL=0`、`MIG=14/14`、`WORDS_CMP_SAME`、`CLICHES_CMP_SAME`、`RUNTIME_PRESENT`、`health=200`、`LW_MATCH`、`BOOKS=0`、`MARKER_OK`（本机互锁先例在案 → 取值 `fresh-init` 属合法绿；CI 上为 `fresh-install`）、`SHELLLOG_OK`、`ARP_LEFT=0`、`VDIR_GONE_AFTER_CLEANUP`、末行 `VERIFY PASS`
- [ ] 负例抽查（防恒绿）：`VERIFY_OUT=data/tmp-t06 INSTALL_ROOT_WIN='I:\inkforge\data\tmp-t06\verifyroot-neg' EXE=apps/desktop/src-tauri/target/release/bundle/nsis/inkforge_0.2.1_x64-setup.exe bash scripts/ci-verify-install.sh; echo rc=$?` → 期望 rc=2 且 FAILED_CHECKS 含 `LISTING`（0.2.1 包文件数 ≠4131，版本门语义实证）；跑完确认 verifyroot-neg 已被 §7 清理

---

## Task t08：release.yml + PE 脚本 CI 适配（Create + Modify，与 t07 串行）

### t08-S1 Modify `apps/desktop/src-tauri/tests/pe_subsystem_regression.ps1`（CI 适配，仅两处插入）

**改动规格（唯一写法；默认路径——env 未设——行为零改动）：**

1. 在 `$baselineFile = Join-Path $env:TEMP …` 行（现 :10）之后插入 exe 覆盖块（供负例自证，默认不触发）：
```powershell
# CI 适配（DEC-2026-1123-03）：INKFORGE_PE_EXE 覆盖被测 exe（负例自证用）
if ($env:INKFORGE_PE_EXE) {
  $exe = [System.IO.Path]::GetFullPath((Join-Path (Get-Location).Path $env:INKFORGE_PE_EXE))
}
```
2. 在 `$currentLine = "SUBSYSTEM=…"` 行（现 :42）之后插入纯断言模式块（必须在基线读写之前）：
```powershell
# CI 适配（DEC-2026-1123-03）：INKFORGE_PE_ASSERT=1 → 无论基线有无都断言 Subsystem==2（CI runner 每次全新，%TEMP% 基线无意义）
if ($env:INKFORGE_PE_ASSERT -eq '1') {
  if ($current -ne 2) {
    Write-Host "FAIL: PE assert-only Subsystem=$current($(Get-SubsystemLabel $current)), expected 2(GUI)"
    exit 1
  }
  Write-Host 'PASS: PE assert-only Subsystem=2(GUI)'
  exit 0
}
```

**自证（t08 执行者本地三连；前置 `ls apps/desktop/src-tauri/target/release/inkforge-desktop.exe` 与 `…/resources/runtime/node.exe` 在，缺则先 `pnpm sidecar:node`）：**

- [ ] `powershell -NoProfile -ExecutionPolicy Bypass -File apps/desktop/src-tauri/tests/pe_subsystem_regression.ps1; echo rc=$?` → 期望原语义不变：`PASS: … 2(GUI)`（本机已有基线则 AFTER=2）rc=0
- [ ] `INKFORGE_PE_ASSERT=1 powershell -NoProfile -ExecutionPolicy Bypass -File apps/desktop/src-tauri/tests/pe_subsystem_regression.ps1; echo rc=$?` → 期望 `PASS: PE assert-only Subsystem=2(GUI)` + rc=0（CI 同款调用形态）
- [ ] `INKFORGE_PE_ASSERT=1 INKFORGE_PE_EXE=apps/desktop/src-tauri/resources/runtime/node.exe powershell -NoProfile -ExecutionPolicy Bypass -File apps/desktop/src-tauri/tests/pe_subsystem_regression.ps1; echo rc=$?` → 期望 `FAIL: PE assert-only Subsystem=3(console), expected 2(GUI)` + rc=1（rc 语义实证）

### t08-S2 Create `.github/workflows/release.yml`

**骨架+钉值清单（执行者照表写 yml；所有 `run:` 步显式 `shell: bash`——Windows 默认 pwsh 语义不同，禁依赖）：**

```yaml
name: release
on: { push: { tags: ["v*.*.*"] }, workflow_dispatch: {} }
permissions: { contents: write }
concurrency: { group: release-${{ github.ref }}, cancel-in-progress: false }
jobs:
  release:
    runs-on: windows-latest
    timeout-minutes: 90
```

**步骤表（序位即执行序，不得换序——stamp 漏跑/换序见失败模式 F2/F3）：**

| # | 步 | uses/run（钉值） | 期望结果 |
|---|----|------|------|
| 1 | checkout | `actions/checkout@v4`，with：`fetch-depth: '0'`、`fetch-tags: 'true'`（annotated tag 注记本地可读，body 步用。**首跑 tag 模式实测修正**：depth 1 时 action 拼 `+<sha>:refs/tags/vX` 与 fetch-tags 的 `+refs/tags/*` 双映射相撞 → `Cannot fetch both` Checkout 红（run 45173379784）；depth 0 全量取 tag 无撞，dispatch 模式两态皆兼容，仓小全 fetch 成本秒级） | — |
| 2 | pnpm | `pnpm/action-setup@v4`（无 with；读 package.json `packageManager: pnpm@12.18.0`） | — |
| 3 | node | `actions/setup-node@v4`，with：`node-version: '22'`、`cache: pnpm`（engines `>=22.11 <25` 满足） | — |
| 4 | rust 缓存 | `Swatinem/rust-cache@v2`，with：`workspaces: 'apps/desktop/src-tauri'`（rustup 预装 G11） | — |
| 5 | install | `pnpm install --frozen-lockfile` | rc0 |
| 6 | 版本门 | `if: github.event_name == 'push'`；run：`TAG_VERS="${GITHUB_REF_NAME#v}"`；`CONF_VERS=$(node -p "require('./apps/desktop/src-tauri/tauri.conf.json').version")`；`echo "tag=$TAG_VERS conf=$CONF_VERS"`；不等 `exit 2`（打印 `VERSION_GATE_FAIL`）；dispatch 跳过 | tag==conf |
| 6.5 | **Build web（首跑后主审直修增补，run 45164747081）** | `pnpm build:web`——SPA history 回退用例（api.test.ts:121）依赖 `apps/web/dist/index.html`，本地常在而 CI 净 checkout 无（dist/ gitignored）→ Test 前必须建 web | rc0，产出 web/dist |
| 7 | test | `pnpm -r --if-present run test` | 664 绿（只增不减 G6） |
| 8 | typecheck | `pnpm -r --if-present run typecheck` | 0 错 |
| 9 | lint | `pnpm lint` | 零输出 |
| 10 | audit | `pnpm audit --prod \|\| (sleep 15 && pnpm audit --prod)`——单次网络抖动重试语义：两次皆红才红（真漏洞不会被洗白） | rc0（零新增漏洞比基线） |
| 11 | sidecar | `pnpm sidecar:node`（node.exe → `resources/runtime`，gitignored，CI 必显式跑） | rc0 |
| 12 | build-dist | `node apps/server/scripts/build-dist.mjs` | rc0 |
| 13 | stamp | `INKFORGE_STAMP_NSI=1 node apps/desktop/scripts/stamp-nsi.mjs` | stdout 含 `stamp: 就地盖章`（version=0.2.3）；LOCALAPPDATA 缺失即 exit1 不落盘 |
| 14 | tauri build | `pnpm --filter @inkforge/desktop build 2>&1 \| tee "$RUNNER_TEMP/tauri-build.log"`（bash 自带 `-eo pipefail` rc 不吞，G2） | 末段含 `Finished 1 bundle at: …inkforge_0.2.3_x64-setup.exe` |
| 15 | PE 门 | `env: { INKFORGE_PE_ASSERT: '1' }`；run：`powershell -NoProfile -ExecutionPolicy Bypass -File apps/desktop/src-tauri/tests/pe_subsystem_regression.ps1` | `PASS: PE assert-only Subsystem=2(GUI)` rc0 |
| 16 | 静态清点 | `node scripts/release-inventory.mjs --log "$RUNNER_TEMP/tauri-build.log" \| tee "$RUNNER_TEMP/inventory.log"` | 末行 `INVENTORY PASS` |
| 17 | 验证装 | `bash scripts/ci-verify-install.sh`（INSTALL_ROOT_WIN 默认 `D:\inkforge-ci`；listing 落 `$RUNNER_TEMP/verify-listing.txt`） | 末行 `VERIFY PASS`；`MARKER_OK=fresh-install`、`SHELLLOG` 不存在（CI 净装） |
| 18 | sha256 | `working-directory: apps/desktop/src-tauri/target/release/bundle/nsis`；run：`sha256sum inkforge_*_x64-setup.exe > sha256sums.txt && cat sha256sums.txt` | 64 hex + `inkforge_0.2.3_x64-setup.exe` |
| 19 | artifact | `actions/upload-artifact@v4`，with：`name: inkforge-release-bundle-${{ github.ref_name }}`、`if-no-files-found: error`、path 4 行：bundle/nsis/`inkforge_*_x64-setup.exe`、bundle/nsis/`sha256sums.txt`、`${{ runner.temp }}/verify-listing.txt`、`${{ runner.temp }}/inventory.log`（dispatch 验证模式唯一产物，名含 ref_name 与 tag 模式不冲突） | 4 文件上载 |
| 20 | body | `if: github.event_name == 'push'`；run：`git tag -l "$GITHUB_REF_NAME" --format='%(contents)' > "$RUNNER_TEMP/release-body.md"`；`printf '\nSHA256: %s\n' "$(cut -d' ' -f1 < apps/desktop/src-tauri/target/release/bundle/nsis/sha256sums.txt)" >> "$RUNNER_TEMP/release-body.md"`；`[ -s … ] \|\| { echo EMPTY_TAG_MESSAGE; exit 2; }` | body=注记全文+SHA256 行 |
| 21 | release | `if: github.event_name == 'push'`；`softprops/action-gh-release@v2`，with：`tag_name: ${{ github.ref_name }}`、`name: inkforge ${{ github.ref_name }}`、`body_path: ${{ runner.temp }}/release-body.md`、`files: apps/desktop/src-tauri/target/release/bundle/nsis/inkforge_*_x64-setup.exe`、`draft: false`、`prerelease: false`（幂等已核：同 tag 已有 release → 更新；同名资产 `overwrite_files` 默认 true → 替换，tag 重跑安全） | release 创建/更新 |
| 22 | digest 回读 | `if: github.event_name == 'push'`；run：`LOCAL=$(cut -d' ' -f1 < apps/desktop/src-tauri/target/release/bundle/nsis/sha256sums.txt)`；`curl -s -H "Authorization: Bearer ${{ github.token }}" -H "User-Agent: inkforge-release" "https://api.github.com/repos/${{ github.repository }}/releases/tags/${{ github.ref_name }}" > "$RUNNER_TEMP/release.json"`；node 单行解析断言 `assets[0].digest === 'sha256:'+LOCAL`（无反斜杠，内联豁免 G3），不等 exit 2 | `DIGEST_MATCH=YES` |
| 23 | 公开三验 | `if: github.event_name == 'push'`；run：`EXE_NAME=$(awk '{print $2}' apps/desktop/src-tauri/target/release/bundle/nsis/sha256sums.txt)`；A 未认证 HEAD `https://github.com/${{ github.repository }}/releases/download/${{ github.ref_name }}/$EXE_NAME` → `-w '%{http_code}'` == 302；B `curl -sL -r 0-3 -o "$RUNNER_TEMP/head4.bin"` 同 URL → `head -c 2 … \| grep -q MZ` → 打印 `PUBLIC_HEAD_MZ_OK`；C REST `/releases/latest` node 断言 `tag_name==ref_name && !draft && !prerelease` → `LATEST=<tag>`，否则 exit 2 | 三验全过 |

**t08 自证：**

- [ ] `python -c "import yaml,sys; yaml.safe_load(open('.github/workflows/release.yml', encoding='utf-8-sig')); print('YAML_PARSE_OK')"` → 期望打印 `YAML_PARSE_OK`（G12 主审定正版）
- [ ] t08-S1 三连测试全过（上方 checkbox）
- [ ] `git status --porcelain` 恰两文件：`.github/workflows/release.yml`（新增）、`apps/desktop/src-tauri/tests/pe_subsystem_regression.ps1`（修改）
- [ ] 交叉核对：yml 步骤表与本文钉值逐项一致（node 版本/concurrency/if 门/序位）；`grep -c "if: github.event_name == 'push'"`（yml 内）== 5（步骤 6/20/21/22/23）

**提交（t08-S3，只 commit 不 push）：**

```
ci(release): release.yml 全链流水线（tag/dispatch 双模）+ PE 回归脚本 assert-only 适配
verify: YAML_PARSE_OK；PE 三连 rc=0/0/1；diff 两文件；push 门 5 处
Refs: DEC-2026-1123-03
```

---

## Task R：发版收尾序（主模型亲执，CI 全绿后才可动）

- [ ] **R1 前提核**：master 上 workflow_dispatch 首跑调试已全绿（run id/URL 留档）；t07/t08 已 push；`git status` 干净；确认 0.2.3 本地参考包作废态（DEC-2026-1123-03 裁决①，不上载）。
- [ ] **R2 打 tag**：`git tag -a v0.2.3 -F <注记文件>`，注记正文（落盘 data/tmp-t06/tag-msg.txt 后 `-F`，内容钉）：`inkforge 0.2.3 —— 装机版数据目录搬迁（安装目录\data\ 扁平）+ 发版链 CI 化首个 CI 包`、`安装包 inkforge_0.2.3_x64-setup.exe 由 CI 从本 tag 构建，包零个人数据（双物理证明：生成 NSI 静态清点 + 装机落盘全量清点）；SHA256 见 Release 资产 digest 行`。
- [ ] **R3 push tag**：`git push origin v0.2.3` → 自动触发 release.yml tag 模式。
- [ ] **R4 等绿**：轮询 REST `GET repos/Angelholl/inkforge/actions/runs?event=push`（git credential PAT，upload-release.sh:12 同法），过滤 `head_branch=="v0.2.3"`，至 `conclusion=="success"`；记录 run id/html_url。
- [ ] **R5 复核**：本地复跑 digest 回读（release body SHA256 行 vs assets[0].digest）+ 公开三验（302 / ranged GET MZ / releases/latest），命令同 yml 步骤 22/23 同构（PAT 直连）。
- [ ] **R6 存证**：写 `docs/release/0.2.3-release.md`（沿 0.2.2 章节模板），必含：版本物（tag→commit、包名、SHA256、Release URL）、CI 链（run id/URL、首跑调试轮次）、构建链与静检（CI 顺位+inventory/verify 关键计数）、验证基线（CI 664/typecheck/lint/audit）、上载与验证（服务端 digest==本地、公开三验输出）、清点取证全文（inventory.log 全文 + verify-listing 4131 + LW_PATH/BOOKS/MARKER 取证行）、内容账、GUI 未验证 owner 点位（引 DEC-2026-1123-03 边界）。提交 `docs(release): v0.2.3 发版存证——CI 首个 tag 触发包、服务端 digest 与公开三验`，正文 `verify: R4/R5 结果` + `Refs: DEC-2026-1123-02, DEC-2026-1123-03` → commit + push。

---

## 失败模式速查（首跑调试判据）

- **F1 装机超时（步骤 17 INSTALL_TIMEOUT/HEALTH_TIMEOUT）**：判据=装机期含 WebView2 Evergreen 静默下载（G11，镜像未预装）。若 bootstrapper 静默装失败（Server 2025 提权/网络），修法=t08 增补「ensure-webview2」步：注册表探测 `{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}`（HKLM/HKCU 双查，GUID=模板 :35 同源）缺失则 fwlink 2124701 下载 bootstrapper `/silent` 安装后复探——此为唯一预设的增补位，其余一律停报。
- **F2 stamp 漏跑/漏改（预期失败模式，非静默）**：未跑步骤 13 → 模板原样拷贝含 `I:\inkforge\…` File 源 → makensis 对 File 缺源硬报错 → 步骤 14 rc≠0 红。stamp 自身 LOCALAPPDATA 缺失 → exit 1 不落盘（stamp-nsi.mjs:67-71）。
- **F3 序位违例**：sidecar(:11) 晚于 tauri build → bundle 时 `resources/runtime/node.exe` 缺失（tauri resources 映射 tauri.conf.json:41）；inventory(:16) 早于 build → 生成 NSI 不存在。序位即上表，不得调整。
- **F4 版本门红**：tag 与 conf 不等 → 步骤 6 exit 2；只有 owner 决策能改版本，执行者禁 bump。
- **F5 Release 重复/重跑**：tag 重跑 → 步骤 21 幂等更新+资产替换（已核 README）；dispatch 永不触发布步骤（if 门）；concurrency 按 ref 串行防并行双跑。**半态 runbook（critic b 面补）**：21 已成功但 22/23 确定性红（digest 不符/latest 未指）→ 处置序=REST PATCH `releases/{id}` 先改 tag_name 挪开旧 release（L-20261103-12 先例：删 release 不先挪 tag 会连 tag 一起删）→ DELETE 该 release → 同 SHA 重推 tag（force，包不变不重打）触发 20-23 幂等重建；瞬态红（网络 5xx）直接 Actions rerun 即可。
- **F6 跨机不字节等 + 星号文件名（tag 首跑 45174153519 实测钉，主审）**：① CI 产物**跨 run 非字节等**（NSIS/rust 嵌时间戳：dispatch 轮 65,520,563 vs tag 轮 65,526,291）——digest 回读的正确口径=**同 run 内 local↔server 比对**（步 24 已如此），禁跨 run 比 digest；② runner `sha256sum` 输出二进制模式 `hash *name`，凡从 sha256sums.txt 取文件名处必 `tr -d '*'`（步 23 首跑 404 根因，已修；取 hash 用 `cut -d' ' -f1` 天然免疫）。

## 五查自检表

| 查 | 结论 |
|----|------|
| ① 规格覆盖 | DEC-2026-1123-02 裁决①双物理证明→t07 两脚本（I12③+§2-§4）；裁决②stamp 换机→yml 步骤 13。DEC-2026-1123-03 裁决①参考包作废→R1；裁决②全链序位→yml 步骤表 1-23；`workflow_dispatch`=验证模式→步骤 20-23 五处 if 门；0.2.4 起 push tag 即发版→本链即终态 |
| ② 步骤唯一可写 | 每步单一命令/单一钉值；t08-S1 两插入块给出全文与插入锚点；t07 断言表给出逐条正则与期望值，无「酌情/合适」字样 |
| ③ 类型一致 | bash 脚本/PowerShell/yml/commit message 各归其位；脚本落盘（G3/G4）；powershell 单引号 -Command |
| ④ 隐含输入-环境 | runner D:/Rust/GitBash/jq/sha256sum/curl 已核预装；WebView2 未预装→F1 兜底位；js-yaml 经 pnpm dlx 免本地依赖 |
| ④ 隐含输入-前置/端点/约定/漂移 | 测试需 install 后；sidecar 先于 bundle（F3）；端点 api.github.com/objects.githubusercontent.com/go.microsoft.com/nodejs.org；cwd=项目根（两脚本 exit 9 断言）；annotated tag 注记非空（步骤 20 `[ -s ]`）；NSI 钉值=0.2.3 基线，内容变更重录（t07-S1 头 hazard 注释，沿 0.2.2 backlog 挂账口径） |
| ⑤ 已知风险 | audit 重试语义（步骤 10 双跑）；D 盘缺失兜底（§0 探针+改 env 停报）；stamp 漏跑=硬红非静默（F2）；gh-release 幂等（F5）；dispatch/tag 防重（if 门+concurrency+artifact 异名） |
