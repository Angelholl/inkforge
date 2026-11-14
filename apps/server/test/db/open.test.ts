import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { migrate } from '../../src/db/migrate';
import { openDb, type Database } from '../../src/db/open';

const dirs: string[] = [];
const opened: Database[] = [];
function tmpDb(): { db: Database; dir: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkforge-open-'));
  dirs.push(dir);
  const db = openDb(path.join(dir, 'test.db'));
  opened.push(db);
  return { db, dir };
}

afterEach(() => {
  for (const db of opened) {
    try {
      db.close();
    } catch {
      /* 已关闭则忽略 */
    }
  }
  opened.length = 0;
  for (const dir of dirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* Windows 文件锁瞬态：tmp 目录交给系统清理 */
    }
  }
  dirs.length = 0;
});

describe('openDb + migrate', () => {
  it('迁移后 user_version=5、WAL 开启、12 个核心对象存在、幂等', () => {
    const { db } = tmpDb();
    migrate(db);
    expect(db.pragma('user_version', { simple: true })).toBe(5);
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
      'outline_nodes',
      'imitation_profiles',
    ]) {
      expect(names).toContain(t);
    }
    expect(() => migrate(db)).not.toThrow();
    expect(db.pragma('user_version', { simple: true })).toBe(5);
    db.close();
  });

  it('迁移 0002：run_steps 唯一约束与 partial_outputs UPSERT 幂等', () => {
    const { db } = tmpDb();
    migrate(db);
    expect(db.pragma('user_version', { simple: true })).toBe(5);
    const now = new Date().toISOString();
    db.prepare(
      "INSERT INTO books(id, title, created_at, updated_at) VALUES('b1','书',?,?)",
    ).run(now, now);
    db.prepare(
      "INSERT INTO chapters(id, book_id, chapter_no, created_at) VALUES('c1','b1',1,?)",
    ).run(now);
    db.prepare(
      "INSERT INTO runs(id, book_id, mode, chapter_scope_json, created_at) VALUES('r1','b1','generate','{\"from\":1,\"to\":1}',?)",
    ).run(now);
    const insertStep = db.prepare(
      "INSERT INTO run_steps(id, run_id, chapter_id, step, attempt) VALUES('s1','r1','c1','draft',1)",
    );
    insertStep.run();
    expect(() => insertStep.run()).toThrowError(/UNIQUE constraint failed/);
    const upsert = db.prepare(
      "INSERT INTO partial_outputs(run_step_id, content, updated_at) VALUES('s1','A',?) ON CONFLICT(run_step_id) DO UPDATE SET content=excluded.content, updated_at=excluded.updated_at",
    );
    upsert.run(now);
    upsert.run(now);
    const rows = db.prepare('SELECT content, COUNT(*) AS n FROM partial_outputs GROUP BY run_step_id').all() as Array<{
      content: string;
      n: number;
    }>;
    expect(rows).toEqual([{ content: 'A', n: 1 }]);
    db.close();
  });
});
