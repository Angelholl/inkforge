import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = path.resolve(HERE, '..');
const DATA_DIR = path.resolve(SERVER_DIR, 'data');
const BASE = 'http://127.0.0.1:8787';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const hang = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'hang-run.json'), 'utf8'));

async function getRun() {
  const r = await fetch(`${BASE}/api/runs/${hang.runId}`);
  return r.json();
}

function reportFromDb() {
  const db = new Database(path.join(DATA_DIR, 'inkforge.db'), { readonly: true });
  const steps = db.prepare('SELECT * FROM run_steps WHERE run_id = ? ORDER BY rowid').all(hang.runId);
  const chapters = db.prepare('SELECT * FROM chapters WHERE book_id = ? ORDER BY chapter_no').all(hang.bookId);
  const chById = new Map(chapters.map((c) => [c.id, c]));
  const lines = [];
  let doneCh = 0;
  let needsHuman = 0;
  for (const c of chapters) {
    const chSteps = steps.filter((s) => s.chapter_id === c.id);
    const fin = chSteps.find((s) => s.step === 'finalize' && s.status === 'done');
    if (fin) doneCh++;
    else if (chSteps.some((s) => s.status === 'failed')) needsHuman++;
    lines.push(`第${c.chapter_no}章: status=${c.status} steps=${chSteps.length} ${fin ? '完成' : '未完成'}`);
  }
  db.close();
  return { lines, doneCh, needsHuman, total: chapters.length };
}

async function main() {
  const arg = process.argv[2] ?? '';
  const run = await getRun();
  if (arg !== '--now' && run.status === 'running') {
    console.log(`挂机仍在运行（steps=${run.steps.length}）。等待完成后再晨检；如需立即出当前快照用 --now。`);
    process.exit(0);
  }
  const rep = reportFromDb();
  console.log(`挂机终态: ${run.status}`);
  console.log(rep.lines.join('\n'));
  console.log(`\n判定（钉死）: done ≥${Math.ceil(rep.total * 0.9)}/${rep.total} 且无 failed 未恢复 → PASS；needs_human >2 → PASS+缺陷清单进 0.2`);
  console.log(`实测: done=${rep.doneCh}/${rep.total} needs_human 相关=${rep.needsHuman}`);
  // 导出
  const ex = await fetch(`${BASE}/api/books/${hang.bookId}/export`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  const exported = await ex.json();
  console.log(`导出: ${exported.files?.length ?? 0} 个 md 文件 → data/exports/`);
  // 抽查第 5/20 章
  for (const no of [5, 20]) {
    const f = exported.files?.find((x) => x.startsWith(`${String(no).padStart(3, '0')}`));
    if (f) {
      const content = fs.readFileSync(path.join(DATA_DIR, 'exports', '挂机-试炼之路', f), 'utf8');
      console.log(`\n抽查第${no}章（前 120 字）: ${content.slice(0, 120).replace(/\n/g, ' ')}`);
    }
  }
}

main().catch((e) => {
  console.error('[morning] fatal:', e);
  process.exit(1);
});
