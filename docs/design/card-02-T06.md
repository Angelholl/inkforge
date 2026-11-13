# 卡 0.2-T06：入口 A server 一——原文导入端点（server 161→163）

## 根因/背景
0.2 计划 v2（docs/plans/2026-11-13-inkforge-0.2-draft.md，任务 0.2-T06）。入口 A 第一段：原文章节批量导入，零模型调用。挂机 run 已终态，守卫解除。

## 改动文件
- Modify `apps/server/src/http/routes.ts`、`apps/server/src/http/schemas.ts`、`apps/server/src/db/repositories/chapters.ts`
- Create `apps/server/test/http/import.test.ts`（+2）

## 改法（钉死接口）
```ts
export const importOriginalSchema = z.object({
  chapters: z.array(z.object({ title: z.string().min(1), content: z.string().min(1) })).min(1).max(500),
});
function importOriginalChapters(db: Database, input: { bookId: string; chapters: Array<{ title: string; content: string }> })
  : { imported: number; firstChapterNo: number; lastChapterNo: number };
// POST /api/books/:bookId/import-original → 201 {imported, firstChapterNo, lastChapterNo} | 404
```
行为：章号自 `max(chapter_no)+1` 接续（空书从 1）；每章 `is_original=1, status='done', blueprint_json=NULL, target_chars=3000` + kind `'original'` 版本 + setCurrentVersion + syncFts，事务包裹；零模型调用、零 L0/summarize；重复导入允许。

## 先红后绿
import.test.ts +2（先红）：
1. `'导入 3 章 → is_original + original 版本 + FTS 可检索'`（inject 调端点 + chapters 表断言 is_original + versions[0].kind==='original' + FTS search 命中）
2. `'接续编号 + 404'`（同书二次导入 firstChapterNo===4；不存在 bookId → 404）
→ 红；实现 → 绿。

## 验收命令（以下命令均在项目根目录执行）
```bash
pnpm --filter @inkforge/server exec vitest run test/http test/db   # 全绿（含新 2 例）
pnpm --filter @inkforge/server exec tsc --noEmit                    # 0 错
```

## 约束
- 只 commit 不 push：`feat(server): 入口 A 原文导入端点（original 章节接续编号）`，正文 verify:+Refs: DEC-2026-1113-05。
- 禁触生产库 data/inkforge.db、禁重启服务、禁改 gate.ts/plainproto 解析/nsi/物证目录。
- 用例数只增不减；超范围（其它端点/schema）即停报。
