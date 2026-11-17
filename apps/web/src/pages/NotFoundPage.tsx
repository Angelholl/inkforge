import { useEffect, useState } from 'react';
import type { HealthDto } from '@inkforge/shared';
import { Link } from 'react-router';
import { API_BASE } from '../api/client';

export default function NotFoundPage() {
  const [health, setHealth] = useState<HealthDto | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/api/health`)
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => setHealth(null));
  }, []);

  return (
    <main className="mx-auto mt-16 max-w-2xl px-8">
      <h1 className="font-display text-3xl font-semibold tracking-wide">墨炉</h1>
      <p className="mt-2 text-sm text-muted">
        {health ? <>服务已连接 · v{health.version}</> : '服务未连接'}
      </p>
      <p className="mt-2 text-sm text-muted">此页不存在。</p>
      <Link to="/" className="mt-4 inline-block text-sm text-primary-strong hover:underline">
        ← 返回书架
      </Link>
    </main>
  );
}
