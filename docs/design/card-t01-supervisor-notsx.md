# 卡 T-01：supervisor 免 tsx 直跑回归测试（以下命令均在项目根目录执行）

## 根因
打包态（esbuild bundle）下生产 node_modules 无 tsx，`apps/server/src/worker/supervisor.ts:34` 的 spawn 若仍带 `--import tsx` 会 ERR_MODULE_NOT_FOUND → worker 退避无限重启。supervisor.ts 已改为按 `INKFORGE_WORKER_TSX==='0'` 分派（该文件改动已在工作树，勿重复改，勿回退），本卡补回归测试锁行为。

## 改动文件
- 新增 `apps/server/test/worker/fixtures/worker-plain.mjs`：内容两行——`process.send?.({ type: 'ready' }); setInterval(() => {}, 1e6);`
- 修改 `apps/server/test/worker/supervisor.test.ts`：在 `describe('spawnWorkerSupervisor')` 内追加一个用例「INKFORGE_WORKER_TSX=0 → 免 tsx 直跑 .mjs fixture，kill 后退避重启」：仿第一个用例结构（entryPath 指向 fixtures/worker-plain.mjs，env 加 `INKFORGE_WORKER_TSX: '0'` 与 `INKFORGE_SUPERVISOR_BACKOFF_MS: '100'`、临时 dataDir），断言 5s 内 readyCount===1、child.kill() 后 5s 内 readyCount===2、随后 `handle.stop()`。既有 4 用例不得改动/删除。

## 验收命令
```bash
pnpm --filter @inkforge/server test -- worker/supervisor   # 预期 5 passed（原 4 + 新 1）
pnpm --filter @inkforge/server exec tsc --noEmit           # 0 error
```

## 约束
- 只许新增上述两文件改动，超范围即停；不 commit（由主审验收后统一提交）。
- 测试风格与同文件既有用例一致（轮询等待、超时上限、tmpDir 清理）。
