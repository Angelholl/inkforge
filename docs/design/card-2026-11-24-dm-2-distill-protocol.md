# 执行卡 DM-2：蒸馏行协议六维化 + 默认模板定向要求

- 计划：`docs/plans/2026-11-24-style-dims-merge.md`（规格 §3.3 为真值）。
- 前置：DM-1 已合入（`STYLE_DIMENSIONS` 已是六维、写路径校验已自动拒旧名）；行号漂移以实际为准。

## 0. 背景（根因）

DM-1 翻表后 `parseAnalysis`（apps/server/src/llm/plainproto.ts:352-427）只认新六维名（`:366` 校验、`:424` 缺省补空串均读常量），但默认蒸馏模板 `ANALYSIS_INSTRUCTION`（apps/server/src/style/analysis.ts:15-24）仍指示旧八维名——不改则新蒸馏产出的旧名 DIM 行全部记 errors 丢弃、六维文本落空。owner 另钉两句定向要求：`叙述方式` 显式覆盖 视角/人称/POV/心理距离（原诉求：门里「叙述视角与文风绑定」冲突没有旋钮）；`语言与描写` 注明含对话腔与描写腔。

## 1. 改动文件（不得越界）

| 文件 | 操作 |
| --- | --- |
| `apps/server/src/llm/plainproto.ts` | Modify（仅 :366 报错文案；:424 读常量零改动，只复核） |
| `apps/server/src/style/analysis.ts` | Modify（:15-24 `ANALYSIS_INSTRUCTION` 模板文本；:26-30 `RULES_INSTRUCTION` 不动） |
| `apps/server/test/llm/plainproto.test.ts` | 新例（禁删旧例） |
| `apps/server/test/style/analysis.test.ts` | 新例（禁删旧例） |
| `apps/server/test/http/distill-template.test.ts` | Modify（:105 断言随迁 + 新增定向要求断言） |
| `apps/server/test/http/style.test.ts` | 新例（旧名 DIM 行行为锁定；复核 DM-1 已随迁面仍绿） |

禁改：parseAnalysis 解析分支结构（:360-411 行协议顺序与容错）、app_meta.distill_template 存量数据、`RULES_INSTRUCTION`、settings-import 生产代码。

## 2. 改法（每步一个动作 + 可核对结果）

### A. 基线与新例先红

- [ ] A1 实跑 `pnpm test` 记录用例总数（≥ DM-1 收口数）。核对：数字记卡面。
- [ ] A2 `apps/server/test/llm/plainproto.test.ts` 新增 2 例：①输入 `DIM: 对话: 甲\nDIM: 写作特点: 乙\nDIM: 语言与描写: 丙\nAXIS: 叙述温度: 50` → `errors` 含 `未知维度: 对话` 且含 `现行六维` 字样（红驱动=新文案），`dims['语言与描写']==='丙'`，`dims['叙述方式']===''`（旧名行不并入、缺行补 ''）；②六名齐行 → 六键全取值。核对：①红（文案未改）②绿，记录。
- [ ] A3 `apps/server/test/style/analysis.test.ts` 新增 1 例（行为锁定，红驱动同为新文案）：messy 输入含 `DIM：情感基调：压抑中带暖意` 与旧名 `DIM: 描写: 厚` → `dims['情感基调']==='压抑中带暖意'`、`dims['语言与描写']===''`、`errors.some(e => e.includes('现行六维'))`。核对：红（B2 前旧文案无「现行六维」字样）。
- [ ] A4 `apps/server/test/http/distill-template.test.ts`：把 :105 断言改为 `expect(captured[0]).toContain('六维：语言与描写、特色词汇、结构与节奏、情感基调、尺度、叙述方式')`；新增 `expect(captured[0]).toContain('心理距离')` 与 `expect(captured[0]).toContain('对话腔')`。核对：红（模板未改）。

### B. 实现转绿

- [ ] B1 `apps/server/src/style/analysis.ts:15-24` `ANALYSIS_INSTRUCTION` 首行 DIM 说明改为：
  `DIM: <维度>: <一段描述>（六维：语言与描写、特色词汇、结构与节奏、情感基调、尺度、叙述方式，每维一行）`
  并在 :17 尺度注释行前后插入两行括注：
  `（语言与描写维=对话腔与描写腔的合并画像：写明对话占比与腔调、描写密度与手法；对话或描写稀缺时写「以叙述推进，对话/描写少」。）`
  `（叙述方式维=视角与距离的画像：写明叙述视角（第一/第三人称等）、人称与 POV 落点、心理距离（贴身内窥/旁观疏离）与心理描写手法。）`
  :17 尺度行原样保留；其余行（AXIS/RULES/TERMS/FREQTERMS/NAMES）不动。核对：A4 定向绿。
- [ ] B2 `apps/server/src/llm/plainproto.ts:366` 文案改 `` `未知维度: ${name}（现行六维：语言与描写、特色词汇、结构与节奏、情感基调、尺度、叙述方式）` ``。核对：A2/A3 定向绿；`:424` 目视复核仍读 `STYLE_DIMENSIONS`（零改动）。
- [ ] B3 `apps/server/test/http/style.test.ts` 新增 1 例：summarizer canned 文本含旧名 `DIM: 写作特点: 短句为主` → 蒸馏草稿 `draft.analysis.dims['叙述方式']===''` 且 job 不失败（errors 不上抛）；同 canned 加 `DIM: 叙述方式: 统计式幽默` → dims['叙述方式'] 取值。核对：绿。
- [ ] B4 复核 `apps/server/test/http/settings-import.test.ts` 仍绿（DM-1 已随迁夹具；模板改动只影响默认文案不入该路径）。核对：定向绿。

### C. 收口（验证链硬序）

- [ ] C1 `pnpm lint` → C2 定向（A/B 涉及文件）→ C3 `pnpm test` 全量 ≥ A1 只增 → C4 `pnpm typecheck` → C5 `pnpm deadcode`。每步核对：exit 0 / 数字记录。
- [ ] C6 `git status` 改动 ⊆ §1 清单。核对：对表。
- [ ] C7 提交：`feat(style): 蒸馏行协议六维化+叙述方式/语言与描写定向要求（DM-2）`，正文 `verify: ...` + `Refs: docs/plans/2026-11-24-style-dims-merge.md`。只 commit 不 push。

## 3. 验收命令

以下命令均在项目根目录执行（不写仓库根绝对路径）：

```
pnpm -F @inkforge/server exec vitest run test/llm/plainproto.test.ts test/style/analysis.test.ts test/http/distill-template.test.ts test/http/style.test.ts test/http/settings-import.test.ts
pnpm lint
pnpm test
pnpm typecheck
pnpm deadcode
```

## 4. 约束

- 只 commit 不 push；永不 `--no-verify`；永不 `git add -A`。
- 读 >4KB 文件用 `C:/Users/57850/.zcode/tools/pointer_tools.py` 的 pointerize/read_pointer/read_diff_only（plainproto.ts、style.test.ts 超 4KB）。
- 卡外问题即停回报（如：旧名 DIM 行现网表现与 A2 假设不符、模板文案断言与 captured 形状不合）。
- 纯文本/文案改动，无 GUI 验证义务。
