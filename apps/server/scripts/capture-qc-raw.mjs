/**
 * D1 raw replay 夹具采集脚本（计划 T-C3，DEC-2026-1113-01）。
 * 用法：node --import tsx --env-file=../../.env scripts/capture-qc-raw.mjs --chapter <N> --out <path> [--pre]
 * --pre  : 修前请求形状（裸 draft、user 尾不接 renderQcTask）
 * 不带   : 修后请求形状（draft 槽【待审正文开始/结束】包裹、user 尾接 renderQcTask）
 * 与 src/quality/l1.ts qcSlots 同构装配：hardRules/draft/blueprint/continuity 四槽，
 * budgets.qc（profile 经 pickBudgetProfile），system=assembled.system，温度 0.2，maxOutput 8192。
 */
import Database from 'better-sqlite3';
import { loadConfig, pickBudgetProfile } from '../src/config';
import { assembleContext } from '../src/context/assembler';
import { renderQcTask, renderHardRules } from '../src/prompts/render';
import fs from 'node:fs';

const args = process.argv.slice(2);
function argValue(flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}
const hasFlag = (flag) => args.includes(flag);

const chapterNo = Number(argValue('--chapter'));
const out = argValue('--out');
const pre = hasFlag('--pre');
const BOOK_ID = '1130c0e1-dddd-47d6-8b28-86e0dd558cce';
const CAPTURE_MODEL_MAX_OUTPUT = 8192;

if (!Number.isInteger(chapterNo) || chapterNo <= 0 || !out) {
  console.error('usage: --chapter <N> --out <path> [--pre]');
  process.exit(2);
}

const config = loadConfig(process.env);
const profile = pickBudgetProfile(config.providers.local.contextWindow);
const b = profile === 'draft8k' ? config.budgets.qc8k : config.budgets.qc;

const db = new Database('data/inkforge.db', { readonly: true });
const row = db
  .prepare(
    `SELECT c.blueprint_json, c.target_chars, c.current_version_id
     FROM chapters c WHERE c.book_id = ? AND c.chapter_no = ?`,
  )
  .get(BOOK_ID, chapterNo);
if (!row || !row.current_version_id) {
  console.error(`chapter ${chapterNo} not found for book ${BOOK_ID}`);
  process.exit(3);
}
const version = db.prepare('SELECT content FROM chapter_versions WHERE id = ?').get(row.current_version_id);
db.close();
if (!version) {
  console.error(`current version missing for chapter ${chapterNo}`);
  process.exit(3);
}

const draft = version.content;
const blueprintText = row.blueprint_json ?? '';
const hardRules = renderHardRules(row.target_chars);

// 与 l1.ts qcSlots 同构（continuity 槽恒 ''）
const slots = [
  { name: 'hardRules', content: hardRules, budgetChars: b.hardRules, stable: true, keep: 'head' },
  pre
    ? { name: 'draft', content: draft, budgetChars: b.draft, stable: false, keep: 'head' }
    : { name: 'draft', content: `【待审正文开始】\n${draft}\n【待审正文结束】`, budgetChars: b.draft, stable: false, keep: 'head' },
  { name: 'blueprint', content: blueprintText, budgetChars: b.blueprint, stable: false, keep: 'head' },
  { name: 'continuity', content: '', budgetChars: b.continuity, stable: false, keep: 'head' },
];
const assembled = assembleContext(slots, config.providers.local.contextWindow - CAPTURE_MODEL_MAX_OUTPUT - 500);
const user = pre ? assembled.user : `${assembled.user}\n\n${renderQcTask()}`;

const base = config.providers.local.baseURL.replace(/\/$/, '');
const body = {
  model: config.providers.local.model,
  max_tokens: CAPTURE_MODEL_MAX_OUTPUT,
  system: assembled.system,
  messages: [{ role: 'user', content: user }],
  temperature: 0.2,
  top_p: 0.9,
};

const started = Date.now();
const res = await fetch(`${base}/messages`, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'x-api-key': config.providers.local.apiKey,
    'anthropic-version': '2023-06-01',
  },
  body: JSON.stringify(body),
  signal: AbortSignal.timeout(900000),
});
if (!res.ok) {
  console.error(`HTTP ${res.status}`);
  process.exit(4);
}
const json = await res.json();
const text = (json.content ?? []).find((c) => c.type === 'text')?.text;
if (typeof text !== 'string') {
  console.error('no text block in response');
  process.exit(5);
}
import path from 'node:path';
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, text, 'utf8');
// 日志只打 URL/章号/字节数，不打 apiKey
console.log(`url=${base}/messages chapter=${chapterNo} pre=${pre} bytes=${Buffer.byteLength(text, 'utf8')} elapsedMs=${Date.now() - started}`);
