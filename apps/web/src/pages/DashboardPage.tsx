import { useState } from 'react';
import { useParams, Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { Badge, Button } from '../components/ui';
import { DataTable, dataTableCell, dataTableCellMono, dataTableCellNum, dataTableRow, dataTableHead, dataTableHeadCell } from '../components/DataTable';
import type { ReportDto } from '@inkforge/shared';

/** 运行仪表盘（DEC-2026-1118-02）：DataTable 化，数字列 tabular-nums；report-table testid 透传。 */
export default function DashboardPage() {
  const { runId = '' } = useParams();
  const { data: report } = useQuery({ queryKey: ['report', runId], queryFn: () => api.getReport(runId), refetchInterval: 5000 });
  const { data: runVersions } = useQuery({ queryKey: ['run-versions', runId], queryFn: () => api.getRunVersions(runId), enabled: !!runId });
  const [expandedVersionId, setExpandedVersionId] = useState('');
  const contentById = new Map((runVersions?.versions ?? []).map((v) => [v.versionId, v]));
  const r: ReportDto | null = report ?? null;

  return (
    <main className="mx-auto max-w-6xl px-8 py-8">
      <Link to={`/runs/${runId}`} className="text-sm text-muted hover:text-ink">
        ← 运行面板
      </Link>
      <h1 className="mt-2 text-xl font-semibold">运行仪表盘</h1>
      {r && (
        <p className="mt-1 text-sm text-muted tabular-nums">
          总耗时 {(r.totals.ms / 1000).toFixed(1)}s · 输入 {r.totals.promptTokens} tok · 输出 {r.totals.completionTokens} tok
        </p>
      )}
      <DataTable className="mt-4" data-testid="report-table">
        <thead>
          <tr className={dataTableHead}>
            <th className={dataTableHeadCell}>章</th>
            <th className={dataTableHeadCell}>步</th>
            <th className={dataTableHeadCell}>轮</th>
            <th className={dataTableHeadCell}>耗时ms</th>
            <th className={dataTableHeadCell}>输出tok</th>
            <th className={dataTableHeadCell}>产物</th>
          </tr>
        </thead>
        <tbody>
          {(r?.chapters ?? []).flatMap((c) =>
            c.steps.flatMap((s, i) => {
              const rowKey = `${c.chapterNo}-${s.step}-${s.attempt}-${i}`;
              const rows = [
                <tr key={rowKey} className={dataTableRow}>
                  <td className={dataTableCellNum}>{i === 0 ? `第${c.chapterNo}章` : ''}</td>
                  <td className={dataTableCellMono}>{s.step}</td>
                  <td className={dataTableCellNum}>{s.attempt}</td>
                  <td className={dataTableCellNum}>{s.ms}</td>
                  <td className={dataTableCellNum}>{s.usage.completionTokens}</td>
                  <td className={dataTableCell}>
                    {s.versionDeleted ? (
                      <Badge tone="muted">版本已删</Badge>
                    ) : s.versionId && contentById.has(s.versionId) ? (
                      <Button size="sm" variant="quiet" onClick={() => setExpandedVersionId((cur) => (cur === s.versionId ? '' : s.versionId!))}>
                        正文
                      </Button>
                    ) : (
                      ''
                    )}
                  </td>
                </tr>,
              ];
              if (s.versionId && !s.versionDeleted && expandedVersionId === s.versionId && contentById.has(s.versionId)) {
                rows.push(
                  <tr key={`${rowKey}-content`}>
                    <td className={dataTableCell} colSpan={6}>
                      <div className="max-h-64 overflow-auto whitespace-pre-wrap text-xs">{contentById.get(s.versionId)!.content}</div>
                    </td>
                  </tr>,
                );
              }
              return rows;
            }),
          )}
        </tbody>
      </DataTable>
    </main>
  );
}
