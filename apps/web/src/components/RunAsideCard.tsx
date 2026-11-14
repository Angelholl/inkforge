import { Link } from 'react-router';
import { useRunEvents } from '../hooks/useRunEvents';
import { Badge, Card, Console, runStatusTone, type ConsoleLine } from './ui';
import type { RunDto, RunStepDto } from '@inkforge/shared';

const ACTIVE = new Set(['queued', 'running', 'paused']);

/** 详情页 aside 运行控制卡（D2）：runs 列表（状态徽标+报表链接）+ 最新 run 的深色控制台（useRunEvents 五分色日志）。 */
export default function RunAsideCard({ runs }: { runs: RunDto[] }) {
  const latest = runs.find((r) => ACTIVE.has(r.status)) ?? runs[0];
  const live = useRunEvents(latest?.id ?? null);
  const lines = consoleLines(live.run?.status, live.steps);

  return (
    <Card className="space-y-3">
      <h2 className="font-semibold">运行</h2>
      <ul className="space-y-1 text-xs">
        {runs.slice(0, 6).map((r) => (
          <li key={r.id} className="flex items-center gap-2">
            <Badge tone={runStatusTone(r.status)}>{r.status}</Badge>
            <span className="font-mono text-faint">{r.id.slice(0, 8)}</span>
            <Link to={`/runs/${r.id}/dashboard`} className="ml-auto text-primary-strong hover:underline">
              报表
            </Link>
          </li>
        ))}
        {runs.length === 0 && <li className="text-faint">尚无运行记录</li>}
      </ul>
      <div>
        <div className="mb-1 flex items-center gap-2 text-xs text-muted">
          控制台
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${live.connected ? 'bg-ok' : 'bg-faint'}`} />
          {latest ? `run ${latest.id.slice(0, 8)}` : '无活动 run'}
        </div>
        <Console lines={lines} className="max-h-72" />
      </div>
    </Card>
  );
}

/** steps → 控制台行（五分色：done=ok inflight=warn failed=error 其余=dim）。 */
function consoleLines(runStatus: string | undefined, steps: RunStepDto[]): ConsoleLine[] {
  const lines: ConsoleLine[] = [];
  if (runStatus) {
    lines.push({
      text: `$ run status: ${runStatus}`,
      tone: runStatus === 'failed' ? 'error' : runStatus === 'done' ? 'ok' : 'warn',
    });
  }
  for (const s of steps) {
    const tone = s.status === 'failed' ? 'error' : s.status === 'done' ? 'ok' : s.status === 'inflight' ? 'warn' : 'dim';
    lines.push({ text: `  step ${s.step} #${s.attempt} → ${s.status}`, tone });
  }
  return lines;
}
