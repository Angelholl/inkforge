# 讨论稿：蒸馏模组改进（借鉴 SubTrans 设置模式，2026-11-15）

> 状态：讨论稿（待 owner 拍板后转实现计划）。背景：owner 指令「蒸馏模组太简单了，可以借鉴下之前讨论过的项目的设置」。参考面：SubTrans（I:\SubTrans，源码级参考先例 DEC-2026-1113-04）+ 立项时的原始设计意图（DEC-2026-1111-01 第 15 行）。

## 一、现状诊断（apps/server/src/style/）

当前蒸馏 = **单次 LLM 调用**（distill.ts）：
1. 提示词 `RULES_INSTRUCTION` 硬编码在源码，产出 5-10 条 `RULES:` 行；
2. 档案 = rulesText + 全量 samples + metrics_json；同 source_hash 版本+1 旧行不改（不可变档案，✓ 保留）；
3. 注入端：renderStyleBlock（规则 + 每章轮换 3 段，1200 字预算截断）+ pickStyleSamples（已有，✓）；
4. **缺口（0.2 草案 F2 已登记，至今未补）**：voiceRefMetrics 从不传入生成管线（l0.ts 启用条件、chapter.ts 调用不带）——立项设计的 voice-match QC 整条链缺席；
5. UI：名称 + 文本 → 蒸馏裸表单（StyleProfilesSection），无版本视图、无参数、无产物预览。

对照立项意图「离线蒸馏不可变档案（量化规则 + 8-12 段样本），每章轮换 3 段；续写模式不注入，用 voice-match QC」：**样本与轮换已达标，量化规则深度不足，voice-match QC 整体缺席**。

## 二、SubTrans 可借鉴的设置模式（按价值排序）

| # | SubTrans 模式 | 对应资产 | 平移到蒸馏的价值 |
|---|---|---|---|
| 1 | **每任务模型/参数路由**（各阶段可选模型、temperature/topP/maxTokens） | app-refine-models.js | 蒸馏调参与生成解耦：蒸馏要保守（低温），表单暴露高级参数折叠区；走既有 createRoleProvider 角色路由，零新架构 |
| 2 | **可编辑提示词模板**（模板页预设+恢复默认） | app-refine-templates.js | RULES_INSTRUCTION 落库可编辑（默认模板兜底），owner 可按题材调「要量化句长/对话占比/禁用句式」等侧重点 |
| 3 | **术语表/词典管理**（CSV 术语表 + 字典页） | app-refine-dict/glossary.js | 蒸馏产物从「只有规则」扩展为 **规则 + 术语表槽**：从样本抽取人名/地名/专有词与用法偏好，注入与 QC 共用（为伏笔/人物一致性 QC 打底） |
| 4 | **评测报告**（eval-reports 页，跑分留档） | app-eval-reports.js | 补 F2 缺口：蒸馏完成即对 held-out 样本跑 voice-match 自评（LLM 给分+理由），分数写 metrics_json，档案列表展示——「蒸馏质量可量化」 |
| 5 | **批量修正**（batchfix 一键批量） | app-refine-batchfix.js | 已生成章节按新档案批量风格校对（复用 rewrite 管线）；价值高但动既有正文链路，建议放最后批次 |
| 6 | **设置 overlay hub**（全屏 4 panel） | app-refine-settings.js | 形态层面：蒸馏/模型/模板设置集中进设置页分区，书架页不再塞表单 |

**共同工程模式**（research-0.2-subtrans-reference.md 已盘点可平移面）：设置分层（默认值 → 配置文件 → UI 覆盖）、运行事件流推送、薄壳+CLI 双通道。这些 inkforge 已有对应件（settings.ts、useRunEvents、cli.ts），平移成本低。

## 三、建议的蒸馏流水线目标形态（分四批）

```
指标(本地) → 规则(LLM·可编辑模板·可调参) → 样本选取(已有+代表段) → 自评(LLM voice-match 打分) → 版本化(已有)
                                              └→ 术语表槽(规则同批产出或独立步)
```

- **批次一（表单与模板）**：RULES_INSTRUCTION 落库可编辑 + 恢复默认；蒸馏表单高级折叠区（temperature/maxTokens，走 summarizer 角色）；档案列表加版本展开（看历史 rulesText diff）。
- **批次二（自评接线，补 F2）**：蒸馏后对 held-out 2 段跑 voice-match 打分写入 metrics_json；生成管线接入 voiceRefMetrics（chapter.ts 调用补参 + l0.ts 启用条件生效）——立项设计的 QC 链最后一块。
- **批次三（术语表）**：蒸馏同批产出术语槽（人名/地名/专有词 + 偏好），档案详情可编辑；注入 renderStyleBlock 增术语段；QC L1 引用证据可引用术语。
- **批次四（批量校对）**：对选中章节按新档案批量风格 rewrite（复用 rewrite 管线 + run 通道），产出新版本走 append-only。

## 四、测试账本预估

每批 server/web 各 +2~4 用例；批次二会动生成管线（需 replay 语料过门，参考 0.2-T05 挂起条件——真模型窗口）。

## 五、待 owner 拍板

1. 批次范围：只做批次一 / 一+二 / 全四批分期；
2. 模板可编辑的安全边界：仅默认模板+单模板，还是多预设管理；
3. 术语表与批量校对是否纳入 0.2 尾期，还是顺延 0.3。
