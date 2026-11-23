# 卡：重打装机包并演练首启数据迁移（三修复随包）

以下命令均在项目根目录执行（相对路径）；涉外部路径命令用绝对路径。

> 派卡前置：t01/t02/t03(数据目录)/t04 已合入 HEAD。打包=构建+安装+取证，非禁入卡型，走 hy4。**铁律：不改任何 src 源码文件**——源码问题即停报。tauri build 失败（rc.exe/link.exe 类工具链错）即停报，不自行发明手工 makensis 路径。

## 根因/目标

三修复（术语表去污/仿写文件选择/dev 词表兜底）+ 装机数据目录搬迁（DEC-2026-1123-01，main.rs choose_data_root）需要随新安装包落到 owner 本机 D:\inkforge，并演练「首启一次性迁移旧 %APPDATA% 数据」真实路径（cargo 六例已证逻辑，装机演练证环境事实）。灾备已在位：C:\Users\57850\.zcode\backups\inkforge-appdata-20261123.zip。

## 步骤（序执行，每步一个可核对结果）

1. **读 runbook**：docs/release/0.2.1-release.md 打包节 + scripts/build-dist.mjs 头注释（>4KB 用 pointer 工具）。
2. **清场**：`curl -s -o NUL -w "%{http_code}" http://127.0.0.1:8788/api/health`=200 时，用 `powershell -NoProfile -Command 'Get-Process | Where-Object { $_.Path -like "D:\inkforge\*" } | Select-Object Id,ProcessId,Path | Format-Table'` 列壳与 sidecar 进程（先列后杀，按 Path 签名核，勿按名字误杀 dev 8787 进程），逐个 `taskkill /f /t /PID <壳pid>`；杀后 health 再查须 !=200。
3. **构建产物**：`node scripts/build-dist.mjs` 退出码 0 → 核验 `apps/desktop/src-tauri/resources/server/server.mjs` 与 `resources/web/dist/index.html` mtime 为今日；`grep -c "点击选择本地" apps/desktop/src-tauri/resources/web/dist/assets/*.js` 合计 ≥1（卡2 修复进包证据）。
4. **打安装包**：`pnpm --filter @inkforge/desktop build`（tauri build，nsis targets，自定义模板 nsis/inkforge-installer.nsi 直用=数据 hunk 随包）退出码 0 → 产物 `apps/desktop/src-tauri/target/release/bundle/nsis/` 下 `*_x64-setup.exe`（记下完整文件名）。
5. **安装**：`"<setup.exe 绝对路径>" /P` 退出码 0（/P=passive 升级模式，UpdateMode=1 不触发 DeleteAppData，数据不受勾选逻辑影响）。
6. **首启迁移演练**：启动安装目录主 exe（目录列取得 exe 名，`cmd /c start "" "<exe>"`）→ 轮询 health=200（间隔 5s，最多 12 次）。然后取证（只读，不改动）：
   - `ls D:/inkforge/data/` 须见：inkforge.db、config.json、inkforge.env、landing-words.txt、`.inkforge-data-migrated`、`inkforge-shell.log`（tail 须含「迁移」行）、backups/ 或 exports/ 或 imports/（旧目录有才见，无则缺为正常）；
   - `grep -c "inkforge-data-migrated-to" <(ls "C:/Users/57850/AppData/Roaming/dev.inkforge.app/")` 形态改为：旧目录 `ls "$APPDATA/dev.inkforge.app"` 须含 `.inkforge-data-migrated-to`（内容=新根路径）且 `data/inkforge.db` 仍在（旧目录永不删）；
   - `curl -s http://127.0.0.1:8788/api/landing-words` 的 `path` 字段 = `D:\inkforge\data\landing-words.txt`（词表随数据根迁移的证据；勿读 text 正文，1301）；
   - `curl -s http://127.0.0.1:8788/api/books | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).length))"` ≥1（书稿可读=迁移后库完好；只取条数）。
7. **收摊**：按步骤 2 同法 taskkill 壳树（/f /t /PID），health 复核 !=200。
8. **提交**：`git status --short` 仅当 resources/**（server.mjs/worker.mjs/web dist 等）有变化时逐文件 add（永不 -A，永不 --no-verify），提交信息 `chore(desktop): 重打装机包——三修复+数据目录迁移随包，装机首启演练证据在案`，正文列：安装包文件名、步骤 6 各取证行结果、`verify: 步骤 3/4/5 退出码 0；步骤 6 证据逐项在案`、`Refs: DEC-2026-1123-01`；只 commit 不 push。无 tracked 变化则不提交并在完成通知说明。

## 验收命令（主审复核用）

```bash
git status --short
ls "D:/inkforge/data" | head -20
tail -3 "D:/inkforge/data/inkforge-shell.log"
ls "C:/Users/57850/AppData/Roaming/dev.inkforge.app" | head -10
```

## 约束

- 不改 src/**、docs/**、tauri.conf.json、NSIS 模板——发现包内资源缺项/构建红只停报。
- 1301 纪律：不读书稿正文、词表正文、config.json 值（只看文件名/条数/路径字段）。
- 安装/构建任一硬失败（非瞬态）即停报，保留现场（不重试安装第三次）；进程清理按完整命令行签名先列后杀+杀后读回（L-20261114-02/L-20261115-05）。
- 完成通知必含：安装包文件名+大小、步骤 6 全部取证原文、GUI 实装未验证（owner 真实测试）。
