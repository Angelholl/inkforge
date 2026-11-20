# 卡：风格档案「查看细节」——详情端点 + 前端只读面板

以下命令均在项目根目录执行（相对路径）。

## 根因/目标

owner 反馈（DEC-2026-1120-08）：蒸馏完成的风格档案无法再次打开看细节。现状=档案卡片只有名称/版本/指标与 版本/重蒸/删除 三按钮；`GET /api/style-profiles` 列表只回元数据，且**不存在** `GET /api/style-profiles/:id` 详情端点；创建时的编辑表单只对新蒸馏有效。目标=每张档案卡新增「查看」开关，展开只读面板展示全部分析细节。

## 改动文件

1. `apps/server/src/http/routes.ts`：新增 `GET /api/style-profiles/:id`——404 不存在；命中回完整 dto（现有 list dto 基础上加 `analysis`（dims/axes/rules/terms/freqTerms）、`evaluation`、`sourcePath`；从 style_profiles 行读 rules_json 反序列化，freqTerms 旧档案 `?? []` 兜底）。落在既有 style-profiles 路由组内、紧跟 `GET /api/style-profiles` 之后；注意路由注册顺序不得让 `:id` 吞掉 `distill/jobs/versions` 等静态段（Fastify 静态优先，通常安全，但验证一次）
2. `packages/shared/src/api.ts`：如 dto 复用现有 `StyleProfileDto` 则补可选字段；新建 `StyleProfileDetailDto = StyleProfileDto & { analysis: StyleAnalysisDto; evaluation?: SelfEvalItem[] }`
3. `apps/web/src/api/client.ts`：`getStyleProfile: (id) => req<StyleProfileDetailDto>('/api/style-profiles/${id}')`
4. `apps/web/src/pages/StyleProfilesSection.tsx`：每卡加「查看/收起」quiet 按钮（state `openDetail: string | null`，与 openVersions 同型互斥或独立均可）；展开时懒加载 `getStyleProfile(p.id)`（loading 态），只读渲染：七维（维度名+描述）、六轴（轴名+分数）、规则列表、术语表（term：note 逐行）、高频词（同格式；空数组显示「（无）」）、自评（evaluation 有则列 SCORE/REASON，无则略）；失败显示人话错误+重试按钮
5. 测试：
   - `apps/server/test/http/` 新增或就近补：详情端点 200 含 analysis 全字段 / 404 / freqTerms 旧档案兜底（rules_json 无 freqTerms 键的行 → []）
   - `StyleProfilesSection.test.tsx`：点查看→mock getStyleProfile→断言七维/术语/高频词渲染；再次点收起；加载失败显示错误

## 验收命令

```bash
pnpm --filter @inkforge/server exec tsc --noEmit
pnpm --filter @inkforge/web exec tsc --noEmit
pnpm --filter @inkforge/server test
pnpm --filter @inkforge/web test
pnpm exec knip
```

全绿且基线只增不减。

## 约束

- 只读查看，不做既有档案的编辑/更新 API（档案不可变语义不变，改细节走重蒸新版本）。
- 只 commit 不 push；Conventional 前缀+中文提交信息，正文 verify+Refs: DEC-2026-1120-08；注明「GUI 未验证（owner 真实测试）」。
- 禁 `git add -A`；逐文件 add（含本卡面）。
- 现场与卡面冲突即停待裁决。

## 执行日志（2026-11-20）

- 改动：routes.ts（新增 GET /api/style-profiles/:id）、shared api.ts（StyleProfileDetailDto）、client.ts（getStyleProfile）、StyleProfilesSection.tsx（查看/收起+失败重试）、server style.test.ts（3 例）、web StyleProfilesSection.test.tsx（2 例）。
- verify：server/web tsc --noEmit 绿；server 392/392、web 139/139 绿；knip 绿（基线只增不减）。
- 备注：evaluation 未整表落库，由 metrics selfScore/selfReason 还原为单项数组；重试按钮走独立 retryDetail（不经 toggle，避免被当成收起）。
