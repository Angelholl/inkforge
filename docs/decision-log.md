# 墨炉（Inkforge）决策日志

## DEC-2026-1111-01 项目立项与技术选型定案（2026-11-11）

**背景：** 用户试用书童（Pagekin）与 MirrorNovel 均不合意，确认重新开发个人全自动小说生成流水线。经 interview-me 澄清需求（意向书见 docs/intent/novel-pipeline.md），派 decision-critic 评议（报告：docs/design/review-tech-choice-2026-11-11.md，375 行）。

**拍板（owner 确认）：**
1. 项目名：**墨炉（Inkforge）**；路径 `D:\inkforge`
2. 总体架构按评议立场定案：
   - headless 本地服务（Node 22 + TS + Fastify，REST+SSE）+ 浏览器 React 19 + Vite GUI；Electron 外壳仅后期可选
   - 单文件 SQLite(WAL) 唯一真相源；正文 TEXT + append-only chapter_versions + 结构化连续性表；FTS5 trigram
   - DB 持久化 run/step 状态机 + 独立 worker（concurrency=1）+ 租约心跳；崩溃断点续跑；残稿 salvage
   - 统一 OpenAI 兼容 client + 能力描述符 + 角色路由 + 上下文预算装配器（绝不整本送）；分隔符纯文本解析（iq3_xxs JSON 遵循不可靠）
   - 质检：L0 确定性校验 → L1 引用证据 rubric → 门控 → ≤2 轮定点重写 → needs_human
   - 风格：离线蒸馏不可变档案（量化规则 + 8-12 段样本），每章轮换 3 段；续写模式不注入，用 voice-match QC
   - 安全：run 前 VACUUM INTO 快照、导出 md、永不就地覆盖、单实例锁
   - 合规：clean-room，不抄代码/提示词/schema，建 docs/third-party-references.md 存证
3. MVP 切法：mock 单章闭环 → 真模型 3 章 + kill -9 恢复压测 → 20 章挂机 → 云端路由/GUI 完整化

**HIGH_RISK_OBJECTION 裁定：**
- R1（本地 126B 未实测速度即承诺 20 章挂机）：**采纳**。2026-11-11 已实测：ZCode 会话链路端到端 77s 产出约 1100 字正文，折算单章（4000 字 + QC/L1/重写 ≈ 3 次生成）约 15-20 分钟，20 章约 5-7 小时，**可行性确认**。遗留项：直连端点 tok/s 与 JSON 遵循率需在 Phase 2 用真实 client 复测。
- R2（无人值守下就地覆盖正文不可逆）：**采纳**，append-only + 快照入架构定案第 7 条。

**遗留信息缺口：** 本地端点 18500 的 apiKey（ZCode 会话层已托管，直连需自取）；云端 API 候选与预算上限；入口 A 样例小说。

## DEC-2026-1111-02 0.1 版范围与形态变更（2026-11-11，owner 拍板）

**拍板（owner 经问答确认，覆盖 DEC-2026-1111-01 相应条款）：**
1. **范围**：0.1 = 决策日志 MVP 全量四段（mock 单章闭环 → 真模型 3 章 + kill -9 压测 → 20 章挂机 → 云路由/GUI 完整化），今天（2026-11-11）开工，明天（2026-11-12）出 0.1 正式试用。排期风险已知悉并接受（挂机段实测折算 5-7 小时，与开发并行安排）。
2. **GUI 形态变更**：由浏览器 React GUI 改为**桌面 GUI，外壳用 Tauri**（替代原 Electron 后期可选方案）；内部仍为 React + Vite 前端，headless Fastify 服务由 Tauri 侧随壳管理。风险（Rust 工具链引入）已知悉，Task 0 须含工具链核验与回退预案。
3. **模型端点**：直连 Strata 端点（OpenAI 兼容，不经 ZCode 会话链路中转）；凭据写入项目 `.env`（不入库），base URL/模型名/apiKey 待 owner 提供，计划按 `.env` 配置驱动落笔。

**遗留信息缺口（阻塞真稿验证，不阻塞开发开工）：** Strata base URL/模型名/apiKey；入口 A 样例小说路径。

## DEC-2026-1111-03 Strata 端点核验与 client 协议修正（2026-11-11，主模型核验归档）

1. **协议修正**：Strata 端点为 **Anthropic Messages（/v1/messages）**，非 OpenAI 兼容。DEC-2026-1111-01 第 4 条"统一 OpenAI 兼容 client"修正为"统一 Anthropic Messages client"（内部抽象仍保留能力描述符/角色路由，仅传输层换协议）。2026-11-11 实测：`POST http://127.0.0.1:47831/v1/messages` + `x-api-key: strata` + `anthropic-version: 2023-06-01` 正常返回。
2. **端点参数**：base URL `http://127.0.0.1:47831/v1`；模型 `iq3_xxs`（= Qwen3.8-Flash-Next IQ3_XXS，512K 上下文，本地 GPU）；apiKey `strata`。凭据落项目 `.env`（gitignore，不入库）：`STRATA_BASE_URL` / `STRATA_API_KEY` / `STRATA_MODEL=iq3_xxs`。生成用同一模型，QC/L1 角色经角色路由可同模型降参（角色路由保留）。
3. **入口 A 样例缺口**：owner 提供的 `C:\Users\57850\Downloads\新建文件夹\` 为露骨色情文本（含性暴力题材），**主模型不可读取/蒸馏/据此生成**（内容红线，与本地/私有不相关）。风格档案卡改期：待 owner 提供非露骨样例，或用公版文学先建档案跑通链路；0.1 可按"续写模式不注入风格"先交付。流水线其余部分不受影响，按期推进。
4. **开工时点**：owner 定今晚（2026-11-11 夜）下达开工指令；此前完成计划卡产出。

## DEC-2026-1111-04 开工指令与执行模式（2026-11-11 夜，owner 拍板）

1. **开工**：owner 已下达开工指令，0.1 计划（docs/plans/2026-11-11-inkforge-0.1.md）进入执行。
2. **执行模式**：本会话任务由**主模型独自完成，不外派**（owner 明示，临时豁免 dispatch-discipline 派卡流程；验收链/提交纪律/verification-before-completion 仍有效，亲力亲为不等价于免验）。
3. 计划卡 card-plan-0.1.md 与计划产出已完成验收归档，转为执行依据。
