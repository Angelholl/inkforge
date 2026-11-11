import fs from 'node:fs';
import path from 'node:path';
import { migrate } from '../db/migrate';
import { openDb } from '../db/open';
import { acquireLock } from '../singleinstance';

/** worker 入口：acquireLock(worker 锁) → openDb+migrate → 写 worker.pid → ready → 循环（T17 接管前空转）。 */
async function main(): Promise<void> {
  const dataDir = process.env.INKFORGE_DATA_DIR ?? 'data';
  const lock = acquireLock(dataDir, 'worker.lock');
  try {
    const db = openDb(path.join(dataDir, 'inkforge.db'));
    migrate(db);
    fs.writeFileSync(path.join(dataDir, 'worker.pid'), String(process.pid));
    if (typeof process.send === 'function') process.send({ type: 'ready' });
    if (process.env.INKFORGE_WORKER_EXIT_ZERO === '1') {
      process.exit(0);
    }
    // T17：workerLoop；当前空转
    for (;;) {
      await new Promise((r) => setTimeout(r, 500));
    }
  } catch (e) {
    console.error('[worker] fatal:', (e as Error).message);
    process.exit(1);
  } finally {
    void lock;
  }
}

void main();
