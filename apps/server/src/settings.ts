import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';

export const settingsSchema = z.object({
  STRATA_BASE_URL: z.string().min(1).optional(),
  STRATA_API_KEY: z.string().min(1).optional(),
  STRATA_MODEL: z.string().min(1).optional(),
  INKFORGE_CLOUD_BASE_URL: z.string().optional(),
  INKFORGE_CLOUD_API_KEY: z.string().optional(),
  INKFORGE_CLOUD_MODEL: z.string().optional(),
  INKFORGE_MOCK: z.enum(['0', '1']).optional(),
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
