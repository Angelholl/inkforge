# 卡：dev 词表兜底改仓库 data 目录 + 旧文件 ensure 迁移拷贝

以下命令均在项目根目录执行（相对路径）。

> 派卡前置：无（与卡1/卡2 无文件交集）。非禁入卡型（路径解析兜底+两行路由调用点替换），走 hy4。执行中读 >4KB 文件用 pointer 工具，禁整读。

## 根因/目标

owner 反馈「落地分级词表保存位置应在项目文件夹内，不默认在 C 盘」。dev 态词表兜底现拼 `~/.inkforge/landing-words.txt`（`apps/server/src/quality/landing-words.ts:18-23`，C 盘），而 dev 数据库/备份已在仓库 `apps/server/data/`——两处不一致。装机版由壳 env 注入不受本卡影响（其位置由另一卡改数据目录整体搬迁解决）。本卡=dev 兜底改 `INKFORGE_DATA_DIR` 相对目录（默认 `data`，cwd 解析沿 config.ts:87 同口径），并对存量旧文件做只拷不删的 ensure 迁移。计划真值=docs/plans/2026-11-23-three-feedbacks.md **任务 4**。

## 改动文件（卡外改动即超范围）

- Modify：`apps/server/src/quality/landing-words.ts`（landingWordsUserPath :18-23、新增 ensureLandingWordsUserFile、resolveLandingWordsPath :83-93 ①步、:15-17 注释）
- Modify：`apps/server/src/http/routes.ts`（GET /api/landing-words :1436-1441 与 PUT :1443-1459 中直调 landingWordsUserPath 处改调 ensureLandingWordsUserFile，各一行级）
- Test Modify：`apps/server/test/quality/landing-words.test.ts`；`apps/server/test/http/landing-words.test.ts`（仅当钉了旧兜底路径文案才改钉）

## 钉值

1. `landingWordsUserPath(opts?: { home?: string; env?: string | undefined; dataDir?: string | undefined }): string`——env 优先分支不动；兜底改 `path.resolve(opts?.dataDir ?? process.env.INKFORGE_DATA_DIR ?? 'data', 'landing-words.txt')`。
2. 新增导出 `ensureLandingWordsUserFile(opts?: { home?: string; env?: string | undefined; dataDir?: string | undefined }): string`：`p = landingWordsUserPath(opts)`；try 内——p 不存在（existsSync false）且 legacy=`path.join(opts?.home ?? os.homedir(), '.inkforge', 'landing-words.txt')` 存在且 `legacy !== p` → `fs.mkdirSync(path.dirname(p), { recursive: true })` + `fs.copyFileSync(legacy, p)`；整个 try catch 吞错不抛；返回 p。旧文件保留不删。
3. `resolveLandingWordsPath`：① 步由 `landingWordsUserPath({...})` 改 `ensureLandingWordsUserFile({ home: opts?.home, userEnv→env 透传同形, dataDir: opts?.dataDir })`——opts 类型同步加 `dataDir?: string | undefined`；②③ 步与语义不动。
4. routes.ts 两处调用点：仅把函数名 landingWordsUserPath→ensureLandingWordsUserFile（import 处同步），GET 返回的 `path` 字段即迁移后新位。
5. 文件头 :15-17 注释改写：DEC 引用增补 `DEC-2026-1123-01（dev 兜底改 dataDir 相对目录，旧 ~/.inkforge 文件 ensure 只拷不删）`；装机壳注入 env 优先的事实保留。

## 先红后绿

landing-words.test.ts 先红/改钉（tmpdir 夹具，全部显式注入 opts 防真实盘触碰——L-20261104-02 三层隔离）：
- 兜底例改钉：`landingWordsUserPath({ dataDir: '<tmp>/x' })` → `<tmp>/x/landing-words.txt`；未注入例断言 `path.isAbsolute` 且以 `data/landing-words.txt` 结尾（process.env.INKFORGE_DATA_DIR 未设时）。
- 新例①：tmp 造 legacy 文件（内容中性词表文本）+新位缺失 → `ensureLandingWordsUserFile({ home: tmpHome, dataDir: tmpData })` 返回新位、新位文件存在且内容与 legacy 逐字相等、legacy 仍在。
- 新例②：新位已有不同内容 → ensure 不覆盖（返回新位、内容不变）。
- 新例③：legacy 不存在 → ensure 无副作用（新位不产生文件）。
- 新例④：env（userEnv）已设指向 tmp 文件 → legacy 即使存在也不拷贝（env 分支零迁移）。
- resolveLandingWordsPath 既有用例：注入 dataDir 后 ① 步语义不变（用户文件压 env、env 缺失回落默认等），按新形参更新调用面即可，断言不放松。
实现转绿。http/landing-words.test.ts：userEnv 注入形态不变应零改动；若失败仅因钉了旧兜底路径文案，按新钉值改钉。

## 验收命令

```bash
pnpm -F @inkforge/server exec vitest run test/quality/landing-words.test.ts test/http/landing-words.test.ts
pnpm -F @inkforge/server test
pnpm typecheck
pnpm lint
```

全绿判据：定向两文件绿；server 全量 **≥495 不减**（新用例净增；若卡1先合入则以合入后实际数为基线，只增不减）；typecheck 全 workspace 0 错；lint 零输出。

## 约束

- 1301 纪律：禁读 `apps/server/data/**` 与真实词表内容；夹具一律自造中性词（玉佩/窗棂系）。
- 测试不得读写真实 `~/.inkforge` 与真实 `data/`（home/dataDir 全显式注入）。
- 装载器护栏语义不动（未知节/空表 fail-open）；l0.ts 零改动。
- 提交信息中文，`fix(server):` 前缀，正文 verify: 验证结果 + `Refs: DEC-2026-1123-01`；只 commit 不 push；永不 --no-verify；永不 git add -A，逐文件 add（含本卡面）。
- 现场冲突即停待裁决。
