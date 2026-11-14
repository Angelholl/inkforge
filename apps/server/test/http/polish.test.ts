import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config';
import { buildApp } from '../../src/app';
import { createMockProvider } from '../../src/llm/mock';
import { openDb, type Database } from '../../src/db/open';
import { getRun, listSteps } from '../../src/db/repositories/runs';
import { appendChapterVersion, getChapter, listVersions, setCurrentVersion } from '../../src/db/repositories/chapters';

let dir: string;
let db: Database;
let app: Awaited<ReturnType<typeof buildApp>>;
let bookId: string;

const POLISH_OUTPUT = '校对后的正文内容，句式自然，无套话。'.repeat(10);

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkforge-polish-'));
  const config = loadConfig({ STRATA_BASE_URL: 'http://127.0.0.1:47831/v1', STRATA_API_KEY: 'strata', STRATA_MODEL: 'iq3_xxs', INKFORGE_DATA_DIR: dir });
  db = openDb(path.join(config.dataDir, 'inkforge.db'));
  app = await buildApp({
    config,
    provider: createMockProvider({
      draft: { text: 'x' },
      qc: { text: '' },
      summarize: { text: 'y' },
      rewrite: { text: POLISH_OUTPUT },
    }),
    db,
    inlineQueue: true,
  });
  const created = await app.inject({ method: 'POST', url: '/api/books', payload: { title: '校对测书', description: '修真。' } });
  bookId = (created.json() as { id: string }).id;
  for (const no of [1, 2]) {
    db.prepare(
      "INSERT INTO chapters(id, book_id, chapter_no, title, blueprint_json, target_chars, created_at) VALUES(?,?,?,?,?,?,?)",
    ).run(`pch${no}`, bookId, no, `第${no}章`, JSON.stringify({ goal: `第${no}章目标`, beats: [], mustHaveBeats: [], bannedTopics: [] }), 500, new Date().toISOString());
  }
  // 章 1 有正文；章 2 无
  const ch = getChapter(db, bookId, 1)!;
  const v = appendChapterVersion(db, { chapterId: ch.id, kind: 'draft', content: '原始正文，包含「不是…而是…」套话句式与冗余场景。'.repeat(6) });
  setCurrentVersion(db, ch.id, v.id);
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

describe('B10 批量校对（polish run）', () => {
  it('POST polish → 202 且 run.kind=polish；from>to 400；未知书 404', async () => {
    const r = await app.inject({ method: 'POST', url: `/api/books/${bookId}/polish`, payload: { chapterFrom: 1, chapterTo: 1 } });
    expect(r.statusCode).toBe(202);
    const runId = (r.json() as { runId: string }).runId;
    // inline 队列即刻执行，等待完成
    await waitForDone(runId);
    const run = getRun(db, runId)!;
    expect(run.kind).toBe('polish');
    expect(run.status).toBe('done');

    const bad = await app.inject({ method: 'POST', url: `/api/books/${bookId}/polish`, payload: { chapterFrom: 3, chapterTo: 1 } });
    expect(bad.statusCode).toBe(400);
    const miss = await app.inject({ method: 'POST', url: '/api/books/no-such/polish', payload: { chapterFrom: 1, chapterTo: 1 } });
    expect(miss.statusCode).toBe(404);
  });

  it('全链：三 pass（结构重构→风格一致→去 AI 化）step=rewrite attempt=1..3 → 单个 revised 版本（params.polish+L0）且 current 不动', async () => {
    const r = await app.inject({ method: 'POST', url: `/api/books/${bookId}/polish`, payload: { chapterFrom: 1, chapterTo: 1 } });
    const runId = (r.json() as { runId: string }).runId;
    await waitForDone(runId);

    const steps = listSteps(db, runId).filter((s) => s.step === 'rewrite');
    expect(steps.map((s) => s.attempt)).toEqual([1, 2, 3]);
    expect(steps.every((s) => s.status === 'done')).toBe(true);
    const passNames = steps.map((s) => (s.outputJson as { polishPass?: string }).polishPass);
    expect(passNames).toEqual(['结构重构', '风格一致', '去 AI 化']);

    const ch = getChapter(db, bookId, 1)!;
    const versions = listVersions(db, ch.id) as Array<{ id: string; kind: string; runId?: string; params: object }>;
    const revised = versions.filter((v) => v.kind === 'revised' && v.runId === runId);
    expect(revised).toHaveLength(1);
    const params = revised[0].params as { polish?: boolean; passes?: number; l0?: { checks: unknown[] } };
    expect(params.polish).toBe(true);
    expect(params.passes).toBe(3);
    expect(params.l0?.checks?.length).toBeGreaterThan(0);
    // current 指针不动（人工采用）
    expect(ch.currentVersionId).not.toBe(revised[0].id);
  });

  it('无正文章跳过：scope 覆盖章 2（无 current 版本）→ run done 且无 rewrite 步', async () => {
    const r = await app.inject({ method: 'POST', url: `/api/books/${bookId}/polish`, payload: { chapterFrom: 2, chapterTo: 2 } });
    const runId = (r.json() as { runId: string }).runId;
    await waitForDone(runId);
    expect(getRun(db, runId)!.status).toBe('done');
    expect(listSteps(db, runId)).toHaveLength(0);
  });
});

function waitForDone(runId: string, timeoutMs = 15000): Promise<void> {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const tick = () => {
      const run = getRun(db, runId);
      if (run && (run.status === 'done' || run.status === 'failed' || run.status === 'cancelled')) {
        resolve();
        return;
      }
      if (Date.now() - t0 > timeoutMs) {
        reject(new Error(`run ${runId} 未在时限内完成: ${run?.status}`));
        return;
      }
      setTimeout(tick, 100);
    };
    tick();
  });
}
