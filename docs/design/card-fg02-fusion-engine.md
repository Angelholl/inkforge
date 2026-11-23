# 卡 FG-02：A 类剥节引擎纯函数 + 消费节清单（consumedSections）（2026-11-24）

## 一、根因/目标

融合门 MVP 第二卡：解析器增发「消费节清单」，A 类剥节引擎按「载体驱动、判定精确到片段」产出剥除候选与预览稿。计划真值=`docs/plans/2026-11-24-gen-fusion-gate.md` **Task-02**（接口块+七条判定规则+步骤 1–7 逐 checkbox）；规格=`docs/design/proposal-2026-11-23-import-reconcile.md` v3.1 §2/§3.5。注意：计划 Task-02 判定规则 5/7 与步骤 6 用例清单已经主审对码修正（**限段删除**+节外行双保护+对应回归钉），照修正后计划执行即可，勿按更早版本理解。

## 二、改动文件（=计划 Task-02 文件清单，不得越界）

Modify `apps/server/src/settings-import.ts`（refineForDescription 加 export、新增 splitCompendiumSections、返回增 consumedSections——与 :494/:499/:501/:542/:447 五处 find 同一事实源、固定序）；Create `apps/server/src/fusion/engine.ts`；Test Modify `apps/server/test/settings-import.parse.test.ts`（三例追加）；Test Create `apps/server/test/fusion/engine.test.ts`（计划步骤 6 的八例一条不落）。

## 三、改法

按计划 Task-02 步骤 1–7。硬钉：引擎零 LLM、零落库、内容无关；剥除只作用于 description 绝不回流解析输入（N1）；同输入重跑逐字节一致（N3）；`applyStripping` 按标题行定位节段、只删段内命中行（限段，防跨节同文本误删）；carrier 五类文本由夹具自造（《示例之作》系），禁引 v6 真实文本。

## 四、先红后绿回归测试 + 验收命令（均在项目根目录执行）

- `pnpm -F @inkforge/server exec vitest run test/fusion/engine.test.ts` → 新用例先红后绿
- `pnpm -F @inkforge/server exec vitest run test/settings-import.parse.test.ts test/http/settings-import.test.ts` → 既有断言零删改全绿（冲击 #3/#4 复核）
- `pnpm -F @inkforge/server exec vitest run test/fusion` → 全绿
- `pnpm lint` → 零输出；`pnpm typecheck` → 全 workspace 0 错
- `git show --stat HEAD` → 文件集不越界

## 约束

只 commit 不 push；永不 `--no-verify`；永不 `git add -A`（逐文件 add）；提交 Conventional 前缀+中文，正文 `verify:` 实测结果+`Refs: docs/plans/2026-11-24-gen-fusion-gate.md Task-02；规格 v3.1`。禁读 `apps/server/data/**`、`apps/server/config/quality/landing-words.default.txt`、v6 文本。卡外问题即停回报待裁决，勿自行扩大改动面。执行中读取大于 4KB 的文件或查看改动，用 `python C:/Users/57850/.zcode/tools/pointer_tools.py` 的 pointerize/read_pointer/read_diff_only，禁止整读文件全文。
