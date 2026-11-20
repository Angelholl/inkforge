/**
 * 表单控件基座（DEC-2026-1118-02 §2.2，评议员 HIGH_RISK 修正版）：
 * 边界一律 line-control（3.25:1，治裸 currentColor 黑边与「line 色不可辨」两端），
 * 焦点 focus-visible:outline-primary（键盘可见 15.6:1），hover 加深一档。
 * 纯样式壳；受控逻辑留在页面（不改任何 onChange/onSubmit 行为）。
 */
export const fieldLabel = 'text-xs font-medium text-muted';
export const inputBase =
  'h-ctl w-full rounded-ctl border border-line-control bg-surface px-3 text-sm text-ink '
  + 'placeholder:text-faint transition-colors duration-150 '
  + 'hover:border-ink/50 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary';

export const textareaBase =
  'min-h-24 w-full rounded-ctl border border-line-control bg-surface p-3 text-sm text-ink leading-6 '
  + 'placeholder:text-faint transition-colors duration-150 '
  + 'hover:border-ink/50 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary';

export const selectBase =
  'h-ctl rounded-ctl border border-line-control bg-surface px-2.5 text-sm text-ink '
  + 'transition-colors hover:border-ink/50 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary';

// accent-color 原生化勾选框
export const checkboxBase = 'size-4 accent-primary';

export const numberBase = `${inputBase} tabular-nums`;

/** 窄数字/短文本输入（不带 w-full，调用方自拼 w-16/w-20/w-24/w-40）：章号/字数/比例等。 */
export const inputNarrow =
  'h-ctl rounded-ctl border border-line-control bg-surface px-3 text-sm text-ink '
  + 'placeholder:text-faint transition-colors duration-150 '
  + 'hover:border-ink/50 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary tabular-nums';
