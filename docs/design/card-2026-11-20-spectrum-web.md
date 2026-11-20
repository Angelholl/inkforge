# 卡 B（web）：人物光谱 UI——client API/档案区/书详情绑定

以下命令均在项目根目录执行（相对路径）。

## 背景

DEC-2026-1120-09 卡 A（server）已落地五端点：`GET /api/spectrum-profiles`、`POST /api/spectrum-profiles/analyze`、`POST /api/spectrum-profiles`（save）、`DELETE /api/spectrum-profiles/:id`（自动解绑）、`PUT /api/books/:bookId/spectrum-profile`（body {profileId|null}）。先读 server 侧 routes.ts 光谱段与 schemas 确认请求/响应形状再动手。

## 参照实现（动手前完整读）

- `apps/web/src/pages/PlotProfilesSection.tsx` 及其测试 —— 蒸馏入口/列表/删除/绑定交互的镜像基准
- `apps/web/src/api/client.ts` plot 相关方法 —— API 封装形态
- `apps/web/src/pages/BookDetailPage.tsx` plot 绑定区（单选绑定 plotProfileId 的 UI 与保存链路）

## 改动内容

1. `apps/web/src/api/client.ts` + `packages/shared/src/api.ts`：镜像 plot 增 `listSpectrumProfiles / analyzeSpectrum / saveSpectrumProfile / deleteSpectrumProfile / bindSpectrumProfile` 与 dto（SpectrumProfileDto：id/name/version/structure/createdAt）
2. 新建 `apps/web/src/pages/SpectrumProfilesSection.tsx`：镜像 PlotProfilesSection——蒸馏表单（来源文本+名称）、档案列表（名称/版本/创建时间/条数 + 删除两步确认）、无版本/重蒸功能（server 未提供就不做）
3. 挂载点：StyleProfilesSection/PlotProfilesSection 所在页面（grep 确认挂载处），在 plot 区块后并列挂 SpectrumProfilesSection
4. `apps/web/src/pages/BookDetailPage.tsx`：书详情绑定区镜像 plotProfileId 的单选绑定交互，增「人物光谱」下拉/单选（含「不绑定」选项），保存走 bindSpectrumProfile
5. 测试：
   - `SpectrumProfilesSection.test.tsx`（镜像 plot 测试结构）：蒸馏提交、列表渲染、删除
   - `BookDetailPage.test.tsx` 补：光谱绑定保存调用与解绑（null）

## 验收命令

```bash
pnpm --filter @inkforge/web exec tsc --noEmit
pnpm --filter @inkforge/web test
pnpm --filter @inkforge/server test
pnpm exec knip
```

全绿且基线只增不减（web 139+新增）。

## 约束

- 只 commit 不 push；Conventional 前缀+中文提交信息，正文 verify+Refs: DEC-2026-1120-09；注明「GUI 未验证（owner 真实测试）」。
- 禁 `git add -A`；逐文件 add（含本卡面）。
- 后端零改动；发现接口形状与预期不符即停待裁决。
- 现场与卡面冲突即停待裁决。
