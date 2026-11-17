import { useQuery } from '@tanstack/react-query';
import { NavLink, Outlet } from 'react-router';
import { BookMarked, FilePlus2, FlaskConical, PenLine, Settings } from 'lucide-react';
import { api } from './api/client';

/**
 * rail 导航项（DEC-2026-1118-02 松烟重塑）：墨晕底+3px 墨左标承载激活识别（墨晕对纸底仅 1.12:1，左标是主识别线），
 * idle 侧 3px 透明左标防 hover 位移；图标+文字，h-ctl 控件高。
 */
function RailLink({ to, label, icon, end = false }: { to: string; label: string; icon: React.ReactNode; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex h-ctl items-center gap-2 rounded-ctl border-l-[3px] px-3 text-sm ${
          isActive
            ? 'rounded-l-none border-l-primary bg-primary-soft font-semibold text-primary-strong'
            : 'border-l-transparent text-muted hover:bg-bg hover:text-ink'
        }`
      }
    >
      {icon}
      {label}
    </NavLink>
  );
}

function RailGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="px-3 pb-1 pt-4 text-xs text-faint">{label}</div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

/** 应用壳（DEC-2026-1118-02）：品牌区「墨炉」双语呈现；创作/工坊/系统三分组；底部存活点+版本号。 */
export default function AppShell() {
  const { data: health } = useQuery({ queryKey: ['health'], queryFn: api.health, refetchInterval: 15000 });
  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 shrink-0 flex-col border-r border-line bg-surface">
        <div className="flex h-14 items-baseline gap-2.5 px-5">
          <span className="font-display text-[22px] font-semibold leading-none text-ink">墨炉</span>
          <span className="font-mono text-xs leading-none text-faint">inkforge</span>
        </div>
        <nav className="flex-1 space-y-1 px-3 pb-3">
          <RailGroup label="创作">
            <RailLink to="/" end label="书架" icon={<BookMarked size={16} strokeWidth={1.8} />} />
            <RailLink to="/new" label="新书" icon={<FilePlus2 size={16} strokeWidth={1.8} />} />
            <RailLink to="/continue" label="续写" icon={<PenLine size={16} strokeWidth={1.8} />} />
          </RailGroup>
          <RailGroup label="工坊">
            <RailLink to="/distill" label="蒸馏" icon={<FlaskConical size={16} strokeWidth={1.8} />} />
          </RailGroup>
          <RailGroup label="系统">
            <RailLink to="/settings" label="设置" icon={<Settings size={16} strokeWidth={1.8} />} />
          </RailGroup>
        </nav>
        <div className="flex items-center gap-2 border-t border-line px-5 py-3 text-xs text-faint">
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${health ? 'bg-ok' : 'bg-faint'}`} aria-hidden="true" />
          v{health?.version ?? '…'}
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <Outlet />
      </div>
    </div>
  );
}
