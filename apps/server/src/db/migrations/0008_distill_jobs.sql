-- 0008：蒸馏后台化（DEC-2026-1116-01 反馈⑤）。distill_jobs=独立 job 状态机（不进 runs 队列、不加 worker）；
-- style_sources=按 source_hash 唯一留存整篇原文，供「重新蒸馏」复用（此前库里只有 hash 与 few-shot 片段，无原文）。
CREATE TABLE IF NOT EXISTS distill_jobs(
  id TEXT PRIMARY KEY, status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','done','failed')),
  progress INTEGER NOT NULL DEFAULT 0, stage TEXT NOT NULL DEFAULT '',
  error TEXT, result_json TEXT,
  base_profile_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS style_sources(
  id TEXT PRIMARY KEY, source_hash TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
  text TEXT NOT NULL, created_at TEXT NOT NULL);
