import { NavLink, Outlet } from 'react-router';

const tabClass = ({ isActive }: { isActive: boolean }) => (isActive ? 'font-bold text-blue-700' : 'text-blue-700');

export default function AppShell() {
  return (
    <>
      <header className="mx-auto mt-8 flex max-w-2xl gap-4 px-6 text-sm">
        <NavLink to="/" end className={tabClass}>
          书架
        </NavLink>
        <NavLink to="/new" className={tabClass}>
          新书
        </NavLink>
        <NavLink to="/continue" className={tabClass}>
          续写
        </NavLink>
        <NavLink to="/settings" className={tabClass}>
          设置
        </NavLink>
      </header>
      <Outlet />
    </>
  );
}
