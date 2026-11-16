# 章题识别扩展 + mock 文件通道收尾 + 仿写校验 实现计划

**目标：** 拆章识别「（一）/一、/第 1 章」等章题形态（owner 实测反馈）；INKFORGE_MOCK 文件通道收尾（DEC-2026-1117-02 报告 P2，owner 立项）；仿写面板前置校验+章数钳制（P3-1，owner 立项）。

**架构：** 全部改动落在既有单点——拆章=NewBookPage 的 CHAPTER_LINE_RE；mock=loadConfig 的 readSettingsFile 通道；仿写=ImitationProfilesSection.analyze 前置校验。无新表无新端点。

**规格：** 决策账 DEC-2026-1117-02（P2 修复方案）、owner 2026-11-17 反馈原文（（一）、第一章等无法识别）、上轮蒸馏表单校验口径（DEC-2026-1117-01 随案钉细节）。

## 全局约束
- 测试基线 349 只增不减；验证链硬序 typecheck→定向→全量→lint→build 冒烟→安全扫描。
- 新正则必须保持防误判行为：「一、二、三，报数」「（完）」「1.5 万」「第二天他走了」不识别（已实证 18/18）。
- 显式不做：半角点形态「1. 雪夜」（误判 1.5 万/3.14 风险，owner 样本未出现；再现再议）。
- GUI 未验证（owner 真实测试，DEC-2026-1116-02）。

## 任务 A：章题正则三形态
**文件：** Modify apps/web/src/pages/NewBookPage.tsx:7；Test apps/web/src/pages/NewBookPage.test.tsx（splitChapters describe 内追加）
**接口：** Produces——CHAPTER_LINE_RE 新形态被 splitChapters 唯一消费；无其他文件引用该正则（grep 已证）。
**步骤：**
- [ ] NewBookPage.tsx:7 正则换为三分支（共享 NUM 字符类，保持单行常量形态）：
      `第\s*NUM+\s*[章节回]\s*[^。\n]*`（原形态+空格容忍）| `NUM+\s*、\s*[^、。\n]*`（顿号，排顿号复现）| `[（(]\s*NUM+\s*[）)]\s*[^。\n]*`（括号全/半角）；NUM=[0-9〇零一二三四五六七八九十百千两]；注释写明三形态与防误判约束
- [ ] 测试追加 4 例：①「（一）雪夜/（二）天明」拆 2 章且 title 含括号；②「一、雪夜/十二、天明」拆 2 章；③「第 1 章 雪夜」空格变体识别；④防误判——含「一、二、三，报数」「（完）」「1.5 万」行的文本不被切（整篇 1 章）
- [ ] `pnpm vitest run src/pages/NewBookPage.test.tsx` 全绿（现有 5 例+新 4 例）

## 任务 B：INKFORGE_MOCK 文件通道收尾
**文件：** Modify apps/server/src/settings.ts:14（删 `INKFORGE_MOCK: z.enum(['0', '1']).optional()`）；Test apps/server/test/config.test.ts（追加用例）
**接口：** Consumes——既有 loadConfig(env) 与 readSettingsFile(p) 签名不变；Produces——settingsSchema 不再认 INKFORGE_MOCK（zod 默认 strip 未知键，config.json 残留键成死数据、writeSettingsFile 下次保存顺带洗掉）；config.ts:143/176 不动（env 通道保留）。
**步骤：**
- [ ] settings.ts 删该 schema 行
- [ ] config.test.ts 追加 2 例：①临时 config.json 含 `"INKFORGE_MOCK":"1"` → readSettingsFile 返回对象不含该键；②同一文件 + loadConfig（env 无 INKFORGE_MOCK）→ config.mock === false（文件通道无法启用 mock）
- [ ] `pnpm vitest run test/config.test.ts` 全绿
**注意：** config.test.ts 现有用例若依赖 settingsSchema 认 INKFORGE_MOCK（先 grep 确认，实证现无此依赖）。

## 任务 C：仿写面板前置校验+章数钳制
**文件：** Modify apps/web/src/pages/ImitationProfilesSection.tsx:15（chapterCount 改 string state '12'）、:23-35（analyze 前置校验）、:153-164（input 受控 string）；Test apps/web/src/pages/ImitationProfilesSection.test.tsx（追加）
**接口：** Consumes——analyzeImitation 契约不变（chapterCount int 1-50 必传，服务端 schema imitationAnalyzeSchema）；Produces——无。
**步骤：**
- [ ] chapterCount：`useState('12')` string；input value/onChange 受控 string；analyze 内 `const count = Math.min(50, Math.max(1, Math.round(Number(chapterCount)) || 12))` 后发送
- [ ] analyze() 前置校验（文案对齐蒸馏面板口径）：`name.trim()===''` → `setMsg('请先填写仿写档案名称')` return；`text.replace(/\s/g,'').length < 200` → `setMsg(\`参考正文去空白后不足 200 字（当前 ${n} 字），请粘贴或导入更多正文\`)` return
- [ ] 测试追加 3 例：①空名点拆解 → 显示「请先填写仿写档案名称」且无 analyze 调用；②短文 → 200 字拦截文案且无调用；③章数清空后输入「abc」再点拆解（合法名+足量正文）→ 发送 chapterCount=12
- [ ] `pnpm vitest run src/pages/ImitationProfilesSection.test.tsx` 全绿

## 收口（三卡后）
- [ ] typecheck → 全量（基线 349 只增不减）→ lint → build 冒烟 → 秘密正则+audit
- [ ] 决策账 DEC-2026-1117-03 归档 → commit（fix(web+server)）→ push + ls-remote 复核

## 自审五查
1. 规格覆盖：owner 反馈①→TaskA；上轮 P2→TaskB；P3-1→TaskC ✓
2. 步骤扫描：每步单一写法（正则串/删行/钳制式/文案均已钉死）✓
3. 类型一致：chapterCount string 化后仅 analyze 内转换，DTO 仍发 number ✓
4. 输入类：全角/半角括号、中/阿数字、顿号复现、句号行、「（完）」——18 组已实证 ✓
5. 比例：计划短于代码量 ✓
