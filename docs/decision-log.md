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

## DEC-2026-1115-03 [OWNER 授权/主模型代拍板] UI/蒸馏/全流程讨论全部定案（2026-11-15）

**背景：** owner 对 1115-01/02 两稿的全部待决项明示「进行拍板」——授权主模型亲持定案（不外派模式，无 critic 轮，同 DEC-2026-1114-01/03 先例；owner 事后驳回优先）。

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
