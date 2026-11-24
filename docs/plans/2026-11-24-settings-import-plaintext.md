# 设定集导入纯文本降级分节 实现计划

**目标：** 无 Markdown 骨架的纯文本 TXT 设定集也能解析出人物卡/卷级大纲/伏笔/文风，不再"全落世界观、其余全 0"。
**架构：** `splitDoc` 之后在 `parseSettingsCompendium` 加降级通道——全文 0 个 H2 且 0 个 H3 时，用行式标题识别合成 sections（伏笔类进 h3Blocks 供悬置扫描），并向三个抽取器传 `plain` 开关启用纯文本形态分支。MD 路径逐字节不变（plain 分支全部以 `plain===true` 为门）。
**规格：** 本文件内嵌「规格」节即规格（根因调研结论：解析器只认 ATX 骨架 `settings-import.ts:45-72`，description 全文兜底 `:528` 属 DEC-2026-1121-01 既定设计、不动）。
**评议：** decision-critic 2026-11-24 有条件支持 A（无高危异议）；异议①卷行须「第」起头或倒装、②编号偏移哨、③裸名共用白名单+标签前缀判定、④红线措辞改「含 H2/H3 骨架 MD 不变」——四条均已并入 S3/S4 与全局约束，条件闭环。

## 全局约束

- MD 回归红线：合成仅当 `doc.sections.length===0 && doc.h3Blocks.length===0`；**含 H2/H3 骨架的 MD 路径逐字节不变**（仅 H1 或无标题的 MD 行为可从 0 结构变为产出结构，属"从无到有"，既有测试不钉此类命中）。既有 `settings-import.parse.test.ts` 全部断言不改一字、保持全绿。
- 改动文件仅两个：`apps/server/src/settings-import.ts`、`apps/server/test/settings-import.parse.test.ts`。UI/路由/DTO/融合门不动（`splitCompendiumSections` 直调 `splitDoc`，不受合成影响）。
- description 全文兜底与 20000/8000 预算 warning 口径不动（DEC-2026-1121-01）。
- 测试基线只增不减（当前全库 710）。验证链：`pnpm typecheck` → 定向 vitest → `pnpm test` 全量 → `pnpm lint` 零输出。
- 夹具中性仿形，不引入真实作品文本。

## 规格

- **S1 触发**：`splitDoc` 后 sections 与 h3Blocks 皆空 → `synthesizePlainSections(raw)`；产出非空则 `plain=true`，替换 `doc.sections`（伏笔桶除外，改投 `doc.h3Blocks`）。产出为空（无任何节名行）→ 行为=今日（全文落世界观+「未识别」warning）。
- **S2 节标题形态**（行 trim 后判定，命中即开新节；`heading` 存桶名原文，供 `includes('人物')` 等既有 find 与 consumedSections）：
  - 括线式：`^【(.+)】$` 或 `^\[(.+)\]$` → 内文按下列规则判。
  - 编号前缀剥离：`^(?:[〇零一二三四五六七八九十百千两\d]{1,4}\s*[、.．)）]\s*)?`。
  - 剩余文本须**以关键词起头**（startsWith，长词优先），桶映射：`人物圣经|主要人物|人物设定|人物与关系|人物|角色设定|角色→人物`；`总大纲|故事大纲|剧情大纲|情节大纲|大纲→大纲`；`关系发生矩阵|矩阵→矩阵`；`文风与语言规范|文风规范|文风|语言规范|风格→文风`；`悬置线清单|悬置线|悬置|伏笔清单|伏笔→伏笔`；`世界观|故事背景|背景设定→世界观`；`规则体系|规则→规则`。
  - 关键词后的尾串 tail：空/仅空白/仅一个冒号 → body=''；以 `[：:]` 起头且去冒号后 ≥2 字 → body=尾文；tail ≤8 字且不含 `[。！？]` → body=''（`人物与关系` 类）；否则非节标题（`人物是恒定太阳，…` 不误伤）。
  - 章/卷行天然不命中（关键词须起头，`第X章/第X卷` 以「第」起头）。
- **S3 人物行式**（仅 plain）：`^(?:[-·•]\s*)?(名)[：:]\s*(尾)$`，名段 ≤20 字；**裸名行**=`^(?:[-·•]\s*)?([^：:\n]{1,12})$`。**名段守卫两形态共用**：剥括号注后匹配 `^[\u4e00-\u9fffA-Za-z][\u4e00-\u9fffA-Za-z0-9·]{0,9}$`（即不含标点；form A ≤10 字、裸名放宽到 `{0,11}` ≤12 字）、不在 NON_NAME_LABELS——**按前缀起头判定**（`背景介绍` 亦挡）、不匹配 `^[〇零一二三四五六七八九十百千两\d]+[卷部篇章节]$`。命中守卫 → 开新卡 cur；其余非空行并入 cur.parts；空行 flush。NON_NAME_LABELS（钉值）：`弧光|功能|简介|设定|备注|年龄|身份|职业|关系|出场|登场|能力|缺陷|秘密|结局|外号|代号|住所|立场|说话腔|性格|背景|定位|机制|原则`。
- **S4 大纲行式**（仅 plain，插在 `t===''` continue 之后、表格分支之前）：
  - 卷行两形态（数词=`[〇零一二三四五六七八九十百千两\d]{1,6}`；**「第」必居其一或倒装以卷/部/篇起头**——散文行「一部讲述…」不误命中）：`^第\s*(数词)\s*(卷|部|篇)(分)?\s*[：:]?\s*(.*)$` 或 `^([卷部篇])\s*(?:第\s*)?(数词)\s*[：:]?\s*(.*)$` → `makeVolume("第"+n+unit+("分"命中?加"分":"")+" "+题剥尾括号, body=尾括号内文)`（倒装形态题面也归一为「第N卷 …」）；`volRange` 从题/body 内 `(\d{1,3})\s*[–—-]\s*(\d{1,3})` 提取；outlineLines 追加 `题（body）` 或 `题`。
  - 章行：`^第\s*(数词)\s*章\s*[：:.、\s]*(.*)$` → 卡，chapterFrom=cnToNum。
  - 阶段行：`^(\d{1,3})\s*[–—-]\s*(\d{1,3})\s*([^（(：:]{1,20})[：:]\s*(.*)$` → 无卷先建卷；stage 名=第3组，卡走既有 `extractCards(第4组)`。
  - 编号行：`^(\d{1,3})\s*[、.．]\s*(.*)$` → chapterFrom = volRange ? volRange.from+n-1 : n；**偏移哨**：volRange 存在且 `from+n-1 > to` → 回退字面 n，并推全卷仅一条 warning `卷内编号与卷章区间不一致，按字面编号取章号`（连续编号用户 4./5./6. 在 4-6 卷下回退字面即正确；错位撞车由既有 seenCardCh 先到先得兜底、warning 已声明口径）。
  - 题/梗概切分 `splitTitleBody(rest)`：首个 `[：:]` 分题/梗概；无冒号且尾括号闭合在行尾 → 括号内=梗概；否则 body=rest、title=rest.slice(0,20)。
  - 散行/兜底沿用既有（`vol===null` 不成卡）。plain 下无 stage 头时卡落 ensureStage 默认阶段（每卷 ≥1 阶段）。
- **S5 伏笔 plain**：合成节 heading='伏笔'；`parseForeshadowings` 收 `plain` 参，plain 时体行以 `'；'` join（多行编号逐条命中 anchorSegments），其余逻辑不变。
- **S6 书名兜底**：`plain && doc.h1===''` 时取首个非空行：含 `《X》` → X；否则以 `设定集` 结尾且 ≤40 字 → 剥 `[·\-\s]*(?:扩写)?设定集\s*$`；都不满足 → 保持空串。
- **S7 非目标**：小说正文（无节名行）→ 维持今日行为，正文导入通道另议；融合门对纯文本 description 的节级剥离（无 # 可分节）保守保留，挂账不修。

## 任务 01：节标题合成 + 接线 + 伏笔/书名 plain 态

**文件：** Modify `apps/server/src/settings-import.ts`；Test Modify `apps/server/test/settings-import.parse.test.ts`（追加 describe('纯文本降级分节')，不动既有 describe）。
**接口：** Consumes 无新增；Produces——**全部模块内部函数，零新增 export**（knip 零新增；测试一律经 `parseSettingsCompendium` 公开面断言）：
- `plainSectionHeading(t: string): { bucket: string; body: string } | null`（S2；KEYWORD_MAP 为长词在前的有序数组，钉值照 S2）。
- `synthesizePlainSections(raw: string): Section[]`（S1/S2：Map 按桶合并同名节、文档序首现排、heading=桶名；节名前的散行忽略）。
- `parseSettingsCompendium` 内接线（S1 替换 doc.sections/h3Blocks、`plain` 标志）；`parseForeshadowings(h3Blocks, warnings, out, plain=false)` 加 S5 join，heading 判定不变；书名 S6。
**步骤：**
- [ ] 写失败测试（公开面）：伏笔-only plain 夹具 `《伏笔示例》设定集\n\n【伏笔】\n1. 厨房对面的眼睛；2. 表叔拜访未完成\n3. 远行的两人未归\n` → foreshadowings 三条（description 依次为 `厨房对面的眼睛`/`表叔拜访未完成`/`远行的两人未归`）、title==='伏笔示例'、consumedSections===['伏笔']、warnings 无「未识别」 → `pnpm -F @inkforge/server exec vitest run test/settings-import.parse.test.ts` 见红。
- [ ] 写失败测试：同桶合并——上夹具再追加一段 `【伏笔】\n4. 旧钥匙` 于文末 → foreshadowings 四条（单节，不重复产 consumedSections 条目）。红。
- [ ] 实现 plainSectionHeading + synthesizePlainSections 并接线（S1+S5+S6） → 两例绿。
- [ ] 写节标题判定护栏测试（公开面）：`人物是恒定太阳，每卷转进来一颗新行星。` 单行 → consumedSections===[] 且有「未识别」warning；`第一章 暗流` 单行 → 同上；`人物：主要角色包括老王与阿美，二者为邻里关系。` 单行 → consumedSections===['人物'] 且无「未识别」（inline 长尾成节、尾文入节体不成卡——人物抽取器 Task-02 才启用）。红→绿（判定已实现则记录为绿）。
- [ ] `pnpm typecheck` 0 错、`pnpm -F @inkforge/server exec vitest run test/settings-import.parse.test.ts` 全文件绿（既有 describe 零改动） → commit（Conventional+中文，verify: 钉命令实测结果，Refs: 本计划 Task-01）。

## 任务 02：人物行式形态

**文件：** 同上两文件。
**接口：** Consumes Task-01 的 plain 标志；Produces `parseCharacters(sec, warnings, out, plain=false)`——plain 块插在空行/标题 flush 分支之后、`startsWith('|')` 之前（S3 守卫与 NON_NAME_LABELS 钉值）。
**步骤：**
- [ ] 写失败测试：人物-only plain 夹具（S3 示例四行+裸名两行「阿芳\n隔壁宝妈，热心。」）→ names `['阿美','老王','阿珍','阿芳']`、无「弧光」、阿美 baseSetting 同含「连锁公司业务员」与「弧光：藏→半摊→共谋。」、阿芳含「隔壁宝妈」。红。
- [ ] 实现 plain 块（form A 正则+裸名正则+守卫+cur 续行）→ 绿。
- [ ] 写护栏测试：`人物：阿美、老王与阿珍三人。` 单节夹具 → 0 卡（短尾 body 无冒号不成 form A）；`【人物】\n阿美：甲。\n阿美：乙。` → 1 卡+「重名」warning（去重逻辑 plain 态同样生效）。红→绿。
- [ ] 写护栏测试（评议异议③）：`【人物】\n性格泼辣。\n背景介绍：略。\n老王：中介。` → characters 仅 `['老王']`——`性格泼辣。` 带标点不过裸名白名单、`背景介绍` 被 NON_NAME_LABELS 前缀判定挡住。红→绿。
- [ ] 写失败测试：两个【人物】节合并、跨节重名 warning 一条。红→实现（Task-01 合并已保证）→绿；若已绿则确认为既有行为直接记录。
- [ ] 定向+全文件+typecheck 绿 → commit。

## 任务 03：大纲行式形态

**文件：** 同上两文件。
**接口：** Consumes Task-01；Produces `parseOutline(sec, warnings, tree, allCards, outlineLines, plain=false)`——plain 块（卷/章/阶段/编号四分支+splitTitleBody+volRange 偏移，S4 正则钉值）插在 `t===''` continue 之后、表格分支之前。另新增内部函数 `cnToNum(s: string): number | null`（阿拉伯数字直通；CJK 位值解析：逐字符累计 cur/num，遇位值词 `num+=(cur||1)*值;cur=0`，遇数字 `cur=cur*10+d`，`零`跳过，`两`=2，收尾 `num+cur`；不可解析→null；本卡定义本卡消费，不 export）。
**步骤：**
- [ ] 写失败测试：大纲-only plain 夹具：`【大纲】\n第一卷 崛起（第1-3章）\n1. 初入校园：开场钩子\n2. 暗流\n第二卷 转折（第4-6章）\n1. 摊牌（近破裂一次）` → volumes 2（titles `第1卷 崛起`/`第2卷 转折`，vol1 body `第1-3章`）、卡章号 [1,2] 与 [4]、outlineItems [1,2,4]、outline 含 `第1卷 崛起`、每卷 stages≥1。红。
- [ ] 写失败测试（评议异议①）：大纲-only 夹具含散文行 `一部讲述成长的小说。` 与 `部分角色设定` → volumes 0、cards 0（裸「一部」不误建卷）；`第三部分 高潮` → 建卷 title `第3部分 高潮`。红。
- [ ] 实现卷分支 → 卷断言绿（卡仍散行兜底）。
- [ ] 写失败测试：中文数字章行 `【大纲】\n第一卷 引子\n第二十三章 桥段（伏笔回收）\n第一百零五章 终局\n第两章 补叙\n第abc章 不算数` → cards chapterFrom 依次 `[23,105,2,null]`（第abc 行走散行兜底 title 切片）——即 cnToNum 经公开面钉值 `二十三→23`、`一百零五→105`、`两→2`。红。
- [ ] 实现章/编号分支（含 volRange 偏移与 splitTitleBody）→ 全例绿。
- [ ] 写失败测试：阶段行 `13-15 年会篇：13 备装（采购线启动）；14 圆桌（两线交汇）` → stage 名 `年会篇`、卡 [13,14]；无卷时先建卷。红→绿。
- [ ] 写失败测试：无 range 的卷 `第二卷 转折` + `5. 摊牌` → chapterFrom===5（字面值）。红→绿。
- [ ] 写失败测试（评议异议②偏移哨）：`第二卷 转折（第4-6章）\n1. 甲\n4. 乙` → cards chapterFrom `[4]`（`1.` 偏移成 4；`4.` 偏移 7>6 回退字面 4 撞车被 seenCardCh 去重）且 warnings 含「卷内编号与卷章区间不一致」恰一条；`第二卷 转折（第4-6章）\n4. 甲\n5. 乙\n6. 丙` 连续编号形态 → chapterFrom `[4,5,6]`。红→绿。
- [ ] 定向+全文件+typecheck 绿 → commit。

## 任务 04：集成夹具 + 全链验证

**文件：** 同上两文件。
**接口：** Consumes 01–03 全部；Produces 无新接口。
**步骤：**
- [ ] 追加 PLAIN_FIXTURE（S1–S6 全要素：书名行/世界观：长 inline/【人物】四形态混合/剧情大纲：两卷+编号/【伏笔】多行编号/文风 节）——内容以 S2/S3/S4 各例拼装，中性占位。写集成断言：title、characters 名单、volumes/cards/章号、foreshadowings 条数、styleSection 含文风句、`consumedSections` 钉 `['人物','大纲','文风','伏笔']`、warnings `[]`。先红（接线缺口暴露处）后绿。
- [ ] 写回归护栏测试：同一 PLAIN_FIXTURE 以 `\r\n` 行尾重跑 → 结果逐字段相等（CRLF 经 splitDoc trim 天然免疫，钉死防后人回归）；同一 plain 文本喂 `splitCompendiumSections` 仍 `[]`（融合门不受合成影响）。
- [ ] `pnpm typecheck` → 0 错；`pnpm test` → 全量 ≥710 且零失败（新增用例数如实报）；`pnpm lint` → 零输出；`pnpm deadcode` → 零新增告警（本计划零新增 export，如有告警即卡内自查）。
- [ ] commit。

## 已知挂账（不在本计划内修）

- 融合门节级剥离对纯文本设定集退化（无 # 骨架可分节，保守保留）——S7。
- plain 短散文行在人物节内被认作裸名卡的残余面（白名单排标点+标签前缀判定已收进 S3，剩纯 CJK 无标点短行如书名式行）——真实文件复核后再收紧。

---

# 补录（TXT-02，2026-11-24）：真实剥平稿形态适配

**触发：** Task-01…04 验收后活体冒烟用 owner 真实文件（Downloads《少年阿磊》世界观剥节稿-1124.txt，UTF-8，211 行，v6 母稿剥掉全部 `#` 标记并删去人物/矩阵/文风/悬置四节的残稿）。TXT-01 实测读数：书名 `少年阿磊` ✓、世界观/规则成节 ✓、desc 10836 ✓、分级制落地提示 ✓，但 `consumed` 不含大纲、vols/outlineItems 仍 0——文件形态超出 S2/S4 假设。**该文件人物/伏笔 0 属内容使然（节已删），不是识别失败；本补录只修大纲面。**

## 规格补录（只增分支，不改 S1–S7 已验收语义）

- **S2a 节标题放宽**（plainSectionHeading 增量）：编号剥离后，再剥可选修饰前缀 `^[〇零一二三四五六七八九十百千两]{1,3}[卷部篇本集]?`（`三卷大纲`→`大纲`、`全书人物`→`人物`）后再判关键词起头；尾串新增形态：整串全角括号注 `^（.+）$` 且 tail ≤24 字 → body=''（`三卷大纲（场合配场；L＝轻、H＝重）` ✓）。双保险：`剧情引擎库（可无限扩充；新桥段带新具名角色时必须绑 ≥2 场并写明契机）` 起头词「剧情」不在起头表 → 拒。
- **S4a 卷行编号前缀+书名号**（parseOutline plain 卷分支增量）：卷匹配前先试剥 `^\d{1,3}(?:\.\d{1,2})?[、.．]?\s*`（仅卷分支内部尝试，卡分支不见得剥——`1｜`、`1. `、`1 大一上` 各走自身分支）；命中后题面按 MD 先例 `^(.*?)《(.+?)》` 抽书名号 → title=`第N卷 内文`，》后余文入 body（无《》则维持 Task-03 口径）。
- **S4e 卷区间提取收紧**（修 Task-01 遗留缺陷：现 `(\d{1,3})[–—-](\d{1,3})` 无边界，`1995.9–1999.6` 会抠出 `9–1` 假 range 致偏移恒越界+误报「不一致」warning）：卷分支 range 正则改 `/第?\s*(\d{1,3})\s*[–—-]\s*(\d{1,3})\s*章/`——「章」后缀必在，年份串免疫；Task-03 已验收夹具（`（第1-3章）` 形态）零影响，回归钉见 Task-05 步骤 2。
- **S4b 弧/场合行**（plain 新分支，置于 st 冒号阶段行之后）：`^(\d{1,3})\s+([^｜\n]{2,40})｜` → 阶段行：stage 名=第2组剥行尾括号注，body=余格按 `[｜|]` 切后「；」join；无卷先建卷（pendingSubTitle 兜底，同 ensureStage 语义）；**不跑 extractCards**（弧行余格是场合池/配场/钩，非编号卡）；行后 `stage = null`（与 MD 阶段头同语义，卡行落默认阶段）。
- **S4c 章号拍平行**（plain 新分支，置于 S4b 之后、编号行之前）：区间形态 `^(\d{1,3})\s*[–—-]\s*(\d{1,3})[｜|](.+)$` → 卡 {chapterFrom,chapterTo}；单章形态 `^(\d{1,3})[｜|](.+)$` → 卡 chapterFrom=chapterTo=n；两者 cells=第2组按 `[｜|]` 切分 trim，title=cells[0]（空则 body 前 20 字），body=cells.length≥3?cells[2]:cells[1]（映射 MD 四列表「题/落地」列先例，落地格 `H（…）` 完整入 body 供 parseLandingCell）。
- **S4d 表头/池行跳过**（plain 兜底前置门）：大纲节内行含 `[｜|]` 且首格（首个分隔符前 trim）不匹配 `^\d{1,3}$|^\d{1,3}\s*[–—-]\s*\d{1,3}$` → 整行 `continue` 不成卡不成卷——钉死 `章｜标题｜线｜落地（峰值）`、`弧（时段·章数）｜场合池｜…`、`L1 宿舍-校园线｜卷一｜…`、`场景资产｜复用点…`、矩阵式行 五类；无｜散行兜底口径不变。
- **分支次序钉**（parseOutline plain 块内）：卷（含 S4a 剥前缀尝试）→ 章 `第N章` → st 冒号阶段行 → S4b 弧行 → S4c 区间拍平行 → S4c 单章拍平行 → S4d 门 → 编号行 → 既有散行兜底。
- 非目标不变：小说正文（同目录 仙家.txt/舍友.txt/阿美.txt）仍走 S7；人物/矩阵/文风/悬置在该剥节稿中不存在，本卡不为其造数据。

## 任务 05：真实剥平形态适配（卡 TXT-02）

**文件：** Modify `apps/server/src/settings-import.ts`；Test Modify `apps/server/test/settings-import.parse.test.ts`（追加 describe('真实剥平稿形态')，既有含 TXT-01 全部断言不动）。零新增 export。
**接口：** Consumes Task-01…04；Produces 无新接口；S2a 并入 plainSectionHeading、S4a–d 并入 parseOutline plain 块与卷分支。
**步骤：**
- [ ] 写失败测试：`5. 三卷大纲（场合配场；L＝轻、H＝重）` 单行 → consumedSections 含 `'大纲'`；`9. 剧情引擎库（可无限扩充；新桥段带新具名角色时必须绑 ≥2 场并写明契机）` 单行 → consumedSections===[]（起头词拒）；`全书人物` → 成节。红→实现 S2a→绿。
- [ ] 写失败测试：大纲节内 `5.1 卷一《大学篇》1995.9–1999.6（≥50 章，实排约 60 章）` → 1 卷 title `第1卷 大学篇`、body 含 `1995.9–1999.6`；随后 `1. 甲` 编号行 → chapterFrom===1（S4e 后 volRange 必为 null：不偏移、无「不一致」warning）；对照夹具 `第二卷 转折（第4-6章）` 仍正确成 range（Task-03 回归钉）。红→实现 S4a/S4e→绿。
- [ ] 写失败测试：弧行 `1 大一上·入学与宿舍（1995.9–11，6 章）｜四人房下铺、磁卡公话｜L 王磊×阿泰 舍友线起｜钩：她替他盛了两碗汤` → stage 名 `大一上·入学与宿舍`、stage body 含 `四人房下铺` 与 `钩：`、该 stage.cards 为空（不跑 extractCards）；其后章行 `1｜下铺｜L1｜H（室友展示：班长×周末来访女友）` → 卡 {title:'下铺', chapterFrom:1, body 以 `H（` 起}。红→实现 S4b/S4c→绿。
- [ ] 写失败测试：S4d 五类行入大纲节 → cards 总数 0：`章｜标题｜线｜落地（峰值）`、`弧（时段·章数）｜场合池｜落地配场｜新边入轨／章末钩`、`L1 宿舍-校园线｜卷一｜学年局、联谊复演`、`宿舍四人房·查勤·顶楼｜卷一主战场；制度即观众`、`主角×老王｜5｜A·4｜A·5/7/12`。红→实现 S4d→绿。
- [ ] 写失败测试：区间拍平行 `24–26｜三连｜L2｜H（民宿三连：阿美×小林）` → 卡 chapterFrom 24、chapterTo 26、title `三连`。红→绿。
- [ ] 写 TXT-01 回归确认：既有全文件（含纯文本降级分节 describe）零改动全绿；`人物：阿美` 短尾组合用例按 Task-01 口径不变。
- [ ] `pnpm -F @inkforge/server exec vitest run test/settings-import.parse.test.ts` 全绿 → `pnpm typecheck` 0 错 → `pnpm test` 全量 ≥725+新增 零失败 → `pnpm lint` 零输出 → `pnpm deadcode` 零新增 → commit。

**主审活体冒烟（卡外，主模型亲执）：** owner 真实剥节稿离线重放，验收读数：volumes===3（`第1卷 大学篇`/`第2卷 初入职场篇`/`第3卷 结婚·中高层篇` 形态）、弧 stage 数 ≥10、章卡 ≥60 且 H/L 落地格解析非零、outlineItems 非空升序、outline（卷级梗概）>0 字、consumed 含 `大纲`、warnings 无「未识别」、无「不一致」误报。

## 挂账补记

- 剥平稿中 `6. 故事线池（按卷配）`/`8. 场景资产库与复变表` 类「N. 非关键词短标题」会以编号卡形态出现（撞既有章号被 seenCardCh 去重，未撞则留 1 张题面卡）——真实文件复核后视读数决定是否加「短 N. 行不成卡」门。

## 执行留痕（2026-11-24 收口）

- **TXT-02 卡 e3c04f9**（hy4 契约 exit0 无 flags 448s）：主审逐块 diff 审 + 亲跑定向 54/54、全量 730、typecheck/lint/knip/秘密扫零。执行者对 S2a 修饰前缀字符类补「全/书」两字——计划原钉类挡不住自家示例「全书人物」，属规格自洽性修正，按钉值测试判定采纳。
- **主审直修 6ee6612**（真实剥节稿重放暴露三残留，红3→绿57，全量 733=566+165+2）：①倒装卷行拒「：；」尾——§9 引擎行「卷二：长文。」不再建假卷；②弧段标号扩 A–F 字母——卷二 6 弧成阶段，L1 线池行仍跳过；③plain 散行兜底拒 >60 长句与句读收尾行——细目/产能注不再成垃圾卡。剥节稿终读数：3 真卷 17 阶段 23 章卡全带 H/L 落地格、warnings 空；卷二/三 0 卡系母稿本无逐章行（弧表+峰值段注），非识别失败。
- **交付测试稿**：`少年阿磊-完整剥平稿-1124.txt`（owner Downloads 同目录，356 行 CRLF UTF-8）= v6 母稿经 `refineForDescription` 剥平（与剥节稿同族工序）+ 人物表行转冒号形态（括号注只留前 2 项、余段并入设定）+ 悬置节名改关键词起头。解析读数：书名 ✓、人物 42 卡、3 卷 17 阶段 23 卡、伏笔 8 条、文风 399 字、剧情大纲 3607 字、consumed 五节全命中、warnings 空。
- 生成器区判定教训：编号列表行「11. ××」与节标题「11. ××」同形，脚本侧须精确匹配节标题全集；解析器本体因「关键词起头」判定对此天然免疫（已验证）。
- 提交面 GUI 标注：TXT-01/02 与直修均为服务端解析器改动、无 UI 路径，执行者 commit 未逐枚注明——以本收口记录补声明「GUI 未验证（无 GUI 改动），owner 真实测试」。
