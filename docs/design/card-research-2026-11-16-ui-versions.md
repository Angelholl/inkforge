# 调研卡 R1：按钮样式一致性与版本删除通路现状（2026-11-16）

## ① 调研问题与范围

**背景（owner 2026-11-16 反馈原文）**：
- 反馈1「各种按钮不统一，部分没有底框」——阶段 D 已落地全页 token 化与公共组件（commit bef65ec「设计 token 表/rail 壳/公共组件/详情页控制台/全页 token 化」），但观感仍不统一，说明存在未走公共组件的按钮。
- 反馈3「生成的多版本一直存在没办法删除」——需盘点哪些「版本」在 API 层与 UI 层完全没有删除通路。

**Q1 按钮清点**（范围仅 apps/web/src，不动 server）：
1. 读 apps/web/src/components/ui.tsx，枚举公共 Button 组件定义的全部变体（变体名+完整 Tailwind class 串，逐一标注有无 border、有无 bg-* 底色）。
2. 遍历 apps/web/src/pages 全部 .tsx 与 App.tsx，枚举每一处按钮渲染点，按三类归类：(a) 走 ui.tsx 公共组件（注明变体）；(b) 裸 `<button>` + 内联 class（抄完整 class 串）；(c) 其他形态（input[type=submit]/label 伪装按钮等）。
3. 每处记录：file:line、按钮文案、有无边框、有无底色。
4. 结论三张清单：①未走公共组件的裸按钮清单；②无边框且无底色的裸文本式按钮清单；③同类按钮（主操作/次操作/危险操作）之间样式不一致的对照表（按文案归类，如两处「删除」样式不同）。

**Q2 版本删除通路现状**（范围 apps/server/src + apps/web/src/pages）：
1. 章节正文版本：chapter_versions 的 DDL 位置（apps/server/src/db 迁移目录）；apps/server/src/pipeline 写入点；apps/server/src/http 路由面是否存在删除单版本/清理旧版本的端点（关键词：version、router.delete、DELETE）；apps/web/src/pages/ChapterReaderPage.tsx 版本链 UI 有无删除按钮；删书级联（端点文案「DELETE /api/books/:bookId」，commit c26e97b）覆盖哪些表。
2. 风格档案版本（apps/server/src/style/distill.ts，同 source_hash 版本+1 旧行不改）与仿写档案（apps/server/src/imitation.ts）：服务端有无 DELETE 端点；apps/web/src/pages/DistillPage.tsx、StyleProfilesSection.tsx、ImitationProfilesSection.tsx 的版本视图/列表 UI 有无删除与「重新蒸馏」操作。
3. 有无任何保留策略/自动清理（保留最新 N 版之类）的既有实现或配置项。
4. 结论必须直接回答：哪几类「版本/档案」当前**完全没有**删除通路（API 层与 UI 层分别说），各自堆积后有没有可预见的体积/性能后果证据（如全量读取列表的查询）。

**锚点**（path+文案多重冗余，行号自行定位）：apps/web/src/components/ui.tsx（commit bef65ec 文案「公共组件」）；apps/server/src/style/distill.ts（文案「版本+1」「不可变」）；apps/web/src/pages/ChapterReaderPage.tsx（文案「版本链」「回滚」）；apps/web/src/pages/DistillPage.tsx（commit c7b3726「蒸馏独立 TAB」）。

## ② 只读约束
禁止改动工作树任何代码文件（不编辑、不格式化、不 git checkout/reset）。唯一允许的写操作：新建报告文件 docs/design/research-2026-11-16-ui-versions.md，并 `git add` 仅该文件 + `git commit -m "docs(design): R1 按钮与版本删除通路调研报告"`，不 push。

## ③ 报告结构
结论先行（Q1 三张清单 + Q2「哪几类没有删除通路」直接答案）→ 证据（每条结论配 path:line + 关键行摘录 ≤5 行）→ 未找到项与已试搜索词（每个「没有/未找到」结论列出实际试过的搜索词）。

## ④ 验收命令（以下命令均在项目根目录执行）
- `grep -nE "variant|border|bg-" apps/web/src/components/ui.tsx | head -40`
- `grep -rnE "<button" apps/web/src | head -60`
- `grep -rn "chapter_versions" apps/server/src | head -20`
- `grep -rniE "router\.delete|'DELETE'" apps/server/src | head -30`
- `grep -rniE "删除" apps/web/src/pages | head -30`
