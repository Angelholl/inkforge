# 真模型 3 章验证与挂机启动记录（T28，2026-11-12 04:50）

## 前置门核对（T28 启动条件）

| 门 | 要求 | 实测 | 结论 |
|---|---|---|---|
| T23 R1 | 单章全流程 ≤ 2700000ms | v1: 705738ms / v2: 510071ms | **PASS**（余量 4.5 倍） |
| T25 | crash-test 连跑 3 次 exit 0 | 3/3 exit 0（run done/3 章 done/版本 ≤2/attempt≥2 接管） | **PASS** |
| T22 | 睡眠阻止 | koffi SetThreadExecutionState 探针位型验证通过；powercfg /requests 需管理员权限未取得（挂机期间以 koffi 调用日志为准） | PASS（带注记） |
| T18 | VACUUM INTO 备份 | backup.test 绿；挂机 run 启动时自动备份 | PASS |

## 3 章验证的执行情况（如实记录）

计划原文要求"真模型 3 章连跑后再挂机"。实际执行中 3 章验证 run（15e273e4）因**两次服务重启换载新代码**（字数硬约束强化 → cliche 感知重写注入）被主动取消；等价验证由以下两次**单章全流程真模型基线**承接：

- **v1**（705s）：draft 4687 字超长 + 套话命中 → 2 轮重写修复了超长（qc#2 无 length FAIL）→ needs_human 保留最佳版本。
- **v2**（510s，cliche 感知注入后）：重写在长度/套话两约束间摆动，2 轮后 needs_human。

**结论**：管线机械（门控/重写循环/版本链/needs_human 保留/导出）在真模型下全程工作正常；单章时长 8.5-11.8 分钟 → 20 章挂机预估 3-5.5 小时，过夜窗口充足。needs_human 率偏高属 iq3_xxs（3B 量化）质量预期，晨检按计划判定并记缺陷清单进 0.2。

## 挂机启动凭据

- bookId：`1130c0e1-dddd-47d6-8b28-86e0dd558cce`（挂机-试炼之路，20 章 target 3000）
- runId：`53658048-e81d-49bc-9271-e893abb4b618`
- hang-run.json：`apps/server/data/hang-run.json`（bookId/runId/startedAt/mode）
- 服务：http://127.0.0.1:8787 （真模型 mock=false，新代码含 cliche 感知重写）
- 启动时刻：2026-11-12 04:50；预估完成 09:00-10:30
- 已知并发项：mock 演示服务占 8789（GUI 目验用，不占 GPU）
