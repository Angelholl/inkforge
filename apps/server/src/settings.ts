import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import type { Database } from './db/open';

export const settingsSchema = z.object({
  STRATA_BASE_URL: z.string().min(1).optional(),
  STRATA_API_KEY: z.string().min(1).optional(),
  STRATA_MODEL: z.string().min(1).optional(),
  INKFORGE_CLOUD_BASE_URL: z.string().optional(),
  INKFORGE_CLOUD_API_KEY: z.string().optional(),
  INKFORGE_CLOUD_MODEL: z.string().optional(),
  // INKFORGE_MOCK 已从文件通道移除（DEC-2026-1117-03）：mock 仅认环境变量（owner 拍板「彻底删除」收尾）。
  // zod 默认 strip 未知键：config.json 里旧开关写入的残留键被忽略，下次 writeSettingsFile 顺带洗掉。
});

export function configFilePath(): string {
  return process.env.INKFORGE_CONFIG_FILE ?? path.join(os.homedir(), '.inkforge', 'config.json');
}

/** 读取设置文件；文件缺失或 JSON 非法时返回 {}（容错不抛）。 */
export function readSettingsFile(p = configFilePath()): Record<string, string> {
  let raw: string;
  try {
    raw = fs.readFileSync(p, 'utf8');
  } catch {
    return {};
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return {};
  }
  const parsed = settingsSchema.parse(json);
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}

/** 原子写入设置文件：先写 <p>.tmp 再 rename 覆盖。 */
export function writeSettingsFile(obj: Record<string, string>, p = configFilePath()): void {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, p);
}

/** 入库分阈值存 app_meta 的键名（B3：阈值属运行时数据，存 DB 而非 config.json，改值无需重启）。 */
export const SCORE_THRESHOLD_KEY = 'quality_score_threshold';

/** 读入库分阈值：缺失、非数字或越界 [1,10] → undefined（调用方回落 config 默认）。 */
export function readScoreThreshold(db: Database): number | undefined {
  const row = db.prepare('SELECT value FROM app_meta WHERE key = ?').get(SCORE_THRESHOLD_KEY) as { value: string } | undefined;
  if (!row) return undefined;
  const n = Number(row.value);
  if (!Number.isFinite(n) || n < 1 || n > 10) return undefined;
  return n;
}

/** 写入库分阈值（upsert，沿用 routes.ts 里 app_meta.distill_template 的 ON CONFLICT 手法）。 */
export function writeScoreThreshold(db: Database, scoreThreshold: number): void {
  db.prepare('INSERT INTO app_meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(
    SCORE_THRESHOLD_KEY,
    String(scoreThreshold),
  );
}
