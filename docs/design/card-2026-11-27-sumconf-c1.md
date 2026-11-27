# C1 卡面：迁移 0016 + 仓储 alias 读写（ZCode Agent 通道·独占串行窗）

**真值源：** docs/plans/2026-11-27-summary-unmatched-confirm.md「任务 T1」节——SQL 逐字照钉死块，签名/测试名照计划。
**指针令：** 执行中读取大于 4KB 的文件或查看改动，用 `python C:/Users/57850/.zcode/tools/pointer_tools.py` 的 pointerize/read_pointer/read_diff_only，禁止整读文件全文。

## 根因
人物匹配全精确同名、无 alias 设施；owner 拍板 Q4=per-book aliases（迁移 0016），支撑「精确同名→aliases→未匹配进第五段」匹配序。本卡只做 schema+仓储层，commit 行为归 C3。

## 改动文件（写集）
- Create `apps/server/src/db/migrations/0016_character_aliases.sql`（逐字照计划钉死 SQL 块，含注释与回滚行格式=样例照 0015_gen_gate.sql）
- Modify `apps/server/src/db/repositories/books.ts`：CharacterCard 类型+CHARACTER_COLS+toCharacterCard 解析+四处 inline cast 加列；追加 `appendCharacterAlias(db, characterId, alias): void`（幂等读-判重-写回，计划 T1 算法钉死）
- Test `apps/server/test/pipeline/summarize-commit.test.ts`：+2 例（用例名照计划步骤逐字）

## 先红后绿回归测试（计划 T1 步骤串执行）
1. 迁移文件落盘 → 定向跑该测试文件既有例全绿=迁移不炸既有库
2. `0016 迁移：characters.aliases 列存在且旧行默认 []`——先红后绿
3. `appendCharacterAlias 幂等：重复 append 不产生重复项`——先红后绿（断言逐字 ['阿三']→['阿三','三哥']）

## 验收命令（以下命令均在项目根目录执行）
1. `pnpm --filter @inkforge/server exec vitest run test/pipeline/summarize-commit.test.ts` → 全绿含新增两例
2. server 全量只增不减（开卡前实测基线存证，最近台账值 681）
3. `pnpm -w typecheck` 零错；lint 零错后 commit

## 约束
- 数据库迁移卡=禁入并行型，本卡独占串行窗执行（通道=ZCode Agent，非 hy4）。
- 只 commit 不 push；禁 `git add -A`、禁 `--no-verify`；Conventional 前缀+中文描述，正文 verify:+`Refs: DEC-2026-1127-02`。
- 写集外零改动；卡外问题即停待裁决，非交互禁提问；输出与提交信息禁引小说原文片段。
