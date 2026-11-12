# 卡 T-A：favicon 接入 Tauri 图标链路 + 0.1.2 版本 bump

## 一、根因

`apps/web/public/favicon.svg` 是唯一真图标设计稿（256 viewBox、rx56 圆角底 #F8FAFC、#2B3A5C 书堆+安检门+传送带构图、圆角外透明；DEC-2026-1112-02 前置提交入库），但 `apps/desktop/src-tauri/icons/` 自 351b1c6 起一直是纯色占位方块（icon.png 实测 512×512 全像素单色 (30,30,48,255)、alpha 全 255），从未从设计稿生成——安装后桌面图标"全黑"即此。本卡把设计稿接入打包图标链并 bump 版本至 0.1.2。

## 二、改动文件

- `apps/desktop/src-tauri/icons/` 全套（icon.ico / icon.png / icon.icns / 32x32.png / 64x64.png / 128x128.png / 128x128@2x.png / Square*Logo.png / StoreLogo.png / android/* / ios/*）——由 `tauri icon` 重新生成，机械替换不手改。
- 版本 0.1.1→0.1.2 七处：`apps/server/package.json:3`、`apps/web/package.json:3`、`apps/desktop/package.json:3`、`apps/desktop/src-tauri/tauri.conf.json:4`、`apps/desktop/src-tauri/Cargo.toml:3`、`apps/server/src/app.ts:25`（health 返回值）、`apps/server/test/app.test.ts:5,:9`（断言）。
- `apps/desktop/src-tauri/Cargo.lock`：由 cargo check 自动刷新。
- 临时产物 `I:\inkforge\data\app-icon-1024.png`（data/ 已 gitignore，不入库）。

## 三、改法（命令钉死，均在仓库根执行；第三方 CLI 均经主审 2026-11-13 探针实证，照抄勿改形态）

1. `mkdir -p I:/inkforge/data`
2. 光栅化：`"J:/whisperjav/Library/bin/rsvg-convert.exe" -w 1024 -h 1024 -o "I:\inkforge\data\app-icon-1024.png" "I:\inkforge\apps\web\public\favicon.svg"`
   - 兜底（仅当 rsvg-convert 非零退出）：复制 favicon.svg 为 `data/app-icon-src.svg` 并把其中 `width="256" height="256"` 改为 `1024`，跑 `"C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" --headless=new --disable-gpu --default-background-color=00000000 --screenshot=I:\inkforge\data\app-icon-1024.png --window-size=1024,1024 "file:///I:/inkforge/data/app-icon-src.svg"`；随后跑同一 PIL 断言，断言不过（背景不透明）即停报主审，不得以不透明图标入库。
3. PIL 断言源图：`python -I -c "from PIL import Image; im=Image.open(r'I:\inkforge\data\app-icon-1024.png').convert('RGBA'); px=list(im.getdata()); assert im.size==(1024,1024) and len(set(px))>1 and min(a for *_,a in px)==0; print('OK', im.size, len(set(px)))"` → 打印 OK 且色数 >100（主审 128px 探针实测 283 色、角点 alpha=0，1024 只会更多）。
4. 重生成全套：`pnpm --filter @inkforge/desktop exec tauri icon "I:\inkforge\data\app-icon-1024.png"`（tauri v2 CLI，探针实证：默认输出 = tauri.conf.json 同级 icons/，**不传 -o**）。
5. 全套核对：`git status --porcelain apps/desktop/src-tauri/icons | wc -l` ≥ 20；`python -I -c "from PIL import Image; im=Image.open(r'I:\inkforge\apps\desktop\src-tauri\icons\icon.png').convert('RGBA'); px=list(im.getdata()); assert len(set(px))>1 and min(a for *_,a in px)==0; print('icon.png 多色且含透明')"`；`python -I -c "from PIL import Image; im=Image.open(r'I:\inkforge\apps\desktop\src-tauri\icons\icon.ico'); s=getattr(im,'sizes',None) or __import__('PIL.IcoImagePlugin',fromlist=['IcoFile']).IcoFile(open(r'I:\inkforge\apps\desktop\src-tauri\icons\icon.ico','rb')).sizes(); print(sorted(s)); assert max(w for w,h in s)>=256 and min(w for w,h in s)<=32 and len(s)>=5"`（探针实证 Pillow 12.3 的 Image 对象无 .sizes，IcoFile 兜底可用，返回 16~256 共 6 档）。
6. 版本 bump 七处逐个 Edit → `grep -rn "0\.1\.1" apps/server/package.json apps/web/package.json apps/desktop/package.json apps/desktop/src-tauri/tauri.conf.json apps/desktop/src-tauri/Cargo.toml apps/server/src apps/server/test` 零命中；`grep -n "0\.1\.2" apps/server/src/app.ts` 命中。
7. `cd apps/desktop/src-tauri && cargo check` → 退出 0；回仓库根；`git diff --stat apps/desktop/src-tauri/Cargo.lock` 含 inkforge-desktop 版本行变更。
8. 定向测试：`pnpm --filter @inkforge/server exec vitest run test/app.test.ts` → 1 passed。
9. `git status --porcelain apps/desktop/src-tauri/nsis` 输出为空（该文件本轮禁改）。

## 四、先红后绿回归测试

本卡无逻辑 bug 修复，回归=断言 3/5/6/8 即测试门：改前 icon.png 单色（已知基线 262144 像素 1 色）、改后必须多色+含透明；health 断言 0.1.2 必须绿。若 5 的 git 计数 <20 或 PIL 断言失败=红，停手报主审，不得强行提交。

## 五、验收命令（主审独立复核）

- 三、中 3/5/6/8/9 全部命令原样重跑，结果一致。
- `git log -1 --stat` 仅触及二、所列文件；commit 信息含 verify: 行与"GUI 未改动"注记（图标属安装包资产，web 页面零改动）。
- 主审另核：`python -I -c "from PIL import Image; im=Image.open(r'I:\inkforge\apps\desktop\src-tauri\icons\32x32.png').convert('RGBA'); px=list(im.getdata()); print(len(set(px)))"` >1。

## 六、约束

- 禁改 `apps/desktop/src-tauri/nsis/inkforge-installer.nsi`（构建不回写、含手工禁C守卫，DEC-2026-1113-01 裁决本轮禁改）；禁改 `apps/web/src/`、`apps/web/public/favicon.svg`、根 package.json 与 packages/shared（版本保持 0.1.0 先例）。
- 只 commit 不 push；`git add` 用明确路径（icons 目录 + 七处文件 + Cargo.lock），禁 `git add -A`；commit 前自查无密钥混入。
- commit 信息：`feat(desktop): favicon 接入 Tauri 图标链路与 0.1.2 版本 bump`，正文 verify: 行记录 PIL 断言输出与 vitest 结果，Refs: DEC-2026-1113-01。
- 环境 Windows+Git Bash：python 一律 `python -I`；外部工具用 Windows 绝对路径加引号；卡面命令照抄执行，任何一步输出与预期不符即停报，不得自行变通改设计稿或手改生成产物。
