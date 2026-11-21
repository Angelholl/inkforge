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
 */
function refineForDescription(raw: string): string {
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
  let pendingSubTitle = '';
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
      .join('\n');
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

  // 标题：H1《》内文；无则剥设定集后缀取前 40 字
  let title = '';
  const bookMatch = doc.h1.match(/《(.+?)》/);
  if (bookMatch) {
    title = bookMatch[1].trim();
  } else if (doc.h1 !== '') {
    title = doc.h1.replace(/[·\-\s]*(?:扩写)?设定集\s*$/, '').trim().slice(0, 40);
  }

  // description = 全文精炼前置（追加裁决：定位句起头、文档序、表格压行；v3 全文≈1.3 万字，v4 至 20000 预算内）
  const description = refineForDescription(raw);
  if (description.length > DESCRIPTION_BUDGET) {
    warnings.push(`description 现有 ${description.length} 字，超出世界观槽预算 ${DESCRIPTION_BUDGET} 字的部分在生成时会被截断，建议精炼`);
  }

  const characters: SettingsImportCharacterDraft[] = [];
  parseCharacters(doc.sections.find((s) => s.heading.includes('人物')), warnings, characters);

  const tree: OutlineTreeDto = { volumes: [] };
  const allCards: ParsedCard[] = [];
  const outlineLines: string[] = [];
  parseOutline(doc.sections.find((s) => s.heading.includes('大纲')), warnings, tree, allCards, outlineLines);
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
  parseForeshadowings(doc.h3Blocks, warnings, foreshadowings);

  const styleSection = cleanBlock(doc.sections.find((s) => s.heading.includes('文风')));

  if (
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
