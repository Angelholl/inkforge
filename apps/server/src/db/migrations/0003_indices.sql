-- 回滚：DROP INDEX IF EXISTS idx_chapter_versions_chapter; DROP INDEX IF EXISTS idx_runs_book_created;（user_version 不回退，旧代码零影响）
-- 不建 run_steps/chapters 索引：UNIQUE(run_id,chapter_id,step,attempt) 与 UNIQUE(book_id,chapter_no) 已有隐式索引
CREATE INDEX IF NOT EXISTS idx_chapter_versions_chapter ON chapter_versions(chapter_id, created_at);
CREATE INDEX IF NOT EXISTS idx_runs_book_created ON runs(book_id, created_at);
