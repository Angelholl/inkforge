import fs from 'node:fs';
import { countChars, type ChapterBlueprint } from '@inkforge/shared';
import { parseLandingWordsText } from './landing-words';

interface L0Check {
  name: 'length' | 'cliche' | 'replay_ngram' | 'plagiarism_ngram' | 'beat_coverage' | 'continuity_facts' | 'style_drift' | 'tail_replay' | 'echo_20gram';
  pass: boolean;
  details: string;
}

export interface StyleMetrics {
  medianSentenceLen: number;
  p90SentenceLen: number;
  dialogueRatio: number;
  uniqueCharRatio: number;
}

export interface L0Report {
  checks: L0Check[];
  hardFail: boolean;
  softMajors: number;
  metrics: { charCount: number; replayRatio: number };
  /** 硬禁套话的实际命中句（供重写指令引用） */
  clicheHits: string[];
}

/** 套话表：每行一条 JS 正则 source；`!` 前缀=建议级。 */
export function loadCliches(path: string): { hard: RegExp[]; soft: RegExp[] } {
  const lines = fs.readFileSync(path, 'utf8').split(/\r?\n/).filter((l) => l.trim() !== '');
  const hard: RegExp[] = [];
  const soft: RegExp[] = [];
  for (const line of lines) {
    if (line.startsWith('!')) soft.push(new RegExp(line.slice(1)));
    else hard.push(new RegExp(line));
  }
  return { hard, soft };
}

export interface LandingWords {
  h: string[];
  l: string[];
}

/** 落地分级词表装载（DEC-2026-1120-10）：[H]/[L] 分节词表，每行一词，# 注释与空行跳过。
 *  其它 [X] 分节（如 [调情]）= 识别为节头但不入库：其下行忽略（DEC-2026-1122-01 词表调情档护栏，防被吸进上一节）。
 *  文件缺失/不可读 → 空表：AND 层跳过（fail-open 保守放行）。镜像 loadCliches 先例，无额外警告通道（cliches 亦无）。 */
export function loadLandingWords(path: string): LandingWords {
  try {
    const parsed = parseLandingWordsText(fs.readFileSync(path, 'utf8'));
    return { h: parsed.h, l: parsed.l };
  } catch {
    return { h: [], l: [] };
  }
}

function ngramSet(text: string, n: number): Set<string> {
  const clean = text.replace(/\s/g, '');
  const set = new Set<string>();
  for (let i = 0; i + n <= clean.length; i++) set.add(clean.slice(i, i + n));
  return set;
}

function ngrams(text: string, n: number): string[] {
  const clean = text.replace(/\s/g, '');
  const out: string[] = [];
  for (let i = 0; i + n <= clean.length; i++) out.push(clean.slice(i, i + n));
  return out;
}

/** 全文 20-gram 交集（⇔ 最长公共子串 ≥20 字）：返回命中与首个命中的去空白 draft 下标。 */
function echo20gram(draft: string, prevTexts: string[]): { hits: string[]; offset: number; cleanLen: number } {
  const clean = draft.replace(/\s/g, '');
  const draftGrams = new Set(ngrams(draft, 20));
  const prevGrams = new Set<string>();
  for (const t of prevTexts) for (const g of ngrams(t, 20)) prevGrams.add(g);
  const hits = [...draftGrams].filter((g) => prevGrams.has(g));
  const offset = hits.length > 0 ? clean.indexOf(hits[0]) : 0;
  return { hits, offset, cleanLen: clean.length };
}

/** 与前文相比的 8-gram 重合率（占当前 draft 的 8-gram 比例）。 */
function replayRatio(draft: string, prevTexts: string[], n = 8): number {
  const grams = ngramSet(draft, n);
  if (grams.size === 0) return 0;
  const prev = new Set<string>();
  for (const t of prevTexts) for (const g of ngramSet(t, n)) prev.add(g);
  let hit = 0;
  for (const g of grams) if (prev.has(g)) hit++;
  return hit / grams.size;
}

/** 章尾 200 字复演率：draft 与各 prev 各取去空白后末 200 字，n=8 ngram 集合重合率（占 draft 尾段）。 */
function tailReplayRatio(draft: string, prevTexts: string[], n = 8, tail = 200): number {
  const tailOf = (t: string) => t.replace(/\s/g, '').slice(-tail);
  const grams = ngramSet(tailOf(draft), n);
  if (grams.size === 0) return 0;
  const prev = new Set<string>();
  for (const t of prevTexts) for (const g of ngramSet(tailOf(t), n)) prev.add(g);
  let hit = 0;
  for (const g of grams) if (prev.has(g)) hit++;
  return hit / grams.size;
}

/** ≥15 连续字抄用检测（对 few-shot/参考文本）。 */
function hasLongCopy(draft: string, references: string[], minLen = 15): boolean {
  const clean = draft.replace(/\s/g, '');
  for (const ref of references) {
    const rc = ref.replace(/\s/g, '');
    for (let i = 0; i + minLen <= rc.length; i++) {
      if (clean.includes(rc.slice(i, i + minLen))) return true;
    }
  }
  return false;
}

export function runL0Checks(input: {
  draft: string;
  targetChars: number;
  prevTexts: string[];
  blueprint: ChapterBlueprint;
  continuity: { characters: Array<{ name: string; state: object }> };
  referenceTexts?: string[];
  voiceRefMetrics?: StyleMetrics;
  cliches?: { hard: RegExp[]; soft: RegExp[] };
  landingWords?: LandingWords;
}): L0Report {
  const checks: L0Check[] = [];
  let softMajors = 0;

  // 1. length ±20%
  const charCount = countChars(input.draft);
  const band = input.targetChars * 0.2;
  const lengthPass = Math.abs(charCount - input.targetChars) <= band;
  checks.push({ name: 'length', pass: lengthPass, details: `charCount=${charCount} target=${input.targetChars} band=±${band}` });

  // 2. cliche：硬禁命中 fail；建议级命中仅记 details
  const clicheHits: string[] = [];
  if (input.cliches) {
    const hardHits: string[] = [];
    const softHits: string[] = [];
    for (const re of input.cliches.hard) {
      for (const m of input.draft.match(new RegExp(re.source, 'g')) ?? []) {
        if (!hardHits.includes(m)) hardHits.push(m);
      }
    }
    for (const re of input.cliches.soft) {
      const m = re.exec(input.draft);
      if (m && !softHits.includes(m[0])) softHits.push(m[0]);
    }
    clicheHits.push(...hardHits);
    checks.push({
      name: 'cliche',
      pass: hardHits.length === 0,
      details: `硬禁命中: [${hardHits.join(' | ')}]；建议级命中: [${softHits.join(' | ')}]`,
    });
  }

  // 3. replay n=8 阈值 0.35
  const ratio = replayRatio(input.draft, input.prevTexts);
  checks.push({ name: 'replay_ngram', pass: ratio < 0.35 || input.prevTexts.length === 0, details: `replayRatio=${ratio.toFixed(3)} (n=8, 阈值 0.35)` });

  // 3b. tail_replay：章尾 200 字复演 n=8 阈值 0.20（硬失败，拦章尾集中复现）
  const tailRatio = tailReplayRatio(input.draft, input.prevTexts);
  checks.push({ name: 'tail_replay', pass: input.prevTexts.length === 0 || tailRatio < 0.20, details: `tailRatio=${tailRatio.toFixed(3)} (n=8, tail=200字, 阈值 0.20)` });

  // 3c. echo_20gram：全文 20-gram 交集（硬失败，补 replay/tail 双盲区）
  const echo = echo20gram(input.draft, input.prevTexts);
  checks.push({
    name: 'echo_20gram',
    pass: input.prevTexts.length === 0 || echo.hits.length === 0,
    details: `echoHits=${echo.hits.length} (n=20); 首命中 draft offset=${echo.offset}（≈${((echo.offset / echo.cleanLen) * 100).toFixed(1)}% 处）; 示例「${echo.hits[0] ?? ''}」`,
  });

  // 4. plagiarism ≥15 连续字命中 few-shot/参考
  const copied = input.referenceTexts ? hasLongCopy(input.draft, input.referenceTexts) : false;
  checks.push({ name: 'plagiarism_ngram', pass: !copied, details: copied ? '发现 ≥15 连续字与参考文本重合' : '无 ≥15 连续字重合' });

  // 5. beat_coverage：keywords 至少一个出现（OR 层）；条目带 grade 时追加分级词表 AND 层（DEC-2026-1120-10）：
  //    H 级判定=L词∪H词（L 完成⊂H 场景）、L 级=L词；词表缺失/空 → AND 层跳过（fail-open）；无 grade 条目=旧行为零改动
  const lw = input.landingWords;
  const wordsEmpty = !lw || (lw.h.length === 0 && lw.l.length === 0);
  const wordHit = (grade: 'H' | 'L'): boolean => {
    if (wordsEmpty) return true;
    const pool = grade === 'H' ? [...lw.h, ...lw.l] : lw.l;
    return pool.some((w) => input.draft.includes(w));
  };
  const missed = input.blueprint.mustHaveBeats.filter((m) => {
    if (m.source === 'mandate' && m.keywords.length === 0) {
      if (wordsEmpty) return false; // 词表缺失 fail-open 同旧（wordHit 早退放行）
      const lHits = lw!.l.filter((w) => input.draft.includes(w));
      if (m.grade === 'H') return !(lw!.h.some((w) => input.draft.includes(w)) || lHits.length >= 2); // 最小牙：≥1 H 词或 ≥2 不同 L 词
      return lHits.length === 0; // L：≥1 L 词
    }
    // 卡源/旧条目：旧回调体逐字保留
    return !m.keywords.some((k) => input.draft.includes(k)) || (m.grade !== undefined && !wordHit(m.grade));
  });
  checks.push({ name: 'beat_coverage', pass: missed.length === 0, details: missed.length === 0 ? '必含节拍全覆盖' : `缺失: ${missed.map((m) => m.source === 'mandate' ? `${m.text}（书级${m.grade}未达·落地策略）` : m.text).join('、')}` });

  // 6. continuity_facts：deceased/absent 角色不得出现
  const ghosts = input.continuity.characters
    .filter((c) => (c.state as Record<string, unknown>).deceased === true || (c.state as Record<string, unknown>).absent === true)
    .map((c) => c.name)
    .filter((name) => input.draft.includes(name));
  checks.push({ name: 'continuity_facts', pass: ghosts.length === 0, details: ghosts.length === 0 ? '无已故/离场角色现身' : `已故/离场角色出现: ${ghosts.join('、')}` });

  // 7. style_drift（T32 接线；voiceRefMetrics 存在才启用）
  if (input.voiceRefMetrics) {
    const drift = checkStyleDrift(input.draft, input.voiceRefMetrics);
    softMajors += drift.overBandItems;
    checks.push({ name: 'style_drift', pass: drift.overBandItems === 0, details: drift.details });
  }

  const hardFail = checks.some((c) => !c.pass && ['length', 'cliche', 'replay_ngram', 'tail_replay', 'echo_20gram', 'plagiarism_ngram', 'beat_coverage', 'continuity_facts'].includes(c.name));
  return { checks, hardFail, softMajors, metrics: { charCount, replayRatio: ratio }, clicheHits };
}

function checkStyleDrift(draft: string, ref: StyleMetrics): { overBandItems: number; details: string } {
  // 句切分 /[。！？；\n]+/；dialogueRatio=引号内字符数/countChars；uniqueCharRatio 同 T32 口径
  const sentences = draft.split(/[。！？；\n]+/).filter((s) => s.trim() !== '');
  const lens = sentences.map((s) => s.length).sort((a, b) => a - b);
  const median = lens.length === 0 ? 0 : lens[Math.floor(lens.length / 2)];
  const inQuotes = [...draft.matchAll(/[“"]([^”"]*)[”"]/g)].reduce((acc, m) => acc + m[1].length, 0);
  const dialogueRatio = charCountOf(draft) === 0 ? 0 : inQuotes / charCountOf(draft);
  const unique = new Set(draft.replace(/\s/g, '')).size;
  const uniqueCharRatio = charCountOf(draft) === 0 ? 0 : unique / charCountOf(draft);
  const items: string[] = [];
  const check = (name: string, cur: number, base: number) => {
    if (base === 0) return;
    if (Math.abs(cur - base) / base > 0.4) items.push(`${name}(cur=${cur.toFixed(2)}, base=${base.toFixed(2)})`);
  };
  check('句长中位数', median, ref.medianSentenceLen);
  check('对话比', dialogueRatio, ref.dialogueRatio);
  check('去重字符比', uniqueCharRatio, ref.uniqueCharRatio);
  return { overBandItems: items.length, details: items.length === 0 ? '风格带内' : `超带: ${items.join('; ')}（每项记 1 softMajor）` };
}

function charCountOf(s: string): number {
  return countChars(s);
}
