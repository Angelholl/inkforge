# 卡 TXT-02：真实剥平稿形态适配（2026-11-24）

## 一、根因/目标

TXT-01（纯文本降级分节，已推 1045ed9..af958e3）用 owner 真实文件活体冒烟仍 0 卷 0 卡：该文件是 v6 母稿剥掉全部 `#` 标记的剥平稿，节标题「5. 三卷大纲（…）」关键词不在行首、卷行「5.1 卷一《大学篇》…」带编号前缀、大纲主体为全角｜拍平的弧行/章号行/表头行——超出 S2/S4 假设；且现卷区间正则无边界，`1995.9–1999.6` 会被抠出 `9–1` 假 range。目标：按补录规格 S2a/S4a–e 增分支修好大纲面识别；人物/伏笔在该文件中本无节，不为其造数据。计划真值=`docs/plans/2026-11-24-settings-import-plaintext.md` **补录节（规格补录 + Task-05 步骤与全部钉值）**。

## 二、改动文件（不得越界）

Modify `apps/server/src/settings-import.ts`；Test Modify `apps/server/test/settings-import.parse.test.ts`（追加 `describe('真实剥平稿形态')`，**TXT-01 及更早的全部既有断言一字不改**）。仅这两文件入提交；docs 由主审收口。

## 三、改法

按 Task-05 步骤 1–7 串行、先红后绿、单独 commit。硬钉：全部新分支只在 `plain===true` 门内；零新增 export；S2a 修饰前缀与括号尾只放宽 plainSectionHeading 的起头判定与 tail 白名单（`剧情引擎库（…）` 必须仍被拒——起头词表不含「剧情」，不得顺手加词）；S4a 编号前缀剥离仅限卷分支内部尝试；S4e range 正则改「章后缀必在」形态并保 Task-03 两卷夹具回归；S4b 弧行不跑 extractCards、行后 `stage=null`；S4c 列映射 title=cells[0]、body=cells.length≥3?cells[2]:cells[1]；S4d 首格判定 `^\d{1,3}$|^\d{1,3}\s*[–—-]\s*\d{1,3}$` 之外含｜行整行 continue；分支次序照补录「分支次序钉」原样，不得调换。

## 四、先红后绿回归测试 + 验收命令（均在项目根目录执行）

- `pnpm -F @inkforge/server exec vitest run test/settings-import.parse.test.ts` → 全文件绿（既有 49 例零改动 + Task-05 六组新增例全绿；每组动手前先见红）。
- `pnpm test` → 全量零失败且 ≥725+本卡新增（只增不减）。
- `pnpm typecheck` → 0 错；`pnpm lint` → 零输出；`pnpm deadcode` → 零新增告警。
- `git show --stat HEAD` → 文件集不越界（≤2 文件）。

## 约束

只 commit 不 push；永不 `--no-verify`；永不 `git add -A`；提交 Conventional 前缀+中文，正文 `verify:` 实测结果 + `Refs: docs/plans/2026-11-24-settings-import-plaintext.md 补录 Task-05`。禁读 `apps/server/data/**`、词表文件、v6 文本与 owner Downloads 目录（夹具内容全部中性仿形、已在计划钉死，勿去找真实文件对照）。卡外问题即停回报待裁决。执行中读取大于 4KB 的文件或查看改动，用 `python C:/Users/57850/.zcode/tools/pointer_tools.py` 的 pointerize/read_pointer/read_diff_only，禁止整读文件全文。
