# 计划：人物光谱蒸馏（DEC-2026-1120-09）

owner 拍板：①仅 planner 注入（drafter 红线同 PLOT/仿写）；②程序扫描脱敏兜底。

## 背景

现无人物蒸馏功能（人物仅来自设定集导入/手动 CRUD）。新增「人物光谱」档案线：从参考文本蒸馏出**匿名化人物原型**（如「男角色A：狡猾……」），供新书/续写 planner 参考，杜绝原文人名污染新书。

## 设计

- **行协议**（同 plainproto 风格）：
  - `ROLE: <定位标签>: <光谱特性>` 3-8 条——定位标签=性别+叙事功能（男角色A/女角色B/尊长C/反派D…），特性=性格光谱、行事动机、关系功能，**禁止出现原文人名/地名/专有名词**
  - `NAMES: <原文出现的角色名列表>` 一行（供程序校验用，不入库不注入）
- **程序脱敏兜底**：解析后扫描全部 ROLE 行文本，命中 NAMES 列表任一名字（或其 2 字以上子串）→ 判失败自动重蒸一次，再犯即 fail（错误信息点名违规行）。NAMES 行本身不落库。
- **落库**：migration 0013 `spectrum_profiles`（镜像 0012 plot_profiles：id/name/version/structure_json（ROLE 行 string[]）/source_path/source_hash/created_at）。
- **注入**：books 表加 `spectrum_profile_id`（migration 同文件或 0013 内 ALTER）；planner 组装时若绑定则加槽 `【人物光谱参考】`，预算 600 字（镜像 plotReference）；drafter 不注入（红线）。
- **API**：镜像 plot 五端点（list/create/distill/delete/bind?）。绑定复用书详情绑定模式——PLOT 如何绑书就照抄（books.plotProfileId 同款）。
- **UI**：`SpectrumProfilesSection` 镜像 PlotProfilesSection（蒸馏入口+列表+删除）；书详情绑定区加人物光谱单选（同 plot 绑定交互）。

## 卡分配（串行）

1. 卡 A（server）：spectrum.ts 蒸馏模块+脱敏校验、migration 0013、repo、五端点、planner 注入槽、测试
2. 卡 B（web）：client API、SpectrumProfilesSection、书详情绑定、测试
