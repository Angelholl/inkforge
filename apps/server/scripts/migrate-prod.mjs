// 生产库实迁脚本：running 门 → VACUUM INTO 副本预演 → 实迁（DEC-2026-1113-05，0.2-T02b）
// 用法：node --import tsx scripts/migrate-prod.mjs （cwd=apps/server，一次性独立进程）
import Database from 'better-sqlite3';
import { readFileSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const prodPath = join(here, '..', 'data', 'inkforge.db');
const copyPath = join(here, '..', 'data', `inkforge.migrate-preview-${process.pid}.tmp.db`);

const prod = new Database(prodPath);
prod.pragma('busy_timeout = 5000');
try {
  // ① running 门
  const active = prod
    .prepare("SELECT id FROM runs WHERE status IN ('queued','running')")
    .all();
  if (active.length > 0) {
    console.error('running/queued runs 存在，实迁中止：', active.map((r) => r.id).join(','));
    process.exit(2);
  }

  // ② 副本预演
  prod.exec(`VACUUM INTO '${copyPath.replace(/'/g, "''")}'`);
  const copy = new Database(copyPath);
  try {
    copy.pragma('busy_timeout = 5000');
    const { migrate } = await import('../src/db/migrate.ts');
    migrate(copy);
    const uv = copy.pragma('user_version', { simple: true });
    if (uv !== 3) {
      console.error(`副本预演 user_version=${uv} !== 3`);
      process.exit(3);
    }
    const counts = (db) =>
      ['books', 'chapters', 'chapter_versions', 'run_steps'].map((t) =>
        db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n,
      );
    const before = counts(prod);
    const after = counts(copy);
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      console.error(`副本预演计数漂移 prod=${before} copy=${after}`);
      process.exit(3);
    }
  } finally {
    copy.close();
  }
  unlinkSync(copyPath);

  // ③ 实迁（锁冲突重试一次）
  let migrated = false;
  for (let attempt = 0; attempt < 2 && !migrated; attempt++) {
    try {
      const { migrate } = await import('../src/db/migrate.ts');
      migrate(prod);
      migrated = true;
    } catch (err) {
      if (attempt === 1) throw err;
      console.error('锁冲突，重试一次：', err.message);
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  const uv = prod.pragma('user_version', { simple: true });
  const idx = prod
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='index' AND name IN ('idx_chapter_versions_chapter','idx_runs_book_created') ORDER BY name",
    )
    .all()
    .map((r) => r.name);
  console.log(`uv=${uv} indexes=${idx.join(',')}`);
  if (uv !== 3 || idx.length !== 2) process.exit(4);
  console.log('MIGRATE-PROD-OK');
} finally {
  prod.close();
}
