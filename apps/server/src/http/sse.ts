import type { FastifyReply, FastifyRequest } from 'fastify';
import type { RunDto, RunStepDto } from '@inkforge/shared';
import type { RunEvent } from '@inkforge/shared';

export interface SseDeps {
  getSnapshot: (runId: string) => { run: RunDto; steps: RunStepDto[] } | null;
  subscribe: (runId: string, listener: (e: RunEvent) => void) => void;
  unsubscribe: (runId: string, listener: (e: RunEvent) => void) => void;
  pingMs: number;
  deltaThrottleMs: number;
}

/** SSE 进度流：先发 snapshot，再转发 RunEvent；step.delta 每连接节流；定期 : ping。 */
export function handleSse(req: FastifyRequest, reply: FastifyReply, runId: string, deps: SseDeps): void {
  const snapshot = deps.getSnapshot(runId);
  if (!snapshot) {
    reply.code(404).send({ error: 'not found' });
    return;
  }
  reply.hijack();
  const raw = reply.raw;
  raw.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  });
  const send = (payload: string) => raw.write(payload);
  send(`event: snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`);
  // 终态 run 连接即补发终态事件（幂等，供前端收口）
  if (['done', 'cancelled', 'failed'].includes(snapshot.run.status)) {
    send(`event: run.status\ndata: ${JSON.stringify({ type: 'run.status', runId, status: snapshot.run.status, ts: new Date().toISOString() })}\n\n`);
  }
  let lastDeltaAt = 0;
  const listener = (e: RunEvent) => {
    if (e.type === 'step.delta') {
      const t = Date.now();
      if (t - lastDeltaAt < deps.deltaThrottleMs) return;
      lastDeltaAt = t;
    }
    send(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`);
  };
  deps.subscribe(runId, listener);
  const ping = setInterval(() => send(`: ping\n\n`), deps.pingMs);
  const cleanup = () => {
    clearInterval(ping);
    deps.unsubscribe(runId, listener);
  };
  req.raw.on('close', cleanup);
  req.raw.on('error', cleanup);
}
