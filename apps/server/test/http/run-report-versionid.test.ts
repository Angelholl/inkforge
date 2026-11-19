import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config';
import { buildApp } from '../../src/app';
import { createDefaultMockProvider } from '../../src/llm/mock';
import { openDb, type Database } from '../../src/db/open';
import { appendChapterVersion } from '../../src/db/repositories/chapters';

// report 步行补 versionId（C 方案③）：versionId=output_version_id，与 versionDeleted 可并存
let dir: string;
let db: Database;
let app: Awaited<ReturnType<typeof buildApp>>;
let bookId: string;
let chapterId: string;
let vLive: { id: string };

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkforge-run-report-versionid-'));
  const config = loadConfig({ STRATA_BASE_URL: 'http://127.0.0.1:47831/v1', STRATA_API_KEY: 'strata', STRATA_MODEL: 'iq3_xxs', INKFORGE_DATA_DIR: dir });
  db = openDb(path.join(config.dataDir, 'inkforge.db'));
  app = await buildApp({ config, provider: createDefaultMockProvider(), db, inlineQueue: true });

  const created = await app.inject({ method: 'POST', url: '/api/books', payload: { title: '报表 versionId 书' } });
  expect(created.statusCode).toBe(201);
  bookId = (created.json() as { id: string }).id;
  const bp = await app.inject({
    method: 'PUT',
    url: `/api/books/${bookId}/chapters/1/blueprint`,
    payload: { title: '第一章', blueprint: { goal: 'g', beats: [], mustHaveBeats: [], bannedTopics: [] }, targetChars: 500 },
  });
  expect(bp.statusCode).toBe(200);
  chapterId = (db.prepare('SELECT id FROM chapters WHERE book_id = ? AND chapter_no = 1').get(bookId) as { id: string }).id;

  vLive = appendChapterVersion(db, { chapterId, kind: 'final', content: '存活的最终版正文。', runId: 'r-report' });
  db.prepare("INSERT INTO runs(id, book_id, mode, status, chapter_scope_json, created_at) VALUES('r-report', ?, 'generate', 'done', '{\"from\":1,\"to\":1}', ?)").run(bookId, new Date().toISOString());
  db.prepare("INSERT INTO run_steps(id, run_id, chapter_id, step, attempt, status, output_version_id) VALUES('rs-draft', 'r-report', ?, 'draft', 1, 'done', 'v-gone')").run(chapterId);
  db.prepare("INSERT INTO run_steps(id, run_id, chapter_id, step, attempt, status, output_version_id) VALUES('rs-final', 'r-report', ?, 'finalize', 1, 'done', ?)").run(chapterId, vLive.id);
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

describe('GET /api/runs/:runId/report 步行 versionId', () => {
  it('report 步行带 versionId；版本被删的步 versionDeleted 与 versionId 并存', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/runs/r-report/report' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { chapters: Array<{ chapterNo: number; steps: Array<Record<string, unknown>> }> };
    expect(body.chapters[0].chapterNo).toBe(1);
    const steps = body.chapters[0].steps;
    const finalize = steps.find((s) => s.step === 'finalize')!;
    expect(finalize).toMatchObject({ step: 'finalize', versionId: vLive.id });
    expect('versionDeleted' in finalize).toBe(false);
    const draft = steps.find((s) => s.step === 'draft')!;
    expect(draft).toMatchObject({ step: 'draft', versionDeleted: true, versionId: 'v-gone' });
  });
});
