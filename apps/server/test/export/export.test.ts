import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from '../../src/db/migrate';
import { openDb, type Database } from '../../src/db/open';
import { createBook } from '../../src/db/repositories/books';
import { upsertBlueprint, appendChapterVersion, setCurrentVersion } from '../../src/db/repositories/chapters';
import { exportBook } from '../../src/export/export';

let db: Database;
let dir: string;
let outDir: string;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkforge-export-'));
  outDir = path.join(dir, 'exports');
  db = openDb(path.join(dir, 't.db'));
  migrate(db);
  const book = createBook(db, { title: '导出测试' });
  const bp = { goal: 'g', beats: [], mustHaveBeats: [], bannedTopics: [] };
  upsertBlueprint(db, { bookId: book.id, chapterNo: 1, title: 'a/b:c', blueprint: bp });
  upsertBlueprint(db, { bookId: book.id, chapterNo: 2, title: '正常章', blueprint: bp });
  upsertBlueprint(db, { bookId: book.id, chapterNo: 3, title: '无版本章', blueprint: bp });
  const v1 = appendChapterVersion(db, { chapterId: getChapterId(book.id, 1), kind: 'draft', content: '第一章正文内容。' });
  setCurrentVersion(db, getChapterId(book.id, 1), v1.id);
  const v2 = appendChapterVersion(db, { chapterId: getChapterId(book.id, 2), kind: 'draft', content: '第二章正文内容。' });
  setCurrentVersion(db, getChapterId(book.id, 2), v2.id);
  void book;
});

function getChapterId(bookId: string, no: number): string {
  return (db.prepare('SELECT id FROM chapters WHERE book_id=? AND chapter_no=?').get(bookId, no) as { id: string }).id;
}

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

describe('exportBook', () => {
  it('文件名安全化与内容钉死；无版本章跳过', async () => {
    const bookId = (db.prepare('SELECT id FROM books LIMIT 1').get() as { id: string }).id;
    const { files } = await exportBook(db, bookId, outDir);
    expect(files.sort()).toEqual(['001-a_b_c.md', '002-正常章.md']);
    const c1 = fs.readFileSync(path.join(outDir, '001-a_b_c.md'), 'utf8');
    expect(c1).toContain('# 第1章 a/b:c');
    expect(c1).toContain('第一章正文内容。');
    expect(fs.existsSync(path.join(outDir, '003-无版本章.md'))).toBe(false);
  });
});
