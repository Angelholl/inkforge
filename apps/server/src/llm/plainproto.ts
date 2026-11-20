import type { ChapterBlueprint, Finding, OutlineCardDto, OutlineStageDto, StyleTermDto, OutlineTreeDto, OutlineVolumeDto } from '@inkforge/shared';
import { STYLE_AXES, STYLE_DIMENSIONS } from '@inkforge/shared';

const KEYS = ['SEVERITY', 'DIMENSION', 'QUOTE', 'COMMENT'] as const;
const SEVERITIES = new Set(['blocker', 'major', 'minor']);

export interface ParsedFindings {
  findings: Finding[];
  overall: number | null;
  errors: string[];
}

/** 分隔符纯文本 findings 解析（iq3_xxs JSON 遵循不可靠，DEC-01 ④）。容忍 CRLF 与多余空行。 */
export function parseFindings(raw: string): ParsedFindings {
  const errors: string[] = [];
  const text = raw
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('```'))
    .join('\n');
  let overall: number | null = null;
  let overallSeen = false;

  const blocks: string[][] = [[]];
  for (const line of text.split('\n')) {
    if (line.trim() === '---') {
      blocks.push([]);
    } else {
      blocks[blocks.length - 1].push(line);
    }
  }

  const findings: Finding[] = [];
  for (const lines of blocks) {
    const fields = new Map<string, string>();
    for (const line of lines) {
      const m = /^([A-Z]+)\s*[:：]\s*(.*)$/.exec(line);
      if (m && (KEYS as readonly string[]).includes(m[1]) || (m && m[1] === 'OVERALL')) {
        fields.set(m[1], m[2].trim());
      }
    }
    const ov = fields.get('OVERALL');
    if (ov !== undefined) {
      overallSeen = true;
      const m = /(\d+)/.exec(ov);
      const n = m ? Number(m[1]) : NaN;
      if (Number.isInteger(n) && n >= 1 && n <= 10) overall = n;
      else errors.push(`OVERALL 非法: ${ov}`);
      continue;
    }
    const missing = KEYS.filter((k) => !fields.has(k));
    if (missing.length > 0) {
      if (lines.some((l) => l.trim() !== '')) errors.push(`块缺失字段: ${missing.join(',')}`);
      continue;
    }
    const severity = fields.get('SEVERITY')!;
    if (!SEVERITIES.has(severity)) {
      errors.push(`SEVERITY 非法: ${severity}`);
      continue;
    }
    findings.push({
      severity: severity as Finding['severity'],
      dimension: fields.get('DIMENSION')!,
      quote: fields.get('QUOTE')!,
      comment: fields.get('COMMENT')!,
    });
  }
  if (!overallSeen) errors.push('缺少 OVERALL 行');
  return { findings, overall, errors };
}

export interface ParsedSummary {
  summary: string;
  beats: string[];
  openThreads: string[];
  characterDeltas: Array<{ name: string; stateJson: string }>;
  errors: string[];
}

function collectList(lines: string[], startIdx: number): { items: string[]; next: number } {
  const items: string[] = [];
  let i = startIdx;
  while (i < lines.length && !/^[A-Z]+:/.test(lines[i])) {
    const l = lines[i].trim();
    if (l.startsWith('- ')) items.push(l.slice(2).trim());
    i++;
  }
  return { items, next: i };
}

/** summary 纯文本解析（SUMMARY/BEATS/THREADS/STATE 四段）。 */
export function parseSummary(raw: string): ParsedSummary {
  const errors: string[] = [];
  const text = raw.replace(/\r\n/g, '\n');
  const lines = text.split('\n');
  let summary = '';
  let beats: string[] = [];
  let openThreads: string[] = [];
  const characterDeltas: Array<{ name: string; stateJson: string }> = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith('SUMMARY:')) {
      summary = line.slice(8).trim();
      i++;
    } else if (line.startsWith('BEATS:')) {
      const r = collectList(lines, i + 1);
      beats = r.items;
      i = r.next;
    } else if (line.startsWith('THREADS:')) {
      const r = collectList(lines, i + 1);
      openThreads = r.items;
      i = r.next;
    } else if (line.startsWith('STATE:')) {
      i++;
      while (i < lines.length && !/^[A-Z]+:/.test(lines[i])) {
        const l = lines[i].trim();
        if (l !== '') {
          const eq = l.indexOf('=');
          if (eq > 0) characterDeltas.push({ name: l.slice(0, eq).trim(), stateJson: l.slice(eq + 1).trim() });
          else errors.push(`STATE 行非法: ${l}`);
        }
        i++;
      }
    } else {
      if (line.trim() !== '' && !line.startsWith('SUMMARY:')) {
        // 非标记行忽略（容忍前后噪声）
      }
      i++;
    }
  }
  if (summary === '') errors.push('缺少 SUMMARY 行');
  return { summary, beats, openThreads, characterDeltas, errors };
}

export interface ParsedBlueprint {
  blueprint: ChapterBlueprint;
  errors: string[];
}

const MAX_BLUEPRINT_BEATS = 6;

/** 蓝图行协议解析（GOAL:/BEATS - 条目/HOOK:）。容忍 CRLF、代码围栏与多余空行。 */
export function parseBlueprint(raw: string): ParsedBlueprint {
  const errors: string[] = [];
  const lines = raw
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('```'));

  let goal = '';
  let hook = '';
  let inBeats = false;
  const beats: string[] = [];

  for (const line of lines) {
    const text = line.trim();
    const goalMatch = /^GOAL\s*[:：]\s*(.*)$/.exec(text);
    if (goalMatch) {
      if (goal === '' && goalMatch[1].trim() !== '') goal = goalMatch[1].trim();
      inBeats = false;
      continue;
    }
    const hookMatch = /^HOOK\s*[:：]\s*(.*)$/.exec(text);
    if (hookMatch) {
      if (hook === '' && hookMatch[1].trim() !== '') hook = hookMatch[1].trim();
      inBeats = false;
      continue;
    }
    const beatsMatch = /^BEATS\s*[:：]\s*(.*)$/.exec(text);
    if (beatsMatch) {
      inBeats = true;
      if (beatsMatch[1].trim() !== '') beats.push(beatsMatch[1].trim());
      continue;
    }
    if (inBeats) {
      if (text === '') continue;
      const item = /^-\s+(.*)$/.exec(text);
      if (item) {
        if (item[1].trim() !== '') beats.push(item[1].trim());
        continue;
      }
      if (/^[A-Z]+\s*[:：]/.test(text)) inBeats = false;
    }
  }

  if (goal === '') errors.push('缺少 GOAL 行');
  if (beats.length === 0) errors.push('缺少 BEATS 条目');
  if (beats.length > MAX_BLUEPRINT_BEATS) {
    beats.length = MAX_BLUEPRINT_BEATS;
    errors.push(`BEATS 条目超过 ${MAX_BLUEPRINT_BEATS} 条，已截断`);
  }
  if (hook === '') errors.push('缺少 HOOK 行');
  else beats.push(hook);

  return {
    blueprint: { goal, beats, mustHaveBeats: [], bannedTopics: [] },
    errors,
  };
}

interface OutlineItem {
  chapterNo: number;
  blueprint: ChapterBlueprint;
}

export interface ParsedOutline {
  outline: OutlineItem[];
  errors: string[];
}

/** 全书蓝图解析：`# <章号>` 行分块（容忍全角＃与多 #），块内逐块 parseBlueprint；
 *  expectedCount 给定时缺块报「缺少第N章块」；块内错误以 `第n章:` 前缀入 errors；按章号升序。 */
export function parseOutline(raw: string, expectedCount?: number): ParsedOutline {
  const errors: string[] = [];
  const blocks = new Map<number, string[]>();
  let current: number | null = null;
  for (const line of raw.replace(/\r\n/g, '\n').split('\n')) {
    const text = line.trim();
    if (text.startsWith('```')) continue;
    const head = /^[#＃]+\s*(\d{1,3})\s*$/.exec(text);
    if (head) {
      const n = Number(head[1]);
      if (!blocks.has(n)) blocks.set(n, []);
      current = n;
      continue;
    }
    if (current !== null) blocks.get(current)!.push(line);
  }

  const outline: OutlineItem[] = [];
  for (const [n, lines] of blocks) {
    const { blueprint, errors: blockErrors } = parseBlueprint(lines.join('\n'));
    for (const e of blockErrors) errors.push(`第${n}章: ${e}`);
    outline.push({ chapterNo: n, blueprint });
  }
  outline.sort((a, b) => a.chapterNo - b.chapterNo);

  if (expectedCount !== undefined) {
    for (let i = 1; i <= expectedCount; i++) {
      if (!blocks.has(i)) errors.push(`缺少第${i}章块`);
    }
  }
  return { outline, errors };
}

// ── 三级大纲树（VOLUME:/STAGE:/CARD:/BODY: 行协议）──

const CARD_RANGE = /第\s*(\d+)\s*[-—~至]\s*(\d+)\s*章/;

export interface ParsedOutlineTree {
  tree: OutlineTreeDto;
  errors: string[];
}

/** 三级大纲树解析：STAGE 挂最近 VOLUME、CARD 挂最近 STAGE（孤儿行记 error 不抛）；
 *  BODY 挂最近创建的节点（CARD 优先于 STAGE 优先于 VOLUME）；容忍 CRLF、代码围栏与多余空行。
 *  CARD 章号区间正则 第<a>-<b>章（-—~至 皆可），缺区间 → chapterFrom/To=null；seq 按出现顺序 1..n 归一。 */
export function parseOutlineTree(raw: string): ParsedOutlineTree {
  const errors: string[] = [];
  const tree: OutlineTreeDto = { volumes: [] };
  let vol: OutlineVolumeDto | null = null;
  let stage: OutlineStageDto | null = null;
  let target: { body: string } | null = null;
  for (const line of raw.replace(/\r\n/g, '\n').split('\n')) {
    const text = line.trim();
    if (text === '' || text.startsWith('```')) continue;
    let m = /^VOLUME\s*[:：]\s*(.*)$/.exec(text);
    if (m) {
      vol = { title: m[1].trim(), body: '', seq: tree.volumes.length + 1, stages: [] };
      stage = null;
      target = vol;
      tree.volumes.push(vol);
      continue;
    }
    m = /^STAGE\s*[:：]\s*(.*)$/.exec(text);
    if (m) {
      if (!vol) {
        errors.push(`STAGE 缺少所属卷: ${text}`);
        continue;
      }
      stage = { title: m[1].trim(), body: '', seq: vol.stages.length + 1, cards: [] };
      target = stage;
      vol.stages.push(stage);
      continue;
    }
    m = /^CARD\s*[:：]\s*(.*)$/.exec(text);
    if (m) {
      if (!stage) {
        errors.push(`CARD 缺少所属阶段: ${text}`);
        continue;
      }
      const rest = m[1].trim();
      const r = CARD_RANGE.exec(rest);
      const card: OutlineCardDto = r
        ? {
            title: rest.slice(r[0].length).trim(),
            body: '',
            seq: stage.cards.length + 1,
            chapterFrom: Number(r[1]),
            chapterTo: Number(r[2]),
          }
        : { title: rest, body: '', seq: stage.cards.length + 1, chapterFrom: null, chapterTo: null };
      target = card;
      stage.cards.push(card);
      continue;
    }
    m = /^BODY\s*[:：]\s*(.*)$/.exec(text);
    if (m) {
      if (!target) {
        errors.push(`BODY 缺少所属节点: ${text}`);
        continue;
      }
      const content = m[1].trim();
      target.body = target.body ? `${target.body}\n${content}` : content;
      continue;
    }
    errors.push(`无法识别的行: ${text}`);
  }
  if (tree.volumes.length === 0) errors.push('缺少 VOLUME 行');
  return { tree, errors };
}

// ── 蒸馏结构化分析（DIM:/AXIS:/RULES: 行协议）──

export interface ParsedAnalysis {
  dims: Record<string, string>;
  axes: Record<string, number>;
  rules: string[];
  terms: StyleTermDto[];
  errors: string[];
}

/** 蒸馏分析解析：DIM: <维度>: <文本> / AXIS: <轴名>: <0-100> / RULES: <规则> / TERMS: <术语>: <用法说明>。
 *  缺行容错不抛——数值轴缺/非法补 0，文本维缺补 ''，术语缺补 []，越界钳制 0-100；未知维度/轴与非标记行记 errors。 */
export function parseAnalysis(raw: string): ParsedAnalysis {
  const errors: string[] = [];
  const dims: Record<string, string> = {};
  const axes: Record<string, number> = {};
  const rules: string[] = [];
  const terms: StyleTermDto[] = [];
  for (const line of raw.replace(/\r\n/g, '\n').split('\n')) {
    const text = line.trim();
    if (text === '' || text.startsWith('```')) continue;
    let m = /^DIM\s*[:：]\s*([^:：]+)\s*[:：]\s*(.*)$/.exec(text);
    if (m) {
      const name = m[1].trim();
      if (!(STYLE_DIMENSIONS as readonly string[]).includes(name)) errors.push(`未知维度: ${name}`);
      else dims[name] = m[2].trim();
      continue;
    }
    m = /^AXIS\s*[:：]\s*([^:：]+)\s*[:：]\s*(.*)$/.exec(text);
    if (m) {
      const name = m[1].trim();
      if (!(STYLE_AXES as readonly string[]).includes(name)) {
        errors.push(`未知轴: ${name}`);
        continue;
      }
      const n = Number(m[2].trim());
      if (!Number.isFinite(n)) {
        errors.push(`轴值非法: ${name}=${m[2].trim()}`);
        axes[name] = 0;
      } else {
        axes[name] = Math.min(100, Math.max(0, Math.round(n)));
      }
      continue;
    }
    m = /^TERMS\s*[:：]\s*([^:：]+)\s*[:：]\s*(.*)$/.exec(text);
    if (m) {
      const term = m[1].trim();
      if (term === '') errors.push(`术语为空: ${text}`);
      else terms.push({ term, note: m[2].trim() });
      continue;
    }
    m = /^RULES\s*[:：]\s*(.*)$/.exec(text);
    if (m) {
      if (m[1].trim() !== '') rules.push(m[1].trim());
      continue;
    }
    errors.push(`无法识别的行: ${text}`);
  }
  for (const d of STYLE_DIMENSIONS) if (dims[d] === undefined) dims[d] = '';
  for (const a of STYLE_AXES) if (axes[a] === undefined) axes[a] = 0;
  return { dims, axes, rules, terms, errors };
}

// ── 蒸馏自评（SCORE:/REASON: 行协议，held-out 检验）──

interface SelfEvalItem {
  score: number;
  reason: string;
}

export interface ParsedSelfEval {
  evaluation: SelfEvalItem[];
  errors: string[];
}

/** 自评解析：SCORE:/REASON: 成对取（顺序配对，SCORE 缺 REASON 补空串）；SCORE 钳制 1-5；
 *  孤儿 REASON 记 error；无任何 SCORE 行 → evaluation=[]（缺行容错不抛）。 */
export function parseSelfEval(raw: string): ParsedSelfEval {
  const errors: string[] = [];
  const evaluation: SelfEvalItem[] = [];
  let pending: { score: number } | null = null;
  for (const line of raw.replace(/\r\n/g, '\n').split('\n')) {
    const text = line.trim();
    if (text === '' || text.startsWith('```')) continue;
    let m = /^SCORE\s*[:：]\s*(.*)$/.exec(text);
    if (m) {
      if (pending) evaluation.push({ score: pending.score, reason: '' });
      const n = Number(m[1].trim());
      if (!Number.isFinite(n)) {
        errors.push(`SCORE 非法: ${m[1].trim()}`);
        pending = { score: 1 };
      } else {
        pending = { score: Math.min(5, Math.max(1, Math.round(n))) };
      }
      continue;
    }
    m = /^REASON\s*[:：]\s*(.*)$/.exec(text);
    if (m) {
      if (pending) {
        evaluation.push({ score: pending.score, reason: m[1].trim() });
        pending = null;
      } else {
        errors.push(`REASON 无对应 SCORE: ${m[1].trim().slice(0, 30)}`);
      }
      continue;
    }
    errors.push(`无法识别的行: ${text}`);
  }
  if (pending) evaluation.push({ score: pending.score, reason: '' });
  return { evaluation, errors };
}
