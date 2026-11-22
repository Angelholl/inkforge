# 落地词表外置化 实现计划

**目标：** 项目默认词表中性空模板化，词表迁移为用户可编辑数据层（`~/.inkforge/landing-words.txt` + GET/PUT API + 设置页编辑区块），装机包补齐词表文件。
**架构：** 服务层新增 `apps/server/src/quality/landing-words.ts`（resolve/parse/validate/read/write 五函数，纯函数为主便于测试）；`chapter.ts` 模块级常量改为按 run 调 `resolveLandingWordsPath()`；`l0.ts` loadLandingWords 内部复用新 parse（签名不变）；路由沿 `/api/settings/quality` 先例挂载；UI 沿 SettingsPage 质量区块形态追加。
**规格：** docs/decision-log.md **DEC-2026-1122-02**（含未决核查①②与修正 R1–R7）；交接文档 C:\Users\57850\AppData\Local\Temp\inkforge-handoff-landing-words-20261122.md。

## 全局约束

- 测试基线 **619**（server 466+web 151+shared 2）只增不减。
- 每任务验收命令**必含 typecheck**（L-20261113-01）；全链=lint→定向→全量→typecheck→knip。
- 1301 纪律：不读 `apps/server/config/quality/landing-words.default.txt` 旧内容与 `apps/server/data/**`；词表语义一律抽象（[H]=插入交合类、[L]=口类、[调情]=手类不入库）；测试夹具自造中性词（玉佩/窗棂系，l0.test LW 先例）。
- 用户文件路径=**A 案（owner 2026-11-22 呈批裁决：以普通用户为准，本机装机版仅为实测工具）**：沿 config.json 先例形态（settings.ts:19）——`INKFORGE_LANDING_WORDS_USER_PATH` env 优先、`~/.inkforge/landing-words.txt` 兜底；装机壳 release 分支注入 `%APPDATA%\dev.inkforge.app\landing-words.txt`（普通用户词表与库/config.json 同目录，数据归一处）；dev 走主目录兜底。解析序=用户路径存在 > `INKFORGE_LANDING_WORDS_PATH` env（且指向文件存在）> 仓库默认。一次性迁移=主目录与装机 cfg_dir 各拷一份（owner 两环境实测均吃到存量）。
- 词表装载语义不动：空表/缺失=fail-open 放行；未知 `[X]` 节=识别不入库；`loadLandingWords(path)` 签名不变。
- PUT 校验不设节头枚举白名单（R4）；生效=下一次生成 run（按 run 装载，非热切）。
- 范围 fence（R7）：不做逐书词表、不做 chip 网格、grade 枚举与落地格机制不动、上批重构 backlog 三项不并入。

## 任务 1：服务层 landing-words.ts + 接线改造

**文件：** Create `apps/server/src/quality/landing-words.ts`；Modify `apps/server/src/quality/l0.ts`（loadLandingWords 内部复用 parse，签名不变）；Modify `apps/server/src/pipeline/chapter.ts`（删 :30-32 常量 LANDING_WORDS_PATH，:93 改 `loadLandingWords(resolveLandingWordsPath())`）；Test Create `apps/server/test/quality/landing-words.test.ts`。

**接口（Produces，后续任务依赖）：**
```ts
export function landingWordsUserPath(opts?: { home?: string; env?: string | undefined }): string;
// = opts?.env（缺省取 process.env.INKFORGE_LANDING_WORDS_USER_PATH） ?? <home=opts?.home ?? os.homedir()>/.inkforge/landing-words.txt（沿 configFilePath settings.ts:19 形态）
export interface ParsedLandingWords { h: string[]; l: string[]; sections: string[]; } // sections=识别到的节头大写原名列表（含 H/L）
export function parseLandingWordsText(text: string): ParsedLandingWords;             // text.split(/\r?\n/)（沿 l0.ts:48 容 CRLF）；每行 trim；'' 与 '#' 开头跳过；节头 /^\[([^\]]+)\]$/ 切换 cur（H→h，L→l，其它→null 仍记入 sections）；词行 cur 非 null 且不重复才 push
export function loadLandingWords(path: string): { h: string[]; l: string[] };        // l0.ts 既有导出，内部改调 parseLandingWordsText（丢弃 sections）；缺失/不可读→空表（现状）
export type LandingWordsValidation = { ok: true } | { ok: false; error: string };
export function validateLandingWordsText(text: string): LandingWordsValidation;      // ① Buffer.byteLength(text,'utf8')>8192 → '词表超过 8KB 上限'；② 逐行：行首 '[' 开头但不匹配 /^\[[^\]]+\]$/ → `第 N 行节头格式非法`；③ 其余行不校验（空行/注释/任意词行均合法）
export function readLandingWordsUserFile(p: string = landingWordsUserPath()): string;   // 缺失/不可读→''（容错不抛，沿 readSettingsFile 先例）
export function writeLandingWordsUserFile(text: string, p: string = landingWordsUserPath()): void; // mkdirSync(dirname,{recursive:true})+tmp+rename 原子写（沿 writeSettingsFile :45-50 先例）
export function resolveLandingWordsPath(opts?: { home?: string; env?: string | undefined; userEnv?: string | undefined }): string;
// 语义：① userPath=landingWordsUserPath({home, env:userEnv})；existsSync(userPath) → userPath
//       ② 否则 opts?.env（缺省 process.env.INKFORGE_LANDING_WORDS_PATH）已设且 existsSync → env（env 指向缺失→回落，防锁死空表）
//       ③ 否则仓库默认=path.join(path.dirname(fileURLToPath(import.meta.url)), '../../config/quality/landing-words.default.txt')（与 chapter.ts:32 同式，l0.ts 位于 src/quality/ 回源同样成立）
```

**步骤：**
- [ ] 写 `landing-words.test.ts`：resolveLandingWordsPath 四例（① tmpdir 造用户文件（userEnv 指向）→压过 env INKFORGE_LANDING_WORDS_PATH；② 无用户文件+env 指向 tmpdir 文件→env；③ env 未设且无用户文件→默认路径字符串以 `landing-words.default.txt` 结尾；④ env 指向不存在路径→回落默认）；landingWordsUserPath 一例（userEnv 缺省注入 tmp 路径→返回之；未注入→以 `.inkforge/landing-words.txt` 结尾）；parseLandingWordsText 五例（两节解析/未知节不入池但入 sections/注释空行跳过/重复词去重/无节头词行忽略）；validateLandingWordsText 四例（8193 字节拒/8192 过/`[H` 行拒+`[调情]` 过/空串过=清空合法）；read/write roundtrip（tmpdir，write 自动 mkdir 子目录）——先红
- [ ] 实现 landing-words.ts 五函数——绿
- [ ] l0.ts：loadLandingWords 函数体改 `const parsed = parseLandingWordsText(fs.readFileSync(path,'utf8'))` 形态（try/catch 缺失回空表语义原样保留），import 自 './landing-words'
- [ ] chapter.ts：删 :30-32 常量；:93 改 `const landingWords = loadLandingWords(resolveLandingWordsPath());`；CLIQUES_PATH(:28) 不动
- [ ] 验收：`pnpm --filter @inkforge/server test -- landing-words` 绿 + `pnpm --filter @inkforge/server exec tsc --noEmit`（或仓库 typecheck 等价命令）0 错 + `pnpm --filter @inkforge/server test -- quality/l0` 绿

## 任务 2：一次性迁移 + 默认词表中性化 + 测试改钉

**文件：** Modify `apps/server/config/quality/landing-words.default.txt`（整体覆盖为中性模板）；Modify `apps/server/test/quality/l0.test.ts`（⑥ :235-241、⑦ :243-255）；一次性迁移=文件拷贝（不进代码）。

**中性模板内容**（Write 全量覆盖，不读旧文）：
```
# 落地分级词表（出厂默认模板）：本项目默认不带词表，词表属用户数据层（DEC-2026-1122-02）。
# 用户词表位置：~/.inkforge/landing-words.txt（设置页「落地分级词表」区块可视化编辑）；
# 本文件仅作兜底，升级可能覆盖，请勿在此积累自定义词。
# 格式：[H]/[L] 分节，每行一词；# 注释与空行跳过；其它 [X] 分节=识别但不入库（可作自定义档）。
# 语义：H 档判定=L 词∪H 词（AND 层命中才拦）；空表=闸门不判定（fail-open 放行）。
# 生效：下一次生成 run 时装载；进行中 run 不受影响。

[H]

[L]
```

**步骤：**
- [ ] 一次性迁移（清空默认文件**之前**，两份）：① `mkdir -p ~/.inkforge && cp apps/server/config/quality/landing-words.default.txt ~/.inkforge/landing-words.txt`（dev 版用）；② `cp apps/server/config/quality/landing-words.default.txt "$APPDATA/dev.inkforge.app/landing-words.txt"`（装机版用，壳注入 userEnv 指向；目录=正式版数据目录已存在）；两份各核对目标字节数=源字节数（owner 私货不丢）
- [ ] Write 覆盖默认文件为上述中性模板（[H]/[L] 两空节无词行）
- [ ] l0.test ⑥改钉：默认文件断言改为空表语义 `expect(lw).toEqual({ h: [], l: [] })`（留痕注释=DEC-2026-1122-02 出厂默认中性化）；新增夹具断言补「两节解析」能力（mkdtemp 写 `[H]\n玉佩光\n[L]\n窗棂摇\n` → h/l 各 1）——「默认非空」能力测试由夹具承接，能力不丢
- [ ] l0.test ⑦改钉：删 244-249 吃默认文件断言段（[调情] 节已随清空消失）；保留 250-254 mkdtemp 夹具段原样（乙丙不入池断言仍在）
- [ ] 验收：`pnpm --filter @inkforge/server test -- quality/l0` 绿 + server 全量复跑（chapter/continue/queue 集成吃真实词表→空表更松；若出现依赖默认词表命中的断言失败，按 mandate.test 先例改夹具自造词表注入，断言语义不改）+ typecheck 0 错

## 任务 3：GET/PUT API

**文件：** Modify `apps/server/src/http/routes.ts`（:1430 quality 路由块后追加）；Modify `apps/server/src/http/schemas.ts`（PUT schema）；Test Create `apps/server/test/http/landing-words.test.ts`（若 http 测试先例文件形态为独立 inject 构建则沿之；先例查找：`ls apps/server/test/http/`）。

**接口（Consumes 任务 1）：**
```ts
// GET /api/landing-words → 200 {text, counts:{h:number,l:number}, sections:string[], path:string}
//   text=读 resolveLandingWordsPath() 指向文件内容（缺失→''）——UI 所见即当前生效词表；path=resolve 结果
// PUT /api/landing-words body {text:string}（zod schema landingWordsPutSchema = z.object({text: z.string()})）
//   validateLandingWordsText !ok → reply.code(400).send({error})；ok → writeLandingWordsUserFile(text)（try/catch 写失败 reply.code(500).send({error:'词表写入失败'})）
//   → 200 {saved:true, counts:{h,l}, sections}（counts/sections=parseLandingWordsText(text)）
```

**步骤：**
- [ ] 路由测试先红（env 注入形态：测试内 `process.env.INKFORGE_LANDING_WORDS_USER_PATH` 指向 tmpdir 文件， afterEach 清理）：GET 无用户文件+无 env → text='' + counts 全 0 + path 以 default.txt 结尾；GET 设 userEnv 指向 tmpdir 文件（预写 `[H]\n玉佩光\n`）→ GET text 命中+counts.h=1+path=userEnv 值 + PUT 合法写→200 counts 正确且 userEnv 文件落盘 + PUT 超 8KB→400 + PUT `[H` 非法节头→400 error 含「节头」
- [ ] schemas.ts 加 landingWordsPutSchema；routes.ts 挂 GET/PUT（import 任务 1 五函数）
- [ ] 验收：`pnpm --filter @inkforge/server test -- http/landing-words` 绿 + 定向 routes 既有测试绿 + typecheck 0 错

## 任务 4：设置页「落地分级词表」区块

**文件：** Modify `apps/web/src/pages/SettingsPage.tsx`（质量区块 :183 `</section>` 后追加）；Modify `apps/web/src/pages/SettingsPage.test.tsx`。

**形态（Consumes 任务 3 API）：**
- state：`lwText/lwCounts/lwSections/lwPath/lwMsg/lwSaving`；mount 时 `fetch(`${API_BASE}/api/landing-words`)` 载入（沿 :28 GET /api/settings 先例）
- 摘要行（text-xs text-muted）：`H 池 {counts.h} 词 · L 池 {counts.l} 词 · 其它节：{sections 过滤掉 H/L 后 join('、')||'无'}`；counts 全 0 → 追加「词表为空：落地闸门不判定（放行）」；固定说明行：「判定时 H 档命中=L 词∪H 词；保存后下一次生成 run 生效，进行中 run 不受影响。」+「生效文件：{path}」
- textarea：id=`settings-landing-words`，rows=10，className 沿页内输入先例，value=lwText
- 保存按钮：PUT，成功 `lwMsg='已保存：…（沿 :96 qualityMsg 文案风格）'` 并用响应 counts/sections 刷新摘要；失败 `lwMsg` 显 apiErrorText/400 error（text-danger 色沿 :185 error 先例）
- 区块标题：`<SectionHeader title="落地分级词表" size="lg" />`

**步骤：**
- [ ] 组件测试先红：mock GET → 摘要渲染「H 池 1 词 · L 池 2 词」；counts 全 0 → 「落地闸门不判定」文案出现；PUT 保存按钮点击 → fetch PUT 调用一次且成功文案渲染（沿该测试文件既有 mock fetch 形态）
- [ ] 实现区块——绿
- [ ] 验收：`pnpm --filter @inkforge/web test` 绿 + typecheck 0 错；**GUI 未验证（owner 真实测试）**，提交信息注明

## 任务 5：NSIS 模板补行 + 装机壳注入（装机一致性）

**文件：** Modify `apps/desktop/src-tauri/nsis/inkforge-installer.nsi`（安装段 ：1511 cliches File 行后补；卸载段：grep cliches 的 Delete 行定位后补）；Modify `apps/desktop/src-tauri/src/main.rs`（release 分支 ：84 后加一行 env 注入）。

**步骤：**
- [ ] 安装段 :1511 后插入：`    File /a "/oname=resources\server\config\quality\landing-words.default.txt" "I:\inkforge\apps\desktop\src-tauri\resources\server\config\quality\landing-words.default.txt"`（源文件已存在于 src-tauri resources 树；行内容与 cliches 行同构）
- [ ] 卸载段 cliches 对应 `Delete` 行后插入：`    Delete "\resources\server\config\quality\landing-words.default.txt"`（沿 :5383 migrations Delete 行形态）
- [ ] main.rs release 分支（:84 INKFORGE_LANDING_WORDS_PATH 注入行后）插入：`.env("INKFORGE_LANDING_WORDS_USER_PATH", cfg_dir.join("landing-words.txt").display().to_string())`（与 :86 INKFORGE_CONFIG_FILE 同取 cfg_dir；dev 分支不加，走主目录兜底）
- [ ] 验收：`grep -n "landing-words" apps/desktop/src-tauri/nsis/inkforge-installer.nsi` 两行各 1（安装 File+卸载 Delete）+ `grep -n "LANDING_WORDS_USER" apps/desktop/src-tauri/src/main.rs` 1 行；rust 编译验证尽力跑 `cargo check`（src-tauri 下；工具链不可用则留痕挂发版卡重验——MSVC 工具链事故先例），本批不发版，makensis 直编译挂账下批发版卡（release-022 静检硬门届时跑）

## 收口（主审亲执）

- [ ] 验证链全序：lint → 定向测试 → server+web+shared 全量（≥619 只增不减）→ typecheck → knip → diff 安全扫（秘密扫描零新增）
- [ ] push 前 code-review 两轴（本批必超 3 文件）
- [ ] 提交五步（Conventional+中文描述，正文 verify:+Refs: DEC-2026-1122-02）；执行者只 commit 不 push 的红线本批=主审亲执 commit+push；push 后 ls-remote 复核
- [ ] DEC-2026-1122-02 执行留痕补记（含 R1 呈批结果、一次性迁移完成、装机 env 有效化）
- [ ] GUI 未验证（owner 真实测试）点位清单进完成通知：①设置页词表区块 GET 渲染摘要与 path；②编辑+保存→重新生成 run 生效；③清空词表保存→「闸门不判定」提示；④非法输入（超 8KB/[H 行）→400 错误提示
