import Fastify, { type FastifyInstance } from 'fastify';

export interface BuildAppOptions {
  config?: unknown;
  provider?: unknown;
}

/**
 * 构建 Fastify 应用。opts 类型在 T01（config）/T14（routes）补实。
 */
export async function buildApp(opts: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.get('/api/health', async () => ({ ok: true, version: '0.1.0' }));
  void opts;
  return app;
}
