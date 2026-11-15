# 卡A：蒸馏升独立 TAB——建页/瘦身/接线（计划任务 1+2）

## 一、背景与根因

owner 需求：蒸馏从 `/settings` 分区升独立一级 TAB（/distill，rail 工作台组）。实现计划=**`docs/plans/2026-11-15-distill-tab.md`（真值源，规格钉与步骤逐条照办）**，本卡执行其任务 1+2。

## 二、改动文件

- Create `apps/web/src/pages/DistillPage.tsx` + `DistillPage.test.tsx`
- Modify `apps/web/src/pages/SettingsPage.tsx`（瘦身为仅模型设置）+ `SettingsPage.test.tsx`（+1 it）
- Modify `apps/web/src/App.tsx`（rail 加蒸馏项，FlaskConical）+ `App.test.tsx`（更新+1 it）
- Modify `apps/web/src/main.tsx`（/distill 路由 + /styles 改指 /distill）

## 三、改法

按计划文档任务 1 步骤 1.1-1.6、任务 2 步骤 2.1-2.5 串行执行（红绿流程，步骤内含精确测试断言与 commit 信息）。规格钉 1-3、9 生效；行号锚点按全局约束自底向上处理。

## 四、验收命令

以下命令均在项目根目录执行：

```bash
pnpm --filter @inkforge/web test        # 全绿；任务1 后全仓 265、任务2 后 266（基线 262 只增不减）
pnpm typecheck                          # 过
pnpm lint                               # 过（收口前）
git status --porcelain                  # 仅上述 8 个代码文件 + docs 两件（卡与计划由主审提交，勿 add）
```

## 约束

- 两笔 commit 按计划 1.6/2.5 信息（Conventional+中文，正文 verify: 注明测试计数）；**只 commit 不 push**；docs/plans 与 docs/design 的本卡/计划文件勿 add（主审一并提交）。
- 禁改 `apps/server/**`、`packages/shared/**`；禁新增依赖；不新增 token。
- 卡外问题即停待裁决；发现计划与代码实态冲突（行号漂移等）按最近邻锚点执行并在报告注明。
