# SP-P 卡：人物光谱蒸馏容量放宽——实现计划产出

## 背景与根因（已调研定案，照抄入计划，勿重新发明）

用户实测《少年阿磊》设定集导入（42 人物卡）后光谱蒸馏只出 8 原型。定性=设计如此，非 bug：
- 蒸馏输入不是人物卡，是原文均匀抽样：`apps/server/src/spectrum.ts:72-74` 调 `sampleReferenceText(source, { segmentChars: 2000, maxSegments: 8 })`（共用函数在 `apps/server/src/style/sample.ts`，默认值 20000/20，勿改默认）。
- prompt 模板 `apps/server/src/spectrum.ts:6-11` 明文「ROLE 行 3-8 条」；解析端 `spectrum.ts:79-81` 少于 3 条 throw、多于上限 `roles.slice(0, 8)`。
- save schema `apps/server/src/http/schemas.ts:267` 附近：`structure: z.array(z.string().min(1)).min(1).max(8)`。
- planner 注入槽 spectrumReference budgetChars=600（`apps/server/src/http/routes.ts:432-457`），仅 planner 注入、drafter 不注入是红线，不动。

## 已拍板决策（DEC-2026-1125-02，owner 选项确认，计划照此钉死）

三处数字联动：
1. ROLE 条数上限 8 → **16**：prompt「3-8 条」→「3-16 条」、`slice(0, 8)` → `slice(0, 16)`、schema `max(8)` → `max(16)`。下限 3 与「不足 3 条判蒸馏失败」语义不动。
2. spectrum.ts 调用点抽样预算 maxSegments 8 → **16**（segmentChars 2000 不变）；`sampleReferenceText` 函数本体与默认值零改动（style/plot 共用）。
3. planner 注入预算 spectrumReference 600 → **1500** 字。

## 改动文件（全部，一个执行卡装得下）

- `apps/server/src/spectrum.ts`（prompt 文案、slice 上限、调用点入参三处）
- `apps/server/src/http/schemas.ts`（max(8)→max(16)）
- `apps/server/src/http/routes.ts`（注入 budgetChars 600→1500）
- 随迁测试：全仓 grep `spectrum`、`3-8`、`slice(0, 8)`、`maxSegments: 8`、`budgetChars.*600` 找齐钉值断言与夹具，逐处更新；新增回归例（见下）。

## 先红后绿回归测试（计划必须写明测试名+断言）

1. schema 边界：structure 数组 17 条 → 400/校验失败；16 条 → 通过。
2. 解析截断：模型返回 20 条 ROLE → 结果保留前 16 条（现行为 8，钉值随迁+语义不变）。
3. 抽样调用点：spectrum 蒸馏传 maxSegments:16（结构断言或 spy，按现有测试风格选一种并写明）。
4. 注入预算：planner 提示含 spectrumReference 槽 budgetChars=1500 的断言（若现无此测试则新增；参考现有 plot/style 注入预算测试写法）。

## 全局约束

- 测试基线只增不减，起点=815。
- 存量已入库光谱档案不重蒸、无迁移代码。
- 脱敏机制（NAMES 命中→重蒸一次→再犯 throw）与 ROLE 禁人名 prompt 条款零改动。
- drafter 不注入红线不动；`sampleReferenceText` 默认值不动；plot 蒸馏口径不动。
- 不改 `apps/server/data/**` 任何真实数据。

## 交付物

`docs/plans/2026-11-25-spectrum-capacity.md`，格式=计划头（目标/架构/规格）+全局约束+任务表（每任务：文件精确路径带行号、Interfaces、checkbox 步骤串，每步 2-5 分钟粒度、一个动作+可核对结果）。无 TBD、无「处理边界情况」类死行。

## 验收命令（以下命令均在项目根目录执行）

1. `grep -n "3-16\|slice(0, 16)\|maxSegments: 16\|max(16)" docs/plans/2026-11-25-spectrum-capacity.md` 四处钉值齐。
2. 计划中每个改动文件都有对应任务；上述四条回归测试各有测试名+断言。
3. 自审五查（规格覆盖/步骤唯一可写/类型一致/隐含输入类/比例）在计划末尾逐条打勾留痕。

## 执行指针令

执行中读取大于 4KB 的文件用 `python C:/Users/57850/.zcode/tools/pointer_tools.py` 的 pointerize/read_pointer，禁止整读全文；本卡产出为新建计划文档，允许直接 Write。只写这一个文件，不得改动其他任何文件。
