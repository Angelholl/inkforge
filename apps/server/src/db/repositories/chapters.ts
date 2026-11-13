import { randomUUID } from 'node:crypto';
import { countChars } from '@inkforge/shared';
import type { ChapterBlueprint, ChapterKind, ChapterStatus } from '@inkforge/shared';
import type { Database } from '../open';
import { syncFts } from './fts';

export interface Chapter {
  id: string;
  bookId: string;
  chapterNo: number;
  title: string;
  isOriginal: boolean;
  blueprint: ChapterBlueprint | null;
  targetChars: number;
  status: ChapterStatus;
  currentVersionId?: string;
  createdAt: string;
}

export interface ChapterVersion {
  id: string;
  chapterId: string;
  parentVersionId?: string;
  kind: ChapterKind;
  content: string;
  wordCount: number;
  runId?: string;
  promptHash?: string;
  model?: string;
  params: object;
  styleSampleIds: string[];
  createdAt: string;
}

interface ChapterRow {
  id: string;
  book_id: string;
  chapter_no: number;
  title: string;
  is_original: number;
  blueprint_json: string | null;
  target_chars: number;
  status: string;
  current_version_id: string | null;
  created_at: string;
}

interface VersionRow {
  id: string;
  chapter_id: string;
  parent_version_id: string | null;
  kind: string;
  content: string;
  word_count: number;
  run_id: string | null;
  prompt_hash: string | null;
  model: string | null;
  params_json: string;
  style_sample_ids_json: string;
  created_at: string;
}

function toChapter(r: ChapterRow): Chapter {
  return {
    id: r.id,
    bookId: r.book_id,
    chapterNo: r.chapter_no,
    title: r.title,
    isOriginal: r.is_original === 1,
    blueprint: r.blueprint_json ? (JSON.parse(r.blueprint_json) as ChapterBlueprint) : null,
    targetChars: r.target_chars,
    status: r.status as ChapterStatus,
    currentVersionId: r.current_version_id ?? undefined,
    createdAt: r.created_at,
  };
}

function toVersion(r: VersionRow): ChapterVersion {
  return {
    id: r.id,
    chapterId: r.chapter_id,
    parentVersionId: r.parent_version_id ?? undefined,
    kind: r.kind as ChapterKind,
    content: r.content,
    wordCount: r.word_count,
    runId: r.run_id ?? undefined,
    promptHash: r.prompt_hash ?? undefined,
    model: r.model ?? undefined,
    params: JSON.parse(r.params_json) as object,
    styleSampleIds: JSON.parse(r.style_sample_ids_json) as string[],
    createdAt: r.created_at,
  };
}

export function upsertBlueprint(
  db: Database,
  input: { bookId: string; chapterNo: number; title: string; blueprint: ChapterBlueprint; targetChars?: number },
): Chapter {
  const now = new Date().toISOString();
  const tx = db.transaction(() => {
    const existing = db
      .prepare('SELECT id FROM chapters WHERE book_id = ? AND chapter_no = ?')
      .get(input.bookId, input.chapterNo) as { id: string } | undefined;
    if (existing) {
      db.prepare('UPDATE chapters SET title = ?, blueprint_json = ?, target_chars = ? WHERE id = ?').run(
        input.title,
        JSON.stringify(input.blueprint),
        input.targetChars ?? 3000,
        existing.id,
      );
    } else {
      db.prepare(
        'INSERT INTO chapters(id, book_id, chapter_no, title, blueprint_json, target_chars, created_at) VALUES(?,?,?,?,?,?,?)',
      ).run(randomUUID(), input.bookId, input.chapterNo, input.title, JSON.stringify(input.blueprint), input.targetChars ?? 3000, now);
    }
  });
  tx();
  return getChapter(db, input.bookId, input.chapterNo)!;
}

export function getChapter(db: Database, bookId: string, chapterNo: number): Chapter | undefined {
  const row = db.prepare('SELECT * FROM chapters WHERE book_id = ? AND chapter_no = ?').get(bookId, chapterNo) as ChapterRow | undefined;
  return row ? toChapter(row) : undefined;
}

export function getChapterById(db: Database, chapterId: string): Chapter | undefined {
  const row = db.prepare('SELECT * FROM chapters WHERE id = ?').get(chapterId) as ChapterRow | undefined;
  return row ? toChapter(row) : undefined;
}

export function listChapters(db: Database, bookId: string): Chapter[] {
  return (db.prepare('SELECT * FROM chapters WHERE book_id = ? ORDER BY chapter_no').all(bookId) as ChapterRow[]).map(toChapter);
}

/**
 * 入口 A：原文章节批量导入（零模型调用）。
 * 章号自 max(chapter_no)+1 接续（空书从 1），每章 is_original=1 / status=done /
 * blueprint_json=NULL / target_chars=3000 + kind 'original' 版本 + current 指针 + FTS。
 * 事务包裹，重复导入允许（接续而非覆盖）。
 */
export function importOriginalChapters(
  db: Database,
  input: { bookId: string; chapters: Array<{ title: string; content: string }> },
): { imported: number; firstChapterNo: number; lastChapterNo: number } {
  const tx = db.transaction(() => {
    const row = db.prepare('SELECT MAX(chapter_no) AS maxNo FROM chapters WHERE book_id = ?').get(input.bookId) as { maxNo: number | null };
    const firstChapterNo = (row.maxNo ?? 0) + 1;
    const now = new Date().toISOString();
    let chapterNo = firstChapterNo;
    for (const ch of input.chapters) {
      const chapterId = randomUUID();
      db.prepare(
        "INSERT INTO chapters(id, book_id, chapter_no, title, is_original, blueprint_json, target_chars, status, created_at) VALUES(?,?,?,?,1,NULL,3000,'done',?)",
      ).run(chapterId, input.bookId, chapterNo, ch.title, now);
      const version = appendChapterVersion(db, { chapterId, kind: 'original', content: ch.content });
      setCurrentVersion(db, chapterId, version.id);
      syncFts(db, chapterId, ch.content);
      chapterNo++;
    }
    return { imported: input.chapters.length, firstChapterNo, lastChapterNo: chapterNo - 1 };
  });
  return tx();
}

export function setChapterStatus(db: Database, chapterId: string, status: ChapterStatus): void {
  db.prepare('UPDATE chapters SET status = ? WHERE id = ?').run(status, chapterId);
}

/** insert-only：正文版本永不就地覆盖（DEC-01 ⑦）。 */
export function appendChapterVersion(
  db: Database,
  input: {
    chapterId: string;
    kind: ChapterKind;
    content: string;
    runId?: string;
    promptHash?: string;
    model?: string;
    params?: object;
    parentVersionId?: string;
    styleSampleIds?: string[];
  },
): ChapterVersion {
  const version: ChapterVersion = {
    id: randomUUID(),
    chapterId: input.chapterId,
    parentVersionId: input.parentVersionId,
    kind: input.kind,
    content: input.content,
    wordCount: countChars(input.content),
    runId: input.runId,
    promptHash: input.promptHash,
    model: input.model,
    params: input.params ?? {},
    styleSampleIds: input.styleSampleIds ?? [],
    createdAt: new Date().toISOString(),
  };
  db.prepare(
    'INSERT INTO chapter_versions(id, chapter_id, parent_version_id, kind, content, word_count, run_id, prompt_hash, model, params_json, style_sample_ids_json, created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
  ).run(
    version.id,
    version.chapterId,
    version.parentVersionId ?? null,
    version.kind,
    version.content,
    version.wordCount,
    version.runId ?? null,
    version.promptHash ?? null,
    version.model ?? null,
    JSON.stringify(version.params),
    JSON.stringify(version.styleSampleIds),
    version.createdAt,
  );
  return version;
}

/** 回填版本评审元数据（overall 分等 params 字段），不改 content。 */
export function setVersionParams(db: Database, versionId: string, patch: Record<string, unknown>): void {
  const row = db.prepare('SELECT params_json FROM chapter_versions WHERE id = ?').get(versionId) as { params_json: string };
  const params = { ...(JSON.parse(row.params_json) as object), ...patch };
  db.prepare('UPDATE chapter_versions SET params_json = ? WHERE id = ?').run(JSON.stringify(params), versionId);
}

export function getCurrentVersion(db: Database, chapterId: string): ChapterVersion | undefined {
  const row = db
    .prepare('SELECT v.* FROM chapter_versions v JOIN chapters c ON c.current_version_id = v.id WHERE c.id = ?')
    .get(chapterId) as VersionRow | undefined;
  return row ? toVersion(row) : undefined;
}

export function setCurrentVersion(db: Database, chapterId: string, versionId: string): void {
  db.prepare('UPDATE chapters SET current_version_id = ? WHERE id = ?').run(versionId, chapterId);
}

export function listVersions(db: Database, chapterId: string): ChapterVersion[] {
  // rowid 决胜：同毫秒时间戳下保持插入序（新版本在前）
  return (db.prepare('SELECT * FROM chapter_versions WHERE chapter_id = ? ORDER BY created_at DESC, rowid DESC').all(chapterId) as VersionRow[]).map(toVersion);
}

export function getVersion(db: Database, versionId: string): ChapterVersion | undefined {
  const row = db.prepare('SELECT * FROM chapter_versions WHERE id = ?').get(versionId) as VersionRow | undefined;
  return row ? toVersion(row) : undefined;
}
