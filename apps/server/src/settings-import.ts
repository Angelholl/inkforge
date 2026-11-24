import type {
  OutlineItemDto,
  OutlineStageDto,
  OutlineTreeDto,
  OutlineVolumeDto,
  SettingsImportCharacterDraft,
  SettingsImportDraftDto,
  SettingsImportForeshadowingDraft,
} from '@inkforge/shared';

// ── 预算警示阈值：与 config.ts BUDGETS_DRAFT.worldview / BUDGETS_OUTLINE.outline 对齐（DEC-2026-1120-04① 扩槽；DEC-2026-1121-01 增至 20000）──
const DESCRIPTION_BUDGET = 20000;
const OUTLINE_BUDGET = 8000;
const CARDS_CAP = 200;
const FORESHADOWINGS_CAP = 50;

/** 设定集解析纯函数：内容无关，只认标题/表格/编号骨架（DEC-2026-1120-04）。 */
function stripMd(s: string): string {
  return s.replace(/`\[[^\]]*\]`/g, '').replace(/\*\*/g, '').trim();
}

/** 剥名字括号注记：'阿美（沈小美，26）' → '阿美'（半全角括号）。 */
function stripParensNote(name: string): string {
  return name.replace(/[（(][^）)]*[）)]/g, '').trim();
}

interface Section {
  heading: string;
  lines: string[];
}

interface Doc {
  h1: string;
  sections: Section[];
  /** 全文 H3 块（标题+体），供悬置线/伏笔清单扫描 */
  h3Blocks: Section[];
  /** 首个 blockquote 行（定位一句话） */
  firstQuote: string;
}

function splitDoc(raw: string): Doc {
  const doc: Doc = { h1: '', sections: [], h3Blocks: [], firstQuote: '' };
  let h2: Section | null = null;
  let h3: Section | null = null;
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (/^#\s+/.test(t) && doc.h1 === '') {
      doc.h1 = t.replace(/^#\s+/, '').trim();
      h2 = null;
      h3 = null;
      continue;
    }
    if (/^##\s+/.test(t)) {
      h2 = { heading: t.replace(/^##\s+/, '').trim(), lines: [] };
      doc.sections.push(h2);
      h3 = null;
      continue;
    }
    if (/^#{3,6}\s+/.test(t)) {
      h3 = { heading: t.replace(/^#{3,6}\s+/, '').trim(), lines: [] };
      doc.h3Blocks.push(h3);
      // H3 行同时进所属 H2 节体（cleanBlock 时剥标题标记）
      if (h2) h2.lines.push(t);
      continue;
    }
    if (doc.firstQuote === '' && /^>\s?/.test(t)) {
      doc.firstQuote = t.replace(/^>\s?/, '').trim();
      continue;
    }
    if (h2) h2.lines.push(t);
    if (h3) h3.lines.push(t);
  }
  return doc;
}

// ── 纯文本降级分节（TXT-01）：仅当 splitDoc 后 sections/h3Blocks 皆空时启用；含 H2/H3 骨架的 MD 不进此通道 ──
/** 行式节标题关键词表（长词在前，命中即停）：[关键词, 桶名]。 */
const PLAIN_KEYWORD_MAP: ReadonlyArray<readonly [string, string]> = [
  ['人物圣经', '人物'],
  ['主要人物', '人物'],
  ['人物设定', '人物'],
  ['人物与关系', '人物'],
  ['人物', '人物'],
  ['角色设定', '人物'],
  ['角色', '人物'],
  ['总大纲', '大纲'],
  ['故事大纲', '大纲'],
  ['剧情大纲', '大纲'],
  ['情节大纲', '大纲'],
  ['大纲', '大纲'],
  ['关系发生矩阵', '矩阵'],
  ['矩阵', '矩阵'],
  ['文风与语言规范', '文风'],
  ['文风规范', '文风'],
  ['文风', '文风'],
  ['语言规范', '文风'],
  ['风格', '文风'],
  ['悬置线清单', '伏笔'],
  ['悬置线', '伏笔'],
  ['悬置', '伏笔'],
  ['伏笔清单', '伏笔'],
  ['伏笔', '伏笔'],
  ['世界观', '世界观'],
  ['故事背景', '世界观'],
  ['背景设定', '世界观'],
  ['规则体系', '规则'],
  ['规则', '规则'],
];

/** S2：行式节标题判定。命中返回 { bucket, body }，未命中返回 null。 */
function plainSectionHeading(t: string): { bucket: string; body: string } | null {
  const braced = t.match(/^【(.+)】$/) ?? t.match(/^\[(.+)\]$/);
  const inner = braced !== null ? braced[1].trim() : t;
  const rest = inner
    .replace(/^(?:[〇零一二三四五六七八九十百千两\d]{1,4}\s*[、.．)）]\s*)?/, '')
    .trim();
  for (const [keyword, bucket] of PLAIN_KEYWORD_MAP) {
    if (!rest.startsWith(keyword)) continue;
    const tail = rest.slice(keyword.length);
    const trimmed = tail.trim();
    if (trimmed === '' || trimmed === '：' || trimmed === ':') return { bucket, body: '' };
    if (/^[：:]/.test(trimmed) && trimmed.slice(1).trim().length >= 2) {
      return { bucket, body: trimmed.slice(1).trim() };
    }
    if (tail.length <= 8 && !/[。！？]/.test(tail)) return { bucket, body: '' };
  }
  return null;
}

/** S1/S2：文档序行式标题合成节，按桶合并同名节（首现序），节名前的散行忽略。 */
function synthesizePlainSections(raw: string): Section[] {
  const byBucket = new Map<string, Section>();
  let cur: Section | null = null;
  for (const rawLine of raw.split('\n')) {
    const t = rawLine.trim();
    const h = plainSectionHeading(t);
    if (h !== null) {
      let sec = byBucket.get(h.bucket);
      if (sec === undefined) {
        sec = { heading: h.bucket, lines: [] };
        byBucket.set(h.bucket, sec);
      }
      cur = sec;
      if (h.body !== '') sec.lines.push(h.body);
      continue;
    }
    if (cur !== null) cur.lines.push(t);
  }
  return [...byBucket.values()];
}

/** 消费节原始骨架（融合门 Task-02）：heading 为去掉 # 的题面，lines 不含该节自身的标题行。 */
export interface CompendiumSectionRaw {
  heading: string;
  level: 2 | 3;
  lines: string[];
}

/** 薄封装 splitDoc：H2 sections（level 2）+ h3Blocks（level 3），文档序。 */
export function splitCompendiumSections(raw: string): CompendiumSectionRaw[] {
  const doc = splitDoc(raw);
  // splitDoc 已分别按文档序产出 H2/H3；此处按原文字句中标题行的出现次序交错合并，得严格文档序。
  const h2ByHeading = new Map<string, Section[]>();
  const h3ByHeading = new Map<string, Section[]>();
  for (const s of doc.sections) {
    const bucket = h2ByHeading.get(s.heading) ?? [];
    bucket.push(s);
    h2ByHeading.set(s.heading, bucket);
  }
  for (const b of doc.h3Blocks) {
    const bucket = h3ByHeading.get(b.heading) ?? [];
    bucket.push(b);
    h3ByHeading.set(b.heading, bucket);
  }
  const out: CompendiumSectionRaw[] = [];
  for (const rawLine of raw.split('\n')) {
    const t = rawLine.trim();
    if (/^##\s+/.test(t)) {
      const heading = t.replace(/^##\s+/, '').trim();
      const sec = h2ByHeading.get(heading)?.shift();
      if (sec) out.push({ heading, level: 2, lines: sec.lines });
    } else if (/^#{3,6}\s+/.test(t)) {
      const heading = t.replace(/^#{3,6}\s+/, '').trim();
      const sec = h3ByHeading.get(heading)?.shift();
      if (sec) out.push({ heading, level: 3, lines: sec.lines });
    }
  }
  return out;
}

/** 节体清洗：剥行首标题标记/标注 tag/粗体标记，保留行结构。 */
function cleanBlock(sec: Section | undefined): string {
  if (!sec) return '';
  return sec.lines
    .map((l) => stripMd(l.replace(/^\s*#{1,6}\s*/, '')))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// v4 元信息降噪（DEC-2026-1120-10）：版本行 / vN→vN 变更行 / 待确认项行 / 决策记录行，及上述主题的整节
const META_LINE_RE = /^(?:>+\s*)?(?:版本\s*[：:]|v\d+\s*[→↔\-—>]+\s*v?\d+|待确认项?\s*[：:]|决策(?:记录|日志)\s*[：:])/;
const META_SECTION_RE = /^#{1,6}\s*(?:[\d.、]+\s*)?(?:版本(?:记录|沿革|变更)|修订(?:记录|历史|说明)|变更(?:记录|日志|说明)|待确认项?|决策(?:记录|日志))/;

/**
 * 全文精炼（DEC-2026-1120-04 追加裁决「16000 上限内精炼前置」，拍板①完全加载的完整落地）：
 * H 骨架剥 # 保留标题行、表格压行成 a｜b｜c（分隔行删）、空行折叠、文档序=owner 前置序。
 * description=精炼全文（v3 全文≈1.3 万字恰在预算内）；矩阵节精炼版追加进剧情大纲。
 * exported 供门引擎节级精炼同形，行为逐字节不变。
 */
export function refineForDescription(raw: string): string {
  const out: string[] = [];
  let skipUntilLevel: number | null = null;
  for (const rawLine of raw.split('\n')) {
    const t = stripMd(rawLine.trim());
    const headM = /^(#{1,6})\s*(?:[\d.、]+\s*)?/.exec(t);
    if (headM && META_SECTION_RE.test(t)) {
      skipUntilLevel = headM[1].length; // 噪声节：连标题带节体剥除
      continue;
    }
    if (skipUntilLevel !== null) {
      if (headM && headM[1].length <= skipUntilLevel) {
        skipUntilLevel = null; // 同级或更高级标题恢复正文
      } else {
        continue;
      }
    }
    if (META_LINE_RE.test(t)) continue; // 散落噪声行
    if (/^\|[\s|:-]*\|?$/.test(t) || /^[-—=_*]{3,}$/.test(t)) {
      out.push('');
      continue;
    }
    if (t.startsWith('|')) {
      out.push(t.replace(/\s*\|\s*/g, '｜').replace(/^｜/, '').replace(/｜$/, ''));
      continue;
    }
    out.push(t.replace(/^#{1,6}\s*/, ''));
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

interface ParsedCard {
  title: string;
  body: string;
  chapterFrom: number | null;
  chapterTo: number | null;
}

/** 括号深度扫描：返回与 openIdx 配对的闭合下标，找不到 -1（半全角混用容错）。 */
function matchParen(s: string, openIdx: number): number {
  let depth = 0;
  for (let i = openIdx; i < s.length; i++) {
    const ch = s.charAt(i);
    if (ch === '（' || ch === '(') depth += 1;
    else if (ch === '）' || ch === ')') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

interface ParsedLanding {
  grade: 'H' | 'L';
  scene: string;
  keywords: string[];
}

/** 落地格解析纯函数（DEC-2026-1120-10）：body 首字符 H/L 认分级；括号内容=场景；关键词=场景 token（≥2 字、含 CJK、全等去重、上限 6）。
 *  无格（首字符非 H/L）返回 null；分级不硬编码任何露骨词表——关键词一律取自卡 body 自身场景文本。 */
export function parseLandingCell(body: string): ParsedLanding | null {
  const t = body.trim();
  if (t === '') return null;
  const grade = /^H/.test(t) ? 'H' : /^L/.test(t) ? 'L' : null;
  if (!grade) return null;
  let scene = t.slice(1).trim();
  const open = t.search(/[（(]/);
  if (open >= 0) {
    const close = matchParen(t, open);
    if (close >= 0) scene = t.slice(open + 1, close).trim();
  }
  const keywords: string[] = [];
  for (const token of scene.split(/[：:；;，,、×ＸX／/·\s]+/)) {
    if (token.length < 2 || !/[\u4e00-\u9fff]/.test(token)) continue;
    if (!keywords.includes(token)) keywords.push(token);
    if (keywords.length >= 6) break;
  }
  return { grade, scene, keywords };
}

/** 锚点切分：编号段起点（行首或 ；：;:｜ 后接 1-3 位数字，可选 N–M 区间）。 */
function anchorSegments(text: string): string[] {
  const re = /(?:^|[；：;:｜])\s*(\d{1,3})(?:\s*[–—-]\s*(\d{1,3}))?/g;
  const numStarts: number[] = [];
  const sepIndexes: number[] = [];
  for (const m of text.matchAll(re)) {
    numStarts.push(m.index + m[0].indexOf(m[1]));
    sepIndexes.push(m.index);
  }
  const segs: string[] = [];
  for (let i = 0; i < numStarts.length; i++) {
    const end = i + 1 < numStarts.length ? sepIndexes[i + 1] : text.length;
    segs.push(text.slice(numStarts[i], end));
  }
  return segs;
}

/** 编号段 → 卡：题=编号后至首个括号组（剥粗体/尾孤括号），梗概=段尾闭合的顶层括号内文；≤3 位纯字母数字小体（线标签 L4 等）丢弃。 */
function segToCard(seg: string): ParsedCard | null {
  const numM = seg.match(/^(\d{1,3})(?:\s*[–—-]\s*(\d{1,3}))?\s*[.、．]?\s*/);
  if (!numM) return null;
  const rest = seg.slice(numM[0].length);
  let title = rest;
  let body = '';
  const open = rest.search(/[（(]/);
  if (open >= 0) {
    const close = matchParen(rest, open);
    if (close >= 0 && /^[\s。]*$/.test(rest.slice(close + 1))) {
      body = stripMd(rest.slice(open + 1, close));
      title = rest.slice(0, open);
    }
  }
  if (body.length <= 3 && /^[A-Za-z0-9]+$/.test(body)) body = '';
  title = stripMd(title).replace(/[）)]+$/, '').trim();
  if (title === '' && body === '') return null;
  return {
    title: title !== '' ? title : body.slice(0, 20),
    body,
    chapterFrom: Number(numM[1]),
    chapterTo: numM[2] !== undefined ? Number(numM[2]) : Number(numM[1]),
  };
}

function extractCards(text: string): ParsedCard[] {
  const cards: ParsedCard[] = [];
  for (const seg of anchorSegments(text)) {
    const c = segToCard(seg);
    if (c) cards.push(c);
  }
  return cards;
}

// S3：纯文本人物行守卫白名单（钉值，按前缀起头判定）
const NON_NAME_LABELS = [
  '弧光', '功能', '简介', '设定', '备注', '年龄', '身份', '职业', '关系', '出场', '登场',
  '能力', '缺陷', '秘密', '结局', '外号', '代号', '住所', '立场', '说话腔', '性格', '背景',
  '定位', '机制', '原则',
];

/** S3：名段守卫（form A ≤10 字 / 裸名 ≤12 字），两形态共用。 */
function plainNameOk(rawName: string, bare: boolean): boolean {
  const name = stripParensNote(rawName).trim();
  const re = bare
    ? /^[\u4e00-\u9fffA-Za-z][\u4e00-\u9fffA-Za-z0-9·]{0,11}$/
    : /^[\u4e00-\u9fffA-Za-z][\u4e00-\u9fffA-Za-z0-9·]{0,9}$/;
  if (!re.test(name)) return false;
  if (NON_NAME_LABELS.some((label) => name.startsWith(label))) return false;
  if (/^[〇零一二三四五六七八九十百千两\d]+[卷部篇章节]$/.test(name)) return false;
  return true;
}

/** 人物卡三形态：①粗体行段 ②表格行首格粗体 ③bullet 首粗体；'**标签**：…' 段与重名跳过。plain 时走行式形态。 */
function parseCharacters(
  sec: Section | undefined,
  warnings: string[],
  out: SettingsImportCharacterDraft[],
  plain = false,
): void {
  if (!sec) return;
  const seen = new Set<string>();
  const pushChar = (name: string, setting: string): void => {
    if (name === '') return;
    if (seen.has(name)) {
      warnings.push(`人物卡重名已去重：${name}`);
      return;
    }
    seen.add(name);
    out.push({ name, baseSetting: setting !== '' ? JSON.stringify({ 设定: setting }) : '{}' });
  };
  let cur: { name: string; parts: string[] } | null = null;
  const flush = (): void => {
    if (!cur) return;
    pushChar(cur.name, cur.parts.filter((p) => p !== '').join('\n'));
    cur = null;
  };
  for (const rawLine of sec.lines) {
    const t = rawLine.trim();
    if (t === '' || /^#{2,6}\s/.test(t)) {
      flush();
      continue;
    }
    if (plain) {
      // 冒号名行：^(?:[-·•]\s*)?(名)[：:]\s*(尾)$，名段 ≤20 字
      const named = t.match(/^(?:[-·•]\s*)?([^：:\n]{1,20})[：:]\s*(.*)$/);
      if (named !== null) {
        const name = named[1].trim();
        if (plainNameOk(name, false)) {
          flush();
          const tail = named[2].trim();
          cur = { name: stripParensNote(name).trim(), parts: tail !== '' ? [tail] : [] };
          continue;
        }
      } else {
        // 裸名行：^(?:[-·•]\s*)?([^：:\n]{1,12})$
        const bare = t.match(/^(?:[-·•]\s*)?([^：:\n]{1,12})$/);
        if (bare !== null) {
          const name = bare[1].trim();
          if (plainNameOk(name, true)) {
            flush();
            cur = { name: stripParensNote(name).trim(), parts: [] };
            continue;
          }
        }
      }
      // 其余非空行并入当前卡；无当前卡则忽略
      if (cur !== null) cur.parts.push(stripMd(t));
      continue;
    }
    if (t.startsWith('|')) {
      flush();
      const cells = t.replace(/^\|/, '').replace(/\|$/, '').split('|').map((x) => x.trim());
      const bm = cells[0]?.match(/\*\*(.+?)\*\*/);
      // 人物判定：首格粗体（v2）或含括号注记（v3 无粗体形态「老王（王仲良，52，中介）」）；表头「人物」与分隔行无括号天然跳过
      const isPerson = (bm !== null && bm !== undefined) || (cells[0] !== undefined && /[（(]/.test(cells[0]));
      if (!isPerson) continue;
      const settingParts =
        bm !== null && bm !== undefined
          ? [stripMd(cells[0].slice((bm.index ?? 0) + bm[0].length)), ...cells.slice(1)]
          : [stripMd(cells[0]), ...cells.slice(1)];
      const setting = settingParts.filter((x) => x !== '').join('；');
      pushChar(bm ? stripParensNote(stripMd(bm[1])) : stripParensNote(stripMd(cells[0])), setting);
      continue;
    }
    if (/^[-·]\s+/.test(t)) {
      flush();
      // 仅行首粗体为名（v3「- 其余轮换：…后置粗体」等机制行不误收）
      const bm = t.match(/^[-·]\s*\*\*(.+?)\*\*/);
      if (!bm) continue;
      const rest = t.slice(t.indexOf(bm[0]) + bm[0].length).replace(/^[\s：:]+/, '');
      pushChar(stripParensNote(stripMd(bm[1])), stripMd(rest));
      continue;
    }
    const bm = t.match(/^\*\*(.+?)\*\*/);
    if (bm) {
      const rest = t.slice((bm.index ?? 0) + bm[0].length).trim();
      flush();
      // '**标签**：…' 是段落标签（如关系网一句话），非人物
      if (/^[：:]/.test(rest)) continue;
      cur = { name: stripParensNote(stripMd(bm[1])), parts: [stripMd(rest)] };
      continue;
    }
    if (cur) cur.parts.push(stripMd(t));
  }
  flush();
}

/** S4：中文数字→阿拉伯数字（阿拉伯数字直通；位值累计；不可解析→null）。 */
function cnToNum(s: string): number | null {
  if (/^\d+$/.test(s)) return Number(s);
  const digits: Record<string, number> = {
    '〇': 0, '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9,
  };
  const units: Record<string, number> = { '十': 10, '百': 100, '千': 1000 };
  let num = 0;
  let cur = 0;
  let seen = false;
  for (const ch of s) {
    if (ch === '零') continue;
    if (ch in digits) {
      cur = cur * 10 + (digits[ch] ?? 0);
      seen = true;
    } else if (ch in units) {
      num += (cur || 1) * (units[ch] ?? 0);
      cur = 0;
      seen = true;
    } else {
      return null;
    }
  }
  return seen ? num + cur : null;
}

/** S4：题/梗概切分（首个冒号；否则行尾闭合括号；否则 body=rest、title=前 20 字）。 */
function splitTitleBody(rest: string): { title: string; body: string } {
  const s = rest.trim();
  const ci = s.search(/[：:]/);
  if (ci >= 0) {
    const title = s.slice(0, ci).trim();
    const body = s.slice(ci + 1).trim();
    return { title: title !== '' ? title : body.slice(0, 20), body };
  }
  const open = s.search(/[（(]/);
  if (open >= 0) {
    const close = matchParen(s, open);
    if (close >= 0 && /^[\s。]*$/.test(s.slice(close + 1))) {
      const body = stripMd(s.slice(open + 1, close)).trim();
      const title = s.slice(0, open).trim();
      return { title: title !== '' ? title : body.slice(0, 20), body };
    }
  }
  return { title: s.slice(0, 20), body: s };
}

/** 总大纲 → 卷/阶段/卡 + 卷级梗概行；区间篇行成阶段，编号行成卡，无编号行兜底成卡（blockquote/分隔线除外）。plain 时走行式形态。 */
function parseOutline(
  sec: Section | undefined,
  warnings: string[],
  tree: OutlineTreeDto,
  allCards: ParsedCard[],
  outlineLines: string[],
  plain = false,
): void {
  if (!sec) return;
  let vol: OutlineVolumeDto | null = null;
  let stage: OutlineStageDto | null = null;
  let cardTotal = 0;
  let capWarned = false;
  let pendingSubTitle = '';
  // S4：当前卷章区间与偏移 warning 门（全卷仅一条）
  let volRange: { from: number; to: number } | null = null;
  let volRangeWarned = false;
  const seenCardCh = new Set<number>();

  const makeVolume = (title: string, body: string): OutlineVolumeDto => {
    const v: OutlineVolumeDto = { title, body, seq: tree.volumes.length, stages: [] };
    tree.volumes.push(v);
    return v;
  };
  const ensureStage = (): OutlineStageDto => {
    if (stage === null) {
      if (vol === null) vol = makeVolume(pendingSubTitle, '');
      stage = { title: '', body: '', seq: vol.stages.length, cards: [] };
      vol.stages.push(stage);
    }
    return stage;
  };
  // 装卡前置门：cap 截断 + 跨树章号去重（v4 穿插示范表与阶段表重复章，先到先得）——不建空卷空阶段
  const canAdd = (c: ParsedCard): boolean => {
    if (cardTotal >= CARDS_CAP) {
      if (!capWarned) {
        warnings.push(`章卡超过 ${CARDS_CAP} 张，已截断（保留前 ${CARDS_CAP}）`);
        capWarned = true;
      }
      return false;
    }
    if (c.chapterFrom !== null && seenCardCh.has(c.chapterFrom)) return false;
    return true;
  };
  const addCardTo = (st: OutlineStageDto, c: ParsedCard): void => {
    cardTotal += 1;
    if (c.chapterFrom !== null) seenCardCh.add(c.chapterFrom);
    st.cards.push({ title: c.title, body: c.body, seq: st.cards.length, chapterFrom: c.chapterFrom, chapterTo: c.chapterTo });
    allCards.push(c);
  };
  const addCard = (c: ParsedCard): void => {
    if (!canAdd(c)) return;
    addCardTo(ensureStage(), c);
  };

  for (const rawLine of sec.lines) {
    const t = rawLine.trim();
    if (t === '') continue;
    if (plain) {
      // 卷行两形态：第N卷/部/篇(分) 或 卷/部/篇第N（「第」起头或倒装，散文行不误命中）
      const volFwd = t.match(/^第\s*([〇零一二三四五六七八九十百千两\d]{1,6})\s*(卷|部|篇)(分)?\s*[：:]?\s*(.*)$/);
      const volInv = volFwd === null
        ? t.match(/^([卷部篇])\s*(?:第\s*)?([〇零一二三四五六七八九十百千两\d]{1,6})\s*[：:]?\s*(.*)$/)
        : null;
      if (volFwd !== null || volInv !== null) {
        const rawN = volFwd !== null ? volFwd[1] : (volInv as RegExpMatchArray)[2];
        const unit = volFwd !== null ? volFwd[2] : (volInv as RegExpMatchArray)[1];
        const hasFen = volFwd !== null && volFwd[3] !== undefined;
        const bodyRaw = volFwd !== null ? volFwd[4] : (volInv as RegExpMatchArray)[3];
        const n = cnToNum(rawN);
        const nText = n !== null ? String(n) : rawN;
        const open = bodyRaw.search(/[（(]/);
        let head = bodyRaw;
        let vbody = '';
        if (open >= 0) {
          const close = matchParen(bodyRaw, open);
          if (close >= 0 && /^[\s。]*$/.test(bodyRaw.slice(close + 1))) {
            head = bodyRaw.slice(0, open).trim();
            vbody = stripMd(bodyRaw.slice(open + 1, close)).trim();
          }
        }
        const title = `第${nText}${unit}${hasFen ? '分' : ''} ${head}`.trim();
        vol = makeVolume(title, vbody);
        stage = null;
        const rangeM = `${head} ${vbody}`.match(/(\d{1,3})\s*[–—-]\s*(\d{1,3})/);
        volRange = rangeM !== null ? { from: Number(rangeM[1]), to: Number(rangeM[2]) } : null;
        volRangeWarned = false;
        outlineLines.push(vbody !== '' ? `${title}（${vbody}）` : title);
        pendingSubTitle = '';
        continue;
      }
      // 章行：第N章 → 卡，章号经 cnToNum
      const chap = t.match(/^第\s*([〇零一二三四五六七八九十百千两\d]{1,6})\s*章\s*[：:.、\s]*(.*)$/);
      if (chap !== null) {
        const ch = cnToNum(chap[1]);
        if (ch !== null) {
          const { title, body } = splitTitleBody(chap[2]);
          addCard({ title, body, chapterFrom: ch, chapterTo: ch });
          continue;
        }
        // 数词不可解析 → 落散行兜底
      }
      // 阶段行：区间+节名+冒号 → 无卷先建卷，段内编号成卡
      const st = t.match(/^(\d{1,3})\s*[–—-]\s*(\d{1,3})\s*([^（(：:]{1,20})[：:]\s*(.*)$/);
      if (st !== null) {
        if (vol === null) vol = makeVolume('', '');
        const stDto: OutlineStageDto = { title: st[3].trim(), body: '', seq: vol.stages.length, cards: [] };
        vol.stages.push(stDto);
        for (const c of extractCards(st[4])) {
          if (canAdd(c)) addCardTo(stDto, c);
        }
        stage = null;
        continue;
      }
      // 编号行：章号按卷区间偏移；越界回退字面 n 并推全卷一条 warning
      const numLine = t.match(/^(\d{1,3})\s*[、.．]\s*(.*)$/);
      if (numLine !== null) {
        const n = Number(numLine[1]);
        const { title, body } = splitTitleBody(numLine[2]);
        let ch = n;
        if (volRange !== null) {
          const shifted = volRange.from + n - 1;
          if (shifted > volRange.to) {
            if (!volRangeWarned) {
              warnings.push('卷内编号与卷章区间不一致，按字面编号取章号');
              volRangeWarned = true;
            }
          } else {
            ch = shifted;
          }
        }
        addCard({ title, body, chapterFrom: ch, chapterTo: ch });
        continue;
      }
    }
    if (t.startsWith('|')) {
      // 表格行：首格数字=章行（v4「| 章 | 标题 | 线 | 落地 |」逐章表）→ 卡；其余（线池/引擎表）跳过归档兜底
      const cells = t.replace(/^\|/, '').replace(/\|$/, '').split('|').map((x) => x.trim());
      const first = cells[0] ?? '';
      const rangeM = first.match(/^(\d{1,3})\s*[–—-]\s*(\d{1,3})$/);
      if (!/^\d{1,3}$/.test(first) && !rangeM) continue;
      const title = (cells[1] ?? '').replace(/\*\*/g, '').trim();
      const body = ((cells.length >= 4 ? cells[3] : cells[2]) ?? '').replace(/\*\*/g, '').trim();
      const from = rangeM ? Number(rangeM[1]) : Number(first);
      const to = rangeM ? Number(rangeM[2]) : from;
      addCard({ title: title !== '' ? title : body.slice(0, 20), body, chapterFrom: from, chapterTo: to });
      continue;
    }
    if (/^>/.test(t) || /^-{3,}$/.test(t)) continue;
    const h3 = t.match(/^#{3,6}\s+(.*)$/);
    if (h3) {
      const h3Text = stripMd(h3[1]);
      // 仅真卷标题建卷（含《》或剥编号后以卷/部/篇/章/阶段+序号起头——「阶段总表」等子节标题不误伤）；否则脱离当前卷
      const probe = h3Text.replace(/^[\d.、\s]+/, '');
      if (/《/.test(h3Text) || /^(卷|部|篇|章|阶段)\s*[A-Za-z0-9〇零一二三四五六七八九十百千两]/.test(probe)) {
        const vm = h3Text.match(/^(.*?)\s*《(.+?)》/);
        const title = vm ? `${vm[1]} ${vm[2]}`.trim() : h3Text;
        const body = vm ? stripMd(h3Text.slice(h3Text.indexOf(vm[0]) + vm[0].length)) : '';
        vol = makeVolume(stripMd(title), body);
        outlineLines.push(h3Text);
        pendingSubTitle = '';
      } else {
        // 结构子节标题（6.1 结构总说/6.4 穿插示范等）：脱离当前卷；其下若出卡，卷名用子节标题
        vol = null;
        pendingSubTitle = probe.split(/[（(]/)[0].slice(0, 30);
      }
      stage = null;
      continue;
    }
    const stageHead = t.match(/^(\d{1,3})\s*[–—-]\s*(\d{1,3})\s*\*\*([^*]+)\*\*/);
    if (stageHead) {
      if (vol === null) vol = makeVolume('', '');
      const st: OutlineStageDto = { title: stripMd(stageHead[3]), body: '', seq: vol.stages.length, cards: [] };
      vol.stages.push(st);
      const rest = t.slice(stageHead[0].length).replace(/^[\s：:]+/, '');
      for (const c of extractCards(rest)) {
        if (canAdd(c)) addCardTo(st, c);
      }
      // 阶段行后无阶段头的卡行落回默认阶段（如卷四 49/50 章不属于饭局篇）
      stage = null;
      continue;
    }
    // v3 粗体单元行（无编号行首粗体，如「**阶段A 「结婚那年」**（2003）」）→ 建卷
    const unit = t.match(/^\*\*(.+?)\*\*\s*(.*)$/);
    if (unit) {
      const title = stripMd(unit[1]);
      const body = stripMd(unit[2].replace(/^[（(]/, '').replace(/[）)]$/, ''));
      vol = makeVolume(title, body);
      stage = null;
      outlineLines.push(body !== '' ? `${title}：${body}` : title);
      continue;
    }
    const cards = extractCards(t);
    if (cards.length > 0) {
      for (const c of cards) addCard(c);
      continue;
    }
    // 兜底：无编号行成卡（bullet 取首个粗体为题，余为切片题）；无当前卷时散行不成卡（v3 子节叙述性散文）
    if (vol === null) continue;
    const bare = t.replace(/^[-·]\s+/, '');
    const bm = bare.match(/\*\*(.+?)\*\*/);
    let title = '';
    let body = '';
    if (bm) {
      title = stripMd(bm[1]);
      body = stripMd(bare.slice((bm.index ?? 0) + bm[0].length).replace(/^[：:\s]+/, ''));
    } else {
      body = stripMd(bare);
      title = body.slice(0, 20);
    }
    if (title !== '' || body !== '') addCard({ title, body, chapterFrom: null, chapterTo: null });
  }
}

/** 悬置线/伏笔：全文 H3 标题含关键词 → 编号项逐条 plantedCh=1；无编号命中时回退 ／ 短语串逐条（v3 精炼形态）。 */
function parseForeshadowings(
  h3Blocks: Section[],
  warnings: string[],
  out: SettingsImportForeshadowingDraft[],
  plain = false,
): void {
  let capWarned = false;
  const pushFs = (desc: string): boolean => {
    if (out.length >= FORESHADOWINGS_CAP) {
      if (!capWarned) {
        warnings.push(`伏笔超过 ${FORESHADOWINGS_CAP} 条，已截断（保留前 ${FORESHADOWINGS_CAP}）`);
        capWarned = true;
      }
      return false;
    }
    out.push({ description: desc, plantedCh: 1 });
    return true;
  };
  outer: for (const b of h3Blocks) {
    if (!/悬置|伏笔/.test(b.heading)) continue;
    const text = b.lines
      .map((l) => l.trim())
      .filter((l) => l !== '' && !/^-{3,}$/.test(l))
      .join(plain ? '；' : '\n');
    let pushedFromSegs = 0;
    for (const seg of anchorSegments(text)) {
      const item = seg.replace(/^\s*[；：;:｜]/, '').trim();
      const numM = item.match(/^(\d{1,3})\s*[.、．]?\s*/);
      if (!numM) continue;
      const desc = stripMd(item.slice(numM[0].length)).replace(/[。\s]+$/, '');
      if (desc === '') continue;
      if (!pushFs(desc)) break outer;
      pushedFromSegs += 1;
    }
    if (pushedFromSegs === 0) {
      // 无编号 → ／／＋； 短语串回退（v3「贼眼／表叔拜访／…」，短语可短至 2 字）；「同 v2」类引用短语跳过
      for (const part of text.split(/\s*[／＋]\s*|\s*；\s*|\n+/)) {
        const desc = stripMd(part).replace(/[。\s]+$/, '');
        if (desc.length < 2 || /^(同|照)\s*v?\d?\s*$|^不变/.test(desc)) continue;
        if (!pushFs(desc)) break outer;
      }
    }
  }
}

/** 设定集 MD → 结构化草稿（不入库；确认后走 /api/settings-import/apply，DEC-2026-1120-04）。 */
export function parseSettingsCompendium(raw: string): SettingsImportDraftDto {
  const warnings: string[] = [];
  const doc = splitDoc(raw);
  // S1：全文 0 H2 且 0 H3 时启用行式标题合成；产出非空才置 plain。伏笔桶改投 h3Blocks 供悬置扫描。
  let plain = false;
  if (doc.sections.length === 0 && doc.h3Blocks.length === 0) {
    const synthesized = synthesizePlainSections(raw);
    if (synthesized.length > 0) {
      plain = true;
      doc.sections = synthesized.filter((s) => s.heading !== '伏笔');
      doc.h3Blocks = synthesized.filter((s) => s.heading === '伏笔');
    }
  }

  // 标题：H1《》内文；无则剥设定集后缀取前 40 字
  let title = '';
  const bookMatch = doc.h1.match(/《(.+?)》/);
  if (bookMatch) {
    title = bookMatch[1].trim();
  } else if (doc.h1 !== '') {
    title = doc.h1.replace(/[·\-\s]*(?:扩写)?设定集\s*$/, '').trim().slice(0, 40);
  }
  // S6：纯文本且无 H1 → 首个非空行兜底书名
  if (plain && doc.h1 === '') {
    const firstLine = raw.split('\n').map((l) => l.trim()).find((l) => l !== '') ?? '';
    const plainBook = firstLine.match(/《(.+?)》/);
    if (plainBook) {
      title = plainBook[1].trim();
    } else if (firstLine.length <= 40 && /设定集\s*$/.test(firstLine)) {
      title = firstLine.replace(/[·\-\s]*(?:扩写)?设定集\s*$/, '').trim();
    }
  }

  // description = 全文精炼前置（追加裁决：定位句起头、文档序、表格压行；v3 全文≈1.3 万字，v4 至 20000 预算内）
  const description = refineForDescription(raw);
  if (description.length > DESCRIPTION_BUDGET) {
    warnings.push(`description 现有 ${description.length} 字，超出世界观槽预算 ${DESCRIPTION_BUDGET} 字的部分在生成时会被截断，建议精炼`);
  }

  const characters: SettingsImportCharacterDraft[] = [];
  const charactersSec = doc.sections.find((s) => s.heading.includes('人物'));
  parseCharacters(charactersSec, warnings, characters, plain);

  const tree: OutlineTreeDto = { volumes: [] };
  const allCards: ParsedCard[] = [];
  const outlineLines: string[] = [];
  const outlineSec = doc.sections.find((s) => s.heading.includes('大纲'));
  parseOutline(outlineSec, warnings, tree, allCards, outlineLines, plain);
  // 关系发生矩阵（v3 新增「全书剧情总账」）精炼追加进剧情大纲；v2 无矩阵节不触发
  const matrixSec = doc.sections.find((s) => s.heading.includes('矩阵'));
  const outline = [outlineLines.join('\n'), matrixSec ? refineForDescription(matrixSec.lines.join('\n')) : '']
    .filter((p) => p !== '')
    .join('\n');
  if (outline.length > OUTLINE_BUDGET) {
    warnings.push(`剧情大纲现有 ${outline.length} 字，超出大纲槽预算 ${OUTLINE_BUDGET} 字的部分会被截断，建议精炼`);
  }

  // 书级落地策略预览警示（DEC-2026-1122-01）：全书 0 落地格而设定集含「分级制」表述时提示可开启
  const landingCellCount = allCards.filter((c) => parseLandingCell(c.body) !== null).length;
  if (landingCellCount === 0 && description.includes('分级制')) {
    warnings.push('全书大纲卡未解析出任何落地格，而设定集含「分级制」表述；如需每章落地保障，可在导入时勾选「启用书级落地策略」，或导入后在书籍设置开启');
  }

  // 章级蓝图预填：带章号卡逐章展开（区间卡逐章展开共享梗概，产能=先写开场 12 章可直发审阅），章号去重升序
  const outlineItems: OutlineItemDto[] = [];
  const chapterTitles: Record<string, string> = {};
  const seenCh = new Set<number>();
  let itemsCapped = false;
  outerItems: for (const c of allCards) {
    if (c.chapterFrom === null) continue;
    const to = Math.min(c.chapterTo ?? c.chapterFrom, c.chapterFrom + 49);
    for (let ch = c.chapterFrom; ch <= to; ch++) {
      if (seenCh.has(ch)) continue;
      if (outlineItems.length >= 300) {
        if (!itemsCapped) {
          warnings.push('章级蓝图预填超过 300 章，已截断');
          itemsCapped = true;
        }
        break outerItems;
      }
      seenCh.add(ch);
      outlineItems.push({ chapterNo: ch, blueprint: { goal: c.body !== '' ? c.body : c.title, beats: [], mustHaveBeats: [], bannedTopics: [] } });
      chapterTitles[String(ch)] = c.title;
    }
  }
  outlineItems.sort((a, b) => a.chapterNo - b.chapterNo);

  const foreshadowings: SettingsImportForeshadowingDraft[] = [];
  parseForeshadowings(doc.h3Blocks, warnings, foreshadowings, plain);

  const styleSec = doc.sections.find((s) => s.heading.includes('文风'));
  const styleSection = cleanBlock(styleSec);

  // 消费节清单（规格 §2 v2.2）：与 :494/:499/:501/:542/:447 五处判定同一事实源；固定序，未命中不产条目。
  const consumedSections = [
    charactersSec?.heading,
    outlineSec?.heading,
    matrixSec?.heading,
    styleSec?.heading,
    ...doc.h3Blocks.filter((b) => /悬置|伏笔/.test(b.heading)).map((b) => b.heading),
  ].filter((h): h is string => h !== undefined);

  if (
    !plain &&
    title === '' &&
    characters.length === 0 &&
    tree.volumes.length === 0 &&
    foreshadowings.length === 0 &&
    styleSection === ''
  ) {
    warnings.push('未识别到设定集骨架，可手填后导入');
  }

  return {
    title,
    description,
    consumedSections,
    outline,
    characters,
    outlineTree: tree,
    foreshadowings,
    outlineItems,
    chapterTitles,
    styleSection,
    importStyle: true,
    warnings,
  };
}
