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

  it('0003 索引 + 0004 outline 列：user_version=13 且迁移物在场；user_version=2 旧库升级数据 intact', () => {
    const dir = tmpDir();
    const db = openDb(path.join(dir, 'inkforge.db'));
    migrate(db);
    expect(db.pragma('user_version', { simple: true })).toBe(14);
    const indexes = (
      db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name IN (?, ?)").all(
        'idx_chapter_versions_chapter',
        'idx_runs_book_created',
      ) as Array<{ name: string }>
    )
      .map((r) => r.name)
      .sort();
    expect(indexes).toEqual(['idx_chapter_versions_chapter', 'idx_runs_book_created']);
    const outlineCol = db.prepare("SELECT name FROM pragma_table_info('books') WHERE name = 'outline'").all();
    expect(outlineCol).toHaveLength(1);
    // 0009：人物下线列
    expect(db.prepare("SELECT name FROM pragma_table_info('characters') WHERE name = 'offline_from_chapter'").all()).toHaveLength(1);

    // 模拟 user_version=2 的旧库（0001+0002 已跑过、有数据）：先移除 0003-0013 全部增量物再造数据，回拨后重迁
    // （ADD COLUMN/CREATE 无 SQL 级幂等，须把 schema 真实还原到 v2 态再升 0003+0004+0005+0006+0007+0008+0009+0010+0011+0012+0013）
    const now = new Date().toISOString();
    db.exec('DROP INDEX IF EXISTS idx_chapter_versions_chapter');
    db.exec('DROP INDEX IF EXISTS idx_runs_book_created');
    db.exec('DROP TABLE IF EXISTS outline_nodes');
    db.exec('DROP TABLE IF EXISTS imitation_profiles');
    db.exec('ALTER TABLE books DROP COLUMN outline');
    db.exec('ALTER TABLE books DROP COLUMN imitation_profile_id');
    db.exec('ALTER TABLE books DROP COLUMN style_snapshot_json');
    db.exec('ALTER TABLE runs DROP COLUMN kind');
    db.exec('DROP TABLE IF EXISTS chapter_version_tombstones');
    db.exec('ALTER TABLE books DROP COLUMN style_fewshot_on');
    db.exec('DROP TABLE IF EXISTS distill_jobs');
    db.exec('DROP TABLE IF EXISTS style_sources');
    db.exec('DROP TABLE IF EXISTS book_style_profiles');
    db.exec('ALTER TABLE characters DROP COLUMN offline_from_chapter');
    db.exec('DROP TABLE IF EXISTS plot_profiles');
    db.exec('ALTER TABLE books DROP COLUMN plot_profile_id');
    db.exec('DROP TABLE IF EXISTS spectrum_profiles');
    db.exec('ALTER TABLE books DROP COLUMN spectrum_profile_id');
    db.exec('ALTER TABLE books DROP COLUMN landing_mandate_json');
    db.prepare("INSERT INTO books(id, title, created_at, updated_at) VALUES('b1','书',?,?)").run(now, now);
    db.prepare("INSERT INTO chapters(id, book_id, chapter_no, created_at) VALUES('c1','b1',1,?)").run(now);
    db.prepare(
      "INSERT INTO chapter_versions(id, chapter_id, kind, content, word_count, created_at) VALUES('v1','c1','draft','正文',2,?)",
    ).run(now);
    db.prepare(
      "INSERT INTO runs(id, book_id, mode, chapter_scope_json, created_at) VALUES('r1','b1','generate','{\"from\":1,\"to\":1}',?)",
    ).run(now);
    const tables = {
      books: 'SELECT id, title, created_at, updated_at FROM books ORDER BY id',
      chapters: 'SELECT id, book_id, chapter_no, created_at FROM chapters ORDER BY id',
      chapter_versions: 'SELECT id, chapter_id, kind, content, word_count, created_at FROM chapter_versions ORDER BY id',
      runs: 'SELECT id, book_id, mode, chapter_scope_json, created_at FROM runs ORDER BY id',
    } as const;
    const snapshot = () =>
      Object.fromEntries(Object.entries(tables).map(([t, sql]) => [t, db.prepare(sql).all()]));
    const before = snapshot();
    db.pragma('user_version = 2');
    migrate(db);
    expect(db.pragma('user_version', { simple: true })).toBe(14);
    expect(snapshot()).toEqual(before);
    expect(db.prepare("SELECT name FROM pragma_table_info('books') WHERE name = 'outline'").all()).toHaveLength(1);

    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('0005 round4 scope：三级蓝图/仿写档案表 + books 两列 + runs.kind 列在场（v4 旧库升级 runs 数据 intact）', () => {
    const dir = tmpDir();
    const db = openDb(path.join(dir, 'inkforge.db'));
    migrate(db);
    expect(db.pragma('user_version', { simple: true })).toBe(14);
    const newTables = (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('outline_nodes','imitation_profiles')").all() as Array<{ name: string }>)
      .map((r) => r.name)
      .sort();
    expect(newTables).toEqual(['imitation_profiles', 'outline_nodes']);
    const bookCols = (db.prepare("SELECT name FROM pragma_table_info('books')").all() as Array<{ name: string }>).map((r) => r.name);
    expect(bookCols).toContain('imitation_profile_id');
    expect(bookCols).toContain('style_snapshot_json');
    const runCols = (db.prepare("SELECT name FROM pragma_table_info('runs')").all() as Array<{ name: string }>).map((r) => r.name);
    expect(runCols).toContain('kind');

    // 模拟 user_version=4 旧库（有 runs 数据）：回拨后重迁，runs.kind 默认值回落、数据 intact
    const now = new Date().toISOString();
    db.exec('DROP TABLE outline_nodes');
    db.exec('DROP TABLE imitation_profiles');
    db.exec('ALTER TABLE books DROP COLUMN imitation_profile_id');
    db.exec('ALTER TABLE books DROP COLUMN style_snapshot_json');
    db.exec('ALTER TABLE runs DROP COLUMN kind');
    db.exec('DROP TABLE IF EXISTS chapter_version_tombstones');
    db.exec('ALTER TABLE books DROP COLUMN style_fewshot_on');
    db.exec('DROP TABLE IF EXISTS distill_jobs');
    db.exec('DROP TABLE IF EXISTS style_sources');
    db.exec('DROP TABLE IF EXISTS book_style_profiles');
    db.exec('ALTER TABLE characters DROP COLUMN offline_from_chapter');
    db.exec('DROP TABLE IF EXISTS plot_profiles');
    db.exec('ALTER TABLE books DROP COLUMN plot_profile_id');
    db.exec('DROP TABLE IF EXISTS spectrum_profiles');
    db.exec('ALTER TABLE books DROP COLUMN spectrum_profile_id');
    db.exec('ALTER TABLE books DROP COLUMN landing_mandate_json');
    db.prepare("INSERT INTO books(id, title, created_at, updated_at) VALUES('b5','书五',?,?)").run(now, now);
    db.prepare(
      "INSERT INTO runs(id, book_id, mode, chapter_scope_json, created_at) VALUES('r5','b5','generate','{\"from\":1,\"to\":1}',?)",
    ).run(now);
    const before = db.prepare('SELECT id, book_id, mode, chapter_scope_json, created_at FROM runs ORDER BY id').all();
    db.pragma('user_version = 4');
    migrate(db);
    expect(db.pragma('user_version', { simple: true })).toBe(14);
    const after = db.prepare('SELECT id, book_id, mode, chapter_scope_json, created_at FROM runs ORDER BY id').all();
    expect(after).toEqual(before);
    expect((db.prepare("SELECT kind FROM runs WHERE id = 'r5'").get() as { kind: string }).kind).toBe('pipeline');

    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('0010 关联表+存量回填：v9 旧库升级，绑定行 is_primary=1 数据 intact', () => {
    const dir = tmpDir();
    const db = openDb(path.join(dir, 'inkforge.db'));
    migrate(db);
    // 模拟 v9 旧库：移除 0010 增量物、造一本已绑风格的书，回拨后重迁验证回填
    const now = new Date().toISOString();
    db.exec('DROP TABLE book_style_profiles');
    db.exec('DROP TABLE IF EXISTS plot_profiles');
    db.exec('ALTER TABLE books DROP COLUMN plot_profile_id');
    db.exec('DROP TABLE IF EXISTS spectrum_profiles');
    db.exec('ALTER TABLE books DROP COLUMN spectrum_profile_id');
    db.exec('ALTER TABLE books DROP COLUMN landing_mandate_json');
    db.prepare("INSERT INTO books(id, title, style_profile_id, created_at, updated_at) VALUES('b10','书十', 'p-legacy', ?, ?)").run(now, now);
    db.pragma('user_version = 9');
    migrate(db);
    expect(db.pragma('user_version', { simple: true })).toBe(14);
    const bound = db.prepare("SELECT profile_id, is_primary, dims_json, weights_json FROM book_style_profiles WHERE book_id = 'b10'").get() as {
      profile_id: string;
      is_primary: number;
      dims_json: string;
      weights_json: string;
    };
    expect(bound).toEqual({ profile_id: 'p-legacy', is_primary: 1, dims_json: '{}', weights_json: '{}' });
    const book = db.prepare("SELECT id, title, style_profile_id, created_at FROM books WHERE id = 'b10'").get() as {
      id: string;
      title: string;
      style_profile_id: string;
      created_at: string;
    };
    expect(book).toEqual({ id: 'b10', title: '书十', style_profile_id: 'p-legacy', created_at: now });

    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('0011 weights 列：v10 旧库升级，存量绑定行 weights_json 存在且=\'{}\'', () => {
    const dir = tmpDir();
    const db = openDb(path.join(dir, 'inkforge.db'));
    migrate(db);
    // 模拟 v10 旧库：book_style_profiles 尚无 weights_json 列（0010 形态）——DROP 后按 0010 列集手工重建再造行
    const now = new Date().toISOString();
    db.exec('DROP TABLE book_style_profiles');
    db.exec(
      "CREATE TABLE book_style_profiles(book_id TEXT NOT NULL REFERENCES books(id), profile_id TEXT NOT NULL, is_primary INTEGER NOT NULL DEFAULT 0, dims_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL, UNIQUE(book_id, profile_id))",
    );
    db.exec('DROP TABLE IF EXISTS plot_profiles');
    db.exec('ALTER TABLE books DROP COLUMN plot_profile_id');
    db.exec('DROP TABLE IF EXISTS spectrum_profiles');
    db.exec('ALTER TABLE books DROP COLUMN spectrum_profile_id');
    db.exec('ALTER TABLE books DROP COLUMN landing_mandate_json');
    db.prepare("INSERT INTO books(id, title, style_profile_id, created_at, updated_at) VALUES('b11','书十一','p-old',?,?)").run(now, now);
    db.prepare("INSERT INTO book_style_profiles(book_id, profile_id, is_primary, dims_json, created_at) VALUES('b11','p-old',1,'{}',?)").run(now);
    db.pragma('user_version = 10');
    migrate(db);
    expect(db.pragma('user_version', { simple: true })).toBe(14);
    expect(db.prepare("SELECT name FROM pragma_table_info('book_style_profiles') WHERE name = 'weights_json'").all()).toHaveLength(1);
    const row = db.prepare("SELECT weights_json FROM book_style_profiles WHERE book_id = 'b11'").get() as { weights_json: string };
    expect(row.weights_json).toBe('{}'); // 存量行由列默认值回填=legacy 口径

    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
