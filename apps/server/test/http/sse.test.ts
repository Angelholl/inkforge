import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config';
import { openDb } from '../../src/db/open';
import { migrate } from '../../src/db/migrate';
import { buildApp } from '../../src/app';
import { createDefaultMockProvider } from '../../src/llm/mock';
import { createBook } from '../../src/db/repositories/books';
import { upsertBlueprint } from '../../src/db/repositories/chapters';
import type { ChapterBlueprint } from '@inkforge/shared';

const BP: ChapterBlueprint = { goal: 'g', beats: [], mustHaveBeats: [], bannedTopics: [] };

let dir: string;
let app: Awaited<ReturnType<typeof buildApp>>;
let baseUrl: string;
let runId: string;

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkforge-sse-'));
  const config = loadConfig({ STRATA_BASE_URL: 'http://127.0.0.1:47831/v1', STRATA_API_KEY: 'strata', STRATA_MODEL: 'iq3_xxs', INKFORGE_DATA_DIR: dir });
  const db = openDb(path.join(dir, 'sse.db'));
  migrate(db);
  app = await buildApp({ config, provider: createDefaultMockProvider(), db });
  await app.listen({ port: 0, host: '127.0.0.1' });
  baseUrl = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
  process.env.INKFORGE_TEST_SSE_PING_MS = '100';
  const book = createBook(db, { title: 'SSE 测试书' });
  upsertBlueprint(db, { bookId: book.id, chapterNo: 1, title: '章一', blueprint: BP, targetChars: 500 });
  const gen = await fetch(`${baseUrl}/api/books/${book.id}/chapters/1/generate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  runId = ((await gen.json()) as { runId: string }).runId;
  // 等 run 完成
  for (let i = 0; i < 100; i++) {
    await new Promise((r) => setTimeout(r, 100));
    const rr = await fetch(`${baseUrl}/api/runs/${runId}`);
    const run = (await rr.json()) as { status: string };
    if (run.status === 'done') break;
  }
}, 30000);

afterAll(async () => {
  delete process.env.INKFORGE_TEST_SSE_PING_MS;
  await app.close();
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

describe('SSE', () => {
  it('首事件 snapshot，随后 run.status done，: ping 出现', async () => {
    const ac = new AbortController();
    const res = await fetch(`${baseUrl}/api/runs/${runId}/events`, { signal: ac.signal });
    expect(res.status).toBe(200);
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    const got = { snapshot: false, runDone: false, ping: false };
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline && !(got.snapshot && got.runDone && got.ping)) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      if (buf.includes('event: snapshot')) got.snapshot = true;
      if (buf.includes('"status":"done"')) got.runDone = true;
      if (buf.includes(': ping')) got.ping = true;
    }
    ac.abort();
    expect(got.snapshot).toBe(true);
    expect(got.runDone).toBe(true);
    expect(got.ping).toBe(true);
  }, 15000);

  it('SSE 对未知 run → 404', async () => {
    const res = await fetch(`${baseUrl}/api/runs/no-such/events`);
    expect(res.status).toBe(404);
  });
});
