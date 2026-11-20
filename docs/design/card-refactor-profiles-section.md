# 卡：三份 ProfilesSection 抽公共泛型组件（纯重构，行为不变）

以下命令均在项目根目录执行（相对路径）。

> 派卡前置条件：同工作树无其他在飞卡（预算截断卡已收口）方可执行；本卡为备用卡面，主审会在派发前核对现场。

## 根因/目标

style/plot/spectrum 三份档案分区逐行同构（约 200 行，差异仅 API 方法组、文案、字段细节），属拷贝式漂移温床（第 3 例触发固化惯例，owner 已知情）。目标=提取共享骨架组件一份，三分区变薄配置壳；**行为零变化**（既有测试全绿即为行为不变的判据，测试文件原则上不改断言）。

## 参照实现（动手前完整读，禁略读）

- `apps/web/src/pages/PlotProfilesSection.tsx` —— 取其结构为基准形态（其余两份对照列差异清单）
- `apps/web/src/pages/StyleProfilesSection.tsx`、`apps/web/src/pages/SpectrumProfilesSection.tsx`
- 三者的 `.test.tsx`（断言即行为契约，逐条对照不得改变语义）
- `apps/web/src/api/client.ts` 三组 API 方法签名

## 差异清单（先盘再抽；以现场实读为准，此清单供起点）

1. API 方法组：style（analyze/save/list/delete 绑定为多选面板独立实现）/ plot（analyze/save/list/delete/bind）/ spectrum（analyze/save/list/delete/bindSpectrum）
2. 卡片元信息行：style 有句长中位数/自评、版本/重蒸按钮与版本面板；plot/spectrum 为版本（或无）+条数
3. style 有创建态编辑表单（七维/六轴/规则/术语/高频词）与「查看细节」只读面板——**style 的这两块复杂度不在抽公共范围内**，见「范围裁剪」
4. 绑定交互：style 独立面板、plot/spectrum 为下拉+按钮；文案与 testid 前缀不同

## 范围裁剪（防过度设计）

- 只抽**四函数骨架 + 两步删除确认 + 绑定下拉 + 列表卡片布局 + 蒸馏表单（来源文本+名称+前置校验）**这一公共形状
- style 特有的：七维编辑表单、查看细节面板、版本/重蒸面板——留在 StyleProfilesSection 内作为 `children`/render-prop 注入或独立子组件，**不**塞进公共组件
- 不动 API 层、不动后端、不改任何文案与 testid（测试断言依赖它们）

## 改动文件

1. 新建 `apps/web/src/components/DistillProfilesShell.tsx`（命名可现场微调）：泛型 props 至少含——`api: { analyze; save; list; remove; bind? }`、`labels: { 标题/按钮/空态/确认文案 }`、`testidPrefix`、`metaRender?: (p) => ReactNode`（卡片元信息行差异）、`extraCardActions?: (p) => ReactNode`（版本/重蒸等额外按钮）、`bindSlot?: {...}`（plot/spectrum 绑定形状；style 无则不传）
2. 三个 Section 各瘦身为配置壳（style 保留其特有子组件与面板），对 contentType/dto 泛型化
3. 测试文件：**不改断言语义**；若 testid 挂载方式变化导致 queryByTestId 选择器要调路径级写法，允许机械调整并在提交正文逐条列出；任何断言增删即超范围，停手呈报

## 验收命令

```bash
pnpm --filter @inkforge/web exec tsc --noEmit
pnpm --filter @inkforge/web test
pnpm --filter @inkforge/server test
pnpm exec knip
```

全绿且基线**数字不变**（派卡时主审已亲跑钉值：web 144 / server 429；本卡纯重构无新测试，两数均不得变化）。

## 约束

- 行为不变是硬约束：文案、testid、请求形状、交互序列一律不变化。
- 只 commit 不 push；Conventional 前缀+中文提交信息（`refactor(web):` 前缀），正文 verify+注明「纯重构行为不变；GUI 未验证（owner 真实测试）」。
- 禁 `git add -A`；逐文件 add（含本卡面）。
- 净行数下降是预期结果，但不以行数为验收指标，以测试全绿+结构清晰为准。
- 现场与卡面冲突（含差异清单与实读不符、测试断言必须改动才能通过）即停待裁决。
