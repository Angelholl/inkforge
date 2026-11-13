# 卡 0.2-T04：D4 残留收敛——echo_20gram 全文 20-gram 交集检查 + 模板系入套话表（server 158→161）

## 根因/背景
0.2 计划 v2（docs/plans/2026-11-13-inkforge-0.2-draft.md，任务 0.2-T04）。D4 上轮部分收敛后仍有残留：004 章 42.6% 位置存在前文复文（tail_replay/tail 检查双盲区），「第X层的试炼正在展开」模板系 tail 比 0.01 现有检查覆盖不到。挂机 run 已终态，worker 加载面守卫解除，本卡可正常落盘 src。

## 改动文件
- Modify `apps/server/src/quality/l0.ts`（新增 echo_20gram 检查+入 hardFail 名单）
- Modify `apps/server/src/pipeline/chapter.ts`（echoFix 注入 taskInstruction）
- Modify `apps/server/config/quality/cliches.default.txt`（模板系条目）
- Modify `apps/server/test/quality/fixtures.ts`（+4）与 `l0.test.ts`（+3）
- Modify `apps/server/test/quality/regression/qc-regression.test.ts`、`scripts/qc-recall.mjs`（断言值同步）

## 改法（钉死）
- `L0Check.name` 增 `'echo_20gram'`：`draftGrams = new Set(ngrams(draft, 20))`（去空白后滑窗），`prevGrams = ∪ ngrams(prev_i, 20)`；`hits = [...draftGrams].filter(g => prevGrams.has(g))`；`pass = prevTexts.length === 0 || hits.length === 0`；hardFail（入既有 :151 名单）；details 钉死格式：`` `echoHits=${hits.length} (n=20); 首命中 draft offset=${offset}（≈${(offset/draft.length*100).toFixed(1)}% 处）; 示例「${hits[0] ?? ''}」` ``（hits 展示前 3，offset 为首个命中 20-gram 在去空白 draft 中的下标）。判定力注记：20-gram 交集 ⇔ 最长公共子串 ≥20 字。
- chapter.ts：clicheFix 旁增 `const echoFix = l0.checks.find((c) => c.name === 'echo_20gram' && !c.pass) ? '正文与前文存在 20 字以上连续复文，必须彻底改写复文段，不得换皮复用。' : '';`，两句 taskInstruction 的「章尾不得与前文章尾段落复现；」后插 `${echoFix}`。
- cliches.default.txt：新增「第X层的试炼正在展开」与「这一层的试炼并非/不是……而是……」模板系条目（与晨检登记的残留族一致）。
- fixtures：`ECHO_BAD_PREV`（300+ 字）、`ECHO_BAD_DRAFT`（独立首段+同一实证句置于去空白全文 ≈42.6% 位置+独立章尾；实证句=「第四层的试炼正在展开，而他已经带着第三层收束后的认知进入了这个新的领域。这里的混乱并非无序，而是另一种形式的秩序，需要更深层的理解才能破解。林澈深吸一口气，调整状态，准备面对接下来可能出现的更直接的对抗或更隐蔽的陷阱。」来源注释注明 data/exports/挂机-试炼之路-1112基线/004-第4层.md）；`ECHO_FREE_PREV`/`ECHO_FREE_DRAFT`（互有 4-8 字短语但零 20-gram 共享，prev 非空）。

## 先红后绿
l0.test.ts +3（先红）：
1. `'echo_20gram：复文置于 42.6% 位置（004 形状）→ 硬失败且 details 报命中与位置'`——断言 fail、hardFail===true、details 含 `echoHits=` 与 `42.` 百分比段、且 tail_replay pass===true（双盲区补位证明）。
2. `'echo_20gram：prev 非空且零 20-gram 共享 → 通过'`——pass 且 hardFail===false。
3. `'cliche：第X层的试炼正在展开 模板系命中'`——cliche 不 pass、clicheHits 含命中串。
corpus 同步：L0_BAD +1（echo_20gram expectFail）、L0_GOOD +1（echo_free）；qc-regression `toHaveLength(8)`→`(9)`、`toHaveLength(4)`→`(5)` 及标题 8→9/4→5；qc-recall.mjs `'0/4'`→`'0/5'` 且 FPR 判据改动态 `${L0_GOOD.length}/${L0_GOOD.length}`。

## 验收命令（以下命令均在项目根目录执行）
```bash
pnpm --filter @inkforge/server exec vitest run test/quality test/worker   # 44 passed（41+3）
pnpm --filter @inkforge/server exec tsc --noEmit                          # 0 错
node scripts/qc-recall.mjs   #（cwd=apps/server）EXIT 0，FPR 判据 0/5
```

## 约束
- 只 commit 不 push：`fix(server): echo_20gram 全文 20-gram 交集检查与第X层模板系入表（D4 残留收敛）`，正文 verify:+Refs: DEC-2026-1113-05。
- 禁改 gate.ts、plainproto.ts 解析规则、nsi、data/artifacts/ 物证目录、生产库。
- 用例数只增不减；超范围即停报。
