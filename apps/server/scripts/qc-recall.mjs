/**
 * QC 召回指标脚本（计划 T-E，DEC-2026-1113-01）：对回归语料跑 L0 与 L1 协议解析，输出五行指标。
 * 用法：pnpm --filter @inkforge/server run qc:recall（tsx 直跑，import 走 ../src 与 ../test）。
 * 退出码：recall=9/9 且 FPR=0/5 且 协议解析=3/3 且 合法 findings≥1 → 0；否则 1（stderr 列未达标项）。
 */
import Database from 'better-sqlite3';
import { loadCliches, runL0Checks } from '../src/quality/l0';
import { parseFindings } from '../src/llm/plainproto';
import {
  BOOK_ID,
  DB_PATH,
  L0_BAD,
  L0_GOOD,
  L1_BAD_RAW,
  L1_GOOD_RAW,
} from '../test/quality/regression/corpus';

const cliches = loadCliches('config/quality/cliches.default.txt');

function runSample(sample) {
  return runL0Checks({ ...(sample.cliches === false ? {} : { cliches }), ...sample.input });
}

function draftFor(chapterNo) {
  const db = new Database(DB_PATH, { readonly: true });
  try {
    const row = db
      .prepare('SELECT current_version_id FROM chapters WHERE book_id = ? AND chapter_no = ?')
      .get(BOOK_ID, chapterNo);
    const v = db.prepare('SELECT content FROM chapter_versions WHERE id = ?').get(row.current_version_id);
    return v.content;
  } finally {
    db.close();
  }
}

// L0 recall：坏样本 hardFail 且 expectFail 检查项 fail
const recallMisses = L0_BAD.filter((s) => {
  const r = runSample(s);
  const check = r.checks.find((c) => c.name === s.expectFail);
  return !(r.hardFail && check && check.pass === false);
});
const recall = `${L0_BAD.length - recallMisses.length}/${L0_BAD.length}`;

// L0 FPR：好样本 hardFail 占比
const fprHits = L0_GOOD.filter((s) => runSample(s).hardFail);
const fpr = `${fprHits.length}/${L0_GOOD.length}`;

// L1 协议解析通过：good raw errors 空、overall∈1-10、quote 全⊆对应章 draft
let validFindings = 0;
const protoMisses = [];
L1_GOOD_RAW.forEach(({ chapterNo, raw }, i) => {
  try {
    const parsed = parseFindings(raw);
    const draft = draftFor(chapterNo);
    const quoteOk = parsed.findings.every((f) => draft.includes(f.quote));
    const ok = parsed.errors.length === 0 && parsed.overall !== null && parsed.overall >= 1 && parsed.overall <= 10 && quoteOk;
    if (!ok) protoMisses.push(`l1-good-00${i + 1}（errors=${parsed.errors.length}, overall=${parsed.overall}, quote⊆draft=${quoteOk}）`);
    else validFindings += parsed.findings.length;
  } catch (e) {
    protoMisses.push(`l1-good-00${i + 1} 抛异常: ${e.message}`);
  }
});
const proto = `${L1_GOOD_RAW.length - protoMisses.length}/${L1_GOOD_RAW.length}`;

// L1 坏语料不抛
const badMisses = [];
L1_BAD_RAW.forEach(({ raw }, i) => {
  try {
    parseFindings(raw);
  } catch (e) {
    badMisses.push(`l1-bad-00${i + 1} 抛异常: ${e.message}`);
  }
});
const badOk = `${L1_BAD_RAW.length - badMisses.length}/${L1_BAD_RAW.length}`;

console.log(`L0 recall: ${recall}`);
console.log(`L0 FPR: ${fpr}`);
console.log(`L1 protocol pass: ${proto}`);
console.log(`L1 valid findings: ${validFindings} (>=1)`);
console.log(`L1 bad no-throw: ${badOk}`);

const unmet = [];
if (recall !== `${L0_BAD.length}/${L0_BAD.length}`) unmet.push(`L0 recall ${recall} 不足 ${L0_BAD.length}/${L0_BAD.length}`);
if (fprHits.length !== 0) unmet.push(`L0 FPR ${fpr} 非零`);
if (proto !== '3/3') unmet.push(`L1 协议解析 ${proto} 不足 3/3：${protoMisses.join('；')}`);
if (validFindings < 1) unmet.push('L1 合法 findings=0');
if (badOk !== '3/3') unmet.push(`L1 坏语料 ${badOk} 不足 3/3：${badMisses.join('；')}`);
if (unmet.length > 0) {
  for (const line of unmet) console.error(`未达标: ${line}`);
  process.exit(1);
}
process.exit(0);
