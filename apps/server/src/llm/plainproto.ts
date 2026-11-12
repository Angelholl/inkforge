import type { Finding } from '@inkforge/shared';

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
