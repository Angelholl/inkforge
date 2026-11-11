import { useEffect, useRef, useState } from 'react';
import type { RunEvent, RunDto, RunStepDto } from '@inkforge/shared';
import { runEventsUrl } from '../api/client';

export interface RunLiveState {
  run: RunDto | null;
  steps: RunStepDto[];
  connected: boolean;
}

/** SSE 封装：先 snapshot 回放，断连 3s 自动重连。 */
export function useRunEvents(runId: string | null): RunLiveState {
  const [state, setState] = useState<RunLiveState>({ run: null, steps: [], connected: false });
  const esRef = useRef<EventSource | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!runId) return;
    let disposed = false;
    const connect = () => {
      if (disposed) return;
      const es = new EventSource(runEventsUrl(runId));
      esRef.current = es;
      es.addEventListener('snapshot', (e) => {
        const data = JSON.parse((e as MessageEvent).data) as { run: RunDto; steps: RunStepDto[] };
        setState({ run: data.run, steps: data.steps, connected: true });
      });
      const applyEvent = (raw: MessageEvent) => {
        const ev = JSON.parse(raw.data) as RunEvent;
        setState((prev) => {
          if (ev.type === 'run.status') {
            return prev.run ? { ...prev, run: { ...prev.run, status: ev.status } } : prev;
          }
          if (ev.type === 'step.status') {
            const steps = prev.steps.filter((s) => !(s.step === ev.step && s.attempt === ev.attempt && s.chapterId === prev.steps.find((x) => x.step === ev.step)?.chapterId));
            // 以 (step, attempt) 唯一化：同键更新
            const idx = prev.steps.findIndex((s) => s.step === ev.step && s.attempt === ev.attempt);
            const updated = [...prev.steps];
            if (idx >= 0) updated[idx] = { ...updated[idx], status: ev.status };
            else steps.push({ id: `${ev.step}-${ev.attempt}-${ev.ts}`, runId: ev.runId, chapterId: '', step: ev.step, attempt: ev.attempt, status: ev.status });
            void steps;
            return { ...prev, steps: updated };
          }
          return prev;
        });
      };
      es.addEventListener('run.status', applyEvent);
      es.addEventListener('step.status', applyEvent);
      es.onerror = () => {
        setState((prev) => ({ ...prev, connected: false }));
        es.close();
        retryRef.current = setTimeout(connect, 3000);
      };
    };
    connect();
    return () => {
      disposed = true;
      if (retryRef.current) clearTimeout(retryRef.current);
      esRef.current?.close();
    };
  }, [runId]);

  return state;
}
