# 执行卡 TL-3：绑定校验放行哨兵与空 weights + 设置页回退（server+web）

- 前置依赖：**必须先合入 TL-2**（Consumes 其常量 `DIM_SOURCE_NONE`）；串行第 3 张（TL-1 已合入）。
- 计划真值源：`docs/plans/2026-11-24-tension-levers.md` §3.3/§5。

## Consumes / Produces

- Consumes：
  1. TL-2：`export const DIM_SOURCE_NONE: '__none__'`（值即哨兵字面量，import 自 `@inkforge/shared`）。
  2. 现状语义（零改动锚）：PUT style 路由 `routes.ts:841/:857` 与 confirm `apply.ts:77` 均已 `Object.keys(weights).length > 0 ? weights : undefined`；`buildStyleBundle`（merge.ts:92）空 weights 不写键——**本卡只放宽 schema，落盘链不动**。
- Produces：
  1. schemas 放行面：`dimsSource` 值 ∈ 档案 ∪ `{DIM_SOURCE_COEXIST}` ∪ `{DIM_SOURCE_NONE}`（dim 键仍须 ∈ 八维）；`weights` 允许 `{}`（语义=legacy 按贡献维数计权、不动权重），非空时规则不变（键集恰等绑定全集、Σ=100、int≥1）。
  2. 设置页回退面：BookDetailPage 高级八维下拉含哨兵 option，可回显可再选，保存经既有 dimsSource 提交形状（请求形状零改动）。

## 一、根因

TL-2 让引擎认识 `__none__`，但两道 schema 闸门（styleBind `schemas.ts:108`、confirm `:390`）会把它当越权值 400 拒掉；confirm 侧 weights 规则（`:394-401`）要求键集恰等绑定全集且 Σ=100，legacy 书（快照无 weights 键、门内 state 为空 map）若被张力行改动 dims 后整包提交会吃 400。设置页八维下拉（`BookDetailPage.tsx:299`）也没有哨兵 option——已绑哨兵的书打开面板该 select 值悬空显示空白。本卡打通「校验放行 → 设置页可回退」。

## 二、改动文件（不越界清单）

| 文件 | 动作 | 锚点（Modify 行号） |
| --- | --- | --- |
| `apps/server/src/http/schemas.ts` | Modify | import :2；styleBind dimsSource 值规则 :103-111（:108）；styleBind weights 规则 :112-121；confirm dimsSource 值规则 :385-393（:390）；confirm weights 规则 :394-401 |
| `apps/web/src/pages/BookDetailPage.tsx` | Modify | import（`DIM_SOURCE_COEXIST` 所在行，补 `DIM_SOURCE_NONE`）；高级设置共存 option :299 旁增哨兵 option；:303 说明行旁补一句 |
| `apps/server/test/http/style.test.ts` | Modify | 仿共存例 :354-382 新增哨兵例 |
| `apps/server/test/http/fusion-gate.test.ts` | Modify | confirm describe 内新增 weights={} 放行例 |
| `apps/web/src/pages/BookDetailPage.test.tsx` | Modify | 仿共存选项例 :766-787 新增哨兵例 + 回填例 |

禁触：weights 非空规则本体（键集/Σ/int 校验条件与文案）、`buildStyleBindBody`、`StyleBindPanel` 回填/失勾/保存逻辑（:124-204，复核结论=不吞哨兵，见下）、`apply.ts`、`books.ts`、confirm applied/skipped 语义、路由处理器。

### 复核结论写入卡面（critic 红线②，施工前通读一次即可，不改码）

`BookDetailPage.tsx:128` `binding?.dimsSource?.[d] ?? binding?.primaryProfileId ?? ''`——`??` 只跳过 null/undefined，`'__none__'` 原样保留；:162 失勾重映射三条件（`=p.id` / `=primary` 且未 touched / `=COEXIST` 且余档<2）对 `'__none__'` 全不命中 → 保留；:196 `dims[d] || primary` 哨兵为真值串 → 保存保留。**结论：回填不吞哨兵，零改动成立**；唯 :284 select 缺 option 致显示空白，由本卡步骤 D1 修复。

## 三、改法（每步一个动作 + 可核对结果；先红后绿，测试均先于实现）

### 阶段 A：server 测试先红

- [ ] A1. `style.test.ts` 仿 :354-382 新例「不采用哨兵（DEC-2026-1124-04）」：
  - PUT `/api/books/:id/style` `{ primaryProfileId: p1, auxProfileIds: [p2], dimsSource: { 对话: DIM_SOURCE_NONE } }` → 200；
  - GET `/api/books/:id` 回显 `styleBinding.dimsSource['对话'] === '__none__'`；
  - 快照面：`book.styleSnapshotJson` 含 `'__none__'`（buildStyleBundle :90 原样冻结）；
  - 负例不放宽：`dimsSource: { 语感: DIM_SOURCE_NONE }`（非八维键）→ 400 `未知风格维度`；`dimsSource: { 对话: 'no-such-profile' }` → 400 `维度来源必须在已勾选档案中`。
- [ ] A2. 同 describe 加一小例：`{ primaryProfileId: p1, dimsSource: {}, weights: {} }` → 200；`{ primaryProfileId: p1, weights: { p1: 50 } }`（Σ≠100）→ 400 `比例之和必须为 100`（非空规则不变的面）。
- [ ] A3. `fusion-gate.test.ts` confirm describe 新例：建两档案 PUT 绑主+辅 → GET `/fusion-gate` 取 `fingerprint` → POST confirm `{ fingerprint, styleBinding: { primaryProfileId: p1, auxProfileIds: [p2], dimsSource: { 对话: '__none__' }, weights: {} } }` → 200 且 `results.styleBinding === 'applied'`；再 GET `/api/books/:id` 回显 `weights` 为 `{}` 且快照 JSON 不含 `"weights"` 键（legacy 落盘形态，apply.ts:77+merge.ts:92 链）。
- [ ] A4. 跑红。核对：哨兵例 400（现 :108/:390 不认 `__none__`）、weights={} 例 400（现 :112-121/:394-401 键集校验拒绝空键集），红点记录在案。

### 阶段 B：schemas 实现转绿

- [ ] B1. schemas.ts:2 import 补 `DIM_SOURCE_NONE`。
- [ ] B2. styleBind dimsSource 规则 :108：`src !== DIM_SOURCE_COEXIST` → `src !== DIM_SOURCE_COEXIST && src !== DIM_SOURCE_NONE`；:103 行注释「规则 5」补哨兵说明（该维不采用任何档案风格）。
- [ ] B3. confirm dimsSource 规则 :390 同 B2；:385 注释同步。
- [ ] B4. styleBind weights 规则 :112-121：`if (v.weights !== undefined) {` 体内加首分支——
  ```ts
  // 空 weights=legacy 按贡献维数计权（DEC-2026-1124-04）：放行、不动权重；
  // 落盘链 apply.ts:77 / routes.ts:857 空→undefined、buildStyleBundle(merge.ts:92) 不写键
  if (Object.keys(v.weights).length === 0) {
    // 跳过键集/Σ 校验（legacy 语义）
  } else if (…既有键集校验…) …
  ```
  核对：非空分支校验条件与 message 逐字符不变（仅改写为 if/else 结构）。
- [ ] B5. confirm weights 规则 :394-401 同 B4（沿抄结构，注释同步）。
- [ ] B6. zod 形状实跑验证（P-4）：A1-A3 绿即证明 `z.record(z.string(), z.number().int().min(1))`（:70/:375）已收 `{}`；**若仍 400**（版本行为不符），再按设计钉包形 `z.union([现有 record, z.object({})])` 于 :70/:375 并重跑。核对：两种走法只取其一，完成通知回报实际走了哪条。
- [ ] B7. 跑绿。核对：`pnpm -F @inkforge/server exec vitest run test/http/style.test.ts` 与 `test/http/fusion-gate.test.ts` 全绿。

### 阶段 C：web 测试先红

- [ ] C1. `BookDetailPage.test.tsx` 仿 :766-787 新例「不采用选项」：
  - 勾 1 档案 → `getAllByRole('option', { name: /不采用档案风格/ })` 恰 8（八维各一；钉：无条件渲染，单档案也在）；
  - 勾第 2 档案后 `fireEvent.change(screen.getByLabelText('维度来源-特色词汇'), { target: { value: '__none__' } })` → select value 置位；
  - 保存 → PUT body `dimsSource['特色词汇'] === '__none__'`、`dimsSource['对话'] === 'p1'`（其余维不受影响，同 :786 款）。
- [ ] C2. 同文件回填例：book stub 的 `styleBinding.dimsSource` 带 `{ 特色词汇: '__none__' }`（仿该文件既有 installBookStub/renderPanel 助手与 :761 回显钉形）→ renderPanel 后 `(screen.getByLabelText('维度来源-特色词汇') as HTMLSelectElement).value === '__none__'`（**回填显示哨兵项而非主档/空白**）。
- [ ] C3. 跑红。核对：option 缺失（`getAllByRole` 抛错/计数 0）或回填 value 悬空非 `'__none__'`，红点记录在案。

### 阶段 D：设置页实现转绿

- [ ] D1. `BookDetailPage.tsx` import 补 `DIM_SOURCE_NONE`；:299 共存 option 之后增：
  ```tsx
  <option value={DIM_SOURCE_NONE}>不采用档案风格（按正文走）</option>
  ```
  钉：**无条件渲染**（与共存不同，单档案也可不采用某维）。
- [ ] D2. :303 说明行文案补一句：「不采用＝该维不注入任何档案画像，按正文与设定写。」核对：共存说明句保留不动。
- [ ] D3. 通读 :124-204 回填/失勾/保存三段，确认零改动成立（复核结论如上），把「红线②复核：回填/重映射/保存均不吞哨兵，未改逻辑」写进提交正文。
- [ ] D4. 跑绿。核对：`pnpm -F @inkforge/web exec vitest run src/pages/BookDetailPage.test.tsx` 全绿。

### 阶段 E：收口链

- [ ] E1. `pnpm lint` → 0 error。
- [ ] E2. 定向（style/fusion-gate/BookDetailPage）全绿（B7/D4 已跑，此处随链复核）。
- [ ] E3. `pnpm test` 全量 ≥ 基线只增。
- [ ] E4. `pnpm typecheck` → 0 error。
- [ ] E5. `pnpm deadcode` → 0 新增挂空。
- [ ] E6. 提交（只 commit 不 push）：
  ```
  feat(server,web): 绑定校验放行 __none__ 哨兵与空 weights

  styleBind/confirm 两处 dimsSource 值允许集加 DIM_SOURCE_NONE（dim 键仍须八维）；
  两处 weights 规则放行空对象 {}（legacy 按贡献维数计权、不动权重；落盘链空→undefined
  天然消化）；非空键集/Σ/int 规则与文案不变。设置页八维下拉增「不采用档案风格
  （按正文走）」option（无条件渲染）；回填/失勾/保存零改动
  （红线②复核：均不吞哨兵，未改逻辑）。

  verify: pnpm lint/test/typecheck/deadcode 全绿，测试基线 <开工>→<收口> 只增
  Refs: docs/plans/2026-11-24-tension-levers.md
  ```

## 四、先红后绿回归测试与验收命令

以下命令均在项目根目录执行

```bash
# 1) 红（A4 / C3）
pnpm -F @inkforge/server exec vitest run test/http/style.test.ts
pnpm -F @inkforge/server exec vitest run test/http/fusion-gate.test.ts
pnpm -F @inkforge/web exec vitest run src/pages/BookDetailPage.test.tsx
# 2) 绿与收口（B7 / D4 / E1-E5）
pnpm lint
pnpm test
pnpm typecheck
pnpm deadcode
```

验收样例（输入 → 期望输出）：
- PUT style `{ primaryProfileId: p1, dimsSource: { 对话: '__none__' } }` → 200，GET 回显 `'__none__'`，快照含哨兵。
- PUT style `{ primaryProfileId: p1, dimsSource: { 语感: '__none__' } }` → 400 `未知风格维度`。
- PUT style `{ primaryProfileId: p1, weights: {} }` → 200；`{ primaryProfileId: p1, weights: { p1: 50 } }` → 400 `比例之和必须为 100`。
- confirm `styleBinding.weights={}` → 200 `applied`，快照无 `"weights"` 键。
- 设置页：下拉出现「不采用档案风格（按正文走）」（单档案时也在），选存后 `body.dimsSource[dim]='__none__'`；带哨兵快照回填显示该项而非主档。

## 五、约束

- 只 commit 不 push；永不 `--no-verify`；永不 `git add -A`。
- 读 >4KB 文件用 pointer_tools 的 pointerize/read_pointer/read_diff_only。
- 卡外问题（zod 形状实跑与 P-4 预判不符且 union 包形仍不收、BookDetailPage 测试助手与钉形不符）即停回报。
- 禁读 `apps/server/data/**`、词表文件、真实书稿文本；夹具中性仿形。
- 禁改 `StyleBindPanel` 回填/失勾/保存逻辑与 `buildStyleBindBody`——本卡 web 侧只允许 import 行、:299 option、:303 说明句三处增量。
