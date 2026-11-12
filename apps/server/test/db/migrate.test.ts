import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { openDb } from '../../src/db/open';
import { migrate } from '../../src/db/migrate';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'inkforge-mig-'));
}

describe('migrate', () => {
  it('同一新库迁移两次（模拟双进程先后首迁）→ 幂等，user_version 一致', () => {
    const dir = tmpDir();
    const dbPath = path.join(dir, 'inkforge.db');
    const db1 = openDb(dbPath);
    const db2 = openDb(dbPath);
    migrate(db1);
    expect(() => migrate(db2)).not.toThrow(); // 回归：打包态 server/worker 双进程并发首迁，DDL 幂等不再互相炸
    const v1 = db1.pragma('user_version', { simple: true });
    const v2 = db2.pragma('user_version', { simple: true });
    expect(v1).toBe(v2);
    expect(v1).toBeGreaterThan(0);
    db1.close();
    db2.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
