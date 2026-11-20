# 实现计划：生成落地保全 + 风格显著性注入（DEC-2026-1120-10）

- 决策依据：docs/decision-log.md DEC-2026-1120-10（已归档，:492）。
- 日期：2026-11-20。仓库：I:\inkforge（pnpm monorepo；server=apps/server Fastify+better-sqlite3+tsx+vitest）。
- 计划面向没见过本代码库的执行者：所有文件锚点、签名、正则、钉值、验收命令均已钉死，按卡施工即可。
- 行号基准：开工时 HEAD（master 已含光谱线两提交 7b2b25b/c4b7a54——blueprint-suggest 槽区已多一个 `spectrumReference` 注入槽先例，与 imitationStructure/plotReference 同形态；Task-02 的 outlineCard 槽插入点按锚文本定位不受影响）。**文中行号=光谱合入后工作树快照，仅作导航；施工一律按卡内锚文本定位。**
- 光谱先例与本批的关系：光谱线占用决策号 DEC-2026-1120-09，本批决策号=**DEC-2026-1120-10**，两者无关；routes.ts 光谱端点区注释（:1018 一带）不属本批改动面。

## 0. 全局约束（每卡开工前必读）

1. **串行基线**：四卡严格按 Task-01 → Task-04 顺序执行，同工作树 ≤1 卡。每卡基线=派卡时工作树 HEAD（干净与串行由主模型派卡时保证）；执行者开工时记录该 HEAD 哈希并随完成回报。
2. **提交纪律**：Conventional 前缀 + 中文描述；正文带 `verify: <验证结果>` 与 `Refs: DEC-2026-1120-10`；**只 commit 不 push**；禁 `git add -A`（逐文件 add）；永不 `--no-verify`。
3. **测试基线只增不减**：允许修改既有钉值断言（本计划明列的冲击清单），不允许删除用例。
4. **不动清单**：`BUDGETS_DRAFT_8K`（config.ts 8k 表）整体不动；蒸馏模板与 freqTerms 注入隔离不动（inject-blocks.test.ts 钉"不注入"）；`renderBlueprintTask` 不加 LANDING 协议行（render.ts renderBlueprintTask 与 plainproto.ts 前缀终止逻辑本批零改动）；blueprint 槽预算 1000 不动；光谱端点与 `spectrumReference` 槽不碰。
5. **前端零改动预期**：apply 落章后章节列表立即可见属既有 UI 读 `GET /api/books/:id` 新数据（routes.ts 已返回 chapters）；blueprint-suggest 响应形状不变；apply counts 键集不变。**本批不新增任何 web 文件**（shared 类型加可选键为加法兼容，web 无需改）；若施工中发现确需前端小改，停下回报主模型，不得自行扩卡。
6. **验证链**（每卡收尾按序跑，任一环失败即停）：`pnpm lint`（根目录 eslint——教训 L-20261113-01：卡面只钉 vitest 曾漏 lint 错入收口门）→ `pnpm --filter @inkforge/server typecheck` → `pnpm --filter @inkforge/server exec vitest run <卡内定向测试>` → `pnpm --filter @inkforge/server test`。涉 shared 卡（Task-01）追加 `pnpm -r --if-present run typecheck`（教训 L-20261118-02：改 shared 类型后先全量 typecheck 定位全部编译断点）；末卡（Task-04）追加根目录 `pnpm -r --if-present run typecheck && pnpm deadcode`（knip，防新增死导出）。Task-01 涉 main.rs 一行：`cargo check`（apps/desktop/src-tauri 下）尽力而为——工具链环境不可用时在回报中注明由主审补验，不得为此装环境。
7. **落地门语义（本批核心）**：`beat_coverage`（quality/l0.ts runL0Checks 第 5 检查）双层判定——**OR 层**（既有，零改动）：`draft.includes(keyword)` 任一命中；**AND 层**（本批新增）：条目带 `grade` 时追加要求正文命中该级词表任一词（H 级判定=L词∪H词，L 完成⊂H 场景）。两层全绿才算该节拍覆盖；OR 全 miss 或 AND 层 miss → 硬失败 → 强制整章重写 → 重写后仍 miss → needs_human 诚实红灯。无 grade 条目=行为与改前逐字节同形（常规书零回归）。

---

## Task-01 设定集导入 apply 落章骨架 + 落地格解析器 + 分级词表落地门

- 依赖：无（首卡）。修订一（grade 传播 + 词表 AND 层）全部收口在本卡。
- 目标 A：`POST /api/settings-import/apply`（http/routes.ts :217 起，锚文本 `/api/settings-import/apply`；事务内 `replaceOutlineTree` 行锚文本 `replaceOutlineTree(db, book.id, d.outlineTree)`）从大纲树 `level='card'`（树 DTO 中 stage.cards，仓库层见 db/repositories/outline.ts replaceOutlineTree/getOutlineTree）且章号区间非空的卡，逐章生成 chapters 行 + 蓝图（title=卡题、goal=卡 body、落地格解析 → mustHaveBeats 含 grade），落库走唯一写入口 `upsertBlueprint`（db/repositories/chapters.ts，锚文本 `export function upsertBlueprint`；新书必走其 INSERT 分支，status 落 DB 默认 `'planned'`，DDL 见 db/migrations/0001_core.sql chapters 表）。
- 目标 B：`BeatRequirement` 增可选 `grade` 字段并贯通 shared/zod/l0/注入文案五处；`beat_coverage` 加分级词表 AND 层，封死人名关键词平凡打穿（『阿美』每章都在 → 旧 OR 语义恒绿）。

### 1-1 新增 `parseLandingCell`（apps/server/src/settings-import.ts，操作：新增导出）

位置：`matchParen`（锚文本 `function matchParen`）之后，复用其半全角配对扫描。

```ts
interface ParsedLanding {
  grade: 'H' | 'L';
  scene: string;
  keywords: string[];
}

/** 落地格解析纯函数（DEC-2026-1120-10）：body 首字符 H/L 认分级；括号内容=场景；关键词=场景 token（≥2 字、含 CJK、全等去重、上限 6）。
 *  无格（首字符非 H/L）返回 null；分级不硬编码任何露骨词表——关键词一律取自卡 body 自身场景文本。 */
export function parseLandingCell(body: string): ParsedLanding | null {
  const t = body.trim();
  if (t === '') return null;
  const grade = /^H/.test(t) ? 'H' : /^L/.test(t) ? 'L' : null;
  if (!grade) return null;
  let scene = t.slice(1).trim();
  const open = t.search(/[（(]/);
  if (open >= 0) {
    const close = matchParen(t, open);
    if (close >= 0) scene = t.slice(open + 1, close).trim();
  }
  const keywords: string[] = [];
  for (const token of scene.split(/[：:；;，,、×ＸX／/·\s]+/)) {
    if (token.length < 2 || !/[\u4e00-\u9fff]/.test(token)) continue;
    if (!keywords.includes(token)) keywords.push(token);
    if (keywords.length >= 6) break;
  }
  return { grade, scene, keywords };
}
```

钉死点（不得偏离）：
- `ParsedLanding` **不导出**（沿同文件 `ParsedCard` 内部接口惯例；无外部导入方，导出会被 knip 判死导出）。
- 只认**半角大写** `H`/`L` 首字符；`null` = 无落地格（合法形态，不是失败）。
- 场景 = 首个括号组内文（半全角混用容错走 `matchParen`）；无括号回退 = 去掉首字符后的余文。
- 关键词过滤：长度 ≥2 且含 CJK（天然拒绝 `L4` 线标签、单字）；**不建任何硬编码分级词表**——H/L 的差别只体现在 `grade` 字段与调用方文案，抽词算法同一套。
- `keywords: []` = "解析不出可靠关键词"信号，交调用方 fail-open 处理，本函数不抛不警。

### 1-2 apply 事务落章骨架（apps/server/src/http/routes.ts，操作：修改）

1. 顶部 import（锚文本 `import { parseSettingsCompendium } from '../settings-import';`）并入 `parseLandingCell`：
   `import { parseLandingCell, parseSettingsCompendium } from '../settings-import';`
2. **`warnings` 声明前移**：`const warnings: string[] = [];` 现声明在事务之后（锚文本 `const warnings: string[] = [];`，apply 路由内文风步之前），而落卡警示要在事务闭包内推送 → 把该声明整行上移到 `let bookId: string;`（锚文本 `let bookId: string;`）之前，原行删除。数组本身与归档/文风警示同一通道，行为不变，仅声明位置前移。
3. 在 `db.transaction(() => { ... })` 内、`replaceOutlineTree(db, book.id, d.outlineTree);` 之后追加章骨架落库，钉死算法：

```ts
// 章骨架（DEC-2026-1120-10）：单一真值源=outlineTree 卡；区间重叠首卡胜（遍历序先到先得）
const claimed = new Set<number>();
let skeletonCapped = false;
for (const vol of d.outlineTree.volumes) {
  for (const stage of vol.stages) {
    for (const card of stage.cards) {
      if (skeletonCapped) break;
      if (card.chapterFrom == null || card.chapterTo == null) continue; // DTO=number|undefined，==null 兼容 null/undefined（执行期钉正，DEC-2026-1120-10）
      if (card.chapterFrom < 1 || card.chapterTo < card.chapterFrom) continue;
      const landing = parseLandingCell(card.body);
      const mustHave = landing !== null && landing.keywords.length > 0
        ? [{ text: card.body.trim(), keywords: landing.keywords, grade: landing.grade }]
        : [];
      let contributed = 0;
      const to = Math.min(card.chapterTo, card.chapterFrom + 49); // 单卡展开上限 50 章（沿 outlineItems 预填先例）
      for (let ch = card.chapterFrom; ch <= to; ch++) {
        if (claimed.has(ch)) continue; // 区间重叠=首卡胜
        if (claimed.size >= 300) {
          warnings.push('章骨架超过 300 章，已截断（保留前 300）');
          skeletonCapped = true;
          break;
        }
        claimed.add(ch);
        contributed += 1;
        chaptersRepo.upsertBlueprint(db, {
          bookId: book.id,
          chapterNo: ch,
          title: card.title !== '' ? card.title : `第${ch}章`,
          blueprint: {
            goal: card.body !== '' ? card.body : card.title, // 空 body 回落卡题（沿 outlineItems 先例）
            beats: [],
            mustHaveBeats: mustHave,
            bannedTopics: [],
          },
        });
      }
      if (contributed > 0 && landing !== null && landing.keywords.length === 0) {
        warnings.push(`卡「${card.title}」落地格「${card.body.trim()}」未解析出可靠关键词，未预填必含节拍（可手补蓝图）`);
      }
    }
  }
}
```

钉死点：
- mustHave 条目携带 `grade: landing.grade`（可选键，`BeatRequirement` 扩展后合法；见 1-4）。
- `warnings` 数组经第 2 步前移后与归档/文风 warning 同通道；**每卡最多一条** landing 警示，且只对该卡实际贡献了 ≥1 章行时才推。
- 300 章全局上限警示只推一次：推送即置 `skeletonCapped`，卡级首行守卫使后续卡直接跳出。
- **counts 响应键集不变**（apply 响应 `counts: {` 锚文本处，不加 `chapters` 键；既有钉值断言 settings-import.test.ts `expect(res.counts).toEqual(...)` 由此零冲击）。
- 事务语义：`upsertBlueprint` 内部事务在外层事务中按 savepoint 运行（事务注释既有说明同款），任一环失败整体回滚。

### 1-3 schema 语义钉清（apps/server/src/http/schemas.ts settingsImportApplySchema 上方注释，操作：修改）

既有注释（锚文本 `draft 整形沿解析 DTO`）改为（语义钉死，不改 schema 结构——outlineItems 继续被剥、前端自用）：

```ts
// draft 整形沿解析 DTO：outlineItems/chapterTitles/warnings 前端回传即被剥（审阅步前端自用）；
// 章骨架单一真值源=outlineTree 卡（DEC-2026-1120-10：apply 服务端从卡落 chapters+blueprint，本 schema 不消费 outlineItems）
```

### 1-4 grade 字段传播 + 分级词表落地门（修订一收口，操作：跨四文件 + 一数据文件 + 一壳文件）

**A. shared 类型（packages/shared/src/domain.ts，操作：修改）**——`BeatRequirement`（锚文本 `export interface BeatRequirement`）改为：

```ts
export interface BeatRequirement {
  text: string;
  keywords: string[];
  /** 落地分级（DEC-2026-1120-10）：apply/落地格来源写入；缺省=常规必含节拍（beat_coverage 行为零改动） */
  grade?: 'H' | 'L';
}
```

**B. zod 同步（apps/server/src/http/schemas.ts，操作：修改）**——`blueprintSchema`（锚文本 `export const blueprintSchema`）mustHaveBeats 条目改为：

```ts
mustHaveBeats: z.array(z.object({ text: z.string(), keywords: z.array(z.string().min(1)), grade: z.enum(['H', 'L']).optional() })),
```

旧蓝图/旧数据无该键完全兼容（optional）。

**C. 词表数据文件（apps/server/config/quality/landing-words.default.txt，操作：新增）**——格式与加载完全镜像 cliches 先例（`apps/server/config/quality/cliches.default.txt`：仓库内默认路径 + `INKFORGE_CLIQUES_PATH` env 覆盖 + desktop 壳 release 态显式注入 + tauri resources 整目录打包）。文件定稿：

```
# 落地分级词表（DEC-2026-1120-10）：[H] 节=插入/交合类、[L] 节=手口类；每行一词；# 开头为注释行；空行跳过。
# owner 可直接编辑本文件，或以 INKFORGE_LANDING_WORDS_PATH 指向自定义副本（desktop 打包态由壳注入）。
[H]
插入
肏
干
做爱
交合
抽送
内射
骑
奸
床上玩
操
[L]
口交
吹
舔
吸
含
手
握
套弄
指
揉
舔舐
口活
```

⚠ 钉死点附注（须随完成回报呈 owner）：`干/手/指/吸/含/骑/揉/吹/握/操` 等单字泛化词在 `draft.includes` 语义下误报率高（"干净/手指"等日常词即命中），会稀释 AND 层强度；默认表按 owner 给词全量定稿不改字，owner 可直接编辑文件删改（数据文件不进共享码，符合评议员"露骨词表不得硬编码"红线）。

**D. 装载器（apps/server/src/quality/l0.ts，操作：修改）**——`loadCliches`（锚文本 `export function loadCliches`）之后新增：

```ts
export interface LandingWords {
  h: string[];
  l: string[];
}

/** 落地分级词表装载（DEC-2026-1120-10）：[H]/[L] 分节词表，每行一词，# 注释与空行跳过。
 *  文件缺失/不可读 → 空表：AND 层跳过（fail-open 保守放行）。镜像 loadCliches 先例，无额外警告通道（cliches 亦无）。 */
export function loadLandingWords(path: string): LandingWords {
  try {
    const lines = fs.readFileSync(path, 'utf8').split(/\r?\n/);
    const out: LandingWords = { h: [], l: [] };
    let cur: 'h' | 'l' | null = null;
    for (const raw of lines) {
      const t = raw.trim();
      if (t === '' || t.startsWith('#')) continue;
      if (t === '[H]') {
        cur = 'h';
        continue;
      }
      if (t === '[L]') {
        cur = 'l';
        continue;
      }
      if (cur !== null && !out[cur].includes(t)) out[cur].push(t);
    }
    return out;
  } catch {
    return { h: [], l: [] };
  }
}
```

**E. beat_coverage AND 层（apps/server/src/quality/l0.ts runL0Checks，操作：修改）**：

1. `runL0Checks` input（锚文本 `export function runL0Checks(input: {`）末尾（`cliches` 键之后）追加可选键 `landingWords?: LandingWords`。
2. beat_coverage 检查块（锚文本 `// 5. beat_coverage`）整块替换为：

```ts
// 5. beat_coverage：keywords 至少一个出现（OR 层）；条目带 grade 时追加分级词表 AND 层（DEC-2026-1120-10）：
//    H 级判定=L词∪H词（L 完成⊂H 场景）、L 级=L词；词表缺失/空 → AND 层跳过（fail-open）；无 grade 条目=旧行为零改动
const lw = input.landingWords;
const wordsEmpty = !lw || (lw.h.length === 0 && lw.l.length === 0);
const wordHit = (grade: 'H' | 'L'): boolean => {
  if (wordsEmpty) return true;
  const pool = grade === 'H' ? [...lw.h, ...lw.l] : lw.l;
  return pool.some((w) => input.draft.includes(w));
};
const missed = input.blueprint.mustHaveBeats.filter(
  (m) => !m.keywords.some((k) => input.draft.includes(k)) || (m.grade !== undefined && !wordHit(m.grade)),
);
checks.push({ name: 'beat_coverage', pass: missed.length === 0, details: missed.length === 0 ? '必含节拍全覆盖' : `缺失: ${missed.map((m) => m.text).join('、')}` });
```

details 文案与 pass 语义同改前（仅判定条件加 AND 层），不新增检查名（L0Check 联合类型不动）。

**F. 管线接线（apps/server/src/pipeline/chapter.ts，操作：修改）**：

1. CLIQUES_PATH 常量（锚文本 `const CLIQUES_PATH = process.env.INKFORGE_CLIQUES_PATH`）之后并列新增：

```ts
const LANDING_WORDS_PATH =
  process.env.INKFORGE_LANDING_WORDS_PATH ??
  path.join(path.dirname(fileURLToPath(import.meta.url)), '../../config/quality/landing-words.default.txt');
```

2. `const cliches = loadCliches(CLIQUES_PATH);`（锚文本 `loadCliches(CLIQUES_PATH)`）之后新增 `const landingWords = loadLandingWords(LANDING_WORDS_PATH);`；import（锚文本 `import { loadCliches, runL0Checks } from '../quality/l0'`）并入 `loadLandingWords`。
3. draft 循环内 `runL0Checks({...})` input 对象字面量（锚文本 `cliches,`）追加 `landingWords,`。

**G. desktop 壳 env 注入（apps/desktop/src-tauri/src/main.rs，操作：修改）**——release 态 env 注入块（锚文本 `INKFORGE_CLIQUES_PATH`）之后并列加一行：

```rust
      .env("INKFORGE_LANDING_WORDS_PATH", server_root.join("config").join("quality").join("landing-words.default.txt").display().to_string())
```

tauri.conf.json **无需改**（bundle resources 已整目录映射 `resources/server/config`，新文件自动随包）。worker 由 server 进程派生继承 env，与 cliches 同覆盖面。dev 态走仓库默认相对路径（同 cliches）。

### 1-5 测试（操作：修改两个既有测试文件 + l0.test.ts 加用例）

**A. apps/server/test/settings-import.parse.test.ts**：既有 `describe('parseSettingsCompendium')` 之后新增独立 describe（import 行补 `parseLandingCell`）：

```ts
describe('parseLandingCell（DEC-2026-1120-10 落地格解析）', () => {
  it('H 级带场景：分级+场景+人名辅助关键词', () => {
    expect(parseLandingCell('H（撞见场：房东×阿美）')).toEqual({
      grade: 'H', scene: '撞见场：房东×阿美', keywords: ['撞见场', '房东', '阿美'],
    });
  });
  it('L 级带场景', () => {
    expect(parseLandingCell('L（框架确立）')).toEqual({ grade: 'L', scene: '框架确立', keywords: ['框架确立'] });
  });
  it('分级无括号场景 → scene 空、keywords 空（fail-open 信号）', () => {
    expect(parseLandingCell('H')).toEqual({ grade: 'H', scene: '', keywords: [] });
    expect(parseLandingCell('L')).toEqual({ grade: 'L', scene: '', keywords: [] });
  });
  it('无括号但有场景文 → 场景取去首字符余文', () => {
    expect(parseLandingCell('H车站接人与还钥匙')).toEqual({ grade: 'H', scene: '车站接人与还钥匙', keywords: ['车站接人与还钥匙'] });
  });
  it('首字符非 H/L → null（无落地格，非失败）', () => {
    expect(parseLandingCell('开场悬念前置')).toBeNull();
    expect(parseLandingCell('')).toBeNull();
    expect(parseLandingCell('h（小写不认）')).toBeNull();
  });
  it('单词级（<2 字）关键词拒绝：全单字 → keywords 空', () => {
    expect(parseLandingCell('H（吻）')).toEqual({ grade: 'H', scene: '吻', keywords: [] });
  });
  it('重复 token 全等去重、线标签类非 CJK 短 token 拒绝', () => {
    expect(parseLandingCell('H（车站接人：房东×阿美×房东；L4）')).toEqual({
      grade: 'H', scene: '车站接人：房东×阿美×房东；L4', keywords: ['车站接人', '房东', '阿美'],
    });
  });
});
```

**B. apps/server/test/http/settings-import.test.ts**：新增夹具常量与新 describe（harness 复用文件内既有 `makeApp`/`previewDraft`/`teardown`，canned 用 `''`——本用例不依赖风格档案）：

```ts
// 重叠语义=跨卡重复章号首卡胜（解析器原生形态：「N-M **题**」行系阶段行非卡，夹具修订裁决 2026-11-20）
const LANDING_COMPENDIUM = `# 《落地测试书》· 扩写设定集

> 定位一句话：落地格解析与章骨架落库测试。

## 6. 总大纲

**阶段A 「开局」**（2003）
| 章 | 标题 | 线 | 落地 |
| --- | --- | --- | --- |
| 1 | 第一夜 | L10 | H（撞见场：房东×阿美） |
| 2 | 坦白局 | L10 | L（框架确立） |
| 3 | 借宿 | L4 | H |
| 4 | 客房事件 | L4 | |

**阶段B 「重叠」**（2004）
| 章 | 标题 | 线 | 落地 |
| --- | --- | --- | --- |
| 10 | 重叠卡A | L1 | H（场景甲：甲×乙） |
| 10 | 重叠卡B | L1 | H（场景乙：甲×乙） |
| 11 | 章十一 | L1 | L（场景丙） |
`;

describe('POST /api/settings-import/apply 落章骨架（DEC-2026-1120-10）', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await makeApp('');
  });
  afterAll(() => teardown(h));

  it('逐章表+重叠区间 → chapters 行 title/goal/mustHaveBeats(含 grade)/status 钉值，无关键词落地格 fail-open warning', async () => {
    const draft = await previewDraft(h.app, LANDING_COMPENDIUM);
    const r = await h.app.inject({ method: 'POST', url: '/api/settings-import/apply', payload: { content: LANDING_COMPENDIUM, draft } });
    expect(r.statusCode).toBe(201);
    const res = r.json() as { bookId: string; warnings: string[] };
    // 唯一 warning：卡「借宿」落地格「H」解析不出关键词（第 4 章无格不警、无格卡与被覆盖章不重复警）
    expect(res.warnings).toHaveLength(1);
    expect(res.warnings[0]).toContain('借宿');
    expect(res.warnings[0]).toContain('未解析出可靠关键词');

    const book = (await h.app.inject({ method: 'GET', url: `/api/books/${res.bookId}` })).json() as {
      chapters: Array<{ chapterNo: number; title: string; status: string; blueprint: { goal: string; mustHaveBeats: Array<{ text: string; keywords: string[]; grade?: string }> } }>;
    };
    expect(book.chapters.map((c) => c.chapterNo)).toEqual([1, 2, 3, 4, 10, 11]);
    expect(book.chapters.every((c) => c.status === 'planned')).toBe(true);
    const ch1 = book.chapters[0];
    expect(ch1.title).toBe('第一夜');
    expect(ch1.blueprint.goal).toBe('H（撞见场：房东×阿美）');
    expect(ch1.blueprint.mustHaveBeats).toEqual([{ text: 'H（撞见场：房东×阿美）', keywords: ['撞见场', '房东', '阿美'], grade: 'H' }]);
    expect(book.chapters[1].blueprint.mustHaveBeats).toEqual([{ text: 'L（框架确立）', keywords: ['框架确立'], grade: 'L' }]);
    expect(book.chapters[2].blueprint).toEqual({ goal: 'H', beats: [], mustHaveBeats: [], bannedTopics: [] });
    // 跨卡重复章号首卡胜：ch10 归重叠卡A（重叠卡B 让位不落章）
    expect(book.chapters[4]).toMatchObject({ title: '重叠卡A', blueprint: { goal: 'H（场景甲：甲×乙）', mustHaveBeats: [{ text: 'H（场景甲：甲×乙）', keywords: ['场景甲'], grade: 'H' }] } });
    expect(book.chapters.some((c) => c.title === '重叠卡B')).toBe(false);
    expect(book.chapters[5]).toMatchObject({ title: '章十一', blueprint: { mustHaveBeats: [{ text: 'L（场景丙）', keywords: ['场景丙'], grade: 'L' }] } });
  });
});
```

注意：既有 apply 用例在此卡后**新增了 chapters 落库副作用但零断言冲突**，其 counts 钉值与 `warnings: []` 必须保持原样通过（该夹具其卡无 H/L 格 → 无 warning）——跑挂即说明 1-2 的 fail-open 门写错。

**C. apps/server/test/quality/l0.test.ts 新增 describe（放文件末尾；import 行并入 `loadLandingWords`，即 `import { loadCliches, loadLandingWords, runL0Checks } from '../../src/quality/l0'`；`path` 该文件已导入；词表夹具用中性占位词，测试不耦合 owner 可编辑的默认表内容；BEAT_MISS_DRAFT 沿文件既有 fixtures import）**：

```ts
describe('L0 beat_coverage 分级词表 AND 层（DEC-2026-1120-10）', () => {
  const LW = { h: ['玉佩光'], l: ['铜镜摇'] }; // 中性占位词表（语义同构：H 词/L 词）
  const gradeBp = {
    goal: 'g',
    beats: [],
    mustHaveBeats: [{ text: 'H（撞见场：房东×阿美）', keywords: ['阿美'], grade: 'H' as const }],
    bannedTopics: [],
  };
  const noGradeBp = {
    goal: 'g',
    beats: [],
    mustHaveBeats: [{ text: '信物到手', keywords: ['玉佩'] }],
    bannedTopics: [],
  };
  const run = (draft: string, bp: object, landingWords?: { h: string[]; l: string[] }) =>
    runL0Checks({ draft, targetChars: 100, prevTexts: [], blueprint: bp as never, continuity: { characters: [] }, cliches, landingWords });
  // 关键词在场文（含 '阿美'，不含任何占位词表词）：隔离 OR 层，专测 AND 层
  const kwDraft = BEAT_MISS_DRAFT + '阿美在门口张望。';

  it('① 人名关键词命中但无词表词 → H 级节拍不覆盖（硬失败）；同输入无词表 → 覆盖（对照证明失败源=AND 层）', () => {
    const r = run(kwDraft, gradeBp, LW);
    const c = r.checks.find((x) => x.name === 'beat_coverage')!;
    expect(c.pass).toBe(false);
    expect(r.hardFail).toBe(true);
    expect(c.details).toContain('H（撞见场：房东×阿美）');
    const orOnly = run(kwDraft, gradeBp);
    expect(orOnly.checks.find((x) => x.name === 'beat_coverage')!.pass).toBe(true);
  });

  it('② 词表词命中但 keyword 全 miss → 不覆盖', () => {
    const r = run(BEAT_MISS_DRAFT + '她抬手碰了碰床头的玉佩光。', gradeBp, LW);
    expect(r.checks.find((x) => x.name === 'beat_coverage')!.pass).toBe(false);
  });

  it('③ keyword 与词表词双命中 → 覆盖', () => {
    const r = run(BEAT_MISS_DRAFT + '阿美侧身，床头的玉佩光晃了一下。', gradeBp, LW);
    expect(r.checks.find((x) => x.name === 'beat_coverage')!.pass).toBe(true);
  });

  it('④ 无 grade 旧条目：词表在场也只走 OR 层，行为与改前逐字节同形', () => {
    const r = run(BEAT_MISS_DRAFT, noGradeBp, LW);
    expect(r.checks.find((x) => x.name === 'beat_coverage')!.pass).toBe(false); // BEAT_MISS_DRAFT 不含 '玉佩'
    const good = run(BEAT_MISS_DRAFT + '他终于握住了那枚玉佩。', noGradeBp, LW);
    expect(good.checks.find((x) => x.name === 'beat_coverage')!.pass).toBe(true);
  });

  it('⑤ 词表缺失/空 → AND 层跳过（fail-open 放行）', () => {
    const empty = { h: [] as string[], l: [] as string[] };
    for (const lw of [undefined, empty]) {
      const r = run(BEAT_MISS_DRAFT + '阿美点头。', gradeBp, lw);
      expect(r.checks.find((x) => x.name === 'beat_coverage')!.pass).toBe(true);
    }
  });

  it('⑥ loadLandingWords：默认文件解析出两节；缺失路径 → 空表不抛', () => {
    const lw = loadLandingWords(path.join(process.cwd(), 'config/quality/landing-words.default.txt'));
    expect(lw.h.length).toBeGreaterThan(0);
    expect(lw.l.length).toBeGreaterThan(0);
    const missing = loadLandingWords(path.join(process.cwd(), 'config/quality/__no_such__.txt'));
    expect(missing).toEqual({ h: [], l: [] });
  });
});
```

（既有 beat_coverage 用例（OR 语义、无 grade、不传 landingWords）原样保留=无 grade 零回归的既有回归钉；⑤ 的 `undefined` 分支同时覆盖"runL0Checks 未传 landingWords"调用面兼容。）

### 1-6 验收标准（预期输入输出示例）

- 输入卡 body `'H（撞见场：房东×阿美）'` → 第 1 章蓝图 `mustHaveBeats === [{ text: 'H（撞见场：房东×阿美）', keywords: ['撞见场', '房东', '阿美'], grade: 'H' }]`。
- 输入卡 body `'H'` → 该章 `mustHaveBeats === []` 且 apply 响应 warnings 恰含一条该卡 fail-open 警示（201 建书不回滚）。
- 输入卡 body `'开场悬念前置'` → 无格：`mustHaveBeats === []` 且**无** warning。
- 跨卡重复章号 10（重叠卡A/重叠卡B 两卡行）→ ch10 归首卡（次卡让位不落章，`N-M **题**` 行系阶段行非卡——夹具修订裁决）。
- beat_coverage：正文含『阿美』但无任何词表词 → H 级节拍**不**覆盖（人名假通过被封死）；无 grade 条目全路径行为与改前逐字节同形。
- 词表文件缺失 → 空表、AND 层跳过、不抛（fail-open）。
- queue 视角（worker/queue.ts 缺蓝图跳章）：apply 后的书不再被跳章，可直接建 run 生成。

### 1-7 验收命令与提交

```
pnpm --filter @inkforge/shared typecheck
pnpm --filter @inkforge/server typecheck
pnpm --filter @inkforge/server exec vitest run test/settings-import.parse.test.ts test/http/settings-import.test.ts test/quality/l0.test.ts
pnpm --filter @inkforge/server test
```

提交：`feat(server): 设定集导入落章骨架并接分级词表落地门（beat_coverage AND 层）`，正文 `verify: shared+server typecheck，vitest 全绿（含 l0 六新例），测试基线只增；Refs: DEC-2026-1120-10`。

---

## Task-02 blueprint-suggest 接大纲卡 + 确定性叠加 + PUT 保存保留必含节拍

- 依赖：Task-01（复用 `parseLandingCell` 导出与 grade 字段）。
- 目标：suggest 路由把命中章的大纲卡注入 planner 上下文；解析完成后服务端把落地格确定性合并进蓝图（不依赖模型输出，写入 grade）；PUT blueprint 保存路径并集保留既有 mustHaveBeats（去重键不变=text trim 全等），防"重新建议+保存"静默洗掉预填。

### 2-1 suggest 路由（apps/server/src/http/routes.ts，锚文本 `app.post('/api/books/:bookId/blueprint-suggest'`，操作：修改）

1. 顶部 shared type import（锚文本 `import type { DistillStyleDraftDto`）并入 `OutlineCardDto, OutlineTreeDto`：
   `import type { DistillStyleDraftDto, OutlineCardDto, OutlineTreeDto, StyleAnalysisDto } from '@inkforge/shared';`
2. 模块级新增纯函数（放在 `blueprintSuggestSchema`（锚文本 `const blueprintSuggestSchema`）附近，不导出）：

```ts
/** 按章号取命中卡：树遍历序（卷→阶段→卡 seq）首个 chapterFrom/To 非空且覆盖该章的卡；区间重叠首卡胜（与 apply 同语义）。 */
function findOutlineCardForChapter(tree: OutlineTreeDto, chapterNo: number): OutlineCardDto | undefined {
  for (const vol of tree.volumes) {
    for (const stage of vol.stages) {
      for (const card of stage.cards) {
        if (card.chapterFrom == null || card.chapterTo == null) continue; // DTO=number|undefined（同 1-2 钉正）
        if (card.chapterFrom <= chapterNo && chapterNo <= card.chapterTo) return card;
      }
    }
  }
  return undefined;
}
```

3. 在 suggest 路由 briefs 区最后一个 IIFE（锚文本 `const spectrumBrief`）之后并列新增：

```ts
const outlineCard = findOutlineCardForChapter(outlineRepo.getOutlineTree(db, bookId) ?? { volumes: [] }, chapterNo);
const outlineCardBrief = outlineCard
  ? `【本章大纲卡】\n${renderOutlineCardSchedule([outlineCard])}` // 复用 renderOutlineCardSchedule，产出 "第a-b章 卡题：body"
  : '';
```

4. slots 数组（锚文本 `name: 'spectrumReference'` 行，光谱线新增槽）之后插入：

```ts
...(outlineCardBrief ? [{ name: 'outlineCard', content: outlineCardBrief, budgetChars: 600, stable: false, keep: 'head' as const }] : []),
```

预算 600 = imitationStructure/plotReference/spectrumReference 同款先例。

5. **确定性叠加**：在错误闸门（锚文本 `blueprint parse failed`）之后、`reply.send({ blueprint: report.blueprint, source: 'llm' })` 之前插入：

```ts
// 确定性叠加（DEC-2026-1120-10）：落地格解析结果直接合并（含 grade），不依赖模型输出；parseBlueprint 恒产 mustHaveBeats:[]，并集语义面向未来
if (outlineCard) {
  const landing = parseLandingCell(outlineCard.body);
  if (landing !== null && landing.keywords.length > 0 && !report.blueprint.mustHaveBeats.some((m) => m.text.trim() === outlineCard.body.trim())) {
    report.blueprint.mustHaveBeats = [...report.blueprint.mustHaveBeats, { text: outlineCard.body.trim(), keywords: landing.keywords, grade: landing.grade }];
  }
}
```

响应形状保持 `{ blueprint, source: 'llm' }` 不变。**本批不加 LANDING 协议行**（见全局约束 4）。

### 2-2 PUT blueprint 保存路径并集保留（apps/server/src/http/routes.ts，锚文本 `app.put('/api/books/:bookId/chapters/:chapterNo/blueprint'`，操作：修改）

`reply.send(...)` 改为先取既有蓝图合并再落库：

```ts
const existingBeats = chaptersRepo.getChapter(db, bookId, Number(chapterNo))?.blueprint?.mustHaveBeats ?? [];
const mergedBeats = [...existingBeats];
for (const m of body.blueprint.mustHaveBeats) {
  if (!mergedBeats.some((x) => x.text.trim() === m.text.trim())) mergedBeats.push(m); // 去重键=text trim 全等（不含 grade）；卡预填在前（优先存活，grade 随条目保留）
}
reply.send(
  chaptersRepo.upsertBlueprint(db, {
    bookId,
    chapterNo: Number(chapterNo),
    title: body.title,
    blueprint: { ...body.blueprint, mustHaveBeats: mergedBeats },
    targetChars: body.targetChars,
  }),
);
```

已知代价（拍板接受，写进卡面）：手工删除某条必含节拍会被并集回填；如需真正删除，须改 `text` 本身。

### 2-3 planner task 预算（apps/server/src/config.ts，锚文本 `const BUDGETS_PLANNER`，操作：修改）

```ts
const BUDGETS_PLANNER: PlannerBudgets = { hardRules: 300, continuity: 1500, prevTail: 1500, task: 800 }; // 300→800：renderBlueprintTask 协议行占 ~210 后书籍简介仅剩 ~90 字（DEC-2026-1120-10）
```

总预算核算：300+1500+1500+800+600(outlineCard)=4700 ≪ 515k（contextWindow 524288 − maxOutput 8192 − 500，DEC-2026-1120-04① 先例）。

### 2-4 测试

**A. 新建 apps/server/test/http/blueprint-suggest.test.ts**（harness 照抄 test/plot.test.ts "剧情蒸馏 HTTP 层" describe 的 capturing plannerProvider 模式）：

```ts
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config';
import { buildApp } from '../../src/app';
import { openDb } from '../../src/db/open';
import { createDefaultMockProvider, createMockProvider } from '../../src/llm/mock';
import { upsertBlueprint } from '../../src/db/repositories/chapters';
import type { CompletionRequest, LlmProvider } from '../../src/llm/types';

// 行文样：GOAL/BEATS/HOOK 协议（parseBlueprint 兼容；mustHaveBeats 恒 []——确定性叠加不靠模型）
const BLUEPRINT_TEXT = `GOAL: 主角与房东初次正面撞接
BEATS:
- 门口对峙
- 借口周旋
HOOK: 门内传来第二个人声`;

const TREE = {
  volumes: [
    {
      title: '卷一', body: '', seq: 1,
      stages: [{ title: '开局', body: '', seq: 1, cards: [{ title: '第一夜', body: 'H（撞见场：房东×阿美）', seq: 1, chapterFrom: 1, chapterTo: 2 }] }],
    },
  ],
};

describe('blueprint-suggest 大纲卡注入与确定性叠加（DEC-2026-1120-10）', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let bookId: string;
  const plannerCalls: CompletionRequest[] = [];

  beforeAll(async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkforge-bp-suggest-'));
    const config = loadConfig({
      STRATA_BASE_URL: 'http://127.0.0.1:47831/v1', STRATA_API_KEY: 'strata', STRATA_MODEL: 'iq3_xxs',
      INKFORGE_DATA_DIR: path.join(dir, 'srv'),
    });
    const plannerInner = createMockProvider({ summarize: { text: BLUEPRINT_TEXT } });
    const plannerProvider: LlmProvider = {
      async complete(req) { plannerCalls.push(req); return plannerInner.complete(req); },
    };
    const db = openDb(path.join(config.dataDir, 'inkforge.db'));
    app = await buildApp({ config, provider: createDefaultMockProvider(), plannerProvider, db, inlineQueue: true });
    // 书籍简介 300 字：task 内容（协议行 ~210 + 简介 300 + 尾部两行）≈570 字 > 旧 300 预算，用于钉 800 预算断言
    const created = await app.inject({ method: 'POST', url: '/api/books', payload: { title: '蓝图卡测书', description: '介'.repeat(300) } });
    bookId = (created.json() as { id: string }).id;
    const put = await app.inject({ method: 'PUT', url: `/api/books/${bookId}/outline-tree`, payload: { tree: TREE } });
    expect(put.statusCode).toBe(200);
  });

  afterAll(async () => { await app.close(); });

  it('命中章：task 侧注入【本章大纲卡】+ 响应蓝图确定性带落地格 mustHaveBeats（含 grade）', async () => {
    const sug = await app.inject({ method: 'POST', url: `/api/books/${bookId}/blueprint-suggest`, payload: { chapterNo: 1 } });
    expect(sug.statusCode).toBe(200);
    const plannerReq = plannerCalls[plannerCalls.length - 1];
    expect(plannerReq.user).toContain('【本章大纲卡】');
    expect(plannerReq.user).toContain('第1-2章 第一夜：H（撞见场：房东×阿美）');
    const bp = (sug.json() as { blueprint: { mustHaveBeats: Array<{ text: string; keywords: string[]; grade?: string }> } }).blueprint;
    expect(bp.mustHaveBeats).toEqual([{ text: 'H（撞见场：房东×阿美）', keywords: ['撞见场', '房东', '阿美'], grade: 'H' }]);
  });

  it('未命中章（chapterNo=9）：不注入大纲卡槽、不叠加 mustHaveBeats', async () => {
    const sug = await app.inject({ method: 'POST', url: `/api/books/${bookId}/blueprint-suggest`, payload: { chapterNo: 9 } });
    expect(sug.statusCode).toBe(200);
    const plannerReq = plannerCalls[plannerCalls.length - 1];
    expect(plannerReq.user).not.toContain('【本章大纲卡】');
    expect((sug.json() as { blueprint: { mustHaveBeats: unknown[] } }).blueprint.mustHaveBeats).toEqual([]);
  });

  it('task 预算 800：renderBlueprintTask 尾部（连续性摘要行）不再被截断', async () => {
    await app.inject({ method: 'POST', url: `/api/books/${bookId}/blueprint-suggest`, payload: { chapterNo: 2 } });
    const req = plannerCalls[plannerCalls.length - 1];
    // 旧 300 预算时 task 槽 head 截断会把尾部两行切掉；800 预算下尾行存活
    expect(req.user).toContain('【连续性摘要】（无）');
    expect(req.user).toContain('【书籍简介】介介介');
  });
});

describe('PUT blueprint 保存保留既有 mustHaveBeats（DEC-2026-1120-10 防洗掉）', () => {
  let app2: Awaited<ReturnType<typeof buildApp>>;
  let bookId2: string;

  beforeAll(async () => {
    const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'inkforge-bp-put-'));
    const config2 = loadConfig({
      STRATA_BASE_URL: 'http://127.0.0.1:47831/v1', STRATA_API_KEY: 'strata', STRATA_MODEL: 'iq3_xxs',
      INKFORGE_DATA_DIR: path.join(dir2, 'srv'),
    });
    const db2 = openDb(path.join(config2.dataDir, 'inkforge.db'));
    app2 = await buildApp({ config: config2, provider: createDefaultMockProvider(), db: db2, inlineQueue: true });
    const created = await app2.inject({ method: 'POST', url: '/api/books', payload: { title: '蓝图保留测书' } });
    bookId2 = (created.json() as { id: string }).id;
    upsertBlueprint(db2, {
      bookId: bookId2,
      chapterNo: 1,
      title: '第1章',
      blueprint: { goal: 'g', beats: [], mustHaveBeats: [{ text: 'X（场景一）', keywords: ['场景一'], grade: 'H' }], bannedTopics: [] },
    });
  });

  afterAll(async () => { await app2.close(); });

  const savedBeats = async (): Promise<Array<{ text: string; keywords: string[]; grade?: string }>> => {
    const book = (await app2.inject({ method: 'GET', url: `/api/books/${bookId2}` })).json() as {
      chapters: Array<{ blueprint: { mustHaveBeats: Array<{ text: string; keywords: string[]; grade?: string }> } }>;
    };
    return book.chapters[0].blueprint.mustHaveBeats;
  };

  it('建议缺 mustHaveBeats → 预填（含 grade）保留', async () => {
    const put = await app2.inject({
      method: 'PUT',
      url: `/api/books/${bookId2}/chapters/1/blueprint`,
      payload: { title: '第1章', blueprint: { goal: 'g2', beats: ['b'], mustHaveBeats: [], bannedTopics: [] } },
    });
    expect(put.statusCode).toBe(200);
    expect(await savedBeats()).toEqual([{ text: 'X（场景一）', keywords: ['场景一'], grade: 'H' }]);
  });

  it('建议带新增条目 → 并集；重复 text（trim 变体）不重且预填 grade 存活', async () => {
    const put = await app2.inject({
      method: 'PUT',
      url: `/api/books/${bookId2}/chapters/1/blueprint`,
      payload: {
        title: '第1章',
        blueprint: {
          goal: 'g3',
          beats: [],
          mustHaveBeats: [{ text: 'Y（场景二）', keywords: ['场景二'] }, { text: ' X（场景一） ', keywords: ['场景一'] }],
          bannedTopics: [],
        },
      },
    });
    expect(put.statusCode).toBe(200);
    expect(await savedBeats()).toEqual([
      { text: 'X（场景一）', keywords: ['场景一'], grade: 'H' },
      { text: 'Y（场景二）', keywords: ['场景二'] },
    ]);
  });
});
```

**B. apps/server/test/config.test.ts planner 钉值更新**（锚文本 `budgets.planner` 钉值用例）：

```ts
expect(c.budgets.planner).toEqual({ hardRules: 300, continuity: 1500, prevTail: 1500, task: 800 });
```

### 2-5 验收标准

- 输入：树卡 `{ chapterFrom: 1, chapterTo: 2, body: 'H（撞见场：房东×阿美）' }` + suggest chapterNo=1 → planner user 含 `【本章大纲卡】`；响应 `blueprint.mustHaveBeats` = `[{ text 原样, keywords, grade: 'H' }]`。
- chapterNo=9（无卡覆盖）→ 无槽、无叠加。
- PUT 保存：预填 `[X(grade H)]` + 建议 `[]` → 存 `[X(grade H)]`；预填 `[X]` + 建议 `[Y]` → 存 `[X, Y]`；重复 text（trim 变体）→ 不重、预填 grade 存活。
- task 槽 800 预算下 renderBlueprintTask 尾部【连续性摘要】行存活（300 字简介 + 协议 ≈570 字场景）。

### 2-6 验收命令与提交

```
pnpm --filter @inkforge/server typecheck
pnpm --filter @inkforge/server exec vitest run test/http/blueprint-suggest.test.ts test/config.test.ts
pnpm --filter @inkforge/server test
```

提交：`feat(server): blueprint-suggest 接大纲卡并确定性叠加落地格，PUT 保存保留必含节拍`，正文 `verify: server typecheck+vitest 全绿，测试基线只增；Refs: DEC-2026-1120-10`。

---

## Task-03 rewrite 落地保全 + draft/rewrite task 尾部摘要块（grade 文案）

- 依赖：Task-02（config.ts/config.test.ts 同文件串行改）。
- 目标：修订指令强制保全必含节拍；draft 与 rewrite 的 task 槽尾部追加 recency 摘要块（【本章硬要求】+【文风铁则】），对无蓝图硬要求且无档案的书自动省略（零污染）；带 grade 条目在两处注入文案显示落地分级提示。

### 3-1 注入文案钉死（grade 相关）

- 带 grade 行模板（renderDraft 【必含节拍】与 renderTaskSummaryBlock 【本章硬要求】共用措辞）：`（落地·${m.grade}级须显性词）`，H/L 统一模板单分支；不带 grade → 与改前逐字节同形。
- 例：`【必含节拍】H（撞见场：房东×阿美）（落地·H级须显性词）（须出现关键词：撞见场、房东、阿美）`；硬要求行 `· X（场景一）（落地·H级须显性词）（须出现关键词：场景一、房东）`。

### 3-2 renderDraft grade 分支（apps/server/src/prompts/render.ts，操作：修改）

`renderDraft` 内 mustHaveBeats 行（锚文本 `【必含节拍】`）改为：

```ts
...input.blueprint.mustHaveBeats.map((m) => `【必含节拍】${m.text}${m.grade !== undefined ? `（落地·${m.grade}级须显性词）` : ''}（须出现关键词：${m.keywords.join('、')}）`),
```

### 3-3 新增 `renderTaskSummaryBlock`（apps/server/src/prompts/render.ts，操作：新增导出）

放在 `renderRewrite`（锚文本 `export function renderRewrite`）之后。import 行（render.ts 首行 shared import）补 `type BeatRequirement`：

```ts
import { DIMENSIONS, type BeatRequirement, type ChapterBlueprint, type Finding, type OutlineCardDto, type OutlineTreeDto } from '@inkforge/shared';
```

```ts
/** task 槽尾部 recency 摘要块（DEC-2026-1120-10）：必含节拍文本+关键词（带 grade 显示落地分级）、文风铁则（rulesText 前 3 非空行）。
 *  两块全空返回 ''——无蓝图硬要求且无档案的书零污染。签名不动 renderDraft/renderRewrite（contract.test 钉其形态）。 */
export function renderTaskSummaryBlock(input: { mustHaveBeats: BeatRequirement[]; styleRulesText?: string }): string {
  const parts: string[] = [];
  if (input.mustHaveBeats.length > 0) {
    parts.push([
      '【本章硬要求】',
      ...input.mustHaveBeats.map(
        (m) => `· ${m.text}${m.grade !== undefined ? `（落地·${m.grade}级须显性词）` : ''}（须出现关键词：${m.keywords.join('、')}）`,
      ),
    ].join('\n'));
  }
  const ironRules = (input.styleRulesText ?? '').split('\n').map((l) => l.trim()).filter((l) => l !== '').slice(0, 3);
  if (ironRules.length > 0) {
    parts.push(['【文风铁则】', ...ironRules].join('\n'));
  }
  return parts.join('\n\n');
}
```

### 3-4 管线接线（apps/server/src/pipeline/chapter.ts，操作：修改）

1. import（锚文本 `from '../prompts/render'`）补 `renderTaskSummaryBlock`。
2. **draft task 尾部**（锚文本 `前文腔调优先，文风档案作质感参照` 所在 task: 行）：continue 后缀之后接块：

```ts
task: renderDraft({ chapterNo: args.chapterNo, targetChars, worldview: '', blueprint }) + (runMode === 'continue' ? '\n前文腔调优先，文风档案作质感参照。' : '') + renderTaskSummaryBlock({ mustHaveBeats: blueprint.mustHaveBeats, styleRulesText: styleRulesText }),
```

3. **rewrite 保全句**：在 `echoFix` 常量（锚文本 `const echoFix`）之后新增：

```ts
const landingPreserve = blueprint.mustHaveBeats.length > 0 ? '蓝图必含节拍（含关键词）不得在修订中丢失，缺失必须补写。' : '';
```

插入两种 mode 的模板字符串（位置钉死：`${echoFix}${clicheFix}` 之后、"直接输出" 句之前）：
targeted 分支尾部：`...；${echoFix}${clicheFix}${landingPreserve}直接输出修订后的完整章节正文。`
full 分支尾部：`...；${echoFix}${clicheFix}${landingPreserve}直接输出完整章节正文。`

4. **rewrite task 槽尾部摘要块**：`renderRewrite({...})` 调用改为先存变量、追加块后传入 `buildRewriteSlots`（targeted 与 full 两处 `taskInstruction` 实参同值替换）：

```ts
const taskText = renderRewrite({ findings: l1.findings, taskInstruction }) + renderTaskSummaryBlock({ mustHaveBeats: blueprint.mustHaveBeats, styleRulesText: styleRulesText });
```

### 3-5 task 槽预算留量（apps/server/src/config.ts，操作：修改）

- BUDGETS_DRAFT `task: 500` → `task: 800`（blueprint 1000 不动）
- BUDGETS_REWRITE `task: 500` → `task: 800`

总预算核算：draft 表合计 500+16000+8000+1000+600+1000+2500+1500+1500+800=35400 ≪ 515k。摘要块典型体量 ≤250 字，800 给足 headroom；task 槽 keep='head' 且块位于内容尾部——预算留量正是为了不被截掉尾块。

### 3-6 测试

**A. apps/server/test/pipeline/chapter.test.ts**（新增；文件内先补 capturing 助手，实现照抄 test/pipeline/continue.test.ts 的 `capturing(inner)`）：

1. 新用例「mustHaveBeats(grade H) 章 → draft task 尾含【本章硬要求】分级文案，无档案书不含【文风铁则】」：
   - 用例内先插 ch4（照抄 beforeAll 的 raw SQL 风格，id `'ch4'`，blueprint：`JSON.stringify({ goal: '推进落地', beats: [], mustHaveBeats: [{ text: 'X（场景一）', keywords: ['场景一', '房东'], grade: 'H' }], bannedTopics: [] })`，target_chars 500；夹具文本中性占位）。
   - `const runId = freshRun(4); db.prepare('UPDATE runs SET max_rounds = 1 WHERE id = ?').run(runId);`
   - `const cap = capturing(createDefaultMockProvider());` 跑 `runChapterPipeline({ db, provider: cap.provider, config, emit: () => {} }, { runId, bookId, chapterNo: 4 })`（book 无档案）。
   - 断言 draft.user：含 `'【本章硬要求】'`、含 `'· X（场景一）（落地·H级须显性词）（须出现关键词：场景一、房东）'`；`indexOf('【本章硬要求】')` > `indexOf('【任务】')`（尾部性）；**不含** `'【文风铁则】'`（无档案自动省略）。
2. 新用例「无必含节拍章 → task 尾零污染」：复用 ch1（mustHaveBeats 空且无 grade）+ 默认 mock，断言 draft.user **不含** `'【本章硬要求】'` 且不含 `'蓝图必含节拍'`。
3. 新用例「重写保全：rewrite 指令含保全句与硬要求块」：ch4 + max_rounds=1 + blocker QC 文样（照抄该文件场景二的 blockerQc），断言 `cap.calls.find((c) => c.step === 'rewrite')!.user` 含 `'不得在修订中丢失'` 与 `'【本章硬要求】'`（关键词必 miss → beat_coverage 硬失败 → 必触发 rewrite）。

**B. apps/server/test/pipeline/continue.test.ts**（新增一例，复用文件内既有 `capturing` 助手与绑定了 mock-profile 的书）：

- `upsertBlueprint` 建 ch4：`{ goal: '续写落地', beats: [], mustHaveBeats: [{ text: 'Y（重逢戏）', keywords: ['重逢'], grade: 'H' }], bannedTopics: [] }`（grade 为中性占位验证文案分支），`createRun mode 'continue'` 跑 ch4。
- 断言 draft.user 含 `'【本章硬要求】'`、含 `'（落地·H级须显性词）'`、含 `'【文风铁则】'` 与 `'RULES: 句长 10-20 字。'`。

**C. apps/server/test/prompts/contract.test.ts**（新增一例；既有 renderDraft 用例无 grade 条目=改前形态回归钉，保留）：

```ts
it('renderDraft：带 grade 必含节拍显示落地分级提示', () => {
  const bp = { ...BP, mustHaveBeats: [{ text: '密信到手', keywords: ['密信'], grade: 'H' as const }] };
  const out = renderDraft({ chapterNo: 3, targetChars: 3000, worldview: '世界观占位', blueprint: bp });
  expect(out).toContain('【必含节拍】密信到手（落地·H级须显性词）（须出现关键词：密信）');
});
```

**D. apps/server/test/config.test.ts 钉值更新**：draft 表 `task: 500` → `task: 800`；rewrite 表 `task: 500` → `task: 800`。

### 3-7 验收标准

- 输入：chapter blueprint `mustHaveBeats=[{ text:'X（场景一）', keywords:['场景一','房东'], grade:'H' }]`、书无档案 → draft 请求 user 尾部含 `【本章硬要求】\n· X（场景一）（落地·H级须显性词）（须出现关键词：场景一、房东）`，不含 `【文风铁则】`。
- 书绑档案（rulesText 非空）→ user 尾部再含 `【文风铁则】\n<RULES 行>`。
- 无必含节拍且无档案 → task 内容与改前逐字节同形（零污染）；无 grade 条目 → 文案与改前逐字节同形。
- rewrite 触发时 user 含 `蓝图必含节拍（含关键词）不得在修订中丢失，缺失必须补写。`。

### 3-8 验收命令与提交

```
pnpm --filter @inkforge/server typecheck
pnpm --filter @inkforge/server exec vitest run test/pipeline/chapter.test.ts test/pipeline/continue.test.ts test/prompts/contract.test.ts test/config.test.ts
pnpm --filter @inkforge/server test
```

提交：`feat(server): 重写保全必含节拍并在任务尾部注入硬要求与文风铁则摘要`，正文 `verify: server typecheck+vitest 全绿，测试基线只增；Refs: DEC-2026-1120-10`。

---

## Task-04 风格显著性：预算扩容 + 块序反转 + 元信息降噪

- 依赖：Task-03（config.ts/config.test.ts 串行）。
- 目标：styleDims 1411 字全量可见、fewShot 范例片段优先于术语表、辅档案规则注入面翻倍、description 16k 预算内剥版本/变更/待确认/决策元信息。

### 4-1 预算钉值（apps/server/src/config.ts，操作：修改）

- BUDGETS_DRAFT `styleDims: 600` → `styleDims: 1600`（锚文本 `styleDims: 600`）
- BUDGETS_DRAFT `fewShot: 1500` → `fewShot: 2500`（锚文本 `fewShot: 1500`）
- 离线实测：styleDims 合并全块 1411 字（>600 曾把特色词汇/章节结构两维+六轴锚点块整体切掉）、fewShot 全块 1746 字（>1500 且术语表先行挤占）。1600/2500 均包住实测值；draft 表合计 35800 ≪ 515k。8k 表不动。

### 4-2 辅档案规则封顶（apps/server/src/style/merge.ts，操作：修改）

锚文本 `const RULES_TOTAL_BUDGET = 400` 改为：

```ts
const RULES_TOTAL_BUDGET = 800; // DEC-2026-1120-10：辅档案规则总封顶 400→800（主档案 rulesText 382 字全量不变，第三档案规则 0 注入 → 有量可进）
```

### 4-3 renderStyleBlock 块序反转 + 术语截 5（apps/server/src/style/inject.ts，操作：修改）

`renderStyleBlock`（锚文本 `export function renderStyleBlock`）整体替换为：

```ts
/** 风格块渲染（DEC-2026-1120-10）：规则行 + 范例片段 + 术语段（terms 截 5 条、置于尾部）；超预算 head 截断时先牺牲术语。rulesText 去空白为空时不产出【文风规则】空头（B1 修保留）。 */
export function renderStyleBlock(rulesText: string, samples: StyleSample[], budgetChars = 1200, terms?: StyleTermDto[]): string {
  const parts: string[] = [];
  if (rulesText.trim().length > 0) {
    parts.push(`【文风规则】\n${rulesText}`);
  }
  parts.push(...samples.map((s) => `【范例片段】\n${s.text}`));
  if (terms && terms.length > 0) {
    parts.push(`【术语表】\n${terms.slice(0, 5).map((t) => `${t.term}：${t.note}`).join('\n')}`);
  }
  const full = parts.join('\n\n');
  return full.length <= budgetChars ? full : full.slice(0, budgetChars);
}
```

钉死点：顺序=【文风规则】（若有）→【范例片段】→【术语表】；术语 `slice(0, 5)`；预算不足由 head 截断天然先牺牲术语（参考小说人名术语表 ~450 字不再挤占范例片段）。fewShot 主调用（chapter.ts 锚文本 `renderStyleBlock('', styleSamples`）rulesText 恒空串，行为=范例片段在前、术语殿后。

### 4-4 description 元信息降噪（apps/server/src/settings-import.ts，操作：修改）

在 `refineForDescription`（锚文本 `function refineForDescription`）上方新增模块级常量，函数内接入跳节/跳行逻辑：

```ts
// v4 元信息降噪（DEC-2026-1120-10）：版本行 / vN→vN 变更行 / 待确认项行 / 决策记录行，及上述主题的整节
const META_LINE_RE = /^(?:>+\s*)?(?:版本\s*[：:]|v\d+\s*[→↔\-—>]+\s*v?\d+|待确认项?\s*[：:]|决策(?:记录|日志)\s*[：:])/;
const META_SECTION_RE = /^#{1,6}\s*(?:[\d.、]+\s*)?(?:版本(?:记录|沿革|变更)|修订(?:记录|历史|说明)|变更(?:记录|日志|说明)|待确认项?|决策(?:记录|日志))/;
```

`refineForDescription` 函数开头补 `let skipUntilLevel: number | null = null;`；循环体内 `const t = stripMd(rawLine.trim());` 之后、既有表格/分隔线判断之前插入：

```ts
    const headM = /^(#{1,6})\s*(?:[\d.、]+\s*)?/.exec(t);
    if (headM && META_SECTION_RE.test(t)) {
      skipUntilLevel = headM[1].length; // 噪声节：连标题带节体剥除
      continue;
    }
    if (skipUntilLevel !== null) {
      if (headM && headM[1].length <= skipUntilLevel) {
        skipUntilLevel = null; // 同级或更高级标题恢复正文
      } else {
        continue;
      }
    }
    if (META_LINE_RE.test(t)) continue; // 散落噪声行
```

### 4-5 测试钉值冲击清单（逐条必改，基线只增）

1. **apps/server/test/config.test.ts**（draft 整体 toEqual 用例）两值更新：`styleDims: 1600`、`fewShot: 2500`（task 已在 Task-03 改 800）。draft8k/qc/qc8k/rewrite 钉值不动。
2. **apps/server/test/style/merge.test.ts** 两个封顶用例（锚文本 `辅去重补充受 400 总预算封顶` 与 `主 rulesText 超 400`）替换为三个（钉 800）：

```ts
it('规则合并：主全量保留，辅去重补充受 800 总预算封顶（预算内追加）', () => {
  const main700 = '甲'.repeat(700);
  const b1 = bundle({ profiles: { p1: prof({ rulesText: main700 }), p2: prof({ rulesText: '乙'.repeat(30) }) }, auxProfileIds: ['p2'] });
  const m1 = mergeStyleProfiles(b1, 1);
  expect(m1.rulesText.length).toBe(700 + 1 + 30);
});

it('辅行超 800 封顶：break 当前辅档案不再补', () => {
  const main700 = '丙'.repeat(700);
  const b2 = bundle({ profiles: { p1: prof({ rulesText: main700 }), p2: prof({ rulesText: `${main700}\n${'丁'.repeat(120)}` }) }, auxProfileIds: ['p2'] });
  const m2 = mergeStyleProfiles(b2, 1);
  expect(m2.rulesText).toBe(main700); // 首行重复跳过；次行 700+1+120=821>800 → break
});

it('主 rulesText 超 800：全量保留且不补辅', () => {
  const main850 = '戊'.repeat(850);
  const b = bundle({ profiles: { p1: prof({ rulesText: main850 }), p2: prof({ rulesText: '己'.repeat(20) }) }, auxProfileIds: ['p2'] });
  const m = mergeStyleProfiles(b, 1);
  expect(m.rulesText).toBe(main850);
});
```

   0. **漏列补录（Task-04 执行期冲突裁决 2026-11-20）**：同文件 :275 用例「规则多辅：B 行超预算 break、C 短行仍可补入」同样依赖旧 400 封顶——辅 B 行 `'乙'.repeat(120)` 同步改 `repeat(520)`（300+1+520=821>800 保 break 语义），361/不含乙/尾丙三钉值与用例语义不变。
3. **apps/server/test/style/analysis.test.ts** 块序用例（锚文本 `位于范例片段之前`）反转：

```ts
it('renderStyleBlock 注入术语段：位于范例片段之后，超预算先牺牲术语', () => {
  const terms = [{ term: '青云剑诀', note: '核心功法' }];
  const block = renderStyleBlock('规则行', [{ id: 's0', text: '样本正文'.repeat(50) }], 100000, terms);
  expect(block.indexOf('【术语表】')).toBeGreaterThan(block.indexOf('【范例片段】'));
  expect(block).toContain('青云剑诀：核心功法');
  const tight = renderStyleBlock('规则行', [{ id: 's0', text: '样本正文'.repeat(50) }], 30, terms);
  expect(tight.length).toBeLessThanOrEqual(30);
  expect(tight).not.toContain('【术语表】'); // 尾部术语先被 head 截断牺牲
});
```

4. **apps/server/test/style/inject-blocks.test.ts**：既有断言全部兼容（rules='' 无空头；'规则一' 时【文风规则】仍在最前；注入隔离用例不动），**新增一个顺序断言用例**：

```ts
it('块序（DEC-2026-1120-10）：范例片段在前、术语表在后且截 5 条', () => {
  const terms = Array.from({ length: 8 }, (_, i) => ({ term: `术语${i}`, note: `注${i}` }));
  const block = renderStyleBlock('', samples, 100000, terms);
  expect(block.indexOf('【范例片段】')).toBeLessThan(block.indexOf('【术语表】'));
  expect(block).toContain('术语4：注4');
  expect(block).not.toContain('术语5：注5'); // slice(0,5)
  expect(block).not.toContain('高频词'); // 注入隔离不受影响（DEC-2026-1120-06 沿用）
});
```

5. **apps/server/test/settings-import.parse.test.ts** 新增降噪钉值用例（describe 内追加）：

```ts
it('v4 元信息降噪：版本行/变更行/待确认节/决策记录剥除，正文保留', () => {
  const noisy = [
    '# 《降噪书》设定集（v4）',
    '> 定位一句话：降噪测试。',
    '> 版本：v4（2026-11-20，owner 修订四至七）',
    '## 3. 世界观',
    '虚构港市，年代约 2003。',
    '### 版本记录',
    'v3→v4 变更：新增女性线三章。',
    '### 3.1 待确认项',
    '- 女主线是否提前登场',
    '决策记录：原第 12 章并入第 9 章。',
    '## 6. 总大纲',
    '### 卷一 《题》（第 1–2 章）',
    '1. **第一夜**（开场）',
  ].join('\n');
  const d = parseSettingsCompendium(noisy);
  expect(d.description).toContain('定位一句话：降噪测试');
  expect(d.description).toContain('虚构港市');
  expect(d.description).toContain('第一夜');
  expect(d.description).not.toContain('版本：v4');
  expect(d.description).not.toContain('v3→v4');
  expect(d.description).not.toContain('新增女性线三章');
  expect(d.description).not.toContain('女主线是否提前登场');
  expect(d.description).not.toContain('决策记录');
  // '### 3.1 待确认项' 是低级噪声节标题：剥到下一个更高级标题（## 6）为止，节前正文存活
  expect(d.description.indexOf('虚构港市')).toBeGreaterThan(-1);
});
```

### 4-6 验收标准

- `loadConfig(LEGAL_ENV).budgets.draft` 全表 = `{ hardRules: 500, worldview: 16000, characters: 8000, styleRules: 1000, styleDims: 1600, blueprint: 1000, continuity: 2500, prevTail: 1500, fewShot: 2500, task: 800 }`。
- 700 字主规则 + 30 字辅行 → 合并 731 字（辅进得来）；700+120 超 800 → 辅 break；主 850 → 全量保留不补辅。
- `renderStyleBlock('', samples, 100000, terms8)`：范例片段段 index < 术语表段 index，术语恰 5 条。
- 带版本/变更/待确认/决策噪声的设定集 → description 无这些行/节，正文句全存活。
- description 预算 16000 不变（settings-import.ts DESCRIPTION_BUDGET 不动）。

### 4-7 验收命令与提交

```
pnpm --filter @inkforge/server typecheck
pnpm --filter @inkforge/server exec vitest run test/config.test.ts test/style/merge.test.ts test/style/inject-blocks.test.ts test/style/analysis.test.ts test/settings-import.parse.test.ts
pnpm --filter @inkforge/server test
pnpm -r --if-present run typecheck
pnpm deadcode
```

提交：`feat(server): 风格注入扩容显著性预算并反转风格块序与设定集元信息降噪`，正文 `verify: server typecheck+vitest 全绿+根 typecheck+knip 零新增死码，测试基线只增；Refs: DEC-2026-1120-10`。

---

## Task-05 验收闸门（非代码卡：离线重放 + 行为翻转说明；合四卡后执行）

- 依赖：Task-04 已 commit。
- 目标：对新注入面做离线重放取证，随完成通知呈 owner；最终验收=owner 重建书实跑 ch1 对照参考小说（owner 独占，agent 不得代验）。

### 5-1 新建脚本 apps/server/data/replay-gen-landing-1120.ts（操作：新增）

照 apps/server/data/replay-draft-1120.ts 先例（readonly 打开备份库 + 真实管线函数重放 draft 装配），差异钉死：
- budgets 用新值：`{ hardRules: 500, worldview: 16000, characters: 8000, styleRules: 1000, styleDims: 1600, blueprint: 1000, continuity: 2500, prevTail: 1500, fewShot: 2500, task: 800 }`；
- 库路径：`process.argv[2] ?? 'I:/inkforge/apps/server/data/backups/f714c7d1-ed16-4933-b579-1b2d7997c125/f714c7d1-ed16-4933-b579-1b2d7997c125-predelete-1795150250651-0001.db'`（先例同款缺省，可被参数覆盖）；
- 大纲卡取证 SQL：`SELECT title, body FROM outline_nodes WHERE level='card' AND chapter_from IS NOT NULL AND chapter_from<=1 AND chapter_to IS NOT NULL AND chapter_to>=1 ORDER BY rowid LIMIT 1` → `parseLandingCell(body)`（import 自 `../src/settings-import.ts`，tsx 同先例）→ 模拟 Task-01 预填：`blueprint.mustHaveBeats = landing && landing.keywords.length > 0 ? [{ text: body.trim(), keywords: landing.keywords, grade: landing.grade }] : []`；
- task = `renderDraft({...}) + renderTaskSummaryBlock({ mustHaveBeats, styleRulesText: merged.rulesText })`（import 自 `../src/prompts/render.ts`）；
- 输出（先例同款风格）：slotReport 全表、system/user 总长、styleDims 槽全文（含未截断前块长）、fewShot 槽全文（含未截断前块长）、task 槽全文、worldview/characters used 值。

运行：`pnpm --filter @inkforge/server exec tsx data/replay-gen-landing-1120.ts`（手工跑，验证链外；脚本在 data/ 不进 src，knip 无感知——先例同地位）。

### 5-2 闸门产物（随完成通知呈 owner）

1. 重放输出贴出 styleDims/fewShot/task 三槽存活面（used/truncated/全文），对照改前实测（dims 1411→600 截、fewShot 1746→1500 截且术语表挤占、task 无摘要块）给出前后对照一句话结论。
2. **行为翻转说明**（含修订一后的双层门）：①落地格关键词全 miss → OR 层败；②人名类关键词命中（如『阿美』）但正文无分级词表词 → AND 层败（旧 OR 语义下此路径恒绿，本批封死）；③双命中 → 覆盖；④词表文件缺失/空 → AND 层跳过 fail-open。失败路径 → hardFail → 整章重写 → 仍败 → needs_human 诚实红灯；无落地格/无档案小书零污染、行为不变。
3. **词表定稿呈报**：landing-words.default.txt 默认表按 owner 给词全量收录；其中单字泛化词（干/手/指/吸/含/骑/揉/吹/握/操）误报率高的权衡随完成通知呈 owner，由 owner 决定是否在可编辑文件中删减。
4. owner 最终验收路径（owner 亲自）：重建书（走新 apply）→ 确认章节列表已带 57 章骨架 → 实跑 ch1 → 对照参考小说核风格与落地。

---

## 自审五查记录（修订后复审）

1. **每步恰好一种合理写法**：parser 算法/正则/切分字符类、骨架循环与 300/50 上限与 warnings 声明前移、grade 五处模板与文案统一单分支（`（落地·${m.grade}级须显性词）`）、AND 层判定式与 H=L∪H 包含关系、词表文件格式（[H]/[L] 分节+注释行）、装载器 fail-open 形态、槽位名/预算/插入点（spectrumReference 锚）、并集去重键（text trim，不含 grade）、块序与 terms 截 5、两个降噪正则、全部测试钉值——均单值钉死。✔
2. **无 TBD 死行**：全文无"待定/之后再定"；词表机制（含 desktop env 与打包面结论）、闸门产物均有钉死步骤；测试代码全部给到可照抄程度（含 import 指引）。✔
3. **签名一致性（grade 五处形与名）**：①shared `BeatRequirement.grade?: 'H' | 'L'`（domain.ts）；②zod `grade: z.enum(['H','L']).optional()`（http/schemas.ts blueprintSchema）；③settings-import `ParsedLanding.grade` → apply 落章条目 `grade: landing.grade` 与 Task-02 叠加条目 `grade: landing.grade`（同源同形）；④l0 `m.grade !== undefined && !wordHit(m.grade)`（`wordHit(grade: 'H' | 'L')`，字面量窄化一致）；⑤render `m.grade !== undefined ? \`（落地·${m.grade}级须显性词）\` : ''`（renderDraft 与 renderTaskSummaryBlock 同模板）。`parseLandingCell(body: string): ParsedLanding | null`、`loadLandingWords(path: string): LandingWords`、`renderTaskSummaryBlock({ mustHaveBeats, styleRulesText? })`、`findOutlineCardForChapter(tree, chapterNo)` 定义与消费全部同名同形。✔
4. **五类隐含输入各配归属测试**：①落地格形态变体 → parse.test parseLandingCell 组；②树形态（逐章表/重叠区间/空 body）→ http apply 落章 describe（含 grade 断言）；③预算与截断边界 → config/merge/inject-blocks/analysis/blueprint-suggest 钉值；④噪声行/节形态 → parse.test 降噪用例；⑤缺省与降级路径 → l0.test 六例（①人名假通过封死含无词表对照、②词表词命中关键词 miss、③双命中、④无 grade 同形、⑤词表缺失/空 fail-open、⑥装载器解析+缺失不抛）+ blueprint-suggest 未命中用例 + chapter.test 零污染用例。✔
5. **长度数倍于规格=抄写则换签名**：本计划非规格抄写——新增规格没有的钉死产物：`ParsedLanding`/`LandingWords` 接口与抽词/装载算法、`META_LINE_RE`/`META_SECTION_RE` 正则全文、AND 层判定代码、词表文件定稿全文、desktop env 注入行、骨架收集算法与双上限、`renderTaskSummaryBlock` 全文、PUT 并集算法、每条测试的输入输出钉值、验收命令与提交模板。✔
