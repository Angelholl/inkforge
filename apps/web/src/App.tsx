import { useEffect, useState } from 'react';
import type { HealthDto } from '@inkforge/shared';

export default function App() {
  const [health, setHealth] = useState<HealthDto | null>(null);

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => setHealth(null));
  }, []);

  return (
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
  );
}
