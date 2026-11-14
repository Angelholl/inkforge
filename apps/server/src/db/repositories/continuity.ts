import { randomUUID } from 'node:crypto';
import type { Database } from '../open';

export interface Summary {
  chapterNo: number;
  summary: string;
  beats: string[];
  openThreads: string[];
}

export interface Foreshadowing {
  id: string;
  bookId: string;
  description: string;
  plantedCh: number;
  advancedJson: string;
  resolvedCh?: number;
  status: 'open' | 'advanced' | 'resolved';
}

interface SummaryRow {
  chapter_no: number;
  summary: string;
  beats_json: string;
  open_threads_json: string;
}

export function upsertChapterSummary(
  db: Database,
  input: { bookId: string; chapterNo: number; summary: string; beats: string[]; openThreads: string[] },
): void {
  db.prepare(
    `INSERT INTO chapter_summaries(id, book_id, chapter_no, summary, beats_json, open_threads_json, created_at)
     VALUES(?,?,?,?,?,?,?)
     ON CONFLICT(book_id, chapter_no) DO UPDATE SET summary=excluded.summary, beats_json=excluded.beats_json, open_threads_json=excluded.open_threads_json`,
  ).run(randomUUID(), input.bookId, input.chapterNo, input.summary, JSON.stringify(input.beats), JSON.stringify(input.openThreads), new Date().toISOString());
}

export function getRecentSummaries(db: Database, bookId: string, beforeChapterNo: number, limit = 3): Summary[] {
  const rows = db
    .prepare('SELECT * FROM chapter_summaries WHERE book_id = ? AND chapter_no < ? ORDER BY chapter_no DESC LIMIT ?')
    .all(bookId, beforeChapterNo, limit) as SummaryRow[];
  return rows.map((r) => ({
    chapterNo: r.chapter_no,
    summary: r.summary,
    beats: JSON.parse(r.beats_json) as string[],
    openThreads: JSON.parse(r.open_threads_json) as string[],
  }));
}

export function upsertCharacterState(db: Database, input: { characterId: string; chapterNo: number; state: object }): void {
  db.prepare(
    `INSERT INTO character_states(id, character_id, chapter_no, state_json, created_at)
     VALUES(?,?,?,?,?)
     ON CONFLICT(character_id, chapter_no) DO UPDATE SET state_json=excluded.state_json`,
  ).run(randomUUID(), input.characterId, input.chapterNo, JSON.stringify(input.state), new Date().toISOString());
}

export function upsertForeshadowing(
  db: Database,
  input: { bookId: string; description: string; plantedCh: number; status?: 'open' | 'advanced' | 'resolved'; resolvedCh?: number },
): string {
  const id = randomUUID();
  db.prepare(
    'INSERT INTO foreshadowings(id, book_id, description, planted_ch, resolved_ch, status, created_at) VALUES(?,?,?,?,?,?,?)',
  ).run(id, input.bookId, input.description, input.plantedCh, input.resolvedCh ?? null, input.status ?? 'open', new Date().toISOString());
  return id;
}

export function listForeshadowings(db: Database, bookId: string): Foreshadowing[] {
  const rows = db.prepare('SELECT * FROM foreshadowings WHERE book_id = ? ORDER BY planted_ch').all(bookId) as Array<Record<string, unknown>>;
  return rows.map(
    (r) =>
      ({
        id: r.id,
        bookId: r.book_id,
        description: r.description,
        plantedCh: r.planted_ch,
        advancedJson: r.advanced_json,
        resolvedCh: (r.resolved_ch as number | null) ?? undefined,
        status: r.status,
      }) as Foreshadowing,
  );
}

export function getForeshadowing(db: Database, id: string): Foreshadowing | undefined {
  const rows = db.prepare('SELECT * FROM foreshadowings WHERE id = ?').all(id) as Array<Record<string, unknown>>;
  if (rows.length === 0) return undefined;
  const r = rows[0];
  return {
    id: r.id,
    bookId: r.book_id,
    description: r.description,
    plantedCh: r.planted_ch,
    advancedJson: r.advanced_json,
    resolvedCh: (r.resolved_ch as number | null) ?? undefined,
    status: r.status,
  } as Foreshadowing;
}

/** 更新伏笔（C2）：patch 合并；status=resolved 必须能落到 resolvedCh（请求带或已有），否则抛错。 */
export function updateForeshadowing(
  db: Database,
  id: string,
  patch: { description?: string; plantedCh?: number; status?: 'open' | 'advanced' | 'resolved'; resolvedCh?: number },
): Foreshadowing | undefined {
  const cur = db.prepare('SELECT * FROM foreshadowings WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!cur) return undefined;
  const status = patch.status ?? (cur.status as Foreshadowing['status']);
  const resolvedCh = patch.resolvedCh ?? (cur.resolved_ch as number | null) ?? undefined;
  if (status === 'resolved' && resolvedCh === undefined) {
    throw new Error('resolved 状态必须带 resolvedCh');
  }
  db.prepare('UPDATE foreshadowings SET description=?, planted_ch=?, status=?, resolved_ch=? WHERE id=?').run(
    patch.description ?? (cur.description as string),
    patch.plantedCh ?? (cur.planted_ch as number),
    status,
    status === 'resolved' ? resolvedCh : (patch.resolvedCh ?? (cur.resolved_ch as number | null) ?? null),
    id,
  );
  return getForeshadowing(db, id);
}

export function deleteForeshadowing(db: Database, id: string): boolean {
  const r = db.prepare('DELETE FROM foreshadowings WHERE id = ?').run(id);
  return r.changes > 0;
}

export function resolveForeshadowing(db: Database, id: string, chapterNo: number, status: 'advanced' | 'resolved'): void {
  if (status === 'resolved') {
    db.prepare("UPDATE foreshadowings SET status = 'resolved', resolved_ch = ? WHERE id = ?").run(chapterNo, id);
  } else {
    db.prepare("UPDATE foreshadowings SET status = 'advanced' WHERE id = ?").run(id);
  }
}

export function getContinuitySnapshot(
  db: Database,
  bookId: string,
  chapterNo: number,
): { characters: Array<{ name: string; state: object }>; openForeshadowings: Foreshadowing[]; summaries: Summary[] } {
  // 角色：仅取 < chapterNo 的最新一章状态
  const charRows = db
    .prepare(
      `SELECT cs.state_json, c.name FROM character_states cs
       JOIN characters c ON c.id = cs.character_id
       WHERE c.book_id = ? AND cs.chapter_no < ?
       AND cs.chapter_no = (SELECT MAX(cs2.chapter_no) FROM character_states cs2 WHERE cs2.character_id = cs.character_id AND cs2.chapter_no < ?)
       ORDER BY c.name`,
    )
    .all(bookId, chapterNo, chapterNo) as Array<{ state_json: string; name: string }>;
  const openRows = db
    .prepare("SELECT * FROM foreshadowings WHERE book_id = ? AND status != 'resolved' ORDER BY planted_ch")
    .all(bookId) as Foreshadowing[];
  return {
    characters: charRows.map((r) => ({ name: r.name, state: JSON.parse(r.state_json) as object })),
    openForeshadowings: openRows,
    summaries: getRecentSummaries(db, bookId, chapterNo),
  };
}

/** 渲染连续性快照为 L1/重写用的纯文本基线。 */
export function renderSnapshotText(snapshot: { characters: Array<{ name: string; state: object }>; openForeshadowings: Foreshadowing[]; summaries: Summary[] }): string {
  const lines: string[] = [];
  for (const s of [...snapshot.summaries].sort((a, b) => a.chapterNo - b.chapterNo)) {
    lines.push(`[第${s.chapterNo}章摘要] ${s.summary}`);
  }
  for (const c of snapshot.characters) {
    lines.push(`[角色状态] ${c.name}=${JSON.stringify(c.state)}`);
  }
  for (const f of snapshot.openForeshadowings) {
    lines.push(`[未回收伏笔] (第${f.plantedCh}章埋) ${f.description}`);
  }
  return lines.join('\n');
}
