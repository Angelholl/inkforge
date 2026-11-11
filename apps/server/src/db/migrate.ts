import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Database } from './open';

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

/**
 * 顺序迁移：按文件名序执行 user_version < N 的脚本，每脚本单事务并推进 user_version。幂等。
 */
export function migrate(db: Database): void {
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  const current = (db.pragma('user_version', { simple: true }) as number) ?? 0;
  for (const file of files) {
    const version = Number(file.split('_')[0]);
    if (!(version > current)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    const run = db.transaction(() => {
      db.exec(sql);
      db.pragma(`user_version = ${version}`);
    });
    run();
  }
}
