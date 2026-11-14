import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config';
import { buildApp } from '../../src/app';
import { createMockProvider } from '../../src/llm/mock';
import { openDb, type Database } from '../../src/db/open';
import { updateForeshadowing, upsertForeshadowing } from '../../src/db/repositories/continuity';

let dir: string;
let db: Database;
let app: Awaited<ReturnType<typeof buildApp>>;
let bookId: string;

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkforge-foreshadow-'));
  const config = loadConfig({ STRATA_BASE_URL: 'http://127.0.0.1:47831/v1', STRATA_API_KEY: 'strata', STRATA_MODEL: 'iq3_xxs', INKFORGE_DATA_DIR: dir });
  db = openDb(path.join(config.dataDir, 'inkforge.db'));
  app = await buildApp({
    config,
    provider: createMockProvider({ draft: { text: 'x' }, qc: { text: '' }, summarize: { text: 'y' } }),
    db,
    inlineQueue: true,
  });
  const created = await app.inject({ method: 'POST', url: '/api/books', payload: { title: '伏笔测书' } });
  bookId = (created.json() as { id: string }).id;
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

describe('伏笔 CRUD（C2）', () => {
  it('POST→GET→PUT 回收→DELETE→404 复删 全链', async () => {
    const created = await app.inject({
      method: 'POST',
      url: `/api/books/${bookId}/foreshadowings`,
      payload: { description: '铜牌的来历', plantedCh: 2 },
    });
    expect(created.statusCode).toBe(201);
    const f = created.json() as { id: string; description: string; plantedCh: number; status: string; resolvedCh?: number };
    expect(f.description).toBe('铜牌的来历');
    expect(f.plantedCh).toBe(2);
    expect(f.status).toBe('open');

    const list = await app.inject({ method: 'GET', url: `/api/books/${bookId}/foreshadowings` });
    const rows = list.json() as Array<{ id: string; plantedCh: number; status: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0].plantedCh).toBe(2); // camelCase 映射正确

    const resolved = await app.inject({
      method: 'PUT',
      url: `/api/books/${bookId}/foreshadowings/${f.id}`,
      payload: { status: 'resolved', resolvedCh: 7 },
    });
    expect(resolved.statusCode).toBe(200);
    expect((resolved.json() as { status: string; resolvedCh?: number }).status).toBe('resolved');
    expect((resolved.json() as { resolvedCh?: number }).resolvedCh).toBe(7);

    const del = await app.inject({ method: 'DELETE', url: `/api/books/${bookId}/foreshadowings/${f.id}` });
    expect(del.statusCode).toBe(200);
    const redel = await app.inject({ method: 'DELETE', url: `/api/books/${bookId}/foreshadowings/${f.id}` });
    expect(redel.statusCode).toBe(404);
  });

  it('守卫：resolved 无 resolvedCh → 400；未知书 404；未知伏笔 404', async () => {
    const noCh = await app.inject({
      method: 'POST',
      url: `/api/books/${bookId}/foreshadowings`,
      payload: { description: '待回收伏笔', plantedCh: 1 },
    });
    const fid = (noCh.json() as { id: string }).id;
    const bad = await app.inject({
      method: 'PUT',
      url: `/api/books/${bookId}/foreshadowings/${fid}`,
      payload: { status: 'resolved' },
    });
    expect(bad.statusCode).toBe(400);

    const missBook = await app.inject({ method: 'GET', url: '/api/books/no-such/foreshadowings' });
    expect(missBook.statusCode).toBe(404);
    const missPost = await app.inject({ method: 'POST', url: '/api/books/no-such/foreshadowings', payload: { description: 'x', plantedCh: 1 } });
    expect(missPost.statusCode).toBe(404);
    const missPut = await app.inject({ method: 'PUT', url: `/api/books/${bookId}/foreshadowings/no-such`, payload: { description: 'y' } });
    expect(missPut.statusCode).toBe(404);
    const missDel = await app.inject({ method: 'DELETE', url: `/api/books/${bookId}/foreshadowings/no-such` });
    expect(missDel.statusCode).toBe(404);
  });

  it('仓储层：updateForeshadowing resolved 缺 ch 抛错；advanced/open 状态流不要求 ch', async () => {
    const fid = upsertForeshadowing(db, { bookId, description: '仓储层伏笔', plantedCh: 3 });
    expect(() => updateForeshadowing(db, fid, { status: 'resolved' })).toThrow(/resolvedCh/);
    const adv = updateForeshadowing(db, fid, { status: 'advanced' });
    expect(adv?.status).toBe('advanced');
    const back = updateForeshadowing(db, fid, { status: 'open' });
    expect(back?.status).toBe('open');
    const desc = updateForeshadowing(db, fid, { description: '改写描述' });
    expect(desc?.description).toBe('改写描述');
    expect(updateForeshadowing(db, 'no-such', { description: 'x' })).toBeUndefined();
  });
});
