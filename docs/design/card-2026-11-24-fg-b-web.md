# 卡 FG-B（web）：融合门文案白话化 + 档案名渲染 + 三选 + 409 stale 文案 + sticky 标题（2026-11-24）

## 一、根因/目标

门组件（`FusionGateDialog.tsx`）通篇工程腔（「A 类剥节候选」「风格绑定快照」「绑/不绑」「剥 MD 文本」）且裸显 UUID（`sp1`、`pp1`），owner 读不懂自己在确认什么；「剥 MD 文本」是假选项（与片段勾选落同一份剥除稿）；confirm 失败回显原始报错、无「参考资料已变动」场景的指引。目标：按下方**文案真值表**全量替换 9 区块文案；UUID 一律换档案名（`profileNames` 查名，缺失回落 id 前 8 位灰字、`title`=完整 id）；风格行四选砍三选；`fusionGate.ts` confirm 回传 `report.fingerprint` 并把 409 映射成 stale 指引文案；标题区滚动 sticky。**功能语义零变化**：confirm body 的裁决键与 buildBody 既有映射规则不变（仅删 strip 分支、增 fingerprint 回传）；页面调用方（`BookDetailPage.tsx:1060`、`NewBookIdeaPage.tsx:334`）零改动。前置=卡 FG-A（DTO `binding.profileNames` 与 `confirmBody.fingerprint` 已合入）。计划真值=`docs/plans/2026-11-24-fusion-gate-readability.md` Task-02。

## 二、改动文件（不得越界）

- Modify `apps/web/src/components/FusionGateDialog.tsx`（docblock `:6-16`、`StyleChoice :28`、`buildBody :59-80`、区块 `:82-296` 逐条见真值表）
- Modify `apps/web/src/fusionGate.ts`（`:53-69` onConfirm；新增导出常量）
- Test Modify `apps/web/src/components/FusionGateDialog.test.tsx`（fixture `:32-39`、旧钉 9 处随迁、新增 6 用例）
- Test Modify `apps/web/src/pages/BookDetailPage.test.tsx`（**仅** `:54-61` GATE_SHOW_REPORT 的 binding 增 `profileNames: {}`）

仅这 4 文件入提交。**零改动存证**（不得顺手改）：`apps/web/src/pages/BookDetailPage.tsx`、`apps/web/src/pages/NewBookIdeaPage.tsx`、`apps/web/src/pages/NewBookIdeaPage.test.tsx`、`apps/web/src/api/client.ts`（`apiErrorText`:76 已有，直接 import 复用）、`apps/web/src/pages/BookDetailPage.test.tsx` 其余全部（尤其 ：517-552 书详情自身「文风示例注入」面板用例=回归锚，必须保持绿）。

## 三、改法

### A. 文案真值表（钉值，逐字照抄，不得改字；左列=组件现行行号）

| # | 落点 | 新文案 |
|---|---|---|
| 1 | 副标题 :86 | 下面列出这次生成会喂给 AI 的参考资料，以及可以调整的地方。点「确认并开始生成」会保存你的调整并开始生成；点「取消」不保存任何改动。 |
| 2a | 降级横幅 :91 | 这次没有做正文与档案的冲突对照（不影响生成） |
| 2b | 分析中 :94 | 正在对照正文与档案… |
| 3a | A 类节标题 :117 | 正文里残留的设定片段 |
| 3b | A 类空状态 :119 | 这次没有需要从正文移除的片段。 |
| 3c | 行勾选 aria :130 | `移除片段：${row.heading}` |
| 3d | verdict :136（映射表替代裸 `{row.verdict}`） | fully-carried→档案里已有，移除不丢内容；partially-carried→档案只覆盖一部分，移除可能丢内容；not-carried→档案里没有，建议保留 |
| 3e | 不可剥 :137 | （这段动不了） |
| 3f | 勾选后提示 :139 | 想逐段自由取舍，请到书详情页「设定」节的「世界观与剧情大纲」面板直接改正文。 |
| 4a | style 节标题 :149 | 文风配方（当前绑定） |
| 4b | 无绑定态 :151 | 这本书还没绑定文风档案，生成时不会参考文风档案。 |
| 4c | 有绑定首行 :154-157 | 主参考《主档名》＋辅助《辅档名》《辅档名》（名=nameOf）；下方灰字行：weights 非空→占比：《名》 60、《名》 40（主→辅顺序列 weights 值）；weights 为空对象→（旧绑定：按贡献维数计权） |
| 4d | 风格选择 :160-165 | 四选砍三选：删 `strip`；「保持现状」「调整各档案占比」「逐维度选跟随哪本档案」 |
| 4e | 选项 aria :175 | `文风调整：${label}` |
| 4f | 选中项下方一行灰字 | weights→数字越大越像那本档案；dims→为每个风格维度单独指定跟随哪本档案；keep 无解释行 |
| 4g | 滑条行 :185/:191 | 标签=nameOf(id)；aria=`占比：${nameOf(id)}` |
| 4h | 维度行 :203/:207/:211-213 | 行标签=dim 键原文（dimsSource 键=STYLE_DIMENSIONS 中文标签本体，`packages/shared/src/api.ts:400`，无需映射表）；aria=`跟随：${dim}`；option 文本=nameOf(id)（value 仍 id） |
| 5a | planner 节标题 :226 | 大纲阶段参考的档案 |
| 5b | 附注 :227 | 这里只决定"写大纲"时参考什么；成文风格由上面的文风配方决定，正文写法仍以大纲卡为准。 |
| 5c | 三行 :31-35/:230-231 | label 保留「剧情档案/光谱档案/仿写档案」；绑定行 label 后显示「《nameOf(id)》」 |
| 5d | radio :238/:241/:249/:252 | 「作为参考」/「不作为参考」；aria=`${row.label}：作为参考` / `${row.label}：不作为参考` |
| 5e | 无绑定行 | 显示「未绑定{row.label}」（如「未绑定光谱档案」），该行两个 radio 禁用（busy 禁用叠加不变） |
| 5f | 组级说明（planner `ul` 后新增一行灰字） | 选「不作为参考」= 永久解除这本书与该档案的绑定，之后每次生成都不再参考它；要重新绑定，请到「蒸馏」页里对应档案的绑定框。 |
| 6 | fewshot :260 | 文风示例注入：{开\|关}（这里只能看，要开关请到书详情页「风格」节的「风格档案」面板） |
| 7 | suppress :273/:278 | 以后生成前不再弹这个确认（参考资料一有变动还会再提醒）（checkbox aria-label 同文） |
| 8a | 错误回显 generic :263-265 | `保存失败：${error}。这次什么都没改、也没开始生成，可以再试一次，或点取消离开。`（role=alert 保留） |
| 8b | 409 stale（判等 `STALE_GATE_MESSAGE` 时整句替换 8a，无前缀） | 这本书的参考资料刚在别处被改动，本次确认的内容已经过期。请点取消，再重新点生成，门会刷新。 |
| 9 | sticky | h2「生成前融合确认」+副标题（#1）包 `<div className="sticky top-0 z-10 -mx-5 -mt-5 bg-surface px-5 pb-2 pt-5">`（滚动容器=:84 的 overflow-y-auto div；负 margin 盖住容器 p-5） |
| 10 | 按钮 :281-286 | 不变：「取消」「确认并开始生成」 |

### B. 代码结构钉死

1. **nameOf**（组件内）：`const nameOf = (id: string): string => binding.profileNames?.[id] ?? id.slice(0, 8);`——`?.` 必须保留（旧 stub/运行时缺键防御）；显示 `nameOf(id)` 的元素一律加 `title={id}`（完整 UUID 悬停可见）；测试用 `getByTitle` 核验。灰字回落：回落值所在 span 沿用既有 `text-muted`/`text-xs` 灰字样式。
2. **verdict 映射**：`const VERDICT_LABELS: Record<FusionAClassRowDto['verdict'], string> = { 'fully-carried': '档案里已有，移除不丢内容', 'partially-carried': '档案只覆盖一部分，移除可能丢内容', 'not-carried': '档案里没有，建议保留' }`。
3. **StyleChoice**：`type StyleChoice = 'keep' | 'weights' | 'dims'`；`buildBody` 的 description 触发条件收窄为 `if (Object.values(stripped).some(Boolean))`（strip 分支删除）；`body` 组装末尾恒带 `body.fingerprint = report.fingerprint;`（其余键映射规则逐字节不变）。
4. **fusionGate.ts**：`import { api, apiErrorText } from './api/client';`；新增导出 `export const STALE_GATE_MESSAGE = '这本书的参考资料刚在别处被改动，本次确认的内容已经过期。请点取消，再重新点生成，门会刷新。';`（文案单一来源，组件 import 判等渲染）；onConfirm 内发请求前 `body.fingerprint = report.fingerprint;`；catch 改为 `const msg = e instanceof Error ? e.message : String(e); mount.patch({ busy: false, error: /→ 409:/.test(msg) ? STALE_GATE_MESSAGE : apiErrorText(e) });`（409 判据锚=client.ts:71 抛错格式 `METHOD url → STATUS: body`）。GateView 接口零改动。
5. **docblock（:6-16）改写**：MVP 简化说明更新为「剥后文本唯一来源=report.previewDescription，仅由片段勾选触发；风格行三选；档案名=profileNames 查名、缺失回落 id 前 8 位；409 文案由 fusionGate 映射」。

### C. 测试（先红后绿；先改断言跑红，再改组件跑绿）

**旧钉随迁（9 处，按真值表更新）**：:73→`移除片段：文风节`；:75→5b 附注；:77-78→`剧情档案：作为参考`/`剧情档案：不作为参考`；:80→`/文风示例注入：开（这里只能看/`；:83→`/世界观与剧情大纲/`；:85/:109→`以后生成前不再弹这个确认（参考资料一有变动还会再提醒）`；:124/:137→`移除片段：硬约束`/`移除片段：文风节`；:93→`这次没有做正文与档案的冲突对照（不影响生成）`；:97→`/正在对照正文与档案/`；:100-105 error 用例断言改 `保存失败：`+`/profile not found: p-x/`（generic 模板）。

**fixture 随迁**：:32-39 binding 增 `profileNames: { sp1: '示例主档案', sp2: '示例辅档案', pp1: '示例剧情档案', ip1: '示例仿写档案' }`、`dimsSource` 由 `{}` 改 `{ 节奏: 'sp1' }`（供维度行渲染）；BookDetailPage.test.tsx :54-61 binding 增 `profileNames: {}`。

**新增 6 用例**：
1. 「档案名替代 UUID」：`getByText(/主参考《示例主档案》＋辅助《示例辅档案》/)`；点「调整各档案占比」→ `getByLabelText('占比：示例主档案')` 且滑条行 label 文本=`示例主档案`（title='sp1' 经 `getByTitle('sp1')`）；点「逐维度选跟随哪本档案」→ `getByLabelText('跟随：节奏')`、select 内 option 文本含 `示例主档案`/`示例辅档案`。
2. 「profileNames 缺失 → 回落 id 前 8 位灰字」：override report 为 `binding.profileNames: {}`（其余同 fixture）→ `getByTitle('sp1')` 在场且文本=`sp1`（id≤8 位时回落=原文）。
3. 「未绑定行 radio 禁用」：fixture spectrumProfileId=null → `getByText('未绑定光谱档案')` 在场；`getByLabelText('光谱档案：作为参考')` 与 `光谱档案：不作为参考` `.disabled` 均 true；已绑定两行 radio 仍可点。
4. 「三选：无剥 MD 假选项」：`queryByText('剥 MD 文本')` null；三 radio `文风调整：保持现状`/`文风调整：调整各档案占比`/`文风调整：逐维度选跟随哪本档案` 在场；override `aClass: []` 后点「调整各档案占比」+确认 → body 无 `description` 键、`body.styleBinding.weights` 按快照、`body.fingerprint === 'fp-test'`。
5. 「409 stale 文案」：override `error: STALE_GATE_MESSAGE` → `getByText('这本书的参考资料刚在别处被改动，本次确认的内容已经过期。请点取消，再重新点生成，门会刷新。')` 且 `queryByText(/保存失败：/)` null；role=alert 仍在、确认按钮仍在。
6. 「planner 行显示《名》」：`getByText('《示例剧情档案》')`、`getByText('《示例仿写档案》')` 在场；光谱行显示「未绑定光谱档案」。

## 四、先红后绿回归测试 + 验收命令

以下命令均在项目根目录执行。

- 先红：改完旧钉与新增 6 例后 `pnpm -F @inkforge/web test` → 旧钉与新例红（组件未改）。
- 后绿：组件+helper 改完 → 同命令全绿（既有用例只许按真值表更新钉值，禁删用例；`BookDetailPage.test.tsx` 除 ：54-61 fixture 外一字不改且全绿）。
- `pnpm typecheck` → 0 错；`pnpm lint` → 零输出；`pnpm deadcode` → 零新增告警（新导出仅 `STALE_GATE_MESSAGE`）。
- `pnpm test` → 全量零失败，逐包计数 ≥ 开工实跑基线（只增不减；起点执行时实测记录）。
- `git show --stat HEAD` → 文件集恰 4 文件不越界。

## 约束

前置卡 FG-A 已合入（`profileNames`/`fingerprint` 类型可用）；若未合入即停回报。只 commit 不 push；永不 `--no-verify`；永不 `git add -A`；提交 Conventional 前缀+中文（建议 `feat(web): 融合门文案白话化、档案名渲染与陈旧指纹指引`），正文注明「**GUI 未验证（owner 真实测试）**」+ `verify:` 实测结果 + `Refs: docs/plans/2026-11-24-fusion-gate-readability.md Task-02`。禁读 `apps/server/data/**`、词表文件、真实书稿文本。文案逐字照抄真值表，发现真值表与组件现实冲突（如行号漂移）即停回报，不得自行改语义。卡外问题即停回报待裁决。执行中读取大于 4KB 的文件或查看改动，用 `python C:/Users/57850/.zcode/tools/pointer_tools.py` 的 pointerize/read_pointer/read_diff_only，禁止整读文件全文。
