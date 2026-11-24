# 执行卡 DM-3：张力落点兼容（旧八维名与 视角/人称/POV 折算）

- 计划：`docs/plans/2026-11-24-style-dims-merge.md`（规格 §3.4 为真值）。
- 前置：DM-1 已合入（`LEGACY_DIM_ALIAS` 可用）；TL-1 已合入（六段协议+lever，现状 tension.ts 即其形态）；行号漂移以实际为准。

## 0. 背景（根因）

`normalizeLanding`（apps/server/src/fusion/tension.ts:85-99）落点 `维度=X` 只认 `STYLE_DIMENSIONS.includes`。DM-1 翻六维后：模型可能仍吐旧八维名（训练惯性），且 owner 明确「视角/人称/POV」要折算到「叙述方式」——不改则这类落点全部掉 `lever:'none'`，门里再次出现「没有旋钮」行。prompt 文案（:67-68）与 DTO 注释（tension.ts:24、shared/fusion.ts:28）也仍写「八维名」。

## 1. 改动文件（不得越界）

| 文件 | 操作 |
| --- | --- |
| `apps/server/src/fusion/tension.ts` | Modify（:6 import 增 LEGACY_DIM_ALIAS；:24 注释；:67-68 prompt 两行文案；:85-99 normalizeLanding 内增折算） |
| `packages/shared/src/fusion.ts` | Modify（仅 :28 注释措辞「八维名」→「六维名（兼容旧名与视角/人称/POV 折算）」） |
| `apps/server/test/fusion/tension.test.ts` | Modify（:63-64 翻转）+ 新例（禁删旧例） |
| `apps/server/test/http/fusion-gate.test.ts` | 视需要新增 1 例（落点折算 e2e；现有用例零改动优先） |

禁改：`parseTensionRows` 段数/性质/ROWS_CAP 语义（:106-135）、`buildTensionPrompt` 其余行与截断常量、`TensionRow` 接口形状、routes.ts、shared/fusion.ts 其余内容。

## 2. 改法（每步一个动作 + 可核对结果）

### A. 基线与新例先红

- [ ] A1 实跑 `pnpm test` 记录用例总数。核对：数字记卡面。
- [ ] A2 `apps/server/test/fusion/tension.test.ts` 新增折算例（现期望 none → 红）：
  1. `维度=写作特点` → `{lever:'dim', dim:'叙述方式'}`；
  2. `维度=节奏` → `dim:'结构与节奏'`；`维度=对话` 与 `维度=描写` → `dim:'语言与描写'`；`维度=章节结构` → `dim:'结构与节奏'`；
  3. `维度=视角` / `维度=人称` / `维度=POV` / `维度=pov` → `dim:'叙述方式'`；
  4. `维度=描写密度`、`维度=叙述视角`（旧名取消，不在折算表）→ `{lever:'none'}`（dim undefined）。
- [ ] A3 :63-64 既有用例 `维度=视角 → lever:none` 翻转为 `dim:'叙述方式'`（禁删，只翻转钉值）。核对：A2/A3 定向红。
- [ ] A4 新增 prompt 文案断言：`buildTensionPrompt(...)` 返回含 `维度=<六维名` 与 `视角/人称/POV` 字样。核对：红。

### B. 实现转绿

- [ ] B1 `tension.ts` `:6` import 增 `LEGACY_DIM_ALIAS`；模块内新增私有纯函数：
  ```ts
  const LANDING_VIEWPOINT_WORDS = ['视角', '人称', 'POV', 'pov', '视点'];
  function foldDimName(raw: string): StyleDimension | undefined {
    if ((STYLE_DIMENSIONS as readonly string[]).includes(raw)) return raw as StyleDimension;
    const alias = LEGACY_DIM_ALIAS[raw];
    if (alias) return alias as StyleDimension;
    return LANDING_VIEWPOINT_WORDS.includes(raw) ? '叙述方式' : undefined;
  }
  ```
  `normalizeLanding` `:88-93` 改为 `const dim = foldDimName(value.slice('维度='.length).trim()); return dim ? { lever:'dim', dim } : { lever:'none' };`。核对：A2/A3 定向绿。
- [ ] B2 `tension.ts:67` 落点写法行改 `维度=<六维名，兼容旧八维名与 视角/人称/POV>`；`:68` 负约束行内「维度=八维名」同句改「维度=六维名（兼容旧名与视角/人称/POV）」；`:24` 注释同步。核对：A4 绿；其余 prompt 断言（:122 `toContain('维度=')`）仍绿。
- [ ] B3 `packages/shared/src/fusion.ts:28` 注释改「∈ STYLE_DIMENSIONS 六维名（服务端已折算旧名/视角词）」。核对：typecheck 零错（纯注释）。
- [ ] B4 `apps/server/test/http/fusion-gate.test.ts` 新增 1 例：analyze canned 张力行含 `维度=写作特点` → 响应行 `{lever:'dim', dim:'叙述方式'}`（profileId 缺省）。若该文件 harness canned 注入繁琐，允许降为仅在 tension.test 覆盖并在卡面注明理由。核对：绿。

### C. 收口（验证链硬序）

- [ ] C1 `pnpm lint` → C2 定向（tension.test / fusion-gate.test）→ C3 `pnpm test` 全量 ≥ A1 只增 → C4 `pnpm typecheck` → C5 `pnpm deadcode`（`foldDimName` 为模块内私有、当卡即被 normalizeLanding 调用，无挂空）。每步核对：exit 0 / 数字。
- [ ] C6 `git status` 改动 ⊆ §1 清单。核对：对表。
- [ ] C7 提交：`feat(fusion): 张力落点兼容旧八维名与视角/人称/POV 折算（DM-3）`，正文 `verify: ...` + `Refs: docs/plans/2026-11-24-style-dims-merge.md`。只 commit 不 push。

## 3. 验收命令

以下命令均在项目根目录执行（不写仓库根绝对路径）：

```
pnpm -F @inkforge/server exec vitest run test/fusion/tension.test.ts test/http/fusion-gate.test.ts
pnpm lint
pnpm test
pnpm typecheck
pnpm deadcode
```

## 4. 约束

- 只 commit 不 push；永不 `--no-verify`；永不 `git add -A`。
- 读 >4KB 文件用 `C:/Users/57850/.zcode/tools/pointer_tools.py` 的 pointerize/read_pointer/read_diff_only（fusion-gate.test.ts 超 4KB）。
- 卡外问题即停回报（如：模型侧 canned 断言与 prompt 改文案互相矛盾、折算表与 shared 导出名对不上）。
- 无 GUI 验证义务（门内把手 UI 归 TL-4 已交付，本卡只动协议层）。
