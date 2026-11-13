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
