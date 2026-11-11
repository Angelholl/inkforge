import fs from 'node:fs';
import path from 'node:path';
import { migrate } from '../db/migrate';
import { openDb } from '../db/open';
import { acquireLock } from '../singleinstance';
import { takeoverStaleSteps } from '../db/repositories/runs';
import { runQueueLoop } from './queue';

/** worker 入口：acquireLock(worker 锁) → openDb+migrate → 写 worker.pid → ready → 循环（T17 接管前空转）。 */
async function main(): Promise<void> {
  const dataDir = process.env.INKFORGE_DATA_DIR ?? 'data';
  const lock = acquireLock(dataDir, 'worker.lock');
  try {
    const db = openDb(path.join(dataDir, 'inkforge.db'));
    migrate(db);
    const taken = takeoverStaleSteps(db, 30000); // 接管死亡 worker 的 inflight 步
    if (taken > 0) console.log('[worker] takeover stale steps:', taken);
    fs.writeFileSync(path.join(dataDir, 'worker.pid'), String(process.pid));
    if (typeof process.send === 'function') process.send({ type: 'ready' });
    if (process.env.INKFORGE_WORKER_EXIT_ZERO === '1') {
      process.exit(0);
    }
    const { createDefaultMockProvider } = await import('../llm/mock');
    const { createAnthropicProvider } = await import('../llm/anthropic');
    const { loadConfig } = await import('../config');
    const config = loadConfig(process.env);
    const provider = config.mock ? createDefaultMockProvider() : createAnthropicProvider(config.providers.local);
    await runQueueLoop({ db, provider, config, emit: () => {} });
  } catch (e) {
    console.error('[worker] fatal:', (e as Error).message);
    process.exit(1);
  } finally {
    void lock;
  }
}

void main();
