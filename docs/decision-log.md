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

**执行留痕补记（2026-11-18 收口）：** 主模型亲执四提交：5f4358e（基座：token 全表+Field/DataTable/EmptyState/Section+tokens.test 对比度门+宋体 400/600 捆绑+eslint artifacts 忽略）/ d5a5842（常规页 11 文件）/ 4095e8d（书详情锚点+阅读沉浸 6 文件）/ a2f92cd（docs）。实现期裁决二：①D2 字重收窄再修正——阅读正文 400 必需，仅捆 600 会让长文渲染 SemiBold 过重，改捆 400+600（与 owner 批准的两字重体积等量；owner 选项字面为 SemiBold+Bold，此为偏离裁决，完成通知明示，可一行补回 700）；②eslint.config.js 增 artifacts/** 忽略（截图 chrome-profile 缓存 JS 致 2.4 万误报，生成产物目录豁免的 infra 修正）。验证链（主模型亲跑）：typecheck 全 workspace 0 错、lint 零输出、web 102+server 317+shared 2=**421**（基线 417 只增不减，+4=tokens.test 对比度门）、build 398.02kB 冒烟、audit --prod 零新增；**8 个既有 UI 测试文件 git diff 零改动实证**（测试钉串红线兑现）。推送：01e1826..a2f92cd 收口推送（ls-remote 复核✓）；推送前主模型亲审替代 code-review（owner 不外派令：Standards/Spec 两轴+测试零 diff+无 console.log+无 any 核查）。双档截图自评（1440×1000+1280×820）存 artifacts/ui-reshape/shots-new*/：裸边框清零/锚点条跟随/1280 断点 aside/阅读宋体渲染均实证。GUI 未验证（owner 真实测试）点位：全站视觉（书架书脊卡/锚点条滚动高亮/表单 focus-visible 键盘走查/运行中炉火呼吸点/宋体切片生效——owner 机装有 Noto Serif SC 本机字体时留意捆绑源生效）、书详情窄窗 aside。Backlog 登记（评议员现代化缺口延后项）：加载骨架、统一 toast 层、完整自绘 select/number 控件族、窄窗页顶进度条、Tauri minWidth。

## DEC-2026-1118-03 [OWNER] 七维来源新增「共存」选项：dimsSource 哨兵 __coexist__ 各档案文本拼接（2026-11-18）

**背景：** owner 指出书详情风格绑定面板「高级设置」七维来源依然只能二选一（N 选一），要求新增第三个选项「共存」——如特色词汇选共存后同时出现 A 和 B 的特色词汇。主模型亲执（owner 会话令本会话不外派），无异议项未走 critic 评议（低风险：纯增量选项，旧绑定行为逐字节保留）。

**拍板与实现要点：**
1. 哨兵常量 `DIM_SOURCE_COEXIST='__coexist__'`（packages/shared，双下划线包边不与真实档案 id 冲突）；`StyleBindBody.dimsSource` docblock 同步；shared 以 src 直出无需构建。
2. 服务端绑定 schema 规则 5：值合法集 = 主∪辅 ∪ {哨兵}；越权 id / 未知维度校验原样保留。
3. merge 算法钉死新增 1' 条：共存维按绑定序（主→辅）收集各档案该维 trim 非空文本、与已收段全等判重跳过、`；` 连接（保持 inject.ts `· 维度：text` 单行注入格式不被折行）；实际贡献=所有被收段档案（去重段不计贡献）。
4. legacy 贡献计权：每维给其贡献档案各 +1（共存维可多档案同加）；显式 weights 路径与共存正交不受影响；主 max(w,1) 保底不变。normalizeDimsSource（仅主合法收窄形态）不改——单主语义下哨兵归主本就正确。
5. UI：绑定面板高级设置每维 select 追加「共存（各档案拼接）」选项（勾选 ≥2 档案时渲染）+ 语义提示行「共存＝该维文本按绑定序（主→辅）拼接各勾选档案的非空文本，重复段去重。」；失勾至余下 <2 档案时共存键回落新主（select 不再渲染该选项，防悬空值）；换主重映射不影响哨兵键；保存经既有 dimsSource 通道落库快照。
6. 兼容性：旧快照（V1/V2）不含哨兵 → 合并行为逐字节不变；哨兵只经 UI 显式选择写入。

**验证链（主模型亲跑）：** lint 零输出、typecheck 全 workspace 0 错、全量测试 server 323+web 103+shared 2=**428**（基线 421 只增不减，+7=merge 5+http style 1+web 面板 1）、build 398.31kB、audit --prod 零新增。推送前主模型亲审替代 code-review（owner 不外派令，Standards/Spec 两轴）。GUI 未验证（owner 真实测试）点位：书详情→风格绑定→高级设置七维「共存」选项出现（勾 2+ 档案）/选共存保存回显/解绑重绑初值、生成时该维文本双档案拼接实际效果。

## DEC-2026-1119-01 [OWNER] 续写 run↔内容深度关联：入队提示可点+运行卡内联操作+按 runId 查产物正文（2026-11-19）

**背景：** owner 实测反馈——书详情发起续写后提示「续写已入队 run xxx，进度见右侧『运行』卡」，但（a）续写开始后无调整选择（暂停/取消不可达）、（b）无法直接查看续写内容。只读调研（调研卡 docs/design/card-research-run-continuation-gui.md，报告 docs/design/research-run-continuation-gui.md，3dc28cb）定性：**既有 IA 设计缺口非 bug、非 UI 重塑弄丢**——暂停/继续/取消 API 前后端齐全但唯一 UI 在 /runs/:runId 运行面板，运行卡零按钮、入队提示纯文本无跳转（对照新书向导 createRun 后 navigate 直达运行面板，两发起路径不对称）；内容落盘 chapter_versions（带 run_id）但 GUI 只能按章号进阅读页，无按 runId 查版本端点。主审抽查复核调研断言（文案渲染点/运行卡零 Button/向导 navigate）全部实证。

**拍板：** owner 于三选项（A 仅加跳转链接/B 运行卡内联操作+内容入口/C 深度 run↔内容关联）中拍板 **C**。范围=三项：①入队提示含「查看运行面板→」链接；②运行卡活动态内联暂停/取消（paused 态继续+取消）、终态「查看第N章→」跳章节阅读页；③新端点 GET /api/runs/:runId/versions（run_id 反查 chapter_versions 正文内联）+运行卡 done 态「产物」展开+仪表盘「正文」列展开。范围外不做：rerunChapter/adoptPartial 的 UI、GUI 目验。

**计划与执行：** 计划真值=docs/plans/2026-11-19-run-content-link.md（code-planner 产出七任务，主审审查通过；关键核实：RunDto 已含 chapterScope+bookId 无需扩类型）。执行=三卡串行（ZCode Agent code-Executor 通道，同工作树 ≤1 卡红线）：卡1=Task-01/02/03 后端契约（ea33ebe/aa50293/8ed14ff）、卡2=Task-04/05 前端交互（781766d/8219c61）、卡3=Task-06/07 内容展开（34fe3ad/620d1b9）。三卡主审逐卡验收：diff 对卡面范围零超界、实现与计划逐字一致；卡2 两处实测偏差合理（测试章号 effect 时序守卫 findByDisplayValue('3') 带注释、EventSource stub 改每测试重挂抗 afterEach unstubAllGlobals），断言与文案逐字未动。

**验证链（主审亲跑）：** lint 零输出、typecheck 全 workspace 0 错、全量测试 server 328+web 113+shared 2=**443**（基线 428 只增不减，+15=端点 5+提示 1+运行卡 6+仪表盘 3）、build:web 401.01kB 冒烟、安全深扫 secret 零真实新增（命中 2 处均为测试本地 mock 占位符沿既有先例）+audit --prod 零漏洞。推送前 code-review 双轴（Standards 轴：0 硬违规+7 条 judgement call，RunAsideCard 按钮组/展开容器 Duplicated Code 提取留待触碰时顺手重构；Spec 轴：七任务零缺失零越界零错实现）。推送：55bea54..620d1b9（v2rayN 代理挂，git 走 -c http.proxy= 直连），ls-remote 复核✓。**GUI 未验证（owner 真实测试）**点位：①书详情发起续写→提示含「查看运行面板→」可点跳运行面板；②运行卡活动行「暂停/取消」、paused 行「继续」生效后列表刷新（invalidateQueries ['book',bookId]+4s 轮询兜底）；③完成态「查看第N章→」跳章节阅读页；④运行卡 done 态「产物」展开 run 版本正文/「收起产物」；⑤仪表盘步行行「正文」展开该步版本正文、「版本已删」行不变；⑥操作失败错误文案（如暂停已完成 run 显「暂停失败：run is done」）。Backlog：Standards 轴 judgement call（按钮组 action 映射、展开容器共享组件、msg+queuedRunId 状态合并）。

## DEC-2026-1119-02 run 永远卡 queued：worker.lock 陈旧锁 pid 复用 → 心跳锁修复（2026-11-19）

**背景：** owner 报告运行 3a08a47a 永远停在 queued（两个前序 run 被取消也均 started_at=null）。根因链实证：①worker 被硬杀从不释放 worker.lock（`worker/main.ts:33-34` finally 不 release，supervisor.stop 直接 kill 无清理路径）——陈旧锁是常态；②锁探测只看 pid 存活不验身份（`procprobe.ts:2-10` process.kill(pid,0)，EPERM 也算活）；③下午 17:14 的 worker（node pid=1356）死后，20:46 系统把 pid 1356 复用给无关进程（`ta.bat label serve` 的 cmd.exe，与 inkforge 无关）；④22:50 晚间会话 server 正常起、spawn worker 撞锁 → `[worker] fatal: another instance holds lock (pid=1356)` exit(1) → supervisor 无限退避重启每次撞同一把锁 → 队列循环（`worker/main.ts:28` runQueueLoop）永远不存在 → 一切 run 永远 queued，且 worker 崩溃对 UI/DB 零暴露（stdio 只进被最小化的 server 控制台、无文件日志、onMessage 未接）。现场复现：带故障 DB 重启 dev server 即见 fatal 循环；删陈旧锁后 supervisor 下次重试自动接管、3a08a47a 立即 queued→running→done（步链 draft→qc→rewrite×3→summarize→finalize 全 done，终产物版本 abe159df）。

**拍板（主模型，bug 修复级选型未走 critic）：** 心跳锁。`acquireLock(dataDir, file?, opts?)` 持有者每 touchMs（默认 2s）touch 锁 mtime（unref 间隔，ENOENT 自停）；探测侧 pid 活着但锁 mtime 超 staleMs（默认 15s）→ 视为陈旧接管。被否方案：身份探测（需 koffi 原生调用查映像名，重且跨平台差）；仅优雅释放补 release（救不了硬杀，本次事故正是硬杀）。风险自知：持有者真活着但停表 >15s（调试断点/休眠边界）会被误接管，由 run_steps 租约（30s 心跳+takeoverStaleSteps）兜底防双执行；service.pid 同获修复（server 主进程同函数）。

**实现：** 仅改 `apps/server/src/singleinstance.ts`（+31/-4）+ 新增 `apps/server/test/singleinstance.test.ts`（回归 4 例：pid 活但 mtime 超龄→接管；pid 活且新鲜→仍拒；心跳按 touchMs 续鲜；死 pid 接管不回退）。调用点零改动（worker/main.ts:12、index.ts:19 默认值即生效）。临时处置（当时）：删陈旧 worker.lock 文件即解锁（未动用户 20:46 起的无关 cmd.exe 1356）。

**验证链（主模型亲跑）：** lint 零输出、typecheck 全 workspace 0 错、全量测试 server 332+web 113+shared 2=**447**（基线 443 只增不减，+4=锁回归）、server 起服冒烟（health ok+worker 干净拿锁+心跳 mtime 4s 前进两次实证）、secret 扫描零命中+audit --prod 零漏洞。事故 run 已收口：第 7 章生成完成。**GUI 未验证（owner 真实测试）**点位：书详情发起生成/续写 → 运行卡应正常 queued→running（不再永久 queued）。

**Backlog 登记：** worker 崩溃/重启对 UI 零暴露——supervisor onMessage 通道已支持但 index.ts 未接、无文件日志，worker fatal 循环时用户只见「一直 queued」无诊断线索（本次排障靠 DB+进程法证）；建议后续接 SSE 事件或落文件日志。

## DEC-2026-1120-01 [OWNER] 选段重写新增「改写全文」开关：单卡双模式+8000 字硬门（2026-11-20）

**背景：** owner 反馈——选段重写只能针对选段，存在对全文的调整和用词的润色等无法实现全文调整。勘探实证：rewrite-selection schema selection min(1) 必填（http/schemas.ts:114-117）+UI 双非空校验（SelectionRewrite.tsx:26-29），结构上不支持全文；既有批量校对 run（B10）三条 pass 指令钉死不收自定义指令；装配器超预算静默截断（context/assembler.ts:18-26），maxOutput=8192 tokens（config.ts:150-162）是全文输出真约束。**顺带发现相邻缺陷（本卡并入修复）：** handler 把选段全文内嵌 task 槽（budget 500/head）后才放【指令】（routes.ts:936-943）→ 选段 >~470 字符时指令被 head 截断丢失，真实模型收不到改写指令（mock 链路不可见）。

**拍板：** owner 三选项拍板 **A「选段卡加全文开关」**。要点：①同卡双模式，勾选「改写全文」后指令作用于当前所选版本整章正文、选段输入隐藏；②预设四键全文模式填充全文版文案；③同端点 schema selection 转可选，缺省=全文模式，params.fullText=true 落痕，产出仍 kind=revised 不动 current（回滚采纳语义一致）；④长度硬门 8000 字（countChars 口径，shared 常量 FULL_TEXT_REWRITE_MAX_CHARS 单一真值源；依据 maxOutput 8192 tokens 留余量），服务端 400 引导+UI 同串预检双保险，防静默截断与输出截断；⑤task 槽重构两模式统一「正文只走 original 槽、指令只走 task 槽」，修复上述指令截断缺陷并回归钉死。否案：B 独立卡（双份维护）、C 扩展批量校对 run（改动大、单章即时调整体验重）。本会话主模型亲执不外派（owner 令），选型未走 critic（单点增量+owner 显式拍板）。

**计划真值：** docs/plans/2026-11-20-fulltext-rewrite-toggle.md。执行留痕与验证链收口时补记。

**执行留痕补记（2026-11-20 收口）：** 主模型亲执单提交。实现=shared 常量 FULL_TEXT_REWRITE_MAX_CHARS=8000 + schema selection 转可选 + routes handler 全文分支（硬门 400 双 reason；两模式统一 task 槽「正文只走 original 槽、指令只走 task 槽」修 F2 指令截断）+ client.rewriteFull + SelectionRewrite 开关（aria-label=改写全文，勾选隐藏选段输入/预设 fullInstruction 四键/按钮「提交全文改写」/成功文案「已生成全文改写版本」/8000 预检与服务端 400 同串）+ ChapterReaderPage 传 fullTextChars。实现期裁决一：TS 别名收窄对 parseBody 返回类型不生效 → 改解构局部量（routes.ts selection/instruction）。验证链（主模型亲跑）：lint 零输出、typecheck 全 workspace 0 错、全量测试 server 338+web 116+shared 2=**456**（基线 447 只增不减，+9=服务端 6+组件 3）、build:web 402.14kB 冒烟、pnpm audit --prod 零漏洞、secret 扫描零真实新增（测试 STRATA mock 占位符沿 polish.test.ts 先例）。GUI 未验证（owner 真实测试）点位：①阅读页工具卡勾选「改写全文（整章正文，约 N 字）」→ 选段输入隐藏、预设四键填充全文版指令、按钮变「提交全文改写」；②全文改写提交成功提示「已生成全文改写版本…」且版本链出现 revised 新版本（不动 current，回滚采纳）；③超 8000 字版本提交 → 预检文案拦截不发请求；④长选段（>470 字）选段重写指令实际生效（F2 修复——旧版长选段指令被截丢，owner 若遇「改了没反应」即此缺陷）。

## DEC-2026-1120-02 [OWNER] 章节阅读页两反馈：工具卡返回入口 + 章节删除能力（2026-11-20）

**背景：** owner 实测反馈：①阅读页工具区没有返回按钮，必须滚回页顶点「← 返回书页」；②已生成章节（如 needs_human 的第 7/8 章）无法删除，无法删除重调剧情。勘探实证：①ChapterReaderPage 唯一返回入口在页顶 Link（ChapterReaderPage.tsx:66-68），工具卡按钮行（回滚/导出）无导航项；②全书仅书级级联删除（books.ts:293-311 deleteBook 显式依赖序），无章级删除 API/UI；run_steps.chapter_id REFERENCES chapters + FK ON（RESTRICT）→ 删章必须按依赖序显式清理；chapter_summaries/character_states 按章号存续写锚点与人物状态；outline_nodes（0005）为剧情大纲树、与生成章无行级引用。

**拍板（owner 明确令，主模型亲执不外派，选型未走 critic）：** ①工具卡按钮行行首加「返回书页」链接（复用「阅读」chip 形态）；②新增 DELETE /api/books/:bookId/chapters/:chapterNo + 章节行「删除」按钮（三态确认门沿版本删除先例）。一致性范围钉死：tx 内按依赖序删 partial_outputs→run_steps（按 chapter_id）→chapter_fts→chapter_versions→chapter_version_tombstones→chapter_summaries（book_id+chapter_no）→character_states（book 人物×chapter_no）→chapters；**runs 头行保留**（run 历史/报表存活，报表 chapterNo 0 降级与 versionDeleted 标记均已存在）；大纲树/伏笔 planted_ch 语义引用不动（owner 伏笔管理自理）；活动 run（queued/running/paused 且 chapter_scope 覆盖该章，坏 JSON 保守视为覆盖）→ 409 run-active；删前 backupBookPredelete 快照（VACUUM INTO 不能在事务内，沿版本删除先例）；删除后可经「蓝图编辑」重存蓝图重生成。

**执行留痕补记（2026-11-20 收口）：** 主模型亲执两提交。①返回入口=ChapterReaderPage 工具按钮行行首「返回书页」chip（复用「阅读」链接形态）+1 测试；②删章=chaptersRepo.deleteChapterWithCleanup（tx 依赖序七表清理+runs 头保留）+ DELETE /api/books/:bookId/chapters/:chapterNo（404/400/409 run-active，坏 scope JSON 保守视为覆盖）+ client.deleteChapter + BookDetailPage 章节行三态确认门 +2 测试 + server 3 测试。实现期裁决二：新「删除」按钮与人物卡「删除」按钮 accessible name 撞车 → 章节 delete 钮 aria-label=删除章节 消歧（既有测试面零改动）。验证链（主模型亲跑）：lint 零输出、typecheck 全 workspace 0 错、全量测试 server 341+web 119+shared 2=**462**（基线 456 只增不减，+6）、build:web 403.34kB 冒烟、pnpm audit --prod 零漏洞、secret 扫描零真实新增（mock 占位符沿先例）。GUI 未验证（owner 真实测试）点位：①阅读页底部工具卡行首「返回书页」可点回书页；②书详情章节行「删除」→ 确认门文案 → 确认删除 → 行消失+提示「第N章已删除」；③取消不删；④活动 run 覆盖章删除被拒（409「章节被 … 状态的运行引用」）；⑤删章后在「蓝图编辑」重存蓝图可重生成。

## DEC-2026-1120-03 [OWNER] 蒸馏工作台新增「剧情蒸馏」：剧情档案库+书绑定注入 planner（2026-11-20）

**背景：** owner 反馈「蒸馏功能应该再添加一个剧情的蒸馏功能，可以作为参考」。勘探实证：蒸馏工作台现有蒸馏模板+文风蒸馏（三态门，BookSamplePicker 书内样本）+仿写档案（analyzeImitation 三件套：STRUCTURE 结构拆解 5-8 条/文风规则/蓝图反推）；仿写绑定书后结构摘要仅注入 **AI 建议蓝图**（routes.ts blueprint-suggest planner 槽 imitationStructure budget 600，drafter 不注入=Pagekin 红线）；迁移按文件名序自动应用（migrate.ts user_version）。缺口=只蒸剧情的轻量档案（不背整套仿写三件套）。

**拍板：** owner 三选项拍板 **A「剧情档案库+书绑定注入」**。范围钉死：①迁移 0012_plot_profiles.sql（plot_profiles 表 id/name/source_path/source_hash/structure_json/created_at + books.plot_profile_id 无 FK 列）；②analyzePlot 单轮 LLM（PLOT 行协议 5-10 条：开篇钩子/卷级推进/多线交织节奏/高潮布局/收束方式/可复用桥段，sampleReferenceText 8×2000 抽样，200 字下限，沿仿写 baseReq 形态）；③五端点 POST analyze / POST save / GET list / DELETE（解绑引用）/ PUT /api/books/:bookId/plot 绑定（沿仿写先例逐一同构）；④blueprint-suggest planner 槽并列新增 plotReference（budget 600，【剧情参考】头，drafter 不注入红线不变）；⑤蒸馏工作台新增 PlotProfilesSection（名称+原文→剧情蒸馏→预览（结构行 textarea 可编辑）→确认入库→列表查看/删除/绑定书）。否案：B 仅存档查看（参考不可达）、C 并入仿写档案（空文风档案语义混浊）。本会话主模型亲执不外派，选型未走 critic。

**执行留痕补记（2026-11-20 收口）：** 主模型亲执单提交。实现=迁移 0012（plot_profiles+books.plot_profile_id）+ repo plot.ts（save/list/get/delete，delete tx 解绑防悬挂）+ books Book/toBook 增 plotProfileId + setBookPlotProfile + shared PlotDraftDto/PlotProfileDto/PlotSaveBody/PlotBindBody + plot.ts analyzePlot（PLOT 行协议 5-10 条、8×2000 抽样、200 字下限、沿仿写 baseReq）+ 五端点 + blueprint-suggest plotReference 槽（budget 600，与 imitationStructure 并列）+ client 五方法 + PlotProfilesSection（预览结构行 textarea 可编辑，兑现 DEC 预览编辑承诺）挂载蒸馏工作台。测试 server 6（analyze 解析/无 PLOT 行/200 字下限/repo 全链解绑/http analyze→save→bind→注入【剧情参考】/解绑与 404）+web 5。**实现期裁决三：** blueprint-suggest 的 planner 走 `state.plannerProvider ?? createRoleProvider(config,'planner')`（真实 STRATA 地址）——测试必须传 plannerProvider 注入缝，首跑挂死 30s 即此因（沿 imitation/import 测试同款先例）。迁移测试钉值更新（v11→v12、核心对象 16→17+plot_profiles、四处降级模拟补摘 0012 增量物）=每次迁移既有惯例，非弱化。验证链（主模型亲跑）：lint 零输出、typecheck 全 workspace 0 错、全量测试 server 347+web 124+shared 2=**473**（基线 462 只增不减，+11）、build:web 409.04kB 冒烟、pnpm audit --prod 零漏洞、secret 扫描零真实新增（mock 占位符沿先例）。GUI 未验证（owner 真实测试）点位：①蒸馏工作台出现「剧情蒸馏（剧情档案）」区；②粘贴 ≥200 字原文→剧情蒸馏→预览结构行可编辑→确认入库→列表可见结构行；③书选择+绑定→提示「AI 建议蓝图将注入该剧情参考」；④删档案三态确认+相关书解绑；⑤书详情「AI 建议蓝图」时绑定了剧情档案的书 planner 输出应体现剧情参考（观察项）。

## DEC-2026-1120-04 [OWNER] 设定集 MD 直接导入（新书/续写双入口）三裁决：完全加载扩槽+文风节入风格档案+导入后进蓝图审阅（2026-11-20）

**背景：** owner 提供预写的设定集 MD（文体=「设定集」：标题+定位引文+原文解剖/参照解剖/世界观/规则体系/人物圣经/总大纲（卷→篇→章）/场景库/关系阶梯/文风规范/改写对照/缺口清单 11 节骨架），要求新书与续写两入口都能直接导入并成功建书。勘探实证：两入口=NewBookIdeaPage（新书，生成模式三步向导）/NewBookPage（续写，建书→导入原文两步向导）；设定真正进生成管线通道=draft worldview 槽（**1000 字 head 截断**）/characters 槽（800）/每章蓝图（1000）/伏笔经 continuity 快照/三级大纲树；local contextWindow=**524288**、totalBudget≈515k 字符而 draft 槽合计仅 ~10k——扩槽余量巨大；风格档案蒸馏通道 style/analysis.ts `analyzeStyle`（行协议+修复重试+meta.step summarize 可 mock）现成可复用。

**拍板（owner 三问选项裁决，①为自由文本新要求；主模型亲执不外派，选型未走 critic）：**
① **完全加载**——owner 原话「要求如果是设定好的MD集，导入后能够完全加载」：导入落库无丢失（结构化字段+整篇归档 data/imports/），且管线槽位扩容承载全量设定。落点=BUDGETS_DRAFT worldview 1000→**16000**、characters 800→**8000**；BUDGETS_OUTLINE worldview 5000→**16000**、characters 1200→**8000**、outline 2000→**8000**；draft8k/qc/rewrite/planner 档不动（8k 小模型物理不可能完全加载，维持精简档）；config.test.ts 钉值同步更新（迁移测试钉值惯例）。扩槽只对长设定内容生效（短设定 slot 按实际长度取用），不触发溢出收缩逻辑（volatile 最大槽×0.9 仅在 sum>515k 时）。
② **文风规范节→顺带导入风格档案**（LLM 分析路径）：解析器提取文风节原文 → apply 建书事务+归档之后调 `analyzeStyle`（samples=[文风节原文]，planner provider，行协议 DIM/AXIS/RULES/TERMS）→ `saveStyleProfile`（source=samples=文风节原文，evaluation=[]）→ `buildStyleBundle` 单主绑定 `setBookStyleBinding`；<200 字非空白跳过+警示；任一步失败**不回滚建书**、warning 呈现（可在蒸馏工作台手动补）。否案：拼入世界观（挤占预算）、只归档不导入（违 owner 拍板）。
③ **新书导入确认后进蓝图审阅步**（维持计划原案）：章级梗概预填审阅列表逐章采用/编辑，不自动发起 generate run；设定集无章级大纲时回退现有 suggestOutline。

**计划真值：** docs/plans/2026-11-20-settings-import.md（已按本裁决修订）。执行留痕与验证链收口时补记。

**执行留痕补记（2026-11-20 收口）：** 主模型亲执单提交。实现=shared SettingsImport* DTO + settings-import.ts 解析纯函数（十条规则：H2 关键词分节/标题《》提取/description=定位句+世界观+规则聚合/人物三形态含「**标签**：」段落排除/总大纲卷篇章三形态含区间篇卡与兜底卡/悬置线 plantedCh=1/文风节提取，cap 200 卡 50 伏笔）+ 两端点（preview 纯解析；apply 事务建书+整篇归档 data/imports/<bookId>-settings.md+文风步 analyzeStyle→saveStyleProfile→buildStyleBundle 单主绑定，<200 字跳过、失败不回滚建书）+ 拍板①扩槽（BUDGETS_DRAFT 16000/8000、BUDGETS_OUTLINE 16000/8000/8000，config.test.ts 钉值同步）+ web SettingsImportPanel（粘贴/选文件→预览可编辑→确认建书）双入口接线（续写步①导入后流入原文步；新书含章级大纲跳过 LLM 直进蓝图审阅、无则走 suggestOutline）。**实现期裁决一：** counts.blueprintChapters 移除（apply 不落章，章数前端自 draft.outlineItems 可得）；**实现期裁决二：** Panel 补粘贴 textarea（沿 NewBookPage「粘贴全文，或选择本地文件」惯例，测试 2/3 依赖）；**实现期裁决三：** 阶段行后重置 stage（卷四 49/50 章卡不再误入「饭局篇」阶段）。冒烟注意：`~/.inkforge/config.json` 覆盖 env（STRATA_BASE_URL 等），冒烟起服须 aware——本次冒烟即以真实本机 STRATA 完成 LLM 文风分析（数据目录已隔离 tmp，真实 DB 未动）。验证链（主模型亲跑）：lint 零输出、typecheck 全 workspace 0 错、全量测试 server 367+web 130+shared 2=**499**（基线 473 只增不减，+26=server 解析 13+http 7、web panel 3+续写 1+新书 2）、真实样本 MD 冒烟（16696 字：preview title/2329 字 description/15 人物卡/7 卷 12 阶段 77 卡/73 章预填/8 伏笔/文风节 287 字零警示 → apply 201 建书+归档+文风档案《淫妻阿美·文风规范》v1 真实绑定+树回读 7/12/77）→ 冒烟数据已清理。**GUI 未验证（owner 真实测试）**点位：①续写页步骤①下方「或从设定集直接导入」→ 粘贴/选文件 → 解析预览（各区块+字数徽标+文风节勾选）→ 确认导入建书 → 流入步骤②导入原文；②新书页顶部「已有设定集？直接导入」→ 同上 → 含章级大纲直接进蓝图审阅（无「蓝图勾画中」）；③导入后书详情页七节落位（设定/大纲树/伏笔/人物卡/风格绑定）；④导入后从书详情发起续写/生成，设定应体现于草稿。

**追加裁决留痕（2026-11-20 第二轮，owner 两指令）：** ①「设定集现已是 v4（结构重排、矩阵扩容、字数变化），按已批的 16000 上限内调整精炼前置」+「槽位预算按 v4 重核再执行」——解析器 v4 适配（**实现期裁决四：** description 改全文精炼前置=定位句起头/文档序/表格压行 a｜b｜c/剥 markdown，v4 实测 13583/16000 达标**预算维持 16000/8000 不调**（outline 3133/8000、人物槽 1880/8000 同过）；**裁决五：** §6 v4 表格章行「|章|标题|线|落地|」成卡 goal=落地格+跨树章号去重（穿插示范重复章先到先得）+粗体阶段单元行建卷+H3 子节标题不成卷但其下新章挂子节题卷；**裁决六：** 区间卡逐章展开进 outlineItems（产能=先写开场 12 章可直发审阅）+伏笔 ／ 短语串回退（v3 引用化形态））。d92efd7 提交，测试 20 用例（基线 506 只增不减），真实 v4 端到端冒烟全过（preview 24 人物/7 卷 48 卡/48 items/伏笔 8 → apply 201 → 树回读一致）。②「D:\inkforge\inkforge-desktop.exe 更新到最新版」——tauri build 因本机无 MSVC rc.exe 不可用，改 **makensis 直编译**（模板迁移补 0006-0012+dist 装法改目录树+升级清残留+addincludedir，禁 C 定制保留，51f7fc6），装机四点全过+SHA 41c8a2ce 存证（详见 docs/release/0.2.0-local-build.md 2026-11-20 节）。**GUI 未验证（owner 真实测试）**：桌面端更新后 UI 冒烟（设定集导入双入口/书架/生成链）待 owner 实测；重新导入 v4 最新版经 GUI 双入口任选（导入即建新书，旧 v2 导入书可留可删）。

## DEC-2026-1120-10 [OWNER] 实测三反馈取证与拍板：生成管线落地接线+风格注入显著性四卡（2026-11-20）

**背景：** owner 实测三反馈（①v4 设定集导入后新书正文无 H 情景，检查是否设定有问题；②成品应像 Downloads 参考小说（阿美原文/堕绿仙家/舍友）；③勾选三本蒸馏档案但成品风格完全不符）。取证=删书前整库快照（backups/f714c7d1…/…predelete-1795150250651-0001.db）+真实管线函数离线重放（apps/server/data/probe-backup2-1120.cjs、replay-draft-1120.ts）。结论：**设定集导入无损**（description 13583 字全文、规则句在前 300 字内、57 张大纲卡带章题+落地格），断点在管线：①outline_nodes 生成期零消费、chapters 唯一写入口=手动 PUT blueprint（chapters.ts:115）、逐章预填不落库（schemas.ts:269）→蓝图无落地节拍、mustHaveBeats=[]；②blueprint-suggest 槽无 outline、task 300 字被协议行占 ~210、简介只剩 ~90 字；③beat_coverage 空数组空转（l0.ts:159-161）；④风格链路生效（weights 50/30/20、七维归属+三共存维、fewshot 开、styleRules 382 字全注入）但衰减实锤：styleDims 1411→600 头截（特色词汇/章节结构/六轴锚点消失）、fewShot 1746→1500 截（参考小说人名 TERMS ~450 字排范例前占预算）、辅档案 rules 400 封顶（第三档案零注入）、13583 字元文档 worldview 压场（system 16.5k vs user 2k）、成品套话「不是…而是」恰为设定集自身句式=模型模仿世界观槽。

**拍板（owner AskUserQuestion 三问裁决；范围经 decision-critic 有条件支持〔无 HIGH_RISK_OBJECTION〕，条件1/2/3 钉入卡面）：**
①排期=三件套四卡：**Task-01** 导入 apply 按卡落章骨架（章题+落地格经 parseLandingCell 解析→mustHaveBeats；critic 条件：区间重叠首卡胜、关键词≥2 字场景词为主、分级词表从 body 自身解析不硬编码共享码、识别失败入 warnings fail-open）；**Task-02** suggest 新增 outlineCard 专用槽（600）+解析后服务端确定性叠加落地格（不赌模型输出；LANDING 协议本批不加）+PUT 保存并集保留 mustHaveBeats（防「重新建议+保存」静默洗掉）+BUDGETS_PLANNER.task 300→800；**Task-03** rewrite 落地保全句+task 尾部摘要块（落地硬要求+文风铁则前 3 条，recency 杠杆，无声明书零污染）；**Task-04** styleDims 600→1600、fewShot 1500→2500、辅 rules 封顶 400→800、renderStyleBlock 块序反转为范例在前术语截 5 在后、refineForDescription 元信息降噪（版本行/修订记录/决策记录类）。
②模型修正：swift-iq3_xxs=Qwen-Next 138B 量化（owner 实测口径），模型能力非瓶颈——主模型此前「3-bit 小模型天花板」判断作废，归因修正=注入显著性工程（位置/预算/尾部摘要/元文档降噪），不赌换模型。
③验证档案=维持现三档（仙家/舍友/斗罗），接受其与设定集口吻（荤而不悲/台味自嘲）的冲突，阿美主档补蒸挂账后续。
验收闸门（critic 条件3）：合卡后离线重放新注入面（replay-gen-landing-1120.ts）贴存活面；行为翻转说明（写不出落地→beat_coverage 红灯→rewrite→needs_human 诚实红灯，替代原绿灯空转）随完成通知呈 owner；最终=owner 重建书实跑 ch1 对照参考小说。

**计划真值：** docs/plans/2026-11-20-gen-landing-style-inject.md（code-planner 产出，自审五查 PASS；其代理钉值经主模型采纳：draft/rewrite task 500→800、单卡 50 章/全局 300 章上限、apply counts 不加 chapters 键、PUT 并集致手工删节拍回填的代价已记卡面）。

**执行留痕补记（2026-11-20 收口）：** 四卡全落主审逐卡验收：Task-01 `47f880e`（ZCode Agent 通道，派于口径修正前）、Task-02 `485c07e`、Task-03 `4a3b66d`、Task-04 `65c7098`（后三卡走 opencode/hy4-flash-free wrapper 通道——owner 口径修正：窗口内非禁入执行卡全裁 hy4，勿窄读放量白名单三型）。**事故与裁决记录：** ①Task-03 r1 会话换卷致后台 bash 连坐 orphan（无契约、进程消失、render.ts 半程残留）——按看护规则「进程消失无契约→原令重派」，残留回滚后 r2 成功；②Task-04 执行期停工=计划冲击清单漏列 merge.test「规则多辅」用例（依赖旧 400 封顶）——主审补录辅 B 行 `repeat(120)→repeat(520)` 保 break 语义与 361 钉值（计划 4-5 补录=`bacb0ac`）；③执行期三裁决：1-5B 夹具改解析器原生形态（「N-M **题**」系阶段行非卡，重叠语义=跨卡重复章号，`41cf706`）、空值守卫钉 `==null`（DTO 实为 number|undefined）、lint 基线债务 `6f06205` 顺手修（光谱线合入漏网，L-20261113-01 重演）。**验证链主审亲跑终账：** server 402→416→421→426→**429**（净 +27，只增不减）；lint/根 typecheck/knip 全绿；cargo 本机未装→main.rs 未 cargo 验（与 cliches 行同形目审，随桌面下次编译补验）。**Task-05 闸门（主审跑，replay-gen-landing-1120.ts 离线重放）：** styleDims 1411→600 截→1411/1600 全存活（三共存维全文+六轴锚点齐）；styleRules 382→633 三档案 16 条全注入；fewShot 1746→1500 截且术语先占→1485/2500 范例在前术语截5殿后；task 尾部【本章硬要求】（带 grade）+【文风铁则】前 3 条；章 goal=落地格「H（撞见场：房东×阿美）」。行为翻转=写不出落地→beat_coverage 红灯→rewrite→needs_human（替代旧绿灯空转）。**push：** `0243653..bacb0ac` 九提交推清（ls-remote 一致）；code-review 两轴=Spec 零发现、Standards 两处 Duplicated Code 入 backlog（render 节拍行抽 renderBeat、routes 去重键抽 mergeBeats；另 judgement 项：300/49 魔数入常量、routes 内嵌展开逻辑可迁 settings-import）。**开放项（owner）：** ①实跑验收=重建书（v4 导入）→57 章骨架带落地格→ch1 实跑对照参考小说；②词表单字泛化词（干/手/指/含/骑…）误报权衡待 owner 在 landing-words.default.txt 删减；③阿美原文补蒸主档仍挂账。GUI 未验证（owner 真实测试）。

## DEC-2026-1121-01 [OWNER] 设定集 description/worldview 槽预算 16000→20000（2026-11-21）

**背景：** owner 反馈 16000 限额对更长设定集仍不一定够，令提升至 20000。worldview 槽消费链=设定集导入精炼全文（book.description，v4 实测 13583 字）注入 draft 管线（BUDGETS_DRAFT.worldview）与 outline-suggest/outline-tree-suggest（BUDGETS_OUTLINE.worldview）；导入警示阈值（settings-import.ts DESCRIPTION_BUDGET）与前端计数器（SettingsImportPanel.tsx DESCRIPTION_BUDGET）同值对齐设计，四处须同步改。local contextWindow=524288、总预算≈515k 字符（DEC-2026-1120-04①），+4000 余量无虞且扩槽只对长设定生效、不触发溢出收缩。

**拍板（owner 直接令，主模型亲执不外派）：** 四处 16000→20000（config.ts 两槽+settings-import.ts 阈值+SettingsImportPanel.tsx 计数器）；测试钉值同步（config.test.ts 两处、超长样本 17000→21000 字、v3 断言 <20000）；draft8k/qc/rewrite/planner 档不动。

**执行留痕（2026-11-21）：** 主模型亲执单提交。验证链（亲跑）：lint 零输出、typecheck 全 workspace 0 错、定向 config+settings-import.parse 39 全过、全量测试 server 429+web 144+shared 2=**575**（基线 575 持平，只增不减成立）、build:web 冒烟 3.62s 过、diff 安全扫零真实新增。GUI 未验证（owner 真实测试）点位：设定集导入预览 description 字数徽标上限显示 20000。

## DEC-2026-1122-01 [OWNER] 新书无H（v6 卷级大纲）事故与落地双层防线拍板（2026-11-22）

**背景：** owner 实测《少年阿磊》v6（dev 库 54a67d41）导入后新书仍无 H。取证=dev 库直查+真解析器离线实测：v6 §5 大纲按 11-21 令改为卷级叙述（outline_nodes 10 节点全卷/阶段/叙述卡，章级落地格行 0）→章骨架走 suggestOutline 模型回退→goal/beats 纯铺垫无性事节拍→mustHaveBeats=[]→beat_coverage 空集恒真通过→drafter 无落地硬要求→成品无 H；「每章必落分级制」只是 15712 字 description 里的散文（与 DEC-2026-1120-10「散文输给确定性槽」结论一致）。文风档案「主叙直露」系语气规则非节拍要求，不产出 H 场景。**根因泛化：** 强制链需求驱动——mustHaveBeats 全部三个写入方（apply 章卡/suggest 确定性叠加/PUT 并集）都以「逐章落地格已存在」为输入；书的创作硬要求若只以散文表达即蒸发，任何类型小说同理。**内容侧已修（owner 令「补回来」）：** v6 §5.1 补 23 行逐章落地表（ch1–23 峰值落地格；13 处〔追认〕/〔无〕标记待 owner 复核，清单见 .zcode/scratch/2026-11-22-noh/卷一弧1-4-逐章落地格候选.md；§3.2 钉「落地格记峰值、重场前戏自然抵轻」细则），真 parseSettingsCompendium 离线跑 PASS（23 卡全解析出 grade、无连续两章轻、warnings 空、description 16742/20000、42 人物/8 伏笔不变；probe=apps/server/data/probe-v6-table-1122.ts）。重新导入建带骨架新书=owner GUI 操作（旧 54a67d41 ch1–2 为回退废案可删）。

**拍板（owner AskUserQuestion 裁决=双层防线；decision-critic 有条件支持、无 HIGH_RISK_OBJECTION，四条件全采纳钉计划）：**
**层① 书级落地策略（landing mandate）：** books 加可空列 landing_mandate_json（migration 0014），shared 类型 {mode:'off'|'cadence', heavyEveryN?:number 默认2}；null=off=旧书零回归；纯函数 synthesizeMandateBeat(chapterNo,mandate) 章号奇偶排程（偶=H 奇=L）产 keywords=[] 带 grade 节拍；注入点=queue 拾章前**持久化**（critic 条件1：drafter 与 QC 两消费方必须同源，纯内存注入=假绿），保存语义=先剥离〔书级落地策略〕前缀条目→按当前卡重判→重追加（与 PUT 并集语义配对，防后补卡并存冲突）；BeatRequirement 加 source 标志（critic 条件4：l0「keywords 空+带 grade→只查分级词表 AND 层」的放宽仅对 mandate 条目生效；render.ts 尾部块对空 keywords 跳过「须出现关键词：」空行）；合成 H 节拍最小牙（critic 条件2：≥1 个 H 词命中或 ≥2 个不同 L 词命中才过，不动 DEC-2026-1120-10 既有条目语义）；UI=书籍设置「落地策略」下拉（关/分级制每2章重/自定义N）+ 导入 preview 全书无落地格且 description 含「分级制」字样时提示勾选启用（勾选制不自动猜）。措辞降级（critic 条件3）：不承诺「任意连续两章必现一重」（混合书卡章 L 与合成章 L 可相邻）；needs_human 红灯明细须标「书级 H 未达」归因。
**层② planner 落地格槽（critic 替代案升为主修复）：** blueprint-suggest planner 输出协议每章强制【LANDING】行（H/L（场景）形态），服务端 parseLandingCell 校验、不合格拒收重出（有限重试）；模型落地格与卡叠加并集、卡优先（有逐章卡的书零扰动）。
**否决项：** description 结构化提取（模型猜测违散文结论）；单层方案（owner 裁覆盖面不足）。**成本与风险：** 约 4-5 执行卡+1 migration；needs_human 洪水=低-中（默认 off+勾选闸门）；**NSIS 模板快照 hazard**（新迁移须手工同步桌面端模板，发版卡钉「0014 同步」项）。

**计划真值：** docs/plans/2026-11-22-landing-mandate.md（code-planner 产出，5 任务五查 PASS）。**主审裁决（2026-11-22，计划内已就地修正）：** 层②服务端 LANDING 强制范围=「该章无确定性落地才要求模型出格」（卡有书不付重试成本、无卡书无论 mandate 开关均吃层②红利），mandate 不参与判定；既有 bs.test 三例断言实测核过零破。**裁决②（2026-11-22 T01 执行期停手裁决）**：migrate.test 随迁钉值更新=6 处 user_version 13→14+4 回拨夹具补 DROP COLUMN landing_mandate_json（沿既有 books 增量列夹具形态，先例 0012/0013 钉值更新惯例），属随迁更新非改断言语义，计划 Task-01 步骤 7 与冲击清单 #13 已就地补录。**执行留痕补记（2026-11-22 批次前半）：** 内容侧 owner 双令落地——①弧1–4 十三处追认全过（scratch 候选表冻结归档）；②全书最低 H 程度＝口交：v6 §3.1-1 手交降入调情不算落地、§3.2 细则与表头图例同步、9 个 L 章落地格全部提档含口交文本（真解析器复跑 23 卡全带 grade PASS）；判定侧收口=landing-words.default.txt [L] 节删手交词（手/握/套弄/指/揉），闸门对 L 与 H（H 判=L词∪H词）一律按口交下限判定，注释写明恢复路径。**T01 `c825a2b`** 主审亲跑链绿放行（35 用例+根 typecheck+lint；typecheck 系卡面漏钉环节按 L-20261113-01 补跑）。**T02 `61bcc8d`**（hy4 通道，契约 exit 0 无 flags 零轮转）diff 逐行审全在卡面圈内；执行者全量自报「2 既有失败」**标误**——真身=open.test.ts:41/74/81 三处 user_version 钉值为 0014 随迁漏网（冲击清单 #13 只列 migrate.test，已扩展），主审按裁决②口径直修；修后主审亲跑全量 **server 456+web 147+shared 2=605** 全绿（基线 575 只增不减成立；web +3 系并行会话 d031222/44d51a2 蒸馏入口提交带入）。**T03 `9eb5c9d`**（hy4，契约 exit 0 零轮转）diff 逐行审=expectsLanding 主审裁决形态/重试恒 1/降级不 500/卡优先并集/模型条目不写 source 全落实，新用例 4+3 钉值到位；typecheck 唯一红点=queue.ts:83 TS2367——T02 引入冗余 kind 守卫（计划步骤 3 原令致错，已就地修正），T02/T03 卡面验收命令未钉 typecheck 故卡内未暴露（L-20261113-01 重演；主审每卡亲跑链均含 typecheck 兜住，T04 卡面已补钉），主审直修=无条件调用+注释（polish 已在 :62 分支 continue）。**T04 `70ac0b9`**（hy4，契约 exit 0 零轮转）diff 逐行审=勾选与建书同事务/独立 PUT 不合批/轮询防覆盖守卫/aria-label 钉值落实，新用例 2+2+2。**T05 收口（主审亲执）**：lint 零/typecheck 0/knip exit 0/全量 **server 465+web 151+shared 2=618**（基线 575 净 +43 只增不减，其中 web +3 系并行会话带入）；秘密扫零命中；push 前 code-review 两轴：**Standards 零硬违反**+6 处 judgement call（#1 parseLandingCell 四次解析应缓存、#2 landingErrors 无生产消费=删候选、#3 heavyEveryN 归一三处散落应收敛 shared 单点——三条入下批重构候选；#4 render 节拍格式=并入既有 renderBeat backlog；#5 l0 谓词差异可辩护；#6 select 断言窄化可选）；**Spec PASS**+主审口径追认③④：heavyEveryN 归一取严 ≥2（与 schema 钉值一致）、词表缺失/空时 mandate 条目 fail-open 放行（沿 AND 层跳过先例）——均不改代码仅此处留痕。**GUI 未验证（owner 真实测试）点位：** ①重导入 v6→23 章骨架带落地格→ch1 实跑对照参考小说（落地门翻转+口交下限首验）；②书籍设置「落地策略」下拉三态+自定义 N 保存；③导入面板「启用书级落地策略」勾选（对无落地格设定集 preview 警示后勾选）；④cadence 无卡书 ch1 的【本章硬要求】应现〔书级落地策略〕行。验证链收口完成，push d031222..be130b5 推清（ls-remote 一致）。**词表二次令追记（2026-11-22）：** owner 令手交词恢复但归入调情行列——装载器加未知分节护栏（`bb3a8f3`：任意 [X] 节=节头识别不入库，防被吸进前节；测试 ⑦ 钉值）+ 词表文末 `[调情]` 节收纳 手/握/套弄/指/揉（`363945f`：不入库=闸门仍按口交下限判 L/H，与 v6 §3.1-1 一致；头注恢复路径=移回 [L] 节）。修后全量 **619**（server 466）全绿、typecheck 0、lint 零，push 6c5e2a7..363945f 推清 ls-remote 一致。

## DEC-2026-1122-02 [OWNER] 落地词表外置化：项目默认中性空模板+用户可编辑可视化数据层（2026-11-22）

**背景：** owner 裁决（2026-11-22 口头令）：墨炉是通用项目，当前 H 类词表只是 owner 测试题材私货，项目不应自带默认露骨词表；词表应为**用户可编辑+可视化**数据层（`~/.inkforge/landing-words.txt` + 设置页编辑器 + GET/PUT API），项目默认只留中性空模板（注释+[H]/[L] 两空节无词行→空表=AND 层 fail-open 放行=新用户零落地判定，沿 l0.ts 既有语义）。承接 DEC-2026-1122-01 批次收口，交接自 sess_46bd572e。**执行分工：owner 令本会话调研/评议/规划/执行全型别主模型亲任，子代理全裁撤。**

**未决核查（交接文档两待办，本会话查清）：**
①装载接线=`apps/server/src/pipeline/chapter.ts:31-32` 模块级常量 LANDING_WORDS_PATH（`env INKFORGE_LANDING_WORDS_PATH ?? 编译产物相对路径回源 config/quality/landing-words.default.txt`），`:93` 每次 run 调 loadLandingWords 读盘无缓存→PUT 后下一次 run 生效的前提=路径解析从模块级常量改为按 run 解析函数。装载器未知分节护栏（`bb3a8f3`）已就位，外置后自定义节天然可用。
②装机版词表来源=tauri.conf.json:38 整目录 resources 映射（resources/server/config）+壳 main.rs:84 注入 env 指向包内副本；但 **NSIS 模板（apps/desktop/src-tauri/nsis/inkforge-installer.nsi）grep "landing" 仅 0014 迁移两行（:1525/:5383），无 landing-words.default.txt File 行**（cliches.default.txt 有行 :1511 先例）→**0.2.1/0.2.2 装机包内无词表文件，env 指向不存在路径→loadLandingWords fail-open→装机版落地词表一直为空（AND 层不判定）**，交接文档"装机版永远吃打包副本"前提不成立。hazard 判定：本批清空默认词表=文件保留仅内容变更，模板不需新行；本批顺手补 File 行+卸载段 Delete 行使装机 env 有效化（装机装上中性空模板，运行语义不变仍为空表）。

**评议（主模型亲任 critic 职责）：无 HIGH_RISK_OBJECTION，条件修正 R1–R7：**
- **R1（已裁决 2026-11-22 呈批）用户文件路径：** config.json 先例实际形态=env 优先+`~/.inkforge` 兜底（settings.ts:19 `INKFORGE_CONFIG_FILE ?? ~/.inkforge/config.json`），dev 与装机并不共享同一文件（壳注入 cfg_dir）。评审原推荐 C 案（固定主目录共享）；**owner 呈批复："要考虑普通用户而不是现在的开发环境，本机装机版是为了进行实测"→A 案落地**：沿 config.json 先例形态——新增 `INKFORGE_LANDING_WORDS_USER_PATH` env 优先、`~/.inkforge/landing-words.txt` 兜底；装机壳 release 分支注入 `%APPDATA%\dev.inkforge.app\landing-words.txt`（普通用户词表与库/config.json 同目录，数据归一处）；dev 走主目录兜底；一次性迁移=主目录与装机 cfg_dir 各拷一份（owner 两环境实测均吃到存量）。
- **R2（采纳）** 一次性迁移（现词表内容拷入用户文件）=主审手动做，不进代码；装机版因包内本无词表，无"打包副本压过用户文件"问题。
- **R3（采纳）** 开服 seed 规则砍掉：默认两侧均空后"用户文件缺失且默认非空→复制一次"永不触发=死代码，且与"不带默认露骨词表"精神一致；owner 存量靠一次性迁移，其他用户靠 API/手动。
- **R4（采纳）** PUT 校验节头**不设枚举白名单**：装载器护栏本就"未知 [X] 节识别不入库"，PUT 拒绝 [调情] 类自定义节会与之打架；校验=≤8KB+UTF-8 可解码+节头行格式 `/^\[[^\]]+\]$/`+词行非空；GET 返回补 sections 列表供 UI"其它节"展示。
- **R5（采纳）** 测试冲击面补漏：草案只列 l0.test ⑥；**⑦调情档护栏吃真实默认文件、断言依赖 [调情] 节，默认清空后必破**——⑥⑦一并改夹具（自造临时文件，中性词玉佩/窗棂系先例）；chapter/continue/queue 集成吃真实词表→空表更松，复跑定夺；新增路径解析优先级用例。
- **R6（采纳）** API 形态：`GET /api/landing-words` → `{text,counts:{h,l},sections,path}`；PUT 校验写用户文件回 `{counts,sections}`；生效=下一次生成 run（词表按 run 装载非热切），UI 文案沿阈值先例（"保存后下次生成生效；进行中 run 不受影响"）。路由挂载先例=/api/settings/distill-template（routes.ts:960/962）与 /api/settings/quality（:1420/:1425）。
- **R7（采纳）** 范围 fence：不做逐书词表（backlog 候选记一笔）；UI v1=textarea 原文编辑+解析摘要（H/L 计数+其它节列表+空池"闸门不判定"提示+「H 判=L词∪H词」说明），不做词条 chip 网格；grade 枚举 'H'|'L' 与落地格机制不动；上批重构 backlog 三项（parseLandingCell 缓存/landingErrors 删候选/heavyEveryN 归一）不并入本批。

**计划真值：** docs/plans/2026-11-22-landing-words-user.md（主模型亲任 planner，writing-plans 粒度，呈 owner 批后执行）。**执行留痕（2026-11-22 收口，主模型亲执全链）：** 计划 5 任务全落地——T1 服务层 quality/landing-words.ts 五函数+chapter.ts 接线改 resolveLandingWordsPath() 按章解析+新测试 8 例；T2 一次性迁移两份（943 字节=源一致：`~/.inkforge/landing-words.txt` 与 `%APPDATA%\dev.inkforge.app\landing-words.txt`）+默认词表中性化（750 字节注释+[H]/[L] 两空节）+l0.test ⑥⑦改钉（⑥=空表语义留痕、两节解析能力夹具承接；⑦=护栏夹具化，原吃默认文件断言段删除）；T3 GET/PUT /api/landing-words+路由测试 6 例（env 注入隔离、400 双例、PUT 空串=清空合法）；T4 设置页「落地分级词表」区块+web 测试 3 例；T5 NSIS 模板补 File(:1512)/Delete(:5371) 两行+壳 main.rs:85 注入 INKFORGE_LANDING_WORDS_USER_PATH=cfg_dir/landing-words.txt（cargo check 过）。**收口验证链：** lint 零→全量 **server 480+web 154+shared 2=636**（基线 619 净 +17 只增不减）→typecheck 全 0→knip 0→秘密扫零命中；push 前 code-review 两轴主模型亲审：**Standards 零硬违反**+2 judgement call（routes.ts schemas import 整行字母序重排=diff 噪音可接受；l0.test ⑦ 双读盘钉值形态可辩护），**Spec PASS**（R1–R7 逐条落实无 scope creep）。**GUI 未验证（owner 真实测试）点位：** ①设置页词表区块 GET 渲染摘要与生效路径（dev=~/.inkforge/landing-words.txt）；②编辑+保存→下一次生成 run 生效（进行中 run 不受影响）；③清空词表保存→「闸门不判定」提示；④非法输入（超 8KB/半括号节头）→400 错误文案；⑤装机版实测：词表落 %APPDATA%\dev.inkforge.app\landing-words.txt（迁移件已就位，与 dev 互不影响）。主提交 `cb82be9` push 推清（ls-remote 一致）。**挂账：** 逐书词表=backlog 候选；上批重构 backlog 三项不变；makensis 直编译验证挂下批发版卡（release-022 静检硬门届时跑）。

## DEC-2026-1122-03 [OWNER] 显性度注入修复四方向拍板：targeted 喂样本+QC 评准+显性词池进 prompt+few-shot 默认开+蒸馏尺度维（2026-11-22）

**背景：** owner 反馈（2026-11-22 晚）：《少年阿磊》（v6 设定集导入书）生成正文色情程度远低于源书（仙家/舍友/阿美），即使勾选蒸馏档案。实测诊断（同口径 23 露骨词/万字，读库只读探针）：源书密度 113–179；档案 rules 文本保住露骨词（仙家档案 177.7，内含高硬规则）；ch1 版本链=注入原文样本的 draft 密度 242（超全部源书）→ QC 改写后 revised 43.4（UI 当前展示版），改写回路砍 3–5 倍。主因（planner 复核收窄）：**targeted 重写**（QC 仅报 major 时走的路径）零样本零画像（chapter.ts:332-336；full 模式早已透传 :350-351）；few-shot 开关默认关且重绑静默归零（books.ts:123/:144）；落地词池只进 l0 校验不进 prompt（render.ts:90-107「须显性词」=空要求）；蒸馏七维无尺度维（analysis.ts:15-22）；freqTerms 仅展示不注入。

**owner 拍板（2026-11-22 晚）：** 四方向全修——①改写端喂样本+QC 评准（主因）②词池进 prompt ③few-shot 绑定默认开 ④蒸馏加尺度维（存量档案=owner UI 手动重蒸，不写批量脚本）。时机=词表外置化批次先收口（已满足：cb82be9+0421670 已推）。执行=11 卡全派，**新会话开工**。

**设计定断（owner 四项全部追认，执行时不得擅改）：**
- **D-A plagiarism 零改动：** 检查器（≥15 连续字、QC 循环对 draft 与 revised 全查，chapter.ts:283-294/:384）不动；防改写端误咬走 prompt 护栏（「不得复用连续 15 字以上原文」）。误咬失败形态=hardFail→full→maxRounds=2→needs_human，可见非静默（critic 核实 gate.ts:26-31；best 版本可取 revised，豁免=发布版本失去查抄底线）。观测期记录 needs_human 中 plagiarism 占比，显著上升先改样本摘录方式（分句打散）、检查器仍不动。
- **D-B 重绑语义：** 绑定/重绑→style_fewshot_on=1；解绑→0；手动关闭被尊重至下次重绑；新建未绑定书保持列 DEFAULT 0（不迁移）。
- **D-C 词池预算：** LANDING_POOL_BUDGET_CHARS=300 贪心填充（H 池在前、至少收 1 词）；l0 AND 层仅要求「≥1 H 词或 ≥2 不同 L 词」（l0.ts:191-192），词池=可执行清单非全量字典。
- **D-D 词池/铁则次序：** 【显性词参考】块末位（【文风铁则】之后），task 槽 keep:'head' 截尾时词池先于文风铁则让位；双钉=契约次序断言+管线 4 节拍挤压断言（critic 条件 2 采顺序对调案，否决预算 800→1100 案）。

**评议（decision-critic，2026-11-22）：** APPROVE_WITH_CONDITIONS。条件 1（必修，已修入计划）：任务 06 chapter.test.ts:296 `not.toContain('【文风画像】')` 在任务 05 后必翻红——styleDimsText 不受 fewshot 门控（chapter.ts:208 只判 dims&&axes），计划原「断言保持」论证漏了此半，已改翻钉用例名并纳入预期红标注。条件 2：词池块可把铁则挤出 task 槽（800，截尾）→主模型裁=D-D 对调+双钉，已修入。条件 3（可选）：StyleProfilesSection.test.tsx「七维」用例名文案陈旧并入任务 11 grep 自查。critic 独立复跑全量 636 绿；核实 D-A 链路可见非静默；核实老档案无尺度键优雅降级（inject.ts:60 `?? ''`、parseAnalysis 缺维补 ''、UI fromEntries 全兜底）；预算自洽（BUDGETS_REWRITE 9500→13600，成本约 +30-40%/重写轮，maxRounds=2 封顶）。

**计划真值：** docs/plans/2026-11-22-explicitness-injection.md（11 卡：01-03=③、04-07=①、08-09=②、10-11=④；强依赖 01→02/03、04→05→06、07→08、10→11；测试基线 636 只增不减）。卡面=docs/design/card-exp-2026-1122-01..11.md。执行通道=opencode/hy4-flash-free 限时窗（dispatch_guard 已过；同工作树≤1 卡串行）。收口主审亲执（验证链全序+code-review 两轴+提交五步+GUI 点位清单）。

**观测验收（owner 实测口径，非卡验收线）：** 重跑《少年阿磊》ch1（勾蒸馏档案+词表含 H 池），revised 相对 draft 密度比应从 43.4/242≈0.18 显著回升（建议目标 revised ≥100/万字或 ≥draft 60%，owner 实测定夺）；若仍含蓄化，残留病灶排查序=QC 评准线被忽略→full 重写温度→档案尺度维缺失（未重蒸）。

**执行留痕：**（2026-11-23 补记）owner 令本会话主模型独自完成（不派 opencode/hy4，执行通道变更）。11 卡按强依赖序全部落地，7 提交：c7fa297（③repo+测试改钉）→e017ef8（③UI 文案，GUI 未验证 owner 真实测试）→5bed503（①槽+护栏）→23c32a6（①②评准线+词池）→bac2eeb（④八维+指令）→f870d10（config 钉值连锁：rewrite 预算 deep-equal 补两键，计划外）→d50703d（knip：contract.test 消费 LANDING_POOL_BUDGET_CHARS 导出）。验证链全序绿：lint 零告警→定向各卡→全量 **648**（server 491+web 155+shared 2，=基线 636+12 新用例精确命中，只增不减）→typecheck 三包过→knip 零告警→diff 秘密扫描零新增。code-review 两轴主模型亲执（子代理通道回避露骨过滤器风险）：标准轴 0 硬违规+2 判断项（fewshotOn 三元小重复=卡面逐字形态；taskInstruction 双份模板串=先存形态）；规格轴四方向逐条对症核实、D-A/B/C/D 与 critic 双条件全落、1301 纪律全 diff 中性夹具、l0/gate/landing-words.ts/迁移零改动经 diff 复核。流程偏差如实记录：卡 03/07/08/09/10→11「先红」未单独跑红（红态由断言字符串不存在性保证），卡 01 实测红→绿、05→06 跨卡红实测；计划 grep 三文件漏 NewBookPage.test.tsx（八键连锁）与 config.test.ts（预算钉）、web 共存计数 7→8——均按钉值更新惯例修复。遗留=观测验收（owner 实测）+GUI 五点位（见完成通知）。


## DEC-2026-1123-01 [OWNER] 三反馈拍板：术语表去污双层防线／拆解仿写文件选择补位／装机版数据目录整体搬安装目录+dev 词表兜底改仓库 data（2026-11-23）

**背景：** owner 2026-11-23 实测三反馈。①术语表仍混入角色名——根因=默认蒸馏模板 TERMS 行本身要求「抽取人名/地名/专有词」（analysis.ts:20），解析端仅查非空零过滤（plainproto.ts:383-396）；②拆解仿写仍无上传按钮——ImitationProfilesSection 从未有任何文件选择控件，其余 4 个上传点位（建书/风格蒸馏/剧情光谱蒸馏 shell/设定集导入）均为「隐藏 input+虚线 label+FileReader→decodeTextFile」标准块，仿写=漏补的第 5 点位（截图虚线文案在当前源码与随附 dist 均零命中=装机 dist 快照差异，「仿写无控件」这一实质结论经源码+dist 双路调研证实不受影响）；③词表保存位置应在项目文件夹内——装机版词表+sqlite 库+config+备份导出全落 %APPDATA%\dev.inkforge.app（C 盘），dev 词表落 ~/.inkforge 而 dev 数据已在仓库 apps/server\data，两处不一致。

**owner 拍板（AskUserQuestion 呈报 2026-11-23）：** ①装机版落法=**整个数据目录搬安装目录**（词表+库+config+备份导出同迁，彻底不落 C 盘；否决「仅挪词表」「首启自选」）；②卸载器「删除应用数据」勾选=**勾选连新数据一并删**（追加 RmDir /r "$INSTDIR\data"，语义同旧版：勾=全删不勾=全留）；③通道=混合：三张小卡派 opencode/hy4-flash-free、搬迁卡主模型亲执。dev 词表兜底改仓库 data 目录=同原则默认项未另问。

**设计定断（主模型亲持，沿人物光谱先例）：** 术语表去污=双层防线——prompt 端 TERMS 改「抽取地名/专有词/称谓/器物/组织等世界观术语…严禁人物姓名」、FREQTERMS 同禁、新增 NAMES 报备行；解析端 NAMES 切分口径=spectrum.ts:45，名单非空时对 terms/freqTerms 按 findNameLeak 口径整条剔除 `${term} ${note}` 命中项并记 errors，名单空零过滤（用户自改 distill_template 优雅降级）；ParsedAnalysis/StyleAnalysisDto 零新增字段（无 shared 涟漪）。RULES 行/DIM 特色词汇人名引用=风格性引用不处理（fence）；存量已污染档案=owner UI 重蒸消化，不写批量脚本。

**评议（decision-critic 2026-11-23，有条件支持/普通级，无 HIGH_RISK）：** NSIS 现状逐行核实比预期安全——全模板无 RMDir /r "$INSTDIR"，升级不触发 DeleteAppData（:9691），data\ 天然幸存；三硬修正全采纳：①回退守卫落日志文件（windows_subsystem 无控制台，eprintln 零暴露）；②双副本互锁（旧侧 .inkforge-data-migrated-to 记目标，堵换目录重装二次迁移陈旧库）；③拷贝排除 pid/lock/stale/标记自身、必含 db-wal/-shm、新侧标记 create_new 原子写、试写残留即删。另采纳：孤儿服务占端口跳过 spawn 时留痕跳过迁移（不能无条件提前迁移，防对活库拷中间态）；便携语义钉入（exe 旁 data\=portable 默认，复制 exe 别处运行=数据分叉）；灾备前置=动真实数据前整目录 zip 备份 %APPDATA%（已落 16KB）。卡型归类：非 schema 迁移但搬运生产库+改 release 注入面+卸载语义，就高按禁入边缘处理=主模型亲执、禁走 free 通道（与 owner 混合通道拍板一致）。

**计划真值：** docs/plans/2026-11-23-three-feedbacks.md。**执行留痕（2026-11-23）：** 卡1 术语表去污 `cd307c6`（hy4；主审 diff 逐行复核+亲跑链：定向 44 绿、server 全量 502=495+7 净增、typecheck/lint 零错）；卡2 仿写文件选择 `0ec657d`（hy4；执行者对 decodeTextFile(ArrayBuffer) 卡面笔误按样板正确适配、routes GET 本已走 resolve 展示生效路径故仅 PUT 显式 ensure——两处偏离经主审判为正确适配予以采纳；web 156=155+1）；卡4 dev 词表兜底 `9d1ceeb`（hy4；ensure 迁移 4 例+改钉全显式注入 opts 隔离真实盘；server 506=502+4）；卡3 数据目录搬迁 `6ade1ed`（主模型亲执；cargo test 六例全绿、cargo check --release Finished 零警告；NSIS 卸载勾选 hunk+安装段永不递归删除注释块+README 重放约束两行；灾备 zip=C:\Users\57850\.zcode\backups\inkforge-appdata-20261123.zip）。**开放：** 重打包装机卡 t05（build-dist→tauri build 或 makensis 直编译→装机→首启迁移演练：新根内容齐+旧目录完好+互锁标记+shell.log 留痕+8788 健康+书稿可读）；GUI/实装点位（owner 真实测试）：①设置页词表「生效路径」装机版首启后=D:\inkforge\data\landing-words.txt、dev=apps/server\data\landing-words.txt（旧 ~/.inkforge 只拷不删）；②污染档案重蒸后术语表无人名且 errors 可见「含人名被过滤」；③拆解仿写虚线框点选本地 txt/md 回填样本并可拆解；④卸载「删除应用数据」勾选/不勾双态演练；⑤换目录安装二次启动不拷陈旧库（互锁）。backlog：dev config.json 兜底仍在 ~/.inkforge（同类不同件，owner 反馈仅词表）；装机升级 data 幸存演练随下次发版。

## DEC-2026-1123-02 — 0.2.3 发版两裁决（owner 直答，2026-11-23）

**背景：** owner 令「发版 0.2.3，但发版包内落地分级词表须全清空、不得带个人 DATA（蒸馏档案、API 设置等）一起打包」。code-reader 调研+主审三面复核（cmp 实证包内词表/套话表=仓库 tracked 中性默认字节级一致；NSI 3736 条 File 行源全限 build-dist 中性 resources 产物；esbuild 无 env/define 注入；inkforge.env=壳首启写 placeholder mock 模板 main.rs:20-30；config.json/inkforge.db/用户词表均在 `<安装目录>\data\` 现场生成、零 File 行）→ **现打包形态个人数据无泄漏向量**。但 0.2.1/0.2.2 发版均未做包内数据物理清点（Release 公开，0.2.2 存证有未认证 302 可达记录），本轮须实证闭环。

**裁决①（物理清点）：** 初拍「装 7-Zip 解包」经实测替代——owner 问 WinRAR 可否顶替，实测本机 WinRAR 6.24（D:\winrar）：控制台 UnRAR/Rar 不认 NSIS（「不是 RAR 压缩文件」），主程序 WinRAR.exe 为 GUI（30s 挂起零 stdout）不可脚本化。定案=**双物理证明、零新软件**：a) `makensis /V4` 编译日志=包内容宏展开文件清单（断言 File 行源仅 resources/target 主二进制/tauri plugins 三面，个人面 data\、%APPDATA%、.inkforge、config.json、inkforge.db、landing-words.txt 零命中）；b) 验证专用变体包（stamp-nsi --out+--product-name，墨炉芽共存先例）装临时目录 `/P /D=`，**落盘目录全量文件清单**=清点本体，兼覆模板机制回归+净装零数据路径。7-Zip 不装、WinRAR 不用。

**裁决②（模板机制）：** 0.2.2 挂账「NSIS 静态快照固化盘符」本轮修——已证 tauri build 对模板**原样拷贝**（生成 NSI :30-60 与模板零差异），机器依赖面=3736 条 resources 绝对前缀 + `!define MAINBINARYSRCPATH`（I:\ target）+ `!define ADDITIONALPLUGINSPATH`（C:\Users\57850 tauri 缓存）+ ICON 两行；修法收敛为模板头 5 条 define，由 stamp-nsi.mjs 以脚本相对（import.meta.url）/环境变量（LOCALAPPDATA）计算改写全部六行。失败模式安全（忘 stamp→makensis 对 File 缺源硬报错非静默）。执行=卡 t06（opencode/hy4-flash-free，打包层非禁入型），主审亲跑编译日志清点+全量 664。

**执行留痕补记（主模型亲执发版链）：** bump 0.2.3 八处、stamp 盖章、默认词表头注释 :2 路径修正、.gitignore 加固（*.db±wal/shm）、验证链硬序、build-dist→tauri build、发版静检、变体演练、提交五步→push→tag v0.2.3→Release 上载→digest 三验、docs/release/0.2.3-release.md 存证。

## DEC-2026-1123-03 — 发版链 CI 化两拍板（owner 直答，2026-11-23）

**背景：** 0.2.3 发版门本地已全绿（两轴 code-review 0 硬违反；演练二轮取证：首启前 4131 文件落盘清点个人面零命中、双默认表 cmp 与仓库 tracked 一致、词表生效路径=出厂默认、books=0、env=placeholder、互锁「本安装全新初始化不迁移」行在案、卸载回净后 ARP 正式装机注册无损；卸载残留 19 项系 Delete 行历史混合风格，挂账非本轮引入）。owner 问「打包与测试为何不在 GitHub 完成」；主审答：硬阻碍（模板盘符/用户名硬编码）已由 t06 宏化清除，CI 全新 runner 对「包零个人数据」是**结构性保证**（比事后清点更强），public 仓 Windows 分钟免费、GitHub 直连免代理波动、GITHUB_TOKEN 免 PAT 手工链；CI 替代不了 owner 真实测试与本机旧数据升级路径演练（CI 只能模拟净装）。1123-02 末段留痕系计划态误写为完成态（Spec 轴发现），以本条为准修正。

**裁决①：** 0.2.3 等 CI 链建成再发——本地已验证包（inkforge_0.2.3_x64-setup.exe，sha=eed2a8b4c576f5ca9878b94325536d6d05fee5d74049548b7ed77a0ab35bd3f4）作废为参考件、不上载；发版物由流水线从 tag 提交重打。

**裁决②：** 排卡建 `.github/workflows/release.yml` 全链上 CI：tag `v*.*.*` 触发→依赖安装（pnpm 缓存+rust 缓存）→版本门（tag==tauri.conf.version）→全量测试+typecheck+lint+audit --prod→build-dist→tauri build→PE Subsystem 回归→生成 NSI 静态清点（宏形态计数/迁移对/依赖覆盖/个人面零命中）→**正式包验证装演练**（/P /D 净装→落盘清点→首启 health+词表 path+books+env 取证→杀树→卸载）→artifact 存档→Release 自动上载（GITHUB_TOKEN）→digest 回读比对→公开三验；`workflow_dispatch`=验证模式不建 Release。0.2.4 起发版=push tag，验收放行与 GUI 真实测试仍在 owner。

**执行安排：** 计划真值=docs/plans/2026-11-23-ci-release.md（code-planner 产出→critic 评议→owner 审→派卡）；卡拆两张：t07=CI 支撑脚本两文件（release-inventory.mjs 通用化+ci-verify-install.sh 参数化，本地可自证）、t08=release.yml+PE 脚本 CI 适配；首跑调试主模型亲执（REST+git-credential PAT 直连，gh CLI 本机无、不装）。

**终账补记（2026-11-23 晚，发版完成）：** 0.2.3 已经 CI 正式发布——tag `v0.2.3`→commit `1bc6d8c`，run `45177116267` 25 步全绿，Release id 455399069（latest），安装包 65,535,047 B sha256=`171d73e3…` 三方对拍闭环（CI 本 run 本地==服务端 digest==本机整下重哈希）。调试五轮三红三修（Build web 步 `568db43`/checkout depth0 `e1c5853`/剥星号 `1bc6d8c`，根因与形态全文入存证+计划 F1-F6）；critic H1 已闭环（ARP round=2 非空洞实证）。**发版形态就此定版：0.2.4 起发版=push tag，验收放行与 GUI 真实测试仍在 owner，本地链降为参考/兜底。** 全文存证=docs/release/0.2.3-release.md（含 owner 六点实测点位与挂账五项）。
