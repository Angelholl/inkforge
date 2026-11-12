import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildApp } from './app';
import { loadConfig } from './config';
import { acquireLock, SingleInstanceError } from './singleinstance';
import { spawnWorkerSupervisor, type SupervisorHandle } from './worker/supervisor';
import { createDefaultMockProvider } from './llm/mock';
import { createAnthropicProvider } from './llm/anthropic';

const WORKER_ENTRY = process.env.INKFORGE_WORKER_ENTRY ?? path.join(path.dirname(fileURLToPath(import.meta.url)), 'worker/main.ts');

const port = Number(process.env.INKFORGE_PORT ?? 8787);
let supervisor: SupervisorHandle | null = null;
let lock: { release(): void } | null = null;

async function main(): Promise<void> {
  const config = loadConfig(process.env); // 缺值抛错 → 退出码 1
  try {
    lock = acquireLock(config.dataDir);
  } catch (e) {
    if (e instanceof SingleInstanceError) {
      console.log('another instance holds lock, exiting');
      process.exit(0);
    }
    throw e;
  }
  supervisor = spawnWorkerSupervisor({ entryPath: WORKER_ENTRY, env: process.env });
  const provider = config.mock ? createDefaultMockProvider() : createAnthropicProvider(config.providers.local);
  const app = await buildApp({ config, provider });
  await app.listen({ port, host: '127.0.0.1' });
  console.log(`[inkforge] service on http://127.0.0.1:${port} (mock=${config.mock})`);

  const shutdown = async () => {
    await supervisor?.stop();
    lock?.release();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((e) => {
  console.error('[inkforge] fatal:', (e as Error).message);
  process.exit(1);
});
