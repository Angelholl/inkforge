import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from '../../src/db/migrate';
import { openDb, type Database } from '../../src/db/open';
import { backupBook, backupBookPredelete } from '../../src/db/backup';
import { createBook } from '../../src/db/repositories/books';

let db: Database;
let dir: string;
let bookId: string;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkforge-bak-'));
  db = openDb(path.join(dir, 'main.db'));
  migrate(db);
  bookId = createBook(db, { title: '备份测试书' }).id;
});

afterAll(() => {
  try {
    db.close();
  } catch {
    /* ignore */
  }
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

describe('backupBook', () => {
  it('连续 6 次 → 目录仅 5 份且最旧被删；备份可打开且含 books 行', () => {
    const backupDir = path.join(dir, 'backups', bookId);
    const files: string[] = [];
    for (let i = 0; i < 6; i++) {
      files.push(backupBook(db, bookId, backupDir));
    }
    const listed = fs.readdirSync(backupDir).filter((f) => f.endsWith('.db'));
    expect(listed.length).toBe(5);
    expect(listed).not.toContain(path.basename(files[0])); // 最旧被删
    const bak = openDb(path.join(backupDir, listed[0]));
    const books = bak.prepare('SELECT COUNT(*) AS n FROM books').get() as { n: number };
    expect(books.n).toBe(1);
    bak.close();
  });

  it('plain 与 predelete 两家族同目录互不 prune（各留各的 retain）', () => {
    const backupDir = path.join(dir, 'backups-mixed', bookId);
    for (let i = 0; i < 4; i++) backupBookPredelete(db, bookId, backupDir, 3);
    for (let i = 0; i < 2; i++) backupBook(db, bookId, backupDir, 5);
    const listed = fs.readdirSync(backupDir).filter((f) => f.endsWith('.db'));
    expect(listed.filter((f) => f.includes('-predelete-'))).toHaveLength(3); // 4 份 → prune 到 3
    expect(listed.filter((f) => !f.includes('-predelete-'))).toHaveLength(2); // 不被 predelete prune 误伤
    backupBook(db, bookId, backupDir, 5);
    expect(fs.readdirSync(backupDir).filter((f) => f.includes('-predelete-'))).toHaveLength(3); // 反向也不误伤
  });
});
