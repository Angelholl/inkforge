# 卡 t08：release.yml 全链流水线 + PE 回归脚本 CI 适配

以下命令均在项目根目录执行（相对路径）。规格唯一真值=`docs/plans/2026-11-23-ci-release.md` Task t08（23 步钉值表+骨架+F1-F5 含半态 runbook）+ 全局约束 G1-G12（critic 评议后终版），冲突以计划为准。前置：t07 已合入 HEAD（两脚本可跑）。

## 根因/目标

发版链上 CI（DEC-2026-1123-03 裁决②）：建 `.github/workflows/release.yml`——tag `v*.*.*`/workflow_dispatch 双模，windows-latest 单 job 90m，步骤 1-23 序位钉死（版本门→测试四连→sidecar→build-dist→**stamp（换机兑现位，禁漏）**→tauri build→PE 门→静态清点→物理验证装→artifact→仅 tag：body/action-gh-release/digest 回读/公开三验）；runner 事实按计划 G11（WebView2 未预装=F1 兜底位、D 盘存在、rustup 预装、GH bash 自带 pipefail）。PE 回归脚本加两插入块（INKFORGE_PE_EXE 覆盖 + INKFORGE_PE_ASSERT assert-only，默认行为零改动）。

## 改动文件与改法（Create 1 + Modify 1，只这两个）

1. `​.github/workflows/release.yml`——Create：骨架照计划 t08-S2 骨架块（name/on/permissions/concurrency/job runs-on windows-latest timeout-minutes: 90）；步骤表 1-23 逐步照计划钉值表写，**每个 run 步显式 `shell: bash`**（禁依赖 Windows 默认 pwsh）；步骤 6/20/21/22/23 带 `if: github.event_name == 'push'`（全文恰 5 处）；步骤 15 带 `env: { INKFORGE_PE_ASSERT: '1' }`；uses 版本照计划（checkout@v4 fetch-depth 1+fetch-tags true、pnpm/action-setup@v4、setup-node@v4 node 22 cache pnpm、Swatinem/rust-cache@v2 workspaces、upload-artifact@v4 四文件 if-no-files-found: error、softprops/action-gh-release@v2 参数照表）。
2. `apps/desktop/src-tauri/tests/pe_subsystem_regression.ps1`——Modify：计划 t08-S1 两插入块全文照抄，锚点=现 :10（baselineFile 行后）与 :42（currentLine 行后）；插入块 2 必须先于基线读写逻辑。

## 先红后绿回归（序执行）

- 红（负例）：`INKFORGE_PE_ASSERT=1 INKFORGE_PE_EXE=apps/desktop/src-tauri/resources/runtime/node.exe powershell -NoProfile -ExecutionPolicy Bypass -File apps/desktop/src-tauri/tests/pe_subsystem_regression.ps1` → 期望 `FAIL: PE assert-only Subsystem=3(console)` rc=1（node.exe 必 console，门会红实证）。
- 绿：①默认直跑 rc=0 PASS 原语义不变；②`INKFORGE_PE_ASSERT=1` 直跑 rc=0 assert-only PASS；③`python -c "import yaml,sys; yaml.safe_load(open('.github/workflows/release.yml', encoding='utf-8-sig')); print('YAML_PARSE_OK')"` 打印 YAML_PARSE_OK（G12 主审实测钉版）；④`grep -c "if: github.event_name == 'push'" .github/workflows/release.yml` == 5；⑤步骤序位与计划表逐项对照（node 版本/concurrency/timeout 90/序 11<12<13<14 硬序）。

## 验收命令（主审复核用）

```bash
grep -c "if: github.event_name == 'push'" .github/workflows/release.yml
grep -n "timeout-minutes\|runs-on\|node-version\|fetch-tags\|INKFORGE_STAMP_NSI\|INKFORGE_PE_ASSERT" .github/workflows/release.yml
git status --short   # 只许 yml 新增 + ps1 修改（t07 两脚本已在 HEAD）
python -c "import yaml,sys; yaml.safe_load(open('.github/workflows/release.yml', encoding='utf-8-sig')); print('YAML_PARSE_OK')"
```

（runner 端真实行为不归执行者——首跑调试=主模型亲执 workflow_dispatch 循环；执行者**禁为迁就假想 runner 行为擅改计划钉值**，对 runner 事实有异议写在完成通知里供主审裁。）

## 约束

- 只 Create yml + Modify ps1；禁改 t07 脚本/模板/stamp/计划/卡面；执行者只 commit 不 push。
- 提交信息照计划 t08-S3 钉死（`ci(release): release.yml 全链流水线（tag/dispatch 双模）+ PE 回归脚本 assert-only 适配`，verify: YAML_PARSE_OK；PE 三连 rc=0/0/1；diff 两文件；push 门 5 处；Refs: DEC-2026-1123-03）。
- 永不 `git add -A`、永不 `--no-verify`；yml 内 `${{ }}` 表达式保持原样勿转义；ps1 文件编码保持 UTF-8 带 BOM 原状（插入块注释为中文，若编辑后 BOM 丢失须补回——PS 5.1 无 BOM UTF-8 中文注释吞行静默失效先例 L-20261110-02）。
- 完成通知必含：五连自证输出原文、yml 步骤数与 if 门计数、ps1 diff 行段、GUI 不适用。
