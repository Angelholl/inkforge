# 卡 T-C3：D1 真模型 raw replay 夹具采集与回归（M4 加固判据）

## 一、根因与夹具链

挂机 run 53658048 的 qc 原始输出未持久化（计划 F2：run_steps.output_json 只存摘要、qc 步无 partial flusher）→ 夹具降级链=**同章 draft 输入重采样**：draft 全文在 `apps/server/data/inkforge.db` 的 `chapter_versions`。对 Strata 重发修前/修后两种请求形状，把真模型 raw 输出落为夹具，钉死 D1 修复效果（DEC-2026-1113-01 路线一过门门）。

## 二、改动文件

- Create `apps/server/scripts/capture-qc-raw.mjs`
- Create `apps/server/test/quality/regression/real/l1-good-001.txt` / `002` / `003`（修后形状 raw）与 `l1-bad-001.txt` / `002` / `003`（修前形状 raw）
- Create `apps/server/test/quality/regression/qc-replay.test.ts`（+2 用例）
- server 基线 148→150（+2）。采集章号钉死 `CAPTURE_CHAPTERS = [5, 8, 12]`（挂机书 bookId `1130c0e1-dddd-47d6-8b28-86e0dd558cce`）。前置：T-C1、T-C2 已合入（good 语料必须反映修后请求形状）。

真值细则 = 计划 `docs/plans/2026-11-13-inkforge-0.1.2.md` 任务 T-C3（约 :134-148）；冲突即停报。

## 三、改法（钉死）

1. **capture-qc-raw.mjs**（计划 :140）：`--chapter <N> --out <path> [--pre]`；better-sqlite3 readonly 读 `data/inkforge.db` 取挂机书 chapter N 的 current 版本 content、blueprint JSON、target_chars → 按 l1.ts qcSlots 同构装配（hardRules=renderHardRules(targetChars)/draft/blueprint/continuity='' 四槽，budgets.qc，**system 发 assembled.system**，温度 0.2，maxOutput 8192）→ 不带 --pre：draft 槽包裹 `【待审正文开始/结束】` 且 user 尾接 renderQcTask()；`--pre`：裸 draft 无标记、user 尾不接协议（完整复现修前形状）→ `POST {STRATA_BASE_URL}/messages`（headers：`x-api-key`、`anthropic-version: 2023-06-01`）→ raw text 原样写 --out。运行钉死：`node --import tsx --env-file=../../.env scripts/capture-qc-raw.mjs ...`（cwd=apps/server）。脚本任何输出不得打印 apiKey 值。
2. **语料**：先 `--pre` 采 bad 三份（chapter 5/8/12）→ 各 >200 字节且与对应章 draft 非逐字节相等；再采 good 三份（不带 --pre）。**raw 原样入库，禁止任何编辑修剪**。

## 四、先红后绿回归测试（M4 判据）

1. 前置连通门：计划 :143 的 curl（127.0.0.1:47831/v1/messages）→ 含 `"type":"message"`；409/空 → 停报主审等模型上线（不算失败）。
2. 写 qc-replay.test.ts 两用例（先跑应绿——语料已按判据采集，红=语料不达标）：
   - `'修前真模型 raw 优雅降级'`：逐份 `parseFindings(bad)` 不抛；三份中 errors>0 的份数 ≥2。
   - `'修后真模型 raw 协议解析全过（M4 加固判据）'`：逐份 good：errors 空、overall 非 null 且 ∈1-10、每条 finding 的 quote 为对应章 draft 子串（draft 从 DB readonly 按 CAPTURE_CHAPTERS 读）；**三份合计合法 findings ≥1**。
   → `pnpm --filter @inkforge/server exec vitest run test/quality/regression/qc-replay.test.ts` 2 passed。
3. **过门判据（计划 :147，钉死）**：任一 good 不满足逐份判据或合计 findings=0 → **停，保留全部夹具现场报主审评议路线二**，不得 commit、不得自行重采超过 1 次补救。
4. 全量：server vitest 全绿 150。

## 五、验收命令（主审独立复核）

- 四、2/4 命令重跑绿；`git log -1 --stat` 仅触及二、清单文件；抽查每份 fixture 首尾 200 字节（未修剪痕迹）；`grep -cE "OVERALL|SEVERITY" real/l1-good-*.txt` 逐份 ≥1。
- 主审另核：commit 正文 verify: 含六指标（逐份 errors/overall/findings 数）。

## 六、约束

- 禁改：全部 src 文件、既有测试、package.json；`test/quality/regression/` 之外不落任何测试文件；夹具目录 `real/` 内只放 6 个 txt。
- 真模型调用共 6 次（bad3+good3），单次 maxOutput 8192——本地 GPU 线路，总时长预期 <30 分钟；卡住 >10 分钟无输出即停报。
- 只 commit 不 push；`git add` 明确新文件路径；commit：`test(server): D1 真模型 raw replay 夹具与回归`，verify: 行含连通门结果+六份判据数值+150，Refs: DEC-2026-1113-01。
- `.env` 值不得抄入任何入库文件（secret 纪律）。
