-- 0004：书籍剧情大纲列（世界观/人物卡/大纲功能扩展，2026-11-14）
ALTER TABLE books ADD COLUMN outline TEXT NOT NULL DEFAULT '';
