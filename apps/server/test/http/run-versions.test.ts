import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config';
import { buildApp } from '../../src/app';
import { createDefaultMockProvider } from '../../src/llm/mock';
import { openDb, type Database } from '../../src/db/open';
import { appendChapterVersion, setCurrentVersion } from '../../src/db/repositories/chapters';
import { createRun } from '../../src/db/repositories/runs';

// GET /api/runs/:runId/versions（C 方案③）：run_id 反查 chapter_versions，正文内联
let dir: string;
let db: Database;
let app: Awaited<ReturnType<typeof buildApp>>;
let bookId: string;
let chapterId: string;
let runA: { id: string };
let v1: { id: string };
let v2: { id: string };
let runB: { id: string };
let emptyRun: { id: string };

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkforge-run-versions-'));
  const config = loadConfig({ STRATA_BASE_URL: 'http://127.0.0.1:47831/v1', STRATA_API_KEY: 'strata', STRATA_MODEL: 'iq3_xxs', INKFORGE_DATA_DIR: dir });
  db = openDb(path.join(config.dataDir, 'inkforge.db'));
  app = await buildApp({ config, provider: createDefaultMockProvider(), db, inlineQueue: true });

  const created = await app.inject({ method: 'POST', url: '/api/books', payload: { title: 'run 产物书' } });
  expect(created.statusCode).toBe(201);
  bookId = (created.json() as { id: string }).id;
  const bp = await app.inject({
    method: 'PUT',
    url: `/api/books/${bookId}/chapters/1/blueprint`,
    payload: { title: '第一章', blueprint: { goal: 'g', beats: [], mustHaveBeats: [], bannedTopics: [] }, targetChars: 500 },
  });
  expect(bp.statusCode).toBe(200);
  chapterId = (db.prepare('SELECT id FROM chapters WHERE book_id = ? AND chapter_no = 1').get(bookId) as { id: string }).id;

  runA = createRun(db, { bookId, mode: 'continue', chapterScope: { from: 1, to: 1 } });
  v1 = appendChapterVersion(db, { chapterId, kind: 'draft', content: '第一版正文。', runId: runA.id });
  v2 = appendChapterVersion(db, { chapterId, kind: 'final', content: '第二版正文。', runId: runA.id });
  setCurrentVersion(db, chapterId, v2.id);
  runB = createRun(db, { bookId, mode: 'generate', chapterScope: { from: 1, to: 1 } });
  appendChapterVersion(db, { chapterId, kind: 'draft', content: '其他 run 的版本。', runId: runB.id });
  emptyRun = createRun(db, { bookId, mode: 'generate', chapterScope: { from: 1, to: 1 } });
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
    /* ignore */
  }
});

describe('GET /api/runs/:runId/versions', () => {
  it('未知 runId → 404 not found', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/runs/nope/versions' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'not found' });
  });

  it('run 产物版本按章号与时间正序返回，带正文与 isCurrent', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/runs/${runA.id}/versions` });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { runId: string; versions: Array<{ versionId: string; chapterId: string; chapterNo: number; kind: string; content: string; isCurrent: boolean; wordCount: number }> };
    expect(body.runId).toBe(runA.id);
    expect(body.versions.length).toBe(2);
    expect(body.versions[0]).toMatchObject({ versionId: v1.id, chapterId, chapterNo: 1, kind: 'draft', content: '第一版正文。', isCurrent: false });
    expect(body.versions[1]).toMatchObject({ versionId: v2.id, kind: 'final', content: '第二版正文。', isCurrent: true });
    expect(body.versions[0].wordCount).toBeGreaterThan(0);
    expect(body.versions[1].wordCount).toBeGreaterThan(0);
  });

  it('不同 run 的版本不串（run_id 隔离）', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/runs/${runB.id}/versions` });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { versions: Array<{ content: string }> };
    expect(body.versions.length).toBe(1);
    expect(body.versions[0].content).toBe('其他 run 的版本。');
  });

  it('无产物 run → versions 空数组', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/runs/${emptyRun.id}/versions` });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { versions: unknown[] };
    expect(body.versions.length).toBe(0);
  });
});
