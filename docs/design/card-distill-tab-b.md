# 卡B：蒸馏导入选项——文件导入/选书带章/高级项（计划任务 3+4+5）

## 一、背景与根因

owner 需求：蒸馏表单提供导入选项（对齐 MirrorNovel 采样体验）。实现计划=**`docs/plans/2026-11-15-distill-tab.md`（真值源）**，本卡执行其任务 3+4+5（前置卡A=commit c71bbbe 已含 DistillPage/rail 接线）。

## 二、改动文件

- Modify `apps/web/src/pages/StyleProfilesSection.tsx` + `.test.tsx`（文件导入 + 高级项 + 挂载选书器）
- Create `apps/web/src/pages/BookSamplePicker.tsx`（选书带章独立组件）

## 三、改法

按计划任务 3（步骤 3.1-3.4）→ 任务 4（步骤 4.1-4.4）→ 任务 5（步骤 5.1-5.4）串行执行，红绿流程不许跳。规格钉 4-8 生效（current 判定/拼接格式/20 上限/aria-label/高级项空串不传键）；任务 5 若实现超 30 行（不含测试）即裁并改收口计数为 269。

## 四、验收命令

以下命令均在项目根目录执行：

```bash
pnpm --filter @inkforge/web test StyleProfilesSection   # 定向绿；含新增 4 it（或 3 it 若裁任务5）
pnpm --filter @inkforge/web test                        # 任务4 后全仓 269、任务5 后 270（≥262 只增不减）
pnpm typecheck                                          # 过
pnpm lint                                               # 过（收口前）
git status --porcelain                                  # 仅上述 3 个代码文件 + docs 两件（勿 add docs）
```

## 约束

- 三笔 commit 按计划 3.4/4.4/5.4 信息（Conventional+中文，正文 verify: 注明测试计数）；**只 commit 不 push**；docs/plans 与 docs/design 两目录文件勿 add。
- 禁改 `apps/server/**`、`packages/shared/**`、`apps/web/src/api/client.ts`（client 现有方法已够用）；禁新增依赖。
- 卡外问题即停待裁决；计划与实态冲突按最近邻锚点执行并报告注明。
