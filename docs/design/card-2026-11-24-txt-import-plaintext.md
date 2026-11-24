# 卡 TXT-01：设定集导入纯文本降级分节（2026-11-24）

## 一、根因/目标

TXT 与 MD 走同一解析器 `parseSettingsCompendium`（`apps/server/src/settings-import.ts`），解析器只认 Markdown ATX 骨架（`##` H2 分节、`###` 卷/悬置、`**粗体**`、表格、编号段）；纯文本 TXT 无任何骨架 → 人物/大纲/伏笔/文风节定位全落空（各 0），而 description=`refineForDescription(raw)` 全文兜底（既定设计 DEC-2026-1121-01，不动）→ 内容 100% 落世界观。目标：全文 0 个 H2 且 0 个 H3 时启用纯文本降级分节（行式标题合成节 + 三抽取器 plain 形态），**含 H2/H3 骨架的 MD 路径逐字节不变**（仅 H1/无标题 MD 可从 0 结构变为产出结构，属"从无到有"）。计划真值=`docs/plans/2026-11-24-settings-import-plaintext.md`（规格 S1–S7 + Task-01…04 步骤与全部钉值，含 decision-critic 评议并入的卷行形态/偏移哨/裸名共用守卫三收紧），规格=同文件「规格」节。

## 二、改动文件（=计划全局约束，不得越界）

Modify `apps/server/src/settings-import.ts`；Test Modify `apps/server/test/settings-import.parse.test.ts`（追加 `describe('纯文本降级分节')`，**既有 describe 与全部断言一字不改**）。仅这两个文件入提交——计划/卡面等 docs 文件由主审收口，执行者不得 add。

## 三、改法

按计划 Task-01→02→03→04 串行执行，每任务以计划钉值测试先红后绿并单独 commit（共 4 个 commit）。硬钉（计划已锁，违反即返工）：降级合成仅当 `doc.sections.length===0 && doc.h3Blocks.length===0` 且合成产出非空；一切 plain 分支以 `plain===true` 为门；**零新增 export**（新函数全部模块内部）；`splitCompendiumSections`/`refineForDescription`/预算 warning 口径一律不动；NON_NAME_LABELS、KEYWORD_MAP、各正则与夹具断言照计划钉值原样落地，不得自行放宽或收紧。

## 四、先红后绿回归测试 + 验收命令（均在项目根目录执行）

- `pnpm -F @inkforge/server exec vitest run test/settings-import.parse.test.ts` → 全文件绿：既有约 30 例零改动全绿 + 计划各 Task 钉值新增例全绿；每 Task 动手前先跑新增例见红（红→实现→绿）。
- `pnpm test` → 全量零失败且总数 ≥710+本卡新增数（只增不减）。
- `pnpm typecheck` → 全 workspace 0 错；`pnpm lint` → 零输出；`pnpm deadcode` → 零新增告警。
- `git log --oneline -4` → 恰为四个任务 commit；`git show --stat` 逐个 → 文件集不越界（每 commit ≤2 文件）。

## 约束

只 commit 不 push；永不 `--no-verify`；永不 `git add -A`；提交 Conventional 前缀+中文，正文 `verify:` 实测结果 + `Refs: docs/plans/2026-11-24-settings-import-plaintext.md Task-0N`。禁读 `apps/server/data/**`、词表文件、v6 文本（夹具全部中性仿形、内容已在计划钉死）。卡外问题即停回报待裁决。执行中读取大于 4KB 的文件或查看改动，用 `python C:/Users/57850/.zcode/tools/pointer_tools.py` 的 pointerize/read_pointer/read_diff_only，禁止整读文件全文（settings-import.ts ≈10KB 必走 pointer）。
