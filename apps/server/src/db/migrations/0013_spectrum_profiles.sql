-- 0013：人物光谱蒸馏（DEC-2026-1120-09）：光谱档案库 + 书绑定（先例=plot_profiles 0012，无 FK 防悬挂绑定）。
-- ROLE 行协议蒸馏产物存 structure_json（string[]，3-8 条，匿名化人物原型）；NAMES 行仅供程序脱敏校验，不落库。
-- 回滚：DROP TABLE spectrum_profiles; ALTER TABLE books DROP COLUMN spectrum_profile_id;（user_version 不回退，旧代码零影响；SQLite ≥3.35 支持）
CREATE TABLE IF NOT EXISTS spectrum_profiles(
  id TEXT PRIMARY KEY, name TEXT NOT NULL,
  source_path TEXT NOT NULL DEFAULT '', source_hash TEXT NOT NULL DEFAULT '',
  structure_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL);
ALTER TABLE books ADD COLUMN spectrum_profile_id TEXT;
