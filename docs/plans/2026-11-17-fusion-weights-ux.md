# 融合比例（weights）UX + 导出澄清 实现计划（2026-11-17）

**目标**：① 绑定面板加档案比例 weights——比例**只驱动六轴加权平均与样本 3 席最大余数分配**（七维来源选择与规则/术语逻辑不动），主风格更名「基准档案」、比例区标签「六轴与范例取样比例」、七维下拉收进「高级设置」折叠、legacy 绑定显示只读提示且不触碰比例则保存不带 weights；② 存储与 API——迁移 0011 加 `weights_json` 列、快照 bundle 加 weights 且 mergeVersion=2、zod 校验（可选 weights：键集恰等绑定全集、Σ=100、整数≥1）+ **D4 auxProfileIds 内部重复显式 400**、GET 回显带 weights；③ 导出澄清——export 端点回传 `outDir`（path.resolve 绝对路径）、阅读页按钮文案「导出全书正文（Markdown）」+旁注、toast 报 outDir、详情页导出区加一行同义说明；不改导出行为/格式；④ D2（另存融合档案）本批不做，列后续候选。

**架构**：weights 数据流=UI 客户端最大余数归一化（整数 %、Σ=100）→ PUT body `weights` → zod 校验（不重归一）→ `setBookStyleBinding` 同事务写 `book_style_profiles.weights_json`（全行同值，先例=0010 dims_json）+ `buildStyleBundle` 冻结进快照（非空才写键）→ 注入时 `mergeStyleProfiles` 按「bundle.weights 键集非空=加权路径 / 缺席或空对象=legacy 路径」双分支取权重，第 4 步六轴与第 7 步样本席位消费，其余步骤逐字节不动。旧绑定书（weights_json='{}'、旧快照无 weights 键）行为逐字节等价改前（legacy 硬红线）。

**规格**：真值=docs/decision-log.md#**DEC-2026-1117-05**（主模型代决·owner 可驳回，2026-11-17；其中「主模型拍板」D1-D4 与「随案钉细节」为钉死条款，勿重开）；背景参考=DEC-2026-1117-04 + docs/plans/2026-11-17-style-mixing-and-wizard-slim.md（现行「贡献维数计权」算法与绑定链的原始钉死，本批在其上加 weights 路径，不推翻其余条款）。

## 全局约束（逐条精确值）
1. **测试基线只增不减**：现全量 server 302 + web 89 + shared 2 = **393**；本计划预计新增 server 14（merge 10 + migrate 1 + repositories 1 + http 2）+ web 9（BookDetailPage 7 + ChapterReaderPage 2）→ 预计全量 **416**，下限 393。既有断言仅允许计划内列明的适配（见各任务「适配」条目与自审五查 3），一律不得改删来「变绿」。
2. **legacy 逐字节红线**：无 weights 键的 bundle / `weights_json='{}'` 行注入行为与改前逐字节一致。证据双保险：merge.test.ts 既有 20 例全部经 `bundle()` helper 构造（不携带 weights）→ 改后自动落 legacy 路径，**零适配全绿即红线证据**；另 FW-A 新增 mergeVersion=1 直喂 fixture 回归 2 例。
3. **验证链硬序**：静态检查 → 定向测试 → 全量测试 → 冒烟 → 安全深扫比基线（零新增才放行）；任一环失败即停。工具命令从根 package.json scripts 读实：`pnpm typecheck`、`pnpm lint`、`pnpm --filter @inkforge/server exec vitest run <文件>`（定向）、`pnpm -r --if-present run test`（全量）、`pnpm --filter @inkforge/web build`（冒烟）、`pnpm audit --prod`（安全）。
4. **GUI 不做自动化目验**：FW-C/FW-D 涉及 GUI 的提交信息注明「GUI 未验证（owner 真实测试）」。
5. **迁移派发前置**：FW-B 派发前主审对生产库执行 `VACUUM INTO 'apps/server/data/backups/inkforge-pre0011-<yyyymmdd-hhmm>.db'` 并双侧 `integrity_check`（先例=0010 派发前置快照 inkforge-pre0010-20261117-1514.db）。桌面 NSIS/资源快照为打包期整树再生成物，**不手补**（0011 不列入，沿 1117-04 D10）。
6. **提交纪律**：永不 `--no-verify`、永不 `git add -A`；执行者只 commit 不 push；提交信息 Conventional 前缀+中文描述，正文 `verify: <验证结果>`。
7. **服务端校验语义**：weights 为**客户端归一后提交、服务端只校验不重归一**（DEC-2026-1117-05 拍板原文）；校验失败 400 人话文案经 parseBody（routes.ts:1020-1030）输出「请求参数不合法：path: message」。
8. **卡粒度**：同工作树 ≤1 卡，串行 FW-A → FW-B → FW-C → FW-D → FW-E（FW-D 与 FW-C 无文件交集可理论上并行，但按派卡硬红线串行执行）。

## 调研基线（2026-11-17 实测复核，行号=改前基线）
- **merge.ts**（apps/server/src/style/merge.ts，305 行）：模块 docblock 算法钉死 :2-17；`StyleBundleV2` :37-46（v:2 :38、mergeVersion 注释「恒 1」:39-40）；`buildStyleBundle` :68-84（`mergeVersion: 1` :77）；`parseStyleBundle` :117-151（mergeVersion 容错读 :129、V1 rulesJson 适配 :135-147、V2 直读 :150）；权重=实际贡献维数+主保底1 :195-203（weights map :196-202、W :203）；六轴加权 :205-219（参与需 w>0 且有限数字 :211-217、P 空不写入 :218）；规则 400 :221-238；术语 10 :240-251；样本 3 席 :253-299（最大余数 :254-271、pickStyleSamples 池内轮转 :273-281、顺延循环 :282-298、id 命名空间 :299）；主 metrics 透传 :301-303。**权重 map 仅被第 4 步（:211）与第 7 步（:257、:263-264）消费——weights 路径改动天然局部化。**
- **schemas.ts**（apps/server/src/http/schemas.ts）：styleBindSchema :54-96（aux max(3) 文案 :58；规则 1 解绑早退 :63-69；规则 2 legacy 早退 :70-76；规则 3 必须显式主 :77-81；规则 4 主辅重复 :82-86；规则 5 dimsSource 键值 :87-95）。**现有漏洞（本批 D4 修）**：`auxProfileIds: [p2,p2]` 通过 zod → setBookStyleBinding 两次 INSERT 撞 `UNIQUE(book_id,profile_id)` 抛 500（1117-04 执行留痕偏差⑥）。
- **routes.ts**（apps/server/src/http/routes.ts）：PUT /api/books/:bookId/style :584-611（404 守卫 :586、解绑 :589-593、legacy 归一 :594-597、逐 id 存在性+contentFromProfileRow 冻结 :598-606、buildStyleBundle+setBookStyleBinding :607-610）；GET /api/books/:bookId 回显 styleBinding :199-204（:203，repo 供数零改动即带出 weights）；DELETE 档案 409 并查 :639-648；export :952-964（outDir 组装 :962、`reply.send(await exportBook(...))` 仅 {files} :963）；parseBody :1020-1030。
- **repositories/books.ts**：`StyleBinding` :119-124；`setBookStyleBinding` :126-157（事务内 UPDATE books :129-134、DELETE 关联行 :135、主行 INSERT :138-144、辅行循环 :145-153、dims_json 全行同值 :137）；`getBookStyleBinding` :159-170（SELECT is_primary DESC, rowid ASC :160-162、JSON.parse(primary.dims_json) :168）。调用方合成 fallback：chapter.ts :111-112、polish.ts :39-40（`StyleBinding` 加必填 weights 后两处需补 `weights: {}`，纯类型适配零行为变化）。
- **迁移**：最新=0010_book_style_profiles.sql（Glob 复核，dims_json 全行同值先例 :8、回滚注释头 :3）；migrate() 动态读 user_version（apps/server/src/db/migrate.ts:16/:23，零改动）。**user_version 硬编码=改后须 10→11 共 11 处**：migrate.test.ts toBe(10) ×5（:33/:84/:96/:127/:146；:82 `= 2`、:125 `= 4`、:144 `= 9` 为造旧库语义**保留**）+ 标题 :29 + 注释 :48-49；open.test.ts toBe(10) ×3（:41/:70/:77）+ 标题 :38（「16 个核心对象」不变——0011 是 ADD COLUMN 不增对象）；migrate-prod.mjs ×3（:32/:33/:73 `uv !== 10`）。v2 回滚块 DROP TABLE book_style_profiles（migrate.test.ts:63）与 v4 块同款：**整表 DROP 后重迁（0010 重建+0011 ALTER）自洽，无需补 DROP COLUMN 行**。
- **shared/api.ts**（packages/shared/src/api.ts）：StyleBindBody :266-273；StyleBindingDto :275-279；STYLE_DIMENSIONS/AXES :350-351；ExportFormat :330；BookDto.styleBinding 已存在（1117-04 批次落地）。web client：bindStyle :203-204、exportBook :164-165（返回类型内联 `{ files: string[] }`）。
- **管线装载链**：chapter.ts binding 合成 :111-112 → loadStyleBundle/mergeStyleProfiles :113-114；polish.ts polishBenchmarks :30-61（合成 :39-40）。两处消费 merged 形态，**本批零改动**（merge 内部换权重来源即生效）。
- **BookDetailPage.tsx**（apps/web/src/pages/BookDetailPage.tsx）：StyleBindPanel :12-147（props :13-21；checked/primary/dims/touched state :23-31；toggle :37-61（上限 4 :50）；changePrimary :63-71；save 全归主 dims 补齐 :73-78；主风格 select aria-label「主风格」:100-111（placeholder「（未选主风格）」:101）；七维 select 区 :112-137；保存/解绑 :139-144）；chip「已绑定 N 个（主：…）」:412-417（**本批不动**，规格未钉）；exportFormat/exportNow :391-399（toast :395）；导出格式 select+导出按钮 :440-452；面板挂载点 :597-605。
- **ChapterReaderPage.tsx**（apps/web/src/pages/ChapterReaderPage.tsx）：exportBook fn :57-60（toast `已导出 N 个文件至 data/exports/` :59）；按钮「导出 markdown」:72-74。export.ts exportBook 返回仅 `{ files }`（:24/:36/:46，**零改动**）；routes.ts :962 已算 outDir 但未回传。
- **测试基线结构**：merge.test.ts 20 its（:37-321，helper `bundle()` :21-35 不带 weights、无 mergeVersion 断言）；repositories.test.ts 绑定 describe :212-245（2 its；调用点 :216/:231/:240、toEqual 期望 :221-225）；style.test.ts 多绑 describe 末三例 :253-347（期望 :274、:324）；style-snapshot.test.ts `snap.v===2` ×4（:78/:105/:120 用例内/:167）；api.test.ts export 用例 :73-82（只断 files）；BookDetailPage.test.tsx StyleBindPanel describe :471-576（BIND_PROFILES 5 档案 :472-478、installBindStub :480-504、3 its :518/:538/:555；「主风格」引用 :523/:567/:569；body 断言 :531-535）；ChapterReaderPage.test.tsx mockFetch :34-58（无 export 分支，新增分支为纯增量）+4 its。

## 实现级钉死清单（规格未定处钉到唯一可写，owner 可驳回）
| # | 钉细节 | 落点 |
|---|---|---|
| N1 | **legacy 判定门**：`bundle.weights != null && Object.keys(bundle.weights).length > 0` → 加权路径；缺席/空对象 → legacy 路径（实际贡献维数+主保底 1 逐字节保留）。不看 mergeVersion（其只作序列化自描述）；parseStyleBundle 容忍 mergeVersion=1 → 天然无 weights → legacy | FW-A merge.ts |
| N2 | **加权路径权重防御**：逐 id `w = weights[id]`，正有限数即用，否则 0（缺键/0/负/NaN 一律 0）；**主保底废除**（旧「1」=一维权重与百分比语义不兼容，1117-05 D1 原文）；W=Σw。W=0 → 六轴 P 空不写入（既有 ：218 行为）、样本配额全 0 后由既有顺延循环（:282-298）按主→辅序补满池子——两者均现有代码零改动自然成立 | FW-A |
| N3 | **bundle 序列化规则**：`buildStyleBundle` 仅在 weights 非空对象时写入 `weights` 键（条件展开），空/缺省不写键——legacy 语义由键缺席承载，JSON.stringify 后与改前快照逐字节同形；`mergeVersion: 1 → 2`（v 字段恒 2 语义不动）；parseStyleBundle 对 obj.weights 容错读（非对象/数组 → undefined），V1 适配路径恒 weights: undefined | FW-A |
| N4 | **客户端归一算法 normalizeWeights**（BookDetailPage.tsx 模块级导出，供纯函数单测）：①钳位 `max(1, Math.trunc(v))`（0/空串/NaN/负 → 1）；②Hamilton 最大余数法分 100 席：`seats_i = floor(100·v_i/Σv)`，余席按小数余降序逐席分配（平手=orderedIds 序：基准先、再绑定序——与 merge 样本平手序同构）；③0 席钳底：存在 seats<1 者从当前最大席（平手同序）挪 1，循环至全部 ≥1（Σ 恒=100；≤4 档案时必终止） | FW-C |
| N5 | **UI 比例状态模型**：state=`rawWeights: Record<id, number>` + `weightsTouched: boolean`。挂载初值：非 legacy 行（binding.weights 非空）→ rawWeights={...binding.weights} 回显；legacy 行 → `{}`（输入框 value='' 不预填，1117-05 条款 4）。**勾选集合变化**：非 legacy 行 → rawWeights 重置为均分默认（=normalizeWeights(全 1 seed)，2 档 {50,50}/3 档 {34,33,33}/4 档 {25,25,25,25}——「勾选变化即最大余数重归一」）且 weightsTouched 复位 false；legacy 行 → rawWeights 保持 `{}` 不预填（提示仍在、不触碰保存仍不带 weights）。**比例输入 onChange**：钳位存 raw（0 显示为 1）+ weightsTouched=true；不即时重归一（防逐键打架），归一发生在保存提交时（「客户端归一后提交」）。**基准变更不重算比例**（成员未变不静默改显示值） | FW-C |
| N6 | **保存 payload 规则**：`weights` 带上当且仅当「非 legacy 行（恒带，含单档案 {id:100}——D1 修辅权重 0 根因）或 legacy 行且 weightsTouched」；带上时值=normalizeWeights(rawWeights 缺省 seed 1)。七维 dimsSource/auxProfileIds 逻辑零改动 | FW-C |
| N7 | **zod 文案与规则编号**：现有规则 1-5 不变（规则 1 的 hasBindingFields 扩入 `v.weights !== undefined`）；新增**规则 4.5**（D4，无条件生效）：`new Set(aux).size !== aux.length` → path ['auxProfileIds'] message「辅档案不可重复勾选」（对齐规则 4「主风格不可重复勾选」风格）；新增**规则 8**（weights!==undefined 时，置于规则 3 之后——legacy/解绑早退路径 weights 静默忽略，与 aux 同为知会级边角不拦）：键集恰等 `new Set([primary, ...aux])` 否则 path ['weights'] message「比例键集必须恰为基准档案与辅档案全集」；`Σ !== 100` → path ['weights'] message「比例之和必须为 100」；值 0/小数由 zod `z.number().int().min(1)` 内建文案（parseBody 输出 `weights.<id>: …`） | FW-B |
| N8 | **aria-label 清单（唯一可写）**：基准档案 select `aria-label="基准档案"`、placeholder option「（未选基准档案）」、`title="规则全量、声线锚、画像默认归属归基准档案"`（D1 注明要求）；比例输入 `aria-label={`比例-${p.name}`}`；折叠 `<details><summary>高级设置</summary>`（无 open 属性=默认收起）；比例区标签文本「六轴与范例取样比例」；说明行原文「规则与术语始终为基准全量+辅去重补充，画像各维文本按高级设置取源，不受比例影响」；legacy 提示原文「旧绑定：按贡献维数计权（保持原行为）」 | FW-C |
| N9 | **导出回传**：routes.ts `const result = await exportBook(...); reply.send({ ...result, outDir: path.resolve(outDir) })`（path 已导入 :962 先例）；client.ts 返回类型 `{ files: string[]; outDir: string }`；阅读页 toast 模板 `已导出 ${r.files.length} 个文件至 ${r.outDir}`；详情页说明行文本「导出文件保存到本机 data/exports/，不自动下载」（`<span className="w-full text-xs text-faint">` 插在导出 Button 后独占一行）；阅读页旁注文本「保存到本机 data/exports/，不自动下载」 | FW-D |

## 任务板

### FW-A merge.ts weights 路径 + legacy 分支（纯函数 + 单测）【规格：D1 修正 M1-M4 + 随案钉细节 legacy 红线/mergeVersion 升 2】
**文件**：
- Modify `apps/server/src/style/merge.ts`（docblock :2-17 第 3 步、StyleBundleV2 :37-46、buildStyleBundle :68-84、parseStyleBundle :117-151、权重段 :195-203）
- Modify（Test）`apps/server/test/style/merge.test.ts`（helper `bundle()` :21-35 加可选 weights 参；尾部新 describe）

**Interfaces**：
- Consumes：既有 `StyleBundleV2`/`buildStyleBundle`/`parseStyleBundle`/`mergeStyleProfiles`（签名不变，只扩可选字段）
- Produces（精确形态）：
  ```ts
  export interface StyleBundleV2 {
    v: 2;
    /** 恒 2（buildStyleBundle）；parse 缺省容忍=1 → 无 weights 即 legacy——bundle 冻结的是内容非合并语义 */
    mergeVersion: number;
    boundAt: string;
    primaryProfileId: string;
    auxProfileIds: string[];
    dimsSource: Record<string, string>;
    /** 融合比例（DEC-2026-1117-05）：Record<profileId, 整数≥1>，键集=绑定全集、Σ=100（服务端 zod 保证）；
     *  缺席/空对象=legacy（贡献维数计权+主保底1）。buildStyleBundle 仅在非空对象时写入本键。 */
    weights?: Record<string, number>;
    profiles: Record<string, StyleProfileContent>;
  }
  // buildStyleBundle input 增加可选 `weights?: Record<string, number>`；mergeStyleProfiles/parseStyleBundle 签名不变
  ```

**依赖**：无（FW-B 依赖本任务）

**步骤**：
- [ ] 改 docblock :2-17 第 3 步为：「3. 权重（双分支，DEC-2026-1117-05）：bundle.weights 键集非空 → 加权路径 w_p=weights[p]（正有限数，缺键/非法=0，主保底废除）；缺席/空对象 → legacy 路径 w_p=实际贡献维数、主 max(w,1) 保底（改前行为逐字节保留）。第 4/7 步消费方式不变。」
- [ ] 改 `StyleBundleV2`（:37-46）：加 `weights?: Record<string, number>` 字段与上述 docblock；:39-40 mergeVersion 注释「恒 1」改「恒 2（buildStyleBundle）；parse 缺省容忍=1 → 无 weights 即 legacy」
- [ ] 改 `buildStyleBundle`（:68-84）：input 加 `weights?: Record<string, number>`；`:77 mergeVersion: 1` → `mergeVersion: 2`；返回对象在 dimsSource 后插入条件展开 `...(input.weights && Object.keys(input.weights).length > 0 ? { weights: input.weights } : {})`（N3：空对象不写键）
- [ ] 改 `parseStyleBundle`（:117-151）：:129 后加容错读 `const weights = obj.weights && typeof obj.weights === 'object' && !Array.isArray(obj.weights) ? (obj.weights as Record<string, number>) : undefined;`；V1 适配返回（:146）与 V2 返回（:150）分别带 `weights: undefined` / `weights`（核对：V1 return 对象字面量插入 `weights: undefined`）
- [ ] 改 `mergeStyleProfiles` 权重段（:195-203）为双分支（N1/N2 精确代码）：`const weightsInput = bundle.weights; const useWeights = weightsInput != null && Object.keys(weightsInput).length > 0;`；`for (const id of ids) weights.set(id, 0);`；`if (useWeights) { for (const id of ids) { const w = weightsInput![id]; weights.set(id, typeof w === 'number' && Number.isFinite(w) && w > 0 ? w : 0); } } else { /* 现行 :198-201 贡献维数循环原样 + :202 主保底 max 原样 */ }`；`:203 W` 计算行原样。**第 4 步（:205-219）/第 5-8 步（:221-303）逐字节不动**
- [ ] 测试 helper 适配（merge.test.ts:21-35）：`bundle(over: { ...; weights?: Record<string, number> })` 透传给 buildStyleBundle（既有 20 例不传 weights → 自动 legacy 路径 → 全部断言不变即红线证据）
- [ ] 新增单测（merge.test.ts 尾部新 describe `'weights 加权路径（DEC-2026-1117-05）'`，server +10，钉死值内嵌）：
  - `it('legacy 回归：mergeVersion=1 无 weights bundle 走贡献维数计权（主 4 维 70/辅 3 维 56 → 64）')`——手写 bundle 字面量 `{v:2, mergeVersion:1, boundAt:'2026-01-01T00:00:00.000Z', primaryProfileId:'pA', auxProfileIds:['pB'], dimsSource:{写作特点:'pB',特色词汇:'pB',章节结构:'pB'}, profiles:{pA: prof({dims:{节奏/对话/描写/情感基调 4 维文本}, axes:{...fullAxes, 叙述温度:70}, samples:4 条}), pB: prof({dims:{写作特点/特色词汇/章节结构 3 维文本}, axes:{...fullAxes, 叙述温度:56}, samples:2 条})}}`（直喂 mergeStyleProfiles 不经 build，防 mergeVersion=2 污染）→ `m.axes['叙述温度']).toBe(64)`；`parseStyleBundle(JSON.stringify(字面量))?.weights` toBeUndefined
  - `it('legacy 回归：主保底 1 生效（七维全辅 wA=1/wB=7 → 58）')`——同型字面量 dimsSource 七维全 'pB' → `toBe(58)`（主保底在 legacy 路径仍在）
  - `it('加权六轴：weights {pA:70,pB:30} → (70×70+30×56)/100=65.8→66')`——helper 带 weights → `toBe(66)`；且 `m.dims['写作特点']).toBe('B写作')`（七维不受比例影响）
  - `it('加权样本席位：70/30 → pA 2 席 pB 1 席')`——exact 2.1/0.9 → floor 2/0、余席 0.9>0.1 归 pB；按 `s.id.startsWith('pA:')` 计数 2、`'pB:'` 计数 1
  - `it('加权且辅缺轴 → 权重重归一：pB 无叙述温度 → 该轴仅 pA 参与 → 70')`
  - `it('主保底废除：加权路径七维全辅 weights {50,50} → 63（legacy 同输入为 58）')`——(70×50+56×50)/100=63；`toBe(63)`
  - `it('weights 缺键/非法防御：{pA:100} 缺 pB → pB 权 0：六轴取 pA 原值 70、样本 3 席全 pA')`
  - `it('weights 全非法（W=0）防御：{pA:0,pB:0} → 六轴不写入（Object.keys(m.axes).length===0）、样本顺延主→辅补满（ids toEqual [\'pA:a0\',\'pA:a1\',\'pB:b0\']，chapterNo=1、pA 池 4 条 pB 池 2 条）')`
  - `it('mergeVersion 与 weights 序列化门：build 带 weights → mergeVersion===2 且 JSON 含 "weights"、parse 回读 toEqual {pA:70,pB:30}；不带 → 序列化无 weights 键、parse weights undefined；V1 rulesJson fixture → weights undefined')`
  - `it('单档案加权 weights {p1:100}：输出与 legacy 单主 deep-equal（六轴原值/样本 3/dims 全主）')`
- [ ] 验证：`pnpm --filter @inkforge/server exec vitest run test/style/merge.test.ts` 期望 `30 passed`（既有 20 零适配全绿 = legacy 红线证据 + 新增 10）；`pnpm --filter @inkforge/server typecheck` exit 0
- [ ] commit：`feat(server): 融合比例 weights 路径与 legacy 分支（merge.ts 双分支钉死，mergeVersion=2）`，正文 `verify: merge.test 30 绿/server typecheck 0 错`

### FW-B 迁移 0011 + 仓储 + shared 类型 + zod + routes PUT/GET + D4 重复 400【规格：D1/D4 + 随案钉细节存储条款】
**文件**：
- Create `apps/server/src/db/migrations/0011_book_style_weights.sql`
- Modify `apps/server/src/db/repositories/books.ts`（StyleBinding :119-124、setBookStyleBinding :126-157、getBookStyleBinding :159-170）
- Modify `packages/shared/src/api.ts`（StyleBindBody :266-273、StyleBindingDto :275-279）
- Modify `apps/server/src/http/schemas.ts`（styleBindSchema :54-96）
- Modify `apps/server/src/http/routes.ts`（PUT :584-611）
- Modify `apps/server/src/pipeline/chapter.ts`（:112 合成 fallback 补 `weights: {}`）、`apps/server/src/pipeline/polish.ts`（:40 同）——纯类型适配零行为变化
- Modify `apps/server/scripts/migrate-prod.mjs`（:32/:33/:73）
- Modify（Test）`apps/server/test/db/migrate.test.ts`、`apps/server/test/db/open.test.ts`、`apps/server/test/db/repositories.test.ts`、`apps/server/test/http/style.test.ts`

**Interfaces**：
- Consumes：FW-A `buildStyleBundle`（weights 可选参）；migrate() 顺序语义（user_version=11 自动补跑 0011）
- Produces（精确签名）：
  ```sql
  -- 0011_book_style_weights.sql 全文：
  -- 0011：融合比例（DEC-2026-1117-05）：book_style_profiles 每行 weights_json（全行同值，先例=0010 dims_json）。
  -- '{}' = legacy（无比例，按贡献维数计权）；非空 = Record<profileId,整数≥1> 且 Σ=100（服务端 zod 保证）。
  -- 回滚：ALTER TABLE book_style_profiles DROP COLUMN weights_json;（user_version 不回退，旧代码零影响；SQLite ≥3.35 支持）
  ALTER TABLE book_style_profiles ADD COLUMN weights_json TEXT NOT NULL DEFAULT '{}';
  ```
  ```ts
  export interface StyleBinding {
    primaryProfileId: string;
    auxProfileIds: string[];
    /** 七维→贡献档案 id；空对象=全归主（0010 存量行形态） */
    dimsSource: Record<string, string>;
    /** 融合比例（0011）：Record<profileId, 整数≥1> Σ=100；空对象=legacy 按贡献维数计权（DEC-2026-1117-05） */
    weights: Record<string, number>;
  }
  // shared api.ts：
  // StyleBindBody 追加：/** 融合比例：客户端最大余数归一后提交（Σ=100、整数≥1、键集=绑定全集）；缺省=legacy */ weights?: Record<string, number>;
  // StyleBindingDto 追加：/** 空对象=legacy（旧绑定：贡献维数计权） */ weights: Record<string, number>;
  ```
- styleBindSchema object 体追加 `weights: z.record(z.string(), z.number().int().min(1)).optional()`；superRefine 增规则 4.5 与规则 8（N7 全文）

**依赖**：FW-A（buildStyleBundle weights 参）

**步骤**：
- [ ] 新建 `0011_book_style_weights.sql`，全文如 Produces SQL（含回滚注释头）
- [ ] migrate.test.ts 适配：5 处 `toBe(10)` → `toBe(11)`（:33/:84/:96/:127/:146）；:29 标题「user_version=10」→「user_version=11」；:48-49 注释「0003-0010」→「0003-0011」「…+0010+0011」；v2 块（:51-64）与 v4 块**不加 DROP COLUMN**（整表 DROP 后重迁 0010 重建+0011 ALTER 自洽——勿画蛇添足）；v9 块（:136-146）断言链追加 `weights_json`：SELECT 加该列并断言回填行 `weights_json === '{}'`
- [ ] migrate.test.ts 新增（server +1）：`it('0011 weights 列：v10 旧库升级，绑定行 weights_json 存在且存量行=\'{}\'', ...)`——沿 :136 v9 块模式：全量迁移 → `DROP TABLE book_style_profiles` → 手工 INSERT books(style_profile_id='p-legacy') + INSERT book_style_profiles(book_id,profile_id,is_primary,dims_json,created_at) 一行（v10 形态无 weights 列需先 DROP 再造？——**否**：直接对已迁移库 `db.exec('DROP TABLE book_style_profiles')` 后按 0010 列集手工 CREATE TABLE 同列集并 INSERT 模拟 v10 态）+ `db.pragma('user_version = 10')` + `migrate(db)` → 断言 `user_version===11`、`pragma_table_info('book_style_profiles')` 含 weights_json、该绑定行 weights_json==='{}'
- [ ] open.test.ts 适配：3 处 `toBe(10)` → `toBe(11)`（:41/:70/:77）；:38 标题「user_version=10」→「user_version=11」（「16 个核心对象」不变）；首例 :44 后追加列断言 `expect(db.prepare("SELECT name FROM pragma_table_info('book_style_profiles') WHERE name = 'weights_json'").all()).toHaveLength(1);`
- [ ] migrate-prod.mjs：:32 `uv !== 10` → `uv !== 11`、:33 文案同改、:73 `uv !== 10 ||` → `uv !== 11 ||`
- [ ] repositories/books.ts：`StyleBinding` 加必填 `weights` 字段（如 Produces）；`setBookStyleBinding` :137 后加 `const weightsJson = JSON.stringify(binding.weights ?? {});`，两处 INSERT（:138-144/:145-153）列集与 values 各加 `weights_json`/`weightsJson`（全行同值）；`getBookStyleBinding` :160-162 SELECT 加 `weights_json`、返回对象加 `weights: JSON.parse(primary.weights_json) as Record<string, number>`（dims 同款直 parse）
- [ ] chapter.ts :112 与 polish.ts :40 合成 fallback 各补 `weights: {}`（typecheck 驱动，行为零变化）
- [ ] shared/api.ts：StyleBindBody/StyleBindingDto 按 Produces 加字段
- [ ] schemas.ts：object 加 weights 字段；superRefine：`hasBindingFields`（:62）扩入 `|| v.weights !== undefined`；规则 4（:82-86）后插入规则 4.5（`new Set(aux).size !== aux.length` → 「辅档案不可重复勾选」path ['auxProfileIds']）；规则 5（:87-95）后插入规则 8（N7 两文案，path ['weights']）——置规则 3 早退之后，legacy/解绑早退路径天然跳过（知会级边角不拦，沿 1117-05 知会条）
- [ ] routes.ts PUT（:584-611）：:597 后加 `const weights = typeof body.profileId === 'string' ? {} : (body.weights ?? {});`；:608 `buildStyleBundle({...})` 加 `weights: Object.keys(weights).length > 0 ? weights : undefined`；:609 `setBookStyleBinding(db, bookId, { primaryProfileId, auxProfileIds, dimsSource, weights }, ...)`。GET/DELETE/409 零改动（repo 供数自动带 weights）
- [ ] repositories.test.ts 适配：:216/:231/:240 三处 `setBookStyleBinding` 调用各补 `weights: {}`；:221-225 toEqual 期望补 `weights: {}`
- [ ] repositories.test.ts 新增（server +1）：`it('setBookStyleBinding weights 往返：60/40 全行同值落库读回；weights={} 读回空对象（legacy 标记）')`——bind `{primaryProfileId:'pA', auxProfileIds:['pB'], dimsSource:{}, weights:{pA:60,pB:40}}` → `getBookStyleBinding` toEqual `{primaryProfileId:'pA', auxProfileIds:['pB'], dimsSource:{}, weights:{pA:60,pB:40}}`；`SELECT weights_json FROM book_style_profiles WHERE book_id=?` 两行相等且 `==='{"pA":60,"pB":40}'`；重绑 weights:{} → 回读 `weights` toEqual `{}` 且行值 `'{}'`
- [ ] style.test.ts 适配：:274 期望补 `weights: {}`；:324 期望补 `weights: {}`
- [ ] style.test.ts 新增（server +2，追加于 :347 后同 describe）：
  - `it('weights 校验矩阵：和≠100/键集多余/键集缺失/值 0/辅内部重复/解绑带 weights → 400 人话')`——沿 :285 矩阵风格，6 payload 逐个 `expect(r.statusCode).toBe(400)` 且 error 分别含：「比例之和必须为 100」（`{primaryProfileId:p1, auxProfileIds:[p2], weights:{p1:60,p2:39}}`）、「比例键集必须恰为基准档案与辅档案全集」（键含未勾选 p3：`weights:{p1:50,p2:40,p3:10}`）、「比例键集必须恰为基准档案与辅档案全集」（缺 p3：`{primaryProfileId:p1, auxProfileIds:[p2,p3], weights:{p1:60,p2:40}}`）、statusCode 400 即可（值 0 zod 内建文案：`weights:{p1:0,p2:100}`）、「辅档案不可重复勾选」（`auxProfileIds:[p2,p2]`，**D4 回归：不再 500**）、「解绑请求不得携带绑定字段」（`{profileId:null, weights:{p1:100}}`）
  - `it('weights 成功路径：binding 回显 weights+快照 mergeVersion=2 带 weights；legacy body 快照 mergeVersion=2 无 weights 键', ...)`——PUT `{primaryProfileId:p1, auxProfileIds:[p2], weights:{p1:60,p2:40}}` → 200；GET `styleBinding` toEqual `{primaryProfileId:p1, auxProfileIds:[p2], dimsSource:{}, weights:{p1:60,p2:40}}`；`JSON.parse(styleSnapshotJson)` 断言 `mergeVersion===2`、`weights` toEqual `{p1:60,p2:40}`、`v===2`；另一书 PUT `{profileId:p1}` → 快照 `mergeVersion===2`、`!('weights' in snap2)`、binding.weights toEqual `{}`；末尾解绑两书+删档案（沿文件清理惯例）
- [ ] 验证：`pnpm --filter @inkforge/server exec vitest run test/db test/http/style.test.ts test/http/style-snapshot.test.ts` 期望全绿（migrate/open 既有+1、repositories 既有+1、style 既有+2；style-snapshot 既有 4 例零适配——snap.v===2 断言不受影响）；`pnpm --filter @inkforge/server typecheck` exit 0；`pnpm --filter @inkforge/shared typecheck` exit 0
- [ ] commit：`feat(server): 融合比例存储与校验链（迁移 0011/仓储 weights_json/zod 规则 4.5+8/快照 V2 带 weights）`，正文 `verify: db+style 定向全绿/server+shared typecheck 0 错`

### FW-C 绑定面板融合比例 UX【规格：D1 全部 UI 条款 + 随案钉细节 legacy UI 行为】
**文件**：
- Modify `apps/web/src/pages/BookDetailPage.tsx`（StyleBindPanel :12-147 整段改造）
- Modify（Test）`apps/web/src/pages/BookDetailPage.test.tsx`

**Interfaces**：
- Consumes：`StyleBindBody.weights?`（FW-B）；`book.styleBinding`（回显含 weights）；`STYLE_DIMENSIONS`（shared）
- Produces（精确签名，模块级导出供纯函数单测）：
  ```ts
  export function normalizeWeights(values: Record<string, number>, orderedIds: string[]): Record<string, number>
  // 面板 props：binding 类型扩为 { primaryProfileId: string; auxProfileIds: string[]; dimsSource: Record<string,string>; weights?: Record<string,number> } | null
  // 面板新 state：rawWeights: Record<string, number>；weightsTouched: boolean；legacyRow = binding !== null && Object.keys(binding.weights ?? {}).length === 0
  ```

**依赖**：FW-B（zod 校验与回显字段在场）

**步骤**：
- [ ] 实现 `normalizeWeights`（模块级、:12 面板上方，N4 全文）：钳位→Hamilton 100 席→0 席钳底循环；注释钉死三步与平手序（基准先、再绑定序）
- [ ] 面板 state 改造（:23-31 基础上加）：`rawWeights` 初值=非 legacy 行 `{...binding.weights}`、否则 `{}`；`weightsTouched` 初值 false；`legacyRow` 按 Produces 定义
- [ ] `toggle`（:37-61）：在既有 checked/primary/dims 逻辑后追加——成员变化后 `const newIds = [primaryNP, ...next.filter(id => id !== primaryNP)]`（primaryNP=变化后基准）；**非 legacy 行**：`setRawWeights(normalizeWeights(Object.fromEntries(newIds.map((id) => [id, 1])), newIds))` + `setWeightsTouched(false)`（N5：重置均分默认）；**legacy 行**：`setRawWeights({})` + `setWeightsTouched(false)`（不预填）
- [ ] 渲染改造（按 N8 清单逐一落点）：①:100-111 select `aria-label="主风格"` → `"基准档案"`、placeholder option 文本「（未选基准档案）」、加 `title="规则全量、声线锚、画像默认归属归基准档案"`；②:112-137 七维区整块移入 `<details><summary>高级设置</summary>…</details>`（无 open 属性）；③高级设置块之后插入比例区（`checked.length >= 2` 才渲染）：标签 `<span className="text-sm font-medium">六轴与范例取样比例</span>`；`legacyRow && <span className="text-xs text-faint">旧绑定：按贡献维数计权（保持原行为）</span>`；说明行 `<p className="mt-1 text-xs text-faint">规则与术语始终为基准全量+辅去重补充，画像各维文本按高级设置取源，不受比例影响</p>`；每勾选档案（主先序）`<label>{p.name}<input type="number" min={1} aria-label={`比例-${p.name}`} value={rawWeights[p.id] ?? ''} onChange={(e) => { const n = Math.trunc(Number(e.target.value)); setRawWeights({ ...rawWeights, [p.id]: Number.isFinite(n) && n >= 1 ? n : 1 }); setWeightsTouched(true); }} /></label>`
- [ ] `save`（:73-78）改造（N6 精确代码）：dimsSource 补齐逻辑原样；`const ids = [primary, ...checked.filter((id) => id !== primary)]; const body: StyleBindBody = { primaryProfileId: primary, auxProfileIds: checked.filter((id) => id !== primary), dimsSource }; if (!legacyRow || weightsTouched) body.weights = normalizeWeights(Object.fromEntries(ids.map((id) => [id, rawWeights[id] ?? 1])), ids); onBind(body);`
- [ ] 测试适配（BookDetailPage.test.tsx，列明 2 处）：
  - 用例一（:518-536）：:523 `getByLabelText('主风格')` → `'基准档案'`；断言比例初值 `(getByLabelText('比例-风格A') as HTMLInputElement).value).toBe('50')`、B 同 `'50'`；七维改前插入折叠展开 `(screen.getByText('高级设置').closest('details') as HTMLDetailsElement).open = true;`；body 断言（:531-535）补 `weights: { p1: 50, p2: 50 }`
  - 用例三（:555-575）：:567/:569 `'主风格'` → `'基准档案'`（fixture binding 无 weights → legacy）；追加断言 `getByText('旧绑定：按贡献维数计权（保持原行为）')` 在场、`(getByLabelText('比例-风格A') as HTMLInputElement).value === ''`；:572 维度来源-对话 断言前先展开 details
- [ ] 测试新增（web +7）：
  - `it('三档默认均分平手余数归基准：勾 3 档比例显示 34/33/33，保存 weights {p1:34,p2:33,p3:33}')`——勾 A/B/C → 三输入 value 断言 '34'/'33'/'33' → 保存 → body.weights toEqual `{ p1: 34, p2: 33, p3: 33 }`
  - `it('比例输入 0 按 1 处理：回显 \'1\'，保存归一 {p1:2,p2:98}')`——勾 A/B → `fireEvent.change(getByLabelText('比例-风格A'), { target: { value: '0' } })` → 断言该输入 value `=== '1'` → 保存 → weights toEqual `{ p1: 2, p2: 98 }`（钳位 [1,50] → Hamilton [2,98]）
  - `it('legacy 行未触碰：提示在场、比例不预填、勾选变化后保存 body 无 weights 键')`——fixture `styleBinding:{primaryProfileId:'p1',auxProfileIds:['p2'],dimsSource:{},weights:{}}` → 断言提示文本+比例输入 ''；勾 C → 输入仍 ''；保存 → `JSON.parse(body)` toEqual `{ primaryProfileId:'p1', auxProfileIds:['p2','p3'], dimsSource:{…七键全 'p1'…} }`（toEqual 三键精确形态即证无 weights 键）
  - `it('legacy 行触碰比例后保存带 weights：70/30 原样归一 {p1:70,p2:30}')`——同 fixture → 比例-风格A 输 '70'、比例-风格B 输 '30' → 保存 → weights toEqual `{ p1: 70, p2: 30 }`
  - `it('单档案保存 weights {p1:100}：无比例区渲染')`——binding null → 勾 A（仅 1 个）→ `queryByLabelText('比例-风格A')` 为 null → 保存 → weights toEqual `{ p1: 100 }`
  - `it('加权行回显：binding.weights {p1:60,p2:40} → 输入 60/40，未触碰保存原样带出')`——fixture `weights:{p1:60,p2:40}` 且无提示文本 → 断言输入 '60'/'40' → 保存 → weights toEqual `{ p1: 60, p2: 40 }`
  - `it('normalizeWeights 纯函数：悬殊输入钳底循环 {a:97,b:1,c:1,d:1}；已归一输入幂等')`——`import BookDetailPage, { normalizeWeights } from './BookDetailPage'`；`normalizeWeights({a:1000,b:1,c:1,d:1}, ['a','b','c','d'])` toEqual `{ a: 97, b: 1, c: 1, d: 1 }`；`normalizeWeights({x:50,y:50}, ['x','y'])` toEqual `{ x: 50, y: 50 }`
- [ ] 验证：`pnpm --filter @inkforge/web exec vitest run src/pages/BookDetailPage.test.tsx` 期望全绿（既有用例+适配 2+新增 7）；`pnpm --filter @inkforge/web typecheck` exit 0
- [ ] GUI 未验证（owner 真实测试）——提交信息注明
- [ ] commit：`feat(web): 绑定面板融合比例 UX（基准档案更名/比例区/高级设置折叠/legacy 只读提示）`，正文 `verify: BookDetailPage 定向全绿/web typecheck 0 错；GUI 未验证（owner 真实测试）`

### FW-D 导出澄清【规格：D3（M6）】
**文件**：
- Modify `apps/server/src/http/routes.ts`（export :952-964）
- Modify `apps/web/src/api/client.ts`（:164-165）
- Modify `apps/web/src/pages/ChapterReaderPage.tsx`（:57-60、:72-74）
- Modify `apps/web/src/pages/BookDetailPage.tsx`（导出区 :450-452 后）
- Modify（Test）`apps/server/test/http/api.test.ts`（:73-82）、`apps/web/src/pages/ChapterReaderPage.test.tsx`（mockFetch :34-58 + 新 it）、`apps/web/src/pages/BookDetailPage.test.tsx`（新 it）

**Interfaces**：
- Consumes：`exportBook` 返回 `{ files }`（export.ts 零改动）；routes.ts 已导入 path（:962 先例）
- Produces：export 端点响应 `{ files: string[]; outDir: string }`（outDir=`path.resolve(outDir)` 绝对路径，N9）；client.ts exportBook 返回类型同形

**依赖**：无（与 FW-B/C 无文件交集；按串行排在 FW-C 后）

**步骤**：
- [ ] routes.ts :963 改：`const result = await exportBook(db, bookId, outDir, rawFormat as (typeof formats)[number]); reply.send({ ...result, outDir: path.resolve(outDir) });`（exportBook 与格式校验零改动）
- [ ] client.ts :165：`req<{ files: string[]; outDir: string }>`；注释补「outDir=服务端落盘目录绝对路径（D3 澄清：保存到本机，不自动下载）」
- [ ] ChapterReaderPage.tsx：:59 toast 改 `` setMsg(`已导出 ${r.files.length} 个文件至 ${r.outDir}`) ``；:72-74 按钮文本「导出 markdown」→「导出全书正文（Markdown）」，按钮后加 `<span className="text-xs text-muted">保存到本机 data/exports/，不自动下载</span>`
- [ ] BookDetailPage.tsx：:452 导出 Button 之后插入 `<span className="w-full text-xs text-faint">导出文件保存到本机 data/exports/，不自动下载</span>`（:395 详情页 toast 本批不动）
- [ ] api.test.ts 适配（:73-82）：文件头加 `import path from 'node:path';`；:77-78 改 `const body = ex.json() as { files: string[]; outDir: string }; expect(body.files.length).toBeGreaterThanOrEqual(1); expect(path.isAbsolute(body.outDir)).toBe(true); expect(body.outDir).toContain('exports');`
- [ ] ChapterReaderPage.test.tsx：mockFetch（:34-58）加分支 `if (url.endsWith('/api/books/b1/export')) return stubResp({ files: ['001-第一章.md'], outDir: 'X:\\mock\\data\\exports\\测试书' });`（纯增量）；新增（web +1）：`it('导出澄清：按钮「导出全书正文（Markdown）」+旁注；toast 报 outDir 绝对路径')`——renderPage → 断言按钮名与旁注文本在场 → 点击 → `await screen.findByText(/已导出 1 个文件至 X:\\mock\\data\\exports\\测试书/)`
- [ ] BookDetailPage.test.tsx 新增（web +1）：`it('导出区说明行：保存位置说明可见（D3 澄清）')`——installFetchStub+render → `await waitFor(() => expect(screen.getByText('导出文件保存到本机 data/exports/，不自动下载')).toBeTruthy());`
- [ ] 验证：`pnpm --filter @inkforge/server exec vitest run test/http/api.test.ts test/e2e/phaseA.mock.e2e.test.ts` 期望全绿（export 相关既有用例零破坏——e2e :69 只断 statusCode/files 超集兼容）；`pnpm --filter @inkforge/web exec vitest run src/pages/ChapterReaderPage.test.tsx src/pages/BookDetailPage.test.tsx` 期望全绿；`pnpm --filter @inkforge/web typecheck` exit 0
- [ ] GUI 未验证（owner 真实测试）——提交信息注明
- [ ] commit：`feat(export): 导出澄清（端点回传 outDir/阅读页文案与 toast/详情页说明行）`，正文 `verify: api+两页定向全绿/web typecheck 0 错；GUI 未验证（owner 真实测试）`

### FW-E 全量收口验证（验证链硬序，只读）
**文件**：无新改动（决策日志执行留痕补记由主模型收口时处理）

**Interfaces**：Consumes：FW-A~D 全部交付物。Produces：验证链五环证据 + 提交链（只 commit 不 push）

**依赖**：FW-A~D 全部

**步骤**：
- [ ] 静态：`pnpm typecheck` 全 workspace exit 0；`pnpm lint` 零输出
- [ ] 定向复核：`pnpm --filter @inkforge/server exec vitest run test/db test/style test/http/style.test.ts test/http/style-snapshot.test.ts test/http/api.test.ts` + `pnpm --filter @inkforge/web exec vitest run src/pages/BookDetailPage.test.tsx src/pages/ChapterReaderPage.test.tsx` 期望全绿
- [ ] 全量：`pnpm -r --if-present run test` 期望 server 316（302+14）、web 98（89+9）、shared 2——**合计 416 ≥ 基线 393**，逐包数核对只增不减；各卡报数为增量口径，绝对数不符先核对口径、不得改测试凑数
- [ ] 冒烟：`pnpm --filter @inkforge/web build` exit 0（体积与基线同数量级）
- [ ] 安全比基线：`pnpm audit --prod` 零新增；提交前逐提交秘密扫描；核对提交链只 commit 未 push、无 --no-verify、无 git add -A
- [ ] GUI 行核对：FW-C/FW-D 提交信息含「GUI 未验证（owner 真实测试）」

## 自审五查（写毕自查，已就地修）
1. **规格覆盖**：D1 weights 只驱动六轴+样本（FW-A 双分支、第 4/7 步消费、七维/规则/术语零改动）✓；基准更名+注明（N8 title）✓；比例区标签+说明行原文 ✓；禁 0% 钳 1（FW-C onChange 钳位 + 用例二）✓；默认均分余数归基准（N5 重置 + 用例三档平手 34/33/33）✓；七维收进高级设置默认收起 ✓；legacy 只读提示+不预填+未触碰不带 weights（N5/N6 + 用例四）✓；随案钉细节存储（0011/bundle V2 weights/mergeVersion=2/parse 容忍/setBookStyleBinding 同事务=既有单事务内 INSERT/StyleBindBody+Dto/GET 回显）✓（FW-B）；legacy 红线（全局约束 2 双证据 + FW-A 用例 1-2）✓；D4 辅重复 400（规则 4.5 + 校验矩阵第 5 payload）✓；D3 导出澄清（FW-D 四文件 + toast outDir）✓；D2 不做（后续候选节）✓。
2. **步骤唯一可写**：每步一动作+可核对结果；无 TBD/「适当处理」。自查修正 4 处：①N5 原稿「输入即重归一」会逐键打架且与「客户端归一后提交」冲突→钉为「勾选变化重置默认、输入钳位存 raw、保存时归一」三段式并给两用例钉死值（'0'→显示 '1'→保存 [2,98]）；②legacy 行勾选变化是否预填原稿未定→钉「保持空、提示仍在、保存仍不带 weights」并入用例四；③0011 升级测试原稿「v10 旧库」与 DROP TABLE 后手工造行冲突（行无 weights 列）→钉「DROP 后按 0010 列集手工 CREATE+INSERT 模拟 v10 态」；④merge.test helper 原稿未提适配→补「bundle() 加可选 weights 参（列明适配）」。
3. **类型一致**：`weights?: Record<string, number>`（StyleBindBody/StyleBundleV2/buildStyleBundle input）与 `weights: Record<string, number>`（StyleBinding/StyleBindingDto/回显）前后文一致；`legacyRow` 判定（空对象/缺席=legacy）在 repo/merge/UI 三处语义一致（'{}' ⇔ 键缺席 ⇔ legacy 路径）；「基准档案」aria-label 在 FW-C 步骤与两处测试适配引用一致；outDir 在 routes/client/两页/两测试同形。
4. **隐含输入五类各配测试**：weights 含未勾选 id（校验矩阵键集多余 400）✓；和≠100（矩阵第 1 payload）✓；单档案勾选 weights 形态（FW-C 用例五 {p1:100} + FW-A 用例 10 merge 级）✓；legacy 行编辑不触碰比例（FW-C 用例四含勾选变化）✓；解绑路径（矩阵第 6 payload 解绑带 weights 400 + 既有解绑用例 :294 不带 weights 仍绿）✓；归一化平手（FW-C 用例三档 34/33/33 + 纯函数悬殊钳底 97/1/1/1 + N4 平手序钉死）✓；另 W=0 防御/缺键防御/mergeVersion 判别门（FW-A 用例 7-9）✓。
5. **比例**：server +14（merge 10 + migrate 1 + repositories 1 + style 2）→ 316；web +9（BookDetailPage 7 + ChapterReaderPage 2）→ 98；shared 2 不变；终账 **416 ≥ 393** 逐任务可加总核对（FW-A +10 server、FW-B +4 server、FW-C +7 web、FW-D +2 web +api.test 断言适配）；改动量与风险成比例——merge 双分支 10 例占 server 大头（算法风险集中处），UI 7 例聚焦钉死值断言。

## 后续候选（本批不做；D2 融合成品钉死延后，owner 实测融合感后另批）
- **融合配方实体**（recipe 引用来源档案 live 重算；优先形态＞存全量并集的档案化——后者须另钉 metrics/source_hash/版本/重蒸/删除语义，DEC-2026-1117-05 D2 原文）
- **融合预览**：绑定前试算注入投影（六轴/样本席位/rulesText 长度）只读展示
- **浏览器下载**：导出 zip/单文件下载（D3 明确列 backlog 本轮不塞）
- **loadMergedProfile 抽取**：chapter.ts:111-114 与 polish.ts:39-42 绑定装载链同构（DEC-2026-1117-05 知会 smell「本批可顺手抽」，本批未顺手做则入此）
- **normalizeDimsSource 无生产消费方**清理、**{styleProfileId, styleSnapshotJson} data clump** 收编（同批登记 smell）

## 执行完成记录（2026-11-18 批次收口）
- **owner 会中令主模型独自完成、不外派**：FW-A~D 主模型亲执串行五提交——FW-A 1f85cfa / FW-B aea6b7b / FW-C 273288a / FW-D 4eb1b8e / 1c5294f（自查修复：normalizeWeights 空入参除零卫语句）。提交链只 commit、无 --no-verify、无 git add -A、逐提交秘密扫描零命中。
- **主模型对码复核修正两处（相对本计划）**：① FW-A 用例 2 fixture 由 abProfiles 改为 pB 七维文本俱全字面量——abProfiles 型辅档案仅 3 维文本、其余 4 维回落主 → 实际计权 4/3=64 而非 1/7=58（回归用例须语义等价复刻，非仅形状对齐）；② FW-B 补计划漏列的 test/http/polish.test.ts 与 test/pipeline/chapter.test.ts 两处合成 binding fixture（weights:{}，typecheck 兜底抓出）。
- **迁移前置快照**：apps/server/data/backups/inkforge-pre0011-202611171547.db（VACUUM INTO 双侧 integrity ok、uv=10）；0011 已落码树，下次服务启动自动应用。
- **验证链五环（主模型亲跑）**：静态（typecheck 全 workspace 0 错、lint 零输出）→ 定向（各卡全绿）→ 全量（server 316+web 98+shared 2=**416**，与本计划预计终账逐项吻合、基线 393 只增不减）→ 冒烟（web build 391.29kB）→ 安全（audit --prod 零新增）。
- **legacy 逐字节红线双证据**：merge.test 既有 20 例零适配全绿 + mergeVersion=1 直喂 fixture 回归 2 例（用例 1-2）。
- **推送前两轴审查**：owner 令不外派，code-review 子代理由主模型亲审替代——Standards 轴 1 项防御缺口（已修 1c5294f）、Spec 轴无缺失无 scope creep。
- **GUI 未验证（owner 真实测试）**：点位清单见 docs/decision-log.md DEC-2026-1117-05 执行留痕补记。
