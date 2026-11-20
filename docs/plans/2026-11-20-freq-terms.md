# 计划：蒸馏术语表补高频词总结（DEC-2026-1120-06）

owner 拍板：①词频统计喂给模型（程序统计样本高频词组→作为参考数据进分析 prompt→模型总结）；②仅展示编辑（freqTerms 不注入草稿/润色管线）。

## 现状

术语表 TERMS 由模型自由提炼（analysis.ts:19 prompt / plainproto.ts:368 解析 / rules_json.terms 落库 / merge.ts TERMS_MAX=10 合并 / inject.ts 渲染注入 / StyleProfilesSection 编辑）。全库无词频统计（metrics.ts 仅字符级指标）。

## 改动设计

1. **统计器（新）** `apps/server/src/style/freq.ts`：纯函数 `computeFreqGrams(samples: string[], opts?)`——中文免分词，拼接样本后计 2/3 字 n-gram 频次；过滤含标点/空白/数字的 gram；count≥3 才入选；排序 count 降序、次级按长度长者优先；剔除被更长入选 gram 完全包含的短 gram；取 top 20。返回 `{term, count}[]`。配套 `freq.test.ts`（纯函数红绿：计数/过滤/包含剔除/截断钉值）。
2. **蒸馏链路接缝** `apps/server/src/style/distill.ts`：在分析调用前对 few-shot 样本文本跑统计，把 top 词组×次数以「样本高频词组统计（程序统计，供参考）」块追加进分析输入；透传给 analysis。
3. **prompt** `apps/server/src/style/analysis.ts`：新增行协议 `FREQTERMS: <词组>: <总结说明>`（3-8 条：何处高频/什么语境/表达功能；无则省略本行），与 TERMS 行并列；说明高频词组≠人名地名，重在复现用语习惯。
4. **解析** `apps/server/src/llm/plainproto.ts`：解析 FREQTERMS 行 → `StyleTermDto[]`（复用 {term,note}），analysis dto 增 `freqTerms` 字段；plainproto 解析测试补行。
5. **落库** `analysis.ts:104-117` rules_json 增 `freqTerms`；读侧 dto/迁移：rules_json 为 JSON 字段，无 schema 迁移，旧档案缺字段按 `[]` 兜底。
6. **合并** `merge.ts`：`FREQ_TERMS_MAX=10`，语义同 TERMS（主全收、辅去重、达限停）；merged.freqTerms 供合并档案 UI 展示；merge 测试补钉值。
7. **注入隔离** `inject.ts` `renderStyleBlock` **不改**——freqTerms 不得出现在【术语表】注入块（钉一条 inject 测试断言不含高频词内容，防未来误注入）。
8. **UI** `apps/web/src/pages/StyleProfilesSection.tsx`：新增「高频词」编辑区（textarea，每行「词组：说明」，复用术语区交互与解析），create/update payload 带 `analysis.freqTerms`；UI 测试仿 terms 既有用例。

## 验收口径

- freq 统计纯函数测试 + plainproto/merge/inject/UI 测试全绿；既有基线只增不减。
- 端到端：mock provider 蒸馏一次产出含 freqTerms 的档案（style 既有蒸馏测试扩展）。
- `pnpm deadcode`、双包 tsc、lint 零报。

## 卡分配

单卡执行（code-Executor），验收主审亲跑验证链。
