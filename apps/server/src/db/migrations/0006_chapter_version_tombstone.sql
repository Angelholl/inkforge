-- B2 裁决①（DEC-2026-1116-01）：章节版本硬删留痕。墓碑只留元数据，不存正文。
-- 无外键：删书时由 books.ts deleteBook 显式清孤儿墓碑。
CREATE TABLE IF NOT EXISTS chapter_version_tombstones(
  id TEXT PRIMARY KEY,
  chapter_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  run_id TEXT,
  word_count INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  deleted_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tombstones_chapter ON chapter_version_tombstones(chapter_id);
