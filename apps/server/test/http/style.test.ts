import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config';
import { buildApp } from '../../src/app';
import { createMockProvider } from '../../src/llm/mock';
import { openDb, type Database } from '../../src/db/open';

let dir: string;
let db: Database;
let app: Awaited<ReturnType<typeof buildApp>>;

const SAMPLE_TEXT =
  '山风掠过松林，少年抬头望向远方。他说：“路还长。”夜色深沉，灯火摇曳。'.repeat(6);

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkforge-style-http-'));
  const config = loadConfig({ STRATA_BASE_URL: 'http://127.0.0.1:47831/v1', STRATA_API_KEY: 'strata', STRATA_MODEL: 'iq3_xxs', INKFORGE_DATA_DIR: dir });
  db = openDb(path.join(config.dataDir, 'inkforge.db'));
  app = await buildApp({
    config,
    provider: createMockProvider({ draft: { text: '样章。' }, qc: { text: '' }, summarize: { text: '摘要。' } }),
    summarizerProvider: createMockProvider({
      summarize: { text: 'RULES: 平均句长 15-25 字\nRULES: 对话占比 10-20%\nRULES: 叙事人称第三' },
    }),
    db,
    inlineQueue: true,
  });
});

afterAll(async () => {
  await app.close();
  try {
    db.close();
  } catch {
    /* ignore */
  }
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* Windows 锁瞬态 */
  }
});

describe('POST /api/style-profiles/distill + GET /api/style-profiles', () => {
  it('distill：注入 mock → 201 且列表可见 metrics 非空且 source_path=inline: 前缀', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/style-profiles/distill',
      payload: { name: '山风体', text: SAMPLE_TEXT },
    });
    expect(r.statusCode).toBe(201);
    const { profileId } = r.json() as { profileId: string };
    expect(profileId).toBeTruthy();

    const list = await app.inject({ method: 'GET', url: '/api/style-profiles' });
    expect(list.statusCode).toBe(200);
    const rows = list.json() as Array<{ id: string; name: string; version: number; createdAt: string; metrics: Record<string, unknown>; sourcePath: string }>;
    const row = rows.find((x) => x.id === profileId);
    expect(row).toBeTruthy();
    expect(row!.name).toBe('山风体');
    expect(row!.sourcePath.startsWith('inline:')).toBe(true);
    expect(row!.sourcePath.length).toBe(15);
    expect(Object.keys(row!.metrics).length).toBeGreaterThan(0);
  });

  it('空样本 → 400 固定文案', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/style-profiles/distill',
      payload: { name: '空白', text: '   \n  ' },
    });
    expect(r.statusCode).toBe(400);
    expect((r.json() as { error: string }).error).toBe('样本为空，禁止蒸馏');
  });
});
