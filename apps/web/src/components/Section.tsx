import type { ReactNode } from 'react';

/**
 * 节标题/卡头（DEC-2026-1118-02 §2.4）：统一三级标题档位（P3），动作位右对齐。
 * SectionHeader 用于节顶；CardHeader 用于卡面顶栏（标题+动作横排带底边线）。
 */
export function SectionHeader({
  title,
  size = 'md',
  action,
  className = '',
}: {
  title: ReactNode;
  /** md=节标题 text-base / lg=大分区 text-lg */
  size?: 'md' | 'lg';
  action?: ReactNode;
  className?: string;
}) {
  const titleCls = size === 'lg' ? 'text-lg font-semibold text-ink' : 'text-base font-semibold text-ink';
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <h2 className={titleCls}>{title}</h2>
      {action && <div className="ml-auto flex items-center gap-2">{action}</div>}
    </div>
  );
}

export function CardHeader({ title, action }: { title: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      {action && <div className="flex items-center gap-2">{action}</div>}
    </div>
  );
}
