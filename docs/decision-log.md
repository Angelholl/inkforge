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

## DEC-2026-1112-01 取消项目内容题材限制（2026-11-12，owner 拍板）

**拍板（owner 明示）：** 本项目不设内容红线、不限制任何题材、不设人为审查。覆盖 DEC-2026-1111-03 第 3 条的"内容红线"表述（历史记录保留不改）。

**落实口径：**
1. 流水线各环节（蓝图/生成/质检/蒸馏/导出）对一切题材正常处理，无过滤；质检六项均为质量维度，与题材无关。
2. 风格蒸馏走 `src/style/cli.ts`，样例文本直接进本地模型，无需主模型经手——owner 可直接对任意样例执行蒸馏。
3. 主模型亲手读写环节保留极窄回避类别（未成年人性内容、将性暴力色情化的文本）；该回避不构成项目功能限制，均存在不经主模型的技术路径（见第 2 条）。

## DEC-2026-1112-02 0.1 发版走 sidecar 真安装包 + 增补设置能力（2026-11-12，owner 拍板）

**背景：** 打包验收发现安装包不含 server（main.rs 用 pnpm 拉服务，脱离 monorepo 不可运行）；decision-critic 提出 [HIGH_RISK_OBJECTION] 四阻断项（A 无设置持久化、B 生产 /api 相对路径断连、C migrations/cliches 未随包、D worker 带 tsx），其中 B/C/D 由实现计划闭环。

**拍板：**
1. 发版形态：sidecar 真安装包（esbuild bundle server.mjs/worker.mjs + 生产 node_modules + node.exe externalBin/resources），驳回 SEA 与全量打包替代案。
2. 配置能力：**增补设置 API + GUI 设置页**（owner 选项 b），配置落 `%APPDATA%\dev.inkforge.app\config.json`，server loadConfig 以文件覆盖 env；首装默认 mock 开箱即用。README"设置中配置"口径由本任务兑现。
3. 签名：不签名，发布附安装包 SHA-256 校验值（"S码核对"）。
4. 前置提交 da5a41b（favicon/README/NSIS 开启）已入库；frontendDist 路径修复（../→../../）随本决策任务入库。

**影响决策：** DEC-2026-1111-02 第 3 条（.env 配置驱动）在安装态由 config.json 取代（dev 态 .env 不变）；DEC-2026-1112-01 第 2 条蒸馏 CLI 在安装包内不可用（已知限制，发布文档注明）。

## DEC-2026-1112-03 [PROXY-DECISION] 安装目录禁 C 与默认目录策略（2026-11-12）

**背景：** owner 2026-11-12 会话指示「项目禁止安装到C盘」。原计划钉值 `<install>`=%LOCALAPPDATA%\Programs\墨炉、Task-12 `/D=C:\inkforge-smoke` 均违令；owner 未指定非 C 选择算法/校验/无合格盘行为，decision-proxy 按四门代决（门1 owner 原话；门2 主模型+A' 与 critic 有条件支持 A' 一致；门4 critic 已评议，唯一 HIGH_RISK_OBJECTION「仅 C 盘用户不可安装」已采纳为严格拒绝语义）。

**裁决：**
1. 采纳 A'：默认目录=安装包所在盘（DriveType=3 固定盘非 C）`\墨炉`，否则字母序第一个非 C 固定盘 `\墨炉`；无合规盘报错中止（非零退出），绝不回退 C。
2. 目录页可编辑；拒绝任何归一化后落在 C 的路径（大小写/junction/UNC 映射 C）；静默 `/D` 同校验。
3. 自定义 NSIS 模板实现，不依赖默认 $LOCALAPPDATA 路径；计划钉值同步修订。
4. 发布阻断门（critic 三条件）：① DriveType=3 云盘实测（本机 F: Google Drive）；② 校验矩阵（/D、目录页手输、junction/UNC、无合规盘、目标盘不可写）；③ CLI 版本锁定。任一失败回 critic 复议。
5. Q1 射程：窄口径临时执行——仅程序目录禁 C；%APPDATA% config/data、快捷方式、注册表留 C，待 owner 裁定不阻塞 0.1。
6. 产品后果：仅 C 盘机器不可安装，发布说明与 README 明示；owner 放宽须另立决策。
