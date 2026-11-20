# 卡：设定集导入落章骨架 + 分级词表落地门（Task-01）

以下命令均在项目根目录执行（你 cwd 即仓库根）。

## 根因/目标

owner 实测：v4 设定集导入后正文无 H 情景。取证（docs/decision-log.md DEC-2026-1120-10）：导入无损但 outline_nodes 卡在生成期零消费、逐章预填不落库（schemas.ts 注释处）→ 蓝图无落地节拍、beat_coverage 空转。本卡：apply 按卡落 chapters 骨架（章题+落地格→mustHaveBeats 含 grade），并给 beat_coverage 加「分级词表 AND 层」封死人名关键词平凡打穿（『阿美』每章都在→旧 OR 语义恒绿）。

## 施工真值（先读这两个区，按钉值执行，不得偏离）

`docs/plans/2026-11-20-gen-landing-style-inject.md`：
- 全局约束：第 9–17 行（Read offset/limit 读，勿整读文件）
- Task-01 全文：第 21–455 行（1-1 parseLandingCell / 1-2 apply 落章 / 1-3 schema 注释 / 1-4 grade 传播七件套+词表 AND 层+数据文件+壳注入 / 1-5 三测试文件 / 1-6 验收 / 1-7 命令）

行号仅导航，施工按锚文本定位。大代码文件（routes.ts 等）勿整读，按锚文本定位后局部 Read。

## 改动文件

1. `apps/server/src/settings-import.ts`：新增 `parseLandingCell`（matchParen 之后）
2. `apps/server/src/http/routes.ts`：apply 事务内落章骨架；`warnings` 声明前移
3. `apps/server/src/http/schemas.ts`：blueprintSchema mustHaveBeats 加 `grade: z.enum(['H','L']).optional()`；settingsImportApplySchema 上方注释钉清
4. `packages/shared/src/domain.ts`：`BeatRequirement` 加 `grade?: 'H' | 'L'`
5. `apps/server/src/quality/l0.ts`：新增 `loadLandingWords`；runL0Checks input 加 `landingWords?`；beat_coverage 双层判定（全文见计划 1-4-E）
6. `apps/server/config/quality/landing-words.default.txt`：新增（内容照计划 1-4-C 定稿全文）
7. `apps/server/src/pipeline/chapter.ts`：LANDING_WORDS_PATH 常量 + 装载 + runL0Checks 传入
8. `apps/desktop/src-tauri/src/main.rs`：release env 注入一行（镜像 INKFORGE_CLIQUES_PATH）
9. 测试：`test/settings-import.parse.test.ts`（parseLandingCell 组）、`test/http/settings-import.test.ts`（apply 落章 describe）、`test/quality/l0.test.ts`（AND 层六例 describe）

## 验收命令（按序，任一环失败即停）

```bash
pnpm lint
pnpm --filter @inkforge/server typecheck
pnpm --filter @inkforge/server exec vitest run test/settings-import.parse.test.ts test/http/settings-import.test.ts test/quality/l0.test.ts
pnpm --filter @inkforge/server test
pnpm -r --if-present run typecheck
cargo check
```

（cargo check 在 apps/desktop/src-tauri 下跑；工具链环境不可用时注明回报由主审补验，不得为此装环境。全绿且测试基线只增不减。）

## 约束

- 基线=派卡时 HEAD（开工时记录哈希随回报）；只 commit 不 push；禁 `git add -A`（逐文件 add，含本卡面）；永不 `--no-verify`。
- 提交信息：`feat(server): 设定集导入落章骨架并接分级词表落地门（beat_coverage AND 层）`，正文 `verify: <实测结果>；Refs: DEC-2026-1120-10`；注明「GUI 未验证（owner 真实测试）」。
- 不动清单照计划全局约束 4；counts 响应键集不变；apply 既有测试 counts/warnings 钉值必须原样通过。
- 词表文件内容照计划定稿逐字落盘（owner 可编辑数据文件，不进共享码）。
- 现场与卡面冲突即停待裁决；预期外前端需求即停回报。预计工时 ≤60 分钟，超时先回报进度。
