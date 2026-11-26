import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config';
import { buildApp } from '../../src/app';
import { createDefaultMockProvider, createMockProvider } from '../../src/llm/mock';
import { openDb, type Database } from '../../src/db/open';

let dir: string;
let db: Database;
let app: Awaited<ReturnType<typeof buildApp>>;
let bookId: string;

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkforge-import-'));
  const config = loadConfig({ STRATA_BASE_URL: 'http://127.0.0.1:47831/v1', STRATA_API_KEY: 'strata', STRATA_MODEL: 'iq3_xxs', INKFORGE_DATA_DIR: dir });
  db = openDb(path.join(config.dataDir, 'inkforge.db'));
  app = await buildApp({
    config,
    provider: createDefaultMockProvider(),
    summarizerProvider: createDefaultMockProvider(),
    plannerProvider: createMockProvider({
      summarize: { text: 'GOAL: 试炼第六层的入口\nBEATS:\n- 发现入口\n- 首次交锋\nHOOK: 入口在身后关闭' },
    }),
    db,
    inlineQueue: true,
  });
  const created = await app.inject({ method: 'POST', url: '/api/books', payload: { title: '导入测试书' } });
  expect(created.statusCode).toBe(201);
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

describe('POST /api/books/:bookId/import-original', () => {
  it('导入 3 章 → is_original + original 版本 + FTS 可检索', async () => {
    const r = await app.inject({
      method: 'POST',
      url: `/api/books/${bookId}/import-original`,
      payload: {
        chapters: [
          { title: '第一章 山门', content: '青云山下的少年抬头望向远方，山风掠过松林。' },
          { title: '第二章 入城', content: '少年背着行囊走进城门，街市喧闹人声鼎沸。' },
          { title: '第三章 夜灯', content: '夜色深沉，灯火摇曳，他握紧手中的玉佩。' },
        ],
      },
    });
    expect(r.statusCode).toBe(201);
    expect(r.json()).toMatchObject({ imported: 3, firstChapterNo: 1, lastChapterNo: 3 });

    const rows = db
      .prepare('SELECT chapter_no, is_original, status, blueprint_json, target_chars FROM chapters WHERE book_id = ? ORDER BY chapter_no')
      .all(bookId) as Array<{ chapter_no: number; is_original: number; status: string; blueprint_json: string | null; target_chars: number }>;
    expect(rows).toHaveLength(3);
    expect(rows.map((x) => x.chapter_no)).toEqual([1, 2, 3]);
    expect(rows.every((x) => x.is_original === 1)).toBe(true);
    expect(rows.every((x) => x.status === 'done')).toBe(true);
    expect(rows.every((x) => x.blueprint_json === null)).toBe(true);
    expect(rows.every((x) => x.target_chars === 3000)).toBe(true);

    const versions = await app.inject({ method: 'GET', url: `/api/books/${bookId}/chapters/1/versions` });
    expect(versions.statusCode).toBe(200);
    const body = versions.json() as { currentVersionId: string | null; versions: Array<{ kind: string }> };
    expect(body.versions).toHaveLength(1);
    expect(body.versions[0].kind).toBe('original');

    const hits = await app.inject({ method: 'GET', url: `/api/books/${bookId}/search?q=${encodeURIComponent('青云山下')}` });
    expect(hits.statusCode).toBe(200);
    const hitList = hits.json() as Array<{ chapterNo: number }>;
    expect(hitList.length).toBeGreaterThanOrEqual(1);
    expect(hitList[0].chapterNo).toBe(1);
  });

  it('接续编号 + 404', async () => {
    const r = await app.inject({
      method: 'POST',
      url: `/api/books/${bookId}/import-original`,
      payload: { chapters: [{ title: '第四章 出关', content: '城门外风沙渐起，他踏上官道继续前行。' }] },
    });
    expect(r.statusCode).toBe(201);
    expect(r.json()).toMatchObject({ imported: 1, firstChapterNo: 4, lastChapterNo: 4 });

    const nf = await app.inject({
      method: 'POST',
      url: '/api/books/no-such-book/import-original',
      payload: { chapters: [{ title: '第一章', content: '不存在的书也能写入正文内容。' }] },
    });
    expect(nf.statusCode).toBe(404);
  });

  it('blueprint-suggest：注入 mock → 200 且蓝图落库可读', async () => {
    const r = await app.inject({
      method: 'POST',
      url: `/api/books/${bookId}/blueprint-suggest`,
      payload: { chapterNo: 6 },
    });
    expect(r.statusCode).toBe(200);
    const body = r.json() as { blueprint: { goal: string; beats: string[] }; source: string };
    expect(body.source).toBe('llm');
    expect(body.blueprint.goal).toBe('试炼第六层的入口');
    expect(body.blueprint.beats).toEqual(['发现入口', '首次交锋', '入口在身后关闭']);

    const put = await app.inject({
      method: 'PUT',
      url: `/api/books/${bookId}/chapters/6/blueprint`,
      payload: { title: '第六章 入口', blueprint: body.blueprint },
    });
    expect(put.statusCode).toBe(200);

    const got = await app.inject({ method: 'GET', url: `/api/books/${bookId}` });
    expect(got.statusCode).toBe(200);
    const chapters = (got.json() as { chapters: Array<{ chapterNo: number; blueprint: { goal: string } | null }> }).chapters;
    expect(chapters.find((c) => c.chapterNo === 6)?.blueprint?.goal).toBe('试炼第六层的入口');
  });

  describe('POST /api/books/:bookId/chapters/:chapterNo/summarize', () => {
    it('可选摘要：generate 返回四段 + baseVersionId 且零写入；commit 后 chapter_summaries +1', async () => {
      const before = db.prepare('SELECT COUNT(*) AS n FROM chapter_summaries WHERE book_id = ?').get(bookId) as { n: number };
      const generated = await app.inject({ method: 'POST', url: `/api/books/${bookId}/chapters/1/summarize` });
      expect(generated.statusCode).toBe(200);
      const payload = generated.json() as {
        baseVersionId: string; summary: string; beats: string[];
        openThreads: string[]; characterDeltas: Array<{ name: string; stateJson: string }>;
      };
      expect(payload).toMatchObject({
        baseVersionId: expect.any(String),
        summary: expect.any(String),
        beats: expect.any(Array),
        openThreads: expect.any(Array),
        characterDeltas: expect.any(Array),
      });
      const afterGenerate = db.prepare('SELECT COUNT(*) AS n FROM chapter_summaries WHERE book_id = ?').get(bookId) as { n: number };
      expect(afterGenerate.n).toBe(before.n);

      const committed = await app.inject({
        method: 'POST',
        url: `/api/books/${bookId}/chapters/1/summarize/commit`,
        payload: {
          baseVersionId: payload.baseVersionId,
          summary: payload.summary,
          beats: payload.beats,
          threads: payload.openThreads.map((text) => ({ text, include: true })),
          states: payload.characterDeltas.map((d) => ({ ...d, include: true })),
        },
      });
      expect(committed.statusCode).toBe(200);
      expect(committed.json()).toEqual({ ok: true });
      const afterCommit = db.prepare('SELECT COUNT(*) AS n FROM chapter_summaries WHERE book_id = ?').get(bookId) as { n: number };
      expect(afterCommit.n).toBe(before.n + 1);
    });

    it('无 current 版本章 → 404；有 running run → 409', async () => {
      const missing = await app.inject({ method: 'POST', url: `/api/books/${bookId}/chapters/999/summarize` });
      expect(missing.statusCode).toBe(404);

      db.prepare(
        "INSERT INTO runs(id, book_id, mode, status, chapter_scope_json, skip_failures, salvage_partial, max_rounds, created_at) VALUES('manual-run-guard', ?, 'generate', 'running', '[1,20]', 1, 1, 2, ?)",
      ).run(bookId, new Date().toISOString());
      const conflict = await app.inject({ method: 'POST', url: `/api/books/${bookId}/chapters/2/summarize` });
      expect(conflict.statusCode).toBe(409);
      db.prepare("DELETE FROM runs WHERE id = 'manual-run-guard'").run();
    });
  });
});
