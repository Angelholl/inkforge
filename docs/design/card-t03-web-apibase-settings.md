# 卡 T-03：web 生产 API base 修复 + 设置页（以下命令均在项目根目录执行）

## 根因
① `apps/web/src/api/client.ts` 全部相对路径 `/api/...`（SSE 同），dev 靠 vite 代理；生产窗口源为 `tauri://localhost`（内嵌资源），相对 fetch 打不到 `127.0.0.1:8787`，生产态全接口必断。② GUI 无设置页，与 README 承诺不符；server 端 `GET/PUT /api/settings` 由并行卡 T-S 提供（本卡只按契约对接）。

## 改动文件
- `apps/web/src/api/client.ts`：
  - 顶部新增 `export function resolveApiBase(isDev: boolean): string { return isDev ? '' : 'http://127.0.0.1:8787'; }` 与模块级 `const API_BASE = resolveApiBase(import.meta.env.DEV);`
  - `req()` 内 fetch URL 改为 `` `${API_BASE}${url}` ``；`runEventsUrl()` 返回 `` `${API_BASE}/api/runs/${runId}/events` ``；其余相对 URL 用点逐个核对（grep `'/api/`）全部走 API_BASE。
- `apps/web/src/App.tsx` 约 :8：健康检查 `fetch('/api/health')` → `fetch(`${API_BASE}/api/health`)`（从 client.ts 导入 API_BASE）。
- 新增 `apps/web/src/api/client.test.ts`：`resolveApiBase(false)==='http://127.0.0.1:8787'`、`resolveApiBase(true)===''`（vitest，仿既有 web 测试风格）。
- 新增 `apps/web/src/pages/SettingsPage.tsx`：表单字段 本地端点地址 / API Key / 模型名 / mock 开关（checkbox）；挂载时 GET `/api/settings` 回填（hasApiKey=true 时 Key 输入框 placeholder 显示「已保存，留空保持不变」，注意响应无明文）；保存按钮 PUT `/api/settings`（Key 留空则不传该字段）→ 成功提示「已保存，重启应用后生效」；失败展示错误。样式随项目 Tailwind 既有风格（参考其他 pages）。
- `apps/web/src/App.tsx` 路由表加 `/settings` → SettingsPage，导航区加「设置」入口（随既有 nav 结构）。
- 新增 `apps/web/src/pages/SettingsPage.test.tsx`：仿既有页面测试风格——mock fetch：① 渲染出三个输入框与开关；② 填写并提交后 fetch 以 PUT 调用 `/api/settings` 且成功提示出现。

## 验收命令
```bash
pnpm --filter @inkforge/web exec tsc --noEmit      # 0 error
pnpm --filter @inkforge/web test                   # 全绿（新增用例计入基线）
pnpm --filter @inkforge/web build                  # 成功
grep -l "127.0.0.1:8787" apps/web/dist/assets/*.js # 命中（生产 bundle 含绝对地址）
pnpm -w lint                                       # 0 error
```

## 约束
- GUI 变更卡：只许改/增上述文件；既有页面/组件不得动；超范围即停；不 commit。
- dev 态（vite 代理）行为不得回退：API_BASE 在 DEV 为 ''。
- 服务端 /api/settings 若未就绪（并行开发），页面须容错（GET 失败显示「服务未连接」而不崩）。
