import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

/** 卡面容器：surface + line 边 + card 圆角（D2 公共组件）。 */
export function Card({ className = '', children }: { className?: string; children: ReactNode }) {
  return <div className={`rounded-card border border-line bg-surface p-4 ${className}`}>{children}</div>;
}

export type BadgeTone = 'ok' | 'warn' | 'danger' | 'info' | 'muted' | 'inflight';

const BADGE_TONES: Record<BadgeTone, string> = {
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  danger: 'bg-danger-soft text-danger',
  info: 'bg-primary-soft text-primary-strong',
  muted: 'bg-bg text-muted',
  // 炉火橙（DEC-2026-1118-02）：仅「运行中/inflight/live」；accent 文字一律 accent-strong（<18px 禁 accent）
  inflight: 'bg-accent-soft text-accent-strong',
};

/** 状态徽标（D2）：ok/warn/danger/info/muted/inflight 六语义；4px 锐角与流程 pill 分工。 */
export function Badge({ tone = 'muted', children }: { tone?: BadgeTone; children: ReactNode }) {
  return <span className={`inline-block rounded-[4px] px-2 py-0.5 text-xs ${BADGE_TONES[tone]}`}>{children}</span>;
}

/** 流程 chip 条（D2）：pill 形态与状态徽标 4px 锐角分工；active=墨晕软底，否则灰底描线。 */
export function Chip({ active = false, children }: { active?: boolean; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs ${
        active ? 'bg-primary-soft text-primary-strong' : 'bg-bg text-faint border border-line'
      }`}
    >
      {children}
    </span>
  );
}

type ConsoleTone = 'normal' | 'dim' | 'error' | 'warn' | 'ok';

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

/** run/step 状态 → Badge tone 映射（详情页 aside 控制卡/运行页共用）：inflight=炉火橙「机器在烧」，needs_human=warn。 */
export function runStatusTone(status: string): BadgeTone {
  if (status === 'done') return 'ok';
  if (status === 'failed' || status === 'cancelled') return 'danger';
  if (status === 'needs_human' || status === 'paused') return 'warn';
  if (status === 'inflight' || status === 'running' || status === 'queued') return 'inflight';
  return 'muted';
}

/** 「机器在烧」判定（炉火呼吸点渲染条件）。 */
export function isInflightStatus(status: string): boolean {
  return status === 'inflight' || status === 'running' || status === 'queued';
}

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'quiet';
type ButtonSize = 'md' | 'sm';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant; // 默认 'secondary'
  size?: ButtonSize; // 默认 'md'
  tone?: 'neutral' | 'primary' | 'danger'; // 仅 variant='quiet' 生效，默认 'neutral'
  solid?: boolean; // 仅 variant='danger'：两步确认第二步实底红
  active?: boolean; // 仅 variant='quiet'：可点选 chip 选中态
  iconOnly?: boolean; // 方形图标钮（调用方负责给 aria-label，组件不做运行时校验）
  loading?: boolean; // 进行中态
}

const BUTTON_BASE =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-ctl font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-45 active:brightness-95';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-white hover:bg-primary-strong',
  secondary: 'border border-line bg-surface text-ink hover:bg-bg',
  danger: 'border border-danger/40 bg-danger-soft text-danger hover:bg-danger/25',
  quiet: 'text-muted hover:bg-bg hover:text-ink',
};

const BUTTON_TONES: Record<'neutral' | 'primary' | 'danger', string> = {
  neutral: 'text-muted hover:bg-bg hover:text-ink',
  primary: 'text-primary-strong hover:bg-bg',
  danger: 'text-danger hover:bg-danger-soft',
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  md: 'h-ctl px-3.5 text-sm',
  sm: 'h-8 px-2.5 text-xs',
};

/** 公共按钮（D4）：四变体/两尺寸/五状态，class 真值源 = spec-button-subtrans-2026-11-16 §1.2。 */
export function Button(props: ButtonProps) {
  const {
    variant = 'secondary',
    size = 'md',
    tone = 'neutral',
    solid = false,
    active = false,
    iconOnly = false,
    loading = false,
    className = '',
    children,
    disabled = false,
    type = 'button',
    ...rest
  } = props;

  const variantClass =
    variant === 'danger' && solid ? 'bg-danger text-white hover:brightness-90' : variant === 'quiet' ? BUTTON_TONES[tone] : BUTTON_VARIANTS[variant];
  const sizeClass = iconOnly ? `${BUTTON_SIZES.sm} w-8 px-0` : BUTTON_SIZES[size];
  const activeClass = active && variant === 'quiet' ? ' bg-primary-soft text-primary-strong hover:bg-primary-soft' : '';
  const loadingClass = loading ? ' relative' : '';

  return (
    <button
      type={type}
      className={`${BUTTON_BASE} ${variantClass} ${sizeClass}${activeClass}${loadingClass} ${className}`}
      disabled={disabled || loading}
      aria-busy={loading ? true : undefined}
      {...rest}
    >
      {loading ? (
        <>
          <span className="invisible">{children}</span>
          <span className="absolute inset-0 grid place-items-center">
            <Loader2 size={16} className="animate-spin" aria-hidden="true" />
          </span>
        </>
      ) : (
        children
      )}
    </button>
  );
}
