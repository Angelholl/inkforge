# 执行卡 DM-4：web 六维展示 + 旧结构分裂灰字提示

- 计划：`docs/plans/2026-11-24-style-dims-merge.md`（规格 §3.5 为真值）。
- 前置：DM-1 已合入（`StyleBindingDto.legacySplits`、binding 读值已归一六键、`维度-*` label 已六维化）；TL-3/TL-4 已合入（设置页哨兵 option、门内把手与哨兵项）；行号漂移以实际为准。串行位置：DM-2、DM-3 之后。

## 0. 背景（根因）

DM-1 后 binding.dimsSource 读值已归一新六键，设置页/门内下拉经常量与 binding 键自动显六组（生产逻辑零改动）。缺口有二：①`StyleProfilesSection.tsx:349/:470` 标签仍写「七维」（测试仅标题/注释提及，无文本断言，本卡补真断言锁行为）；②`mapLegacyDimSource` 的 splits 诊断（同组两旧维曾拆开跟随不同档案）已随 `legacySplits` 透传到前端，但 UI 无消费点——owner 要求行下灰字提示「旧结构里这一组原本分开跟档案，重蒸该档案后可再分开」，落点=设置页高级设置区块与门内逐维面板两处。

## 1. 改动文件（不得越界）

| 文件 | 操作 |
| --- | --- |
| `apps/web/src/pages/BookDetailPage.tsx` | Modify（:113-139 注释与 StyleBindPanel props binding 内联类型增 `legacySplits?: Record<string, string>`；:275-305 高级设置区块尾部渲染灰字提示） |
| `apps/web/src/components/FusionGateDialog.tsx` | Modify（:231-254 dims 面板尾部渲染灰字提示；读取 `binding.styleBinding?.legacySplits`） |
| `apps/web/src/pages/StyleProfilesSection.tsx` | Modify（:349/:470 标签「七维」→「六维」） |
| `apps/web/src/pages/BookDetailPage.test.tsx` | 新例（禁删旧例） |
| `apps/web/src/components/FusionGateDialog.test.tsx` | 新例（禁删旧例） |
| `apps/web/src/pages/StyleProfilesSection.test.tsx` | 新增「六维」标签真断言（:570-591 详情面板用例内；旧「七维」仅在标题/注释，可顺手改措辞非必须） |

禁改：buildStyleBindBody/回填/失勾重映射/保存逻辑（BookDetailPage.tsx:104-111,124-204）、门内把手与 buildBody（TL-4 交付面）、任何 server 文件、`packages/shared/**`。

## 2. 改法（每步一个动作 + 可核对结果）

### A. 基线与新例先红

- [ ] A1 实跑 `pnpm test` 记录用例总数。核对：数字记卡面。
- [ ] A2 `BookDetailPage.test.tsx` 新增 2 例（沿用既有面板测试 harness）：
  1. GET mock `styleBinding` 带 `legacySplits: { 叙述方式: '旧结构里这一组原本分开跟随档案（写作特点/视角），重蒸该档案后可再分开' }` → 打开「高级设置」→ 六个维度下拉在场（`维度来源-语言与描写` 等 aria-label）且页内 `getByText(/重蒸该档案后可再分开/)` 在场；
  2. `legacySplits` 缺省 → 同路径断言该文案 `queryByText` 为 null。核对：两例红（提示未实现）。
- [ ] A3 `FusionGateDialog.test.tsx` 新增 1 例：`binding.styleBinding.legacySplits` 同款键值 + 逐维面板打开（`文风调整：逐维度选跟随哪本档案`）→ 六组 label（`跟随：语言与描写` 等）在场、灰字文案在场、哨兵项与六组共存（沿用 TL-4 断言口径）。核对：红。
- [ ] A4 `StyleProfilesSection.test.tsx` :570 用例内新增断言 `expect(within(row).getByText('六维')).toBeTruthy();`（详情面板标签）。核对：红（生产标签仍「七维」）。

### B. 实现转绿

- [ ] B1 `BookDetailPage.tsx`：StyleBindPanel props binding 内联类型（:119 一带）增 `legacySplits?: Record<string, string>`；:275-305 `<details>` 高级设置内维度 label 列表之后渲染：`Object.entries(binding.legacySplits ?? {}).map(([dim, text]) => <p key={dim} className="…text-faint…">{dim}：{text}</p>)`（无键不渲染；样式沿 :270/:303 既有 `text-xs text-faint` 灰字口径）。核对：A2 绿。
- [ ] B2 `FusionGateDialog.tsx`：:231-254 `styleChoice === 'dims'` 面板尾部同款灰字（数据源 `binding.styleBinding?.legacySplits`，键值直出）。核对：A3 绿。
- [ ] B3 `StyleProfilesSection.tsx`：:349/:470 标签文本「七维」→「六维」。核对：A4 绿。
- [ ] B4 注释措辞随改：BookDetailPage.tsx :113/:139「七维」→「维度」；A2/A3 新例与 StyleProfilesSection.test 用例标题里旧「七维」措辞顺手改「六维」。不改任何逻辑行。核对：typecheck 零错。

### C. 收口（验证链硬序）

- [ ] C1 `pnpm lint` → C2 定向（三测试文件）→ C3 `pnpm test` 全量 ≥ A1 只增 → C4 `pnpm typecheck` → C5 `pnpm deadcode`。每步核对：exit 0 / 数字。
- [ ] C6 `git status` 改动 ⊆ §1 清单。核对：对表。
- [ ] C7 提交：`feat(web): 风格绑定六维展示+旧结构分裂灰字提示（DM-4）`，正文 `verify: ...` + `Refs: docs/plans/2026-11-24-style-dims-merge.md`；**提交信息注明「GUI 已黑盒验证 / 未验证」二选一**：本卡为纯展示新增，若 owner 要求目验，先调 lessons 再走 web-gui-tester 黑盒后再提交；未验证则注明待 owner 实测。

## 3. 验收命令

以下命令均在项目根目录执行（不写仓库根绝对路径）：

```
pnpm -F @inkforge/web exec vitest run src/pages/BookDetailPage.test.tsx src/components/FusionGateDialog.test.tsx src/pages/StyleProfilesSection.test.tsx
pnpm lint
pnpm test
pnpm typecheck
pnpm deadcode
```

## 4. 约束

- 只 commit 不 push；永不 `--no-verify`；永不 `git add -A`。
- 读 >4KB 文件用 `C:/Users/57850/.zcode/tools/pointer_tools.py` 的 pointerize/read_pointer/read_diff_only（BookDetailPage.tsx/test、FusionGateDialog.tsx 超 4KB）。
- 卡外问题即停回报（如：legacySplits 在 mock GET 响应形状对不上、TL-4 哨兵断言与本卡六组断言冲突）。
- GUI 变更：提交前按全局规则黑盒验证（先调 lessons，再 web-gui-tester），提交信息注明已/未验证。
