import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { migrate } from '../../src/db/migrate';
import { openDb, type Database } from '../../src/db/open';

const dirs: string[] = [];
function tmpDb(): { db: Database; dir: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkforge-open-'));
  dirs.push(dir);
  return { db: openDb(path.join(dir, 'test.db')), dir };
}

afterEach(() => {
  for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true });
  dirs.length = 0;
});

describe('openDb + migrate', () => {
  it('迁移后 user_version=1、WAL 开启、10 个核心对象存在、幂等', () => {
    const { db } = tmpDb();
    migrate(db);
    expect(db.pragma('user_version', { simple: true })).toBe(1);
    expect(db.pragma('journal_mode', { simple: true })).toBe('wal');
    const names = (
      db.prepare("SELECT name FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%'").all() as Array<{ name: string }>
    ).map((r) => r.name);
    for (const t of [
      'books',
      'characters',
      'chapters',
      'chapter_versions',
      'chapter_summaries',
      'character_states',
      'foreshadowings',
      'style_profiles',
      'app_meta',
      'chapter_fts',
    ]) {
      expect(names).toContain(t);
    }
    expect(() => migrate(db)).not.toThrow();
    expect(db.pragma('user_version', { simple: true })).toBe(1);
    db.close();
  });
});
