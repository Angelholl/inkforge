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
let bookId: string;

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkforge-chars-http-'));
  const config = loadConfig({ STRATA_BASE_URL: 'http://127.0.0.1:47831/v1', STRATA_API_KEY: 'strata', STRATA_MODEL: 'iq3_xxs', INKFORGE_DATA_DIR: dir });
  db = openDb(path.join(config.dataDir, 'inkforge.db'));
  app = await buildApp({
    config,
    provider: createMockProvider({ draft: { text: '样章。' }, qc: { text: '' }, summarize: { text: '摘要。' } }),
    db,
    inlineQueue: true,
  });
  const created = await app.inject({
    method: 'POST',
    url: '/api/books',
    payload: { title: '设定功能测书', description: '旧世界观', outline: '旧大纲' },
  });
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

describe('人物卡 CRUD + 书籍 meta 端点', () => {
  it('人物卡 CRUD：POST→GET→PUT→DELETE 往返，重名 POST → 409', async () => {
    const created = await app.inject({
      method: 'POST',
      url: `/api/books/${bookId}/characters`,
      payload: { name: '张三', baseSetting: '{"身份":"主角"}' },
    });
    expect(created.statusCode).toBe(201);
    const card = created.json() as { id: string; name: string; baseSetting: string };
    expect(card.name).toBe('张三');
    expect(card.baseSetting).toBe('{"身份":"主角"}');

    const dup = await app.inject({
      method: 'POST',
      url: `/api/books/${bookId}/characters`,
      payload: { name: '张三' },
    });
    expect(dup.statusCode).toBe(409);

    const list = await app.inject({ method: 'GET', url: `/api/books/${bookId}/characters` });
    expect(list.statusCode).toBe(200);
    // 0009：人物卡统一形态带 offlineFromChapter（新建=null 在场）
    expect(list.json()).toEqual([{ id: card.id, name: '张三', baseSetting: '{"身份":"主角"}', offlineFromChapter: null }]);

    const updated = await app.inject({
      method: 'PUT',
      url: `/api/books/${bookId}/characters/${card.id}`,
      payload: { baseSetting: '{"身份":"盟友"}' },
    });
    expect(updated.statusCode).toBe(200);
    expect((updated.json() as { baseSetting: string }).baseSetting).toBe('{"身份":"盟友"}');

    const removed = await app.inject({ method: 'DELETE', url: `/api/books/${bookId}/characters/${card.id}` });
    expect(removed.statusCode).toBe(200);
    const empty = await app.inject({ method: 'GET', url: `/api/books/${bookId}/characters` });
    expect(empty.json()).toEqual([]);
    const missing = await app.inject({ method: 'DELETE', url: `/api/books/${bookId}/characters/nonexistent` });
    expect(missing.statusCode).toBe(404);
  });

  it('PUT meta：description/outline 持久化且 GET /api/books/:id 回读 outline', async () => {
    const put = await app.inject({
      method: 'PUT',
      url: `/api/books/${bookId}/meta`,
      payload: { description: '新世界观文本', outline: '第一卷：崛起' },
    });
    expect(put.statusCode).toBe(200);
    const meta = put.json() as { description: string; outline: string };
    expect(meta.description).toBe('新世界观文本');
    expect(meta.outline).toBe('第一卷：崛起');

    const get = await app.inject({ method: 'GET', url: `/api/books/${bookId}` });
    expect(get.statusCode).toBe(200);
    const book = get.json() as { description: string; outline: string };
    expect(book.description).toBe('新世界观文本');
    expect(book.outline).toBe('第一卷：崛起');
  });

  it('meta/characters：不存在 bookId → 404；空 name → 400', async () => {
    const meta404 = await app.inject({ method: 'PUT', url: '/api/books/nonexistent/meta', payload: { title: 'x' } });
    expect(meta404.statusCode).toBe(404);
    const char404 = await app.inject({ method: 'GET', url: '/api/books/nonexistent/characters' });
    expect(char404.statusCode).toBe(404);
    const emptyName = await app.inject({ method: 'POST', url: `/api/books/${bookId}/characters`, payload: { name: '' } });
    expect(emptyName.statusCode).toBe(400);
  });
});
