CREATE TABLE IF NOT EXISTS runs(
  id TEXT PRIMARY KEY, book_id TEXT NOT NULL REFERENCES books(id),
  mode TEXT NOT NULL CHECK(mode IN ('generate','continue')),
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK(status IN ('queued','running','paused','cancelled','done','failed')),
  chapter_scope_json TEXT NOT NULL,
  skip_failures INTEGER NOT NULL DEFAULT 1,
  salvage_partial INTEGER NOT NULL DEFAULT 1,
  max_rounds INTEGER NOT NULL DEFAULT 2,
  created_at TEXT NOT NULL, started_at TEXT, ended_at TEXT, error TEXT);
CREATE TABLE IF NOT EXISTS run_steps(
  id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES runs(id),
  chapter_id TEXT NOT NULL REFERENCES chapters(id),
  step TEXT NOT NULL CHECK(step IN ('draft','qc','rewrite','summarize','finalize')),
  attempt INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK(status IN ('queued','inflight','done','failed','skipped')),
  lease_owner TEXT, heartbeat_at TEXT,
  started_at TEXT, ended_at TEXT, error TEXT,
  output_version_id TEXT, output_json TEXT,
  UNIQUE(run_id, chapter_id, step, attempt));
CREATE TABLE IF NOT EXISTS partial_outputs(
  run_step_id TEXT PRIMARY KEY REFERENCES run_steps(id),
  content TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL);
