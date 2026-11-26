import fs from 'node:fs';
import path from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import { migrate } from './db/migrate';
import { openDb, type Database } from './db/open';
import { registerRoutes, type RouteState } from './http/routes';
import { failStaleDistillJobs } from './style/distill-job';
import { runQueueLoop } from './worker/queue';
import type { AppConfig } from './config';
import type { LlmProvider } from './llm/types';

export interface BuildAppOptions {
  config?: AppConfig;
  provider?: LlmProvider;
  /** planner 角色注入缝（测试注 mock；缺省走 createRoleProvider(config,'planner')） */
  plannerProvider?: LlmProvider;
  /** summarizer 角色注入缝（风格蒸馏 HTTP 端点测试注 mock；缺省走 createRoleProvider(config,'summarizer')） */
  summarizerProvider?: LlmProvider;
  /** refiner 角色注入缝（设定集精炼 HTTP 端点测试注 mock；缺省走 createRoleProvider(config,'refiner')） */
  refinerProvider?: LlmProvider;
  db?: Database;
  /** true=服务进程内跑并发=1 队列（测试/单进程模式）；生产由 worker 子进程跑 */
  inlineQueue?: boolean;
}

/**
 * 构建 Fastify 应用。无 config/provider/db 时仅挂 health（T00 最小形态）；
 * 齐备时挂全部 REST/SSE 路由（T14）。
 */
export async function buildApp(opts: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.get('/api/health', async () => ({ ok: true, version: '0.2.5' }));
  if (!opts.config || !opts.provider) return app;

  const db = opts.db ?? openDb(path.join(opts.config.dataDir, 'inkforge.db'));
  migrate(db);
  failStaleDistillJobs(db); // 蒸馏 job 是进程内异步：重启即失败，别让轮询端点挂着 running
  const state: RouteState = {
    db,
    config: opts.config,
    provider: opts.provider,
    plannerProvider: opts.plannerProvider,
    summarizerProvider: opts.summarizerProvider,
    refinerProvider: opts.refinerProvider,
    bus: new (await import('node:events')).EventEmitter(),
    runAborts: new Map(),
  };
  await registerRoutes(app, state);
  if (opts.inlineQueue) {
    const queueAbort = new AbortController();
    app.addHook('onClose', async () => queueAbort.abort());
    void runQueueLoop({ db, provider: opts.provider, config: opts.config, emit: () => {} }, queueAbort.signal);
  }
  void fs.existsSync;
  return app;
}
