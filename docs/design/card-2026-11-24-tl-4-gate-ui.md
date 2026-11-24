# 执行卡 TL-4：门内张力行三选把手与占比步进（web+shared）

- 前置依赖：**必须先合入 TL-1、TL-2、TL-3**（Consumes 三者产物）；串行第 4 张。
- 计划真值源：`docs/plans/2026-11-24-tension-levers.md` §3.4/§5。
- GUI 验证口径：本卡含 GUI 变更，**本批不做黑盒验证（owner 真实测试）**，提交信息必须注明「GUI 未验证（owner 实测）」。

## Consumes / Produces

- Consumes（三者缺一不可，均已在前卡 Produces 钉形）：
  1. TL-1：analyze 响应行 `TensionRowDto{ entry; mdSide; profileSide; nature; suggestion; lever: 'dim'|'weights'|'none'; dim?: string; profileId?: string }`（`@inkforge/shared` 导出）。
  2. TL-2：`export const DIM_SOURCE_NONE: '__none__'`（`@inkforge/shared` 导出）。
  3. TL-3：confirm `styleBinding.weights` 接受 `{}`（legacy 语义放行）——door buildBody 提交空 weights 不再 400。
- Produces：
  1. `packages/shared/src/fusion.ts` 新纯函数（精确签名与语义钉）：
     ```ts
     /** 张力行「偏档案/偏正文」占比步进（DEC-2026-1124-04）：目标 ±delta、其余按现有比例吸收、
      *  单档最小 1、总和恒 100、越界夹边；空 map 或 id 不在键集 → 浅拷贝原样返回（legacy 不动）。
      *  输入契约：各值为 ≥1 整数（调用方=门内 state 与绑定快照，滑条/校验保证）；函数内不救非法输入。 */
     export function nudgeWeights(weights: Record<string, number>, id: string, delta: number): Record<string, number>;
     ```
  2. 门内交互面：张力行 dim/weights/none 三类控件 + 区块尾汇总 + 常驻说明行（文案钉见改法 D 区）。

## 一、根因

门里「正文与档案的冲突对照」（`FusionGateDialog.tsx:113-129`）现只读展示，提出拉扯并给建议却没有把手可选边（owner 实测缺口）。本卡给每行按 `lever` 渲染三选（不动/偏正文/偏档案），改动直接写进与配方区共用的 `dimsSource`/`weights` state，经既有 styleBinding 落盘链**持久生效**；weights 行 ±20 步进收进 shared 纯函数 `nudgeWeights`（可测、防组件内算术漂移）。

## 二、改动文件（不越界清单）

| 文件 | 动作 | 锚点（Modify 行号） |
| --- | --- | --- |
| `packages/shared/src/fusion.ts` | Modify | 文件末尾增 `nudgeWeights` 导出（含注释） |
| `packages/shared/test/fusion.test.ts` | **新增** | nudgeWeights 用例（现 shared 仅 `test/domain.test.ts`，新建文件走同款 vitest 约定） |
| `apps/web/src/components/FusionGateDialog.tsx` | Modify | 组件体 :41-94（state 与 buildBody）；张力区块 :113-129（只读行改 lever 分控）；配方区 dims select :231-254（补哨兵 option，P-2） |
| `apps/web/src/components/FusionGateDialog.test.tsx` | Modify | report 夹具 :9-42（styleBinding/dimsSource 可扩）、tension 夹具 :44-47（三态样例）、旧钉 :71-130 随迁 |

禁触：`fusionGate.ts`（STALE_GATE_MESSAGE 与顺序钉）、门宿主页面的 GateMount 三件套、planner 三行与 fewshot 区块（:259-305，仅文案指引引用不改动）、A 类剥节逻辑（:52-55,:74-77）、shared 其余导出、server 任何文件。

## 三、改法（每步一个动作 + 可核对结果）

### 阶段 A：shared nudgeWeights 先红

- [ ] A1. 新建 `packages/shared/test/fusion.test.ts`，import `nudgeWeights`（from '../src/fusion' 或 '@inkforge/shared'——与 `test/domain.test.ts` 的 import 风格一致，先看该文件头再落笔）。钉例（每例一个 it，2-5 分钟粒度）：
  - [ ] A1a. `{A:60,B:20,C:20}` id='A' delta=+20 → `{A:80,B:10,C:10}`；
  - [ ] A1b. `{A:60,B:20,C:20}` id='B' delta=−20 → `{A:74,B:1,C:25}`（目标 0→夹 1，余额 99 按比例 60:20 分摊 floor 后 74/24，余 1 按小数余数降序给 C）；
  - [ ] A1c. `{A:100}` id='A' delta=±20 → `{A:100}`（唯一档不变）；
  - [ ] A1d. `{}` id='A' delta=+20 → `{}`（空 map 原样）；
  - [ ] A1e. `{A:60,B:40}` id='C' delta=+20 → `{A:60,B:40}`（非绑定 id 不变）；
  - [ ] A1f. `{A:99,B:1}` id='A' delta=+20 → `{A:99,B:1}`（越界夹边：目标钳 100−(2−1)=99）。
- [ ] A2. 跑红。核对：`pnpm -F @inkforge/shared exec vitest run test/fusion.test.ts` 红（函数未导出）。

### 阶段 B：nudgeWeights 实现转绿

- [ ] B1. `fusion.ts` 末尾按 Produces 形状实现（算法钉，顺序执行）：
  1. `const keys = Object.keys(weights)`；`keys.length === 0 || !(id in weights)` → `return { ...weights }`；
  2. `const n = keys.length`；`target = Math.min(Math.max(weights[id] + delta, 1), 100 - (n - 1))`；
  3. `rest = 100 - target`；`others = keys.filter(k => k !== id)`；`sumOthers = others.reduce((s,k)=>s+weights[k]!,0)`（契约保证 ≥ n−1 ≥ 1，不做 0 除防御）；
  4. 其余档 `raw_k = rest * weights[k]! / sumOthers`，`floor` 入表；`deficit = rest − Σfloor_k`；按 `raw_k − floor_k` 小数余**降序**（平手按 keys 插入序先手）逐档 +1 直至补完 deficit；
  5. 组装 `{ [id]: target, ...others 分摊 }` 返回（键序沿 keys）。
- [ ] B2. 跑绿。核对：shared 两测试文件全绿；`pnpm -F @inkforge/shared exec vitest run` 全绿。

### 阶段 C：门组件测试先红

- [ ] C1. `FusionGateDialog.test.tsx` 夹具改造：`tension`（:44-47）扩三态样例——dim 类行 `{entry:'尺度冲突', …, lever:'dim', dim:'尺度'}`、weights 类行 `{entry:'配比冲突', …, lever:'weights', profileId:'sp2'}`、none 类行 `{entry:'孤例', …, lever:'none'}`；`report.binding.styleBinding.dimsSource`（:34）扩 `{ 节奏:'sp1', 尺度:'sp1' }` 以承载 dim 行。旧断言随迁核对清单：:89 `getByText(/去油腻/)` 仍过、:110-124 confirm 钉例、:126-130 禁用例——逐一跑通后随新例共存。
- [ ] C2. 新例（≥7 条，每条一个 it）：
  - [ ] C2a. dim 行选「偏正文」→ `冲突裁决：尺度冲突：偏正文` radio 勾选后，确认 → `body.styleBinding.dimsSource['尺度'] === '__none__'`，且 `body.styleChoice` 场景下 styleChoice 仍为 keep（styleChoice 单选钮未动）；
  - [ ] C2b. dim 行选「偏档案」→ 下拉（aria-label `冲突档案：尺度冲突`）默认 value=`row.profileId`；`fireEvent.change` 选另一本（sp1）→ 确认体写 `dimsSource['尺度'] === 'sp1'`；
  - [ ] C2c. dim 行「偏正文」后再点「不动」→ 还原施加前值（`'sp1'`），确认体与快照同；
  - [ ] C2d. weights 行「偏档案」→ 确认体 `weights === nudgeWeights(快照, 'sp2', +20)` 且 Σ=100、键集不变；「偏正文」→ −20 同款；
  - [ ] C2e. weights 行「不动」→ 还原该行施加前整份 weights（先偏X再不动，确认体 weights 与快照 deep-equal）；
  - [ ] C2f. legacy：report 改 `styleBinding.weights: {}` → weights 行三选与下拉 disabled + 灰字「这本书按贡献维数计权，占比调整不可用」在场；
  - [ ] C2g. none 行：灰字指引在场（文案见 D 区钉），且 `screen.queryByLabelText('冲突裁决：孤例：不动')` 为 null；
  - [ ] C2h. 汇总行两态：三态夹具（dim+weights+none）→ 「本次 3 条冲突里，2 条可以在门里直接裁决。」；全 none 夹具 → 「本次 2 条冲突都只能在门外解决（改文风档案或改正文）。」；
  - [ ] C2i. 常驻说明行在场（文案见 D 区钉，含「永久」与「风格档案」面板指路）；
  - [ ] C2j. buildBody 差异提交：styleChoice 保持 keep、仅张力行改动 → `body.styleBinding` 存在且四键全带（primaryProfileId/auxProfileIds/dimsSource/weights）；weights 未被张力行触碰且快照为空 → 提交 `weights: {}`；`body.fingerprint === 'fp-test'`。
- [ ] C3. 跑红。核对：新例全红（控件不存在/断言失败），旧钉仍绿。

### 阶段 D：门组件实现转绿

- [ ] D1. 组件头 import 补 `DIM_SOURCE_NONE`、`nudgeWeights`（自 `@inkforge/shared`）。
- [ ] D2. state 增量（:57-66 区域，**复用既有 `weights`/`dimsSource` state，不另开草稿**）：
  - 挂载快照（useState 初始化一次）：`snapshotWeights = { ...(binding.styleBinding?.weights ?? {}) }`、`snapshotDimsSource = { ...(binding.styleBinding?.dimsSource ?? {}) }`；
  - 行级施加前快照（useRef）：`dimBefore = useRef<Record<string, Record<string,string>>>({})`（行 entry → 该维施加前值）、`weightsBefore = useRef<Record<string, Record<string,number>>>({})`（行 entry → 施加前整份 weights 副本）。
- [ ] D3. 张力区块（:113-129）重构为 lever 分控（行内三选 radio aria-label 钉 `冲突裁决：<entry>：不动|偏正文|偏档案`，`disabled={busy}`；改动处理钉）：
  - dim 行选「偏正文」→ `setDimsSource(d => ({...d, [row.dim!]: DIM_SOURCE_NONE}))`；选「偏档案」→ 写下拉选中 id；切到任一偏X前先 `dimBefore.current[row.entry] ??= { [row.dim!]: dimsSource[row.dim!] }`；选「不动」→ `dimBefore.current[row.entry]` 存在则写回该维值；
  - dim 行下拉仅在「偏档案」选中时渲染：选项=`styleIds.map(...)`（:244-248 同款查名）+ 哨兵项 `<option value={DIM_SOURCE_NONE}>不采用档案风格（按正文走）</option>`；默认 `row.profileId ?? binding.styleBinding!.primaryProfileId`；
  - weights 行「偏档案」→ `setWeights(w => nudgeWeights(w, row.profileId!, +20))`；「偏正文」→ −20；同样先存 `weightsBefore.current[row.entry] ??= { ...weights }`，「不动」→ 有存则写回；行下灰字钉（HIGH_RISK 处置，常驻）：「这条只改六轴画像与样本配比，不改各档案的文风规则文本；要精调请回上面「调整各档案占比」滑条。」；`Object.keys(snapshotWeights).length === 0` → 三选与下拉（如有）`disabled` + 灰字「这本书按贡献维数计权，占比调整不可用」；
  - none 行：无控件，灰字钉：「这条门里没有对应旋钮：要去顶部导航「蒸馏」页的「风格档案」区改档案，或到书详情页「设定」节的「世界观与剧情大纲」面板改正文。」
  - 核对：`binding.styleBinding === null` 时 dim/weights 行同样按 none 类渲染（P-1：无绑定无从组 styleBinding）。
- [ ] D4. 区块尾汇总行：`M = rows.filter(r => r.lever !== 'none' && binding.styleBinding).length`、`N = rows.length`；M>0 → 「本次 {N} 条冲突里，{M} 条可以在门里直接裁决。」；M=0 → 「本次 {N} 条冲突都只能在门外解决（改文风档案或改正文）。」
- [ ] D5. 常驻说明行（张力区块标题下、行列表上，`text-muted text-xs`）：「选「偏正文」=该维度以后不再采用档案风格，按你的正文与设定写；选「偏档案」=该维度以后跟随你指定的那本档案。两者都会**永久**改变这本书的文风绑定，要改回去请到书详情页「风格」节的「风格档案」面板。」（「永久」二字用强调样式可选，文案逐字钉）。
- [ ] D6. buildBody（:72-94）改：快照差异检测 `const dimsDirty = JSON.stringify(dimsSource) !== JSON.stringify(snapshotDimsSource); const weightsDirty = JSON.stringify(weights) !== JSON.stringify(snapshotWeights);`；提交条件 `(styleChoice === 'weights' || styleChoice === 'dims' || dimsDirty || weightsDirty) && binding.styleBinding`；命中 → 四键**恒取当前 state**（`dimsSource`/`weights` 原样；weights 原本空且未动 → `{}`）。核对：styleChoice 分支选择快照值的旧三元（:83-84）删除，state 初值即快照故等价。
- [ ] D7. 配方区逐维 select（:235-251）option 列表（:244-248）尾部补同款哨兵 option（P-2：快照含 `'__none__'` 时 :240 `value` 不悬空）。核对：配方区其余零改动。
- [ ] D8. 跑绿。核对：`pnpm -F @inkforge/web exec vitest run src/components/FusionGateDialog.test.tsx` 全绿（新例+旧钉随迁）。

### 阶段 E：收口链

- [ ] E1. `pnpm lint` → 0 error。
- [ ] E2. 定向（shared fusion.test、FusionGateDialog.test、BookDetailPage.test 回归）全绿。
- [ ] E3. `pnpm test` 全量 ≥ 基线只增。
- [ ] E4. `pnpm typecheck` → 0 error。
- [ ] E5. `pnpm deadcode` → 0 新增挂空（`nudgeWeights` 生产消费方=FusionGateDialog，同卡闭环）。
- [ ] E6. 提交（只 commit 不 push）：
  ```
  feat(web): 融合门张力行三选把手与占比步进

  shared 增纯函数 nudgeWeights（目标 ±delta、其余按比例吸收、单档最小 1、Σ 恒 100、
  越界夹边、空 map/非绑定 id 原样返回）；门内张力行按 lever 分控：dim 行三选+档案下拉
  （默认模型点名 profileId、含不采用哨兵项）、weights 行三选（±20 步进、行下标注仅作用
  六轴与样本配比、legacy 禁用）、none 行门外指引；每行施加前快照「不动」即撤销；改动
  直写与配方区共用的 dimsSource/weights state；buildBody 提交条件扩为三选外或快照有
  差异，四键恒取当前 state；配方区逐维下拉补哨兵 option。

  verify: pnpm lint/test/typecheck/deadcode 全绿，测试基线 <开工>→<收口> 只增
  GUI 未验证（owner 实测）
  Refs: docs/plans/2026-11-24-tension-levers.md
  ```

## 四、先红后绿回归测试与验收命令

以下命令均在项目根目录执行

```bash
# 1) 红（A2 / C3）
pnpm -F @inkforge/shared exec vitest run test/fusion.test.ts
pnpm -F @inkforge/web exec vitest run src/components/FusionGateDialog.test.tsx
# 2) 绿与收口（B2 / D8 / E1-E5）
pnpm lint
pnpm test
pnpm typecheck
pnpm deadcode
```

验收样例（输入 → 期望输出）：
- `nudgeWeights({A:60,B:20,C:20}, 'A', 20)` → `{A:80,B:10,C:10}`；`nudgeWeights({A:60,B:20,C:20}, 'B', -20)` → `{A:74,B:1,C:25}`；`nudgeWeights({}, 'A', 20)` → `{}`。
- 门内 dim 行「偏正文」→ 确认体 `styleBinding.dimsSource[dim]='__none__'`（TL-3 已放行）→ 落库 → 下次生成该维无画像行（TL-2 链）。
- weights 行 ±20 → Σ=100、键集不变；legacy 书 → 控件禁用+灰字。
- styleChoice 仍 keep、仅张力改动 → `body.styleBinding` 存在四键全带，`body.fingerprint` 恒带。

## 五、约束

- 只 commit 不 push；永不 `--no-verify`；永不 `git add -A`。
- 读 >4KB 文件用 pointer_tools 的 pointerize/read_pointer/read_diff_only。
- 卡外问题（analyze 响应行缺 lever（TL-1 未生效）、confirm weights={} 仍 400（TL-3 未生效）、:89 旧钉随迁失败）即停回报——先确认前置卡确实已合入。
- 禁读 `apps/server/data/**`、词表文件、真实书稿文本；夹具中性仿形（profileNames 用「示例主档案/示例辅档案」等占位名）。
- GUI 本批不做黑盒验证：提交信息注明「GUI 未验证（owner 实测）」；不得替 owner 勾选已验证。
- 禁改 `fusionGate.ts`、planner/fewshot 区块、A 类剥节逻辑——本卡只允许 §二 清单四文件内的锚点增量。
