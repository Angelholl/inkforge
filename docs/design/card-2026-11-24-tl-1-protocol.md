# 执行卡 TL-1：张力行协议六段落点与 lever 解析映射（server+shared）

- 前置依赖：无（串行第 1 张，开工前确认工作树干净、上卡已收口）。
- 计划真值源：`docs/plans/2026-11-24-tension-levers.md` §3.1/§5；行号=2026-11-24 实读，漂移以锚点文本定位并标注「以实际为准」。

## Consumes / Produces

- Consumes：无。
- Produces（后续卡依赖的精确签名）：
  1. `packages/shared/src/fusion.ts` —— `TensionRowDto` 扩三键：
     ```ts
     export interface TensionRowDto {
       entry: string;
       mdSide: string;
       profileSide: string;
       nature: '拉扯' | '冗余' | '缺口';
       suggestion: string;
       /** 落点三类：dim=该维改跟随档案 / weights=占比挪动 / none=门外无旋钮（DEC-2026-1124-04） */
       lever: 'dim' | 'weights' | 'none';
       /** lever='dim' 时必有：∈ STYLE_DIMENSIONS 八维名 */
       dim?: string;
       /** lever='weights' 且服务端映射成功时必有：该书已绑集合内按名唯一命中的档案 id */
       profileId?: string;
     }
     ```
  2. `apps/server/src/fusion/tension.ts` —— `TensionRow` 扩 `lever: 'dim'|'weights'|'none'`、`dim?: string`、`profileName?: string`（协议层原始档案名，透传给 routes 映射）；`parseTensionRows(text: string): { rows: TensionRow[]; invalid: number }` 签名不变。
  3. analyze 响应 `FusionTensionDto.rows` 形状升级（前端同仓同版，向后兼容由唯一消费者保证）。

## 一、根因

融合门白话化后（f6b7906），张力对照行只有建议文本、没有把手：owner 无法在门里对每条冲突选边。本卡把模型建议结构化——协议加第 6 段「落点」，解析出 `lever`，占比类在服务端映射到该书已绑档案 id，为 TL-4 门内三选供数据。

## 二、改动文件（不越界清单）

| 文件 | 动作 | 锚点（Modify 行号） |
| --- | --- | --- |
| `packages/shared/src/fusion.ts` | Modify | `TensionRowDto` :20-26 扩三键 |
| `apps/server/src/fusion/tension.ts` | Modify | `TensionRow` :15-22；prompt :40-73（协议行 :60、负约束 :61）；`parseTensionRows` :75-100 |
| `apps/server/src/http/routes.ts` | Modify | analyze 路由 :1170-1283 内三处：system 文案 :1260；已绑查询 :1191-1195；rows 组装 :1268-1279 |
| `apps/server/test/fusion/tension.test.ts` | Modify | 夹具 :5-10、EXPECTED :12-34、断言 :37-56、超限例 :58-69 |
| `apps/server/test/http/fusion-gate.test.ts` | Modify | analyze describe 内 :16-36 夹具、:78-91 主例、新增映射例 |

禁触：`apps/server/src/fusion/apply.ts`、`fusion/fingerprint.ts`、`style/merge.ts`、`db/repositories/books.ts`、degraded 三分支语义（routes.ts:1240-1246/:1269-1277/:1280-1282）、timeoutMs 120000（:1265）、ROWS_CAP 与静默丢语义。

## 三、改法（每步一个动作 + 可核对结果）

### 阶段 A：shared 类型（先型后测）

- [ ] A1. `packages/shared/src/fusion.ts`：按 Consumes 1 精确形状改 `TensionRowDto`（:20-26），注释带「DEC-2026-1124-04」。核对：文件保存无语法错（阶段 F typecheck 兜底）。

### 阶段 B：协议与解析先红

- [ ] B1. `apps/server/test/fusion/tension.test.ts`：`TENSION_TEXT`（:5-10）改混排夹具——row1 六段 `… | 维度=尺度`、row2 六段 `… | 占比=仙家`、row3 **保留旧 5 段**；`EXPECTED`（:12-34）每行补 `lever`/`dim?`/`profileName?` 钉值（row1 `{lever:'dim',dim:'尺度'}`、row2 `{lever:'weights',profileName:'仙家'}`、row3 `{lever:'none'}`）。
- [ ] B2. 同文件新增用例（各 2-5 分钟粒度，一次一例）：
  - [ ] B2a. `维度=视角`（非八维）→ `{lever:'none'}`，`dim` 为 undefined；
  - [ ] B2b. 落点段空串 / 未知前缀写法（如 `参考档案`）→ `{lever:'none'}`；
  - [ ] B2c. 六段 + 性质词非法 → invalid 恰 1（nature 校验在 6 段下仍生效）；
  - [ ] B2d. 建议段含 `|` 致 7 段 → 丢行计 invalid（现状语义保持）；
  - [ ] B2e. prompt 断言更新（:71-90 例）：协议行含「落点」段说明，含 `维度=`、`占比=`、`门外` 三类写法字样。
- [ ] B3. 跑红。核对：编译错（`lever` 缺失）或断言红，记录红点。

### 阶段 C：tension.ts 实现转绿

- [ ] C1. `tension.ts:15-22` `TensionRow` 扩三键（`profileName?: string` 注释注明「占比类原始名，映射到 id 留给 routes 层」）。
- [ ] C2. 文件头新增 `import { STYLE_DIMENSIONS, type StyleDimension } from '@inkforge/shared';`（该文件现无 import，:1-5 注释块之后）。核对：normalizeLanding 的 dim 收窄需要该类型。
- [ ] C3. 新增模块内纯函数 `normalizeLanding(landing: string): Pick<TensionRow,'lever'|'dim'|'profileName'>`：trim 后空串→`{lever:'none'}`；前缀 `维度=`→名 ∈ `STYLE_DIMENSIONS` 则 `{lever:'dim',dim:名}`（类型收窄 `as StyleDimension`）否则 none；前缀 `占比=`→名非空 `{lever:'weights',profileName:名}`、空则 none；其余→none。注释钉「模型给空或给不认的写法一律视为门外」。
- [ ] C4. prompt（:57-61 区块）：协议行改 `TENSION: <条目> | <MD 侧> | <档案侧> | <性质: 拉扯|冗余|缺口> | <建议偏向> | <落点>`，其下一行加落点写法说明（三类 + 「无法对应到具体维度或档案时写 门外」）；负约束行（:61）补「落点只能是 维度=八维名/占比=档案名/门外 三种写法之一」。
- [ ] C5. `parseTensionRows`（:79-100）：段数判断改 `parts.length !== 5 && parts.length !== 6 → invalid++`；`const landing = parts.length === 6 ? parts[5]! : '门外';`；解构仍取前五段；push 对象展开 `...normalizeLanding(landing)`。注释更新（:75-78 块注释写明双收语义）。核对：nature 校验与 ROWS_CAP 逻辑未动。
- [ ] C6. 跑绿。核对：`pnpm -F @inkforge/server exec vitest run test/fusion/tension.test.ts` 全绿。

### 阶段 D：routes 层映射先红

- [ ] D1. `apps/server/test/http/fusion-gate.test.ts` analyze describe：
  - [ ] D1a. `TENSION_TEXT`（:16-19）改六段混排（含一条 `占比=<主档名>` 样式行，档案名用本文件自建的绑定档案名），`EXPECTED_ROWS`（:21-36）补 `lever`/`dim`/`profileId` 钉值；:86 整响应 `toEqual` 随夹具更新。
  - [ ] D1b. 新增本地助手 `newStyleProfile(name)`（仿 `apps/server/test/http/style.test.ts` 的 `newProfile`：POST /api/style-profiles，中性 analysis 夹具，禁真实文本）。
  - [ ] D1c. 新增映射例（beforeAll 建两档案并 PUT /style 绑为主+辅）：
    - 例 1 `占比=<主档名>` → 该行 `{lever:'weights', profileId:'<主档id>'}`；
    - 例 2 同名两档案（第二档同名）→ `lever:'none'`；
    - 例 3 `占比=<候选未绑档案名>` → `lever:'none'`；
    - 例 4 复用既有 `emptyBookId`（:70，无绑定）+ 占比行 → `lever:'none'`（行保留非降级）。
  - [ ] D1d. 旧 5 段兼容例：mock 输出 5 段行 → 响应行 `lever:'none'`，`toEqual` 钉六键整对象（无 `profileId`/`profileName` 泄漏）。
- [ ] D2. 跑红。核对：映射例红（现响应无 lever 键）。

### 阶段 E：routes 实现转绿

- [ ] E1. routes.ts:1260 system 文案：「TENSION: 五段竖线分隔」→「TENSION: 六段竖线分隔」（P-3）。
- [ ] E2. 已绑查询 :1192-1194 `SELECT name, rules_json` → `SELECT id, name, rules_json`；`boundStyles` push 形状不变（prompt 面零影响），循环外用查得的 `{id,name}` 组 `const nameToIds = new Map<string, string[]>();`（键=trimmed name，值=id 数组，同名多义自然收多值）。
- [ ] E3. 响应组装（:1268 `parseTensionRows` 之后、:1279 `reply.send` 之前）：rows → DTO 映射——非占比类原样透传（剥掉 `profileName`）；占比类 `key=(profileName??'').trim()`，`binding`（:1189 已在作用域）存在且 `nameToIds.get(key)` 恰 1 命中 → `{...row, profileId: 命中id}`（剥 profileName）；否则 `{...row, lever:'none'}`（剥 profileName）。注释钉「响应不透出 profileName；仅已绑集合（主+辅）内精确匹配；未命中/同名多义/无绑定降 none 行保留」。核对：degraded 三分支（:1240-1246/:1269-1277/:1280-1282）未动。
- [ ] E4. 跑绿。核对：fusion-gate.test 全绿。

### 阶段 F：收口链

- [ ] F1. `pnpm lint`。核对：0 error。
- [ ] F2. 定向两文件已绿（C6/E4）。
- [ ] F3. `pnpm test` 全量。核对：总数 ≥ 开工基线（开工先实跑记数；最近存证 748 = 571+175+2），只增不减。
- [ ] F4. `pnpm typecheck`。核对：0 error。
- [ ] F5. `pnpm deadcode`。核对：0 新增挂空（本卡无新导出函数，DTO 键不挂 knip）。
- [ ] F6. 提交（只 commit 不 push）：
  ```
  feat(server): 张力行协议六段落点与 lever 解析映射

  张力行协议 5→6 段（末段落点：维度=/占比=/门外），parseTensionRows 段数双收
  （5 段旧格式兼容→none，>6 段丢行计 invalid）；analyze 组装处占比类仅在已绑
  集合内按名精确匹配映射 profileId，未命中/同名多义/无绑定降 none 行保留；
  TensionRowDto 增 lever/dim?/profileId? 三键；system 硬规则同步六段。

  verify: pnpm lint/test/typecheck/deadcode 全绿，测试基线 <开工实跑数>→<收口数> 只增
  Refs: docs/plans/2026-11-24-tension-levers.md
  ```

## 四、先红后绿回归测试与验收命令

以下命令均在项目根目录执行

```bash
# 1) 红阶段（B3/D2 各跑一次，确认新断言先红）
pnpm -F @inkforge/server exec vitest run test/fusion/tension.test.ts
pnpm -F @inkforge/server exec vitest run test/http/fusion-gate.test.ts
# 2) 绿阶段（C6/E4）与收口链（F1-F5）
pnpm lint
pnpm test
pnpm typecheck
pnpm deadcode
```

验收样例（输入 → 期望输出，钉进测试）：
- `TENSION: 尺度张力 | 正文直白 | 档案含蓄 | 拉扯 | 偏向档案 | 维度=尺度` → 行含 `{lever:'dim', dim:'尺度'}`。
- `… | 占比=仙家`（仙家=该书已绑主档名且唯一）→ 响应行 `{lever:'weights', profileId:'<主档id>'}`。
- 旧 5 段行 → `{lever:'none'}`，`toEqual` 钉六键整对象（entry/mdSide/profileSide/nature/suggestion/lever；无 profileName 泄漏）。
- 建议段含 `|`（7 段）→ 丢行，`invalid` 计 1。

## 五、约束

- 只 commit 不 push；永不 `--no-verify`；永不 `git add -A`（按文件清单显式 add）。
- 读 >4KB 文件（routes.ts 约 1500 行）用 pointer_tools 的 pointerize/read_pointer/read_diff_only，先读锚点窗口再改。
- 卡外问题（行号漂移定位不到锚点、schema 行为与钉不符、测试基线不增反减）即停回报，不得自行改设计或扩面。
- 禁读 `apps/server/data/**`、词表文件、真实书稿文本；夹具中性仿形。
- 验证链硬序 lint→定向→全量→typecheck→deadcode，任一环失败即停。
