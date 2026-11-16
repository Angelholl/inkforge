import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { Badge, type BadgeTone } from './ui';
import type { VersionQcAttemptDto } from '@inkforge/shared';

const ACTION_TONE: Record<string, BadgeTone> = { pass: 'ok', rewrite: 'warn', needs_human: 'danger' };

function findingTone(severity: string): BadgeTone {
  return severity === 'blocker' ? 'danger' : severity === 'major' ? 'warn' : 'muted';
}

/** 版本质检明细（B3 解释性）：逐轮 gate 判定 + 理由 + L1 findings + L0 未过项。 */
export function VersionQcPanel({ versionId }: { versionId: string }) {
  const { data } = useQuery({
    queryKey: ['version-qc', versionId],
    queryFn: () => api.versionQc(versionId),
    enabled: versionId !== '',
  });
  const attempts: VersionQcAttemptDto[] = Array.isArray(data?.attempts) ? data.attempts : [];
  if (attempts.length === 0) {
    return (
      <p className="mt-3 text-xs text-muted" data-testid="qc-panel-empty">
        仅新运行的版本携带质检明细。
      </p>
    );
  }
  return (
    <section className="mt-3 space-y-3" data-testid="qc-panel">
      {attempts.map((a) => {
        const l1 = a.l1 as { overall?: number; findings?: Array<{ severity: string; dimension: string; quote: string; comment: string }> };
        const l0 = a.l0 as { checks?: Array<{ name: string; pass: boolean; details?: string }> };
        const failed = (l0.checks ?? []).filter((c) => !c.pass);
        return (
          <div key={a.attempt} className="rounded-card border border-line bg-surface px-3 py-2">
            <div className="flex items-center gap-2 text-sm">
              <span className="font-mono text-xs">第{a.attempt}轮</span>
              <Badge tone={ACTION_TONE[a.gate.action] ?? 'muted'}>{a.gate.action}</Badge>
              {typeof l1.overall === 'number' && <span className="text-xs text-muted">OVERALL {l1.overall.toFixed(1)}</span>}
            </div>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-muted">
              {a.gate.reasons.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
            {(l1.findings ?? []).length > 0 && (
              <ul className="mt-2 space-y-1">
                {(l1.findings ?? []).map((f, i) => (
                  <li key={i} className="text-xs">
                    <Badge tone={findingTone(f.severity)}>{f.severity}</Badge>
                    <span className="ml-2 font-medium">{f.dimension}</span>
                    <span className="ml-2 text-muted">「{f.quote}」</span>
                    <span className="ml-2">{f.comment}</span>
                  </li>
                ))}
              </ul>
            )}
            {failed.length > 0 && <p className="mt-2 text-xs text-muted">L0 未过：{failed.map((c) => c.name).join('、')}</p>}
          </div>
        );
      })}
    </section>
  );
}
