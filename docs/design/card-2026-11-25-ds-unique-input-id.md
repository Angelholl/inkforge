# 执行卡 DS-1：蒸馏壳文件选择 id 去重（光谱区导入落回本区）

- 类型：修 bug（GUI 组件），单卡批次。
- 症状（owner 2026-11-25 实测，dev 环境）：蒸馏页光谱分区点「导入」选完 `少年阿磊-人物提取.md` 后本区毫无反应。

## 0. 根因（已核实，勿重查）

`apps/web/src/components/DistillProfilesShell.tsx` 的隐藏文件 input 用静态 id（:327 `id="distill-sample-file"`），label 用 `htmlFor="distill-sample-file"`（:344）。`apps/web/src/pages/DistillPage.tsx:74-76` 把 Plot→Spectrum 两个分区（均为该壳实例）同页挂载，DOM 里出现两个相同 id 的 input；label 激活行为解析到 DOM 顺序第一个（剧情区）——光谱区点导入选中的文件全部落进剧情区的 text/fileInfo state，光谱区自身无回显，即「点了没反应」。剧情区因排前反而正常。

范围界定：`StyleProfilesSection.tsx:429/:446` 的 `import-sample-file` 与 `SettingsImportPanel.tsx:108` 的 `settings-import-file` 均为单实例静态 id，无碰撞，本卡不动。

## 1. 改动文件（不得越界）

| 文件 | 操作 |
| --- | --- |
| `apps/web/src/components/DistillProfilesShell.tsx` | Modify：组件顶部 `const inputId = useId();`（React 18+ `useId`，import 补 `useId`），:327 `id={inputId}`、:344 `htmlFor={inputId}`。其余零改动 |
| `apps/web/src/components/DistillProfilesShell.test.tsx` | 新建回归测试（先红后绿） |

## 2. 改法（每步一个动作 + 可核对结果）

### A. 先红

- [ ] A1 实跑 `pnpm test` 记录全量基线数（应为 801，只增不减），记入卡面执行记录。
- [ ] A2 新建 `DistillProfilesShell.test.tsx`，harness 参照同目录既有组件测试（如 `SettingsImportPanel.test.tsx`）的 fetch/api mock 口径，渲染两个壳实例（按 `PlotProfilesSection.tsx` 与 `SpectrumProfilesSection.tsx` 各自传入的 labels/api 配置，挂载顺序同 DistillPage：Plot 在前）。断言三件：
  1. 两个 `input[type=file]` 的 `id` 属性不相等；
  2. 每个壳内 label 的 `htmlFor` 等于**本壳** input 的 `id`（用 within(壳容器) 圈定）；
  3. 行为断言：对第二个壳的 file input `fireEvent.change`（jsdom `new File([...≥200字文本...], 'x.md')`），`await findByText(/已按 .* 解码/)` 出现在第二个壳的 subtree 内，且第一个壳 subtree 内无该回显。
- [ ] A3 跑该测试文件：断言 1、3 红（断言 2 在修复前对第二个壳也红）。核对：红且失败原因与本卡根因一致。

### B. 实现转绿

- [ ] B1 按 §1 落 `useId` 改动。核对：A2 三断言全绿。

### C. 收口（验证链硬序）

- [ ] C1 `pnpm lint` → C2 定向跑 `DistillProfilesShell.test.tsx` → C3 `pnpm test` 全量 ≥ A1 基线只增 → C4 `pnpm typecheck` → C5 `pnpm deadcode`。每步核对：exit 0 / 数字。
- [ ] C6 `git status` 改动 ⊆ §1 清单。核对：对表。
- [ ] C7 提交：`fix(web): 蒸馏壳文件选择 id 用 useId 去重，光谱区导入落回本区（DS-1）`，正文 `verify: <验证链各步结果一行>` + `Refs: docs/design/card-2026-11-25-ds-unique-input-id.md`，注明「GUI 未验证（owner 实测点位：蒸馏页光谱分区点导入选文件→本区出现文件名+解码回显）」。

## 3. 验收命令

以下命令均在项目根目录执行：

```
pnpm -F @inkforge/web exec vitest run src/components/DistillProfilesShell.test.tsx
pnpm lint
pnpm test
pnpm typecheck
pnpm deadcode
```

## 4. 约束

- 只 commit 不 push；永不 `--no-verify`；永不 `git add -A`。
- 读 >4KB 的文件用 `C:/Users/57850/.zcode/tools/pointer_tools.py` 的 pointerize/read_pointer/read_diff_only，禁止整读全文。
- 卡外问题即停回报（如：useId 生成的 id 含冒号导致既有测试选择器碎裂——只许改本卡新测试的选择器口径，不许动生产代码之外的既有测试）。
- 不得顺手给 StyleProfilesSection / SettingsImportPanel 的静态 id 加 useId（单实例无碰撞，越界即退回）。

## 5. 收口记录（2026-11-25）

- hy4 执行 commit 65395c8（先红 3/3→绿，执行者自报）；主审亲跑验证链：lint 0 / 定向 3 passed / 全量 804（≥801 只增）/ typecheck 0 / deadcode 0 / build 冒烟 0。
- 安全门=本卡零新增（无依赖变更）；基线漂移备案：现存 6 条 dev 工具链公告（vitest 链×2+@vitest/mocker×2、tinypool critical×2、minimatch moderate，公告日 10-05/10-27，均早于 11-24 上次 push 即已存在），基线文件陈旧（11-13/119 依赖，早于 web 测试工具链）——建议下轮审计窗口做基线刷新或 vitest 链升级卡（升级卡属放量白名单）。
- GUI 未验证，owner 实测点位：蒸馏页光谱分区点导入选文件→本区出现文件名+解码回显（剧情区导入本就正常，可对照）。
