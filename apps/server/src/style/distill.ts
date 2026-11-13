import fs from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import type { Database } from '../db/open';
import type { LlmProvider } from '../llm/types';
import { computeStyleMetrics } from './metrics';

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

const RULES_INSTRUCTION = `你是文风分析师。阅读以下文本样本，输出该文本的量化文风规则，格式为多行 RULES 行：
RULES: <一条规则>
每条规则须可执行、可判分，例如：平均句长区间、对话占比区间、段落长度、叙事人称、标点习惯、禁用句式。输出 5-10 条，不要其他内容。
【样本开始】`;

/** 蒸馏：LLM 仅产出量化规则；few-shot 客户端确定性选取；同 source_hash version+1 新行（旧行永不改）。
 * sourceText（inline 文本，source_path 记 `inline:<sha256 前8位>`）与 sourcePath（文件路径）二选一。 */
export async function distillStyleProfile(
  deps: { db: Database; provider: LlmProvider },
  input: { name: string; sourcePath?: string; sourceText?: string; samples: Array<StyleSample | string> },
): Promise<string> {
  const source = input.sourceText ?? (input.sourcePath !== undefined ? fs.readFileSync(input.sourcePath, 'utf8') : '');
  if (source.replace(/\s/g, '') === '') {
    throw new Error('样本为空，禁止蒸馏');
  }
  const sourceHash = createHash('sha256').update(source).digest('hex');
  const sourcePath = input.sourceText !== undefined ? `inline:${sourceHash.slice(0, 8)}` : input.sourcePath!;
  const user = `${RULES_INSTRUCTION}\n${input.samples.join('\n----\n')}\n【样本结束】`;
  const res = await deps.provider.complete({
    system: '你是文风分析师。',
    user,
    temperature: 0.3,
    topP: 0.9,
    maxOutputTokens: 4096,
    timeoutMs: 900000,
    meta: { step: 'summarize' },
  });
  const rules = res.text
    .split('\n')
    .filter((l) => l.trim().startsWith('RULES:'))
    .map((l) => l.trim().slice(6).trim())
    .filter((l) => l !== '');
  const normalized: StyleSample[] = input.samples.map((x, i) => (typeof x === 'string' ? { id: `s${i}`, text: x } : x));
  const rulesText = rules.join('\n');
  const prev = deps.db
    .prepare('SELECT version, rules_json, samples_json, metrics_json FROM style_profiles WHERE source_hash = ? ORDER BY version DESC')
    .get(sourceHash) as Pick<StyleProfileRow, 'version' | 'rules_json' | 'samples_json' | 'metrics_json'> | undefined;
  const version = (prev?.version ?? 0) + 1;
  const id = randomUUID();
  deps.db
    .prepare(
      'INSERT INTO style_profiles(id, name, source_path, source_hash, version, rules_json, samples_json, metrics_json, created_at) VALUES(?,?,?,?,?,?,?,?,?)',
    )
    .run(id, input.name, sourcePath, sourceHash, version, JSON.stringify({ rulesText }), JSON.stringify(normalized), JSON.stringify(computeStyleMetrics(source)), new Date().toISOString());
  return id;
}

export function getLatestProfile(db: Database, profileId: string): StyleProfileRow | undefined {
  return db.prepare('SELECT * FROM style_profiles WHERE id = ?').get(profileId) as StyleProfileRow | undefined;
}
