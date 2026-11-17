import type { TableHTMLAttributes } from 'react';

/**
 * 表格基座（DEC-2026-1118-02 §2.3）：外层卡面容器杀 currentColor 黑行线（C5），
 * 行线半透明 line/60，数字/时间列 tabular-nums。data-testid 等透传到 table 元素。
 */
export function DataTable({ className = '', children, ...rest }: TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className={`overflow-hidden rounded-card border border-line bg-surface ${className}`}>
      <table className="w-full text-sm" {...rest}>
        {children}
      </table>
    </div>
  );
}

export const dataTableHead = 'border-b border-line bg-bg/60 text-left text-xs text-muted';
export const dataTableHeadCell = 'px-4 py-2.5 font-medium';
export const dataTableRow = 'border-b border-line/60 transition-colors last:border-0 hover:bg-bg/50';
export const dataTableCell = 'px-4 py-2.5 align-middle';
/** 数字/时间/令牌列：等宽对齐 */
export const dataTableCellNum = `${dataTableCell} tabular-nums`;
/** 步名/run id 等技术令牌列 */
export const dataTableCellMono = `${dataTableCell} font-mono text-[13px]`;
