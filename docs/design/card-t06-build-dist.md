# 卡 T-06：esbuild 双入口 bundle + 依赖闭包 staging 脚本（以下命令均在项目根目录执行）

## 根因
打包态需把 server（含 @inkforge/shared TS 源）编译为免 tsx 直跑产物，且 node_modules 须扁平无 symlink 随包（pnpm symlink 过 NSIS 会断）。

## 改动文件
- 新增 `apps/server/scripts/build-dist.mjs`（node 直跑，ESM）。行为：
  1. esbuild.build 两次：`apps/server/src/index.ts` → `apps/desktop/src-tauri/resources/server/server.mjs`；`apps/server/src/worker/main.ts` → `apps/desktop/src-tauri/resources/server/worker/worker.mjs`。公共 options：`bundle:true, platform:'node', target:'node22', format:'esm', splitting:false, sourcemap:false, logLevel:'info'`；external 恒等 6 项白名单：`['fastify','@fastify/cors','@fastify/static','better-sqlite3','koffi','zod']`（**@inkforge/shared 不 external，须被 bundle**）。
  2. external 闭包复制：对 6 个 external 从 `apps/server` 逐个 `createRequire(pathToFileURL(...)).resolve('<pkg>/package.json')` → `fs.realpathSync` 取物理目录 → BFS 读各包 package.json 的 `dependencies`+`optionalDependencies`（跳过 dev/peer）逐包解析 realpath → `fs.cpSync(real, <stage>/node_modules/<pkgName>, {recursive:true, dereference:true, filter: 源路径含 '.ignored' 或 '.bin' 则 false})`；同名包解析出两个不同 realpath 时 throw（fail loud）。
  3. 资源拷贝（全部 `fs.cpSync recursive`）：`apps/web/dist` → `resources/web/dist`；`apps/server/config/quality/cliches.default.txt` → `resources/server/config/quality/`；`apps/server/src/db/migrations/*.sql` → `resources/server/db/migrations/`。
  4. 脚本可重复执行（先清空 stage 目录再产）。
- `.gitignore` 追加一行：`apps/desktop/src-tauri/resources/`。

## 验收命令
```bash
node apps/server/scripts/build-dist.mjs                                          # 退出 0
ls apps/desktop/src-tauri/resources/server/server.mjs apps/desktop/src-tauri/resources/server/worker/worker.mjs   # 两文件非空
find apps/desktop/src-tauri/resources/server/node_modules -type l | wc -l        # 0
ls apps/desktop/src-tauri/resources/server/db/migrations                         # ≥2 个 .sql
ls apps/desktop/src-tauri/resources/server/config/quality                        # cliches.default.txt
ls apps/desktop/src-tauri/resources/web/dist/index.html                          # 存在
grep -c "from\"fastify\"\|from 'fastify'" apps/desktop/src-tauri/resources/server/server.mjs   # ≥1（external 保留 import，证明未内联）
```

## 约束
- 只许新增脚本 + 改 .gitignore 一行；超范围即停；不 commit。
- staging 里 node_modules 不得含 tsx/vitest/typescript。
- better-sqlite3 的 prebuilds 全平台目录可整拷（体积优化后续再说，本卡不做裁剪）。
