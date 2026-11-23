ALTER TABLE books ADD COLUMN gen_gate_json TEXT;
-- 0015：生成前融合确认门（规格 proposal-2026-11-23-import-reconcile.md v3.1 §3.5）：books.gen_gate_json 存门状态 JSON（{fingerprint, suppressed, updatedAt}）——触发指纹直通钉 + 「不再提示」书级开关。
-- 回滚：ALTER TABLE books DROP COLUMN gen_gate_json;（user_version 不回退，旧代码零影响；SQLite ≥3.35 支持）
