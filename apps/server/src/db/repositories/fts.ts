import type { Database } from '../open';

/**
 * FTS5 trigram 同步：先删后插，幂等（每章一行）。
 * trigram 分词最短匹配 3 字：<3 字查询直接返回 []（见 searchChapters）。
 */
export function syncFts(db: Database, chapterId: string, content: string): void {
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM chapter_fts WHERE chapter_id = ?').run(chapterId);
    db.prepare('INSERT INTO chapter_fts(chapter_id, content) VALUES(?, ?)').run(chapterId, content);
  });
  tx();
}

export interface ChapterSearchHit {
  chapterId: string;
  chapterNo: number;
  snippet: string;
}

export function searchChapters(db: Database, bookId: string, query: string): ChapterSearchHit[] {
  if (query.replace(/\s/g, '').length < 3) return []; // trigram 最短 3 字
  try {
    return db
      .prepare(
        `SELECT f.chapter_id AS chapterId, c.chapter_no AS chapterNo,
              snippet(chapter_fts, 1, '[', ']', '…', 12) AS snippet
       FROM chapter_fts f
       JOIN chapters c ON c.id = f.chapter_id
       WHERE chapter_fts MATCH ? AND c.book_id = ?
       ORDER BY c.chapter_no`,
      )
      .all(query, bookId) as ChapterSearchHit[];
  } catch {
    // FTS5 MATCH 语法错误（用户输入引号/操作符等）→ 空结果而非裸 500（audit 2026-11-23 F-2）
    return [];
  }
}
