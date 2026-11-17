-- 0011：融合比例（DEC-2026-1117-05）：book_style_profiles 每行 weights_json（全行同值，先例=0010 dims_json）。
-- '{}' = legacy（无比例，按贡献维数计权）；非空 = Record<profileId,整数≥1> 且 Σ=100（服务端 zod 保证）。
-- 回滚：ALTER TABLE book_style_profiles DROP COLUMN weights_json;（user_version 不回退，旧代码零影响；SQLite ≥3.35 支持）
ALTER TABLE book_style_profiles ADD COLUMN weights_json TEXT NOT NULL DEFAULT '{}';
