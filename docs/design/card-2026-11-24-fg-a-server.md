# 卡 FG-A（server）：融合门 GET 增档案名映射 + confirm 陈旧指纹 409 守卫（2026-11-24）

## 一、根因/目标

门（`GET /api/books/:bookId/fusion-gate`）的 `binding` 只回档案 UUID，前端被迫裸显 `sp1`/`pp1` 类 id，owner 无法读懂门内容；且 confirm 无陈旧检测——用户开门后若参考资料在别处被改（如书详情面板改绑定），旧确认仍会照单全收。目标：①GET show 响应 `binding` 增 `profileNames: Record<string,string>`（id→名，查不到不进 map，**不入指纹**）；②confirm body 支持可选 `fingerprint`，与当下注入面指纹不一致 → 409 零写，不带则维持现行为。指纹算法与 `gen_gate` 存储零改动（`fingerprint.ts`、`apply.ts` 不碰）；confirm applied/skipped 语义零改动。计划真值=`docs/plans/2026-11-24-fusion-gate-readability.md` Task-01。

## 二、改动文件（不得越界）

- Modify `packages/shared/src/fusion.ts`（`:36-43` binding 增 `profileNames`；`:53-66` confirm body 增 `fingerprint?`）
- Modify `apps/server/src/http/schemas.ts`（`:366-407` `fusionGateConfirmSchema` 增 `fingerprint: z.string().min(1).optional()`）
- Modify `apps/server/src/http/routes.ts`（`:1355-1370` GET show 组装；`:1373-1387` confirm 守卫）
- Test Modify `apps/server/test/http/fusion-gate.test.ts`（gate/confirm describe 末尾追加 5 用例）

仅这 4 文件入提交；docs 由主审收口。**零改动存证**（不得顺手改）：`apps/server/src/fusion/fingerprint.ts`、`apps/server/src/fusion/apply.ts`、`apps/server/src/fusion/engine.ts`、`apps/server/src/fusion/tension.ts`。

## 三、改法

先红后绿：先在 fusion-gate.test.ts 追加 5 用例跑红，再实现跑绿。要点钉死：

1. **shared（fusion.ts）**：`FusionGateReportDto.binding` 增 `/** 档案 id→展示名（style 主辅 + plot/spectrum/imitation 已绑 id；查不到的 id 不进 map）。不入指纹。 */ profileNames: Record<string, string>`（必填、可为 `{}`——向后兼容钉）；`FusionGateConfirmBody` 增 `/** GET 响应原样回传；服务端与当下注入面指纹比对，不一致 → 409 零写。可选=旧客户端兼容。 */ fingerprint?: string`。
2. **schemas.ts**：`fusionGateConfirmSchema` 对象内增一行 `fingerprint: z.string().min(1).optional(),`（其余键与 superRefine 校验一字不改）。
3. **routes.ts GET show（:1355-1370）**：`reply.send` 前组装（imports 已齐：`imitationRepo:17`、`injectionFaceFingerprint:29`、`plotRepo:33`、`spectrumRepo:34`，**零新增 import**）：
   - style 主辅：`face.styleBinding` 非空时按 `[primaryProfileId, ...auxProfileIds]` 逐 id `db.prepare('SELECT name FROM style_profiles WHERE id = ?').get(id)`（表同 `routes.ts:1302` 先例），命中才 `profileNames[id] = row.name`；
   - 三类 planner：`book.plotProfileId/spectrumProfileId/imitationProfileId` 逐个非空判 `plotRepo.getPlotProfile(db,id)?.name`（plot.ts:44）/`spectrumRepo.getSpectrumProfile(db,id)?.name`（spectrum.ts:44）/`imitationRepo.getImitationProfile(db,id)?.name`（imitation.ts:61），命中才入 map；
   - `binding` 对象加 `profileNames` 键；键旁注释「profileNames 不入指纹（展示用查名，fingerprint.ts 注入面七键不含）」。pass 分支（:1327）零改动。
4. **routes.ts confirm（:1373-1387）**：`const face = buildInjectionFace(bookId, book);` 提出复用；`const { fingerprint: clientFingerprint, ...decisions } = parsed;`（剥离后 `decisions` 结构恰为 `ConfirmDecisions`，apply.ts 签名不动）；守卫 `if (clientFingerprint !== undefined && clientFingerprint !== injectionFaceFingerprint(face))` → `return reply.code(409).send({ error: '参考资料已变动，本次确认内容过期，请重新打开确认门', reason: 'stale-fingerprint' })`（`{ error, reason }` 形状沿 `routes.ts:1437-1441` 先例）；否则 `applyFusionConfirm(db, bookId, decisions, face)` 原样。守卫在事务启动之前=不一致即零写。
5. **测试（fusion-gate.test.ts gate/confirm describe 末尾追加，同文件顺序执行、状态链依序依赖；夹具中性仿形，禁读 data/**）**：
   - 用例 1「GET show → binding.profileNames 钉值（style 主辅 + 三类 planner 名）」：直 SQL 插三类档案并绑定——`plot_profiles(id,name,source_path,source_hash,structure_json,created_at) VALUES('plot-fixture-1','剧情中性档案','fixture://plot','hash-plot','[]',now)`；`spectrum_profiles` 同列集（`'spec-fixture-1','光谱中性档案'`）；`imitation_profiles(id,name,source_path,source_hash,version,structure_json,style_json,blueprint_json,metrics_json,created_at)`（`'imit-fixture-1','仿写中性档案',…,1,'[]','{}','[]','{}',now`）；`booksRepo.setBookPlotProfile/setBookSpectrumProfile/setBookImitation(db, bookId, 各 id)`。断言：`gate(bookId)` → 200、action 'show'、`body.binding.profileNames` `toEqual({ [PROFILE_A]: '中性档案-profile-neutral-a', [PROFILE_B]: '中性档案-profile-neutral-b', 'plot-fixture-1': '剧情中性档案', 'spec-fixture-1': '光谱中性档案', 'imit-fixture-1': '仿写中性档案' })`。
   - 用例 2「素书无任何绑定 → profileNames toEqual({})」：`gate(plainBookId)` → `body.binding.profileNames` `toEqual({})`（空 map 兼容钉）。
   - 用例 3「改档案名 → 指纹不变不重弹」：`confirm(bookId, {})` → 200 记指纹；`db.prepare('UPDATE style_profiles SET name = ? WHERE id = ?').run('改名后中性档案A', PROFILE_A)`；再 `gate(bookId)` → action `'pass'`（profileNames 不入指纹的具名钉）。
   - 用例 4「confirm 带陈旧 fingerprint → 409 且零写」：`before=getBook(bookId)`；`confirm(bookId, { fingerprint: 'stale-fp', description: '陈旧指纹不应写入' })` → `statusCode` 409、body `toMatchObject({ reason: 'stale-fingerprint' })` 且 `error` 非空串；`after.description === before.description`；`parseGenGate(after.genGateJson)?.fingerprint === parseGenGate(before.genGateJson)?.fingerprint`（零写钉）。
   - 用例 5「confirm 带正确 fingerprint → 200 正常写」：用例 3 后门为 pass——`gate(bookId)` 取响应 `fingerprint`；`confirm(bookId, { fingerprint: fp, suppress: true })` → 200、`results.suppressed === true`、回读 `parseGenGate(...)?.suppressed === true`。

## 四、先红后绿回归测试 + 验收命令

以下命令均在项目根目录执行。

- 先红：步骤 2 完成后 `pnpm -F @inkforge/server exec vitest run test/http/fusion-gate.test.ts` → 新 5 例红（profileNames undefined / 409 缺失）、既有 13 例绿。
- 后绿：实现后同命令 → 18 例全绿（既有断言一字不改，新增 binding 键不撞既有 `toMatchObject`/子字段断言——已核 ：258-373）。
- `pnpm typecheck` → 0 错；`pnpm lint` → 零输出；`pnpm deadcode` → 零新增告警。
- `pnpm test` → 全量零失败，逐包计数 ≥ 开工实跑基线（只增不减；起点执行时实测记录）。
- `git show --stat HEAD` → 文件集恰 4 文件不越界；`git diff HEAD~1 -- apps/server/src/fusion/fingerprint.ts apps/server/src/fusion/apply.ts` → 空（零改动存证）。

## 约束

只 commit 不 push；永不 `--no-verify`；永不 `git add -A`；提交 Conventional 前缀+中文（建议 `feat(server): 融合门 GET 增档案名映射、confirm 支持陈旧指纹 409 守卫`），正文 `verify:` 实测结果 + `Refs: docs/plans/2026-11-24-fusion-gate-readability.md Task-01`。禁读 `apps/server/data/**`、词表文件、v6 真实文本（测试夹具全部中性仿形、已在上方钉死）。卡外问题（含想去动 apply.ts/fingerprint.ts 的冲动）即停回报待裁决。执行中读取大于 4KB 的文件或查看改动，用 `python C:/Users/57850/.zcode/tools/pointer_tools.py` 的 pointerize/read_pointer/read_diff_only，禁止整读文件全文。
