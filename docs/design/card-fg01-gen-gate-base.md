# 卡 FG-01：融合门基座——shared 类型 + migration 0015 + 门状态列 + 注入面指纹 + NSIS（2026-11-24）

## 一、根因/目标

生成前融合确认门（fusion gate）MVP 的第一张卡：把类型、存储、指纹三件套落地，为后续引擎/端点/UI 提供地基。计划真值=`docs/plans/2026-11-24-gen-fusion-gate.md` **Task-01**（步骤 1–14 逐 checkbox 照做，含接口块精确签名与钉值）；规格=`docs/design/proposal-2026-11-23-import-reconcile.md` v3.1 §3.5。主审对码已完成：计划内全部行锚属实，NSIS 行形态用 `${INKFORGE_RES}` 变量（计划已修正，照计划执行即可）。

## 二、改动文件（与计划 Task-01 文件清单一致，不得越界）

- Create：`packages/shared/src/fusion.ts`、`apps/server/src/db/migrations/0015_gen_gate.sql`、`apps/server/src/fusion/fingerprint.ts`、`apps/server/test/fusion/fingerprint.test.ts`
- Modify：`packages/shared/src/index.ts`、`packages/shared/src/api.ts`（SettingsImportDraftDto 增可选 `consumedSections?: string[]`）、`apps/server/src/db/repositories/books.ts`（gen_gate_json 列 + parseGenGate/updateGenGate）、`apps/desktop/src-tauri/nsis/inkforge-installer.nsi`（File/Delete 各加 0015 行，仿 :1560/:5421 的 0014 行形态）、复制 `0015_gen_gate.sql` 到 `apps/desktop/src-tauri/resources/server/db/migrations/`
- Test Modify：`apps/server/test/db/migrate.test.ts`（六处 14→15 + 4 个回拨夹具补 DROP gen_gate_json）、`apps/server/test/db/open.test.ts`（grep 0014 同型断言随迁，零命中则记录核实结论）、`apps/server/test/db/repositories.test.ts`（gen_gate 往返+坏值容错两例）

## 三、改法

按 Task-01 步骤 1–14 顺序执行。要点钉死：
1. 指纹=`sha256(JSON.stringify(InjectionFace))` hex，接口恰七键（description/styleBinding(含 dimsSource/weights)/styleFewshotOn/styleSnapshotJson/plotProfileId/spectrumProfileId/imitationProfileId），**mandate/词表不得入**（结构级钉）。
2. migration 一行 `ALTER TABLE books ADD COLUMN gen_gate_json TEXT;`+头注释含回滚句；migrate.test 六处钉值（:33/:89/:101/:137/:161/:200）14→15，沿 0012/0013/0014 入列先例。
3. `parseGenGate`：null/空串/非法 JSON/缺 fingerprint 字符串键 → null。
4. shared DTO 键名/类型逐字照计划接口块（后续任务依赖）。
5. 测试步骤先落用例（红）再实现（绿）或按计划序直跑均可，但最终必须全绿且既有用例零删改（仅随迁钉值）。

## 四、先红后绿回归测试 + 验收命令（均在项目根目录执行）

- `pnpm -F @inkforge/server exec vitest run test/fusion/fingerprint.test.ts test/db/repositories.test.ts test/db/migrate.test.ts test/db/open.test.ts` → 全绿
- `pnpm -F @inkforge/shared test` → 全绿（shared 基线 2 不减）
- `pnpm lint` → 零输出
- `grep -c "toBe(15)" apps/server/test/db/migrate.test.ts` → ≥6
- `grep -n "0015_gen_gate" apps/desktop/src-tauri/nsis/inkforge-installer.nsi` → File 与 Delete 各 1 行
- `git show --stat HEAD` → 文件集不越出第二节清单

## 约束

- 只 commit 不 push；永不 `--no-verify`；永不 `git add -A`（逐文件 add）。
- 提交 Conventional 前缀+中文，正文 `verify:` 写实测命令结果+`Refs: docs/plans/2026-11-24-gen-fusion-gate.md Task-01；规格 v3.1 §3.5`。
- 不得读取 `apps/server/data/**`、`apps/server/config/quality/landing-words.default.txt`、v6 真实文本；测试夹具一律中性仿形（《示例之作》系）。
- 卡外问题即停待裁决；钉值与实测漂移以实测为准并在提交正文列出。
- 执行中读取大于 4KB 的文件或查看改动，用 `python C:/Users/57850/.zcode/tools/pointer_tools.py` 的 pointerize/read_pointer/read_diff_only，禁止整读文件全文（installer.nsi 巨大，必走 pointer）。
