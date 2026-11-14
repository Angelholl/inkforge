-- 0005：DEC-2026-1115-04 全轮 DDL 一次到位（三级蓝图/拆解仿写/persona 快照/polish run）
-- 注意：NSIS 模板快照须手工补本文件装卸两段（DEC-2026-1114-05 教训）

-- 三级蓝图：卷(volume)→阶段(stage)→滚动执行卡(card)；parent_id='' 表示顶层卷（repo 层管层级，不设 FK 使 UNIQUE 生效）
CREATE TABLE IF NOT EXISTS outline_nodes(
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES books(id),
  parent_id TEXT NOT NULL DEFAULT '',
  level TEXT NOT NULL CHECK(level IN ('volume','stage','card')),
  seq INTEGER NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  chapter_from INTEGER,
  chapter_to INTEGER,
  created_at TEXT NOT NULL,
  UNIQUE(book_id, parent_id, level, seq)
);
CREATE INDEX IF NOT EXISTS idx_outline_nodes_book ON outline_nodes(book_id);

-- 拆解仿写档案：结构拆解+文风+蓝图反推（style_json 自含七维六轴，不依赖 style_profiles）
CREATE TABLE IF NOT EXISTS imitation_profiles(
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  source_path TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  version INTEGER NOT NULL,
  structure_json TEXT NOT NULL,
  style_json TEXT NOT NULL,
  blueprint_json TEXT NOT NULL,
  metrics_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_imitation_hash ON imitation_profiles(source_hash);

-- 书级扩展：仿写绑定 + persona 快照（绑定档案时复制，后续改档案不影响已绑定书）
ALTER TABLE books ADD COLUMN imitation_profile_id TEXT;
ALTER TABLE books ADD COLUMN style_snapshot_json TEXT;

-- 批量校对 run 标记（不扩 mode CHECK，worker 按 kind 分支）
ALTER TABLE runs ADD COLUMN kind TEXT NOT NULL DEFAULT 'pipeline';
