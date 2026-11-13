# 卡：0.1.2 二十章挂机晨检（T-H 20 章段收口）

## 根因/背景
run `1dd814ed-740d-4dc0-adad-54cd725adc87`（bookId `62135d72-ca8f-41c6-a602-11b19295e37a`，20 章，09:11 启动）完成后须对照重算基线出晨检报告，作为发版门②的判定输入。

## 改动文件
- 新建 `docs/baseline/hang-2026-11-13.md`（唯一产物）。

## 改法（报告结构与生成步骤）
1. 跑指标脚本（以下命令均在项目根目录执行）：
   `pnpm --filter @inkforge/server exec node --import tsx data/morning-metrics-1113.mjs --run 1dd814ed-740d-4dc0-adad-54cd725adc87`
   产出七行指标，**逐项**对照 `apps/server/data/baseline-recalc-1113.json`（口径/分母见计划 T-H 与 F6 节），列出「指标 | 本次 | 基线 | 判定」表。
2. T29 终态判定：done≥18/20 且无 failed 未恢复=PASS；needs_human>2=PASS+缺陷进 0.2 清单；任一不满足=FAIL（不达标不发版，裁决 DEC-2026-1113-02）。
3. 导出抽查第 5/20 章：衔接与章尾检查（D4 部分收敛口径：第 4/5 章 0.77 级后缀应消失；「第X层的试炼正在展开」系允许残留）。查 DB 用 readonly 连接，**一切查询必须按 book_id/run_id 过滤**。
4. 结论行：发版门②判定 PASS/FAIL + 挂起理由（若有）。

## 先红后绿回归测试
本卡为 docs-only 报告卡，无代码回归；报告内每项判定须附可复核数据来源（脚本 stdout 摘录或 SQL 查询结果）。

## 验收命令（以下命令均在项目根目录执行）
```bash
test -f docs/baseline/hang-2026-11-13.md && echo EXISTS
grep -c "PASS\|FAIL" docs/baseline/hang-2026-11-13.md
```

## 约束
- 只 commit 不 push：`docs: 0.1.2 挂机复跑晨检记录`，正文 verify:+Refs: DEC-2026-1113-02。
- 只读 DB 与 API；禁止重启/干预 server、worker、run；禁止改任何代码文件。
- run 尚未 done 时停手勿写（等主审通知）；超范围（新缺陷族分析）只登记现象不扩修，属 0.2 议题挂 owner。
