import { useParams, Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import type { ReportDto } from '@inkforge/shared';

export default function DashboardPage() {
  const { runId = '' } = useParams();
  const { data: report } = useQuery({ queryKey: ['report', runId], queryFn: () => api.getReport(runId), refetchInterval: 5000 });
  const r: ReportDto | null = report ?? null;

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <Link to={`/runs/${runId}`} className="text-sm text-muted">
        ← 运行面板
      </Link>
      <h1 className="mt-2 text-2xl font-bold">运行仪表盘</h1>
      {r && (
        <p className="mt-1 text-sm text-muted">
          总耗时 {(r.totals.ms / 1000).toFixed(1)}s · 输入 {r.totals.promptTokens} tok · 输出 {r.totals.completionTokens} tok
        </p>
      )}
      <table className="mt-4 w-full text-left text-sm" data-testid="report-table">
        <thead>
          <tr className="border-b">
            <th className="py-2">章</th>
            <th>步</th>
            <th>轮</th>
            <th>耗时ms</th>
            <th>输出tok</th>
          </tr>
        </thead>
        <tbody>
          {(r?.chapters ?? []).flatMap((c) =>
            c.steps.map((s, i) => (
              <tr key={`${c.chapterNo}-${s.step}-${s.attempt}-${i}`} className="border-b">
                <td className="py-1.5">{i === 0 ? `第${c.chapterNo}章` : ''}</td>
                <td className="font-mono">{s.step}</td>
                <td>{s.attempt}</td>
                <td>{s.ms}</td>
                <td>{s.usage.completionTokens}</td>
              </tr>
            )),
          )}
        </tbody>
      </table>
    </main>
  );
}
