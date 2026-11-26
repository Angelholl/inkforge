# 增补计划卡 | D4 改判：精炼加做分块 map-reduce（2026-11-26）

## 0. 执行指令（卡面四条）
- 本卡为**计划修订任务卡**：只许修改 `docs/plans/2026-11-26-summary-confirm-refine-budget.md` 一个文件，产出=修订后计划 + exec.v1 契约。
- 裁决依据=`docs/design/card-2026-11-26-summary-confirm-refine-plan.md`（不足 8KB 可整读）§2 D4：**owner 改判精炼=单次 LLM + 分块 map-reduce 兜底**（原「map-reduce 不做」作废）。
- 除 §3 列明的修订点外，计划其余内容一字不动——T0-T6 与 T8/T9 的既有已确认决策不重开。
- 粒度纪律照 writing-plans：一步一动作一可核对结果；测试步含测试名+断言+精确值内嵌为代码；死行禁入（TBD/处理边界情况）。

## 1. 背景
计划现版 T7 钉的是「恰好一次 provider.complete、禁止分块」+最小窗口守卫 80000 token——这是按旧 D4 写的。owner 现已拍板加做 map-reduce 兜底，T7 需重写为双路径，相关测试、映射表、自审随之更新。

## 2. 必须尊重的既有事实（来自主会话三轮调研+critic 复核，可直接引用）
- 中文≈1.3–1.5 token/字；40475 字整篇 ≈53–61K token——**分块路径必须能吞下 owner 的假设场景：纯 64K（65536 token）窗口模型**。
- provider 窗口现状：local contextWindow=524288、cloud=200000（config.ts:162/173，写死无运行期探测）；输出侧已有自适应 `estimateOutputBudget`（budget.ts，TOKENS_PER_CHAR=4.0 英文假设本批不动）。
- 现有单测形态：mock provider 按步名路由（meta.step='refine'），支持调用计数与错误注入。
- 端点外部契约已定死不可变：POST /api/settings-import/refine → 200 {description, truncated}；错误=502+errors；zod `content: z.string().min(1)`；`timeouts.refine=180000`（T1 钉值）；前端按钮「AI 精炼」在途文案「精炼中…」+aria-busy（T9）。
- 既有测试基线只增不减（server/web/shared 三处，执行者动代码前实测）。

## 3. 修订点清单（逐项完成并在交付报告里对照打勾）
1. **全局约束节 D4 bullet**：照抄卡面 §2 D4 新裁决文本。
2. **T7 整节重写为双路径**：
   - 大窗口路径=现单次逻辑保留（调用计数恰 1 的测试保留）。
   - 新增分块路径：分块边界规则、每段目标尺寸、合并策略、触发条件（输入超阈或 provider 窗口低于下限——**具体阈值由你定死并配测试**，须覆盖 64K 窗 + 40K 字输入场景）；任一段失败/空输出的处理口径定死。
   - 最小窗口守卫重写：原 `contextWindow < 80000 → throw` 与 map-reduce 并存关系说清（小窗走分块，不再一律拒）。
   - 超时语义定死：per-call `config.timeouts.refine=180000` 还是总预算=你定，测试钉住。
3. **T8**：外部契约不动；补多段调用失败路径的断言（至少一例：分块中途某段 mock 报错→整体 502 可读 reason）。
4. **T9**：仅确认在途文案覆盖分块耗时场景（措辞可含进度，如「精炼中…」保持亦可），不加新 UI。
5. **决策→任务映射 D4 行、§4 测试清单**：新增分块路径条目（边界/调用数/合并输出≤budget/truncated）；自审五查重跑并更新相应条目（含第 1/2/4 条涉及 T7 的表述）。

## 4. 验收命令（主审复核用，执行者自检对照）
以下均在项目根目录执行：
1. `grep -n "map-reduce" docs/plans/2026-11-26-summary-confirm-refine-budget.md` —— T7 正文、全局约束 D4、映射表三处齐。
2. 单次路径测试断言与分块路径测试断言并存（各至少一条具名测试）。
3. `grep -nE "TBD|处理边界情况|加合适的校验" docs/plans/2026-11-26-summary-confirm-refine-budget.md` 零命中。
4. T0-T6 正文与修订前逐字一致（git diff 只落在 D4 相关段落）。
