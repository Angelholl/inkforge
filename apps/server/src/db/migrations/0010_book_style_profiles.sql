-- 0010：风格多选维度级拼装（DEC-2026-1117-04）：book_style_profiles 关联表（引用真相）
-- books.style_profile_id 保留为主风格镜像；dims_json '{}' = 七维全归主。
-- 回滚：DROP TABLE IF EXISTS book_style_profiles; DROP INDEX IF EXISTS idx_book_style_profiles_book; DROP INDEX IF EXISTS idx_book_style_profiles_profile; DROP INDEX IF EXISTS ux_book_style_profiles_primary;（user_version 不回退，旧代码零影响）
CREATE TABLE IF NOT EXISTS book_style_profiles(
  book_id TEXT NOT NULL REFERENCES books(id),
  profile_id TEXT NOT NULL,
  is_primary INTEGER NOT NULL DEFAULT 0,
  dims_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  UNIQUE(book_id, profile_id)
);
CREATE INDEX IF NOT EXISTS idx_book_style_profiles_book ON book_style_profiles(book_id);
CREATE INDEX IF NOT EXISTS idx_book_style_profiles_profile ON book_style_profiles(profile_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_book_style_profiles_primary ON book_style_profiles(book_id) WHERE is_primary=1;
INSERT OR IGNORE INTO book_style_profiles(book_id, profile_id, is_primary, dims_json, created_at)
  SELECT id, style_profile_id, 1, '{}', created_at FROM books WHERE style_profile_id IS NOT NULL;
