# 卡 R3：断连中止挂点抽 abortOnDisconnect helper（写集=3 文件）

**根因：** code-review Standards 建议 #2「断连挂点抽 helper」挂账开工（DEC-2026-1126-10）。routes.ts 两处逐字同构的 `reply.raw.once('close', …)` 模式收口为具名 helper；本卡与 R1 并行、写集互斥。

**改动文件集（只准动这三个）：** `apps/server/src/http/close-abort.ts`（A）、`apps/server/test/http/close-abort.test.ts`（A）、`apps/server/src/http/routes.ts`（M，仅两处调用点+两行注释删除）

**改法（精确值照抄计划真值 docs/plans/2026-11-26-shared-consolidate-and-helper.md Task-03 接口块与步 2 代码块，用 pointer_tools read_pointer 读 :135-194 区段）：**
1. close-abort.ts：`export function abortOnDisconnect(reply: FastifyReply, ac: AbortController): void`，行为 `reply.raw.once('close', () => { if (!reply.sent) ac.abort(); })`；docblock 必须保留「req.raw 的 close 在请求体读完即触发（真 socket），会秒杀本次调用，故必须挂 reply.raw；inject 测不出此差异」原委。
2. 测试两条：EventEmitter 假 reply.raw——close+未发送→aborted=true；close+已发送→不 abort（照抄计划代码块）。
3. routes.ts 顶部加 `import { abortOnDisconnect } from './close-abort';`；:397-401 与 :1521-1525 两段的三行挂点替换为 `abortOnDisconnect(reply, ac);`（各段上方注释行删除，原委移 helper docblock；`const ac = new AbortController();` 保留）。

**回归测试：** 新增 close-abort.test.ts 两条；既有真 socket 保护网必须 PASS：settings-import.test.ts「真 socket…→200」与 summarize-confirm.test.ts「真 socket…」+「commit 在途断连不触发落库」。基线 server 677→≥679。

**验收命令（以下均项目根执行）：** `pnpm --filter @inkforge/server test`（全绿 ≥679，点名三条保护网）；`pnpm --filter @inkforge/server typecheck`（零错）。

**约束：** 纯重构零行为变更（守卫/信号语义逐字等价）；只 commit 不 push；commit 只 add 写集三文件、永不 -A/--no-verify；提交信息 Conventional+中文，正文 `verify:` + `Refs: DEC-2026-1126-10`，UTF-8 文件走 `git commit -F`。执行中读 >4KB 文件或查看改动用 pointer_tools。非交互禁提问；files_touched 必须=写集且非空；不连主库；输出与提交信息禁引业务原文串。
