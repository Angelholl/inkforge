import type { ReactNode } from 'react';

/**
 * 统一空态（DEC-2026-1118-02 §2.4）：虚线框+图标+一句说明+可选引导动作。
 * action 传 ReactNode；注意 BooksPage 必须传 Link「续写向导」（测试钉 link 语义）。
 */
export function EmptyState({
  icon,
  title,
  hint,
  action,
  className = '',
}: {
  icon?: ReactNode;
  title: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-card border border-dashed border-line-strong bg-surface/50 px-6 py-10 text-center ${className}`}
    >
      {icon && <div className="mb-2 flex justify-center text-faint [&_svg]:size-5">{icon}</div>}
      <p className="text-sm font-medium text-ink">{title}</p>
      {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
