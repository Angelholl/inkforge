import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config';
import { migrate } from '../../src/db/migrate';
import { openDb, type Database } from '../../src/db/open';
import { createBook } from '../../src/db/repositories/books';
import { upsertBlueprint } from '../../src/db/repositories/chapters';
import { appendStep, createRun, markStep, updateRunStatus } from '../../src/db/repositories/runs';
import { createPartialFlusher } from '../../src/pipeline/partial';
import type { ChapterBlueprint } from '@inkforge/shared';

const BP: ChapterBlueprint = { goal: 'g', beats: [], mustHaveBeats: [], bannedTopics: [] };

let db: Database;
let dir: string;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkforge-part-'));
  db = openDb(path.join(dir, 't.db'));
  migrate(db);
});

afterAll(() => {
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

describe('createPartialFlusher', () => {
  it('everyTokens=10 推 25 字符 → ≥2 次 UPSERT 内容递增；flush 写余量；discard 清行', () => {
    const now = new Date().toISOString();
    db.prepare("INSERT INTO books(id, title, created_at, updated_at) VALUES('b1','书',?,?)").run(now, now);
    db.prepare("INSERT INTO chapters(id, book_id, chapter_no, created_at) VALUES('c1','b1',1,?)").run(now);
    const run = createRun(db, { bookId: 'b1', mode: 'generate', chapterScope: { from: 1, to: 1 } });
    updateRunStatus(db, run.id, 'running');
    const step = appendStep(db, { runId: run.id, chapterId: 'c1', step: 'draft', attempt: 1 });
    markStep(db, step.id, { status: 'inflight', startedAt: now });

    const f = createPartialFlusher(db, step.id, { everyTokens: 10, everyMs: 0 });
    f.push('一二三四五');
    f.push('六七八九十'); // 累计 10 达阈值 → 触发第 1 次 UPSERT
    let rows = db.prepare('SELECT content FROM partial_outputs WHERE run_step_id = ?').all(step.id) as Array<{ content: string }>;
    expect(rows.length).toBe(1);
    expect(rows[0].content).toBe('一二三四五六七八九十');
    const snap1 = rows[0].content.length;
    f.push('十一十二十三'); // 5 字符未达阈值
    f.push('尾');
    f.flush(); // 写余量
    rows = db.prepare('SELECT content FROM partial_outputs WHERE run_step_id = ?').all(step.id) as Array<{ content: string }>;
    expect(rows[0].content).toBe('一二三四五六七八九十十一十二十三尾');
    expect(rows[0].content.length).toBeGreaterThan(snap1);
    f.discard();
    rows = db.prepare('SELECT content FROM partial_outputs WHERE run_step_id = ?').all(step.id) as Array<{ content: string }>;
    expect(rows.length).toBe(0);
  });
});

describe('partial 抢救端点', () => {
  it('abort 场景后 adopt → versions +1 kind=draft salvaged=true 且 current 指针未变', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkforge-part2-'));
    try {
      const config = loadConfig({ STRATA_BASE_URL: 'http://x', STRATA_API_KEY: 'k', STRATA_MODEL: 'm', INKFORGE_DATA_DIR: dataDir });
      const { buildApp } = await import('../../src/app');
      const { createMockProvider } = await import('../../src/llm/mock');
      const { makeMockDraft } = await import('../../src/llm/mock');
      const app = await buildApp({ config, provider: createMockProvider({ draft: { textFn: (m) => makeMockDraft(m.chapterNo ?? 1), chunks: 25, chunkDelayMs: 200 } }), inlineQueue: true });
      const created = await app.inject({ method: 'POST', url: '/api/books', payload: { title: '残稿书' } });
      const bookId = (created.json() as { id: string }).id;
      await app.inject({ method: 'PUT', url: `/api/books/${bookId}/chapters/1/blueprint`, payload: { title: '章一', blueprint: BP, targetChars: 500 } });
      const gen = await app.inject({ method: 'POST', url: `/api/books/${bookId}/chapters/1/generate`, payload: {} });
      const runId = (gen.json() as { runId: string }).runId;
      // draft 流式中（500 字 × 25 片 × 200ms ≈ 5s）等 draft inflight 再取消 → abort 传播 → finally flush 残稿
      let inflight = false;
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 150));
        const rr = await app.inject({ method: 'GET', url: `/api/runs/${runId}` });
        const steps = (rr.json() as { steps: Array<{ step: string; status: string }> }).steps;
        if (steps.some((x) => x.step === 'draft' && x.status === 'inflight')) {
          inflight = true;
          break;
        }
      }
      expect(inflight).toBe(true);
      await app.inject({ method: 'POST', url: `/api/runs/${runId}/cancel` });
      await new Promise((r) => setTimeout(r, 1500));
      const pr = await app.inject({ method: 'GET', url: `/api/runs/${runId}/chapters/1/partial` });
      expect(pr.statusCode).toBe(200);
      const partial = pr.json() as { content: string; updatedAt: string };
      expect(partial.content.length).toBeGreaterThan(0);
      const adopt = await app.inject({ method: 'POST', url: `/api/runs/${runId}/chapters/1/partial/adopt` });
      expect(adopt.statusCode).toBe(201);
      const v = adopt.json() as { kind: string; params: { salvaged?: boolean } };
      expect(v.kind).toBe('draft');
      expect(v.params.salvaged).toBe(true);
      const book = (await app.inject({ method: 'GET', url: `/api/books/${bookId}` })).json() as { chapters: Array<{ currentVersionId?: string }> };
      expect(book.chapters[0].currentVersionId).toBeUndefined(); // adopt 不动指针
      await app.close();
    } finally {
      try {
        fs.rmSync(dataDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  }, 30000);
});
