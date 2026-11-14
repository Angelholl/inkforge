import { useQuery } from '@tanstack/react-query';
import { NavLink, Outlet } from 'react-router';
import { BookMarked, FilePlus2, PenLine, Settings } from 'lucide-react';
import { api } from './api/client';

/** rail 导航项（D1）：主色高亮当前项，图标+文字，h-ctl 控件高。 */
function RailLink({ to, label, icon, end = false }: { to: string; label: string; icon: React.ReactNode; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex h-ctl items-center gap-2 rounded-ctl px-3 text-sm ${
          isActive ? 'bg-primary-soft font-semibold text-primary-strong' : 'text-ink hover:bg-bg'
        }`
      }
    >
      {icon}
      {label}
    </NavLink>
  );
}

/** 应用壳（D1）：左侧 rail——品牌块仅「inkforge」+分组导航+底部版本号；主题切换按钮不做（T-U4 另立项）。 */
export default function AppShell() {
  const { data: health } = useQuery({ queryKey: ['health'], queryFn: api.health, refetchInterval: 15000 });
  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 shrink-0 flex-col border-r border-line bg-surface">
        <div className="flex h-14 items-center px-5 text-lg font-bold tracking-wide text-ink">inkforge</div>
        <nav className="flex-1 space-y-1 px-3 py-3">
          <div className="px-3 pb-1 text-xs text-faint">工作台</div>
          <RailLink to="/" end label="书架" icon={<BookMarked size={16} />} />
          <RailLink to="/new" label="新书" icon={<FilePlus2 size={16} />} />
          <RailLink to="/continue" label="续写" icon={<PenLine size={16} />} />
          <div className="px-3 pb-1 pt-4 text-xs text-faint">系统</div>
          <RailLink to="/settings" label="设置" icon={<Settings size={16} />} />
        </nav>
        <div className="border-t border-line px-5 py-3 text-xs text-faint">v{health?.version ?? '…'}</div>
      </aside>
      <div className="min-w-0 flex-1">
        <Outlet />
      </div>
    </div>
  );
}
