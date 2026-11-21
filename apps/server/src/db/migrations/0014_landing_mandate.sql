ALTER TABLE books ADD COLUMN landing_mandate_json TEXT;
-- 0014：书级落地策略（DEC-2026-1122-01）：books.landing_mandate_json 存 LandingMandate JSON（null=off；off 仅存 {"mode":"off"}）。
-- 回滚：ALTER TABLE books DROP COLUMN landing_mandate_json;（user_version 不回退，旧代码零影响；SQLite ≥3.35 支持）
