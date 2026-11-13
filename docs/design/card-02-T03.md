# 卡 0.2-T03：recovery.test 同毫秒 heartbeat flake 修复（server +0）

## 根因/背景
test/worker/recovery.test.ts:95-101 附近：heartbeat 写入与 before 取值在同毫秒发生时，`after > before` 断言偶发失败（0.1.2 轮登记的已知 flake）。修法=播种 60 秒旧时间戳拉开间隔。

## 改动文件
- Modify `apps/server/test/worker/recovery.test.ts`（用例数不变，只动断言前置）

## 改法（钉死）
`heartbeatStep(db, c1.id, 'w1')` 调用前插入播种：
```ts
db.prepare('UPDATE run_steps SET heartbeat_at = ? WHERE id = ?').run(new Date(Date.now() - 60000).toISOString(), c1.id);
```
`before` 取值移到播种之后；断言增补 `expect(new Date(after2).getTime()).toBeGreaterThan(new Date(before).getTime())`。

## 先红后绿
本卡修 flake（间歇红），无法稳定复现红；以「修后连跑 5 次全绿」替代红验证，用例数不变（基线只增不减口径：不变即合规）。

## 验收命令（以下命令均在项目根目录执行）
```bash
pnpm --filter @inkforge/server exec vitest run test/worker/recovery.test.ts   # 连跑 5 次全绿
pnpm --filter @inkforge/server exec vitest run test/worker                    # 全绿
```

## 约束
- 只 commit 不 push：`test(server): recovery 心跳断言播种旧时间戳消同毫秒 flake`，正文 verify:+Refs: DEC-2026-1113-05。
- 挂机 run 进行中：禁触 data/inkforge.db、禁重启 server/worker；禁止改动 src/ 任何文件（本卡纯测试文件）。
- 用例数不得增减；超出 recovery.test.ts 的改动即停报。
