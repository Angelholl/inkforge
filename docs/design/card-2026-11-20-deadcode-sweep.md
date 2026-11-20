# 卡：TS 侧死导出清理 + knip 白名单固化

以下命令均在项目根目录执行（相对路径）。

## 根因

`pnpm dlx knip`（6.46.1）普查出 26 个零外部 import 的死导出、Field.tsx 6 个死组件导出、2 组重复导出、3 个疑似未用 devDeps。主审已逐项按「import 语句判据」核实（他文件 import 次数全为 0），并裁定 scripts/ 与构建入口为误报须白名单化，不得删除。

## 改动文件（只许动列出的文件）

### A. 整体删除（定义在本文件内也无使用）

1. `apps/server/src/export/export.ts` — 删 `chapterHasVersion` 函数（全文件仅定义 1 处）
2. `apps/server/src/http/schemas.ts` — 删 `cancelRunSchema`（仅定义 1 处）
3. `apps/web/src/api/client.ts` — 删 `SSE_BASE`（仅定义；同时消解 API_BASE|SSE_BASE 重复导出标记）
4. `apps/web/src/components/Field.tsx` — 删组件 `Field`、`TextInput`、`TextArea`、`Select`；删 `fieldHelp`、`fieldError` **前提**：删完组件后确认它们在文件内已无使用者（若 Field 组件体内用了它们，随组件一并删）；样式常量 `checkboxBase/inputBase/inputNarrow/textareaBase/selectBase/fieldLabel/numberBase/checkboxBase` 等被多文件 import，**必须保留**

### B. 去 export（保留定义，删 `export` 关键字；先 grep 确认本文件确有使用，若实际 0 处则整体删除并在提交信息注明）

5. `apps/server/src/settings.ts` — `settingsSchema`、`SCORE_THRESHOLD_KEY`
6. `apps/server/src/style/analysis.ts` — `ANALYSIS_INSTRUCTION`
7. `apps/server/src/style/merge.ts` — `RULES_TOTAL_BUDGET`、`TERMS_MAX`、`SAMPLE_QUOTA`
8. `apps/server/src/llm/mock.ts` — `MockStepBehavior`
9. `apps/server/src/llm/plainproto.ts` — `OutlineItem`、`SelfEvalItem`
10. `apps/server/src/pipeline/chapter.ts` — `PipelineRole`、`RoleProviders`
11. `apps/server/src/quality/l0.ts` — `L0Check`
12. `apps/server/src/config.ts` — `DraftBudgets`、`QcBudgets`、`RewriteBudgets`、`PlannerBudgets`、`OutlineBudgets`
13. `apps/server/src/db/repositories/imitation.ts` — `ImitationProfileRow`；`apps/server/src/db/repositories/plot.ts` — `PlotProfileRow`
14. `apps/web/src/components/ui.tsx` — `ConsoleTone`、`ButtonVariant`、`ButtonSize`
15. `apps/web/src/pages/SelectionRewrite.tsx` — `SELECTION_PRESETS`（本文件 2 处：去 export）
16. `apps/web/src/pages/NewBookPage.tsx` — `DecodedText`（本文件 2 处：去 export）

### C. 测试 fixtures（先核实再动）

17. `apps/server/test/quality/fixtures.ts` — `DECEASED_BP`、`SENTIMENT_DRAFT`、`ECHO_SENTENCE`：grep 全 test 目录 import；确无他文件 import 后，若本文件也未用则删，本文件有用则去 export；同文件 `BP_EMPTY` 与 `DECEASED_BP` 重复导出标记一并消解
18. `apps/server/test/quality/regression/corpus.ts` — `CAPTURE_CHAPTERS`：同上核实处理

### D. knip 白名单固化（不得删除下列文件）

19. 新建根目录 `knip.json`：把下列标为 entry/ignore，使 `pnpm dlx knip` 复跑仅零报告或仅剩已知合理项：
    - entry：`apps/server/scripts/**/*.{mjs,ts}`、`apps/desktop/scripts/**/*.mjs`、`apps/server/src/worker/main.ts`（构建入口，`apps/server/scripts/build-dist.mjs` 的 esbuild entryPoints 引用）、`apps/server/src/style/cli.ts`（手工 CLI，`apps/server/test/style/distill.test.ts` 以子进程调用）、`apps/server/test/worker/fixtures/worker-plain.mjs`（测试夹具）
    - 若 entry 规则覆盖不足可对剩余项用 ignore
20. 根 `package.json` scripts 加 `"deadcode": "knip"`；devDependencies 加 `knip`（版本与本次 dlx 一致 ^6.46.1）

### E. devDeps 核实（先查证再动，查证结果写进提交信息）

21. `apps/server/package.json` 的 `esbuild`：grep `apps/server/scripts/*.mjs` 是否 `import esbuild`；有用→保留并在 knip.json 把 scripts 目录标 entry 后自然消解；无用→从 devDeps 删
22. `apps/web/package.json` 的 `@testing-library/jest-dom`：grep 全仓库 `@testing-library/jest-dom`；无 import→从 devDeps 删；有→保留并说明为何 knip 漏判（如 setupFiles 引用）
23. 根 `package.json` 的 `prettier`：查 `.prettierrc*`/`prettier` 配置文件与编辑器约定；若仓库无任何 prettier 配置与脚本引用→从 devDeps 删；有→保留

## 先红后绿回归

本轮为纯死代码清理（无行为变更），不新增测试；回归判据=既有测试基线只增不减。

## 验收命令（主审复核用）

```bash
pnpm --filter @inkforge/server exec tsc --noEmit
pnpm --filter @inkforge/web exec tsc --noEmit
pnpm --filter @inkforge/server test
pnpm --filter @inkforge/web test
pnpm dlx knip
```

全绿 + knip 复跑无 Unused exports/exported types/files 报告（scripts 白名单生效）。

## 约束

- 只 commit 不 push；提交信息 Conventional 前缀+中文描述，正文注明 verify 结果。
- 禁 `git add -A`；逐文件 add。
- 不改动上列文件之外的任何文件；grep 核实结论与 E 项查证结果写入提交正文。
- 任何与卡面冲突的现场情况（如符号实际有引用）即停，保留现场待主审裁决，不得自行裁量。
