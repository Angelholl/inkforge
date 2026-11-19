import type {
  OutlineItemDto,
  OutlineStageDto,
  OutlineTreeDto,
  OutlineVolumeDto,
  SettingsImportCharacterDraft,
  SettingsImportDraftDto,
  SettingsImportForeshadowingDraft,
} from '@inkforge/shared';

// ── 预算警示阈值：与 config.ts BUDGETS_DRAFT.worldview / BUDGETS_OUTLINE.outline 对齐（DEC-2026-1120-04① 完全加载扩槽）──
const DESCRIPTION_BUDGET = 16000;
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

/** 节体清洗：剥行首标题标记/标注 tag/粗体标记，保留行结构。 */
function cleanBlock(sec: Section | undefined): string {
  if (!sec) return '';
  return sec.lines
    .map((l) => stripMd(l.replace(/^\s*#{1,6}\s*/, '')))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
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

/** 锚点切分：编号段起点（行首或 ；：;: 后接 1-3 位数字，可选 N–M 区间）。 */
function anchorSegments(text: string): string[] {
  const re = /(?:^|[；：;:])\s*(\d{1,3})(?:\s*[–—-]\s*(\d{1,3}))?/g;
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

/** 编号段 → 卡：题=编号后至首个括号组（剥粗体/尾孤括号），梗概=段尾闭合的顶层括号内文。 */
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

/** 人物卡三形态：①粗体行段 ②表格行首格粗体 ③bullet 首粗体；'**标签**：…' 段与重名跳过。 */
function parseCharacters(
  sec: Section | undefined,
  warnings: string[],
  out: SettingsImportCharacterDraft[],
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
    if (t.startsWith('|')) {
      flush();
      const cells = t.replace(/^\|/, '').replace(/\|$/, '').split('|').map((x) => x.trim());
      const bm = cells[0]?.match(/\*\*(.+?)\*\*/);
      if (!bm) continue;
      const rest1 = stripMd(cells[0].slice((bm.index ?? 0) + bm[0].length));
      const setting = [rest1, ...cells.slice(1)].filter((x) => x !== '').join('；');
      pushChar(stripParensNote(stripMd(bm[1])), setting);
      continue;
    }
    if (/^[-·]\s+/.test(t)) {
      flush();
      const bm = t.match(/\*\*(.+?)\*\*/);
      if (!bm) continue;
      const rest = t.slice((bm.index ?? 0) + bm[0].length).replace(/^[\s：:]+/, '');
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

/** 总大纲 → 卷/阶段/卡 + 卷级梗概行；区间篇行成阶段，编号行成卡，无编号行兜底成卡（blockquote/分隔线除外）。 */
function parseOutline(
  sec: Section | undefined,
  warnings: string[],
  tree: OutlineTreeDto,
  allCards: ParsedCard[],
  outlineLines: string[],
): void {
  if (!sec) return;
  let vol: OutlineVolumeDto | null = null;
  let stage: OutlineStageDto | null = null;
  let cardTotal = 0;
  let capWarned = false;

  const makeVolume = (title: string, body: string): OutlineVolumeDto => {
    const v: OutlineVolumeDto = { title, body, seq: tree.volumes.length, stages: [] };
    tree.volumes.push(v);
    return v;
  };
  const ensureStage = (): OutlineStageDto => {
    if (stage === null) {
      if (vol === null) vol = makeVolume('', '');
      stage = { title: '', body: '', seq: vol.stages.length, cards: [] };
      vol.stages.push(stage);
    }
    return stage;
  };
  const addCardTo = (st: OutlineStageDto, c: ParsedCard): void => {
    if (cardTotal >= CARDS_CAP) {
      if (!capWarned) {
        warnings.push(`章卡超过 ${CARDS_CAP} 张，已截断（保留前 ${CARDS_CAP}）`);
        capWarned = true;
      }
      return;
    }
    cardTotal += 1;
    st.cards.push({ title: c.title, body: c.body, seq: st.cards.length, chapterFrom: c.chapterFrom, chapterTo: c.chapterTo });
    allCards.push(c);
  };
  const addCard = (c: ParsedCard): void => addCardTo(ensureStage(), c);

  for (const rawLine of sec.lines) {
    const t = rawLine.trim();
    if (t === '') continue;
    const h3 = t.match(/^#{3,6}\s+(.*)$/);
    if (h3) {
      const h3Text = stripMd(h3[1]);
      const vm = h3Text.match(/^(.*?)\s*《(.+?)》/);
      const title = vm ? `${vm[1]} ${vm[2]}`.trim() : h3Text;
      const body = vm ? stripMd(h3Text.slice(h3Text.indexOf(vm[0]) + vm[0].length)) : '';
      vol = makeVolume(stripMd(title), body);
      stage = null;
      outlineLines.push(h3Text);
      continue;
    }
    const stageHead = t.match(/^(\d{1,3})\s*[–—-]\s*(\d{1,3})\s*\*\*([^*]+)\*\*/);
    if (stageHead) {
      if (vol === null) vol = makeVolume('', '');
      const st: OutlineStageDto = { title: stripMd(stageHead[3]), body: '', seq: vol.stages.length, cards: [] };
      vol.stages.push(st);
      const rest = t.slice(stageHead[0].length).replace(/^[\s：:]+/, '');
      for (const c of extractCards(rest)) addCardTo(st, c);
      // 阶段行后无阶段头的卡行落回默认阶段（如卷四 49/50 章不属于饭局篇）
      stage = null;
      continue;
    }
    if (/^>/.test(t) || /^-{3,}$/.test(t)) continue;
    const cards = extractCards(t);
    if (cards.length > 0) {
      for (const c of cards) addCard(c);
      continue;
    }
    // 兜底：无编号行成卡（bullet 取首个粗体为题，余为切片题）
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

/** 悬置线/伏笔：全文 H3 标题含关键词 → 编号项逐条 plantedCh=1。 */
function parseForeshadowings(
  h3Blocks: Section[],
  warnings: string[],
  out: SettingsImportForeshadowingDraft[],
): void {
  let capWarned = false;
  outer: for (const b of h3Blocks) {
    if (!/悬置|伏笔/.test(b.heading)) continue;
    const text = b.lines
      .map((l) => l.trim())
      .filter((l) => l !== '' && !/^-{3,}$/.test(l))
      .join('\n');
    for (const seg of anchorSegments(text)) {
      const item = seg.replace(/^\s*[；：;:]/, '').trim();
      const numM = item.match(/^(\d{1,3})\s*[.、．]?\s*/);
      if (!numM) continue;
      const desc = stripMd(item.slice(numM[0].length)).replace(/[。\s]+$/, '');
      if (desc === '') continue;
      if (out.length >= FORESHADOWINGS_CAP) {
        if (!capWarned) {
          warnings.push(`伏笔超过 ${FORESHADOWINGS_CAP} 条，已截断（保留前 ${FORESHADOWINGS_CAP}）`);
          capWarned = true;
        }
        break outer;
      }
      out.push({ description: desc, plantedCh: 1 });
    }
  }
}

/** 设定集 MD → 结构化草稿（不入库；确认后走 /api/settings-import/apply，DEC-2026-1120-04）。 */
export function parseSettingsCompendium(raw: string): SettingsImportDraftDto {
  const warnings: string[] = [];
  const doc = splitDoc(raw);

  // 标题：H1《》内文；无则剥设定集后缀取前 40 字
  let title = '';
  const bookMatch = doc.h1.match(/《(.+?)》/);
  if (bookMatch) {
    title = bookMatch[1].trim();
  } else if (doc.h1 !== '') {
    title = doc.h1.replace(/[·\-\s]*(?:扩写)?设定集\s*$/, '').trim().slice(0, 40);
  }

  // description = 定位句 + 世界观节 + 规则体系节（拍板①：扩槽后全量承载，超 16000 警示）
  const description = [doc.firstQuote, cleanBlock(doc.sections.find((s) => s.heading.includes('世界观'))), cleanBlock(doc.sections.find((s) => s.heading.includes('规则')))]
    .filter((p) => p !== '')
    .join('\n\n');
  if (description.length > DESCRIPTION_BUDGET) {
    warnings.push(`description 现有 ${description.length} 字，超出世界观槽预算 ${DESCRIPTION_BUDGET} 字的部分在生成时会被截断，建议精炼`);
  }

  const characters: SettingsImportCharacterDraft[] = [];
  parseCharacters(doc.sections.find((s) => s.heading.includes('人物')), warnings, characters);

  const tree: OutlineTreeDto = { volumes: [] };
  const allCards: ParsedCard[] = [];
  const outlineLines: string[] = [];
  parseOutline(doc.sections.find((s) => s.heading.includes('大纲')), warnings, tree, allCards, outlineLines);
  const outline = outlineLines.join('\n');
  if (outline.length > OUTLINE_BUDGET) {
    warnings.push(`剧情大纲现有 ${outline.length} 字，超出大纲槽预算 ${OUTLINE_BUDGET} 字的部分会被截断，建议精炼`);
  }

  // 章级蓝图预填：卡带章号逐章展开（区间卡不展开），章号去重
  const outlineItems: OutlineItemDto[] = [];
  const chapterTitles: Record<string, string> = {};
  const seenCh = new Set<number>();
  for (const c of allCards) {
    if (c.chapterFrom === null || seenCh.has(c.chapterFrom)) continue;
    seenCh.add(c.chapterFrom);
    outlineItems.push({ chapterNo: c.chapterFrom, blueprint: { goal: c.body !== '' ? c.body : c.title, beats: [], mustHaveBeats: [], bannedTopics: [] } });
    chapterTitles[String(c.chapterFrom)] = c.title;
  }

  const foreshadowings: SettingsImportForeshadowingDraft[] = [];
  parseForeshadowings(doc.h3Blocks, warnings, foreshadowings);

  const styleSection = cleanBlock(doc.sections.find((s) => s.heading.includes('文风')));

  if (
    title === '' &&
    description === '' &&
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
