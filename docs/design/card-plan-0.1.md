# 卡：墨炉 0.1 实现计划撰写（code-planner）

## 一、任务

撰写《墨炉（Inkforge）0.1 版实现计划》，落盘 `docs/plans/2026-11-11-inkforge-0.1.md`，粒度遵循 writing-plans 纪律（2-5 分钟/步、每步一动作+一可核对结果、签名/测试/验收命令精确落纸、自审五查）。计划读者=未见过本项目规格的执行者。

## 二、真值源与已定决策（不得重开）

唯一现有真值源：`docs/decision-log.md`（DEC-2026-1111-01 立项选型 + DEC-2026-1111-02 范围/形态变更）。原引用的 intent/review 文档缺失，一律以 decision-log 摘要为准，**不得**因文档缺失停下或重开选型。

已定决策摘要（详见 decision-log，冲突以此处+decision-log 为准）：
- 技术栈：Node 22 + TS + Fastify（REST+SSE）headless 服务；SQLite(WAL) 单文件唯一真相源，正文 TEXT + append-only chapter_versions，FTS5 trigram；DB 状态机 + worker(concurrency=1) + 租约心跳、崩溃断点续跑、残稿 salvage；Anthropic Messages client（DEC-2026-1111-03 修正）+ 角色路由 + 上下文预算装配器；分隔符纯文本解析；质检 L0→L1→门控→≤2 轮定点重写→needs_human；风格蒸馏不可变档案、每章轮换 3 段；VACUUM INTO 快照、导出 md、永不就地覆盖、单实例锁；clean-room，建 `docs/third-party-references.md` 存证。
- **0.1 范围 = MVP 全量四段**（mock 单章闭环 → 真模型 3 章 + kill -9 压测 → 20 章挂机 → 云路由/GUI 完整化）。20 章挂机（约 5-7 小时）安排为过夜挂机任务，不占白天开发关键路径。
- **GUI = Tauri 桌面外壳** + React+Vite 前端；Task 0 必含 Rust/Tauri 工具链核验（rustc/cargo/tauri-cli），并写明回退预案（浏览器 --app 模式先行，Electron 0.2 再套）。
- **模型端点 = Strata 直连**，**Anthropic Messages 协议**（DEC-2026-1111-03 已修正，非 OpenAI 兼容）：base URL `http://127.0.0.1:47831/v1`，模型 `iq3_xxs`（Qwen3.8-Flash-Next IQ3_XXS，512K），apiKey `strata`；凭据落 `.env`（gitignore）：`STRATA_BASE_URL` / `STRATA_API_KEY` / `STRATA_MODEL=iq3_xxs`，启动校验缺值即报。
- **风格档案卡改期**：owner 提供的样例为露骨文本不可用作蒸馏输入（DEC-2026-1111-03 第 3 条）。计划将风格蒸馏排为独立任务并标注"输入待 owner 换样例后执行"，0.1 交付路径不得依赖该任务；续写模式本不注入风格，voice-match QC 按通用规则兜底。
- 里程碑：今天 2026-11-11 开工 → 明天 2026-11-12 交付 0.1 可试用。计划须给出明确阶段时间盒（今日 mock 闭环+DB/状态机+client 骨架；今夜-明晨真模型打通+压测+GUI；明日挂机+收口）。

## 三、约束

- 只写这一个计划文件；不得改动任何代码文件。
- 计划中每个任务须有：精确文件路径（Create/Modify）、Consumes/Produces 接口签名、checkbox 步骤（跑什么命令、什么输出算过）、回归/验收测试。
- 同一工作树后续将按 dispatch-discipline 逐卡派执行者（同树 ≤1 卡、执行者只 commit 不 push）——计划任务边界须与之兼容（一任务≈一卡）。
- 遵循 clean-room：计划中不得要求参考 Pagekin/MirrorNovel 代码或提示词。
- 未提供的信息（样例小说路径）一律落为配置项/卡面参数并给出占位约定（如 `data/entry-a/`），不得写成死行 TBD。

## 四、验收

主审（主模型）复核：writing-plans 自审五查逐项过、决策与 decision-log 零冲突、每任务可独立派卡且带验收命令。产出文件 `docs/plans/2026-11-11-inkforge-0.1.md` 存在且非空即形式完成，实质验收由主审判读。
