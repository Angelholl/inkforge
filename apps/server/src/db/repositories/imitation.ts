import { randomUUID } from 'node:crypto';
import type { OutlineItemDto } from '@inkforge/shared';
import type { Database } from '../open';
import type { ImitationDraft } from '../../imitation';

interface ImitationProfileRow {
  id: string;
  name: string;
  source_path: string;
  source_hash: string;
  version: number;
  structure_json: string;
  style_json: string;
  blueprint_json: string;
  metrics_json: string;
  created_at: string;
}

export interface ImitationProfileDetail {
  id: string;
  name: string;
  version: number;
  sourcePath: string;
  sourceHash: string;
  structure: string[];
  style: { rulesText: string };
  blueprint: OutlineItemDto[];
  metrics: Record<string, number | string>;
  createdAt: string;
}

/** 同 source_hash version+1 新行（不可变，沿 style_profiles 先例）；返回 id 与落库版本。 */
export function saveImitationProfile(db: Database, draft: ImitationDraft): { id: string; version: number } {
  const prev = db
    .prepare('SELECT MAX(version) AS v FROM imitation_profiles WHERE source_hash = ?')
    .get(draft.sourceHash) as { v: number | null };
  const version = (prev.v ?? 0) + 1;
  const id = randomUUID();
  db.prepare(
    'INSERT INTO imitation_profiles(id, name, source_path, source_hash, version, structure_json, style_json, blueprint_json, metrics_json, created_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
  ).run(
    id,
    draft.name,
    draft.sourcePath,
    draft.sourceHash,
    version,
    JSON.stringify(draft.structure),
    JSON.stringify(draft.style),
    JSON.stringify(draft.blueprint),
    JSON.stringify(draft.metrics),
    new Date().toISOString(),
  );
  return { id, version };
}

export function listImitationProfiles(db: Database): ImitationProfileDetail[] {
  const rows = db.prepare('SELECT * FROM imitation_profiles ORDER BY created_at DESC').all() as ImitationProfileRow[];
  return rows.map(toDetail);
}

export function getImitationProfile(db: Database, id: string): ImitationProfileDetail | undefined {
  const row = db.prepare('SELECT * FROM imitation_profiles WHERE id = ?').get(id) as ImitationProfileRow | undefined;
  return row ? toDetail(row) : undefined;
}

/** 删档案并解绑全部引用（books.imitation_profile_id 无 FK，防悬挂绑定）。 */
export function deleteImitationProfile(db: Database, id: string): boolean {
  const row = db.prepare('SELECT id FROM imitation_profiles WHERE id = ?').get(id);
  if (!row) return false;
  const tx = db.transaction(() => {
    db.prepare('UPDATE books SET imitation_profile_id = NULL WHERE imitation_profile_id = ?').run(id);
    db.prepare('DELETE FROM imitation_profiles WHERE id = ?').run(id);
  });
  tx();
  return true;
}

function toDetail(r: ImitationProfileRow): ImitationProfileDetail {
  return {
    id: r.id,
    name: r.name,
    version: r.version,
    sourcePath: r.source_path,
    sourceHash: r.source_hash,
    structure: JSON.parse(r.structure_json) as string[],
    style: JSON.parse(r.style_json) as { rulesText: string },
    blueprint: JSON.parse(r.blueprint_json) as OutlineItemDto[],
    metrics: JSON.parse(r.metrics_json) as Record<string, number | string>,
    createdAt: r.created_at,
  };
}
