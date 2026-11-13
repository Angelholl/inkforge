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

  it('0003 索引：user_version=3 且两索引在场；user_version=2 旧库升级数据 intact', () => {
    const dir = tmpDir();
    const db = openDb(path.join(dir, 'inkforge.db'));
    migrate(db);
    expect(db.pragma('user_version', { simple: true })).toBe(3);
    const indexes = (
      db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name IN (?, ?)").all(
        'idx_chapter_versions_chapter',
        'idx_runs_book_created',
      ) as Array<{ name: string }>
    )
      .map((r) => r.name)
      .sort();
    expect(indexes).toEqual(['idx_chapter_versions_chapter', 'idx_runs_book_created']);

    // 模拟 user_version=2 的旧库（0001+0002 已跑过、有数据），再跑 migrate 升级 0003
    const now = new Date().toISOString();
    db.prepare("INSERT INTO books(id, title, created_at, updated_at) VALUES('b1','书',?,?)").run(now, now);
    db.prepare("INSERT INTO chapters(id, book_id, chapter_no, created_at) VALUES('c1','b1',1,?)").run(now);
    db.prepare(
      "INSERT INTO chapter_versions(id, chapter_id, kind, content, word_count, created_at) VALUES('v1','c1','draft','正文',2,?)",
    ).run(now);
    db.prepare(
      "INSERT INTO runs(id, book_id, mode, chapter_scope_json, created_at) VALUES('r1','b1','generate','{\"from\":1,\"to\":1}',?)",
    ).run(now);
    const tables = ['books', 'chapters', 'chapter_versions', 'runs'] as const;
    const snapshot = () =>
      Object.fromEntries(tables.map((t) => [t, db.prepare(`SELECT * FROM ${t} ORDER BY id`).all()]));
    const before = snapshot();
    db.pragma('user_version = 2');
    migrate(db);
    expect(db.pragma('user_version', { simple: true })).toBe(3);
    expect(snapshot()).toEqual(before);

    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
