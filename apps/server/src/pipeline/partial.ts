import type { Database } from '../db/open';

export interface PartialFlusher {
  push(delta: string): void;
  flush(): void;
  discard(): void;
}

/**
 * 流式残稿落盘：按 token 近似（delta.length）或计时阈值 UPSERT partial_outputs；
 * 步成功 → discard()（停表并清行）；步失败/中止 → flush() 留存供抢救。
 */
export function createPartialFlusher(
  db: Database,
  stepId: string,
  opts: { everyTokens?: number; everyMs?: number } = {},
): PartialFlusher {
  const everyTokens = opts.everyTokens ?? 200;
  const everyMs = opts.everyMs ?? 5000;
  let buffer = '';
  let writtenLen = 0;
  let sinceFlush = 0;
  let timer: ReturnType<typeof setInterval> | null = null;

  const write = (content: string) => {
    db.prepare(
      "INSERT INTO partial_outputs(run_step_id, content, updated_at) VALUES(?,?,?) ON CONFLICT(run_step_id) DO UPDATE SET content=excluded.content, updated_at=excluded.updated_at",
    ).run(stepId, content, new Date().toISOString());
  };
  const flush = () => {
    if (buffer.length > writtenLen) {
      write(buffer);
      writtenLen = buffer.length;
    }
    sinceFlush = 0;
  };
  if (everyMs > 0) timer = setInterval(flush, everyMs);

  return {
    push(delta: string) {
      buffer += delta;
      sinceFlush += delta.length;
      if (everyTokens > 0 && sinceFlush >= everyTokens) flush();
    },
    flush,
    discard() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      db.prepare('DELETE FROM partial_outputs WHERE run_step_id = ?').run(stepId);
    },
  };
}
