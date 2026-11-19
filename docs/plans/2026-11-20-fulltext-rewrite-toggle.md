# 实现计划：选段重写「改写全文」开关（owner 拍板 A 案，DEC-2026-1120-01）

- 日期：2026-11-20
- 计划/执行：主模型亲执（owner 会话令本会话不外派）
- 决策真值：DEC-2026-1120-01（docs/decision-log.md）
- 面向读者：未见过本规格的工程师。先读 §2 已核实事实再动手。

## 1. 目标

选段重写卡新增「改写全文」开关：勾选后指令作用于**当前所选版本的整章正文**；预设四键切全文版文案；产出仍 `kind=revised`、不动 current 指针（与选段重写回滚采纳语义一致）。附 8000 字硬门双保险（服务端 400 + UI 同串预检），并修复顺带发现的相邻缺陷 F2（长选段时指令被 task 槽 head 截断丢失）。

## 2. 已核实事实

| # | 事实 | 锚点 |
| --- | --- | --- |
| F1 | schema `rewriteSelectionSchema` selection `min(1)` 必填 | apps/server/src/http/schemas.ts:114-117 |
| F2 | handler 把选段全文内嵌 task 槽（budgetChars 500 / keep head）后才拼【指令】→ 选段 >~470 字符时【指令】被截丢，真实模型收不到指令；mock provider 不看 prompt 故既有测试全绿 | apps/server/src/http/routes.ts:936-943 |
| F3 | 装配器单槽超预算即静默截断（head/tail），全槽超总额再收缩 volatile 槽 | apps/server/src/context/assembler.ts:18-26,31-45 |
| F4 | providers local contextWindow 524288 / web 200000，maxOutput 均 8192 tokens → 全文改写输出真约束 ≈8000 汉字 | apps/server/src/config.ts:150-162 |
| F5 | `countChars = s.replace(/\s/g,'').length`；chapter_versions.word_count 即该口径（UI `wordCount` 同源） | packages/shared/src/text.ts:2-4；apps/server/src/db/repositories/chapters.ts:210 |
| F6 | `SELECTION_PRESETS` 仅 SelectionRewrite.tsx 自用；web 侧 mock client 的测试仅 t30.test.tsx（渲染本组件）与 BooksPage.test.tsx（无关） | rg 实证 |
| F7 | `createMockProvider` 不记录请求 → prompt 断言用捕获装饰器包一层 provider 传 buildApp | apps/server/src/llm/mock.ts:127-166 |
| F8 | `VersionRow.content: string` 非空；版本正文即 `v.content` | apps/server/src/db/repositories/chapters.ts:51-56 |

## 3. 全局约束

- 测试基线只增不减：现基线 447（server 332 + web 113 + shared 2）。
- API 路径不变（同端点 `POST /api/versions/:versionId/rewrite-selection`）；selection 转 optional 向后兼容，老 body `{selection, instruction}` 语义保留（F2 修复除外）。
- 常量唯一源：`packages/shared` 新增 `FULL_TEXT_REWRITE_MAX_CHARS = 8000`，server/web 双侧引用；8000 依据 = maxOutput 8192 tokens 的汉字规模留余量。
- 长度口径统一 countChars（F5）：服务端门与 UI 预检同串同口径。
- GUI 不做浏览器目验（owner 真实测试）；组件行为以组件测试断言为准。
- UI 文案一律中文；shared 以 src 直出无需构建。
- 提交信息 Conventional 前缀+中文描述，`Refs: DEC-2026-1120-01`。

## 4. 任务

### Task 1：服务端全文模式 + 8000 硬门 + 指令截断修复

**文件：** Modify `packages/shared/src/api.ts`（+常量）；Modify `apps/server/src/http/schemas.ts:114-117`；Modify `apps/server/src/http/routes.ts:929-964`；Create `apps/server/test/http/rewrite-fulltext.test.ts`。

**Produces：** 端点契约——body `{instruction}`（无 selection 键）=全文模式；400 reason `fulltext-too-long` / `empty-content`；params `{ selectionRewrite: true, fullText?: true, selection?, instruction, usage }`。

**步骤：**
- [ ] shared/src/api.ts 末尾加 `export const FULL_TEXT_REWRITE_MAX_CHARS = 8000;`（docblock 注明依据 maxOutput 8192 tokens 与 countChars 口径）。
- [ ] schema：`selection: z.string().min(1).optional()`，instruction 不动。
- [ ] handler 重构（保持 201 不动 current）：
  - `const full = body.selection === undefined;`
  - full 且 `countChars(v.content) === 0` → 400 `{ error: '当前版本无正文', reason: 'empty-content' }`
  - full 且 `countChars(v.content) > FULL_TEXT_REWRITE_MAX_CHARS` → 400 `{ error: `全文 ${n} 字超出单轮改写上限 ${FULL_TEXT_REWRITE_MAX_CHARS} 字，请改用选段重写（分段粘贴）或批量校对`, reason: 'fulltext-too-long' }`
  - taskInstruction 两模式统一：`` `对上面的${full ? '全文' : '选段'}按指令改写，只输出改写后的${full ? '全文' : '选段'}文本。\n【指令】${body.instruction}` ``（正文只走 original 槽——修 F2）
  - original 槽：content = full ? `v.content` : `body.selection`；budgetChars = full ? `FULL_TEXT_REWRITE_MAX_CHARS` : 6000
  - params：`{ selectionRewrite: true, ...(full ? { fullText: true } : { selection: body.selection }), instruction: body.instruction, usage: res.usage }`
- [ ] 新测试（buildApp + 捕获装饰器 provider + inject，fixture 照 polish.test.ts 惯例：tmpdir+插章+appendChapterVersion+setCurrentVersion）：
  1. 全文模式 201：kind=revised、params.fullText=true、params 无 selection 键、parentVersionId=原版本 id、current 指针不动、捕获请求 user 含【指令】+完整指令文本且含全文正文；
  2. 全文 8001 字 → 400 含 `8000` 与 reason=fulltext-too-long；
  3. 全文空正文 → 400 `当前版本无正文`；
  4. selection 模式回归 201 + params.selection 在场；
  5. 长选段（>500 字符）selection 模式：捕获请求 user 含【指令】+完整指令文本（F2 回归钉死）；
  6. 缺 instruction → 400。
- [ ] 定向跑：`pnpm --filter @inkforge/server test -- rewrite-fulltext` → 全绿。

### Task 2：前端开关 + 预设全文文案 + 预检

**文件：** Modify `apps/web/src/api/client.ts:208-212`；Modify `apps/web/src/pages/SelectionRewrite.tsx`（整文件重构）；Modify `apps/web/src/pages/ChapterReaderPage.tsx:149`；Modify `apps/web/src/pages/SelectionRewrite.test.tsx`（+3 例）。

**Consumes：** Task 1 端点契约与 `FULL_TEXT_REWRITE_MAX_CHARS`。

**步骤：**
- [ ] client：`rewriteFull: (versionId: string, instruction: string) => req<VersionDto>(同端点, { method: 'POST', body: JSON.stringify({ instruction }) })`；`rewriteSelection` 签名不动。
- [ ] `SELECTION_PRESETS` 每项加 `fullInstruction`（钉死）：续写=`从全文结尾自然续写 2-3 句，保持人称与时态`；润色=`优化全文表达与用词，不改情节与信息量`；扩写=`在全文基础上扩写细节与感官描写，篇幅约增加一半`；改对话=`将全文中适合场景的叙述改写为人物对话呈现`。
- [ ] Props 加 `fullTextChars?: number`；state 加 `full`；勾选框 `aria-label="改写全文"`，可见文案 `改写全文（整章正文${fullTextChars != null ? `，约 ${fullTextChars} 字` : ''}）`；full 时选段 textarea 不渲染（隐藏非禁用）。
- [ ] 预设点击：full 时填 `p.fullInstruction`，否则 `p.instruction`。
- [ ] 校验：full → 仅指令非空（提示 `指令不能为空`）+ `fullTextChars > FULL_TEXT_REWRITE_MAX_CHARS` 预检（文案与 Task 1 服务端 400 error 同串，n 用 fullTextChars）；非 full → 原 `选段与指令均不能为空` 不变。
- [ ] 提交：full → `api.rewriteFull(versionId, instruction)`；成功文案 full → `已生成全文改写版本 ${id.slice(0,8)}（未移动 current 指针，可在版本链中回滚采纳）`，非 full 原文案不变；按钮文本 full → `提交全文改写`，非 full 原 `提交选段重写` 不变（t30 既有断言不破）。
- [ ] ChapterReaderPage：`<SelectionRewrite versionId={current.id} fullTextChars={current.wordCount} onCreated={...} />`。
- [ ] 组件测试 +3（fetch stub 风格同文件既有）：
  1. 勾选全文 → 选段输入隐藏、预设-润色填全文文案（含`优化全文表达与用词`）、按钮文本`提交全文改写`、提交 body 无 selection 键、成功文案含`已生成全文改写版本`；
  2. full 模式指令空 → `指令不能为空` 且零 POST；
  3. `fullTextChars={9000}` → 提交显示含`8000`的预检文案且零 POST。
- [ ] 定向跑：`pnpm --filter @inkforge/web test -- SelectionRewrite` + t30 → 全绿。

### Task 3：收口

- [ ] lint 零输出 + typecheck 全 workspace 0 错。
- [ ] 全量测试 server+web+shared ≥ 452（基线 447 只增不减）。
- [ ] build:web 冒烟。
- [ ] decision log DEC-2026-1120-01 执行留痕补记（验证链数字+push SHA+F2 并入声明）。
- [ ] 提交五步：secret 扫描 → commit（`feat(web,server): 选段重写支持全文改写开关（8000 字硬门+指令截断修复）` 正文 verify+Refs）→ 三查 → 远程核对 → push + ls-remote 复核。

## 5. 自审五查

1. **规格覆盖**：拍板要点①开关→T2、②预设全文文案→T2、③schema optional+params.fullText+revised 不动 current→T1、④8000 硬门双保险→T1+T2、⑤task 槽重构修 F2→T1；无缺口。
2. **步骤扫描**：全部文案/签名/常量/断言钉死，每步唯一可写；无 TBD。
3. **类型一致**：`FULL_TEXT_REWRITE_MAX_CHARS` 两处同名；props 名 `fullTextChars` 前后一致；`rewriteFull` 签名与调用一致。
4. **隐含输入**：空正文/超 8000/缺指令/长选段指令丢失/selection 空串（min(1) 拒，未单列——schema 层既有 min(1) 覆盖且老行为不变）均有测试或既有覆盖。
5. **比例**：计划=决策+契约+测试清单，无代码抄写。
