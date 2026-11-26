# 计划：双端文本工具收 shared + 断连中止挂点抽 helper + dev 面公告存证（2026-11-26）

**目标一句话**：把 code-review 双轴评审出的三条 Standards 建议落地——双端重复的文本归一逻辑上收 `@inkforge/shared`、server 断连中止挂点抽成具名 helper，并把 dev 面依赖公告刷新为快照存证；全程纯重构零行为变更。

**架构**：pnpm monorepo，三工作区 `packages/shared`（双端公共纯函数，经 `src/index.ts` 桶导出）、`apps/server`（Fastify + node:crypto/DB）、`apps/web`（React + vite）。shared 为 server/web 的 `workspace:*` 运行时依赖（exports 直指 `./src/index.ts`），双端均已存在 `@inkforge/shared` 值导入先例，本次只增导出、不加依赖边。

**规格指针（本批规格 = owner 已锁决策 D-A/D-B/D-C/D-D，不得翻案）**：
- D-A 收 shared 三组（详见 Task-01/02/04）；D-B 查过不动四件（见「查过不动注记」）；D-C helper（Task-03）；D-D 公告存证（Task-05）。
- 决策归档：`docs/decision-log.md` DEC-2026-1126-10 收口记录（:813-820，Standards backlog 两条 + [PROXY-DECISION] 公告处置）。

**全局约束（逐条，全程适用）**：
1. 纯重构零行为变更：所有替换必须逐字符等价（同一正则字面量、同一 `\s` 语义），不得顺手改消息文案、阈值、错误处理。
2. 测试基线只增不减：shared 12 / server 677 / web 222（DEC-2026-1126-10 收口实测锚定）。
3. 执行者只 commit 不 push；提交信息 Conventional 前缀 + 中文描述，正文带 `verify:` 验证结果 + `Refs: DEC-2026-1126-10`；含中文的提交信息一律走 `git commit -F <msgfile>`（UTF-8），不得 `-m` 内联。
4. 永不 `git add -A` / 永不 `--no-verify`；只 add 本卡写集清单内的具体文件路径。
5. 行号为 2026-11-26 master 基线（commit 59449e9 后）的改前定位锚，同文件多步编辑按自上而下执行时行号会漂移，以内容锚为准。
6. 「修 bug 必带回归」本批不适用（纯重构）；真 socket 回归 `apps/server/test/http/settings-import.test.ts:516` 与 `apps/server/test/http/summarize-confirm.test.ts:200/:221` 是 helper 行为的保护网，Task-03 验证步必须跑到位。
7. 派卡自控：五卡写集两两互斥（见文末拆卡表），可并行度 = Task-01 ∥ Task-03 ∥ Task-05，Task-01 完成后 Task-02 ∥ Task-04。
8. `docs/decision-log.md` 收口引用行由主模型亲写，任何执行卡不得触碰。

**查过不动注记（D-B，评审员已核，本批禁止上收，防后人误收）**：
- `apps/server/src/llm/mock.ts:41-50` `trimToCount`：逐字符游走计数 + 截断，与 `countChars` 仅形似、语义不同（截断 vs 计数），不收。
- `apps/web/src/pages/BookDetailPage.tsx:119` `normalizeWeights`：比例钳底归一，单端组件件，不收。
- `apps/server/src/style/merge.ts:68` `normalizeDimsSource`：维度来源映射归一，非空白归一域，不收。
- `apps/server/src/fusion/tension.ts:84` `foldDimName` + `:94` `normalizeLanding`：server-only 落点归一，docblock（:82、:91-93）已警告与 shared 侧语义分叉，不收。

---

## Task-01 shared 上收：文本归一函数 + 标签行正则 + 单测

**改动文件集**：
- Modify `I:\inkforge\packages\shared\src\text.ts`
- Create `I:\inkforge\packages\shared\test\text.test.ts`

**接口**：
```ts
// Consumes：无（纯函数，无依赖）
// Produces（追加到 packages/shared/src/text.ts，随 src/index.ts:2 桶导出自动进 @inkforge/shared）：
export function collapseWhitespace(s: string): string;
// 语义：s.replace(/\s+/g, ' ').trim() —— 连续空白压单空格 + 首尾 trim
export const BRACKET_TAG_RE: RegExp;
// 字面量：/^\[(planted|advanced|resolved)\]\s*(.+)$/（无标志位，禁加 g——exec 会带 lastIndex 状态）
// 语义：exec 命中时 m[1]=标签，m[2]=原始描述段
// 命名说明：决策只定「具名导出」未定名，此为 planner 取的中性名，主审可改
```
（既有 `countChars(s: string): number` 在 text.ts:2-4，本卡不改其实现，只补测试。）

**步骤**：
- [ ] 1. `packages/shared/src/text.ts` 末尾追加 `collapseWhitespace` 与 `BRACKET_TAG_RE` 两个导出（签名+字面量如上），各带一行 docblock 注明语义与「server summarize / web 详情页双端共用」。
- [ ] 2. 核对 `packages/shared/src/index.ts:2` 已有 `export * from './text'`，无需改动（只读核对）。
- [ ] 3. 新建 `packages/shared/test/text.test.ts`，覆盖五类咬人输入（断言内嵌规格值）：
```ts
import { describe, expect, it } from 'vitest';
import { BRACKET_TAG_RE, collapseWhitespace, countChars } from '../src/text';

describe('countChars', () => {
  it('空串与纯空白（含全角空格）计数为 0', () => {
    expect(countChars('')).toBe(0);
    expect(countChars(' \t\r\n\u3000')).toBe(0);
  });
  it('去全部空白后计数', () => {
    expect(countChars('甲 乙\n丙')).toBe(3);
    expect(countChars('abc')).toBe(3);
  });
});

describe('collapseWhitespace', () => {
  it('空串与纯空白归一为空串', () => {
    expect(collapseWhitespace('')).toBe('');
    expect(collapseWhitespace(' \t\r\n\u3000 ')).toBe('');
  });
  it('连续混合空白（tab/换行/全角空格）压成单空格', () => {
    expect(collapseWhitespace('甲\t乙\n  丙\u3000丁')).toBe('甲 乙 丙 丁');
  });
  it('首尾空白去除', () => {
    expect(collapseWhitespace('  甲乙  ')).toBe('甲乙');
  });
  it('无空白串原样返回', () => {
    expect(collapseWhitespace('甲乙丙')).toBe('甲乙丙');
  });
});

describe('BRACKET_TAG_RE', () => {
  it('合法标签行匹配，多空白分隔时 m[1]=resolved、m[2]=描述', () => {
    const m = BRACKET_TAG_RE.exec('[resolved]   甲乙');
    expect(m).not.toBeNull();
    expect(m![1]).toBe('resolved');
    expect(m![2]).toBe('甲乙');
  });
  it('有标签无描述段不匹配', () => {
    expect(BRACKET_TAG_RE.test('[planted]')).toBe(false);
  });
  it('未收录标签值不匹配', () => {
    expect(BRACKET_TAG_RE.test('[frozen] 甲')).toBe(false);
  });
  it('零空白分隔（标签紧贴描述）仍匹配', () => {
    const m = BRACKET_TAG_RE.exec('[planted]甲乙');
    expect(m![1]).toBe('planted');
    expect(m![2]).toBe('甲乙');
  });
});
```
- [ ] 4. 验证：`pnpm --filter @inkforge/shared test` → 全绿，Tests 计数 ≥ 22（基线 12 + 本卡新增 10），无 skipped。
- [ ] 5. 验证：`pnpm --filter @inkforge/shared typecheck` → 零错（`tsc --noEmit`，scripts 已核）。
- [ ] 6. commit：`git add packages/shared/src/text.ts packages/shared/test/text.test.ts`，提交信息 `refactor(shared): text 工具补空白归一函数与标签行正则导出，补文本单测`，正文 `verify: shared vitest 全绿（≥22）+ typecheck 零错` + `Refs: DEC-2026-1126-10`，走 `git commit -F`。

---

## Task-02 server 管线切换 shared 导入（前置：Task-01）

**改动文件集**：
- Modify `I:\inkforge\apps\server\src\pipeline\summarize.ts`

**接口**：
```ts
// Consumes（Task-01 产出，经 @inkforge/shared）：
collapseWhitespace(s: string): string;
BRACKET_TAG_RE: RegExp;
// Produces：无新增导出（删除本地私有 normalizeThread，模块公开面不变）
```

**步骤**：
- [ ] 1. `summarize.ts` 在 `:7`（`import type { RunEvent } from '@inkforge/shared';`）之后新增值导入行 `import { collapseWhitespace, BRACKET_TAG_RE } from '@inkforge/shared';`（保留 :7 type 导入行不动，与仓库既有 type/value 分行风格一致）。
- [ ] 2. 删除 `:24-27` 本地 `normalizeThread` 函数及其 docblock（`/** THREADS 归一化：trim + 压缩空白。 */`）。
- [ ] 3. `:95` `normalizeThread(f.description)` → `collapseWhitespace(f.description)`。
- [ ] 4. `:97` `/^\[(planted|advanced|resolved)\]\s*(.+)$/.exec(raw)` → `BRACKET_TAG_RE.exec(raw)`（字面量逐字符一致，不得加标志位）。
- [ ] 5. `:100` `normalizeThread(desc)` → `collapseWhitespace(desc)`。
- [ ] 6. 全文件 grep 核对：`normalizeThread` 零残留。
- [ ] 7. 验证：`pnpm --filter @inkforge/server test` → 全绿（基线 677 只增不减），其中管线 summarize 相关测试文件全数通过。
- [ ] 8. 验证：`pnpm --filter @inkforge/server typecheck` → 零错。
- [ ] 9. commit：`git add apps/server/src/pipeline/summarize.ts`，提交信息 `refactor(server): 管线空白归一与标签行正则切换 shared 导入，删本地副本`，正文 `verify: server vitest 全绿（≥677）+ typecheck 零错` + `Refs: DEC-2026-1126-10`，走 `git commit -F`。

---

## Task-03 server 断连中止挂点抽 helper（无前置，可与 Task-01 并行）

**改动文件集**：
- Create `I:\inkforge\apps\server\src\http\close-abort.ts`
- Create `I:\inkforge\apps\server\test\http\close-abort.test.ts`
- Modify `I:\inkforge\apps\server\src\http\routes.ts`

**接口**：
```ts
// Produces（新文件 close-abort.ts；kebab-case 命名已按同目录 character-instantiate.ts /
// blueprint-batch.ts 等既有风格核对）：
import type { FastifyReply } from 'fastify';

/**
 * 断连即中止：挂 reply.raw 的 close。
 * req.raw 的 close 在请求体读完即触发（真 socket），会秒杀本次 LLM 调用，
 * 故必须挂 reply.raw；inject 测不出此差异（收口黑盒实证）。
 */
export function abortOnDisconnect(reply: FastifyReply, ac: AbortController): void;
// 行为：reply.raw.once('close', () => { if (!reply.sent) ac.abort(); })
// Consumes：node 事件循环 + FastifyReply.raw（EventEmitter）+ reply.sent 布尔
```

**步骤**：
- [ ] 1. 新建 `apps/server/src/http/close-abort.ts`，签名、docblock（保留上述原委注释）与函数体如接口块。
- [ ] 2. 新建 `apps/server/test/http/close-abort.test.ts`，两条用例（EventEmitter 假 reply.raw）：
```ts
import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import type { FastifyReply } from 'fastify';
import { abortOnDisconnect } from '../../src/http/close-abort';

function fakeReply(sent: boolean): FastifyReply {
  return { raw: new EventEmitter(), sent } as unknown as FastifyReply;
}

describe('abortOnDisconnect', () => {
  it('close 且未发送 → abort', () => {
    const reply = fakeReply(false);
    const ac = new AbortController();
    abortOnDisconnect(reply, ac);
    (reply.raw as EventEmitter).emit('close');
    expect(ac.signal.aborted).toBe(true);
  });
  it('close 但已发送 → 不 abort', () => {
    const reply = fakeReply(true);
    const ac = new AbortController();
    abortOnDisconnect(reply, ac);
    (reply.raw as EventEmitter).emit('close');
    expect(ac.signal.aborted).toBe(false);
  });
});
```
- [ ] 3. `routes.ts` 顶部新增 `import { abortOnDisconnect } from './close-abort';`（相对导入，与同目录 `./schemas` 风格一致）。
- [ ] 4. `:397` 注释行删除（原委已移 helper docblock）；`:398` `const ac = new AbortController();` 保留；`:399-401` 三行 `reply.raw.once(...)` 替换为 `abortOnDisconnect(reply, ac);`。
- [ ] 5. `:1521` 注释行删除；`:1522` `const ac = new AbortController();` 保留；`:1523-1525` 三行替换为 `abortOnDisconnect(reply, ac);`。
- [ ] 6. 全文件 grep 核对：`reply.raw.once` 零残留（两处均已收口）。
- [ ] 7. 验证：`pnpm --filter @inkforge/server test` → 全绿（基线 677 + 本卡 2 = ≥679），**点名保护网**：`test/http/settings-import.test.ts` 的「真 socket：延迟 provider 应答期间连接未断 → 200」（:516 起）与 `test/http/summarize-confirm.test.ts` 的「真 socket：…」（:221 起）两条必须 PASS——它们是 helper 挂点行为（reply.raw 而非 req.raw）的真 socket 保护网；另 :200 起「commit 在途断连不触发落库」PASS。
- [ ] 8. 验证：`pnpm --filter @inkforge/server typecheck` → 零错。
- [ ] 9. commit：`git add apps/server/src/http/close-abort.ts apps/server/test/http/close-abort.test.ts apps/server/src/http/routes.ts`，提交信息 `refactor(server): 断连中止挂点抽 abortOnDisconnect helper 并替换两处调用`，正文 `verify: server vitest 全绿（≥679，含两条真 socket 回归）+ typecheck 零错` + `Refs: DEC-2026-1126-10`，走 `git commit -F`。

---

## Task-04 web 切换 shared 导入（前置：Task-01）

**改动文件集**：
- Modify `I:\inkforge\apps\web\src\components\DistillProfilesShell.tsx`
- Modify `I:\inkforge\apps\web\src\pages\ImitationProfilesSection.tsx`
- Modify `I:\inkforge\apps\web\src\pages\StyleProfilesSection.tsx`
- Modify `I:\inkforge\apps\web\src\pages\BookDetailPage.tsx`

**接口**：
```ts
// Consumes（Task-01 产出，经 @inkforge/shared）：
countChars(s: string): number;      // 既有导出（text.ts:2-4），本批首次被 web 引用
collapseWhitespace(s: string): string;
BRACKET_TAG_RE: RegExp;
// Produces：无新增导出（四个文件公开面不变，BookDetailPage.tsx:119 normalizeWeights 原样保留）
```

**步骤**：
- [ ] 1. `DistillProfilesShell.tsx` 顶部（现无 shared 导入）新增 `import { countChars } from '@inkforge/shared';`；`:152` `const stripped = text.replace(/\s/g, '').length;` → `const stripped = countChars(text);`。
- [ ] 2. `ImitationProfilesSection.tsx` 新增值导入 `import { countChars } from '@inkforge/shared';`（`:8` 已有 type 导入行，分行新增）；`:31` `const stripped = text.replace(/\s/g, '').length;` → `const stripped = countChars(text);`。
- [ ] 3. `StyleProfilesSection.tsx` 把 `countChars` 并入 `:7` 既有值导入 `import { STYLE_AXES, STYLE_DIMENSIONS, ... } from '@inkforge/shared';`；`:111` `if (text.replace(/\s/g, '').length < 200) {` → `if (countChars(text) < 200) {`；`:112` 模板串内 `当前 ${text.replace(/\s/g, '').length} 字` → `当前 ${countChars(text)} 字`（提示文案其余字符逐字不动）。
- [ ] 4. `BookDetailPage.tsx` 把 `collapseWhitespace, BRACKET_TAG_RE` 并入 `:62` 既有值导入；`:83` `f.description.replace(/\s+/g, ' ').trim()` → `collapseWhitespace(f.description)`；`:86` `/^\[(planted|advanced|resolved)\]\s*(.+)$/.exec(raw)` → `BRACKET_TAG_RE.exec(raw)`；`:92` `desc.replace(/\s+/g, ' ').trim()` → `collapseWhitespace(desc)`。
- [ ] 5. 四文件 grep 核对：`replace(/\s` 零残留（本批目标点收口）。
- [ ] 6. 验证：`pnpm --filter @inkforge/web test` → 全绿，基线 222 只增不减；点名既有组件测试 PASS：`apps/web/src/components/DistillProfilesShell.test.tsx`、`apps/web/src/pages/ImitationProfilesSection.test.tsx`、`apps/web/src/pages/StyleProfilesSection.test.tsx`、`apps/web/src/pages/BookDetailPage.test.tsx`。
- [ ] 7. 验证：`pnpm --filter @inkforge/web typecheck` → 零错。
- [ ] 8. commit：`git add apps/web/src/components/DistillProfilesShell.tsx apps/web/src/pages/ImitationProfilesSection.tsx apps/web/src/pages/StyleProfilesSection.tsx apps/web/src/pages/BookDetailPage.tsx`，提交信息 `refactor(web): 内联去空白计数与标签行正则切换 shared 导入`，正文 `verify: web vitest 全绿（=222）+ typecheck 零错` + `Refs: DEC-2026-1126-10`，走 `git commit -F`。

---

## Task-05 dev 面公告快照存证（无前置，可与任意卡并行）

**改动文件集**：
- Create `I:\inkforge\apps\server\data\audit-baseline-dev.json`（仅此一文件入写集；decision-log 回填行由主模型执行，不在本卡）

**口径**：dev 面 6 条公告（vitest×3 / tinypool×2 critical / minimatch）已载 `docs/decision-log.md:817-818` 文字记录，本卡把它落成机器可查快照，与既有 prod 口径 `apps/server/data/audit-baseline.json`（`{"advisories":…,"metadata":{"vulnerabilities":…}}` 形态）并列。命名 `audit-baseline-dev.json` 对齐同目录既有 topic-role 风格（audit-baseline.json / audit-rescan.json）。

**步骤**：
- [ ] 1. 仓库根执行 `pnpm audit --json > apps/server/data/audit-baseline-dev.json`。注意：存在公告时 pnpm audit 退出码非零，属预期，重定向内容不受影响。
- [ ] 2. 验证落盘内容：文件可 `JSON.parse`，首键 `advisories`，`metadata.vulnerabilities` 存在，且公告计数与 decision-log:817 记载的 6 条口径一致（vitest×3/tinypool×2/minimatch×1，与 `audit-baseline.json` 同构比对字段）。
- [ ] 3. 【主审裁定 2026-11-26】不入库：prod 基线实测为 gitignore 下本地存证（`git ls-files apps/server/data` 空、check-ignore 命中），dev 快照沿同口径——落盘即交付，无 commit 步；decision-log 引用行由主模型写（下一步）。
- [ ] 4. 【由主模型执行，执行者勿动】`docs/decision-log.md` 收口记录区（:813-820 块内）回填一行引用，指向该快照文件路径与生成日期。

---

## 自审五查结果

1. **规格覆盖**：D-A ①（Task-04 步 1-3，三处内联点 :152/:31/:111-112 全数）②（Task-01 + Task-02 步 2-5 + Task-04 步 4，server :95/:100 与 web :83/:92）③（Task-01 + Task-02 步 4 + Task-04 步 4）全覆盖；D-C（Task-03，签名/注释/两调用点照抄决策）；D-D（Task-05，含主模型保留权标注）；D-B 四件落「查过不动注记」。无遗漏。
2. **每步唯一可写**：每步一个动作 + 一个可核对结果（精确替换串或命令输出），无「处理边界/加合适校验」类死行。
3. **类型一致**：`collapseWhitespace(s: string): string`、`BRACKET_TAG_RE: RegExp`、`abortOnDisconnect(reply: FastifyReply, ac: AbortController): void` 与双端调用点实参（string / exec 返回值 / reply+ac）逐一核对；正则禁加 `g` 标志已写明。
4. **五类咬人输入各配一条测试**：空串/纯空白（countChars + collapseWhitespace 各一）、混合连续空白压单空格、首尾 trim、有标签无描述不匹配、未收录标签不匹配 + 零空白分隔合法行——全挂 Task-01（shared/test/text.test.ts），helper 两侧行为（sent/unsent）另挂 Task-03。
5. **比例**：代码净改动约 30 行源码 + 110 行测试，本计划含任务板与拆卡表约 320 行，未超「数倍」红线（测试占大头且为规格要求）。

---

## 拆卡表（派卡前自控：写集两两互斥）

| 卡号 | 写集（互斥核对用） | 前置 | 验收要点 |
|---|---|---|---|
| Task-01 | `packages/shared/src/text.ts` (M)、`packages/shared/test/text.test.ts` (A) | 无 | shared 测试 ≥22 全绿；两个新导出经桶导出可见 |
| Task-02 | `apps/server/src/pipeline/summarize.ts` (M) | Task-01 | server ≥677 全绿；`normalizeThread` 零残留；typecheck 零错 |
| Task-03 | `apps/server/src/http/close-abort.ts` (A)、`apps/server/test/http/close-abort.test.ts` (A)、`apps/server/src/http/routes.ts` (M) | 无 | server ≥679 全绿；两条真 socket 回归点名 PASS；`reply.raw.once` 零残留 |
| Task-04 | `apps/web/src/components/DistillProfilesShell.tsx`、`apps/web/src/pages/ImitationProfilesSection.tsx`、`apps/web/src/pages/StyleProfilesSection.tsx`、`apps/web/src/pages/BookDetailPage.tsx`（均 M） | Task-01 | web =222 全绿；四个组件测试文件点名 PASS；内联 `\s` 替换零残留 |
| Task-05 | `apps/server/data/audit-baseline-dev.json` (A, 本地存证不入库，主审裁定) | 无 | 快照 JSON 可解析、与 prod 基线同构、6 条口径一致；decision-log 行由主模型写 |

并行度：Task-01 ∥ Task-03 ∥ Task-05 → Task-01 完成后 Task-02 ∥ Task-04。收口验证链：三基线全量（shared/server/web vitest）→ 两端 typecheck → 基线计数对照（12/677/222 只增不减）。
