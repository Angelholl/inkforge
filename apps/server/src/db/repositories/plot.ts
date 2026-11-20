import { randomUUID } from 'node:crypto';
import type { Database } from '../open';
import type { PlotDraft } from '../../plot';

interface PlotProfileRow {
  id: string;
  name: string;
  source_path: string;
  source_hash: string;
  structure_json: string;
  created_at: string;
}

export interface PlotProfileDetail {
  id: string;
  name: string;
  sourcePath: string;
  sourceHash: string;
  structure: string[];
  createdAt: string;
}

/** 剧情档案入库（DEC-2026-1120-03）：无 version 语义（每条蒸馏=独立档案，沿 imitation 同构但去掉版本轴）。 */
export function savePlotProfile(db: Database, draft: PlotDraft): { id: string } {
  const id = randomUUID();
  db.prepare(
    'INSERT INTO plot_profiles(id, name, source_path, source_hash, structure_json, created_at) VALUES(?,?,?,?,?,?)',
  ).run(
    id,
    draft.name,
    draft.sourcePath,
    draft.sourceHash,
    JSON.stringify(draft.structure),
    new Date().toISOString(),
  );
  return { id };
}

export function listPlotProfiles(db: Database): PlotProfileDetail[] {
  const rows = db.prepare('SELECT * FROM plot_profiles ORDER BY created_at DESC').all() as PlotProfileRow[];
  return rows.map(toDetail);
}

export function getPlotProfile(db: Database, id: string): PlotProfileDetail | undefined {
  const row = db.prepare('SELECT * FROM plot_profiles WHERE id = ?').get(id) as PlotProfileRow | undefined;
  return row ? toDetail(row) : undefined;
}

/** 删档案并解绑全部引用（books.plot_profile_id 无 FK，防悬挂绑定，沿 deleteImitationProfile 先例）。 */
export function deletePlotProfile(db: Database, id: string): boolean {
  const row = db.prepare('SELECT id FROM plot_profiles WHERE id = ?').get(id);
  if (!row) return false;
  const tx = db.transaction(() => {
    db.prepare('UPDATE books SET plot_profile_id = NULL WHERE plot_profile_id = ?').run(id);
    db.prepare('DELETE FROM plot_profiles WHERE id = ?').run(id);
  });
  tx();
  return true;
}

function toDetail(r: PlotProfileRow): PlotProfileDetail {
  let structure: string[] = [];
  try {
    structure = JSON.parse(r.structure_json) as string[];
  } catch {
    /* 坏 JSON 降级空数组 */
  }
  return { id: r.id, name: r.name, sourcePath: r.source_path, sourceHash: r.source_hash, structure, createdAt: r.created_at };
}
