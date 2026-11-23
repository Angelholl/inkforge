# 三反馈修复 实现计划

**目标：** 销账 owner 2026-11-23 三反馈——①术语表蒸馏剔除角色名；②拆解仿写补文件选择控件；③装机版数据目录整体搬安装目录（词表随迁）+ dev 词表兜底改仓库 data 目录。
**架构：** ①prompt 端 TERMS/FREQTERMS 禁人名+NAMES 报备行、解析端 parseAnalysis 内确定性过滤（复用 spectrum.findNameLeak 口径，双层防线沿人物光谱先例）；②ImitationProfilesSection 复制已修 4 点位的「隐藏 input+虚线 label+FileReader+decodeTextFile」标准块；③main.rs release 分支新增 choose_data_root（安装目录 data 根+一次性迁移拷贝+可写守卫回退 %APPDATA%），dev 侧 landing-words.ts 兜底从 ~/.inkforge 改 INKFORGE_DATA_DIR 相对目录+旧文件 ensure 迁移拷贝。
**规格：** 本计划即规格（owner 2026-11-23 反馈+两项拍板：数据目录落法=整个搬安装目录；通道=小卡派 hy4、搬迁卡亲执）；决策归档 DEC-2026-1123-01（收口时写 docs/decision-log.md）。

## 全局约束

- 测试基线=本轮开工实测（见 docs/baseline/ 收口更新）：三包总数只增不减，新用例净增。
- 每卡验收链必含 typecheck+lint（L-20261113-01）：lint→定向→全量→typecheck→（涉 web 加 build）。
- 1301 纪律：禁读 `apps/server/data/**` 与词表/书稿正文；测试夹具自造中性词（玉佩/窗棂系）。搬迁卡只搬字节不读内容。
- GUI 变更提交信息注明「GUI 未验证（owner 真实测试）」，不自行起浏览器目验。
- 执行者只 commit 不 push；永不 --no-verify；永不 git add -A。
- 装机 dist/NSIS 同步属发版/打包环节，不在本计划卡内（提醒：NSIS 模板为快照，新资源须手工同步）。

## 任务 1：术语表去污（卡1，派 hy4）

**文件：** Modify `apps/server/src/style/analysis.ts`（:20-21 两行改写+新增 NAMES 行）、`apps/server/src/llm/plainproto.ts`（parseAnalysis :350-407 加 NAMES 分支与后置过滤）、`apps/server/src/spectrum.ts`（:22 仅加 export）；Test Modify `apps/server/test/llm/plainproto.test.ts`、`apps/server/test/style/analysis.test.ts`。

**接口：** Produces：parseAnalysis 签名不变（NAMES 仅内部消费，ParsedAnalysis/StyleAnalysisDto 零字段变更=无 shared 涟漪）；`export function findNameLeak(line: string, names: string[]): string | undefined`（口径不变，plainproto 从 '../spectrum' 引）。

**钉值：**
- TERMS 行改为：`TERMS: <术语>: <用法说明>（抽取地名/专有词/称谓/器物/组织等世界观术语与用法偏好 3-10 条，严禁人物姓名；无则省略本行）`
- FREQTERMS 行区分语改为：`与 TERMS 的世界观术语区分，同样严禁人物姓名`（其余不动）
- FREQTERMS 行后新增：`NAMES: <原文人物姓名列表，顿号分隔，仅报备不入档案；无则省略本行>`
- parseAnalysis：NAMES 分支（置于 RULES 分支后、兜底 error 前）`/^NAMES\s*[:：]\s*(.*)$/`，名字按 /[、,，;；\s]+/ 切分 trim 去空（口径=spectrum.ts:45）；循环结束后若 names 非空，对 terms/freqTerms 逐条 `findNameLeak(`${t.term} ${t.note}`, names)` 命中即整条剔除并 `errors.push(\`术语含人名被过滤: ${t.term}（命中 ${hit}）\`)`；names 空=零过滤（用户自改 distill_template 无 NAMES 行时优雅降级）。
- 更新 parseAnalysis 头注释（:348-349）与 ANALYSIS_INSTRUCTION 头注释（:14）。

**步骤（先红后绿）：**
- [ ] plainproto.test.ts 新用例先红：①TERMS 行术语在 NAMES 行内→剔除+errors 含「含人名」；②三字名子串命中（术语「林静如水」vs 名「林静如」）→剔除；③note 含两字名（术语「口头禅」note「阿美的口头禅」）→整条剔除；④FREQTERMS 同口径过滤；⑤NAMES 行不再报「无法识别的行」；⑥无 NAMES 行→含人名术语保留；⑦NAMES 混用顿号/英文逗号/分号→全部入名单。
- [ ] 实现三文件改动转绿；analysis.test.ts 若钉了旧模板文案按新钉值更新（不放松断言）。
- [ ] 验收：定向（plainproto/analysis/distill/distill-jobs/distill-template 五文件）→server 全量→typecheck→lint 全绿；基线不减。

## 任务 2：拆解仿写文件选择（卡2，派 hy4）

**文件：** Modify `apps/web/src/pages/ImitationProfilesSection.tsx`（:170 textarea 后插标准块）、Test Modify `apps/web/src/pages/ImitationProfilesSection.test.tsx`。

**钉值：** 标准块照 StyleProfilesSection.tsx:427-451 同构（先 pointer 读该段作样板）：`<input type="file" id="imitation-sample-file" accept=".txt,.md" className="hidden" onChange={FileReader.readAsArrayBuffer→decodeTextFile→setText}>` + `<label htmlFor="imitation-sample-file" className 含 border-dashed cursor-pointer>点击选择本地 txt / md 文件（自动识别 UTF-8 / GBK 编码）</label>`；`import { decodeTextFile } from './NewBookPage'`（沿 StyleProfilesSection.tsx:10 先例）。aria-label 无需新加（input 由 label htmlFor 绑定）。

**步骤：**
- [ ] 测试先红：仿 SettingsImportPanel.test.tsx 既有文件选择用例形态——render→取 `#imitation-sample-file`→fireEvent.change 注入 File（UTF-8 内容 ≥200 字中性文本）→断言 aria-label「仿写样本」textarea value 含注入内容；另加一条 label 文案存在断言。
- [ ] 组件实现转绿（只加块，不动 analyze 前置校验）。
- [ ] 验收：定向 ImitationProfilesSection.test.tsx→web 全量→web build→typecheck→lint；GUI 未验证（owner 真实测试）。

## 任务 3：装机数据目录搬安装目录（卡3，主模型亲执；critic 评议后定稿执行）

**文件：** Modify `apps/desktop/src-tauri/src/main.rs`（release 分支 :64-93）；必要时 Modify NSIS 模板 `apps/desktop/src-tauri/nsis/inkforge-installer.nsi`（升级不清 $INSTDIR 数据、卸载器对 data\ 处置）。

**设计终稿（critic 评议 DEC-2026-1123-01 附属：3 硬修正全采纳）：**
- **硬性前置**：动 owner 真实数据前整目录 zip 备份 `%APPDATA%\dev.inkforge.app`（沿 DEC-2026-1117-05 VACUUM 快照先例，一行成本换灾备）。
- 新数据根 new_root = current_exe 目录\data\，扁平放 config.json/inkforge.env/landing-words.txt/inkforge.db(+ -wal/-shm)/backups/exports/imports/pid/lock。
- 抽纯函数 `choose_data_root(exe_dir: &Path, legacy_dir: &Path) -> (PathBuf, Vec<String> notes)`：
  1. new_root create_dir_all+试写（试写残留回退前删除）；不可写→回退 legacy_dir 并**落日志文件**（windows_subsystem=windows 下 eprintln 无控制台，critic 硬修正①）。
  2. 迁移判定：new_root 缺 `.inkforge-data-migrated` 且 legacy 有内容且 **legacy 侧无 `.inkforge-data-migrated-to` 互锁标记**（critic 硬修正②，堵「换目录重装二次迁移拷陈旧库」）→ 递归拷贝 legacy→new_root 扁平化（legacy\data\* 并入根层）；**拷贝排除** service.pid/worker.lock/worker.pid/*.stale/标记文件/试写残留/日志文件（硬修正③），**必含** inkforge.db-wal/-shm（WAL 未 checkpoint 事务不丢）；目标已存在跳过=半拷崩溃幂等续跑。
  3. 成功后：new_root 标记用 **create_new(O_EXCL)** 原子写（挡双开竞态）+ legacy 侧写互锁标记（记目标路径）。legacy 已有互锁标记而 new_root 空=全新初始化，不拷贝并留痕「数据已迁至 <路径>」。旧目录永不删除。
- 注入行 :68/:85-87 改指所选根（landing-words.txt/config.json 同级、INKFORGE_DATA_DIR=所选根、env_file 同根）。
- 迁移在 spawn 分支内（health 未命中才走到）；**health 命中跳过 spawn 时留痕**「旧服务占用端口，数据迁移重启后生效」写日志文件（critic f3：孤儿 sidecar 场景迁移被静默跳过）。日志文件名 `inkforge-shell.log`，落所选根（回退时落 legacy 根）。
- 便携语义钉入决策日志：exe 旁 data\ = portable 默认，复制 exe 别处运行=数据分叉（产品语义，明示）。
- NSIS 模板：现核实**无需改动即保升级不抹 data\**（无 RMDir /r "$INSTDIR"；:9641 非递归）。两件事：a) 卸载勾选语义按 owner 拍板处理（见开放项）；b) 模板=冻结快照（nsis/README.md），「$INSTDIR\data 禁删」写成显式 Inkforge\* 注释块并入 README 重放清单（防未来基线重放抹数据）。
- 验收：`cargo test`（choose_data_root 六例：无 legacy 新建/有 legacy 扁平拷贝含 wal 排 pid/半拷续跑幂等/互锁标记命中不拷/不可写回退+日志落盘/标记已存在不重拷——std temp_dir 手造夹具，不加新依赖）+ `cargo check` + clippy 零新增；真卸载双态与换目录二次安装演练随下次打包（owner 真实测试点位）。

## 任务 4：dev 词表兜底改仓库 data（卡4，派 hy4）

**文件：** Modify `apps/server/src/quality/landing-words.ts`、`apps/server/src/http/routes.ts`（GET/PUT 两处改调 ensure）、Test Modify `apps/server/test/quality/landing-words.test.ts`、`apps/server/test/http/landing-words.test.ts`（如需）。

**钉值：**
- `landingWordsUserPath(opts?: { home?: string; env?: string | undefined; dataDir?: string | undefined }): string`——env 优先不变；兜底=`path.resolve(opts?.dataDir ?? process.env.INKFORGE_DATA_DIR ?? 'data', 'landing-words.txt')`（dev server/worker cwd=apps/server → 落 `apps/server/data/`，与库同目录、仓库内）。
- 新增 `ensureLandingWordsUserFile(opts?): string`——p=landingWordsUserPath(opts)；p 缺失且 legacy=`path.join(home ?? os.homedir(), '.inkforge', 'landing-words.txt')` 存在且 legacy!==p → mkdirSync+copyFileSync(legacy→p)（吞错不抛）；返回 p。旧文件保留不删。
- `resolveLandingWordsPath` ① 步改调 ensureLandingWordsUserFile（同 opts 透传 home/userEnv/dataDir）；②③ 不动。
- routes.ts GET :1436-1441 / PUT :1443-1459 直调 landingWordsUserPath 处改调 ensureLandingWordsUserFile（GET 展示迁移后新路径）。
- 注释更新：DEC 引用改 DEC-2026-1123-01（dev 兜底=dataDir 相对；装机仍由壳 env 注入，位置见任务 3）。

**步骤：**
- [ ] landing-words.test.ts 先红/改钉：兜底例改钉 dataDir 注入=tmp 下 `data/landing-words.txt`；未注入例断言 `path.resolve('data','landing-words.txt')` 形态；新例①legacy 存在+新位缺失→ensure 后新位存在内容同 legacy、返回新位；②新位已存在→ensure 不覆盖；③无 legacy→ensure 无副作用；④env 已设→legacy 即使存在也不触发拷贝。
- [ ] 实现转绿；http 用例 userEnv 注入形态不变应零改动（若钉了旧兜底路径文案按新钉值更新）。
- [ ] 验收：定向两测试文件→server 全量→typecheck→lint；基线不减。

## 范围 fence

- RULES 行/DIM 特色词汇维的人名引用不处理（风格性引用，污染面小，拍板记录在案）。
- dev config.json 兜底（settings.ts:19 ~/.inkforge）不动，挂 backlog（同类问题，本轮 owner 反馈仅词表）。
- 存量已污染术语表=UI 重蒸消化，不写迁移代码。
- 卸载器是否连带删 $INSTDIR\data\ 属发版拍板项，本轮只保证「升级不抹数据」。
