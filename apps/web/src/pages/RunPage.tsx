import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { useRunEvents } from '../hooks/useRunEvents';
import { api } from '../api/client';
import type { RunDto } from '@inkforge/shared';

function statusBadge(status: string): string {
  switch (status) {
    case 'done':
      return 'bg-green-100 text-green-700';
    case 'failed':
      return 'bg-red-100 text-red-700';
    case 'inflight':
      return 'bg-blue-100 text-blue-700';
    case 'needs_human':
      return 'bg-orange-100 text-orange-700';
    case 'cancelled':
      return 'bg-gray-200 text-gray-600';
    default:
      return 'bg-gray-100 text-gray-600';
  }
}

export default function RunPage() {
  const { runId = '' } = useParams();
  const live = useRunEvents(runId || null);
  const { data: fetched } = useQuery({
    queryKey: ['run', runId],
    queryFn: () => api.getRun(runId),
    enabled: !!runId && !live.run,
  });
  const run: RunDto | null = live.run ?? fetched ?? null;
  const steps = live.run ? live.steps : (fetched?.steps ?? []);
  const [msg, setMsg] = useState('');

  // 步状态在 SSE 下与 DB 行不同步时回退轮询
  useEffect(() => {
    if (live.connected) return;
    const t = setInterval(() => {
      if (runId) void fetch(`/api/runs/${runId}`).then(() => undefined).catch(() => undefined);
    }, 3000);
    return () => clearInterval(t);
  }, [live.connected, runId]);

  if (!run) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-10">
        <h1 className="text-2xl font-bold">运行 {runId}</h1>
        <p className="mt-2 text-sm text-gray-500">加载中…</p>
      </main>
    );
  }

  const terminal = ['done', 'cancelled', 'failed'].includes(run.status);

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-2xl font-bold">
        运行 <span className="font-mono text-sm">{run.id.slice(0, 8)}</span>
        <span className={`ml-3 rounded px-3 py-1 text-sm ${statusBadge(run.status)}`}>{run.status}</span>
      </h1>
      <p className="mt-1 text-sm text-gray-500">
        SSE {live.connected ? '已连接' : '未连接（3s 重连）'} · 章节范围 {run.chapterScope.from}-{run.chapterScope.to} ·{' '}
        <Link className="text-blue-600" to={`/runs/${run.id}/dashboard`}>
          仪表盘 →
        </Link>
      </p>
      <div className="mt-4 flex gap-2">
        <button className="rounded bg-orange-500 px-4 py-2 text-white" onClick={() => api.pauseRun(run.id).then(() => setMsg('已请求暂停'))}>
          暂停
        </button>
        <button className="rounded bg-gray-200 px-4 py-2" onClick={() => api.resumeRun(run.id).then(() => setMsg('已请求继续'))}>
          继续
        </button>
        <button className="rounded bg-red-600 px-4 py-2 text-white" onClick={() => api.cancelRun(run.id).then(() => setMsg('已请求取消'))}>
          取消
        </button>
      </div>
      {msg && <p className="mt-2 text-sm text-gray-600">{msg}</p>}
      <table className="mt-6 w-full text-left text-sm">
        <thead>
          <tr className="border-b">
            <th className="py-2">步</th>
            <th>轮</th>
            <th>状态</th>
            <th>错误</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {steps.map((s) => (
            <tr key={`${s.step}-${s.attempt}-${s.id}`} className="border-b">
              <td className="py-2 font-mono">{s.step}</td>
              <td>{s.attempt}</td>
              <td>
                <span className={`rounded px-2 py-0.5 text-xs ${statusBadge(s.status)}`}>{s.status}</span>
              </td>
              <td className="text-xs text-red-600">{s.error ?? ''}</td>
              <td>{!terminal && <span className="text-xs text-gray-400">…</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
