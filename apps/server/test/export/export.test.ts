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
  it('文件名安全化与内容钉死（显式 chapters-md）；无版本章跳过', async () => {
    const bookId = (db.prepare('SELECT id FROM books LIMIT 1').get() as { id: string }).id;
    const { files } = await exportBook(db, bookId, outDir, 'chapters-md');
    expect(files.sort()).toEqual(['001-a_b_c.md', '002-正常章.md']);
    const c1 = fs.readFileSync(path.join(outDir, '001-a_b_c.md'), 'utf8');
    expect(c1).toContain('# 第1章 a/b:c');
    expect(c1).toContain('第一章正文内容。');
    expect(fs.existsSync(path.join(outDir, '003-无版本章.md'))).toBe(false);
  });

  it('默认格式=txt（DEC-2026-1118-01）：无 format 出 .txt 且无 # 标题行', async () => {
    const bookId = (db.prepare('SELECT id FROM books LIMIT 1').get() as { id: string }).id;
    const { files } = await exportBook(db, bookId, outDir);
    expect(files.sort()).toEqual(['001-a_b_c.txt', '002-正常章.txt']);
    const c1 = fs.readFileSync(path.join(outDir, '001-a_b_c.txt'), 'utf8');
    expect(c1).toContain('第一章正文内容。');
    expect(c1.startsWith('# ')).toBe(false);
  });
});

describe('exportBook 三格式（C3）', () => {
  it('combined-md：单个全书.md，章节以 --- 间隔', async () => {
    const bookId = (db.prepare('SELECT id FROM books LIMIT 1').get() as { id: string }).id;
    const { files } = await exportBook(db, bookId, outDir, 'combined-md');
    expect(files).toEqual(['全书.md']);
    const all = fs.readFileSync(path.join(outDir, '全书.md'), 'utf8');
    expect(all).toContain('# 第1章 a/b:c');
    expect(all).toContain('第二章正文内容。');
    expect(all).toContain('\n\n---\n\n');
    expect(all.indexOf('第一章正文内容。')).toBeLessThan(all.indexOf('第二章正文内容。'));
  });

  it('txt：分章无 # 标题行；未知格式由路由层拒绝（此处校验导出器接受枚举值）', async () => {
    const bookId = (db.prepare('SELECT id FROM books LIMIT 1').get() as { id: string }).id;
    const { files } = await exportBook(db, bookId, outDir, 'txt');
    expect(files.sort()).toEqual(['001-a_b_c.txt', '002-正常章.txt']);
    const c1 = fs.readFileSync(path.join(outDir, '001-a_b_c.txt'), 'utf8');
    expect(c1).toContain('第一章正文内容。');
    expect(c1.startsWith('# ')).toBe(false);
  });
});
