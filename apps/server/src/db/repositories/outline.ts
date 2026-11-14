import { randomUUID } from 'node:crypto';
import type { OutlineCardDto, OutlineStageDto, OutlineTreeDto, OutlineVolumeDto } from '@inkforge/shared';
import type { Database } from '../open';

interface OutlineNodeRow {
  id: string;
  parent_id: string;
  level: 'volume' | 'stage' | 'card';
  seq: number;
  title: string;
  body: string;
  chapter_from: number | null;
  chapter_to: number | null;
}

/** 写入侧宽松形状：seq 不收（按数组顺序归一），字段可缺省；OutlineTreeDto 结构相容。 */
export interface OutlineTreeInput {
  volumes: Array<{
    title?: string;
    body?: string;
    stages?: Array<{
      title?: string;
      body?: string;
      cards?: Array<{ title?: string; body?: string; chapterFrom?: number | null; chapterTo?: number | null }>;
    }>;
  }>;
}

/** 整树替换（事务 delete+insert）：seq 按数组顺序 1..n 归一，id 重生成；空树=清空该书节点。 */
export function replaceOutlineTree(db: Database, bookId: string, tree: OutlineTreeInput): void {
  const now = new Date().toISOString();
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM outline_nodes WHERE book_id = ?').run(bookId);
    const ins = db.prepare(
      `INSERT INTO outline_nodes(id, book_id, parent_id, level, seq, title, body, chapter_from, chapter_to, created_at)
       VALUES(?,?,?,?,?,?,?,?,?,?)`,
    );
    let vSeq = 0;
    for (const v of tree.volumes ?? []) {
      const vId = randomUUID();
      ins.run(vId, bookId, '', 'volume', ++vSeq, v.title ?? '', v.body ?? '', null, null, now);
      let sSeq = 0;
      for (const s of v.stages ?? []) {
        const sId = randomUUID();
        ins.run(sId, bookId, vId, 'stage', ++sSeq, s.title ?? '', s.body ?? '', null, null, now);
        let cSeq = 0;
        for (const c of s.cards ?? []) {
          ins.run(
            randomUUID(),
            bookId,
            sId,
            'card',
            ++cSeq,
            c.title ?? '',
            c.body ?? '',
            c.chapterFrom ?? null,
            c.chapterTo ?? null,
            now,
          );
        }
      }
    }
  });
  tx();
}

/** 读整树（无行 → null）；各级按 seq 升序组装。 */
export function getOutlineTree(db: Database, bookId: string): OutlineTreeDto | null {
  const rows = db
    .prepare('SELECT id, parent_id, level, seq, title, body, chapter_from, chapter_to FROM outline_nodes WHERE book_id = ?')
    .all(bookId) as OutlineNodeRow[];
  if (rows.length === 0) return null;
  const cardsByStage = new Map<string, OutlineCardDto[]>();
  for (const r of rows.filter((r) => r.level === 'card').sort((a, b) => a.seq - b.seq)) {
    const list = cardsByStage.get(r.parent_id) ?? [];
    list.push({ title: r.title, body: r.body, seq: r.seq, chapterFrom: r.chapter_from, chapterTo: r.chapter_to });
    cardsByStage.set(r.parent_id, list);
  }
  const stagesByVol = new Map<string, OutlineStageDto[]>();
  for (const r of rows.filter((r) => r.level === 'stage').sort((a, b) => a.seq - b.seq)) {
    const list = stagesByVol.get(r.parent_id) ?? [];
    list.push({ title: r.title, body: r.body, seq: r.seq, cards: cardsByStage.get(r.id) ?? [] });
    stagesByVol.set(r.parent_id, list);
  }
  const volumes: OutlineVolumeDto[] = rows
    .filter((r) => r.level === 'volume')
    .sort((a, b) => a.seq - b.seq)
    .map((r) => ({ title: r.title, body: r.body, seq: r.seq, stages: stagesByVol.get(r.id) ?? [] }));
  return { volumes };
}
