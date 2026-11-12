# 卡 T-02：四处 import.meta.url 路径 env 覆盖（以下命令均在项目根目录执行）

## 根因
esbuild bundle 后源码目录结构消失，基于 import.meta.url 的 4 处路径推导在安装包内全部失真。需支持运行时 env 注入（Tauri 壳负责注入，本卡只做 TS 侧覆盖点），dev 态（env 未设）行为必须与现状完全一致。

## 改动文件（每处一行，模式统一：`const X = process.env.INKFORGE_?? ?? 原表达式`，原表达式逐字符保留在 ?? 右侧）
- `apps/server/src/index.ts` 约 :10：`WORKER_ENTRY` → 前缀 `process.env.INKFORGE_WORKER_ENTRY ??`
- `apps/server/src/db/migrate.ts` 约 :6：`MIGRATIONS_DIR` → 前缀 `process.env.INKFORGE_MIGRATIONS_DIR ??`
- `apps/server/src/http/routes.ts` 约 :21：`WEB_DIST` → 前缀 `process.env.INKFORGE_WEB_DIST ??`
- `apps/server/src/pipeline/chapter.ts` 约 :26：cliches 路径 → 前缀 `process.env.INKFORGE_CLIQUES_PATH ??`

## 验收命令
```bash
pnpm --filter @inkforge/server exec tsc --noEmit   # 0 error
pnpm --filter @inkforge/server test                # 全绿（env 未设 → 旧推导路径，既有用例不变）
```

## 约束
- 只许改上述 4 行（含必要 import 调整），超范围即停；不 commit。
- 不得改动推导表达式本身；不得改 env 名（逐字符与卡面一致）。
