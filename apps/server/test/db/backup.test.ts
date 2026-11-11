import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from '../../src/db/migrate';
import { openDb, type Database } from '../../src/db/open';
import { backupBook } from '../../src/db/backup';
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
});
