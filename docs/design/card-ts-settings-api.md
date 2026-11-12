# 卡 T-S：设置存储 + GET/PUT /api/settings（以下命令均在项目根目录执行）

## 根因
配置唯一来源是进程 env（`.env` 仅 dev 脚本加载），安装包内无 env 文件来源且 GUI 无设置页（README 已承诺"在设置中配置端点"）。owner 拍板增补设置能力（DEC-2026-1112-02）：配置落 JSON 文件，server 启动时以文件覆盖 env。

## 改动文件
- 新增 `apps/server/src/settings.ts`：
  - `export function configFilePath(): string` → `process.env.INKFORGE_CONFIG_FILE ?? path.join(os.homedir(), '.inkforge', 'config.json')`；
  - `export const settingsSchema = z.object({ STRATA_BASE_URL: z.string().min(1).optional(), STRATA_API_KEY: z.string().min(1).optional(), STRATA_MODEL: z.string().min(1).optional(), INKFORGE_CLOUD_BASE_URL: z.string().optional(), INKFORGE_CLOUD_API_KEY: z.string().optional(), INKFORGE_CLOUD_MODEL: z.string().optional(), INKFORGE_MOCK: z.enum(['0','1']).optional() })`（键名与 env 同名，合并零翻译）；
  - `export function readSettingsFile(p = configFilePath()): Record<string, string>`：文件缺失或 JSON 非法 → 返回 `{}`（容错不抛）；parse 后过 settingsSchema，剥离 undefined；
  - `export function writeSettingsFile(obj: Record<string, string>, p = configFilePath()): void`：`fs.mkdirSync(dirname,{recursive:true})` + 原子写（写 `<p>.tmp` 后 `fs.renameSync` 覆盖）。
- 修改 `apps/server/src/config.ts` `loadConfig`：在 `envSchema.parse(env)` 前合并——`const merged = { ...env, ...readSettingsFile() }`（文件非空字段覆盖 env），后续用 merged。dev 态（默认路径无文件、INKFORGE_CONFIG_FILE 未设）行为与现状完全一致。
- 修改 `apps/server/src/http/routes.ts`：仿既有路由风格新增两条（挂载位置随既有 /api 路由组）：
  - `GET /api/settings` → 200 `{ strataBaseUrl, strataModel, hasApiKey, cloudBaseUrl, cloudModel, hasCloudApiKey, mock, configPath }`（值来自 readSettingsFile()；`hasApiKey=Boolean(STRATA_API_KEY)`，**不回显 Key 明文**；mock 同理布尔；configPath=configFilePath()）；
  - `PUT /api/settings`：body zod 校验 `{ strataBaseUrl?, strataApiKey?, strataModel?, cloudBaseUrl?, cloudApiKey?, cloudModel?, mock? }`（全部 optional string，mock 为 boolean）→ 映射为 env 键名对象（mock→'1'/'0'；**空串字段视为删除该键**）→ 与 readSettingsFile() 现值 merge → writeSettingsFile → 200 `{ saved: true, restartRequired: true }`。
- 新增 `apps/server/test/http/settings.test.ts`：仿既有 http 测试的 app 构建方式。用 `INKFORGE_CONFIG_FILE` 指向临时目录文件（beforeEach 建临时目录、afterEach 清理）。用例：① PUT 全字段后 GET 返回对应值且 hasApiKey=true、文件内容含 STRATA_API_KEY；② PUT 空串字段后 GET hasApiKey=false；③ 无文件时 GET 全空且 hasApiKey=false；④ loadConfig 在仅文件提供 STRATA_* 三项（env 缺省占位 ''）时不抛且 providers.local.baseURL 取文件值（loadConfig(env) 传 `INKFORGE_CONFIG_FILE` 指向该文件）。

## 验收命令
```bash
pnpm --filter @inkforge/server exec tsc --noEmit   # 0 error
pnpm --filter @inkforge/server test                # 全绿，基线只增不减
pnpm -w lint                                       # 0 error
```

## 约束
- 只许改/增上述文件；既有路由与用例不得改动；超范围即停；不 commit。
- GET 任何响应不得包含 API Key 明文。
- 既有用例全绿是硬门；新文件读写全部走传入路径参数以便测试注入。
