import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { useRunEvents } from '../hooks/useRunEvents';
import { api } from '../api/client';
import { Badge, Button, isInflightStatus, runStatusTone } from '../components/ui';
import { DataTable, dataTableCell, dataTableCellMono, dataTableCellNum, dataTableRow, dataTableHead, dataTableHeadCell } from '../components/DataTable';
import type { RunDto } from '@inkforge/shared';

/** 运行详情（DEC-2026-1118-02）：DataTable 化（黑行线清零）+ 炉火呼吸点（机器在烧）+ Badge 统一状态语言。 */
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
      <main className="mx-auto max-w-6xl px-8 py-8">
        <h1 className="text-xl font-semibold">运行 {runId}</h1>
        <p className="mt-2 text-sm text-muted">加载中…</p>
      </main>
    );
  }

  const terminal = ['done', 'cancelled', 'failed'].includes(run.status);

  return (
    <main className="mx-auto max-w-6xl px-8 py-8">
      <h1 className="flex items-center gap-3 text-xl font-semibold">
        <span>
          运行 <span className="font-mono text-sm text-muted">{run.id.slice(0, 8)}</span>
        </span>
        <Badge tone={runStatusTone(run.status)}>{run.status}</Badge>
        {isInflightStatus(run.status) && <span className="ember-dot bg-accent" aria-label="运行中" />}
      </h1>
      <p className="mt-1 text-sm text-muted">
        SSE {live.connected ? '已连接' : '未连接（3s 重连）'} · 章节范围 {run.chapterScope.from}-{run.chapterScope.to} ·{' '}
        <Link className="text-primary-strong hover:underline" to={`/runs/${run.id}/dashboard`}>
          仪表盘 →
        </Link>
      </p>
      <div className="mt-4 flex gap-2">
        <Button onClick={() => api.pauseRun(run.id).then(() => setMsg('已请求暂停'))}>
          暂停
        </Button>
        <Button onClick={() => api.resumeRun(run.id).then(() => setMsg('已请求继续'))}>
          继续
        </Button>
        <Button variant="danger" onClick={() => api.cancelRun(run.id).then(() => setMsg('已请求取消'))}>
          取消
        </Button>
      </div>
      {msg && <p className="mt-2 text-sm text-muted">{msg}</p>}
      <DataTable className="mt-6">
        <thead>
          <tr className={dataTableHead}>
            <th className={dataTableHeadCell}>步</th>
            <th className={dataTableHeadCell}>轮</th>
            <th className={dataTableHeadCell}>状态</th>
            <th className={dataTableHeadCell}>错误</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {steps.map((s) => (
            <tr key={`${s.step}-${s.attempt}-${s.id}`} className={dataTableRow}>
              <td className={dataTableCellMono}>{s.step}</td>
              <td className={dataTableCellNum}>{s.attempt}</td>
              <td className={dataTableCell}>
                <span className="inline-flex items-center gap-2">
                  <Badge tone={runStatusTone(s.status)}>{s.status}</Badge>
                  {isInflightStatus(s.status) && <span className="ember-dot bg-accent" aria-hidden="true" />}
                </span>
              </td>
              <td className={`${dataTableCell} text-xs text-danger`}>{s.error ?? ''}</td>
              <td className={dataTableCell}>{!terminal && <span className="text-xs text-faint">…</span>}</td>
            </tr>
          ))}
        </tbody>
      </DataTable>
    </main>
  );
}
