# 卡：建档向导直选蒸馏档案 + Run 页 404 优雅降级

以下命令均在项目根目录执行（相对路径）。

## 背景与根因

- owner 反馈②（功能新增，DEC-2026-1120-07）：新书建档向导（NewBookPage）没有风格档案选择步骤，须建完进详情页的「风格绑定面板」再绑定。目标=建档时即可勾选蒸馏档案（复用绑定语义：上限 4、首位=主档）。
- owner 反馈①残留（UX bug）：run 被删书级联清除或 run 不存在时，RunPage 无限「SSE 未连接（3s 重连）」——API 404 后应立即停止重连并显示「运行不存在」。

## 改动文件

### A. 建档直选档案

1. `apps/web/src/pages/NewBookPage.tsx`：
   - 创建表单新增「风格档案（可选，最多 4 个，第 1 个为主档）」区：checkbox 列表（数据源 `api.listStyleProfiles()`，加载失败降级为不显示该区并 console.warn，不阻断建档）
   - 交互照抄 BookDetailPage StyleBindPanel 的勾选上限逻辑（满 4 禁勾，title 提示）
   - 提交序列：`createBook(...)` 成功后，若勾选非空则紧接着 `bindStyle(book.id, body)`；bind 失败不回滚建书，在页内 msg 显示「书已建，但风格绑定失败：<原因>」并仍跳转书详情（跳转目标不变）
   - bind body 构造：若 StyleBindPanel 的 body 构造可复用则提取共享（如 `buildStyleBindBody(checked, dimsSource默认值)`）；不可干净提取则在 NewBookPage 内构造 **dimsSource 取面板同款默认值**（读 BookDetailPage.tsx 的 dimsSource 初始化照抄），并在两处加注释互指防漂移
2. `apps/web/src/pages/NewBookPage.test.tsx`：补用例——①勾选 2 档（第 1 为主）提交→断言 createBook 后调用了 bindStyle 且 primary/aux 顺序正确；②不勾选→不调 bindStyle；③bindStyle reject→仍跳转且 msg 含「绑定失败」；④满 4 禁勾第 5 个

### B. Run 页 404 降级

3. `apps/web/src/pages/RunPage.tsx`（及 SSE hook 所在文件，先 grep 定位）：
   - run 详情请求 404 或 SSE 连接收到 404/`error: not found` 时：停止重连循环，页面显示「运行不存在（可能已被删书级联清除）」+ 返回书架/书详情链接，不再显示「未连接（3s 重连）」
4. 对应测试文件补用例：run GET 404 → 渲染「运行不存在」且不再发起重连（可用 fake timers 断言无后续 fetch）

## 验收命令

```bash
pnpm --filter @inkforge/web exec tsc --noEmit
pnpm --filter @inkforge/web test
pnpm --filter @inkforge/server test
pnpm exec knip
```

全绿且基线只增不减（web 131+新增）。

## 约束

- 只 commit 不 push；Conventional 前缀+中文提交信息，正文 verify 结果+Refs: DEC-2026-1120-07。
- 禁 `git add -A`；逐文件 add（含本卡面）。
- 后端零改动为目标（bindStyle 既有 API 复用）；若发现必须动后端才能达成，停手呈报不得自行扩卡。
- GUI 提交信息注明「GUI 未验证（owner 真实测试）」。
- 现场与卡面冲突即停待裁决。
