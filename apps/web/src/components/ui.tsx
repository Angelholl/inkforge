import type { ReactNode } from 'react';

/** 卡面容器：surface + line 边 + card 圆角（D2 公共组件）。 */
export function Card({ className = '', children }: { className?: string; children: ReactNode }) {
  return <div className={`rounded-card border border-line bg-surface p-4 ${className}`}>{children}</div>;
}

export type BadgeTone = 'ok' | 'warn' | 'danger' | 'info' | 'muted';

const BADGE_TONES: Record<BadgeTone, string> = {
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  danger: 'bg-danger-soft text-danger',
  info: 'bg-primary-soft text-primary-strong',
  muted: 'bg-bg text-muted',
};

/** 状态徽标（D2）：ok/warn/danger/info/muted 五语义。 */
export function Badge({ tone = 'muted', children }: { tone?: BadgeTone; children: ReactNode }) {
  return <span className={`inline-block rounded-ctl px-2 py-0.5 text-xs ${BADGE_TONES[tone]}`}>{children}</span>;
}

/** 流程 chip 条（D2）：active=主色软底，否则灰底。 */
export function Chip({ active = false, children }: { active?: boolean; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-ctl px-2 py-0.5 text-xs ${
        active ? 'bg-primary-soft text-primary-strong' : 'bg-bg text-faint'
      }`}
    >
      {children}
    </span>
  );
}

export type ConsoleTone = 'normal' | 'dim' | 'error' | 'warn' | 'ok';

const CONSOLE_TONES: Record<ConsoleTone, string> = {
  normal: 'text-console-1',
  dim: 'text-console-2',
  error: 'text-console-3',
  warn: 'text-console-4',
  ok: 'text-console-5',
};

export interface ConsoleLine {
  text: string;
  tone?: ConsoleTone;
}

/** 深色控制台（D2）：console-bg + 五分色日志行；等宽字体，自动滚底由调用方控制。 */
export function Console({ lines, className = '' }: { lines: ConsoleLine[]; className?: string }) {
  return (
    <pre
      className={`overflow-auto rounded-card bg-console-bg p-3 font-mono text-xs leading-5 ${className}`}
      data-testid="console"
    >
      {lines.length === 0
        ? <span className="text-console-2">（暂无运行日志）</span>
        : lines.map((l, i) => (
            <div key={i} className={CONSOLE_TONES[l.tone ?? 'normal']}>
              {l.text}
            </div>
          ))}
    </pre>
  );
}

/** run 状态 → Badge tone 映射（详情页 aside 控制卡/控制台共用）。 */
export function runStatusTone(status: string): BadgeTone {
  if (status === 'done') return 'ok';
  if (status === 'failed' || status === 'cancelled') return 'danger';
  if (status === 'running' || status === 'queued') return 'info';
  if (status === 'paused') return 'warn';
  return 'muted';
}
