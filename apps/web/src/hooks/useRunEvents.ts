import { useEffect, useRef, useState } from 'react';
import type { RunEvent, RunDto, RunStepDto } from '@inkforge/shared';
import { API_BASE, runEventsUrl } from '../api/client';

export interface RunLiveState {
  run: RunDto | null;
  steps: RunStepDto[];
  connected: boolean;
  /** run 不存在（404，可能已被删书级联清除）：置位后停止重连，页面渲染「运行不存在」降级（DEC-2026-1120 卡②） */
  notFound: boolean;
}

/** SSE 封装：先 snapshot 回放，断连 3s 自动重连；重连前探测 run 是否仍存在，404 则停机降级。 */
export function useRunEvents(runId: string | null): RunLiveState {
  const [state, setState] = useState<RunLiveState>({ run: null, steps: [], connected: false, notFound: false });
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
        setState({ run: data.run, steps: data.steps, connected: true, notFound: false });
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
        // 404 降级（卡②）：EventSource error 不带状态码，重连前先探测 run 详情；
        // 404（删书级联清除）→ 停止重连循环并置 notFound，页面渲染「运行不存在」；其余错误照旧 3s 重连
        void fetch(`${API_BASE}/api/runs/${runId}`)
          .then((r) => {
            if (disposed) return;
            if (r.status === 404) {
              setState((prev) => ({ ...prev, notFound: true }));
              return;
            }
            retryRef.current = setTimeout(connect, 3000);
          })
          .catch(() => {
            if (!disposed) retryRef.current = setTimeout(connect, 3000);
          });
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
