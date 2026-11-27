ALTER TABLE characters ADD COLUMN aliases TEXT NOT NULL DEFAULT '[]';
-- 0016：per-book 人物别名（2026-11-27 补摘要未匹配确认批 Q4）：JSON 数组字符串；匹配顺序=精确同名→aliases→未匹配进第五段裁决。
-- 回滚：ALTER TABLE characters DROP COLUMN aliases;（user_version 不回退，旧代码零影响；SQLite ≥3.35 支持）
