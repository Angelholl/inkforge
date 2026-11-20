# 卡：蒸馏高频词总结（词频统计喂模型，仅展示编辑）

以下命令均在项目根目录执行（相对路径）。

## 根因/目标

蒸馏术语表（TERMS）只靠模型自由提炼专有词，样本无任何词频统计，owner 反馈缺「高频词总结」。按 DEC-2026-1120-06 与计划 docs/plans/2026-11-20-freq-terms.md 实施：程序统计样本 2/3 字 n-gram 高频词组→作为参考数据进分析 prompt→模型按 `FREQTERMS:` 行协议输出总结→落库 rules_json.freqTerms→仅 UI 展示编辑（**不注入**草稿/润色管线）。

## 改动文件（按序）

1. 新建 `apps/server/src/style/freq.ts`：`export function computeFreqGrams(samples: string[]): { term: string; count: number }[]`
   - 拼接全部样本，去除标点/空白/数字字符后统计 2 字与 3 字 gram 频次（用正则把中文/字母以外字符当分隔；gram 跨分隔符不得成词：先把文本按非中文字符切段再统计）
   - count≥3 才入选；排序 count 降序、同 count 长 gram 优先；入选长 gram 后剔除其完全包含的短 gram；截 top 20
   - 新建 `apps/server/test/style/freq.test.ts`：覆盖计数正确、标点切分不成词、count<3 剔除、包含剔除、top20 截断钉值
2. `apps/server/src/style/distill.ts`：分析调用前对 few-shot 样本文本跑 `computeFreqGrams`，结果格式化（每行 `词组×次数`）以「样本高频词组统计（程序统计，供参考）」块并入分析输入
3. `apps/server/src/style/analysis.ts`：prompt 模板新增行 `FREQTERMS: <词组>: <总结说明>（结合上方统计总结 3-8 条高频用语：何处高频/什么语境/表达功能；与 TERMS 的人名地名专有词区分；无则省略本行）`
4. `apps/server/src/llm/plainproto.ts`：解析 `FREQTERMS:` 行（格式同 TERMS：`词: 说明`）→ `StyleTermDto[]`；analysis 结果 dto 增 `freqTerms`；在 plainproto 解析测试补 FREQTERMS 用例
5. `apps/server/src/style/analysis.ts:104-117` 附近落库：rules_json 增 `freqTerms`（旧档案读侧 `?? []` 兜底，无 schema 迁移）
6. `apps/server/src/style/merge.ts`：增 `FREQ_TERMS_MAX = 10`，合并语义照抄 TERMS（主全收、辅按 term.trim() 相等去重、达限停）；merged 增 freqTerms；merge 测试补 freqTerms 钉值用例
7. `apps/server/src/style/inject.ts` **不改渲染**；在 inject 既有测试文件补一条断言：renderStyleBlock 输出不含 freqTerms 内容（防误注入钉）
8. `apps/web/src/pages/StyleProfilesSection.tsx`：新增「高频词」编辑区（textarea，每行「词组：说明」，交互/解析照抄术语区实现），create/update payload 带 `analysis.freqTerms`；`StyleProfilesSection.test.tsx` 仿 terms 用例补编辑与提交断言
9. mock provider（`apps/server/src/llm/mock.ts`）若按行协议回显分析输出，补一条 FREQTERMS 示例行，使端到端蒸馏测试可覆盖 freqTerms 落库；在 style 蒸馏既有测试中断言 rules_json.freqTerms 非空

## 验收命令

```bash
pnpm --filter @inkforge/server exec tsc --noEmit
pnpm --filter @inkforge/web exec tsc --noEmit
pnpm --filter @inkforge/server test
pnpm --filter @inkforge/web test
pnpm exec knip
```

全绿且基线只增不减（server 379+新增、web 130+新增）。

## 约束

- 只 commit 不 push；Conventional 前缀+中文提交信息，正文含 verify 结果与 Refs: DEC-2026-1120-06。
- 禁 `git add -A`；逐文件 add（含本卡面与 plans 文档）。
- 注入隔离是硬约束：renderStyleBlock 与 polish 任务文本不得出现 FREQTERMS/freqTerms。
- 现场与卡面冲突即停，保留现场待主审裁决。
