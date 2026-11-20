# 卡 A（server）：人物光谱蒸馏——模块/脱敏/迁移/端点/planner 注入

以下命令均在项目根目录执行（相对路径）。

## 背景

DEC-2026-1120-09（计划 docs/plans/2026-11-20-spectrum-distill.md）：新增「人物光谱」蒸馏档案线——从参考文本提取**匿名化人物原型**（「男角色A：狡猾……」），供 planner 参考，杜绝原文人名污染新书/续写。owner 拍板：仅 planner 注入（drafter 不注入，红线同 PLOT）；程序扫描脱敏兜底。

## 参照实现（动手前完整读）

- `apps/server/src/plot.ts` — PLOT 蒸馏模块（instruction/analyzePlot 行协议解析）
- `apps/server/src/db/migrations/0012_plot_profiles.sql` + `apps/server/src/db/repositories/plot.ts` — 表结构与 repo
- `apps/server/src/http/routes.ts:970-1007` — plot 五端点形态；`:347-366` planner plotReference 槽组装
- 迁移测试钉值惯例：`apps/server/test/` 内 plot/迁移相关测试（migration 列表钉值若存在须同步+1）

## 改动内容

1. **迁移** `apps/server/src/db/migrations/0013_spectrum_profiles.sql`：
   ```sql
   CREATE TABLE spectrum_profiles ( 镜像 0012 列结构 );
   ALTER TABLE books ADD COLUMN spectrum_profile_id TEXT REFERENCES spectrum_profiles(id);
   ```
   （列名/外键风格照抄 0012 与 books.plot_profile_id 既有写法；若迁移测试有版本数钉值，同步更新）
2. **repo** `apps/server/src/db/repositories/spectrum.ts`：save/list/get/delete/setBookSpectrum（镜像 plot.ts；books 更新 spectrum_profile_id 的 repo 方法若 books.ts 内有 plot 同款就近照抄）
3. **蒸馏模块** `apps/server/src/spectrum.ts`：
   - instruction：要求输出 `ROLE: <定位标签>: <光谱特性>` 3-8 条 + `NAMES: <原文角色名列表>` 一行。定位标签=性别+叙事功能序号（男角色A/女角色B/尊长C/反派D…），特性=性格光谱/行事动机/关系功能；**明令禁止 ROLE 行出现原文人名、地名、专有名词**
   - 解析 ROLE/NAMES 行（plainproto 同款风格）；NAMES 不入库
   - **脱敏校验**：对每条 ROLE 行文本扫描 NAMES 列表——命中任一名字或其 ≥2 字连续子串即违规；任一违规→自动重蒸一次；再违规→throw（错误信息含违规行与命中的名字）
   - 导出 `analyzeSpectrum(deps, input): Promise<{ roles: string[] }>` 与 `saveSpectrumProfile`（镜像 plot）
4. **端点**（routes.ts，镜像 plot 五端点）：
   - `GET /api/spectrum-profiles`（列表）、`POST /api/spectrum-profiles/distill`（body 同 plot：sourceText/name）、`GET /api/spectrum-profiles/jobs/:jobId`（若 plot distill 是同步实现则同步，不强行做 job）、`DELETE /api/spectrum-profiles/:id`（409 已绑书，照 plot 的 409 形态）、`PUT /api/books/:bookId/spectrum-profile`（body {profileId|null}）
   - zod schema 在 `apps/server/src/http/schemas.ts` 照 plot 同款新增
5. **planner 注入**（routes.ts planner 组装区，`:347-366` plotReference 旁）：书绑定 spectrum_profile_id 且存在时加槽 `【人物光谱参考】\n${roles.join('\n')}`，预算 600 字头截（照 plotReference 的截断写法）；**drafter/related 组装区不得出现该槽**（红线）
6. **测试**：
   - `apps/server/test/spectrum.test.ts`（镜像 plot.test.ts 结构）：蒸馏解析（ROLE/NAMES 提取、条数钳制）、脱敏命中→重蒸成功、二次违规→throw 且信息含名字、落库/列表/删除、绑定书后 planner 组装含【人物光谱参考】、未绑不含、drafter 组装恒不含
   - 迁移/端点就近补：409 删除守卫、404 分支

## 验收命令

```bash
pnpm --filter @inkforge/server exec tsc --noEmit
pnpm --filter @inkforge/server test
pnpm exec knip
```

全绿且基线只增不减（server 392+新增）。

## 约束

- 只 commit 不 push；Conventional 前缀+中文提交信息，正文 verify+Refs: DEC-2026-1120-09。
- 禁 `git add -A`；逐文件 add（含本卡面与 plans 文档）。
- 迁移必须新增文件，不改历史迁移；迁移测试钉值只增不改语义。
- drafter 注入是硬红线：实现后自 grep 确认 drafter/related 组装路径无 spectrum 引用。
- 现场与卡面冲突即停待裁决。
