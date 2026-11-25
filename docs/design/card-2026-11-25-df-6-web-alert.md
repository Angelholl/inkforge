# 执行卡 DF-6：web 草稿预览 warning 显示（层③前端）

- 计划真值=`docs/plans/2026-11-25-dims-floor.md`（Task DF-6 + §3.6 字面量 + §8 GUI 延后条款 + §4 全局约束）；决策归档=DEC-2026-1125-01。
- 前置：DF-1~DF-5 已合入（7592333/39b2ddb/61a4d12/9c81281/0c92094）；`DistillStyleDraftDto.warnings?` 已由轮询 DTO 自动透传。

## 0. 背景（根因）

三层强制层③的前端落点：重试后仍不达标的维以 warning 呈现于入库前草稿编辑器顶部，供人工补厚——这是新档案唯一的「机器+人工」双道之一（另一道=自动重试）。仅显示层改动，无逻辑分支。

## 1. 改动文件（不得越界）

| 文件 | 操作 |
| --- | --- |
| `apps/web/src/pages/StyleProfilesSection.tsx` | Modify——①pollJob done 后组装 draft 处写 `warnings: job.result.warnings ?? []`；②`DistillDraftState`（约 :546-552）扩 `warnings: string[]`；③草稿预览区 `<h3>草稿预览编辑（未入库）</h3>` 之后、六维编辑区之前插入条件渲染 alert（§2） |
| `apps/web/src/pages/StyleProfilesSection.test.tsx` | 新增 1 例＋jobStub 变体（禁删改既有断言） |

## 2. 钉死规格（照计划 §3.6）

- 仅 `draft.warnings.length > 0` 时渲染；无 warning 时 DOM 不出现该节点。
- 容器 `role="alert"`，复用现有 token：`rounded-card border border-line bg-bg p-2 text-xs text-muted`。
- 文案字面量：`单维字数不足（草稿未达标，请编辑补厚后再确认入库）：{draft.warnings.join('；')}`。
- `createStyleProfile` payload **不带** warnings（不入库红线）。

## 3. 改法（每步一个动作 + 可核对结果）

- [ ] A0 实跑 `pnpm test` 记数（应 ≥813=DF-5 收口数）。核对：数字记卡面。
- [ ] S1（红，先写测试）stub 增 `jobWarnings: string[]` 变体（afterEach 复位 []），job done 的 result 带上它；新例设 2 条 warning → 蒸馏到草稿 → 断言 `screen.getByRole('alert')` 文本含前缀与两条文案。核对=**红**（无 alert 节点）。
- [ ] S2（绿）按 §1/§2 实现；重跑 S1 绿；另加「无 warning 时 `queryByRole('alert')` 为 null」断言（并入同例或独立例均可，语义唯一即可）。核对：定向全绿。
- [ ] S3（守）确认 createStyleProfile payload 未带 warnings、既有测试零删改。核对=`pnpm --filter @inkforge/web test` 全绿+该断言成立。
- [ ] C1 `pnpm lint` → C2 定向（StyleProfilesSection.test.tsx）→ C3 `pnpm test` 全量 ≥A0 只增 → C4 `pnpm typecheck` → C5 `pnpm deadcode`。每步核对：exit 0 / 数字记录。
- [ ] C6 `git diff --stat HEAD~1..HEAD`（提交后）改动 ⊆ §1 两文件。核对：对表。
- [ ] C7 提交：`feat(web): 蒸馏草稿warning显示role-alert（DF-6）`，正文 `verify: ...` **必须含「GUI 未验证」标注**（真实浏览器实测按 11-24 令延批次收口由 owner 做），+ `Refs: docs/plans/2026-11-25-dims-floor.md`。只 commit 不 push。

## 4. 验收命令

以下命令均在项目根目录执行：

```
pnpm --filter @inkforge/web test
pnpm lint
pnpm test
pnpm typecheck
pnpm deadcode
```

## 5. 约束

- 只 commit 不 push；永不 `--no-verify`；永不 `git add -A`。
- 读 >4KB 文件用 `python C:/Users/57850/.zcode/tools/pointer_tools.py` 的 pointerize/read_pointer/read_diff_only，禁止整读文件全文（StyleProfilesSection.tsx 超 4KB）。
- 禁改：shared api.ts、server 任何文件、web 其他组件；行号快照漂移以锚点文本定位。
- GUI 黑盒实测不在本卡（延批次收口 owner 四点位）；卡外问题即停回报。
