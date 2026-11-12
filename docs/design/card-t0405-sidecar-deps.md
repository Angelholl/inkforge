# 卡 T-04/05：esbuild devDep + node.exe sidecar 获取（以下命令均在项目根目录执行）

## 根因
sidecar 打包需要 ① esbuild 显式 devDep（当前仅 vite 传递带入，pnpm 严格隔离下脚本 import 不可靠）；② 独立 node.exe 随包分发（版本钉值，禁复制系统安装，保可复现）。

## 改动文件
- `apps/server/package.json`：`pnpm --filter @inkforge/server add -D esbuild`（锁当前稳定版）。
- 新增 `apps/desktop/NODE_VERSION`：先跑 `node --version` 实测，去掉 v 前缀写入（一行，形如 `22.21.1`；**禁止凭记忆写版本号**）。
- 新增 `apps/desktop/scripts/fetch-node.mjs`：读 `NODE_VERSION` → 下载 `https://nodejs.org/dist/v${ver}/win-x64/node.exe` → `apps/desktop/src-tauri/resources/runtime/node.exe`（fs.mkdirSync recursive；下载用全局 fetch + fs 流写；失败非零退出并输出错误）。
- 根 `package.json` scripts 增：`"sidecar:node": "node apps/desktop/scripts/fetch-node.mjs"`。

## 验收命令
```bash
pnpm --filter @inkforge/server exec esbuild --version          # 输出 0.2x 版本号非空
pnpm sidecar:node                                              # 下载成功退出 0
apps/desktop/src-tauri/resources/runtime/node.exe --version    # 输出 v+NODE_VERSION 一致
ls -l apps/desktop/src-tauri/resources/runtime/node.exe        # > 50MB
```

## 约束
- 下载走系统代理，慢速 <200KB/s 或断流时运行 `powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\57850\.zcode\scripts\v2rayn-fastest.ps1"` 后重试（切换会重启代理中断数秒），结论写入卡回执。
- 只许改/增上述文件；超范围即停；不 commit。
- node.exe 落 resources/ 下，该目录后续会进 .gitignore（本卡不管）。
