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

## DEC-2026-1113-01 [PROXY-DECISION] 0.1.2 轮 D1 路线/排期/图标债务代决与发版放行挂回（2026-11-13）

**背景：** owner 无人值守轮（owner 原话「本次为无人值守，本轮任务完成后继续推进」+ 两项书面拍板：①范围=图标接线+D1/D3 收口发 0.1.2（含"真模型 3 章验证放行后发版"）；②追加=D2/D4 修复、QC 回归集+夹具库、过夜 20 章挂机复跑）。计划 `docs/plans/2026-11-13-inkforge-0.1.2.md` 经 decision-critic 评议（必改项 M1-M9，其中基线口径一条为 [HIGH_RISK_OBJECTION]，主模型全部采纳消解）后，decision-proxy 按四门对四项待决点代拍板。

**裁决内容：**
1. **D1 采纳路线一**：`renderQc`→`renderQcTask` 协议投递接线 + 解析器最小加固（围栏/全角冒号/杂质分值）+ 真模型 replay 夹具过门；过门不达标再叠路线二；路线三（切 JSON）违 DEC-2026-1111-01 第 2 条子项（分隔符纯文本协议，理由=iq3_xxs JSON 遵循不可靠，decision-log.md:13）+ config.ts:119 supportsJsonSchema=false，属架构级 owner 保留，本轮不采；路线 2.5（Anthropic tool_use）登记为 0.2 候选。闭合判据以 critic M4 修订版为准（3 份 good 语料合计 ≥1 条 quote⊆draft 合法 finding），未落地则本裁决基础失效须重入。
2. **D2 采纳执行顺序**：T-A→T-B→T-D1→T-C1→T-C2→T-C3→T-D2→T-E→T-F→T-H 三章早门→T-G 打包装机→T-H 20 章过夜→T-I 存证与 push；发版门=早门三判据加固版 + T-F 全绿 + T-G 装机目验过；20 章不达标→不发版、不撤本机、0.1.1 保持线上最新。
3. **D4 采纳 INSTALLERICON 空置推迟 0.2**：影响面仅 setup.exe/uninstall.exe 文件图标走 NSIS 默认（nsi:42/:45 空置、:147 条件生效）；ARP DisplayIcon（:5262）/桌面/开始菜单均随 exe 内嵌新图标；本轮 .nsi 禁改不变。观察项入账：nsi 模板 :37 `!define VERSION "0.1.0"` 冻结（0.1.1 构建产物 target/…/installer.nsi:37 同值）→ 0.1.2 安装包 ARP DisplayVersion 将显示 0.1.0，记入发版已知债务，T-G 记录实测值不阻断。
4. **D3 拒裁挂回 owner** [OUT-OF-SCOPE]+[MATERIAL_CONFLICT]：owner「发 0.1.2」是否覆盖 git tag + GitHub Release 上载存在歧义，且与计划 T-I 原有"打 tag 前 owner 放行"前置门自相矛盾、缺 critic/planner 表态。临时推进：commit/push/发版存证照走，tag 与 `gh release create` 挂起，安装包留本机。

**一致推荐名单：** D1=planner（推荐路线一）+critic（有条件支持，M4 已闭环）+主模型；D2=三方一致；D4=planner（本轮不动）+critic（影响面核实无异议）+主模型；D3 仅主模型单方认定，无一致性。

**风险与驳回回滚清单：** owner 驳回 D1→revert T-C1/T-C2 提交（夹具可留），成本 1 次 revert；驳回 D2→剩余卡重排，已提交不回滚；驳回 D4→补两行 define+重打包≈1 次 tauri build；tag/Release 未创建，全程无不可逆。

**owner 驳回/放行方式：** 任何后续表态即覆盖本裁决触发复议。D3 需 owner 逐字回答四问：①早门+T-F+T-G 通过后是否授权创建 tag v0.1.2 并 gh release 上载安装包；②或 Release 页只挂 notes+S码不上载安装包；③20 章复跑不达标时 Release 是否同样不发、只交晨检报告；④是否授权按①答复改写计划 T-I 前置门行。

## DEC-2026-1113-02 [OWNER] 新发版阻塞项：安装版纯 GUI（无 CMD 框）+ D3 部分答复（2026-11-13 10:50 前后）

**背景：** owner 上线后对 D3 四问当面答复，并新增一项发版阻塞需求；同时确认桌面快捷方式即全新安装的实机 0.1.2（图标显示层问题定性不受影响）。

**裁决内容（owner 亲决，覆盖 DEC-2026-1113-01/D3 挂起状态）：**
1. **新阻塞项**：owner 实测安装版启动带 CMD 控制台框，要求打包版本为纯桌面 GUI。主审已定位根因（`apps/desktop/src-tauri/src/main.rs` 无 `windows_subsystem` 属性，release 为 console 子系统），裁卡 `docs/design/2026-11-13-card-cmdfix.md` 修复+重打包+PE 子系统回归脚本（红→绿）。**修复合入并重装冒烟通过前，tag/Release 一律不做**——本项优先级高于 T-H 20 章段结论。
2. **四问③答复=同样不发版**：20 章晨检不达标（done<18/20、failed 未恢复、needs_human>2 任一）→ 维持 DEC-2026-1113-01/D2 口径，0.1.1 线上最新，tag/Release 均不做。
3. **四问④答复=授权改写**：计划 T-I 前置门行按本轮答复改写（新增纯 GUI 阻塞门 + 不达标不发门）。
4. **四问①②未决**（owner 以阻塞项替代作答）：待 CMD 修复合入+20 章晨检达标后再次呈请 owner 表态 tag/Release 形态。
5. **图标显示层降级存证**：exe 内嵌新图标三重程序化证据（ExtractAssociatedIcon 取出新设计/lnk→exe 链/早期 8/8 目验），本机 shell 缓存三连刷新（删缓存+重启 explorer/ie4uinit/lnk touch）均未生效，按交接既定口径走降级存证入发版文档，实机目验挂 owner。

**回滚：** 卡 cmdfix 为 1 行属性+1 回归脚本，revert 成本≈1 次构建；tag/Release 仍未创建，无不可逆操作。

## DEC-2026-1113-03 [OWNER] 0.2 立项：全量六项、与 0.1.2 收口混跑（2026-11-13）

**裁决内容（owner 亲决）：**
1. 0.2 纳入全部六项：入口 A、风格蒸馏、GUI 页面、DB 迁移、D4 残留模板系收敛、INSTALLERICON/ARP 版本债务（含 replay 语料扩充、recovery flake 修复）。
2. 节奏=直接混跑：0.2 代码卡即时开工落盘，与 0.1.2 存证 commit 同批 push，不等 T-I。
3. 约束沿用：同工作树 ≤1 卡串行（晨检卡到来时 0.2 卡须已收口或排队）；挂机 run 期间禁重启 server/worker；0.1.2 发版门与 tag/Release 挂起条款不受影响。

**流程：** code-planner 出计划草案 → decision-critic 评议 → owner 拍板 → 按计划拆卡。

## DEC-2026-1113-04 [OWNER] 架构选型裁决：留栈+折中吸收 SubTrans，换栈设触发门（2026-11-13）

**背景：** owner 提议整体切换 Python+WebView2+CLI（借鉴 I:\SubTrans）。两份 code-reader 调研（docs/design/research-0.2-subtrans-reference.md / research-0.2-port-surface.md）+ decision-critic 评议（[HIGH_RISK_OBJECTION]：移植实测 140-240 人时、9,764 行 NSIS 禁C 语义重做、测试 oracle 双变量缺陷、跨语言 DTO 长期税、GUI 收益≈0）后，owner 采纳「留栈+折中」并令 0.2 草案入库执行。

**裁决内容：**
1. **留栈**：Tauri+Fastify+TS 维持，0.2 十四卡草案（docs/plans/2026-11-13-inkforge-0.2-draft.md）入库执行；critic 0.2 评议必改项消解后拆卡。
2. **折中吸收（不换语言）**：M2=新增 CLI 卡（apps/server CLI 入口 cli.mjs+.cmd 启动器，复用 staged node.exe，顺手闭合 DEC-2026-1112-02 安装包无 CLI 限制）；M3=UI token/三栏独立卡组（SubTrans style.css token → Tailwind @theme 映射表+单页试点先行，禁止与栈变更捆绑）；M4=若 owner 要 Python 手感，tools/ 薄客户端（httpx 打 REST）另议另立。
3. **M7 架构红线**：独立 worker 子进程+DB 租约不得降级为进程内 asyncio（DEC-2026-1111-01 第 3 条前提）。
4. **换栈触发门（M5，此后按门不按感觉重议）**：满足其一才重启评估——①0.2.0 发版后连续 2 周日常使用无 P1；②出现 Python 独有能力需求（具体用例）；③Node 原生依赖维护实测 >2h/月 连续 3 个月；④owner 实测无法独立维护 TS（连续 3 次缺陷修复需外部介入）。评估形式=≤3 天单纵切 spike（DB+迁移+蒸馏 CLI+L0 双跑 diff）出实测工时报告。
5. 0.1.2 发版门与 DEC-2026-1113-02 三门前置不受影响；20 章挂机照跑。

**驳回回滚：** owner 日后按触发门重启换栈→spike 数据在案，成本≈3 天；本裁决无不可逆操作。

## DEC-2026-1113-05 [OWNER/主模型] 0.2 计划 v1 评议回应与 v2 修订令（2026-11-13）

**背景：** 0.2 草案 v1 经 decision-critic 评议=有条件通过，[HIGH_RISK_OBJECTION]×2（HR-1 发版物证保护、HR-2 D4 收敛逻辑与 F5 实证冲突）+M1-M15。

**裁决：**
1. HR-1/HR-2 均**采纳**（主模型回应，无 [PRESSURE-OVERRIDE]）。HR-1 即时动作已执行：0.1.2 新候选（CMD 修复后重建）S码=6e3dfd4b4c64358cc6569688b47e0e5fcf152344fce7420dfcc4867957f0af9d，副本 data/artifacts/0.1.2-rc-6e3dfd4b.exe（gitignore），旧交接文档 S码 88308e14… 作废。
2. owner 拍板：v0.1.2 tag **仅作里程碑标记**（不承诺从 tag 复现安装包，物证以 S码+副本为准，M2 按此落）。
3. owner 拍板：入口 A 导入章**加「可选摘要」卡**（手动触发单章 summarize，非自动）。
4. 原 planner 修订草案为 v2：M1-M15 全落 + CLI 卡/UI token 试点卡占位（DEC-2026-1113-04 M2/M3）+ 测试增量链重算。v2 出来后主审复核必改项覆盖再呈 owner 终审拆卡。

## DEC-2026-1113-06 [OWNER] push 节奏：任务结束后统一 push（2026-11-13）

晨检门② FAIL（1 done+19 needs_human）后 owner 拍板：不发版、tag/Release 均不做；本地 commit 照常累积，**全部任务结束后一次性统一 push**（push 前仍走 code-review+提交三查，push 后 ls-remote 复核）。T-I 发版存证相应降级为「不发版说明+已知债务与晨检引用」随收口批提交。

## DEC-2026-1113-07 [OWNER] 本会话执行模式与目标指令：不外派、立项功能全落地（2026-11-13）

**裁决内容（owner 本会话明示）：**
1. **执行模式**：本会话任务由主模型独自完成，不外派（同 DEC-2026-1111-04 第 2 条口径，豁免 dispatch-discipline 派卡流程）；验收链/提交纪律/verification-before-completion 仍有效。
2. **目标指令**：项目继续推进，**直到项目立项时的功能全部落地实现**（docs/intent/novel-pipeline.md 全项）。据此：0.2 计划收尾（T05/T15 + N-CLI 视窗口）照走；web 四 TAB 壳计划（docs/plans/2026-11-13-web-four-tab-shell.md）执行；**入口 B 生成模式（预设世界观/角色卡 → 蓝图 → 全新生成）纳入本期实现**——覆盖四 TAB 计划第二节待确认项 1 的「本期只交付占位」，T-02 占位页照计划落地后由入口 B 计划升级为真实向导。
3. **事实锚定**：实测基线 shared 2 / web 14 / server 173 = 189 全绿（lint/typecheck 同绿）；生产库 user_version=3（0.2-T02b 实迁已完成）；挂机 run `1dd814ed` 终态 done（M4 worker 落盘守卫解除）；Strata 端点 HTTP:000 离线 → 0.2-T05 replay 语料卡挂起待窗口（浮动卡属性，不阻塞功能交付）。
4. **T14 装机态动作维持待 owner 表态**：卸芽+回装 0.1.2 物证（incident-0.2-t14-arp-hijack.md 待决项）未经 owner 不执行；本指令不构成对该项的授权。

## DEC-2026-1114-01 [主模型] 入口 B 生成模式方案定案与四 TAB 壳收口（2026-11-14）

**背景：** owner 指令（DEC-2026-1113-07）下四 TAB 壳 T-01..T-07 全部完成收口（验证链全绿 194、GUI 黑盒 7 项过、commit 至 07b46db）；入口 B 为立项功能最后一项缺口，按指令授权实施，方案由主模型自定并归档（不外派模式，无 critic 评议轮）。

**裁决内容：**
1. **方案按 docs/plans/2026-11-14-entry-b-generate-mode.md 执行**：全书蓝图 = 行协议分块（`# 章号` + 块内 GOAL/BEATS/HOOK），一次 planner 调用产出；禁 JSON（DEC-2026-1111-01 第 2 条）；世界观直存 books.description 零迁移；绑定 UI 延续四 TAB D5 留书详情；生成复用 generate 管线。
2. **mock 态 outline-suggest 必然 502**（mock summarize 文样非蓝图协议，0.2 R7 同源）：GUI 验收以「502 显性暴露 + 手填兜底可用」为准；真模型验证并入 Strata 在线窗口。
3. **测试账本**：194 → 200（server +5、web +1），每 commit 点只增不减。
4. **版本冻结 0.1.2 不变**（入口 B 属 0.2 功能补全轮范围）。

**回滚：** 全部为新增文件/新增 key/页面重写，revert 三 commit 即净回退，无数据迁移无不可逆。

## DEC-2026-1114-02 [OWNER/主模型] Strata 唤醒口径修正与真模型门一开跑（2026-11-14）

**owner 指正：** Strata 可直接加载唤醒，不存在"离线"——此前 HTTP:000 系首请求含模型加载（实测首请求 84.9s），20s 探针超时被误判为离线。挂起清单第 1 项（T05）与真模型冒烟的环境前提就此解除。

**事实登记（真模型冒烟全 PASS，副本实例 8790 / data/smoke-1114 / mock=false）：**
1. 入口 B outline-suggest（chapterCount=3）→ HTTP 200 / 25.1s，三章蓝图语义连贯贴题，行协议解析零 error（iq3_xxs 对 GOAL/BEATS/HOOK 遵循良好，R2 风险降级）。
2. 入口 A blueprint-suggest（chapterNo=4，前接 3 章 original 文）→ HTTP 200 / 13.1s，蓝图衔接前文场景。
3. 冒烟实例已清理；挂机复跑已启动：bookId 7445327d（挂机-试炼之路）→ runId **0423945b**（20 章 generate，8787 生产服务 worker），首章已推进至 qc 步。晨检与 T05 语料采集（chapters 1/16/20）候 run 终态执行。
4. 纪律生效中：挂机期间禁重启 8787/worker；桌面应用勿开启（抢 8787 端口）。

## DEC-2026-1114-03 [主模型] 世界观/人物卡/剧情大纲功能扩展方案定案（2026-11-14）

**背景：** owner 指令「添加世界观、人物卡、剧情大纲等功能」；本会话延续不外派模式，方案主模型自定归档（同 DEC-2026-1114-01 先例，无 critic 评议轮）。

**裁决内容：**
1. **方案按 docs/plans/2026-11-14-worldview-characters-outline.md 执行**：人物卡复用既有 characters 表（UNIQUE(book_id,name)+character_states 联动，createBook 已收 characters 入参）零新表；剧情大纲=books.outline 新列（migration 0004，user_version 3→4）；世界观维持 books.description 直存。注入面=draft 新增可选 stable characters 槽（worldview 之后）+ outline-suggest 新增 characters/outline 两槽；rewrite/blueprint-suggest 本轮不动（范围控制）。伏笔手动 CRUD 为「等功能」候选，明确不在本轮。
2. **测试账本 200→211**（server +9、web +2），每 commit 点只增不减。
3. **GUI 黑盒沿用 8789+临时 data 隔离**；8787 生产态零触碰（0423945b 已终态 done，挂机纪律解除）。

## DEC-2026-1114-04 [OWNER] 装机四答：卸两装一/英文名 inkforge/升 0.2.0/暂不登录（2026-11-14）

**背景：** owner 确认桌面安装版过时（两安装位 web 资源均为 11-12 旧构建）并亲答四问（AskUserQuestion 直答）。

**裁决内容（owner 亲决）：**
1. **桌面版**：两个旧安装（D:\墨炉、D:\墨炉0.2芽）**都卸载，只安装一个新的**；**安装后名称改英文 inkforge**（与项目一致）→ 覆盖 incident-0.2-t14-arp-hijack 原「卸芽+回装 0.1.2 物证」待决项（物证副本 0.1.2-rc-6e3dfd4b.exe 与 S 码存档不动）。
2. **芽目录**：卸载（清被劫持的共享 ARP 键）。
3. **版本号**：**升 0.2.0**（tauri.conf version 0.1.2→0.2.0，覆盖 DEC-2026-1114-01 冻结口径；tag/Release 仍不发，DEC-2026-1113-01/02 发版门维持）。
4. **登录模块**：**暂不需要**（维持本地物理隔离；owner 提出的 GUI 登录诉求以此口径了结，功能开发聚焦世界观/人物卡/剧情大纲）。
5. **productName 墨炉→inkforge** 随 T13 stamp 链生效（UNINSTKEY=inkforge 独立，根除 ARP 键冲突根因；窗口标题暂不动）。

**回滚：** 卸载/重装为装机态动作，安装包可随时重建；代码侧为新增文件/新增键/页面重写，revert 可净回退，无数据迁移不可逆项（生产库 0004 迁移幂等顺序推进）。

## DEC-2026-1114-05 [主模型] WCO 功能收口 + 0.2.0 装机落地 + NSIS 模板快照根因（2026-11-14/15）

**事实登记（验证链）：**
1. 功能全绿：shared 2 / web 22 / server 187 = **211**（账本 200→211 精确命中）；lint/typecheck/build 全绿；GUI 黑盒目验全 PASS（docs/baseline/gui-verification-0.2-wco.md），目验抓出真 bug `deleteCharacter` 空 body 400（Fastify FST_ERR_CTP_EMPTY_JSON_BODY）并修复复验。
2. code-review 两轴（不外派模式，主模型亲审，基准 origin/master=81820f0，41 文件 +1088/-45）：Standards——无硬违规； judgement 项 3 条登记为已知小额债务：①POST/PUT 人物卡重名并发窗口可 500（UNIQUE 兜底，单机低险）；②renderCharacterCards 与 settingPreview 跨端扁平化逻辑重复（可上收 shared）；③settingRawText 命名与其「展平预览」语义略偏。Spec——计划全项交付，无 scope creep（装机三答为 owner 亲决新增）。
3. **0.2.0 装机落地（owner 四答 DEC-2026-1114-04 执行）**：两旧安装卸载（预检无用户数据）→ 新装 D:\inkforge → ARP 键 inkforge/0.2.0 → 冒烟全 PASS（health 0.2.0、旧库 user_version 2→4 自动迁移、outline 字段在场）。物证 SHA256=8c0231f7…（docs/release/0.2.0-local-build.md）。
4. **NSIS 模板快照根因（incident-0.2-t14 F6 闭环）**：自定义模板=整份生成的安装脚本快照，资源 File 清单与 defines 均为字面量，tauri 不重生成——新增迁移文件须手工补 File/Delete 两段；本次模板直改 defines（inkforge/0.2.0）+ 补 0003/0004 装卸行。教训入 docs/release/0.2.0-local-build.md 台账候选。
5. tag/Release 仍不发（0.2 发布门未过）；0.1.2-rc 物证（S码 6e3dfd4b）不受影响。

**回滚：** 模板/ conf 变更 revert 即净回退；装机态可随时以物证安装包重装。

## DEC-2026-1115-01 [OWNER 指令/主模型] 删书模块交付 + 蒸馏与 UI 两讨论稿入库（2026-11-15）

**背景：** owner 三点指令：①无删书模块；②蒸馏模组太简单，借鉴之前讨论过的项目（= SubTrans，DEC-2026-1113-04 源码级参考先例）；③UI 古旧，参考 SubTrans 设计语言并讨论。执行模式延续不外派（同 DEC-2026-1113-07 口径），除讨论外全部主模型亲做。

**事实登记（删书模块，已交付）：**
1. server：`DELETE /api/books/:bookId`（books.ts deleteBook 事务按依赖序清空 11 表——外键无级联；活动 run 409 拒删）+ web 书架两步确认删除；回归账本 211→215（server +3 / web +1），lint/typecheck 全绿。
2. 验证链抓出**遗留失败一例**：app.test.ts health 断言 0.1.2（a9d556e 版本升漏改），已修复（792af17）。
3. GUI 黑盒目验全 PASS（8789 隔离四件套 + puppeteer 真操作，零 console 错误）：docs/baseline/gui-verification-0.2-booksdel.md。首跑目验脚本定位器缺陷（多行书架全局首个匹配误命中他行）修正后重跑，应用侧零缺陷；已顺带反向佐证删除流程完整可用。
4. 环境事故：8789 被上会话遗留 0.1.2 实例（11-14 WCO 目验残留）以幻象监听占用，终止后重起；隔离清理须含 index.ts 自动拉起的 worker 子进程（M7 架构红线行为符合预期）。
5. 登记小额债务：删前存在性检查与 409 检查均非原子（单机单 worker 低险）；backups/ 快照不随删书清除（append-only 保留，可恢复性设计）。

**讨论开启（两稿入库，待 owner 拍板）：**
1. 蒸馏改进：docs/design/2026-11-15-discuss-distill-upgrade.md（借鉴 SubTrans 设置模式四批次：模板可编辑/自评接线补 F2/术语表/批量校对）。
2. UI 改造：docs/design/2026-11-15-discuss-ui-subtrans-style.md（平移 SubTrans 设计语言，承接 DEC-2026-1113-04 M3 未执行卡组；T-U1 token+rail 壳+书架试点先行）。

## DEC-2026-1115-02 [OWNER 指令/主模型] 立项 GitHub 项目公开文档二次实读：蒸馏稿增补 + 全流程对标稿入库（2026-11-15）

**背景：** owner 补充指令：①蒸馏功能还可参考立项时讨论过的 GitHub 项目；②写书/续写全流程也参考之。指即书童 Pagekin 与 MirrorNovel（DEC-2026-1111-01 clean-room 参考对）。

**事实登记：**
1. **clean-room 维持**：本轮 WebFetch 仅读两仓库公开 README（产品行为层），未触源码/提示词/schema/UI 文案；参考记录已追加 third-party-references.md（2026-11-15 行 ×2）。
2. **蒸馏稿增补**（2026-11-15-discuss-distill-upgrade.md）：并入 MirrorNovel 蒸馏设计（均匀 ≤20 段采样覆盖首/中/尾、七维档案、风格六轴、persona 快照、产物预览编辑确认门、注入 3×240 字）与 Pagekin 拆解仿写（结构+文风+蓝图反推→仿写约束）；**采样层整体缺席被定性为"太简单"的技术根因**（当前实现粘贴全文一次投喂）；批次重排为：一=采样+结构化档案+确认门、二=模板/参数+自评补 F2+抄用检测、三=persona 快照+版本视图、四=术语表+三阶段批量校对；拆解仿写列 0.3 候选。
3. **全流程对标稿入库**（2026-11-15-discuss-full-pipeline-benchmark.md）：逐阶段对照结论——inkforge 运行时骨架强于两家参照，差距集中四块：蓝图层级（单层 vs MirrorNovel 三级滚动卡）、人机协作层（全自动 vs Pagekin 审稿勾选/修稿差异确认）、设定维度（无题材标签）、连续性 UI（表在而无界面）；可平移项九件按投入产出排序，分四流程批次；明确不平移清单（MongoDB 形态/知识库向量检索/Skill 包机制）。

**待 owner 拍板：** 蒸馏批次范围与确认门取舍；产品路线（全自动为主 vs 人机协作为主）；三级蓝图是否立项；流程批次一小件先行与否；.epub 依赖；lucide-react 与 UI 范围（承接 1115-01 讨论问项）。

## DEC-2026-1115-03 [OWNER 授权/主模型代拍板→已驳回] UI/蒸馏/全流程讨论定案（2026-11-15）

> **[2026-11-15 owner 驳回]** owner 明示「待拍板事项先由我做决策再继续」——本条『主模型代拍板』授权被收回，下方全部 13 项裁决**恢复待 owner 拍板状态，不作为执行依据**；正文仅作代拍板草案存档，供 owner 逐项参考表态。计划文档 docs/plans/2026-11-15-decided-batches.md 同步降级为技术底稿（T-D1..U1 技术设计仍为候选方案，范围以 owner 拍板为准）。实施未动工（无代码改动）。

**背景：** owner 对 1115-01/02 两稿的全部待决项明示「进行拍板」——原解读为主模型亲持定案授权（不外派模式，无 critic 轮，同 DEC-2026-1114-01/03 先例）；owner 随即收回，本条降级存档。

**裁决内容：**

*UI（承接 1115-01 四问）：*
1. 范围=T-U1 试点先行（token @theme 映射 + rail 壳 + 书架页升级），目验后 owner 看实效果再定 T-U2/U3——M3 红线"单页先行"依归；
2. 引入 lucide-react（tree-shakable，与 SubTrans Lucide 同源风格）；
3. 双主题本轮不做（2026-11-12 黑底黑字缺陷后钉浅色为教训产物；T-U4 另立项）；
4. rail 品牌块「墨炉 inkforge」双行（窗口标题不动，DEC-2026-1114-04）。

*蒸馏（承接 1115-02 五问）：*
5. 范围=批次一+二（采样器+结构化档案+确认门；模板落库+高级参数+自评补 F2+抄用检测），批次三/四顺延；
6. 档案维度=七维字段+风格六轴全量，行协议分隔符格式（禁 JSON，DEC-2026-1111-01 第 2 条红线）；
7. **确认门采纳**：蒸馏→预览编辑→确认入库三步（MirrorNovel 式）——不可变档案入库后不改，入库前是唯一低成本修正点；HTTP distill 改为纯分析不入库（draft 返回前端），显式 create 才入库；CLI 保持 analyze+save 直通；
8. 抄用检测（与样本连续 15 字重合 L0 finding）随批次二落地；
9. Pagekin 拆解仿写登记 0.3 候选。

*全流程（承接 1115-02 四问）：*
10. **产品路线维持全自动挂机为主+人工介入可选**——立项核心需求即无人值守 20 章（DEC-2026-1111-01），运行时骨架是最强资产；Pagekin 式人审作为可选层叠加，不推翻主路线；
11. 三级蓝图/滚动执行卡登记 0.3 候选，本轮不立项（协议改造+迁移+GUI 全链，应在 0.2 发版门过后凭使用反馈立项）；
12. 流程批次一三小件先行开工：段落级四操作（续写/润色/扩写/改对话，纯 web 预设复用 rewrite 管线）、伏笔手动 CRUD（表已在，补 API+详情页 UI）、导出格式扩展（分章 md/TXT）；
13. .epub 本轮不做（依赖引入待议），.md/.txt 导入维持现状。

**实施顺序：** 蒸馏批次一 → 蒸馏批次二 → 流程批次一 → UI T-U1（壳层改动放最后统一目验，避免中途改壳重复目验）。计划：docs/plans/2026-11-15-decided-batches.md。

**回滚：** 每块独立 commit 净回退；无不可逆项（无新迁移——蒸馏结构化档案复用 rules_json 字段，零 DDL）。

## DEC-2026-1115-04 [OWNER 亲决] UI/蒸馏/全流程 13 项终审拍板（2026-11-15）

**背景：** owner 对 1115-01/02 待决项以选项形式亲决（AskUserQuestion 四轮逐项直答），覆盖 DEC-2026-1115-03 被驳回草案。**本条为现行有效裁决。**

**裁决内容（owner 亲决，★=与主模型推荐不同）：**

*UI：*
1. 范围=**T-U1+U2+U3 三卡一次排期**★（token+rail+书架 / 详情 aside+控制台+chip 条 / 全页扫尾；非单卡试点）
2. 图标=引入 lucide-react
3. 双主题=本轮不做（T-U4 另立项）
4. rail 品牌块=**仅「inkforge」**★（非双行）

*蒸馏：*
5. 范围=**全四批**★（一：分析输入升级+七维六轴档案+确认门；二：模板落库+参数+自评补 QC 链+抄用检测接线；三：persona 快照+版本视图；四：术语表+三阶段批量校对）
6. 档案维度=七维+六轴全量
7. 确认门=要（蒸馏→预览编辑→确认入库）
8. 抄用检测=接线启用（l0 plagiarism_ngram 已在，补 generate 模式 referenceTexts 传参）

*全流程：*
9. Pagekin 拆解仿写=**纳入本轮**★（结构拆解+文风提取+蓝图反推→仿写约束档案，绑定书注入 planner）
10. 产品路线=全自动挂机为主+人工介入可选
11. 三级蓝图/滚动执行卡=**本轮立项**★（MirrorNovel 式卷→阶段→滚动卡，动 planner 协议+迁移+GUI 全链）
12. 流程批次一三小件=先行开工（段落四操作/伏笔 CRUD/导出格式）
13. .epub=不做

**实施顺序（owner 选定「协议先行」）：** ①协议双件（三级蓝图+拆解仿写，数据模型/协议先行）→ ②蒸馏四批 → ③三小件 → ④UI 三卡收尾统一目验。

**风险登记（主模型注）：** 三级蓝图与拆解仿写均为 schema+协议级改造（migration 0005/0006、runs.mode 扩展需表重建、planner 行协议扩展）；本会话不外派无 critic 轮，设计风险由主模型亲担并在计划文档钉死关键决策；owner 可随时按决策日志驳回。

**计划：** docs/plans/2026-11-15-decided-batches.md 按 04 修订为 v2（全范围+四阶段序）。

## DEC-2026-1115-05 [OWNER] push 放行 + 发版形态①②拍板 + lessons 补登记令（2026-11-15）

**背景：** 计划 v2 四阶段收口后进度盘点，owner 对三项待决以 AskUserQuestion 直答。

**裁决内容（owner 亲决）：**

1. **push 放行**：本地领先 origin/master 的 11 个提交（901dd2c..af7576e）当场推送（91cdd8d..af7576e，ls-remote 复核一致；DEC-2026-1113-06「任务结束后统一 push」口径执行，push 前远程核对无分叉）。
2. **发版形态四问①②就此了结：tag+Release 上载安装包**（★非「仅 notes+S 码」）——GitHub Release 正文附安装包上载、tag 指向发布提交。0.2 发布门（20 章晨检等）未达标前不实际发出，本轮只定形态；达标后按此形态呈请执行，发版门精神延续。
3. **lessons 补登记令**：上轮完成通知披露但未走 config-write 协议的四条教训当场补登记——L-20261115-01..04（GUI 目验前时机，轻量入清单：无状态 stub/幽灵实例甄别/stub 兜底 Array.isArray 防御/stable 槽进 system）；顺带修复上轮悬挂双射三笔（L-20261110-01/L-20261114-01/L-20261114-02 补 ✓ 状态行，UN 8→5）。

**执行留痕：** 打点 C-20261115-1518 在先；一体命令 HARD=0 BACKUP-BASELINE-REFRESHED（锚点 20261115-1523 lines=134）+只读检查复跑 HARD=0；memory release012-owner-gates 同步刷新。登记口径勘正（code-reader 勘探实证）：「stable 槽」=hardRules/worldview/characters/styleRules 四固定槽进 system（fewShot/renderStyleBlock 属 volatile 走 user）；「Array.isArray」=web 侧 React Query fetch stub 兜底防御（非 server 解析层）。

## DEC-2026-1116-01 [OWNER] 四反馈方案裁决——critic 四异议采纳 + owner 四问答复（2026-11-16）

**背景：** owner 四条反馈（按钮不统一无底框/蒸馏效果太差/多版本无法删除/评分不知是否合意不知在哪调参）→ R1/R2 只读调研卡实证：①ui.tsx 无 Button 组件、全站 65 处裸按钮、16 处无边框无底色；②七维六轴产出落库但从未进生成上下文（chapter.ts 只取 rulesText/terms、fewShot 首参空串）、full 整章重写不传风格槽、六轴不参与 QC；③chapter_versions/style_profiles API+UI 均无删除通路，版本列表 SELECT * 连全文读；④阈值全硬编码（scoreThreshold 8.0 等），全 UI 唯一分数露点=版本 chip overall，无锚点无解释。→ 草案 33395f9 → decision-critic 四条 [HIGH_RISK_OBJECTION]+targetChars [MATERIAL_CONFLICT]，关键断言主审复核成立（线性父子链致叶子规则删不动/run 前快照不含本 run 版本/resume 用 getVersion!/runs.book_id NOT NULL/config.quality.targetChars 无消费方）。

**主模型裁定（异议回应，全部采纳）：** D1 删除机制重定（见 owner①）；风格档案删除语义=有绑定拒绝；⑨多选绑定移出本批另立 0.3 设计稿（合并语义/快照结构/drift 基准三题先决）；④蒸馏后台化改独立 distill_jobs 表+轮询（不塞 runs 状态机、不堵 worker 并发=1 生成）；targetChars 全局旋钮取消（settings 只留 scoreThreshold，maxRounds 去开跑入口 ≤3，OVERALL 锚点与阈值校准同批=D3）；批一修正=独立 styleDims 槽（预算 600 字，8k 档=0 注明）+六轴渲染语义句不裸注数字+targeted 重写也补 styleRules 精简槽+fewShot 空规则头一行修随批一；效果验收门=确定性装配测试+owner 盲评（qc-replay 语料只验解析不作效果门）；⑥档案删除去重归 D1；⑤重蒸前置 style_sources 原文留存。

**owner 亲决（AskUserQuestion 四问）：** ①章节版本=**硬删+删前快照+墓碑**（事务：backupBook 快照独立命名 `-predelete-` 保留 3 → 墓碑表（不存 content）→ 子版本 parent 置 NULL → 删行；拦截 current + queued/running/paused 的 output_version_id 引用；DTO 补 currentVersionId、Reader 回退、DiffPage 配对、报表墓碑显示同卡）；②风格档案=**有绑定拒绝删**（409+绑定书列表）；③按钮归一=**立即先行**（代价登记：后续功能卡对已替换页面 GUI 复验）；④文风示例=**全局默认关+逐书开关**（books.style_fewshot_on DEFAULT 0，存量绑定书一并关，owner 接受存量输出变化）。主模型随案钉设计细节一条（owner 可驳回）：④开关仅控注入，抄用检测 referenceTexts 恒取绑定样本，硬检查不随开关关闭。缓议默认通过：⑨设计稿+批三（.epub/persona 模板/仿写预览可编辑）→0.3；B1 盲评门。

**执行留痕：** 调研卡 1ba858c；R1 报告 fc27044；R2 报告 c62230a；Button 规范 fed8d00（SubTrans 四变体+65 处映射表实证）；计划草案 33395f9（已标取代）；计划 v2 31456fe+终拍板段与本日志同提交。计划真值=docs/plans/2026-11-16-four-feedbacks.md（code-planner 产出，writing-plans 粒度，owner 审后按 dispatch-discipline 派卡）。

## DEC-2026-1116-02 [OWNER] 四反馈执行轮收口——测试分工改口径、free 链兜底亲执与规格勘正集（2026-11-16）

**owner 新口径（执行中亲述，原话）：** 「项目不生成盲评材料进行测试，所有的测试都由我做真实测试，你只要做跑通测试即可。」

**释义与落地（修订 DEC-2026-1116-01 的效果验收门）：** agent ①不再生成盲评材料（已备的 v1/v2 材料仅在 temp 存档，不再生产、不作验收门）；②不再做自动化 GUI 黑盒目验（puppeteer 隔离栈/截图全停）；③每卡仍跑完整验证链硬序（typecheck→lint→定向→全仓→真服务冒烟→安全比基线，基线只增不减）；④提交信息 GUI 行统一写「未验证（owner 真实测试）」；⑤GUI/效果类验收权归 owner 本人。已入项目记忆 owner-real-testing-division。

**执行账：** Task0–Task11A 全部落卡收口。提交链：T9B=af4388f、T10A=21b70c6、T10B=54f996f、T11A=65b0f85（卡面 d40a634/d3ac9d7/27ccef0/57ab700）；测试基线 296→319→324→329→333→338 只增不减；真服务冒烟均含跨进程持久/重启置 failed 等关键项；生产库与 backups/ 全程零接触（mtime 12:51 未变）。free 链 19 连 CHAIN_EXHAUSTED（14:00–18:41，三模型全 RATE_LIMIT，每轮候满 5 分钟未双轮转）：T9B/T10A/T11A 主审兜底亲执；T10B 执行者限流前半交付（client/shared/StyleBindSelect 三处与卡面逐字一致，主审核对采纳后续做）。未完成：Task11B（web 轮询 UI）——新会话按开工提示词执行。

**规格勘正集（执行中钉死，owner 可驳回）：** ①蒸馏 job result 附 `sourceText`（shared DistillStyleDraftDto 可选字段）——重蒸草稿须有整篇原文才能走「确认入库」，否则重蒸闭环断半路；入库侧 `ON CONFLICT(source_hash) DO NOTHING` 保证同 hash 只留一份原文。②DELETE 档案 409 文案改中文「该风格档案已被书绑定，请先解绑再删除」（仓库 409 文案惯例，计划原钉 'profile bound'）。③档案删除/绑定反查走路由内联 SQL（`styles.ts` 不存在，仓库档案投影本就内联于 routes.ts）。④每页一枚「质量轮数」select 统管本页全部生成入口（BookDetailPage 三处、NewBookPage 一处），UI 上限 3 轮。⑤迁移卡面模板固 §1.1 段：user_version 硬编码 7 处+旧库回滚块 DROP（0008 两表，style_sources 带 UNIQUE）。⑥全文 Qc 明细面板按轮 gate/l1 findings/L0 未过项渲染；质检明细仅新 run 版本携带。

**执行留痕：** 打点 C-20261116-2352/2353 在先（LEDGER 追加 L-20261116-02..06 + R-none）；本条目与 65b0f85（T11A）后单独 docs 提交归档；push 未做——本地 ahead origin 约 37 提交，push 前须 code-review（≥3 文件/≥100 行规则）+ owner 点头（沿「任务结束统一 push 需 owner 命」口径）。

## DEC-2026-1117-01 [OWNER] owner 实测七反馈修复拍板——设定统一落点/人物下线专用控件/mock 开关删除（2026-11-17）

**背景：** owner 真实测试 0.2（4b84222 后）实测反馈七条。根因调查（主模型亲勘，systematic-debugging 四阶段）：①文件选择原生 input 零样式（NewBookPage:167）；②导入后直落续写、缺剧情/字数/人物设置（向导第三步=详情页功能子集，targetChars 硬编码 3000 于 NewBookPage:132）；③TXT 导入乱码（readAsText 默认 UTF-8，GBK 全篇 U+FFFD）；④初始「AI 建议蓝图」与书架重入两套设定面板并存（同②根）；⑤蒸馏采样段数/温度裸参数无说明无默认（UI 空≠服务端默认 20/0.3）；⑥设置页 mock 开关无解释（factory.ts mock=假 LLM 全接管）；⑦蒸馏 400 报错为 zod issue 原始 JSON（档案名空串直发+parseBody 未人话化）。

**owner 亲决（AskUserQuestion 三问）：** ①②④设定统一落点=**直进书详情页**——导入成功即 navigate 详情页，向导第三步撤销，AI 建议蓝图/发起续写/字数（targetChars 可编辑）补进详情页蓝图编辑区，设定面板从此一套；「人物下线」=**专用下线控件**（服务端 0009 迁移 characters.offline_from_chapter：NULL=在场、N=第 N 章起下线；写手人物卡槽按章过滤（listActiveCharacters 下线当章即不在场），连续性快照增 [已下线] 防复活行；恢复在场=置 null）；mock 开关=**彻底删除**（设置页开关+GET 回显+PUT 链路全删，mock provider 保留供开发/测试环境变量 INKFORGE_MOCK 启用；owner 配置核查 INKFORGE_MOCK="0" 无遗留风险）。

**主模型随案钉细节（owner 可驳回）：** 蒸馏表单前置校验（空名/样本 <200 字拦截）+采样参数预填服务端默认（20/0.3）+一行人话说明；parseBody 400 人话化（「请求参数不合法：path: message」分号连接，无测试锚定文案，仅断言 400 状态码的既有用例不受影响）；新导向导文案「①建书→②导入原文→③到书详情页设定并发起续写」。

**验证链：** typecheck 全绿；定向（server 六文件 36/36、web 四文件 35/35）；全量 server 269/269 + web 77/77 + shared 2/2（基线 348 只增不减）；lint 零输出；build 冒烟 385.77kB 通过；安全深扫秘密正则零命中+pnpm audit --prod 零漏洞。GUI 未验证（owner 真实测试）。中文码点序教训：JS sort 按 UTF-16 码元（'乙'<'甲'），同毫秒 created_at 顺序无契约——断言用 Set 比对。

## DEC-2026-1117-02 [OWNER] 复测反馈：蒸馏面板文件选择漏改补齐（2026-11-17）

**背景：** owner 复测 349423b 后反馈蒸馏面板「选择文件」仍是原生裸 input（截图 StyleProfilesSection 表单）。根因（systematic-debugging 四阶段）：DEC-2026-1117-01 反馈①「文件选择原生 input 零样式」的修复只落 NewBookPage（虚线底框+回显），全库仅两处 file input，蒸馏面板 StyleProfilesSection 漏改；且该面板仍走 readAsText 无编码探测——同根因③（TXT 乱码）在此面板的第二处漏改。

**处置（沿用 1117-01 已拍板样式，无新拍板）：** 蒸馏面板文件选择对齐 NewBookPage——hidden input+虚线底框 label（虚线框、hover 描边、文件名「xx.txt · 已按 GB18030 解码（N 字）」回显）+decodeTextFile 编码探测（GBK 样本不再乱码）。回归测试先红后绿：GBK 字节→虚线框在场+正确解码回显（镜像 NewBookPage 反馈③用例）。

**验证链：** typecheck 全绿；定向 StyleProfilesSection 16/16 + NewBookPage 5/5；全量 server 269/269 + web 78/78 + shared 2/2（基线 349 只增不减）；lint 零输出；build 冒烟 386.41kB 通过；秘密正则零命中+pnpm audit --prod 零漏洞。GUI 未验证（owner 真实测试）。教训：反馈修复按 grep 全库点位清单逐处销号，不许只修报告里截图那一处（本次 ①③ 各漏一处）。

## DEC-2026-1117-03 [OWNER] 全库体检拍板三卡——章题识别扩展/mock 文件通道收尾/仿写校验（2026-11-17）

**背景：** owner 令全库检查。主模型三层体检（同类点位全库销号+近四提交 diff 审查+核心文件抽查）结论：无新增运行 bug；P2 一处拍板偏差（mock「彻底删除」只删 UI+PUT 链路，settings.ts:14 schema 仍认 INKFORGE_MOCK 且 config.ts:143 文件键覆盖环境变量，本机 config.json 实测残留该键值 '0'——通道在、现值安全）；P3 三项边缘观察。owner 拍板：①拆章识别「（一）/第一章等」修复+测试 ②P2 修复立项开工 ③P3-1 仿写校验随立项做；P3-2（NewBookIdeaPage 收编详情页）方向未拍板仍悬置，P3-3（distill_jobs 行积累）纯观察不动。

**三卡处置（计划真值 docs/plans/2026-11-17-chapter-title-and-mock-cleanup.md，主模型亲执）：** A 章题正则三分支——第X章节回（容忍「第 1 章」空格排版）|数字顿号「一、雪夜」（排顿号复现防「一、二、三」误切）|全/半角括号「（一）雪夜」；显式不支持半角点「1. 雪夜」（误伤「1.5 万」，样本再现再议）；防误判 18 组实证先行。B settingsSchema 删 INKFORGE_MOCK——zod strip 使 config.json 残留键成死数据、writeSettingsFile 下次保存顺带洗掉；env 通道保留（config.ts 不动）。C 仿写表单前置校验（空名/<200 字，文案对齐蒸馏面板）+反推章数 string 态提交钳 [1,50]、非法回退 12。

**验证链：** typecheck 全绿；定向 NewBookPage 9/9 + config 11/11 + ImitationProfilesSection 5/5；全量 server 272/272 + web 85/85 + shared 2/2（基线 359 只增不减）；lint 零输出；build 冒烟 386.79kB；秘密扫描命中均为测试夹具占位值零新增真实凭据+audit 零漏洞。GUI 未验证（owner 真实测试）。

## DEC-2026-1117-04 [OWNER] P3-2 瘦身收编 + 风格多选维度级杂糅 + 续写注入三拍板（2026-11-17）

**背景：** owner 令本会话拍板两项悬置：P3-2 新书流程方向（唯一出处 DEC-2026-1117-03 留悬置，二义=收编撤入口 vs 保留入口补字数）与风格多选杂糅（DEC-2026-1116-01 ⑨ 曾移出本批立 0.3 设计稿，三先决=合并语义/快照结构/drift 基准）。code-reader 两卡调研事实：NewBookIdeaPage（/new 三步向导，入口 App.tsx:34）独有能力=全书一次性 suggestOutline 批量蓝图+逐章采用，targetChars 写死于 NewBookIdeaPage.tsx:89（服务端 chapters.ts:128/134 兜底同值 3000，去写死不改默认行为），详情页对同一章（同一 PUT blueprint API）的编辑已含可改字数（min 500）且另有风格绑定/人物下线/续写/导出/伏笔/运行监控；风格档案=结构化七维文本（节奏/对话/描写/情感基调/写作特点/特色词汇/章节结构）+六轴 0-100 数值+规则+术语+样本（0001_core.sql:40、shared StyleAnalysisDto），books.style_profile_id 单外键+绑定快照，详情页 StyleBindSelect 单选下拉（BookDetailPage.tsx:11-29），注入按槽预算截断（styleDims 600/styleRules 1000/fewShot 1500≈draft prompt 31%，config.ts:99-110），continue 模式完全不注入档案、声线锚定前 3 章现算指标（chapter.ts:183/121），全库无权重/混合预留。

**owner 亲决（AskUserQuestion 三问）：** ①P3-2=**瘦身收编（保留入口缩职责）**——/new 向导保留并重定义为「建书+全书批量蓝图」专用：step2 撤全量 JSON textarea，只留逐章采用/弃用+标题+逐章 targetChars 编辑（默认 3000、min 500，修掉写死点），深度蓝图编辑归详情页独有，重叠从「两个编辑器」缩为「查看 vs 编辑」。②杂糅=**维度级拼装**——风格绑定改多选，七维各自独立勾选来源风格（默认跟随主风格），六轴按各风格实际贡献维度数加权平均（不设独立权重滑条），规则=主风格 rulesText 全量+辅风格去重补充，术语=主风格优先预算内并集，样本=fewShot 预算内按贡献维度数等比取样；构造上零冲突、dims 块长度≈单风格不膨胀。③续写口径=**续写也注入混合风格**——continue prompt=前章声线锚+混合风格块并存，并加一行指令「前文腔调优先，文风档案作质感参照」。

**主模型随案钉细节（owner 可驳回）：** 绑定多选上限 4 档案（1 主+≤3 辅，超出再议）；主风格=勾选中显式指定的一枚，维度下拉选项=主风格+已勾辅风格；快照结构=books.style_snapshot_json 升级为拼装映射（主档案+逐维来源 profileId+平均后六轴+合并规则/术语/取样样本），档案重蒸不自动刷新绑定快照（沿用现行快照语义，需手动重绑）；向导逐章字数随 putBlueprint 落库不新增 API；0.3 设计稿三先决中合并语义/drift 基准就此了结，快照结构按本条钉细节落地。

**执行留痕：** 本条拍板先归档；计划真值=docs/plans/2026-11-17-style-mixing-and-wizard-slim.md（code-planner 产出、writing-plans 粒度，owner 审后按 dispatch-discipline 派卡）；卡提交链与验证链收口时补记。主模型对码复核修 5 处（continue ids 断言/绑定行序/textarea 计数/:296 门保留/dims 来源缺失防御）。decision-proxy 初裁**拒裁缓派**（缺 critic 评议、缺逐 agent 表态、卡面未齐）；补齐后重提——decision-critic 评议总立场「有条件支持」，提 [HIGH_RISK_OBJECTION] 迁移窗口一项+两项 MATERIAL_CONFLICT+若干 MINOR，**主审全部采纳**：SM-02/03 并卡一次提交消 FK 窗口、派发前主审 VACUUM INTO 生产库快照、回填 INSERT OR IGNORE+主行部分唯一索引、merge 算法钉死七处（实际贡献计权/轴 w>0/规则 break 语义/样本顺延循环/id 命名空间 `${profileId}:`/去重/确定性 meta 测）、polish 取消二次轮转改直取、绑定面板挂载时机与初值同步等。主模型钉语义澄清两条（owner 可驳回）：向导 step3「发起生成」保留（导流非编辑面）；主风格零贡献时样本 0 席合意（完成通知知会）。快照冻结粒度以计划 D1 为准（bundle 存 per-profile 内容、合并产物注入时重算并带 mergeVersion=1）——取代本条钉细节原文「平均后六轴+合并规则/术语/取样样本」的字面冻结口径，理由=冻结合并产物会杀死样本逐章轮转。

**执行留痕补记（2026-11-17 批次收口）：** 派卡通道=ZCode Agent code-Executor 后台执行（opencode 外派通道 2026-11-16 整体清除，wrapper 末轮三 free 臂实测全「Free usage limit reached」），串行七卡一次通过全数验收放行：SM-01 a412dd9 / SM-02 并卡(02+03+04) 94e4bb0 / SM-04 07c7873 / SM-05 dfb870b / SM-06 880f334 / SM-07 b9cb8f9 / SM-08 4f317b7；主审验收期修正两件：018cb49（normalizeDimsSource 计划签名拿不到 aux 集合之计划内不自洽→执行者按测试真值消解，主审更正计划与 docblock 表述）、3e49a57（蓝图编辑区用例初值字数同步断言改 waitFor——SM-08 前既有渲染竞态，三发瞬态集中于该用例，修复后 10 连跑零红，断言强度不降）。SM-02 派发前置快照=apps/server/data/backups/inkforge-pre0010-20261117-1514.db（源/快照双侧 integrity ok、uv=9；生产库当时 0 书 0 绑定）。收口验证链（Task-09 亲跑）：typecheck 全 workspace 0 错、lint 零输出、定向各组全绿、全量 server 302+web 89+shared 2=**393**（基线 359 只增不减，与计划预计终账逐项吻合）、web build 389.06kB 冒烟 OK、audit --prod 零新增、逐提交秘密扫描零真实凭据。push：1a1abd1..94e4bb0 已按 owner 令推送（ls-remote 复核✓）；07c7873 起 7 提交（07c7873/018cb49/dfb870b/880f334/b9cb8f9/4f317b7/3e49a57）待 owner 令。验收采信偏差登记七项：①ts 取在事务闭包外（计划字面「事务内」，单值复用意图达成）；②targetChars 公式输入 0→3000 边缘语义（计划逐字公式，UI min500 已拦）；③normalizeDimsSource 实现收窄=仅主合法、merge 按 ids 全集解析（规格语义不变，无生产消费方）；④chapter.test 既有 's1' 断言→endsWith(':s1')（全局约束①命名空间适配授权）；⑤polishBenchmarks 签名扩 book.id（计划签名与「与 chapter 同构」自相矛盾，扩法最小）；⑥auxProfileIds 内部重复 id zod 未拦→落库撞 UNIQUE 出 500——UI 勾选不可触发、纯 API 客户端可达，**是否补 zod 去重规则待 owner 裁**；⑦上述 flake 根因修复。GUI 未验证（owner 真实测试）点位：向导 step2 三件套（标题/字数/只读预览）、绑定面板（勾选上限 4/主风格/七维来源/初值回显/换主重映射/解绑/fewshot 归零提示/chip 多选语义）、continue 注入混合风格与指令行效果、polish 合并术语基准。已知接受项：continue 注入 fewshot 样本但不做抄用检测（既有缺口本次不扩）。

## DEC-2026-1117-05 [主模型代决·owner 可驳回] 融合比例只驱动六轴+样本（取代 1117-04 权重条款）+ 融合成品延后 + 导出澄清 + 辅重复裁 400（2026-11-17）

**背景：** owner 第三轮实测反馈三条（截图=详情页绑定面板）：①风格档案杂乱，应有简化设置、直接设置各占比例不需细化设置；②风格档案仍只能二选一、没有融合（例：想结合两个蒸馏档案的特点一起添加进去）；③「导出 markdown」是什么意思。code-reader 两路调研：现版已多选上限 4（1主+3辅）非二选一，「二选一」观感=七维来源下拉每维单档案+**默认七维全归主→辅权重 0→六轴加权实际只用主档案**（merge.ts:195-203 权重=实际贡献维数、BookDetailPage.tsx:25-27/76 初值与保存均全归主）——此即「没融合」实态根因；导出 markdown=阅读页按钮把**全书**章节分章落盘服务端 data/exports/（非当前章、非浏览器下载、无文案解释，export.ts/routes.ts 返回仅 {files}）。AskUserQuestion 四问（比例形态/融合成品/导出处理/辅重复 id 500）owner 未答、令按最佳判断继续。decision-critic 评议总立场「有条件支持」，D1/D2 各一枚 [HIGH_RISK_OBJECTION]+M1-M7 必改修正项+INFO_GAP（owner 语义/实测版本——已实证截图控件仅存在于 4f317b7 后构建，视为测新版）。

**主模型拍板（对两枚 HIGH_RISK 的回应）：**
- **D1 采纳修正**（M1-M4）：绑定面板加档案比例 weights——**比例只驱动六轴加权平均与样本 3 席最大余数分配**；七维仍显式选来源（默认跟随基准档案），与比例正交；**删除**「按剩余权重自动分配七维」机制（critic：分配顺序/平手/空文本回退无原则，自动分配=新拼装感且显示与实际归属不一致）；主风格更名「基准档案」并注明规则全量+声线锚+画像默认归属归基准；比例标签钉「六轴与范例取样比例」，不承载规则/术语比例化（规则主全量+辅去重 400、术语并集≤10 本轮不动）；**禁 0%**：勾选即 ≥1（输入 0 按 1 处理再归一），整数百分比最大余数归一化保和 100，主保底 1 废除（旧「1」=一维权重与百分比语义不兼容）；新绑定默认比例=勾选档案均分（余数归基准）——直接修掉「辅权重 0」根因。
- **D2 融合成品采纳「延后」**：mergeStyleProfiles 输出是注入投影（样本 3 席/规则 400 字/术语 10 条封顶），直接落成档案出生即有损（样本轮转退化、再融合预算锁死、版本族空 selfScore、重蒸 409 文案误导、删除守卫不覆盖档案引用）；且 owner「融合」语义（绑定级共注入 vs 生成新文风）未确认。待 D1 落地 owner 实测融合感后另批；候选形态优先=融合配方（recipe 引用来源档案 live 重算）＞存全量并集的档案化（后者须另钉 metrics/source_hash/版本/重蒸/删除语义）。
- **D3 导出澄清采纳 M6**：阅读页按钮文案按真实行为改「导出全书正文（Markdown，保存到本机 data/exports/，不自动下载）」；路由返回 outDir、toast 报本机绝对路径；详情页导出区加一行说明；浏览器下载（zip/单文件）列 backlog 候选本轮不塞。
- **D4 辅重复 id 采纳「显式 400」**（非静默去重，与 zod 规则 4「主风格不可重复勾选」报错风格一致）：了结 1117-04 执行留痕验收偏差⑥「待 owner 裁」项——主模型代决，owner 可驳回。

**随案钉细节（owner 可驳回）：** 存储=book_style_profiles 加 weights_json 列（迁移 0011 ADD COLUMN DEFAULT '{}'，无 FK 重建）+快照 bundle V2 带 weights、mergeVersion 升 2；**legacy 兼容硬红线**：无 weights 的 bundle/weights_json='{}' 行走原「贡献维数计权+主保底1」路径（旧绑定书行为逐字节等价，旧快照 fixture deep-equal 验证），UI 该行显示「旧绑定：按贡献维数计权」不得显示成均分；setBookStyleBinding 同事务写表与 bundle；StyleBindBody/StyleBindingDto 加 weights、GET 回显带出；parseStyleBundle 缺 weights 容忍为 legacy，v 字段语义不动。
**知会（低危观察不修）：** schema 规则 2 早退使 `{profileId:'x',auxProfileIds:[…]}` 组合通过校验、路由归一静默丢 aux——与计划七规则原文一致，仅边角知会。
**治理与留痕：** 本条取代 DEC-2026-1117-04 裁决②「不设独立权重滑条」及「六轴按实际贡献维数加权+主保底1」条款（维度级拼装的显式选维、规则/术语/样本封顶条款仍有效，仅权重来源改读用户输入）；AskUserQuestion 未答≠owner 批准具体机制，本条记录「owner 令按最佳判断、主模型按 critic 修正拍板」。push 留痕：SM 批次 9 提交 94e4bb0..de3686c 已推送 ls-remote 复核✓（两轴 code-review：Spec 轴零发现；Standards 轴唯一硬违规 README:40 续写口径未同步→de3686c 修正；4 项 smell judgement call 登记不阻塞：chapter/polish 绑定装载链同构（本批可顺手抽 loadMergedProfile）、normalizeDimsSource 无生产消费方、{styleProfileId,styleSnapshotJson} data clump、continue 指令行两端硬编码同句）。执行：计划真值=docs/plans/2026-11-17-fusion-weights-ux.md（code-planner 产、writing-plans 粒度、主模型对码复核后按 dispatch-discipline 派卡）；卡提交链与验证链批次收口补记。测试基线 393 只增不减。

**执行留痕补记（2026-11-18 批次收口）：** owner 会中令「本会话由主模型独自完成，不外派」——FW-A~D 主模型亲执（无外派卡），串行五提交：FW-A 1f85cfa（merge.ts 双分支+mergeVersion=2+10 例单测）/ FW-B aea6b7b（迁移 0011+仓储 weights_json+zod 规则 4.5「辅档案不可重复勾选」（D4 了结，500→显式 400）+规则 8 键集/Σ=100+routes 落库）/ FW-C 273288a（绑定面板：基准档案更名+title、比例区 ≥2 勾选渲染、高级设置 details 默认收起、legacy 只读提示不预填、normalizeWeights 导出纯函数）/ FW-D 4eb1b8e（导出澄清：端点回传 outDir 绝对路径、阅读页按钮「导出全书正文（Markdown）」+旁注、toast 报位、详情页说明行）/ 1c5294f（自查修复 normalizeWeights 空入参除零卫语句）。主模型对码复核修正两处（相对计划）：FW-A 用例 2 fixture 改 pB 七维文本俱全字面量（abProfiles 型辅仅 3 维文本、余 4 维回落主 → 实际计权 4/3=64 而非 1/7=58，红线用例失真——教训：回归用例 fixture 须语义等价复刻）；FW-B 补计划漏列的 polish.test/chapter.test 两处合成 binding fixture（weights:{}，typecheck 兜底抓出）。前置快照=apps/server/data/backups/inkforge-pre0011-202611171547.db（VACUUM INTO 双侧 integrity ok、uv=10）；0011 已落码树，下次服务启动自动应用。验证链（主模型亲跑）：typecheck 全 workspace 0 错、lint 零输出、定向各组全绿、全量 server 316+web 98+shared 2=**416**（基线 393 只增不减，与计划预计终账逐项吻合）、web build 391.29kB 冒烟 OK（基线同数量级）、audit --prod 零新增、逐提交秘密扫描零命中。legacy 逐字节红线双证据：merge.test 既有 20 例零适配全绿+mergeVersion=1 直喂 fixture 回归 2 例。推送前两轴审查：owner 令不外派，code-review 子代理由主模型亲审替代（Standards 轴：命名/分层/测试风格与仓约定一致，1 项防御缺口已修 1c5294f；Spec 轴：DEC-2026-1117-05 各条款逐条对上，无缺失无 scope creep）。push：2ee71b7..HEAD 于收口时推送（ls-remote 复核✓）。GUI 未验证（owner 真实测试）点位：绑定面板（基准档案更名与 title、比例区默认均分/输入 0 钳 1/勾选增减重置、高级设置折叠、legacy 提示与不预填、保存 payload、单档案 {id:100}）、导出（阅读页按钮文案/旁注/toast 报本机绝对路径、详情页说明行）。

## DEC-2026-1118-01 [OWNER] 导出默认格式改 TXT（.md 不再默认）（2026-11-18）

**背景：** owner 实测 FW 批次导出澄清后追加反馈：「不需要把整本书的章节正文写成 .md 文件，当前默认为TXT格式」。三格式能力保留（分章 Markdown/全书合并仍可在详情页下拉选），仅默认值改 txt。

**处置（主模型亲执）：** 服务端路由缺省 'chapters-md'→'txt'（routes.ts:965）+ exportBook 函数默认参同改（export.ts:26，docblock 默认标记同步）；详情页导出格式下拉默认 'txt'（BookDetailPage.tsx:490）；阅读页按钮文案「导出全书正文（Markdown）」→「导出全书正文（TXT）」（ChapterReaderPage.tsx:73）；README:38 口径更新。回归测试按「改默认值必带回归测试」纪律：export.test 新增「默认格式=txt」用例+首例改显式 chapters-md（md 文件名/# 标题语义钉死不丢）、api.test 缺省断言 files 全 .txt、ChapterReaderPage 用例按钮名适配。

**验证链：** typecheck 全 workspace 0 错、lint 零输出、定向 export+api 11 绿+ChapterReader 5 绿、全量 server 317+web 98+shared 2=**417**（基线 416 只增不减）、web build 391.30kB 冒烟、audit --prod 零新增。GUI 未验证（owner 真实测试）。push：5456ae9..HEAD 收口推送（ls-remote 复核✓）。

## DEC-2026-1118-02 [OWNER+主模型] UI 全面重塑「松烟」立项：撤 SubTrans 对标、现代化第一诉求（2026-11-18）

**背景：** owner 判定现状 UI「整体风格不协调、严重割裂」，选择题四问全中（页面间不一致/气质不对味/布局与 IA/细节不精致）并追加「特别陈旧，像 1990-2010 年代作品，不够现代化」；会话约束=主模型独自完成，除设计师与评议员外不外派。现状勘探（隔离四件套 8791/5199+基线库副本+headless/CDP 截图 9 张）与 design-expert 只读设计卡（docs/design/ui-reshape-proposals-2026-11-18.md，514 行：审计 24 条+三方向完整规格+测试零改动通道）经主审抽查属实（裸 rounded border 71 处/ui.test 逐字钉 Button 串/App.test 钉 inkforge 文本节点/无快照测试）。

**owner 拍板（AskUserQuestion 三问）：** D1 方向=A「松烟」（墨色 primary+炉火橙 accent，直译墨炉）；D2=捆绑 Noto Serif SC（选项字面为 SemiBold+Bold 两字重 4.4-6MB）；D4 书详情 IA=锚点分区（弃标签页）；D3 纸色 #F7F6F3 与 D5 橙/danger 邻近性按设计师推荐默认接受。D2 问项同时确认「对标与否不重要，重要的是现代化」——DEC-2026-1115-04 的 SubTrans 对标方针由此撤换，SubTrans 对标 spec（spec-button-subtrans-2026-1116 等）降级为历史参考，Button class 串语义仍被 ui.test 钉死继续有效。

**decision-critic 评议回应（评议员 R1-R6+1 HIGH_RISK_OBJECTION+2 材料缺口，主模型逐项裁决）：**
- **[HIGH_RISK_OBJECTION] 表单控件边界/焦点对比度系统性回归 → 采纳。** 数值亲算复核：line #E7E4DE 对白 1.27:1（现状 currentColor 边 ≈15:1）、focus ring primary/15 合成 1.35:1，均低于 3:1。修正=新增 --color-line-control #948E83（对白 3.25:1）专用于表单控件边框；焦点改 focus-visible:outline-2 outline-primary（15.6:1）；装饰线维持 #E7E4DE；hover 边框 ink/50。配套采纳评议员验证建议：新增 design/tokens.test.ts 纯函数对比度单测（正文 4.5/控件边界 3/徽标 4.5 阈值钉死），测试基线随之 +N 只增不减。
- R1 其余：墨晕激活不可见→rail 左标加粗 3px（采纳）；disabled opacity-45 可读性→**复议维持**（ui.test 逐字钉串不可移除+WCAG 豁免 inactive 控件，登记已知取舍）；hover 弱反馈→Button base 加法追加 active:brightness-95（采纳）；Button font-medium vs 规格「按钮 600」→**复议维持 font-medium**（雅黑无 500/600 档，600 整字 Bold 过重，§2.7 该条款由本裁决取代）。
- R2 字体：Georgia 先行致中西混排 old-style/lining 数字基线错位→**采纳 Noto-first**（display 栈 'Noto Serif SC', Georgia,…）；**D2 收窄为仅捆 600**（700 与设计规格「禁 700 中文标题」自相矛盾=纯死重 2.2MB；此为对 owner 选项字面的偏离裁决，完成通知明示、owner 可一行补回 700）；装后核验 fontsource @font-face 带 font-display:swap 无 local()（采纳）；OFL LICENSE 拷贝 public/fonts/ 随包分发（采纳）；安装包 35MB→约 37MB（登记）；本地 NotoSerifSC-VF 遮蔽验证偏差仅影响「不捆绑」分支，捆绑后不存在（登记）。
- R3 协议：「class 名只增不改」改写为「**不改测试钉死字符串**」（采纳，测试未钉面可改）；无快照测试=无自动视觉回归护栏→以 tokens.test+双档截图自评部分补位（登记 residual）。
- R4 反例四条全采纳：BooksPage 空态保留 Link 续写向导+「还没有书」文案；锚点纯文本 <a> 禁节名 aria-label（防 getByLabelText 撞车）；刷新图标钮 aria-label 逐字「刷新」；**IntersectionObserver 禁用**（jsdom 无此 API=720 行测试全 ReferenceError），滚动跟随改 scroll 监听+rAF 节流+getBoundingClientRect，首屏高亮首锚/触底高亮末锚。
- R5：accent <18px 文字一律 accent-strong（采纳钉规则）；**warn 加深 #9A6A00→#8A6000**（warn-soft 上 4.05→4.79:1，评议员发现的真盲区 warn/danger protanopia 3.3 以「文字标签恒在场」缓解+tokens.test 钉）；逐徽标加图标→不采纳（文字即语义主载体，加图标=噪音）。
- R6：aside 断点 xl→lg（Tauri 默认窗 1280 含边框后 xl 不触发——恰是现状 L3 缺陷根因，采纳）；scroll-mt-16 与条高截图校准（采纳）；锚点条不被 overflow 祖先包住（约束登记）；窄窗页顶进度条/窗口 minWidth（延后 backlog）。
- 现代化缺口：全局 :focus-visible outline、scroll-behavior smooth+reduced-motion（采纳）；skeleton/toast（延后——toast 会破坏消息 getByText 测试面，登记 backlog）；appearance-none 自绘 select/去 number spinner（**复议延后**：原生 affordance 移除无完整自绘补偿=可用性倒退，整体自绘控件族另立项）；CVD 模拟截图（列 owner 实测观察项）。
- 材料缺口（无渲染 mockup/分发范围/700 用途/WCAG 是否验收项）：以「批次早期截图自评+终期 1440×1000 与 1280×820 双档 9 张同机位对照+owner 真实测试门」替代 mockup 门；分发范围按本机桌面应用现状；WCAG-lite（对比度单测+键盘可见）纳入验证链。
- 勘误登记：裸 border 实测 71 非 70；容器宽度六派非五派（max-w-3xl 两处）；报告「7/8 测试文件」表述不一致（以 §6.1 清单 8 文件为准）。

**计划真值：** docs/plans/2026-11-18-ui-reshape-songyan.md（writing-plans 粒度+评议员修正案 v2 已并入）。执行=主模型亲执（owner 会话令），不外派。提交三段（基座/常规页/复杂页）。GUI 未验证（owner 真实测试）。执行留痕与验证链收口时补记。
