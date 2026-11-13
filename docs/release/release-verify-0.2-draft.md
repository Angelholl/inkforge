# 0.2 轮收口验证链记录（0.2-T15 + 入口 B EB-4 合并执行）

- 执行：2026-11-14，主模型亲执（DEC-2026-1113-07 不外派模式）
- 路径偏差：计划钉值产物路径 `apps/server/data/release-verify-0.2-draft.md` 落在 gitignore 的 data/ 内无法入库，改落 `docs/release/release-verify-0.2-draft.md`（内容等同，偏差登记 DEC-2026-1114-01 附注）

## 验证链结果（硬序，全绿）

| 环节 | 命令 | 结果 |
|---|---|---|
| 静态 lint | `pnpm -w lint` | 0 error |
| 静态 typecheck | `pnpm -w typecheck` | shared/server/web 三包 Done |
| 全量测试 | `pnpm -w test` | **200 = shared 2 + web 20 + server 178**（≥ 0.2 计划 188 口径；增量=四 TAB 壳 web +5 与入口 B server +5/web +1，账本见两计划） |
| 构建 | `pnpm build:web` | vite build 成功（330.92 kB / gzip 103.75 kB） |
| 定向 e2e | `vitest run test/e2e/phaseA.mock.e2e.test.ts test/e2e/phaseB.batch20.e2e.test.ts` | 5/5 passed |
| QC 召回 | `pnpm --filter @inkforge/server run qc:recall` | exit 0：L0 9/9、FPR 0/5、L1 3/3（真模型语料）、L1 valid findings 11、bad no-throw 3/3 |
| 崩溃恢复 | `node apps/server/scripts/crash-test.mjs` | exit 0：PASS（run done、3 章 done、attempt≥2 接管） |
| mock 冒烟 | 等价覆盖映射（见下） | PASS |
| 安全深扫 | git grep 秘密正则 + `pnpm audit --prod` | 秘密零命中；audit 全 0（对 data/audit-baseline.json 基线零新增） |

## mock 冒烟覆盖映射（如实记录）

原 T15 口径「签名清杀 → --validate → mock=true 守卫 → done 3/3 → summaries 按 bookId 3 行」中的签名清杀/--validate 属 0.1.2 装机冒烟程序（无独立脚本入库）。本轮等价覆盖为两条自动化+一条实跑证据：
1. `test/e2e/phaseA.mock.e2e.test.ts` 3/5 例：mock 单章闭环断言（run done、章 done、步骤产物落库）。
2. `test/e2e/phaseB.batch20.e2e.test.ts` 2/5 例：20 章批量 mock 断言。
3. EB-3 GUI 实跑：真实 service+worker（8789 全隔离 mock 态）整书生成 run 66d3f1cc 三章执行完毕（planned→needs_human，mock QC 语义），见 docs/baseline/gui-verification-0.2-entryB.md。

## 挂起项与移交清单

1. **0.2-T05（replay 语料 3→6 章）挂起**：Strata 端点离线（HTTP:000，2026-11-13 探针），浮动卡属性不阻塞收口；qc:recall L1 维持动态 3/3 口径。Strata 在线窗口执行：采集 1/16/20 bad+good 六份 → 过门失败回退 2/14/18（M15）。
2. **真模型 outline-suggest 冒烟**（入口 B，DEC-2026-1114-01 第 2 条）：并入 Strata 窗口，副本库 POST chapterCount=3 记 source/errors。
3. **0.2-T14 装机态**：incident-0.2-t14-arp-hijack 待决项（卸芽+回装 0.1.2 物证）维持「未经 owner 不执行」；芽构建重验（stamp --product-name 修复后）随 owner 表态安排。
4. **0.2 正式发版轮**（0.2.0 bump + 七处版本落点 + 存证 + tag/Release owner 表态）不在本轮范围，建议单独立轮。
5. **N-CLI / N-UI 占位卡**（DEC-2026-1113-04 M2/M3）未拆卡实施：CLI 闭合安装包蒸馏限制、UI token 映射独立卡组，随 0.2 正式发版轮或 owner 排期。
6. **晨检门②（0.1.2）**：维持 DEC-2026-1113-06 不发版口径，tag/Release 均不做。

## 本轮 commit 谱系（0.2 计划执行起点 2319f45 后）

5f46e19(T04) → 34f9183(T06) → 55a7bcd(T07) → 257990e(T08) → eb19a67(T02b) → 41d155d(T09) → 23c274f(T10) → 3c1dcd2(T09 修复) → 6cbf7b4(T11) → 4f1bbc9(T12) → c8d55b7(T13) → e0b128e(T14 事故修复) → b4dbf19(晨检) → db2bfa1(文档/DEC-07) → f8a3e88/a5c18c1/9835eb0/183ee65/14ab042(四 TAB T-02..T-06) → 87ea17a(lint 加固) → 07b46db(四 TAB 目验收口) → 25ecfab(入口 B 计划/DEC-1114-01) → 8867ad9(EB-1) → f2b6f90(EB-2) → 84bd24b(EB-3) → d73da77(EB-3 目验收口) → 本产物
