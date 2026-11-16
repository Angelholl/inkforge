# 卡 T1：Button 公共组件（D4 前置，apps/web，只落组件+单测）

## 一、根因与目标

`apps/web/src/components/ui.tsx` 无 Button 组件，全站 65 处裸 `<button>`（其中 16 处无边框无底色）。本卡只落 Button 本体与单测，**不改任何页面**（页面替换归 T2-T6，它们全部消费本卡产物）。视觉与 class 真值源 = `docs/design/spec-button-subtrans-2026-11-16.md` §1.1/§1.2/§1.3（:45-124）；计划真值 = `docs/plans/2026-11-16-four-feedbacks.md` Task1（:53-97）。冲突即停报。

## 二、改动文件（仅此二件）

- Modify `apps/web/src/components/ui.tsx`（首行 import 改写 + 文件尾 :77 后追加）
- Test Create `apps/web/src/components/ui.test.tsx`（+7 用例，web 基线 11 文件/37 用例 → 12 文件/44 用例）

## 三、改法（钉死）

1. `ui.tsx` 首行改 `import type { ButtonHTMLAttributes, ReactNode } from 'react';`，另起一行 `import { Loader2 } from 'lucide-react';`（lucide-react ^1.72 已在 apps/web 依赖）。
2. 追加以下 API 与常量表（props 不得增删；写法照 `BADGE_TONES`（ui.tsx:10-16）的 `Record<…, string>` 常量表+模板串拼接）：

```tsx
export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'quiet';
export type ButtonSize = 'md' | 'sm';
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;   // 默认 'secondary'
  size?: ButtonSize;         // 默认 'md'
  tone?: 'neutral' | 'primary' | 'danger'; // 仅 variant='quiet' 生效，默认 'neutral'
  solid?: boolean;           // 仅 variant='danger'：两步确认第二步实底红
  active?: boolean;          // 仅 variant='quiet'：可点选 chip 选中态
  iconOnly?: boolean;        // 方形图标钮（调用方负责给 aria-label，组件不做运行时校验）
  loading?: boolean;         // 进行中态
}
export function Button(props: ButtonProps) { /* 推断返回类型，勿写 JSX.Element——@types/react 19 无全局 JSX 命名空间 */ }
```

3. class 串（逐字照抄规格 §1.2，不得增删 token）：
   - 基类 `BUTTON_BASE` = `inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-ctl font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-45`
   - `BUTTON_VARIANTS`：primary=`bg-primary text-white hover:bg-primary-strong`；secondary=`border border-line bg-surface text-ink hover:bg-bg`；danger=`border border-danger/40 bg-danger-soft text-danger hover:bg-danger/25`；quiet 走 tone 子表
   - `BUTTON_TONES`（quiet）：neutral=`text-muted hover:bg-bg hover:text-ink`；primary=`text-primary-strong hover:bg-bg`；danger=`text-danger hover:bg-danger-soft`
   - danger+`solid` 覆盖 danger 软底串 = `bg-danger text-white hover:brightness-90`
   - `active` 且 variant='quiet' 时追加 = `bg-primary-soft text-primary-strong hover:bg-primary-soft`（非 quiet 的 active 忽略）
   - `BUTTON_SIZES`：md=`h-ctl px-3.5 text-sm`；sm=`h-8 px-2.5 text-xs`；`iconOnly` 强制走 sm 串并追加 `w-8 px-0`
   - `loading` 时给 button 加 `relative`；`className` 透传拼接放最后（允许调用方加 `ml-auto` 等）
4. 渲染结构（钉死）：解构 props 得 `variant/size/tone/solid/active/iconOnly/loading/className/children/disabled/type='button'` + `...rest`；`<button type={type} className={…} disabled={disabled || loading} aria-busy={loading ? true : undefined} {...rest}>`；
   - loading 时 children 包 `<span className="invisible">` 保宽，另置 `<span className="absolute inset-0 grid place-items-center"><Loader2 size={16} className="animate-spin" aria-hidden="true" /></span>`（spinner 用 currentColor，Loader2 默认 stroke=currentColor）；
   - 非 loading 时直接渲染 children，无 spinner、无 `aria-busy`。
5. 禁止：新增任何 CSS/token、改 index.css、改其它组件、引新依赖。

## 四、先红后绿回归测试（以下命令均在项目根目录执行）

`ui.test.tsx` 用 `@testing-library/react`（jsdom 已配在 vite.config.ts test.environment），无需 fetch/router stub；每用例后 `cleanup()`。七用例逐条钉死：

1. 四变体 class：primary 含 `bg-primary`+`text-white`+`hover:bg-primary-strong`；secondary 含 `border-line`+`bg-surface`；danger 含 `border-danger/40`+`bg-danger-soft`；`variant="danger" solid` 含 `bg-danger`+`text-white` 且**不含** `border-danger/40`；quiet 三 tone 各含 `text-muted`/`text-primary-strong`/`text-danger`。
2. 尺寸：默认含 `h-ctl px-3.5 text-sm`；`size="sm"` 含 `h-8 px-2.5 text-xs`；`iconOnly` 含 `w-8 px-0`。
3. `disabled` → class 含 `disabled:opacity-45` 与 `disabled:cursor-not-allowed`。
4. 任意变体 class 含 `focus-visible:outline-2` 与 `focus-visible:outline-primary`。
5. accessible name：文字钮 `getByRole('button', { name: '删除' })` 命中；`iconOnly`+`aria-label="移除"` 命中。
6. `loading` → `aria-busy="true"`、`disabled` 生效、children 渲染于 `span.invisible` 内、DOM 存在 `animate-spin` 元素；非 loading 时 `queryByAttribute('aria-busy')` 为空。
7. `className="ml-auto"` 出现在最终 class 串中。

顺序：先写七用例 → `pnpm --filter @inkforge/web exec vitest run src/components/ui.test.tsx` 全红（组件不存在）→ 实现 → 7/7 绿。

## 五、验证链与验收命令（主审独立复核）

1. `pnpm --filter @inkforge/web exec vitest run src/components/ui.test.tsx` → 7/7 绿。
2. `pnpm typecheck` → 0 错；`pnpm lint` → 0 错。
3. `pnpm --filter @inkforge/web exec vitest run` → **44 用例全绿**（12 文件）。
4. `pnpm test` → 277 全绿（shared 2 / web 44 / server 231），只增不减。
5. `git show --name-only HEAD` 仅触及二、清单二文件；`grep -c "export function Button" apps/web/src/components/ui.tsx` → 1。

## 六、约束

- 禁改：`apps/web/src/pages/**`、`apps/web/src/index.css`、`package.json`、`apps/server/**`、`packages/**`；不得动 ui.tsx 既有 Card/Badge/Chip/Console/runStatusTone 与 `BADGE_TONES`/`CONSOLE_TONES` 写法。
- 本卡不改页面 → 无 GUI 变更，提交信息注明「GUI 未验证」。
- 只 commit 不 push；`git add` 明确列二文件路径，永不 `git add -A`、永不 `--no-verify`。
- commit 标题：`feat(web): 新增 Button 公共组件（D4 规格四变体/尺寸/五状态）`；正文 `verify:` 行含定向 7/7、web 包 44 全绿、全量 277 全绿、typecheck/lint 结果；尾行 `Refs: DEC-2026-1116-01`。
- 卡外问题即停报，不得自行扩面。
