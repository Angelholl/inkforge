# 执行卡 DF-3：反馈重试一次 + warning 生成（层②③核心）

- 计划真值=`docs/plans/2026-11-25-dims-floor.md`（Task DF-3 + §3.5/§3.6 字面量 + 随迁项 G1/G5 + §4 全局约束）；决策归档=DEC-2026-1125-01。
- 前置：DF-1=7592333、DF-2=39b2ddb 已合入（`STYLE_DIM_MIN_CHARS`/`dimShortfalls` 可用）。

## 0. 背景（根因）

三层强制的层②执行半程+层③生成半程：解析端逐维缺口（DF-2 `dimShortfalls`）非空时，**带具体反馈自动重试一次**；重试后仍不达=产出 `warnings` 供透传人工补厚。与既有「全空重试一次」回路互斥共用（同一次调用机会，不叠加）。

## 1. 改动文件（不得越界）

| 文件 | 操作 |
| --- | --- |
| `apps/server/src/style/analysis.ts` | Modify——:58-68 既有重试回路条件扩为「isEmpty ∨ dimShortfalls.length>0」；返回签名扩展（§2-B1）；warning 生成（§2-B3） |
| `apps/server/test/style/analysis.test.ts` | 新增 describe（先红）＋**随迁**：:147-148「第二次蒸馏首轮」断言 captured[1]→captured[2]（重试使调用下标后移，语义不变只改钉值；轮次筛选亦可） |

禁改：`plainproto.ts`、`distill-job.ts`、shared api.ts、web 任何文件（归 DF-4/DF-6）；「空源抛错」「全空重试原句」语义零变化。

## 2. 钉死规格（逐字照计划，不得自创）

- **B1 签名**：`analyzeStyle` 返回扩为 `Promise<{ analysis: StyleAnalysisDto; evaluation: SelfEvalItem[]; warnings: string[] }>`；调用面 `distill.ts:42`/`routes.ts:335` 只解构 `analysis`，编译不破（DF-3-S4 守）。
- **B2 重试**：条件=`isEmpty(analysis) || first.dimShortfalls.length > 0`；**上限=1**——第二次 complete 后无论结果不再发第三次（自评 held-out 调用不是重试、不计入）；反馈字面量 `维度${s.dim}仅${s.chars}字，低于下限70字，请重写该维`，多条以 `；` 连接、整体前缀 `【单维字数不足，需重写】`，作为 `\n\n${feedback}` 拼到原 user 后。
- **B3 互斥与生成**：isEmpty 为真时沿用现状原句 `【解析失败重试】…`，不叠加缺口文案；第二次解析后仍 isEmpty ⇒ 沿用抛错；非空但仍有缺口 ⇒ 不抛、按字面量 `维度${s.dim}仅${s.chars}字，低于下限70字`（无「请重写该维」尾）生成 warnings。warnings 恒取**最终一次**解析的 dimShortfalls；未重试则取第一次；首轮全达标=[]。

## 3. 改法（每步一个动作 + 可核对结果）

- [ ] A0 实跑 `pnpm test` 记数（应 ≥809=DF-2 收口数）。核对：数字记卡面。
- [ ] S1（红，先写测试）新增「校验触发重试」例——capturing provider 依次返回「六维中 1 条 42 字+5 条达标」「全部达标」；断言解析类 complete 调用数=2、warnings=[]。核对=**红**（旧实现无缺口重试）。
- [ ] S2（红）同例加断言第 2 次 user 含 `维度语言与描写仅42字，低于下限70字，请重写该维`；另加「重试后仍不足」例（两次同短文本）断言 warnings=`['维度语言与描写仅42字，低于下限70字']`、调用数仍=2。核对=**2 红**。
- [ ] S3（绿）按 §2 实现；重跑 S1/S2 全绿；既有 analysis.test 全量绿（含 :147 随迁后）、「空源抛错」「全空重试」语义用例未动。核对：绿+随迁记录进 verify。
- [ ] S4（守）`pnpm typecheck` 零报（distill.ts/routes.ts 解构面）。
- [ ] C1 `pnpm lint` → C2 定向（analysis.test.ts）→ C3 `pnpm test` 全量 ≥A0 只增 → C4 `pnpm typecheck` → C5 `pnpm deadcode`。每步核对：exit 0 / 数字记录。
- [ ] C6 `git diff --stat` 改动 ⊆ §1 两文件。核对：对表。
- [ ] C7 提交：`feat(style): 蒸馏逐维缺口带反馈重试一次+warning生成（DF-3）`，正文 `verify: ...` + `Refs: docs/plans/2026-11-25-dims-floor.md`。只 commit 不 push。

## 4. 验收命令

以下命令均在项目根目录执行：

```
pnpm --filter @inkforge/server test -- test/style/analysis.test.ts
pnpm lint
pnpm test
pnpm typecheck
pnpm deadcode
```

## 5. 约束

- 只 commit 不 push；永不 `--no-verify`；永不 `git add -A`。
- 读 >4KB 文件用 `python C:/Users/57850/.zcode/tools/pointer_tools.py` 的 pointerize/read_pointer/read_diff_only，禁止整读文件全文（analysis.ts、analysis.test.ts 均超 4KB）。
- 行号=2026-11-25 快照，施工以锚点文本定位；卡外问题即停回报，不得越界顺手改。
