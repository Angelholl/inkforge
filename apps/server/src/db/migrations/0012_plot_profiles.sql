-- 0012：剧情蒸馏（DEC-2026-1120-03）：剧情档案库 + 书绑定（先例=imitation_profile_id 0005，无 FK 防悬挂绑定）。
-- PLOT 行协议蒸馏产物存 structure_json（string[]，5-10 条）。
-- 回滚：DROP TABLE plot_profiles; ALTER TABLE books DROP COLUMN plot_profile_id;（user_version 不回退，旧代码零影响；SQLite ≥3.35 支持）
CREATE TABLE IF NOT EXISTS plot_profiles(
  id TEXT PRIMARY KEY, name TEXT NOT NULL,
  source_path TEXT NOT NULL DEFAULT '', source_hash TEXT NOT NULL DEFAULT '',
  structure_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL);
ALTER TABLE books ADD COLUMN plot_profile_id TEXT;
