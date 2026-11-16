# Button 公共组件设计规范（SubTrans 风格第一参考，2026-11-16）

> 状态：定稿规范（实现者照做，无开放问题）。
> 视觉真值源：SubTrans `subtrans/webview_gui/assets/style.css` §8 按钮（style.css:1089-1167）+ §2 基础态（:177-195）+ 截图基准 `I:\SubTrans\artifacts\gui-test-screenshots\d1102-c-1280.png`（浅）/ `d1102-c-1280-dark.png`。
> 问题面真值源：`docs/design/research-2026-11-16-ui-versions.md`（R1，65 处裸按钮清点）。
> token 基线：`apps/web/src/index.css`（@theme，DEC-2026-1115-04）；组件族基准：`apps/web/src/components/ui.tsx`（Card/Badge/Chip/Console）。
> 本规范为设计层产物；组件与页面代码改造属实现卡（标注 `[HANDOFF_TO_CODING]` 处为行为变更，需编码卡处理）。
> inkforge 固定浅色主题（index.css:8，2026-11-12 目验缺陷钉死），故不定义深色变体；SubTrans 深色机制仅作记录不落地。

---

## 0. token 基线与缺口清单（先读）

### 0.1 可用 token（index.css:10-43，本规范全部 class 只用这些 + Tailwind 内建档位）

| token | 值 | 用途 |
|---|---|---|
| `--color-bg` | #f3f4f6 | hover 灰底（=SubTrans surface-3 #F3F4F6 等值） |
| `--color-surface` | #ffffff | secondary 底 |
| `--color-line` | #e5e7eb | secondary 边 |
| `--color-ink` | #111827 | secondary 文字 |
| `--color-muted` | #6b7280 | quiet 文字（=SubTrans text-2 等值） |
| `--color-faint` | #9ca3af | （按钮不直接用） |
| `--color-primary` | #3b82f6 | primary 底、focus 描边 |
| `--color-primary-strong` | #2563eb | primary hover、quiet-primary 文字 |
| `--color-primary-soft` | #dbeafe | 可点选 chip 选中底 |
| `--color-danger` | #dc2626 | danger 文字/描边、solid 确认底 |
| `--color-danger-soft` | #fee2e2 | danger 底（=SubTrans 停止钮 hover 色等值） |
| `--radius-ctl` | 8px | 全部按钮圆角 |
| `--height-ctl` | 36px | md 档标准高（=SubTrans --h-ctl 等值） |

### 0.2 缺口与裁定（缺什么 token 在此明说；本规范不依赖任何新增 token，可立即实现）

| SubTrans token | SubTrans 值 | inkforge 现状 | 本规范裁定 | 后续可选对齐 |
|---|---|---|---|---|
| `--btn-primary-bg` / `--btn-primary-bg-hover` | #2563EB / #1D4ED8 | 无 `primary-deep` | primary 用 `bg-primary`(#3B82F6) + `hover:bg-primary-strong`(#2563EB)：加深方向正确、与全站现役 41 处实底主钮同色，hover 有可感知变化 | 补 `--color-primary-deep: #1d4ed8` 后换 `bg-primary-strong hover:bg-primary-deep`（一行） |
| `--border-strong` | #D1D5DB | 无 | secondary 边用 `border-line`(#E5E7EB)：全站边线唯一来源是 line | 补 `--color-line-strong: #d1d5db` 可选 |
| `--danger-soft` / `--danger-soft-hover` / `--danger-border` | #FEF2F2 / #FEE2E2 / #FECACA | 仅 `danger-soft`=#FEE2E2 | danger 底 = `bg-danger-soft`；hover = `hover:bg-danger/25`（color-mix 派生 ≈ #F6C7C7）；边 = `border-danger/40`（≈ #F0BFBF ≈ #FECACA）。已在 Tailwind 4.3.5 实证编译（见 §5 证据） | 补 `--color-danger-border: #fecaca` 可选 |
| `--h-ctl-sm` | 30px | 无 | 紧凑档用 Tailwind 内建 `h-8`（32px），偏差 +2px | 补 `--height-ctl-sm: 30px` 后换 `h-ctl-sm`（一行） |
| `--font-sm`=13px / weight 550 | 13px/550 | 全站事实标准 text-sm=14px / Tailwind 档 500/600 | `text-sm`(md)·`text-xs`(sm) + `font-medium`(500)；不引入 13px/550 魔法值 | 不建议对齐（14px 已成全站标准） |
| `--shadow-primary` | 主钮投影 | 组件族（Card/Badge/Chip）全无阴影 | 不引入阴影，保持 inkforge 平面组件族 | 不建议 |

---

## 1. Button 组件规格

### 1.1 变体集合（四档，全部对应 SubTrans 真实形态，无凭空发明）

| 变体 | SubTrans 母体 | 形态 | 用途一句话 |
|---|---|---|---|
| `primary` | `.btn-primary` | 主色实底白字 | 该视图内唯一主操作 |
| `secondary` | `.btn-secondary` | 白底+灰边框 | 次操作：取消/放弃/工具入口 |
| `danger` | `.btn-danger` | 浅红底+红字+淡红边（停止钮形态） | 停止/取消运行等流控破坏 |
| `quiet` | `.btn-ghost` + `.file-remove-btn` | 透明底灰字，hover 灰底 | 行内轻操作（编辑/加阶段/删除文字钮） |

quiet 变体带 `tone` 子形态（SubTrans file-remove-btn 即「quiet-danger」先例，style.css:794-810，不算发明）：
- `tone='neutral'`（默认）：灰字
- `tone='primary'`：主色字（链接感动作）
- `tone='danger'`：红字

danger 变体带 `solid` 专用形态：`variant="danger" solid` = 实底红白字，**仅限两步确认的第二步「确认删除」**（结构复用 SubTrans 实底钮 + danger 色相，是唯一一处 inkforge 扩展；SubTrans 语言中无实底红，故禁用于一切常规按钮）。

### 1.2 class 构成（组件源码级，全部 class 已在 Tailwind 4.3.5 + inkforge token 下编译实证）

**基类（所有变体共用）：**

```
inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-ctl font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-45
```

与 SubTrans 逐条对应：inline-flex+justify-center+gap-2（.btn，style.css:1092-1097）、whitespace-nowrap（:1106）、rounded-ctl 8px（--radius-sm）、transition .15s（--dur）、focus-visible 2px 主色描边 offset 2（--focus-outline，style.css:191-195、:1109）、disabled opacity .45 + not-allowed（style.css:178、:1110）。

**变体覆盖串：**

| 变体 | class 串 |
|---|---|
| primary | `bg-primary text-white hover:bg-primary-strong` |
| secondary | `border border-line bg-surface text-ink hover:bg-bg` |
| danger | `border border-danger/40 bg-danger-soft text-danger hover:bg-danger/25` |
| danger + solid | `bg-danger text-white hover:brightness-90` |
| quiet（neutral） | `text-muted hover:bg-bg hover:text-ink` |
| quiet tone=primary | `text-primary-strong hover:bg-bg`（hover 不改字色） |
| quiet tone=danger | `text-danger hover:bg-danger-soft`（SubTrans file-remove-btn 同款，style.css:807-810） |
| 可点选 chip 选中态（`active`，见 §2.2） | `bg-primary-soft text-primary-strong hover:bg-primary-soft` |

**尺寸覆盖串：**

| 档 | class 串 | 说明 |
|---|---|---|
| md（默认） | `h-ctl px-3.5 text-sm` | 36px 高；px-3.5=14px 精确对齐 SubTrans `padding: 0 14px`（style.css:1098） |
| sm（紧凑） | `h-8 px-2.5 text-xs` | 32px 高；px-2.5=10px 对齐 `.btn-sm`（style.css:1140-1146）；SubTrans 原值 30px，无 token 取内建 h-8（§0.2） |

**图标钮（iconOnly）覆盖串：** 在 sm 基础上 `w-8 px-0`（32×32 方形居中）。

**组件 API 形态（供实现卡照抄；本卡不改代码）：**

```tsx
// apps/web/src/components/ui.tsx 增补 —— 设计规范给形，行为实现 [HANDOFF_TO_CODING]
export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'quiet';
export type ButtonSize = 'md' | 'sm';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant; // 默认 'secondary'
  size?: ButtonSize;       // 默认 'md'
  tone?: 'neutral' | 'primary' | 'danger'; // 仅 quiet；默认 'neutral'
  solid?: boolean;         // 仅 danger：两步确认第二步专用实底红
  active?: boolean;        // 可点选 chip 选中态（§2.2）
  iconOnly?: boolean;      // 方形图标钮，必须同时给 aria-label
  loading?: boolean;       // 进行中态（§1.3）
}
```

与现有 ui.tsx 同族纪律：`Record<Variant, string>` 常量表 + 模板串拼接（同 `BADGE_TONES`/`CONSOLE_TONES` 写法，ui.tsx:10-16、:38-44）；`className` 透传拼接放最后，允许调用方加 `ml-auto` 等布局类。

### 1.3 状态

| 状态 | 规范 |
|---|---|
| hover | 各变体见 §1.2 覆盖串；SubTrans 全部为「底色加深」方向，无位移/缩放 |
| focus-visible | 2px `outline-primary` + offset 2px（全变体统一；`outline-danger` 不用——SubTrans 焦点环全局主色） |
| disabled | `opacity-45` + `cursor-not-allowed`；不保留 hover 反馈；不换灰底变体，只降透明度（=SubTrans） |
| loading（进行中） | 按 SubTrans `button.loading`（style.css:1149-1167）等价改造：文字保宽转透明（原内容包 `<span className="invisible">` 防塌宽）+ 居中 16px spinner（lucide `Loader2` size 16 + `animate-spin`，button 加 `relative`）；同时置 `disabled` + `aria-busy="true"`；spinner 用 currentColor 随变体适配（SubTrans 同机制）。禁止文案替换式 loading（如「重写中…」换字）——SelectionRewrite:69、SettingsPage:125 现状属反例，归一时改 loading prop |
| 按下 active | 不定义（SubTrans 无按下态，不发明） |

### 1.4 图标按钮与纯文字按钮规则

1. **图标+文字**：图标用 lucide-react（已是依赖，apps/web/package.json；与 SubTrans 的 Lucide 内联 SVG 同源同风格），`size={14}` `strokeWidth={2}` `aria-hidden`，置于文字前，间距走基类 `gap-2`（=SubTrans index.html:173-175 图标钮 14px/stroke 2 同参）。
2. **图标钮（iconOnly）**：32×32（`w-8 px-0` + sm 档），必须带 `aria-label`（SubTrans 用 sr-only span 承接读屏文本，style.css:1291-1301 同意图）；常规图标钮 = `quiet` neutral，行内移除类图标钮 = `quiet` danger（hover 红软底）。
3. **纯文字按钮**：规范形态即 `quiet` 变体（有 hover 底、无永久底框）。**全站禁止出现无 hover 反馈的裸 `text-*` 按钮**——R1 清单② 16 处属废止形态，逐处裁定见 §3。
4. **图标语义红线**：移除列表行/清空输入（不删盘上文件）一律 `X`；落库数据删除入口用 `Trash2`（真实删除场景才允许垃圾桶）；停止用 `Square`（SubTrans 停止钮同款实心方块，index.html:549）；确认步不加图标。
5. **文字按钮旁的链接**（如 BookDetailPage:370「阅读」Link）：链接不属本规范，保持现样式；同排出现时 quiet·primary 按钮与链接视觉同族（同为 text-primary-strong），不强制统一。

### 1.5 危险操作两步确认交互规范

分级（按数据破坏面）：

| 级 | 场景 | 第一步 | 第二步 | 现状差距 |
|---|---|---|---|---|
| L1 草稿态删除 | 未落库的编辑缓冲行：拆章预览行、人物草稿卡移除、大纲树草稿 删卷/删阶段/删卡 | `quiet`·danger·sm，**单击直删** | 无 | 无差距（现状即单击直删） |
| L2 已落库单条删除 | 人物卡删除、伏笔删除、仿写档案删除 | `quiet`·danger·sm | 点击后**原地展开确认簇**：警示文案（`text-danger text-xs`，说明不可恢复范围）+「确认删除」`danger`·solid·sm +「取消」`secondary`·sm；确认或取消后收簇；**不自动回退** | `[HANDOFF_TO_CODING]` 现状三处均单击直删，需加确认簇与对应测试 |
| L3 整书删除 | 书架卡片删除（多表级联） | `quiet`·danger·sm | 同 L2 形态；警示文案必须列级联范围（沿用现文案「章节/人物/运行记录一并清除，不可恢复」） | 现有两步保留，确认钮从 `bg-danger px-2 py-1 text-white`（BooksPage:48）收编为 `danger`·solid·sm，取消钮收编为 `secondary`·sm |
| 流控破坏（非数据删除） | 运行 暂停/继续/取消 | 无确认 | —— | 取消运行单击直发 `danger`·md（soft 形态，=SubTrans 停止钮），不加确认 |

---

## 2. 一致性裁定规则

### 2.1 语义 → 变体判定表

| 语义判据 | 变体·尺寸 | 例 |
|---|---|---|
| 页面级唯一主提交（向导推进/生成发起/表单保存/整书生成） | `primary`·md | 建书并进入导入、发起生成、保存设定、整书生成 |
| 卡内/区块内主提交 | `primary`·sm | 确认入库、保存大纲树、提交选段重写、AI 生成大纲树（工具条主钮） |
| 次操作：取消/放弃/恢复默认/返回类 | `secondary`·md（页面级）/ `secondary`·sm（卡内配对） | 取消、放弃草稿、恢复默认 |
| 次操作：工具入口（预览/复核/编辑入口/新增入口） | `secondary` | 编辑已存树、偏离复核、手动加卷、添加人物、登记伏笔、AI 建议蓝图、从书架选书、补摘要·第 N 章、拆章预览 |
| 行内蓝字动作（编辑/生成/添加进树/切换） | `quiet`·primary·sm | 编辑、生成、补摘要、加阶段、加卡、标记回收、收起·编辑、版本 |
| 行内删除/移除文字动作 | `quiet`·danger·sm | 删除、移除、删卷、删阶段、删卡 |
| 停止/取消进行中的运行 | `danger`·md（soft） | RunPage 取消 |
| 两步确认第二步 | `danger`·solid·sm | 确认删除 |
| 选择器 chip / 预设 chip | `quiet`·sm（+`active`，见 §2.2） | 版本链、选段预设 |

记忆口诀：**一屏一主钮（primary）；主钮之外有框（secondary）；框都嫌重的行内用灰字（quiet）；红字静默、红底才停（quiet-danger 入口 / danger 停止）；实底红只出现在确认步（danger solid）。**

### 2.2 chip 与 button 的边界

1. **纯状态标记（无 onClick）** → `Chip`/`Badge` 组件，永不做按钮。
2. **点击切换选中的选择器**（版本链 chip，ChapterReaderPage:56）→ `Button` `quiet`·sm + `active`：选中 `bg-primary-soft text-primary-strong`（SubTrans chip 选中语义，style.css:787 `.chip-running`、:1409 `.dict-kind-chip.active`），未选中 = quiet neutral。**裁定：现选中态 `bg-primary text-white`（实底）废止**，改软底选中（SubTrans 语言中实底只给主操作）。
3. **点击触发一次性动作**（选段预设填充，SelectionRewrite:52）→ `Button` `quiet`·sm，无 active 态。
4. **点击导航** → `Link`，不属 Button 规范。

### 2.3 圆角统一裁定：`rounded-ctl`（8px），废止 `rounded`（4px）

理由：(a) SubTrans 控件圆角唯一来源 `--radius-sm: 8px`（按钮/输入/文件行/主题钮全 8px，style.css:85、:1101、:1177）；(b) inkforge 组件族 Card/Badge/Chip 已用 `rounded-ctl`/`rounded-card`，4px 是 R1 统计的 43 处裸写遗留，无 token 依据；(c) 8px 与 `h-ctl` 控件高同属「控件族」token（index.css:36-39 注释即此意图）。**裁定：全部 65 处按钮统一 `rounded-ctl`；表单输入/textarea 的 4px 圆角（inputCls）不属本规范，但建议实现卡顺手收编为 `rounded-ctl` 以统一控件族。**

### 2.4 次操作「有底无框」vs「有框无底」混存裁定

**统一为「有框无底」：`secondary` = 白底(surface) + line 边框 + hover 灰底，即 SubTrans `.btn-secondary` 形态。**

- 废止「`bg-bg` 无框灰底」按钮形态（R1 清单三 C 组 14 处）：SubTrans 语言中灰底只作为状态底（chip/badge/disabled），从不做可点按钮的常驻底色。
- 废止「`border` 无底」中间态 5 处（BookSamplePicker:56 等缺 `bg-surface` 的半成品）：补全为标准 secondary。
- 理由：SubTrans 次操作唯一形态就是白底灰框（移除选中/清空/保存参数，d1102 截图与 index.html:205-208 实证）；「hover 出灰底」由 secondary/quiet 的 hover 承担，常驻底不承担。

---

## 3. 65 处归一映射表（清单照抄 R1 清单①，逐处指定目标）

记法：`变体·tone·尺寸`；布局列只对「会撑坏」写调整方案。

### 3.1 BookDetailPage.tsx（13 处）

| 行 | 文案 | 现形态 | 目标 | 布局 |
|---|---|---|---|---|
| 209 | 整书生成 | h-ctl 实底 | primary·md | 无（已近标准形，收编进组件） |
| 212 | 刷新 | h-ctl 白底框 | secondary·md | 无 |
| 225 | 导出 | h-ctl 白底框 | secondary·md | 无 |
| 250 | 保存设定 | 实底 py-1.5 | primary·md | 无（`mt-2` 走透传 className） |
| 280 | 保存（人物卡编辑） | 实底 px-3 py-1 | primary·sm | 无 |
| 283 | 取消 | bg-bg 无框 | secondary·sm | 无 |
| 292 | 编辑 | 裸 text-primary-strong | quiet·primary·sm | 不撑坏；建议预览 span（:291）加 `min-w-0` 防长文本挤压 |
| 300 | 删除（人物卡，落库） | 裸 text-danger | quiet·danger·sm | 不撑坏；按 §1.5 升 L2 两步确认 `[HANDOFF_TO_CODING]` |
| 324 | 添加人物 | bg-bg 无框 | secondary·sm | 无 |
| 363 | 补摘要 | 裸 text-sm text-primary-strong | quiet·primary·sm | 不撑坏（章节行 h-8 < py-2 行高余量） |
| 367 | 生成 | ml-auto 裸 text-primary-strong | quiet·primary·sm | 不撑坏（ml-auto 走透传） |
| 391 | 保存蓝图 | 实底 py-1.5 | primary·md | 无 |
| 394 | 生成本章 | bg-bg 无框 py-1.5 | secondary·md | 无 |

### 3.2 BookSamplePicker.tsx（2 处）

| 行 | 文案 | 现形态 | 目标 | 布局 |
|---|---|---|---|---|
| 56 | 从书架选书 | border 无底半成品 | secondary·md | 无 |
| 93 | 导入所选 N 章 | 实底 disabled:opacity-50 | primary·md | 无（透明度归一到 45） |

### 3.3 BooksPage.tsx（3 处）

| 行 | 文案 | 现形态 | 目标 | 布局 |
|---|---|---|---|---|
| 48 | 确认删除 | 实底红 px-2 py-1 | danger·solid·sm | 无（确认簇宽 +20px 左右，卡内 flex-wrap 可容） |
| 51 | 取消 | rounded-ctl 框 | secondary·sm | 无 |
| 60 | 删除 | 红框+hover 软底 | quiet·danger·sm | 无 |

### 3.4 ChapterReaderPage.tsx（3 处）

| 行 | 文案 | 现形态 | 目标 | 布局 |
|---|---|---|---|---|
| 42 | 回滚到当前所选 | bg-bg 无框 | secondary·md | 无 |
| 45 | 导出 markdown | 实底 | primary·md | 无 |
| 56 | 版本链 chip | rounded 实底选中/灰底 | quiet·sm + active（§2.2） | 无；选中色变更 `[HANDOFF_TO_CODING]`（测试断言若查 bg-primary 需同步） |

### 3.5 DistillPage.tsx（2 处）

| 行 | 文案 | 现形态 | 目标 | 布局 |
|---|---|---|---|---|
| 60 | 保存模板 | 实底 py-1.5 text-sm | primary·md | 无 |
| 63 | 恢复默认 | bg-bg 无框 py-1.5 text-sm | secondary·md | 无 |

### 3.6 ForeshadowingsSection.tsx（3 处）

| 行 | 文案 | 现形态 | 目标 | 布局 |
|---|---|---|---|---|
| 90 | 标记回收 | 裸 text-primary-strong | quiet·primary·sm | 不撑坏（回收章输入 w-16 旁，行高余量足） |
| 95 | 删除（伏笔，落库） | ml-auto 裸 text-danger | quiet·danger·sm | 不撑坏；升 L2 两步确认 `[HANDOFF_TO_CODING]` |
| 121 | 登记伏笔 | bg-bg 无框 | secondary·sm | 无 |

### 3.7 ImitationProfilesSection.tsx（5 处）

| 行 | 文案 | 现形态 | 目标 | 布局 |
|---|---|---|---|---|
| 97 | 删除（仿写档案，落库） | ml-auto 裸 text-sm text-danger | quiet·danger·sm | 不撑坏；升 L2 `[HANDOFF_TO_CODING]`；建议 sourcePath span（:96）加 `min-w-0 break-all` |
| 115 | 绑定 | bg-bg 无框 | secondary·sm | 无 |
| 149 | 拆解分析 | 实底 px-4 py-2 | primary·md | 无 |
| 179 | 确认入库 | 实底 py-1.5 text-sm | primary·sm | 无 |
| 182 | 放弃 | bg-bg 无框 py-1.5 text-sm | secondary·sm | 无 |

### 3.8 NewBookIdeaPage.tsx（6 处）

| 行 | 文案 | 现形态 | 目标 | 布局 |
|---|---|---|---|---|
| 144 | 添加人物 | bg-bg 无框 px-2 py-1 | secondary·sm | 无 |
| 164 | 移除（草稿人物卡） | ml-auto 裸 text-sm text-danger | quiet·danger·sm | 不撑坏（L1 直删） |
| 199 | 建书并生成蓝图 | 实底 px-4 py-2 | primary·md | 无 |
| 224 | 收起/编辑 | ml-auto 裸 text-sm text-primary-strong | quiet·primary·sm | 不撑坏；goal span（:223）长文本建议加 `min-w-0 truncate` |
| 247 | 保存蓝图并继续 | 实底 px-4 py-2 | primary·md | 无 |
| 262 | 发起生成 | 实底 px-4 py-2 | primary·md | 无 |

### 3.9 NewBookPage.tsx（7 处）

| 行 | 文案 | 现形态 | 目标 | 布局 |
|---|---|---|---|---|
| 149 | 建书并进入导入 | 实底 px-4 py-2 | primary·md | 无 |
| 176 | 拆章预览 | border 无底半成品 | secondary·md | 无 |
| 179 | 导入 N 章 | 实底 px-4 py-2 | primary·md | 无 |
| 194 | 删除（拆章预览行） | 裸 text-danger | quiet·danger·sm | 不撑坏（L1 直删；行内 flex-1 输入框自动收缩） |
| 215 | 补摘要·第 N 章 | border 无底 px-2 py-1 text-sm | secondary·sm | 无（flex-wrap 容器，多条时可换行） |
| 222 | AI 建议蓝图 | border 无底 px-4 py-2 | secondary·md | 无 |
| 233 | 发起续写 | 实底 px-4 py-2 | primary·md | 无 |

### 3.10 OutlineTreeSection.tsx（11 处）

| 行 | 文案 | 现形态 | 目标 | 布局 |
|---|---|---|---|---|
| 110 | AI 生成大纲树 | 实底 px-3 py-1 | primary·sm | 无 |
| 113 | 手动加卷 | bg-bg 无框 | secondary·sm | 无 |
| 116 | 编辑已存树 | bg-bg 无框 | secondary·sm | 无 |
| 119 | 偏离复核 | bg-bg 无框 | secondary·sm | 无 |
| 139 | 加阶段 | 裸 text-primary-strong | quiet·primary·sm | 不撑坏（卷头行 flex-1 输入自动收缩；h-8 与 inputCls 高差 2px 可接受） |
| 142 | 删卷（草稿态） | 裸 text-danger | quiet·danger·sm | 不撑坏（L1 直删） |
| 169 | 加卡 | 裸 text-primary-strong | quiet·primary·sm | 不撑坏（同上） |
| 172 | 删阶段（草稿态） | 裸 text-danger | quiet·danger·sm | 不撑坏（L1 直删） |
| 217 | 删卡（草稿态） | 裸 text-danger | quiet·danger·sm | 不撑坏（flex-wrap 行可换行；L1 直删） |
| 241 | 保存大纲树 | 实底 px-4 py-1.5 text-sm | primary·sm | 无 |
| 244 | 放弃草稿 | bg-bg 无框 px-4 py-1.5 text-sm | secondary·sm | 无 |

### 3.11 RunPage.tsx（3 处）

| 行 | 文案 | 现形态 | 目标 | 布局 |
|---|---|---|---|---|
| 70 | 暂停 | **bg-warn 实底白字** | secondary·md | 无；**裁定：warn 实底废止**——SubTrans 语言无 warn 实底钮（warn 仅入 badge/hint），暂停是可恢复流控，降为 secondary，靠文案区分 |
| 73 | 继续 | bg-bg 无框 | secondary·md | 无 |
| 76 | 取消 | bg-danger 实底白字 | danger·md（soft） | 无；**裁定：solid→soft**，对齐 SubTrans 停止钮形态（style.css:1119-1125）；取消运行不确认（§1.5） |

### 3.12 SelectionRewrite.tsx（2 处）

| 行 | 文案 | 现形态 | 目标 | 布局 |
|---|---|---|---|---|
| 52 | 预设 chip（×N） | bg-bg 无框 px-3 py-1 | quiet·sm | 无（flex-wrap 行） |
| 69 | 提交选段重写 | 实底 py-1.5 + 文案换字式 busy | primary·sm | 无；busy 改 `loading` prop `[HANDOFF_TO_CODING]`（§1.3） |

### 3.13 SettingsPage.tsx（1 处）

| 行 | 文案 | 现形态 | 目标 | 布局 |
|---|---|---|---|---|
| 124 | 保存（type=submit） | 实底 px-4 py-2 | primary·md | 无；`type="submit"` 原样保留，busy 改 `loading`（现状「保存中…」换字属反例） |

### 3.14 StyleProfilesSection.tsx（4 处）

| 行 | 文案 | 现形态 | 目标 | 布局 |
|---|---|---|---|---|
| 125 | 版本/收起版本 | ml-auto 裸 text-primary-strong | quiet·primary·sm | 不撑坏；meta span（:121）长文案建议加 `min-w-0` |
| 177 | 蒸馏 | 实底 px-4 py-2 | primary·md | 无 |
| 234 | 确认入库 | 实底 py-1.5 text-sm | primary·sm | 无 |
| 237 | 放弃 | bg-bg 无框 py-1.5 text-sm | secondary·sm | 无 |

### 3.15 纯文本按钮（R1 清单② 16 处）布局裁定汇总

16 处全部归入 `quiet`（primary/danger tone）·sm，**均不撑坏行内布局**，依据：
- 容器全部为 flex 行且无定宽竞争（flex-1 输入框/文本列自动收缩）；
- quiet·sm 高 32px，各处行内已有 ≥32px 余量（py-1/py-2 行或 flex-wrap 容器）；
- 宽度增量 ≈ 每钮 +10~20px，均被 ml-auto/伸缩列吸收。

需随卡执行的防挤压微调（各改一处 className 属性，非结构改动）：
1. BookDetailPage:291 预览 span 加 `min-w-0`；
2. ImitationProfilesSection:96 sourcePath span 加 `min-w-0 break-all`；
3. NewBookIdeaPage:223 goal span 加 `min-w-0 truncate`；
4. StyleProfilesSection:121 meta span 加 `min-w-0`。

---

## 4. 验收要点（实现后 GUI 黑盒目验清单）

### 4.1 目验矩阵

- 分辨率：1280×800 与 1600×900，浅色固定（对齐 SubTrans 基准图 d1102-c-1280.png 的 1280 档）；另在 Windows 显示缩放 125% 下复查 1280 宽（书架三列卡、详情页按钮行不折行错位）。
- 三类代表页必看：
  - **删除类**：BooksPage（L3 两步确认全流程：删除→确认簇→确认删除成功 / 取消收簇）+ BookDetailPage 人物卡（L2 确认簇）；
  - **取消类**：RunPage（暂停/继续/取消三钮同排、运行中点取消直接生效、soft 红形态）；编辑态取消（大纲树草稿放弃、人物卡编辑取消）；
  - **生成类**：NewBookIdeaPage 发起生成（md 主钮）、BookDetailPage 整书生成（与刷新/导出/select 同排 36px 基线对齐）、OutlineTreeSection AI 生成大纲树（busy disabled）。
- 附带抽检：SettingsPage（表单主钮 + loading）、ChapterReaderPage（版本链 chip 选中软底）、DistillPage。

### 4.2 逐项检查单

1. 全站无裸按钮：`grep -rn "<button" apps/web/src/pages --include=*.tsx` 命中数应为 0（全部改走 `<Button`；ui.tsx 组件自身除外）。
2. 同语义同形态：任取 3 个页面的「删除」入口互相对照，均为 quiet·danger·sm；「取消/放弃」均为 secondary；无 4px 圆角残留。
3. 尺寸基线：md 档与同排 `h-ctl` 输入框/select 顶底对齐（36px）；sm 档 32px；图标钮正方形。
4. hover 逐一抽查四变体：primary 变深、secondary 出灰底、danger 加深红、quiet 出灰底（tone=danger 出红软底）；无位移/缩放动画。
5. 键盘可达：Tab 聚焦任意按钮出现 2px 蓝描边（offset 2px）；鼠标点击后不残留描边（focus-visible 而非 focus）。
6. disabled：opacity 45% + not-allowed 光标（AI 生成大纲树 busy、导入所选 0 章、保存中）。
7. loading：spinner 居中旋转、按钮宽度不塌、期间 disabled；不再出现「保存中…/重写中…」换字形态。
8. 危险确认：L3 确认簇文案含「不可恢复」级联说明；确认钮为全站唯一实底红场景（RunPage 取消应为 soft 红，不是实底）。
9. 图标合规：图标 14px/stroke 2；移除行用 X、落库删除入口用 Trash2、停止用 Square；无 emoji 顶替图标。
10. 可点选 chip：选中态 primary-soft 软底蓝字，未选中 quiet 灰字，hover 灰底。
11. 控制台零报错：F12 console 无新增 error/warning。
12. 固定浅色：系统深色模式下应用仍浅色（index.css:8 缺陷不回归）。
13. 同族对照：与 SubTrans 基准图（d1102-c-1280.png）同框对比——主钮实底蓝/次钮白底框/轻钮灰字三形态视觉同族（色值允许 §0.2 已记录偏差）。
14. 提交纪律：GUI 变更提交前过 web-gui-tester 黑盒 + lessons 目验前置；测试基线只增不减。

### 4.3 静态验收命令

```bash
grep -rn "<button" apps/web/src/pages --include=*.tsx | wc -l   # 期望 0
grep -rn "bg-warn px-4 py-2\|disabled:opacity-50" apps/web/src --include=*.tsx | wc -l   # 期望 0（warn 实底/旧透明度残留）
grep -rEn 'className="[^"]*text-danger[^"]*"' apps/web/src/pages --include=*.tsx | wc -l # 期望 0（裸红字按钮残留）
```

---

## 5. 本规范的验证证据（设计层自检记录，2026-11-16）

- **class 编译实证**：在临时目录用 inkforge 同款 `@tailwindcss/vite`（Tailwind 4.3.5）+ inkforge index.css 全量 token 构建探针页，§1.2 全部 class 串（含 `h-ctl`、`rounded-ctl`、`border-danger/40`、`hover:bg-danger/25`、`hover:bg-bg`、`h-8`、`px-3.5`、`focus-visible:outline-primary`、`disabled:opacity-45`、`hover:brightness-90`、`animate-spin`）逐条确认产出 CSS 规则；关键两条：`.h-ctl{height:var(--height-ctl)}`、`.border-danger\/40{border-color:color-mix(in oklab,var(--color-danger) 40%,transparent)}`。`--height-*` 命名空间实证可用（R1 所称 h-ctl 三处使用属实有效）。
- **SubTrans 母体核对**：`.btn`/`.btn-primary`/`.btn-danger`/`.btn-secondary`/`.btn-ghost`/`.btn-sm`/`button.loading`/`.file-remove-btn`/`:focus-visible` 逐行读于 style.css:1089-1167、:794-810、:191-195；实钮挂载读于 index.html:173-175（primary 带图标）、:205-208（secondary：移除选中/清空）、:549（停止=danger+Square 图标）；卡内主提交用 compact（app-modal.js:1686 tm-edit-save）。
- **两步确认先例核查**：SubTrans 无两步内联确认（确认走 modal，app-msg.js 文案表），故 L2/L3 簇为 inkforge 沿用自身既有交互（BooksPage 已有）+ danger·solid 扩展形态，非对 SubTrans 语言的发明性新增（结构=实底钮+色相替换，§1.1 已声明）。
- **lucide-react**：inkforge 已装 1.72.0（node_modules 实证），图标规则无新依赖。

## 6. 交给编码卡的清单（[HANDOFF_TO_CODING]）

1. ui.tsx 增补 Button（API/class 串按 §1.1、§1.2；同族写法按 BADGE_TONES 先例）。
2. 65 处替换按 §3 映射表执行；§3.15 四处防挤压微调随卡改。
3. 行为变更三件：人物卡/伏笔/仿写档案删除加 L2 确认簇；版本链 chip 选中色改软底；SelectionRewrite/SettingsPage busy 改 loading prop——各补回归测试，基线只增不减。
4. RunPage 暂停钮 warn 实底→secondary、取消钮 solid→danger soft 为视觉裁定，随卡带截图目验。
