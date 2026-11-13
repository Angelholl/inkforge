import { useEffect, useState } from 'react';
import type { HealthDto } from '@inkforge/shared';
import { Link, Route, Routes } from 'react-router';
import { API_BASE } from './api/client';
import SettingsPage from './pages/SettingsPage';

export default function App() {
  const [health, setHealth] = useState<HealthDto | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/api/health`)
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => setHealth(null));
  }, []);

  return (
    <>
      <header className="mx-auto mt-8 flex max-w-2xl gap-4 px-6 text-sm">
        <Link to="/" className="text-blue-700">
          书架
        </Link>
        <Link to="/new" className="text-blue-700">
          新建小说
        </Link>
        <Link to="/styles" className="text-blue-700">
          风格
        </Link>
        <Link to="/settings" className="text-blue-700">
          设置
        </Link>
      </header>
      <Routes>
        <Route path="settings" element={<SettingsPage />} />
        <Route
          path="*"
          element={
            <main className="mx-auto mt-16 max-w-2xl px-6">
              <h1 className="text-3xl font-bold tracking-wide">墨炉</h1>
              <p className="mt-2 text-sm text-gray-500">
                {health ? (
                  <>
                    服务已连接 · v{health.version}
                  </>
                ) : (
                  '服务未连接'
                )}
              </p>
            </main>
          }
        />
      </Routes>
    </>
  );
}
