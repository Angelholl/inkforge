# 卡 0.2-T09：风格蒸馏 server 补全——HTTP 蒸馏与列表端点（server 169→171）

## 根因/背景
0.2 计划 v2（docs/plans/2026-11-13-inkforge-0.2-draft.md，任务 0.2-T09）。安装态 CLI 不可用的限制由 HTTP 端点闭合（DEC-2026-1112-02 的 GUI 侧通道）。

## 改动文件
- Modify `apps/server/src/style/distill.ts`、`apps/server/src/http/routes.ts`、`apps/server/src/http/schemas.ts`、`packages/shared/src/api.ts`、`apps/web/src/api/client.ts`
- Create `apps/server/test/http/style.test.ts`（+2）

## 改法（钉死）
- distill.ts：input 增可选 `sourceText`（与 sourcePath 二选一，均缺 → 抛 `'样本为空，禁止蒸馏'`）；`source_path = sourceText ? 'inline:' + sha256(sourceText).slice(0,8) : input.sourcePath`（M12 钉值，长度 15）；`metrics_json = JSON.stringify(computeStyleMetrics(sourceText ?? readFile(sourcePath)))`。
- `GET /api/style-profiles` → `{id,name,version,createdAt,metrics}[]` 按 created_at DESC。
- `POST /api/style-profiles/distill {name,text}` → 201 `{profileId}`；text 去空白 <200 字 → 400 `'样本为空，禁止蒸馏'`；provider=`createRoleProvider(config,'summarizer')`、timeoutMs=`config.timeouts.summarize`、samples=`pickFewShotSamples(text)`。
- web client.ts：+listStyleProfiles/distillStyle/bindStyle（供 T12 GUI 页用）。

## 先红后绿
style.test.ts +2（先红，buildApp 注入 mock provider）：
1. `'distill：注入 mock → 201 且列表可见 metrics 非空且 source_path=inline: 前缀'`（列表行 sourcePath 以 `inline:` 开头且长度 15）
2. `'空样本 → 400 固定文案'`
→ 红；实现 → 绿。

## 验收命令（以下命令均在项目根目录执行）
```bash
pnpm --filter @inkforge/server exec vitest run test/http test/style   # 全绿（CLI 路径零回归）
pnpm --filter @inkforge/server exec tsc --noEmit                       # 0 错
pnpm --filter @inkforge/web exec vitest run                            # web 10 不减（client.ts 改动零回归）
```

## 约束
- 只 commit 不 push：`feat(server): 风格档案 HTTP 蒸馏与列表端点（inline 源登记）`，正文 verify:+Refs: DEC-2026-1113-05。
- CLI 蒸馏路径零回归；禁改 gate.ts/plainproto 解析/nsi/物证目录/生产库；禁重启服务。
- 用例数只增不减；超范围即停报。
