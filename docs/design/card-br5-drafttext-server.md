# 执行卡 BR-5：蓝图散文 draftText·server

## 一、根因
owner 反馈二拍板 D4：蓝图卡片直输纯中文草稿不再被「不是合法 JSON」红字拒绝，作为新字段 `draftText` 发给 blueprint-suggest 由 LLM 扩写成完整蓝图；合法 JSON 仍走现有结构化 seed 确定性合并路径。本卡=server 侧最小加法（web 入口在 BR-6）。

## 二、改动文件与改法
计划真值源=docs/plans/2026-11-26-bind-relocation-prose-draft.md §3.5（字面量逐条钉死，按指针工具读取）。
1. `packages/shared/src/api.ts` :219-227：BlueprintSuggestBody 增 `draftText?: string;`（与 seed 平级可选）。
2. `apps/server/src/http/routes.ts`：**注意 blueprintSuggestSchema 内联在 routes.ts:65（schemas.ts 无此项）**——加 `draftText: z.string().min(1).max(20000).optional()`；suggestBlueprintCore(:454) 签名增第 4 参 `draftText?: string`；单章 POST :430 调用改传 body.draftText；batch :444 调用不动。
3. 注入（:490 worldviewBrief 后并列）：`const draftTextBrief = draftText?.trim() ? \`【散文草稿】用户已为本章写好草稿，请保留其情节走向与要点，扩写为本章完整蓝图（GOAL/BEATS/HOOK/LANDING）：\n${draftText}\` : '';` 槽插 :500 prevTail 与 :501 task 之间：`...(draftTextBrief ? [{ name: 'draftText', content: draftTextBrief, budgetChars: 3000, stable: false, keep: 'head' as const }] : [])`。
4. :524 warnings 并列：`if ((draftText?.length ?? 0) > 3000) warnings.push('散文草稿超 3000 字，planner 草稿槽已按 head 截断');`

## 三、先红后绿回归测试
- R-BR5-1（test/http/blueprint-suggest.test.ts）`it('BR：draftText 进 schema 且注入 planner user；空串 400（D4）')`：POST {chapterNo:1,draftText:'主角夜探旧宅，发现密室'}→200 且捕获 plannerReq.user 含【散文草稿】与原文；{draftText:''}→400（zod 兜底禁 500）。
- R-BR5-2（同文件）`it('BR：draftText 超 3000 head 截断 + warning 可观测')`：构造总长>3000 含头/尾标记→user 含头部存活标不含尾部牺牲标、warnings 含「散文草稿超 3000 字」。

## 四、验收命令（以下命令均在项目根目录执行）
1. `pnpm --filter @inkforge/server test -- test/http/blueprint-suggest.test.ts` → 全绿；T9（:80-87 seed schema 例）零回归。
2. `grep -n "draftText" apps/server/src/http/routes.ts packages/shared/src/api.ts` → shared 1+schema 1+签名/调用/brief/槽/warning 各 1。
3. `git diff -- apps/server/src/http/routes.ts` → 目视 :434-452 batch 段零改动；`grep -c "mergeSeedIntoBlueprint" apps/server/src/http/routes.ts` 与改前持平。

## 五、约束
禁改：batch 端点（不吃 draftText）、mergeSeedIntoBlueprint 与 seed 合并语义、plot/spectrum/imitation 注入槽预算、fusion/apply。draftText 与 seed schema 不加 refine（两键独立可选）。每卡一次提交只 commit 不 push，`verify:`+`Refs:` 尾注；永不 --no-verify/-A。卡外问题即停回报。
