# 卡 0.2-T08：入口 A server 三——continue 模式管线（server 167→169）

## 根因/背景
0.2 计划 v2（docs/plans/2026-11-13-inkforge-0.2-draft.md，任务 0.2-T08）。入口 A 第三段：continue 续写模式——锚点先验、风格不注入、voice-match QC。挂机 run 已终态，chapter.ts 可落盘。

## 改动文件
- Modify `apps/server/src/http/schemas.ts`、`apps/server/src/http/routes.ts`、`apps/server/src/pipeline/chapter.ts`
- Create `apps/server/test/pipeline/continue.test.ts`（+2）

## 改法（钉死）
- createRunSchema 增 `mode: z.enum(['generate','continue']).default('generate')`。
- **POST /api/runs 校验顺序钉死（M11）：① book 存在（404）→ ② mode==='continue' 锚点校验（`fromChapter-1` 章存在且 current_version_id 非空，否则 400 `{error:'chapter N 无续写锚点'}`）→ ③ 既有 blueprint 逐章循环（400）→ ④ createRun 透传 mode**。generate 路径顺序不变（②③ 对 generate 恒短路/原样）。
- 管线（签名零变更）：`const runMode = runRow?.mode ?? 'generate';`；continue 时 ①风格注入短路 `if (book.styleProfileId && runMode !== 'continue')`（续写不注入）；② `voiceRefMetrics = runMode==='continue' && prevTexts.length>0 ? computeStyleMetrics(prevTexts.join('\n')) : undefined` 传入 runL0Checks → style_drift 经既有 softMajor 门控，零新增放行/绕过。

## 先红后绿
continue.test.ts +2（先红）：
1. `'continue：绑定档案不注入风格且 l0 含 style_drift'`（2 章 original 种子 + 绑定 mock 档案 → continue 跑第 3 章 → draft 版本 `style_sample_ids_json==='[]'` 且 qc output_json.l0.checks 含 style_drift）
2. `'continue 无锚点 → 400 且先于 blueprint 校验'`（无蓝图书 POST continue fromChapter=1 → 400 error 含「续写锚点」而非「blueprint missing」——顺序断言）
→ 红；实现 → 绿。

## 验收命令（以下命令均在项目根目录执行）
```bash
pnpm --filter @inkforge/server exec vitest run test/pipeline/continue.test.ts   # 2 passed
pnpm --filter @inkforge/server exec vitest run                                  # server 全量 170 全绿（157+1+3+2+7，generate 路径零变化）
pnpm --filter @inkforge/server exec tsc --noEmit                                 # 0 错
```

## 约束
- 只 commit 不 push：`feat(server): continue 续写模式（锚点先验 + 风格不注入 + voice-match QC）`，正文 verify:+Refs: DEC-2026-1113-05。
- chapter.ts 管线签名零变更；禁改 gate.ts/plainproto 解析/nsi/物证目录/生产库；禁重启服务。
- 用例数只增不减；超范围即停报。
