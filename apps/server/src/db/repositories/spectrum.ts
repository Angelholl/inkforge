import { randomUUID } from 'node:crypto';
import type { Database } from '../open';
import type { SpectrumDraft } from '../../spectrum';

interface SpectrumProfileRow {
  id: string;
  name: string;
  source_path: string;
  source_hash: string;
  structure_json: string;
  created_at: string;
}

export interface SpectrumProfileDetail {
  id: string;
  name: string;
  sourcePath: string;
  sourceHash: string;
  structure: string[];
  createdAt: string;
}

/** 人物光谱档案入库（DEC-2026-1120-09）：无 version 语义（每条蒸馏=独立档案，镜像 plot 同构）。 */
export function saveSpectrumProfile(db: Database, draft: SpectrumDraft): { id: string } {
  const id = randomUUID();
  db.prepare(
    'INSERT INTO spectrum_profiles(id, name, source_path, source_hash, structure_json, created_at) VALUES(?,?,?,?,?,?)',
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

export function listSpectrumProfiles(db: Database): SpectrumProfileDetail[] {
  const rows = db.prepare('SELECT * FROM spectrum_profiles ORDER BY created_at DESC').all() as SpectrumProfileRow[];
  return rows.map(toDetail);
}

export function getSpectrumProfile(db: Database, id: string): SpectrumProfileDetail | undefined {
  const row = db.prepare('SELECT * FROM spectrum_profiles WHERE id = ?').get(id) as SpectrumProfileRow | undefined;
  return row ? toDetail(row) : undefined;
}

/** 删档案并解绑全部引用（books.spectrum_profile_id 无 FK，防悬挂绑定，沿 deletePlotProfile 先例）。 */
export function deleteSpectrumProfile(db: Database, id: string): boolean {
  const row = db.prepare('SELECT id FROM spectrum_profiles WHERE id = ?').get(id);
  if (!row) return false;
  const tx = db.transaction(() => {
    db.prepare('UPDATE books SET spectrum_profile_id = NULL WHERE spectrum_profile_id = ?').run(id);
    db.prepare('DELETE FROM spectrum_profiles WHERE id = ?').run(id);
  });
  tx();
  return true;
}

function toDetail(r: SpectrumProfileRow): SpectrumProfileDetail {
  let structure: string[] = [];
  try {
    structure = JSON.parse(r.structure_json) as string[];
  } catch {
    /* 坏 JSON 降级空数组 */
  }
  return { id: r.id, name: r.name, sourcePath: r.source_path, sourceHash: r.source_hash, structure, createdAt: r.created_at };
}
