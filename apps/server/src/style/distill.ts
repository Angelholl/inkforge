import fs from 'node:fs';
import type { Database } from '../db/open';
import type { LlmProvider } from '../llm/types';
import { analyzeStyle, saveStyleProfile } from './analysis';
import { pickFewShotAndHeldOut } from './sample';

export interface StyleSample {
  id: string;
  text: string;
}

export interface StyleProfileRow {
  id: string;
  name: string;
  source_path: string;
  source_hash: string;
  version: number;
  rules_json: string;
  samples_json: string;
  metrics_json: string;
  created_at: string;
}

/** 蒸馏（签名不变，CLI 兼容）：= analyzeStyle + saveStyleProfile。
 *  input.samples 显式给定时优先（CLI 传样，此时无 held-out 自评）；缺省走 pickFewShotAndHeldOut，
 *  后半窗 held-out 2 段自动自评（SCORE/REASON，缺行 evaluation=[]）。
 *  sourceText（inline）与 sourcePath（文件路径）二选一。 */
export async function distillStyleProfile(
  deps: { db: Database; provider: LlmProvider },
  input: { name: string; sourcePath?: string; sourceText?: string; samples?: Array<StyleSample | string> },
): Promise<string> {
  const source = input.sourceText ?? (input.sourcePath !== undefined ? fs.readFileSync(input.sourcePath, 'utf8') : '');
  if (source.replace(/\s/g, '') === '') {
    throw new Error('样本为空，禁止蒸馏');
  }
  const explicit = input.samples !== undefined && input.samples.length > 0;
  const sampled = pickFewShotAndHeldOut(source);
  const fewShot = explicit ? input.samples!.map((x, i) => (typeof x === 'string' ? { id: `s${i}`, text: x } : x)).map((s) => s.text) : sampled.fewShot;
  const { analysis, evaluation } = await analyzeStyle({ provider: deps.provider }, { sourceText: source, samples: fewShot, heldOut: explicit ? [] : sampled.heldOut });
  const normalized: StyleSample[] = fewShot.map((t, i) => ({ id: `s${i}`, text: t }));
  const { id } = saveStyleProfile(deps.db, { name: input.name, source, sourcePath: input.sourcePath, analysis, samples: normalized, evaluation });
  return id;
}

export function getLatestProfile(db: Database, profileId: string): StyleProfileRow | undefined {
  return db.prepare('SELECT * FROM style_profiles WHERE id = ?').get(profileId) as StyleProfileRow | undefined;
}
