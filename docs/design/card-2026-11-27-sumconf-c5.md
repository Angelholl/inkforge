# C5 卡面：页面标注改版 + 接线（含钉死文案变更）

**真值源：** docs/plans/2026-11-27-summary-unmatched-confirm.md「任务 T5」节——buildSummaryAnnotations 返回扩展、两条修订后文案逐字（计划 :186-188 钉死：`待裁决：档案无此名，见「未匹配处理」`/`待裁决：无标签行，见「未匹配处理」`/`待裁决：未命中既有伏笔，见「未匹配处理」`）、四类不动文案、checkbox 断言 6→4、+3 用例（后两例局部 fixture 禁动模块级 SUMMARY_RESULT）全部照计划执行。
**指针令：** 执行中读取大于 4KB 的文件或查看改动，用 `python C:/Users/57850/.zcode/tools/pointer_tools.py` 的 pointerize/read_pointer/read_diff_only，禁止整读文件全文。

## 根因
DEC-2026-1126-10 D1 两条「未匹配将被忽略/不会写入」钉死文案随本批修订（DEC-2026-1127-02）：未匹配行处置升级为第五段显式裁决；页面需算 alias 命中集、组装 unmatched 三数组传 C4 弹窗。

## 改动文件（写集，测试随卡）
- Modify `apps/web/src/pages/BookDetailPage.tsx`：buildSummaryAnnotations(:78-111) 加 aliasSet 匹配序（精确同名→aliases→未匹配）、返回扩展 `{threads, states, unmatched}`、三条待裁决文案照钉死值；弹窗挂点 :1320-1328 传 `unmatched={annotations.unmatched}`；confirmSummary/取消/单在途零改动
- Test `apps/web/src/pages/BookDetailPage.test.tsx`：:295-307 既有断言随迁（两条文案更新+checkbox toBe(6)→toBe(4)+追加段五标题与两行锚点断言）；+3 例用例名照计划逐字

## 先红后绿回归测试
计划 T5 步骤串执行留痕；既有其余用例零改动跑绿。

## 验收命令（以下命令均在项目根目录执行）
1. `pnpm --filter @inkforge/web exec vitest run src/pages/BookDetailPage.test.tsx` → 全绿含随迁+新增
2. web 全量只增不减（开卡前实测基线存证，最近台账值 222+C4 增量）；`pnpm -w typecheck` 零错；lint 零错后 commit

## 约束
- 前置=C0✓+C4✓。GUI 黑盒按计划 T5 步骤由**主审**在批次收口统一做（测试分工令：agent 只保证卡级验证链跑绿），执行者提交信息注明「GUI 未验证」。
- 只 commit 不 push；禁 `git add -A`、禁 `--no-verify`；Conventional 前缀+中文描述，正文 verify:+`Refs: DEC-2026-1127-02`。
- 写集外零改动；卡外问题即停待裁决，非交互禁提问。
- 【防过滤器】不连主库；输出与提交信息禁引小说原文片段（测试夹具假名可用）；files_touched 契约必须非空。
