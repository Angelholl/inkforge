import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

// ── 参数 ──
const args = process.argv.slice(2);
const getArg = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const runId = getArg('--run');
const dbFile = getArg('--db') ?? path.resolve(process.cwd(), 'data/inkforge.db');

if (!runId) {
  console.error('用法: node scripts/run-report.mjs --run <runId> [--db <path>]');
  process.exit(1);
}
if (!fs.existsSync(dbFile)) {
  console.error(`db 不存在: ${dbFile}`);
  process.exit(1);
}

const db = new Database(dbFile, { readonly: true });
const run = db.prepare('SELECT * FROM runs WHERE id = ?').get(runId);
if (!run) {
  console.error(`run 不存在: ${runId}`);
  process.exit(1);
}
const steps = db.prepare('SELECT * FROM run_steps WHERE run_id = ? ORDER BY rowid').all(runId);
const chapters = db.prepare('SELECT * FROM chapters WHERE book_id = ? ORDER BY chapter_no').all(run.book_id);
const chapterById = new Map(chapters.map((c) => [c.id, c]));

const STEP_TIMES = [];
let totalMs = 0;
let totalTokens = 0;
const perChapter = new Map();
for (const s of steps) {
  const chNo = chapterById.get(s.chapter_id)?.chapter_no ?? '?';
  if (!perChapter.has(chNo)) perChapter.set(chNo, []);
  const ms = s.started_at && s.ended_at ? new Date(s.ended_at) - new Date(s.started_at) : 0;
  let tokens = 0;
  if (s.output_version_id) {
    const v = db.prepare('SELECT params_json FROM chapter_versions WHERE id = ?').get(s.output_version_id);
    if (v) {
      const params = JSON.parse(v.params_json);
      tokens = params?.usage?.completionTokens ?? 0;
    }
  }
  perChapter.get(chNo).push({ step: s.step, attempt: s.attempt, status: s.status, ms, tokens });
  if (s.status === 'done') {
    totalMs += ms;
    totalTokens += tokens;
    STEP_TIMES.push({ step: s.step, ms, tokens });
  }
}

console.log(`run ${runId}  book=${run.book_id}  status=${run.status}  mode=${run.mode}  scope=${run.chapter_scope_json}`);
console.log('章  | 步        | 轮 | 状态     | 耗时ms | tokens | tok/s');
for (const [chNo, list] of [...perChapter.entries()].sort((a, b) => a[0] - b[0])) {
  for (const it of list) {
    const tps = it.ms > 0 && it.tokens > 0 ? (it.tokens / (it.ms / 1000)).toFixed(1) : '-';
    console.log(`${String(chNo).padStart(3)} | ${it.step.padEnd(9)} | ${String(it.attempt).padEnd(2)} | ${it.status.padEnd(8)} | ${String(it.ms).padEnd(6)} | ${String(it.tokens).padEnd(6)} | ${tps}`);
  }
}
const tokPerSec = totalMs > 0 ? (totalTokens / (totalMs / 1000)).toFixed(1) : '-';
console.log(`总计: 耗时 ${totalMs}ms, tokens ${totalTokens}, tok/s ${tokPerSec}`);
const chaptersCount = perChapter.size || 1;
console.log(`预计20章总时长 = ${Math.round((totalMs / chaptersCount) * 20 / 1000 / 60)} 分钟`);
db.close();
