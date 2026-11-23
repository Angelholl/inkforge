# 卡：术语表去污——TERMS 禁人名+NAMES 报备行+解析端人名泄漏过滤

以下命令均在项目根目录执行（相对路径）。

> 派卡前置：无。非禁入卡型（prompt 两行+解析函数一段+export 一行），走 hy4。执行中读 >4KB 文件用 pointer 工具，禁整读。

## 根因/目标

术语表蒸馏污染：默认蒸馏模板 `apps/server/src/style/analysis.ts:20` 的 TERMS 行**本身就要求「抽取人名/地名/专有词」**，解析端 `apps/server/src/llm/plainproto.ts:383-396` 仅查非空、无任何过滤，角色名原样入库（rules_json.terms）并注入 drafter/polish。修法=双层防线（人物光谱 spectrum.ts 先例）：prompt 端禁人名+NAMES 报备行，解析端按 NAMES 名单确定性剔除。计划真值=docs/plans/2026-11-23-three-feedbacks.md **任务 1**（钉值全照抄）。

## 改动文件（卡外改动即超范围）

- Modify：`apps/server/src/style/analysis.ts`（:20 TERMS 行、:21 FREQTERMS 行区分语、:21 后新增 NAMES 行、:14 注释）
- Modify：`apps/server/src/llm/plainproto.ts`（parseAnalysis :350-407：新增 NAMES 分支+循环后过滤；:348-349 注释）
- Modify：`apps/server/src/spectrum.ts`（:22 `function findNameLeak` 仅加 `export`，函数体口径不动）
- Test Modify：`apps/server/test/llm/plainproto.test.ts`、`apps/server/test/style/analysis.test.ts`

## 钉值（照抄执行，不自行发挥）

1. TERMS 行改为：`TERMS: <术语>: <用法说明>（抽取地名/专有词/称谓/器物/组织等世界观术语与用法偏好 3-10 条，严禁人物姓名；无则省略本行）`
2. FREQTERMS 行仅把「与 TERMS 的人名地名专有词区分」改为「与 TERMS 的世界观术语区分，同样严禁人物姓名」，行其余不动。
3. FREQTERMS 行之后、`不要输出 JSON` 行之前新增：`NAMES: <原文人物姓名列表，顿号分隔，仅报备不入档案；无则省略本行>`
4. parseAnalysis 新增 NAMES 分支（置于 RULES 分支之后、兜底 `errors.push('无法识别的行…')` 之前）：正则 `/^NAMES\s*[:：]\s*(.*)$/`，捕获内容按 `/[、,，;；\s]+/` 切分、trim、去空串，收集进函数内局部 `names: string[]`（切分口径=spectrum.ts:45）；continue。
5. 行循环结束后、补默认维/轴之前：若 `names.length > 0`，对 `terms` 与 `freqTerms` 各条执行 `findNameLeak(\`${t.term} ${t.note}\`, names)`（从 '../spectrum' import），命中即整条剔除并 `errors.push(\`术语含人名被过滤: ${t.term}（命中 ${hit}）\`)`。names 为空=零过滤（用户自改 distill_template 无 NAMES 行时行为不变）。
6. ParsedAnalysis 与 StyleAnalysisDto **不加任何字段**（NAMES 仅 parseAnalysis 内部消费）；spectrum.ts 除加 export 外零改动。

## 先红后绿

plainproto.test.ts 新用例先写先红（夹具自造中性名：两字名「阿美」、三字名「林静如」）：
- ① TERMS 行术语在 NAMES 行内（`TERMS: 阿美: 女主角`+`NAMES: 阿美、林静如`）→ terms 不含该条、errors 含「含人名」；
- ② 三字名子串命中（术语「林静如水」）→剔除；
- ③ note 含名（术语「口头禅」note「阿美的口头禅」）→整条剔除；
- ④ FREQTERMS 行同口径被过滤；
- ⑤ NAMES 行本身不产生「无法识别的行」error；
- ⑥ 无 NAMES 行→含人名术语保留（回归既有行为）；
- ⑦ NAMES 混用顿号/中英文逗号/分号→名单全部生效（两例名字各命中一条术语）。
既有 TERMS/FREQTERMS 解析用例（无 NAMES 行输入）断言不动；analysis.test.ts 若钉了旧模板文案按钉值 1-3 更新，不得放松断言。实现转绿。

## 验收命令

```bash
pnpm -F @inkforge/server exec vitest run test/llm/plainproto.test.ts test/style/analysis.test.ts test/style/distill.test.ts test/http/distill-jobs.test.ts test/http/distill-template.test.ts
pnpm -F @inkforge/server test
pnpm typecheck
pnpm lint
```

全绿判据：定向五文件绿；server 全量 **≥495 不减**（新用例净增，总数=495+净增数）；typecheck 全 workspace 0 错；lint 零输出。

## 约束

- 1301 纪律：禁读 `apps/server/data/**`；测试人名用自造中性名，不得引真实书稿人名。
- GUI 无涉（纯 server）；提交信息中文，`fix(server):` 前缀，正文 verify: 验证结果 + `Refs: DEC-2026-1123-01`。
- 只 commit 不 push；永不 --no-verify；永不 git add -A，逐文件 add（含本卡面）。
- 卡外发现（如 RULES 行人名引用）只登记不处理，停报待裁决项写进完成通知。
