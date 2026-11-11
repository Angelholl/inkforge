CREATE TABLE books(
  id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
  style_profile_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE characters(
  id TEXT PRIMARY KEY, book_id TEXT NOT NULL REFERENCES books(id),
  name TEXT NOT NULL, base_setting TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL,
  UNIQUE(book_id, name));
CREATE TABLE chapters(
  id TEXT PRIMARY KEY, book_id TEXT NOT NULL REFERENCES books(id),
  chapter_no INTEGER NOT NULL, title TEXT NOT NULL DEFAULT '',
  is_original INTEGER NOT NULL DEFAULT 0,
  blueprint_json TEXT, target_chars INTEGER NOT NULL DEFAULT 3000,
  status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','drafting','in_qc','needs_human','done')),
  current_version_id TEXT, created_at TEXT NOT NULL,
  UNIQUE(book_id, chapter_no));
CREATE TABLE chapter_versions(
  id TEXT PRIMARY KEY, chapter_id TEXT NOT NULL REFERENCES chapters(id),
  parent_version_id TEXT,
  kind TEXT NOT NULL CHECK(kind IN ('original','draft','revised','final','manual_edit')),
  content TEXT NOT NULL, word_count INTEGER NOT NULL,
  run_id TEXT, prompt_hash TEXT, model TEXT,
  params_json TEXT NOT NULL DEFAULT '{}',
  style_sample_ids_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL);
CREATE TABLE chapter_summaries(
  id TEXT PRIMARY KEY, book_id TEXT NOT NULL, chapter_no INTEGER NOT NULL,
  summary TEXT NOT NULL, beats_json TEXT NOT NULL DEFAULT '[]',
  open_threads_json TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL,
  UNIQUE(book_id, chapter_no));
CREATE TABLE character_states(
  id TEXT PRIMARY KEY, character_id TEXT NOT NULL REFERENCES characters(id),
  chapter_no INTEGER NOT NULL, state_json TEXT NOT NULL, created_at TEXT NOT NULL,
  UNIQUE(character_id, chapter_no));
CREATE TABLE foreshadowings(
  id TEXT PRIMARY KEY, book_id TEXT NOT NULL, description TEXT NOT NULL,
  planted_ch INTEGER NOT NULL, advanced_json TEXT NOT NULL DEFAULT '[]',
  resolved_ch INTEGER,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','advanced','resolved')),
  created_at TEXT NOT NULL);
CREATE TABLE style_profiles(
  id TEXT PRIMARY KEY, name TEXT NOT NULL, source_path TEXT NOT NULL,
  source_hash TEXT NOT NULL, version INTEGER NOT NULL,
  rules_json TEXT NOT NULL, samples_json TEXT NOT NULL,
  metrics_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL);
CREATE TABLE app_meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE VIRTUAL TABLE chapter_fts USING fts5(chapter_id UNINDEXED, content, tokenize='trigram');
