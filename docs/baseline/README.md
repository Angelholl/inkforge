# R1 关口——Strata 真模型单章基线记录

## v1（2026-11-12 03:05，强约束前）

- 文件：`strata-baseline.json`（首次实测，后被 v2 覆盖，关键数值在此存档）
- **totalMs = 705738（11.8 分钟）≤ 2700000（45 分钟）→ 关口 PASS**
- tokPerSec ≈ 30 字/s（draft 步），firstTokenMs ≈ 6155
- outcome：needs_human（rounds=2）
- 失败原因：draft 4687 字（target 3000，超 56%）→ L0 length FAIL；cliche「不是…而是」命中
- 结论：**超时风险解除**；质量对策见 v2

## v2（2026-11-12 04:15，cliche 感知重写 + 字数硬约束后）

- 结果见 `strata-baseline.json` 当前内容。
- 对策：① 硬规则改为字数硬约束（2400-3600 字，超上限视为废稿）；② 重写 taskInstruction 携带字数带宽；③ L0 套话实际命中句注入重写指令（「以下套话句必须整句删除或改写…」）。
- v1 实测：重写第 1 轮即修复超长（qc#2 无 length FAIL），证明字数硬约束有效；套话由 v2 的命中句注入对策处理。

## 挂机预估

- v1 单章（含 2 轮重写）≈ 11.8 分钟 → 20 章 ≈ 4 小时；若 v2 首轮过门率高，≈ 2.5-3.5 小时。
- needs_human 章节保留最佳版本并跳过继续（skip_failures=1），晨检判定 done ≥18/20。
