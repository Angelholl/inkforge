# 四条反馈收口实现计划（D4 按钮 + B1 注入 + B2 版本硬删 + B3 评分可调 + B4 档案/示例开关 + B5 蒸馏后台化）

**目标：** 落地 owner 终拍板 DEC-2026-1116-01 的五件事——按钮全量归一先行、风格注入核心（七维六轴进上下文）、章节版本硬删+墓碑、评分解释与阈值可调、档案删除/解绑修复/文风示例逐书开关、蒸馏后台化+重新蒸馏。

**架构：** D4 纯 web（公共 Button → 按页替换）；B1/B2/B3/B4/B5 以 server 为轴心（迁移→repo→路由→管线），web 消费新 DTO；shared 包承载跨端接口。所有决策已由 plan-2026-11-16-four-feedbacks.md §一/§三 钉死，本计划只补规格未钉的实现决策。

**规格：**
- `docs/design/plan-2026-11-16-four-feedbacks.md`（方案真值，§三 owner 终拍板）
- `docs/design/spec-button-subtrans-2026-11-16.md`（D4 组件/映射/验收真值源）
- `docs/design/research-2026-11-16-ui-versions.md`（R1）、`docs/design/research-2026-11-16-distill-qc.md`（R2）（事实基础）

## 全局约束

1. **测试基线（主审 2026-11-16 实测已钉）**：shared 1 文件/2 用例全绿；web 11 文件/37 用例全绿；server 52 文件/231 用例（**229 绿 2 红**——红者即 Task0 所修之回归夹具读活库问题，Task0 完成后 server 钉为 231 全绿，此后各卡以全绿为基线）。每卡声明自己的 +N 用例落点；只增不减。
2. **验证链硬序**：静态（`pnpm typecheck` → `pnpm lint`）→ 定向测试 → 全量测试（`pnpm -r --if-present run test`）→（UI 卡）web-gui-tester 黑盒 → commit。任一环失败即停。
3. **所有命令均在项目根目录执行**。定向测试统一用 `pnpm --filter @inkforge/server exec vitest run <test路径>`（web 同理 `--filter @inkforge/web`）。
4. **执行者只 commit 不 push**。提交信息 Conventional 前缀+中文描述；**UI 卡提交信息注明「GUI 已验证」或「GUI 未验证」**；永不 `--no-verify`；永不 `git add -A`。
5. **GUI 黑盒纪律**（所有动 `apps/web` 的卡）：web-gui-tester 黑盒目验，前置调 lessons；独立 `INKFORGE_DATA_DIR`（临时目录）+ 独立 `INKFORGE_PORT`（避开 8787）；分辨率 1280×800 与 1600×900 各截图；按规格 §4.2 检查单中与本卡相关项核验。**在用生产库 `apps/server/data/inkforge.db` 及其 `backups/` 禁碰**（service.pid/worker.lock 在场，2026-11-16 实测）。
6. **迁移串行**：0006（Task8A）→ 0007（Task10A）→ 0008（Task11A），禁并行。命名与风格照 `apps/server/src/db/migrations/0001_core.sql`..`0005_round4_scope.sql`：`NNNN_短名.sql`，文件头 `-- NNNN：<事由>` 注释，`CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ADD COLUMN`。
7. **并行窗口**：仅 Task2-6（D4 替换卡，文件互不相交）可两两并行；其余卡一律串行单跑（同工作树 ≤1 卡）。
8. **TDD 纪律**：每卡步骤 = 写失败测试 → 跑红 → 最小实现 → 跑绿 → 静态检查 → commit。修默认值/改 bug 处（Task10B 解绑修复）必带回归测试。
9. **非目标**：规格 §2.3 对 `inputCls` 4px 圆角的「建议收编」不做（非强制项，避免卡面蔓延）；⑨多选绑定、.epub、persona 模板、仿写预览可编辑均缓议 0.3；SSE 事件通道不动（B5 走轮询）。
10. **B1 效果门** = Task7B 装配确定性测试 + owner 盲评（同书同蓝图 3 章×注入前后，主模型组织，非卡内任务）；qc-replay 语料只验解析不作效果门。

---

## Task0：回归夹具自固化（server 小卡，最先开，修基线 2 红）

**文件：**
- Create `apps/server/test/quality/regression/real/draft-005.txt`、`draft-008.txt`、`draft-012.txt`
- Modify `apps/server/test/quality/regression/qc-replay.test.ts`（draftFor :20-28）、`apps/server/test/quality/regression/qc-regression.test.ts`（draftFor 同款）、`apps/server/test/quality/regression/corpus.ts`（DB_PATH 导出与消费清理）

**接口：** `draftFor(chapterNo: number): string` 签名不变；数据源从活库改为仓库内夹具文件。无跨卡接口产出。

**事实背景（主审 2026-11-16 实证）：** server 基线 2 红系夹具读活库——draftFor 从 `apps/server/data/inkforge.db` 取书 `1130c0e1-dddd-47d6-8b28-86e0dd558cce` 的 5/8/12 章 current 正文，该书已被删（现库仅剩书 48a22171「33」），行 undefined 崩。恢复源=`data/exports/挂机-试炼之路-1112基线/`：l1-good-001/002/003 的全部 QUOTE 行（3+4+4 条）在该目录 005/008/012-第N层.md 中逐条精确命中（miss=0）；l1-bad-00X 无 QUOTE 行不受影响（其判据=解析容错）。回放测试的 draft 契约=quote 子串包含，导出文本满足。

**规格未钉的实现决策：**
- 夹具内容=对应导出 md **去首行 `# 第N层` 标题后的正文逐字节拷贝**；文件头两行注释：来源目录+「QUOTE 全命中核对 2026-11-16」+回放契约说明。
- draftFor 改 `readFileSync(path.join(REAL_DIR, \`draft-00${chapterNo}.txt\`))`（章号 5/8/12 直映文件名）；两测试文件与 corpus.ts 移除 better-sqlite3/DB_PATH 只读依赖（readonly 开库与 db.close 一并去）。

**步骤：**
- [ ] `pnpm --filter @inkforge/server exec vitest run test/quality/regression` → 确认 2 文件现红（先红前提登记）
- [ ] 落 3 个夹具文件（从 1112 基线导出拷贝+去标题+头注释）
- [ ] 改两处 draftFor + corpus.ts 清理
- [ ] 复跑 → 2 文件全绿且无新红
- [ ] `grep -n "inkforge.db" apps/server/test/quality/regression/*.ts` → 0 命中
- [ ] `pnpm typecheck && pnpm lint` → 0 错
- [ ] `pnpm --filter @inkforge/server exec vitest run` → 231 全绿（用例数不变）
- [ ] commit（`test(server): qc 回归夹具自固化，去活库依赖`；GUI 未触及）

---

## Task1：Button 公共组件（D4 前置）

**文件：**
- Modify `apps/web/src/components/ui.tsx`（文件尾 :76 后追加）
- Test Create `apps/web/src/components/ui.test.tsx`

**接口：**
- Consumes：规格 §1.2 全部 class 串（`spec-button-subtrans-2026-11-16.md:64-113`）；ui.tsx 既有 `BADGE_TONES` 的 `Record<Variant,string>` 常量写法先例（ui.tsx:10-16）；lucide-react 1.72.0（已在依赖）。
- Produces（Task2-6、Task5 loading、Task6 chip、Task11B 蒸馏钮全部消费）：

```tsx
export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'quiet';
export type ButtonSize = 'md' | 'sm';
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;   // 默认 'secondary'
  size?: ButtonSize;         // 默认 'md'
  tone?: 'neutral' | 'primary' | 'danger'; // 仅 quiet，默认 'neutral'
  solid?: boolean;           // 仅 danger：两步确认第二步实底红
  active?: boolean;          // 可点选 chip 选中态（规格 §2.2）
  iconOnly?: boolean;        // 方形图标钮，调用方必须给 aria-label
  loading?: boolean;         // 进行中态（规格 §1.3）：disabled + aria-busy + 原内容 span.invisible 保宽 + 居中 Loader2(16, animate-spin, currentColor)
}
export function Button(props: ButtonProps): JSX.Element
```

实现决策（规格未钉处）：`Record<ButtonVariant,string>` 变体表 + `Record<ButtonSize,string>` 尺寸表 + quiet tone 子表，模板串拼接（同 BADGE_TONES 写法）；`iconOnly` 在 sm 串上叠 `w-8 px-0`；`className` 透传拼接放最后；`danger+solid` 覆盖串替换 danger 软底串；`active` 仅当 `variant='quiet'` 时叠 `bg-primary-soft text-primary-strong hover:bg-primary-soft`；loading 时组件内部强制 `disabled` 与 `aria-busy="true"`（规格 §1.3）。

**测试（+7，全部落 ui.test.tsx；testing-library + vitest，写法同 BooksPage.test.tsx）：**
1. 四变体 class：primary 含 `bg-primary`+`text-white`+`hover:bg-primary-strong`；secondary 含 `border-line`+`bg-surface`；danger 含 `border-danger/40`+`bg-danger-soft`；danger+solid 含 `bg-danger`+`text-white` 且不含 `border-danger/40`；quiet 三 tone 各含 `text-muted`/`text-primary-strong`/`text-danger`。
2. 尺寸：默认含 `h-ctl px-3.5 text-sm`；`size="sm"` 含 `h-8 px-2.5 text-xs`；`iconOnly` 含 `w-8 px-0`。
3. disabled：传 `disabled` → class 含 `disabled:opacity-45` 与 `disabled:cursor-not-allowed`。
4. focus-visible：任意变体 class 含 `focus-visible:outline-2` 与 `focus-visible:outline-primary`。
5. accessible name：文字钮 `getByRole('button', { name: '删除' })` 命中；`iconOnly` + `aria-label="移除"` 命中。
6. loading：`loading` → `aria-busy="true"`、disabled、原 children 渲染于 `span.invisible` 内、存在 `animate-spin` 元素；非 loading 时无 `aria-busy`。
7. className 透传：传 `ml-auto` 出现在拼接结果中。

**步骤：**
- [ ] 写 ui.test.tsx 上述 7 用例
- [ ] `pnpm --filter @inkforge/web exec vitest run src/components/ui.test.tsx` → 全红（组件不存在，编译失败即红）
- [ ] 按 §1.2 class 串与 Produces 签名实现 Button
- [ ] 重跑 → 7/7 绿
- [ ] `pnpm typecheck && pnpm lint` → 0 错
- [ ] `pnpm --filter @inkforge/web exec vitest run` → web 包全绿，用例数 = BASELINE-TBD+7
- [ ] commit（`feat(web): 新增 Button 公共组件（D4 规格四变体/尺寸/五状态）`；本卡不改页面，提交信息注明「GUI 未验证」）

---

## Task2：D4 替换 · BookDetailPage（13 处 + L2 确认簇）

**文件：**
- Modify `apps/web/src/pages/BookDetailPage.tsx`（按钮 :209/:212/:225/:250/:280/:283/:292/:300/:324/:363/:367/:391/:394；:291 预览 span）
- Test Modify `apps/web/src/pages/BookDetailPage.test.tsx`

**接口：**
- Consumes：Task1 `Button`；规格 §3.1 全 13 行映射（`spec-button-subtrans-2026-11-16.md:193-206`）+ §3.15 微调第 1 条（:291 span 加 `min-w-0`）+ §1.5 L2 簇形态（:140）+ §6.3。
- Produces：无（叶子页）。

**规格未钉的实现决策：**
- :300 人物卡「删除」升 L2：点击后原地展开确认簇——警示文案 `text-danger text-xs`「该人物卡及其历史状态将一并删除，不可恢复。」+「确认删除」`Button danger solid sm` +「取消」`Button secondary sm`；确认或取消后收簇，不自动回退。落库删除仍调既有 `api.deleteCharacter`。
- 「生成本章」（:394 → secondary·md）行为不变。

**受影响测试：** BookDetailPage.test.tsx——既有断言旧 class/裸 button 的用例同步改；+2：①点人物卡「删除」→ 簇出现 → 点「取消」→ 簇收起且未发 DELETE；②点「删除」→ 点「确认删除」→ 发出 DELETE /api/books/:bookId/characters/:id 且行消失。用例数只增不减。

**步骤：**
- [ ] 写 +2 失败用例 → `pnpm --filter @inkforge/web exec vitest run src/pages/BookDetailPage.test.tsx` 红
- [ ] 按 §3.1 十三行逐行替换为 `<Button variant=… size=…>`（:250 的 `mt-2` 走透传 className；:367 的 `ml-auto` 走透传）；:291 span 加 `min-w-0`；实现 L2 簇
- [ ] `grep -c "<button" apps/web/src/pages/BookDetailPage.tsx` → 0
- [ ] 定向测试绿 + `pnpm typecheck && pnpm lint` → 0 错
- [ ] web-gui-tester 黑盒（独立 dataDir/端口，1280×800+1600×900）：整书生成钮 36px 基线与同排 select 对齐；人物卡 L2 簇全流程；键盘 Tab 焦点环
- [ ] `pnpm --filter @inkforge/web exec vitest run` 全绿
- [ ] commit（提交信息注明「GUI 已验证」）

---

## Task3：D4 替换 · OutlineTreeSection + DistillPage（11+2 处）

**文件：**
- Modify `apps/web/src/pages/OutlineTreeSection.tsx`（:110/:113/:116/:119/:139/:142/:169/:172/:217/:241/:244）
- Modify `apps/web/src/pages/DistillPage.tsx`（:60/:63）
- Test Modify `apps/web/src/pages/DistillPage.test.tsx`

**接口：** Consumes：Task1 `Button`；规格 §3.10（:278-293）与 §3.5（:230-236）映射行。Produces：无。
本卡无 HANDOFF 行为变更（删卷/删阶段/删卡均 L1 草稿态单击直删，维持现状）。

**受影响测试：** OutlineTreeSection 无既有测试文件，不新建；DistillPage.test.tsx 既有 class 断言同步改，用例数不变（只增不减下限满足）。

**步骤：**
- [ ] 按 §3.10/§3.5 行号逐行替换（:110 `primary·sm`；卷/卡头行内钮走透传）
- [ ] 两文件 `grep -c "<button"` → 各 0
- [ ] `pnpm --filter @inkforge/web exec vitest run src/pages/DistillPage.test.tsx` 绿 + `pnpm typecheck && pnpm lint` 0 错
- [ ] web-gui-tester 黑盒：大纲树工具条五钮同排 32/36px 对齐；AI 生成大纲树 busy disabled 形态；DistillPage 主/次钮
- [ ] web 包全量绿
- [ ] commit（注明「GUI 已验证」）

---

## Task4：D4 替换 · NewBookPage + NewBookIdeaPage（7+6 处）

**文件：**
- Modify `apps/web/src/pages/NewBookPage.tsx`（:149/:176/:179/:194/:215/:222/:233）
- Modify `apps/web/src/pages/NewBookIdeaPage.tsx`（:144/:164/:199/:224/:247/:262；:223 goal span）
- Test Modify `apps/web/src/pages/NewBookPage.test.tsx`、`apps/web/src/pages/NewBookIdeaPage.test.tsx`

**接口：** Consumes：Task1 `Button`；规格 §3.9（:266-277）、§3.8（:255-265）、§3.15 微调第 3 条（:223 span 加 `min-w-0 truncate`）。Produces：无。
无 HANDOFF 行为变更（:164/:194 均 L1 草稿态直删，维持现状）。

**受影响测试：** 两测试文件既有 class 断言同步改，用例数不变。

**步骤：**
- [ ] 按 §3.8/§3.9 行号逐行替换；:223 span 加 `min-w-0 truncate`
- [ ] 两文件 `grep -c "<button"` → 各 0
- [ ] 两个测试文件定向绿 + `pnpm typecheck && pnpm lint` 0 错
- [ ] web-gui-tester 黑盒：建书三主钮（建书并进入导入/导入 N 章/发起续写）md 实底蓝；拆章预览行删除直删不折行（1280×800）
- [ ] web 包全量绿
- [ ] commit（注明「GUI 已验证」）

---

## Task5：D4 替换 · ImitationProfiles + Foreshadowings + StyleProfiles + SettingsPage（5+3+4+1 处，含 3 个 HANDOFF）

**文件：**
- Modify `apps/web/src/pages/ImitationProfilesSection.tsx`（:97/:115/:149/:179/:182；:96 span）
- Modify `apps/web/src/pages/ForeshadowingsSection.tsx`（:90/:95/:121）
- Modify `apps/web/src/pages/StyleProfilesSection.tsx`（:125/:177/:234/:237；:121 span）
- Modify `apps/web/src/pages/SettingsPage.tsx`（:124）
- Test Create `apps/web/src/pages/ImitationProfilesSection.test.tsx`
- Test Modify `apps/web/src/pages/ForeshadowingsSection.test.tsx`、`apps/web/src/pages/SettingsPage.test.tsx`、`apps/web/src/pages/StyleProfilesSection.test.tsx`

**接口：**
- Consumes：Task1 `Button`（含 loading prop）；规格 §3.7（:245-254）、§3.6（:237-244）、§3.14（:315-323）、§3.13（:309-314）、§3.15 微调第 2/4 条（ImitationProfilesSection:96 span 加 `min-w-0 break-all`；StyleProfilesSection:121 span 加 `min-w-0`）、§1.5 L2、§1.3 loading。
- Produces：SettingsPage 保存钮 loading 形态（Task9B 在同文件追加质量分区时复用 Button）。

**规格未钉的实现决策：**
- :97 仿写档案删除升 L2，警示文案：「该拆解档案将删除，已绑定书将自动解绑，不可恢复。」（服务端现状即解绑后删，imitation.ts:68-78）。
- :95 伏笔删除升 L2，警示文案：「该伏笔记录将删除，不可恢复。」
- SettingsPage:124：文案替换式「保存中…」废止；改 `loading={saving}`，children 恒「保存」，`type="submit"` 保留。
- StyleProfilesSection:177 蒸馏钮本卡仅做形态替换（busy 维持 disabled）；改 loading prop 归 Task11B（轮询语义一并改）。

**受影响测试（+5）：** ForeshadowingsSection.test.tsx +2（L2 簇：取消收簇不发 DELETE；确认发 DELETE）；ImitationProfilesSection.test.tsx 新建 +2（同款两用例）；SettingsPage.test.tsx +1（saving 期间按钮 `aria-busy="true"` 且文本仍为「保存」）；StyleProfilesSection.test.tsx 既有断言同步改。

**步骤：**
- [ ] 写 +5 失败用例 → 定向跑红
- [ ] 四文件按 §3 各行替换；实现两处 L2 簇与 loading prop；两处 span 微调
- [ ] 四文件 `grep -c "<button"` → 各 0
- [ ] 定向绿 + `pnpm typecheck && pnpm lint` 0 错
- [ ] web-gui-tester 黑盒：仿写档案 L2 簇全流程；伏笔 L2 簇；SettingsPage 保存 loading spinner 保宽不换字
- [ ] web 包全量绿
- [ ] commit（注明「GUI 已验证」）

---

## Task6：D4 替换 · BooksPage + BookSamplePicker + ChapterReaderPage + RunPage + SelectionRewrite（3+2+3+3+2 处，含 2 个 HANDOFF）

**文件：**
- Modify `apps/web/src/pages/BooksPage.tsx`（:48/:51/:60）
- Modify `apps/web/src/pages/BookSamplePicker.tsx`（:56/:93）
- Modify `apps/web/src/pages/ChapterReaderPage.tsx`（:42/:45/:56）
- Modify `apps/web/src/pages/RunPage.tsx`（:70/:73/:76）
- Modify `apps/web/src/pages/SelectionRewrite.tsx`（:52/:69）
- Test Create `apps/web/src/pages/ChapterReaderPage.test.tsx`、`apps/web/src/pages/SelectionRewrite.test.tsx`
- Test Modify `apps/web/src/pages/BooksPage.test.tsx`

**接口：**
- Consumes：Task1 `Button`；规格 §3.3（:214-221）、§3.2（:207-213）、§3.4（:222-229）、§3.11（:294-301）、§3.12（:302-308）、§2.2 chip 边界、§1.3 loading、§6.3/§6.4。
- Produces：ChapterReaderPage.test.tsx（Task8B 在同文件追加删除流用例）。

**规格未钉的实现决策：**
- 版本链 chip（:56）→ `Button variant="quiet" size="sm" active={current?.id === v.id}`：选中软底 `bg-primary-soft text-primary-strong`，废止实底选中；chip 文案不变。
- SelectionRewrite:69「提交选段重写」busy 改 `loading` prop，children 恒「提交选段重写」，废止换字。
- RunPage :70 暂停 `secondary·md`、:73 继续 `secondary·md`、:76 取消 `danger·md`（soft 形态，取消不确认）。
- BooksPage :48 确认钮 `danger solid sm`、:51 取消 `secondary sm`（L3 结构不变，仅收编形态）；:60 `quiet danger sm`。

**受影响测试（+2）：** BooksPage.test.tsx 既有两步确认用例的 class/角色断言同步改（用例数不变）；ChapterReaderPage.test.tsx 新建 +1（渲染版本链 chip：选中项 class 含 `bg-primary-soft`，未选中含 `text-muted`）；SelectionRewrite.test.tsx 新建 +1（busy 时按钮 `aria-busy="true"`、disabled、文本不变）。

**步骤：**
- [ ] 写 +2 失败用例 → 跑红
- [ ] 五文件按 §3 各行替换 + 两处 HANDOFF
- [ ] 五文件 `grep -c "<button"` → 各 0；`grep -rn "<button" apps/web/src/pages --include=*.tsx | wc -l` → 0（D4 全站完成标志）
- [ ] `grep -rn "bg-warn px-4 py-2\|disabled:opacity-50" apps/web/src --include=*.tsx | wc -l` → 0
- [ ] 定向绿 + `pnpm typecheck && pnpm lint` 0 错
- [ ] web-gui-tester 黑盒（规格 §4.1 三类代表页全走）：BooksPage L3 全流程；RunPage 暂停/继续/取消三钮同排且取消为 soft 红；版本链 chip 软底选中；选段重写 loading
- [ ] web 包全量绿
- [ ] commit（注明「GUI 已验证」）

---

## Task7A：B1 注入核心 · 槽位与渲染层（server 纯函数）

**文件：**
- Modify `apps/server/src/style/inject.ts`（renderStyleBlock :16-24；文件尾新增）
- Modify `apps/server/src/config.ts`（DraftBudgets :17-27、RewriteBudgets :36-42、BUDGETS_DRAFT :97-107、BUDGETS_DRAFT_8K :109-119、BUDGETS_REWRITE :123-129）
- Modify `apps/server/src/context/assembler.ts`（draftSlots :65-101）
- Modify `apps/server/src/pipeline/rewrite.ts`（RewriteSlotsInput :17-32、targeted 槽 :56-63、full 透传 :35-50）
- Test Create `apps/server/test/style/inject-blocks.test.ts`
- Test Modify `apps/server/test/context/assembler.test.ts`、`apps/server/test/pipeline/rewrite.test.ts`

**接口：**
- Consumes：`StyleDimension`/`StyleAxis`（packages/shared/src/api.ts:301-305）；draftSlots 既有槽序（assembler.ts:64 注释钉死序）。
- Produces（Task7B 消费）：

```ts
// inject.ts
export const AXIS_GUIDES: Record<StyleAxis, { low: string; high: string }>;
export function renderStyleDimsBlock(dims: Record<StyleDimension, string>, axes: Record<StyleAxis, number>, budgetChars?: number): string;
// renderStyleBlock 签名不变；行为变更：rulesText 去空白后为空则不再产出【文风规则】头（fewShot 空规则头修）
// config.ts：DraftBudgets 增 styleDims（draft=600 / draft8k=0）；RewriteBudgets 增 styleRules=400
// assembler.ts：draftSlots input 增 styleDims?: string；槽序=…characters→styleDims→styleRules…（stable:true, keep:'head'）
// rewrite.ts：RewriteSlotsInput 增 styleDims?: string；targeted 槽序在 hardRules 后插 styleRules（有值才插，budget=budgets.rewrite.styleRules）；full 经 draftSlots 透传 styleRules/styleDims/fewShot
```

**六轴语义句映射表（写手照抄，禁止改写）：**

| 轴 | 低带（值<40） | 高带（值>60） |
|---|---|---|
| 叙述温度 | 叙述温度偏冷：保持克制旁观的笔调，少用感叹与情绪形容词，情感经动作与细节自然透出。 | 叙述温度偏热：笔调贴近人物内心，允许直白的情绪抒发与氛围渲染，语感热烈。 |
| 语言密度 | 语言密度偏低：短句为主，用词平白晓畅，避免长句、从句嵌套与生僻书面语。 | 语言密度偏高：多用长句与修饰层叠，词汇书面化，意象稠密，读感绵密。 |
| 叙述者姿态 | 叙述者姿态疏离：以旁观视角叙述，不进入人物内心，评价性议论保持克制。 | 叙述者姿态贴身：紧贴视角人物的感知与心理，叙述语气随人物情绪起伏。 |
| 节奏 | 节奏偏缓：场景从容展开，多用静态描写与心理铺陈，允许放慢情节推进。 | 节奏偏快：场景切换干脆，以动作与对话推进，压缩铺陈直取冲突。 |
| 幽默 | 幽默感低：整体笔调严肃，避免插科打诨、玩笑式比喻与轻佻语。 | 幽默感高：允许俏皮比喻、反讽与轻松调侃，沉重段落可被化解。 |
| 情绪表达 | 情绪表达内敛：情感靠留白与细节暗示，避免直接点破人物感受。 | 情绪表达外放：情感直接抒发，允许大喜大悲的浓烈笔触。 |

**renderStyleDimsBlock 输出格式（钉死）：** 首行 `【文风画像】`；随后每个非空 dim 一行 `· <维度>：<描述>`；然后 `【六轴锚点】`；每个落入低/高带的轴一行 `· <轴名>：<映射句>（值 <v>）`；40≤v≤60 的轴整行省略。超 budgetChars 头部截断。

**测试（+6）：** inject-blocks.test.ts +3：①renderStyleBlock('', samples) 结果不含 `【文风规则】`；②轴值 20 出 low 句、80 出 high 句、50 该轴省略；③非空 dims 七行齐全且首行为【文风画像】。assembler.test.ts +1：styleDims 槽落在 system 且序在 characters 后 styleRules 前。rewrite.test.ts +2：targeted 传入 styleRules 时槽集含名为 styleRules 的槽；full 传入 styleDims 时槽集含 styleDims。

**步骤：**
- [ ] 写 +6 失败用例 → `pnpm --filter @inkforge/server exec vitest run test/style/inject-blocks.test.ts test/context/assembler.test.ts test/pipeline/rewrite.test.ts` 红
- [ ] 按 Produces 实现四处最小改动（映射表逐字照抄上表）
- [ ] 定向绿 + `pnpm typecheck && pnpm lint` 0 错
- [ ] server 包全量绿（基线只增不减：既有 budget 数量断言类用例若逐字段断言 budgets，按新字段同步）
- [ ] commit（`feat(server): 风格七维六轴语义槽与重写 styleRules 精简槽（B1 渲染层）`；GUI 未触及无需注明）

---

## Task7B：B1 注入核心 · chapter.ts 装配接线 + qc outputVersionId

**文件：**
- Modify `apps/server/src/pipeline/chapter.ts`（rules 解构 :193-197；draft 槽 :211-227；draft finishStep :253；qc finishStep :288；rewrite 槽 :313-334；rewrite finishStep :361）
- Test Modify `apps/server/test/pipeline/chapter.test.ts`

**接口：**
- Consumes：Task7A `renderStyleDimsBlock`/`AXIS_GUIDES`、budgets.styleDims、rewrite.ts 新 input；既有 `getLatestProfile`（chapter.ts:179 现用法）。
- Produces（Task8A/Task9A/Task9B 消费）：qc 步 outputVersionId 联动——`finishStep('qc', …, { outputVersionId: currentVersion.id, outputJson: … })`（routes 层据此实现 version→qc 查询）。

**规格未钉的实现决策：**
- chapter.ts:193 解构扩为 `{ rulesText, terms, dims, axes }`；`styleDimsText = dims && axes ? renderStyleDimsBlock(dims, axes, config.budgets.draft.styleDims) : ''`。
- draft 槽增 `styleDims: styleDimsText || undefined`。
- fewShot 渲染提取局部常量 `fewShotBlock`（现 :221 行内表达式），draft 与 full 重写共用；targeted 重写不传 fewShot（方案 §一：只补 styleRules 精简槽）。
- targeted `buildRewriteSlots` input 增 `styleRules: styleRulesText || undefined`；full input 增 `styleRules`、`styleDims: styleDimsText || undefined`、`fewShot: fewShotBlock`。
- 8k 档 budgets.styleDims=0 → 装配器截断为空串自动不产出槽（assembler 既有行为），无需分支。

**测试（+2，落 chapter.test.ts；provider 捕获手法同 generate-drift.test.ts 的自定义包装 provider）：**
1. 绑定档案 run：draft 调用的 system 含 `【文风画像】` 与至少一行六轴映射句；fewShot 块（user 内）不含空 `【文风规则】` 头。
2. 触发重写轮（mock 构造 l1 low 分）：rewrite 调用槽集含 styleRules（targeted 模式 system 含 `【文风规则】` 规则文本）。

**步骤：**
- [ ] 写 +2 失败用例 → 跑红
- [ ] 按决策接线 chapter.ts 六处
- [ ] 定向绿 + `pnpm typecheck && pnpm lint` 0 错
- [ ] server 包全量绿
- [ ] commit（`feat(server): 章节管线注入七维六轴画像与重写风格槽；qc 步落 outputVersionId`）
- [ ] （卡外）主模型组织 owner 盲评 A/B（3 章×注入前后）——效果门，不计入本卡

---

## Task8A：B2 章节版本硬删 · server（迁移 0006 + 删除事务 + 列表瘦身 + 报表解耦）

**文件：**
- Create `apps/server/src/db/migrations/0006_chapter_version_tombstone.sql`
- Modify `apps/server/src/db/backup.ts`（全文件重构 :1-36）
- Modify `apps/server/src/db/repositories/chapters.ts`（listVersions :235-238；文件尾新增）
- Modify `apps/server/src/db/repositories/books.ts`（deleteBook :200-219 增一行）
- Modify `apps/server/src/pipeline/chapter.ts`（draft finishStep :253；rewrite finishStep :361）
- Modify `apps/server/src/http/routes.ts`（versions 段 :754-775 后增 DELETE；report :792-803）
- Modify `packages/shared/src/api.ts`（VersionDto :33-46 后增；ReportStepDto :90-95）
- Test Create `apps/server/test/http/versions-delete.test.ts`
- Test Modify `apps/server/test/db/backup.test.ts`

**接口：**
- Consumes：Task7B qc outputVersionId（本卡 report 兼容读 outputJson.usage）；backupBook 既有签名（backup.ts:8）；run_steps.output_version_id（0002_runs.sql:20）。
- Produces（Task8B 消费）：

```sql
-- 0006_chapter_version_tombstone.sql（无 FK：删书级联另清，见 books.ts 改动）
CREATE TABLE IF NOT EXISTS chapter_version_tombstones(
  id TEXT PRIMARY KEY, chapter_id TEXT NOT NULL, kind TEXT NOT NULL, run_id TEXT,
  word_count INTEGER NOT NULL, created_at TEXT NOT NULL, deleted_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_tombstones_chapter ON chapter_version_tombstones(chapter_id);
```

```ts
// backup.ts：抽私有 vacuumSnapshot(db, backupDir, prefix: string, retain: number): string（mkdir/stamp/VACUUM INTO/按前缀 prune）
export function backupBook(db: Database, bookId: string, backupDir: string, retain?: number): string;      // prefix=`${bookId}-`，行为不变
export function backupBookPredelete(db: Database, bookId: string, backupDir: string, retain?: number): string; // prefix=`${bookId}-predelete-`，默认 retain=3
// chapters.ts
export type VersionListItemDto = Omit<VersionDto, 'content'>; // chapters.ts 与 shared 各落一份同形（shared 为跨端真值）
export function listVersions(db: Database, chapterId: string): VersionListItemDto[];  // 同名改造：SELECT 显式列（无 content），序不变
export function findActiveRunRef(db: Database, versionId: string): { runId: string; status: string } | undefined;
//   SQL：run_steps rs JOIN runs r ON r.id=rs.run_id WHERE rs.output_version_id=? AND r.status IN ('queued','running','paused') LIMIT 1
export function deleteChapterVersionWithTombstone(db: Database, versionId: string): boolean;
//   事务：①INSERT 墓碑（id/chapter_id/kind/run_id/word_count/created_at 取原行，deleted_at=now）②UPDATE chapter_versions SET parent_version_id=NULL WHERE parent_version_id=? ③DELETE 原行；行不存在返回 false
// routes.ts
app.delete('/api/versions/:versionId', ...) => 404 | 409 {error, reason:'current'|'run-active', runStatus?} | 200 {ok:true}
// GET versions 响应改：{ currentVersionId: chapter.currentVersionId ?? null, versions: VersionListItemDto[] }
// shared api.ts：export type VersionListItemDto = Omit<VersionDto,'content'>；export interface VersionListDto { currentVersionId: string|null; versions: VersionListItemDto[] }；ReportStepDto 增 versionDeleted?: boolean
```

**规格未钉的实现决策：**
- 删除路由顺序（owner §三.1 四步）：取版本（404）→ `chapter.currentVersionId === versionId` 则 409 reason=current → `findActiveRunRef` 命中则 409 reason=run-active 附 runStatus → **先** `backupBookPredelete(db, chapter.bookId, \`${config.dataDir}/backups/${chapter.bookId}\`)`（VACUUM INTO 不能在事务内，快照先于 tx；目录沿用 queue.ts:47 的按书子目录惯例）→ 再 `deleteChapterVersionWithTombstone`。
- 409 文案：current→`当前版本不可删除（先回滚到其他版本）`；run-active→`版本被 ${status} 状态的运行引用，暂不可删除`。
- report usage 解析序改为：`outputJson.usage`（Task8A 起 draft/rewrite 落）→ 版本 params.usage（历史）→ 零；`outputVersionId` 存在但版本行缺失 → `versionDeleted: true`。
- chapter.ts :253 draft finishStep 补 `outputJson: { usage: draftRes.usage, provider: roleLabel('drafter') }`；:361 rewrite finishStep 补 `outputJson: { usage: rwRes.usage, round: rounds, provider: roleLabel('rewriter') }`（params 内 usage 保留，兼容历史报表）。
- deleteBook（books.ts:208 后）插一行 `DELETE FROM chapter_version_tombstones WHERE chapter_id IN (SELECT id FROM chapters WHERE book_id = ?)`，防删书留孤儿墓碑。

**测试（+9）：** versions-delete.test.ts 新建 +8 场景——①current 409 reason=current；②queued run 引用 409；③running 409；④paused 409；⑤done run 引用放行 200；⑥有子版本 200 且子行 parent_version_id=NULL；⑦无引用 200 且墓碑行存在、原行消失、磁盘 `-predelete-` 快照文件数 ≥1；⑧不存在 404。backup.test.ts +1：同目录混放 `${bookId}-` 与 `${bookId}-predelete-` 文件，`backupBookPredelete(..., retain=3)` prune 只动 predelete 家族。迁移装卸由既有 migrate.test.ts 覆盖（跑绿即可，不加用例）。

**步骤：**
- [ ] 写 0006 迁移文件；写 +9 失败用例 → 跑红（含迁移后表存在断言）
- [ ] backup.ts 重构 + chapters.ts 三函数 + books.ts 一行 + chapter.ts 两 finishStep + routes.ts DELETE/列表/report + shared api.ts
- [ ] 定向绿 + `pnpm typecheck && pnpm lint` 0 错
- [ ] server 包全量绿（既有 listVersions 消费用例同步改断言响应形状）
- [ ] commit（`feat(server): 章节版本硬删+删前快照+墓碑；版本列表去 content；报表 usage 解耦`）

---

## Task8B：B2 章节版本硬删 · web（删除钮 + current 回退 + Diff 配对修正）

**文件：**
- Modify `apps/web/src/api/client.ts`（listVersions :131-132 返回类型；新增 deleteVersion）
- Modify `apps/web/src/pages/ChapterReaderPage.tsx`（:19-27 current 推导；:52-69 版本链行）
- Modify `apps/web/src/pages/DiffPage.tsx`（:22-28 配对逻辑）
- Modify `apps/web/src/pages/DashboardPage.tsx`（:22-43 表格）
- Test Modify `apps/web/src/pages/ChapterReaderPage.test.tsx`
- Test Create `apps/web/src/pages/DiffPage.test.tsx`

**接口：**
- Consumes：Task8A `VersionListDto`/`DELETE /api/versions/:versionId`/`ReportStepDto.versionDeleted`；Task1 `Button`；Task6 已建 ChapterReaderPage.test.tsx。
- Produces：无。

**规格未钉的实现决策：**
- client.ts：`listVersions: (bookId, chapterNo) => req<VersionListDto>(…)`；`deleteVersion: (versionId) => req<{ ok: boolean }>(\`/api/versions/${versionId}\`, { method: 'DELETE', body: '{}' })`。
- ChapterReaderPage current 推导改：`const current = versions.find((v) => v.id === (selected ?? currentVersionId)) ?? null`（回退锚 = 服务端 currentVersionId，**不是 list[0]**）；删除钮 = 每行 `Button quiet danger sm`「删除」，`current` 行 disabled；L2 簇形态同 Task2，警示文案：「删除将从磁盘永久移除该版本正文，不可恢复（删前自动留 -predelete- 快照，同书保留最近 3 份）。」删除成功后 `setSelected(null)` + refetch（选中自然回退 current）。
- DiffPage 配对改 parent 链：newer = `versions.find(v => v.id === currentVersionId) ?? versions[0]`；older = `versions.find(v => v.id === newer.parentVersionId)`；因列表无 content，两个 full 版本经 `api.getVersion(id)` 并行取（`enabled` 门控）；older 不在列表（已删）→ 显示「上一版已删或不存在，无法对比」。
- DashboardPage：表格增「产物」列，`s.versionDeleted` 为真渲染 `Badge tone="muted"`「版本已删」，否则空。

**测试（+5）：** ChapterReaderPage.test.tsx +3——①current 行删除钮 disabled；②非 current 行 L2 簇确认后发 DELETE 且选中回退到 currentVersionId 对应 chip；③409 响应时展示服务端 error 文案。DiffPage.test.tsx 新建 +2——①按 parent 链取两条 getVersion 内容做 diff（旧→新方向不变）；②parent 缺失渲染「上一版已删或不存在，无法对比」。

**步骤：**
- [ ] 写 +5 失败用例 → 跑红
- [ ] client.ts + 三页改造
- [ ] `pnpm --filter @inkforge/web exec vitest run src/pages/ChapterReaderPage.test.tsx src/pages/DiffPage.test.tsx` 绿 + `pnpm typecheck && pnpm lint` 0 错
- [ ] web-gui-tester 黑盒：删除非 current 版本全流程；删除后 chip 高亮保持在 current；Diff 页正常/缺 parent 两态
- [ ] web 包全量绿
- [ ] commit（注明「GUI 已验证」）

---

## Task9A：B3 评分解释+可调 · server（阈值持久化 + 生效口径 + OVERALL 锚点 + qc 明细端点）

**文件：**
- Modify `apps/server/src/settings.ts`（:48 后新增函数）
- Modify `apps/server/src/http/schemas.ts`（:181 后新增 qualityPutSchema）
- Modify `apps/server/src/http/routes.ts`（settings 段 :871-903 内增两路由；versions 段 :775 后增 qc 路由）
- Modify `apps/server/src/pipeline/chapter.ts`（:91 附近取阈值；:287 gate 调用）
- Modify `apps/server/src/prompts/render.ts`（renderQcTask :57-75）
- Modify `packages/shared/src/api.ts`（SettingsQualityDto / VersionQcDto 新增）
- Test Modify `apps/server/test/http/settings.test.ts`、`apps/server/test/pipeline/chapter.test.ts`

**接口：**
- Consumes：Task7B qc outputVersionId（version→qc 查询键）；app_meta 表（0001_core.sql:45）；decideGate cfg（gate.ts:26-29）。
- Produces（Task9B 消费）：

```ts
// settings.ts
export function readScoreThreshold(db: Database): number | undefined; // app_meta key='quality_score_threshold'；缺失/非法（NaN 或越界 [1,10]）→ undefined
// schemas.ts
export const qualityPutSchema = z.object({ scoreThreshold: z.number().min(1).max(10) });
// routes.ts
app.get('/api/settings/quality', ...) => { scoreThreshold: number; isDefault: boolean }  // shared: SettingsQualityDto
app.put('/api/settings/quality', ...) => { saved: true }                                   // upsert app_meta；restartRequired 恒 false
app.get('/api/versions/:versionId/qc', ...) => { attempts: [{ attempt: number; l0: object; l1: object; gate: { action: string; reasons: string[] } }] }
//   SQL：SELECT attempt, output_json FROM run_steps WHERE output_version_id=? AND step='qc' AND status='done' ORDER BY attempt（shared: VersionQcDto）
```

**规格未钉的实现决策（生效口径，钉死）：**
- chapter.ts 管线入口处（:91 `maxRounds` 取值旁）`const scoreThreshold = readScoreThreshold(db) ?? config.quality.scoreThreshold`；:287 gate cfg 改传 `{ scoreThreshold, minGain: config.quality.minGain, maxRounds }`。即**每章管线开始读一次 DB**：run 内逐章生效、单章中途不变——此为「队列每 run 开始读 DB 覆盖」的落地口径（管线无 run 级常驻钩子，章界=生效边界）。
- OVERALL 锚点文案（照抄进 renderQcTask【输出格式】行之后、示例之前，单行）：
  `【OVERALL 锚点】1=废稿：复文、套话或剧情硬伤密集，无法修复；5=不合格：存在多项 major，人物或逻辑明显失真，须整章大改；8=可入库：至多个别 minor 瑕疵，节奏、人物与对话符合蓝图；10=范文级：无可指摘，可作展示样章。`
  l1 解析只读 `OVERALL:` 行（l1.ts:24-71），锚点行不破坏解析协议。

**测试（+4）：** settings.test.ts +3——①PUT `{scoreThreshold: 9}` → GET 返回 `{scoreThreshold: 9, isDefault: false}`；②PUT `11` → 400；③写入非法值后 readScoreThreshold 返回 undefined（GET 回落默认 8.0 且 isDefault=true）。chapter.test.ts +1——mock qc 输出 OVERALL:8、覆盖阈值 9 时 gate 判 rewrite（reasons 含 `< 9`）；未覆盖时同场景 pass（对照）。

**步骤：**
- [ ] 写 +4 失败用例 → 跑红
- [ ] 五处实现
- [ ] 定向绿 + `pnpm typecheck && pnpm lint` 0 错
- [ ] server 包全量绿
- [ ] commit（`feat(server): 入库分阈值持久化+章级生效；OVERALL 四档锚点；版本质检明细端点`）

---

## Task9B：B3 评分解释+可调 · web（质量设置分区 + maxRounds 选择器 + 质检明细面板 + 图例）

**文件：**
- Modify `apps/web/src/api/client.ts`（getQuality/putQuality/versionQc 三方法；generateAll 增 maxRounds 参 :77）
- Modify `apps/web/src/pages/SettingsPage.tsx`（:120 前「质量」分区）
- Modify `apps/web/src/pages/BookDetailPage.tsx`（:209 整书生成旁、:394 生成本章旁增 maxRounds select）
- Modify `apps/web/src/pages/NewBookPage.tsx`（:233 发起续写旁增 maxRounds select）
- Modify `apps/web/src/pages/ChapterReaderPage.tsx`（版本链标题下图例行；current 下挂明细面板）
- Create `apps/web/src/components/VersionQcPanel.tsx`
- Test Create `apps/web/src/components/VersionQcPanel.test.tsx`
- Test Modify `apps/web/src/pages/SettingsPage.test.tsx`、`apps/web/src/pages/BookDetailPage.test.tsx`、`apps/web/src/pages/NewBookPage.test.tsx`

**接口：**
- Consumes：Task9A `SettingsQualityDto`/`PUT /api/settings/quality`/`VersionQcDto`/`GET /api/versions/:versionId/qc`；Task1 `Button`；client.generateChapter 既有 maxRounds 参（client.ts:72-76）；`POST /api/books/:bookId/generate-all` 已收 generateSchema.maxRounds（routes.ts:456-458）。
- Produces：无。

**规格未钉的实现决策：**
- maxRounds 选择器（三入口同款）：`<select aria-label="质量轮数">` 选项 1/2/3（UI 钳 ≤3，API 上限 5 不暴露），默认 2，随对应发起调用发送；client.generateAll 改 `(bookId, maxRounds?)` body `{ maxRounds }`。
- SettingsPage 质量分区：数字输入 label「入库分阈值 OVERALL（1-10，默认 8.0）」step 0.5；说明文案（照抄）：「保存即时生效：每个 run 的章节管线开始时读取；进行中的 run 不受影响。低于阈值触发重写（轮数未满时）；上一轮增益 <5% 即停（同分即停）。」保存钮 `Button primary md`。
- VersionQcPanel：`useQuery(['version-qc', versionId], api.versionQc)`；每 attempt 一块：gate.action Badge（pass=ok / rewrite=warn / needs_human=danger）+ reasons 逐条 + l1.findings 列表（severity/dimension/quote/comment）+ l0 未过检查项；attempts 空 → 「仅新运行的版本携带质检明细」。
- ChapterReaderPage 图例行（版本链 h2 下，`text-xs text-muted`，照抄）：「图例：版本 chip 依次为 类型 · 字数 · 时间 · OVERALL 分；达标线默认 8.0 分（可在「设置 → 质量」调整）；同分即停——本轮较上一轮增益 <5% 视为无改善，停止重写并转人工。」

**测试（+5）：** VersionQcPanel.test.tsx 新建 +2（attempts 渲染 gate Badge 与 findings 行；空态文案）；SettingsPage.test.tsx +1（保存质量分区发 PUT /api/settings/quality 且 restartRequired 不提示重启）；BookDetailPage.test.tsx +1（整书生成读取 select 值随 generateAll body 发送，默认 2）；NewBookPage.test.tsx +1（发起续写同款）。

**步骤：**
- [ ] 写 +5 失败用例 → 跑红
- [ ] client.ts 三方法 + 四页改造 + VersionQcPanel
- [ ] 定向绿 + `pnpm typecheck && pnpm lint` 0 错
- [ ] web-gui-tester 黑盒：设置质量分区保存成功提示；三入口 maxRounds 默认值与发送值；阅读器质检明细面板（有数据/仅新运行两态）；图例行不折行错位（1280×800）
- [ ] web 包全量绿
- [ ] commit（注明「GUI 已验证」）

---

## Task10A：B4 档案删除+示例开关 · server（迁移 0007 + DELETE 档案 + 绑定写 0 + 逐书切换 + fewShot 门控）

**文件：**
- Create `apps/server/src/db/migrations/0007_book_style_fewshot.sql`
- Modify `apps/server/src/db/repositories/books.ts`（Book :4-15、toBook :34-36、setBookStyleProfile :96-110；文件尾新增 setBookFewshot）
- Modify `apps/server/src/http/schemas.ts`（:181 后增 styleFewshotPutSchema）
- Modify `apps/server/src/http/routes.ts`（style 段 :581-603 后增两路由；style-profiles 段 :617 后增 DELETE）
- Modify `apps/server/src/pipeline/chapter.ts`（fewShot 槽 :221；抄用检测 :273 不动）
- Modify `packages/shared/src/api.ts`（BookDto :8-18 增字段）
- Test Modify `apps/server/test/http/style.test.ts`、`apps/server/test/pipeline/chapter.test.ts`

**接口：**
- Consumes：styleBindSchema 既有 null 解绑语义（schemas.ts:53-55）；setBookStyleProfile 快照逻辑（books.ts:96-110）。
- Produces（Task10B 消费）：

```sql
-- 0007_book_style_fewshot.sql
ALTER TABLE books ADD COLUMN style_fewshot_on INTEGER NOT NULL DEFAULT 0;
```

```ts
// books.ts：Book/BookRow/toBook 增 styleFewshotOn: boolean（r.style_fewshot_on === 1；GET /api/books/:bookId 走 {...book} 展开，自动透出）
// setBookStyleProfile：UPDATE 增 style_fewshot_on = 0（绑定与解绑都归零——owner「新绑定默认写 0」）
export function setBookFewshot(db: Database, bookId: string, on: boolean): void; // UPDATE books SET style_fewshot_on=?, updated_at=?
// schemas.ts
export const styleFewshotPutSchema = z.object({ on: z.boolean() });
// routes.ts
app.delete('/api/style-profiles/:id', ...) => 404 | 409 { error: 'profile bound', books: [{id,title},...] } | 200 { ok: true }  // 单行删除，不做整族级联
app.put('/api/books/:bookId/style-fewshot', ...) => { ok: true; styleFewshotOn: boolean }
// shared api.ts：BookDto 增 styleFewshotOn: boolean
```

**规格未钉的实现决策（owner §三.4 钉死语义）：**
- chapter.ts fewShot 门控：`book.styleFewshotOn` 为 false 时 `fewShotBlock` 不注入（槽缺省）；`styleSamples` 采集、`styleSampleIds` 记录、**抄用检测 referenceTexts（:273）恒取绑定样本**——三者均不受开关影响（有绑定且有样本即运行）。

**测试（+5）：** style.test.ts +4——①DELETE 未绑定档案 200 且行消失；②DELETE 被绑定档案 409 且 body.books 含绑定书 id/title；③DELETE 不存在 404；④PUT style-fewshot `{on:true}` 后 GET /api/books/:bookId 返回 `styleFewshotOn: true`，重新绑定档案后回落 false。chapter.test.ts +1——`vi.spyOn(l0 模块, 'runL0Checks')` 捕获 input：开关关（默认）时 draft user 不含 `【范例片段】`，但 referenceTexts 仍为样本文本数组。

**步骤：**
- [ ] 写 0007；写 +5 失败用例 → 跑红
- [ ] 六处实现（绑定端点写 0 在 setBookStyleProfile 内完成，路由 :581-603 不动）
- [ ] 定向绿 + `pnpm typecheck && pnpm lint` 0 错
- [ ] server 包全量绿
- [ ] commit（`feat(server): 风格档案删除 409-if-bound；文风示例逐书开关（注入门控，抄用检测恒开）`）

---

## Task10B：B4 档案删除+解绑修复+示例开关 · web

**文件：**
- Modify `apps/web/src/pages/BookDetailPage.tsx`（StyleBindSelect :11-24 解绑修复；绑定区 ~:333 增示例开关）
- Modify `apps/web/src/pages/StyleProfilesSection.tsx`（档案行 :125 旁增删除钮 + L2 簇）
- Modify `apps/web/src/api/client.ts`（deleteStyleProfile/setBookFewshot 新增；bindStyle 复用）
- Test Modify `apps/web/src/pages/BookDetailPage.test.tsx`、`apps/web/src/pages/StyleProfilesSection.test.tsx`

**接口：**
- Consumes：Task10A `DELETE /api/style-profiles/:id`（409 books 列表）、`PUT /api/books/:bookId/style-fewshot`、`BookDto.styleFewshotOn`；Task1 `Button`；Task5 已替换的两文件形态。
- Produces：无。

**规格未钉的实现决策：**
- StyleBindSelect 解绑修复（回归缺陷⑦）：签名改 `onBind: (profileId: string | null) => void`，onChange 发 `e.target.value === '' ? null : e.target.value`；调用点接 `api.bindStyle(bookId, { profileId })`。解绑清快照为服务端预期行为（routes.ts:586-590），不回滚该语义。
- 示例开关：绑定状态下渲染 checkbox「文风示例注入」+ 说明文案（照抄）：「关闭后不向写手注入范文片段；抄用检测仍以绑定样本为参考，不随开关关闭。新绑定默认关。」勾选即发 `api.setBookFewshot(bookId, checked)`，乐观值取响应。
- 档案删除钮：每档案行 `Button quiet danger sm`「删除」+ L2 簇（形态同 Task5）；确认后 409 时 `setMsg(\`无法删除，已被绑定：${books.map(b => b.title).join('、')}\`)`。

**测试（+4）：** BookDetailPage.test.tsx +2——①选择「（未绑定）」空 option 发 PUT `/api/books/:bookId/style` body `{profileId: null}`；②开关勾选发 PUT style-fewshot `{on:true}`。StyleProfilesSection.test.tsx +2——③删除 L2 簇确认发 DELETE；④409 响应渲染含绑定书名的失败文案。

**步骤：**
- [ ] 写 +4 失败用例（①为回归测试，钉死解绑缺陷）→ 跑红
- [ ] 三文件改造
- [ ] 定向绿 + `pnpm typecheck && pnpm lint` 0 错
- [ ] web-gui-tester 黑盒：解绑流程全走；开关切换与说明文案；档案删除 409 提示（mock 场景）
- [ ] web 包全量绿
- [ ] commit（注明「GUI 已验证」）

---

## Task11A：B5 蒸馏后台化+重蒸 · server（迁移 0008 + jobs + 原文留存 + 重新蒸馏）

**文件：**
- Create `apps/server/src/db/migrations/0008_distill_jobs.sql`
- Create `apps/server/src/style/distill-job.ts`
- Modify `apps/server/src/style/analysis.ts`（saveStyleProfile :85-119 尾部）
- Modify `apps/server/src/http/routes.ts`（distill :656-676 改造；:617/:692 附近增三路由）
- Modify `apps/server/src/app.ts`（migrate :33 后一行）
- Modify `packages/shared/src/api.ts`（DistillJobDto 新增）
- Test Create `apps/server/test/http/distill-jobs.test.ts`

**接口：**
- Consumes：`analyzeStyle`/`pickFewShotAndHeldOut` 既有签名（routes.ts:663-671 现用法）；`saveStyleProfile` 同 hash version+1（analysis.ts:92-97）；mock provider（createDefaultMockProvider）。
- Produces（Task11B 消费）：

```sql
-- 0008_distill_jobs.sql
CREATE TABLE IF NOT EXISTS distill_jobs(
  id TEXT PRIMARY KEY, status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','done','failed')),
  progress INTEGER NOT NULL DEFAULT 0, stage TEXT NOT NULL DEFAULT '',
  error TEXT, result_json TEXT,
  base_profile_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS style_sources(
  id TEXT PRIMARY KEY, source_hash TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
  text TEXT NOT NULL, created_at TEXT NOT NULL);
```

```ts
// distill-job.ts
export function failStaleDistillJobs(db: Database): void; // UPDATE distill_jobs SET status='failed', error='server restarted' WHERE status IN ('queued','running')
export function runDistillJob(deps: { db: Database; provider: LlmProvider; config: AppConfig; getTemplate: () => string }, jobId: string, input: { name: string; text: string; maxSegments?: number; temperature?: number }): Promise<void>;
//   进度里程碑（钉死）：创建=0 → 采样完成 progress=20 stage='sampling' → analyzeStyle 开始 progress=30 stage='analyzing' → 完成 progress=100 status='done' result_json={analysis,samples,evaluation}；异常 → status='failed' error=message
// routes.ts
app.post('/api/style-profiles/distill', ...) => 202 { jobId }   // 校验 ≥200 字不变；kicks void runDistillJob(...)
app.get('/api/style-profiles/jobs/:jobId', ...) => { id, status, progress, stage, error, result: DistillStyleDraftDto | null }  // shared: DistillJobDto
app.post('/api/style-profiles/:id/redistill', ...) => 202 { jobId } | 404 | 409 { error: '原文未留存，无法重新蒸馏' }
//   按 profile.source_hash 查 style_sources；name 沿用档案名；base_profile_id=档案 id；走同一 runDistillJob
// analysis.ts saveStyleProfile：sourceHash 计算后 INSERT INTO style_sources ... ON CONFLICT(source_hash) DO NOTHING
// app.ts：migrate(db) 后调 failStaleDistillJobs(db)
```

**规格未钉的实现决策：**
- 后台执行形态：路由内 `void runDistillJob(...)` 即返回 202——单进程内联异步，不占 runs 队列、不加 worker（方案 §一 D2④：独立表+轮询，不动 runs 状态机）。
- 确认门保持：redistill 产出同样走「草稿→确认入库」两步；同源 version+1 由 saveStyleProfile 既有 MAX(version)+1 保证（analysis.ts:94-97）。
- SSE 不动；进度不做 provider 内回调（粒度=四里程碑）。

**测试（+5，mock provider 即时返回可同步轮询）：** ①POST distill → 202 {jobId}，轮询 GET job 至 done，result.analysis.dims 非空；②POST /api/style-profiles 入库后 style_sources 出现对应 source_hash 行；③对已留存档案 POST redistill → 202 → done → 确认入库后同 hash version=2；④对无留存档案（直插 style_profiles 行）redistill → 409；⑤failStaleDistillJobs 将 running job 置 failed 且 error='server restarted'。

**步骤：**
- [ ] 写 0008；写 +5 失败用例 → 跑红
- [ ] 六处实现
- [ ] 定向绿 + `pnpm typecheck && pnpm lint` 0 错
- [ ] server 包全量绿
- [ ] commit（`feat(server): 蒸馏后台化（jobs 表+202+轮询）；style_sources 原文留存与同源重蒸`）

---

## Task11B：B5 蒸馏后台化+重蒸 · web（轮询 UI + 进度/失败原因 + 重新蒸馏入口）

**文件：**
- Modify `apps/web/src/api/client.ts`（distillStyle 改返回 {jobId}；新增 getDistillJob/redistillStyle）
- Modify `apps/web/src/pages/StyleProfilesSection.tsx`（distill handler :24-42；蒸馏钮 :177；档案行 :125 旁增「重新蒸馏」）
- Test Modify `apps/web/src/pages/StyleProfilesSection.test.tsx`

**接口：**
- Consumes：Task11A `DistillJobDto`/202 语义/redistill；Task1 `Button` loading prop；Task5 已替换的蒸馏钮形态。
- Produces：无。

**规格未钉的实现决策：**
- distill handler：`await api.distillStyle(...)` 得 jobId → `setBusy`（Button `loading`）+ `setInterval` 2s 轮询 `api.getDistillJob`；done → 清定时器、`setDraft` 进预览（msg「蒸馏完成（草稿未入库）…」）；failed → 清定时器、`setMsg('蒸馏失败：' + job.error)`；组件卸载清定时器。
- 「重新蒸馏」`Button quiet primary sm`，置于档案行 meta 行（ml-auto 与「版本」并列）；点击 → `api.redistillStyle(p.id)` → 复用同一轮询 UI；409 时 `setMsg(job.error)`。
- 蒸馏进行中禁用重复发起（busy 已覆盖）。

**测试（+3）：** ①蒸馏→（stub 轮询响应 done）→ draft 预览出现；②failed 响应 → 渲染「蒸馏失败：<error>」；③「重新蒸馏」点击发 POST redistill 且按钮进入 loading。

**步骤：**
- [ ] 写 +3 失败用例 → 跑红
- [ ] client.ts + StyleProfilesSection 改造
- [ ] 定向绿 + `pnpm typecheck && pnpm lint` 0 错
- [ ] web-gui-tester 黑盒（mock server 场景）：蒸馏进行中 spinner 保宽；失败原因展示；重新蒸馏入口
- [ ] web 包全量绿
- [ ] commit（注明「GUI 已验证」）

---

## 卡派单序与并行窗口

```
Task0（夹具自固化，最先开，修基线 2 红）
→ Task1（Button 组件）
  └→ Task2 ┬─ Task3   （D4 替换卡文件互不相交，可两两并行：{Task2,Task3} → {Task4,Task5} → Task6）
           └─ Task4 ┬─ Task5
                     └→ Task6
→ Task7A → Task7B（B1；效果门=装配测试+owner 盲评，主模型组织）
→ Task8A → Task8B（B2；接口 Task8A Produces 先钉）
→ Task9A → Task9B（B3）
→ Task10A → Task10B（B4；迁移 0007 串行）
→ Task11A → Task11B（B5；迁移 0008 串行）
```

| 卡 | 规格/报告锚点 |
|---|---|
| Task0 | 本卡「事实背景」节（主审 2026-11-16 实证：QUOTE 全命中+活库缺书定性）；real/ 既有 raw 夹具 |
| Task1 | spec-button §1（:45-143）、§6.1 |
| Task2 | spec-button §3.1（:193-206）、§3.15-1、§1.5-L2、§6.2/6.3；R1 清单②1-4 |
| Task3 | spec-button §3.10（:278-293）、§3.5（:230-236）；R1 清单① |
| Task4 | spec-button §3.9（:266-277）、§3.8（:255-265）、§3.15-3 |
| Task5 | spec-button §3.7/§3.6/§3.14/§3.13、§3.15-2/4、§1.3、§1.5-L2、§6.3 |
| Task6 | spec-button §3.3/§3.2/§3.4/§3.11/§3.12、§2.2、§1.5-L3、§4.1-4.3、§6.3/6.4 |
| Task7A/7B | plan §一 B1 段、§三.5；R2 §2.2（注入面）、§1.2-b |
| Task8A/8B | plan §三.1、§一 D1 采纳行；R1 Q2（:107-127）、0001_core.sql:16-24、backup.ts:8 |
| Task9A/9B | plan §一 D3 采纳行、§三.5；R2 §2.6/§2.7（评分链/呈现链）、§1.3 清单二 |
| Task10A/10B | plan §三.2/§三.4、§一 D1 档案行；R2 §2.4（绑定）、§1.2-d/e |
| Task11A/11B | plan §一 D2④ 采纳行、§三.5；R2 §2.1（同步阻塞现状）、§1.2-a/f |
