import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config';
import { migrate } from '../../src/db/migrate';
import { openDb, type Database } from '../../src/db/open';
import { createBook } from '../../src/db/repositories/books';
import { upsertBlueprint } from '../../src/db/repositories/chapters';
import { getContinuitySnapshot, listForeshadowings, getRecentSummaries } from '../../src/db/repositories/continuity';
import { runSummarizeStep } from '../../src/pipeline/summarize';
import { createMockProvider } from '../../src/llm/mock';

const config = loadConfig({ STRATA_BASE_URL: 'http://x', STRATA_API_KEY: 'k', STRATA_MODEL: 'm' });

let db: Database;
let dir: string;
let bookId: string;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkforge-sum-'));
  db = openDb(path.join(dir, 't.db'));
  migrate(db);
  bookId = createBook(db, { title: '摘要测试书', characters: [{ name: '张三', baseSetting: '{"位置":"书房"}' }] }).id;
  upsertBlueprint(db, { bookId, chapterNo: 1, title: '章一', blueprint: { goal: 'g', beats: [], mustHaveBeats: [], bannedTopics: [] } });
  // 既有伏笔：本章回收
  db.prepare('INSERT INTO foreshadowings(id, book_id, description, planted_ch, status, created_at) VALUES(?,?,?,?,?,?)').run(
    'f1', bookId, '密信落款人身份', 1, 'open', new Date().toISOString(),
  );
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

const SUMMARY_TEXT = `SUMMARY: 主角夜探书房，发现密信，决意提前南下。
BEATS:
- 夜探书房
- 获得密信
THREADS:
- [resolved] 密信落款人身份
- [planted] 南下路线的伏笔
STATE:
张三={"位置":"庭院","持有":["密信"]}`;

describe('runSummarizeStep', () => {
  it('附录 D summary 文样 → 四类写库；伏笔 resolved/planted；STATE 浅合并', async () => {
    const chId = (db.prepare('SELECT id FROM chapters WHERE book_id=? AND chapter_no=1').get(bookId) as { id: string }).id;
    await runSummarizeStep(
      { db, provider: createMockProvider({ summarize: { text: SUMMARY_TEXT } }), config, emit: () => {} },
      { runId: 'r-sum', chapterId: chId, chapterNo: 1, bookId, finalContent: '正文' },
    );
    // summary + beats + threads
    const summaries = getRecentSummaries(db, bookId, 2);
    expect(summaries.length).toBe(1);
    expect(summaries[0].summary).toBe('主角夜探书房，发现密信，决意提前南下。');
    expect(summaries[0].beats).toEqual(['夜探书房', '获得密信']);
    expect(summaries[0].openThreads.length).toBe(2);
    // 伏笔 resolved
    const f1 = (db.prepare('SELECT status, resolved_ch FROM foreshadowings WHERE id = ?').get('f1') as { status: string; resolved_ch: number });
    expect(f1.status).toBe('resolved');
    expect(f1.resolved_ch).toBe(1);
    // 新伏笔 planted
    const all = listForeshadowings(db, bookId);
    expect(all.find((f) => f.description === '南下路线的伏笔')?.status).toBe('open');
    // STATE 浅合并：书房 → 庭院，保留持有
    const snap = getContinuitySnapshot(db, bookId, 2);
    expect(snap.characters).toEqual([{ name: '张三', state: { 位置: '庭院', 持有: ['密信'] } }]);
  });

  it('e2e（mock）：单章跑完 → summarize step done + chapter_summaries 1 行', async () => {
    const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'inkforge-sum2-'));
    try {
      const config2 = loadConfig({ STRATA_BASE_URL: 'http://x', STRATA_API_KEY: 'k', STRATA_MODEL: 'm', INKFORGE_DATA_DIR: dir2 });
      const { buildApp } = await import('../../src/app');
      const app = await buildApp({ config: config2, provider: createMockProvider({
        draft: { textFn: (m) => `【章${m.chapterNo}s2】独有开头。` + 'e'.repeat(478) },
        qc: { text: 'OVERALL: 9' },
        rewrite: { text: 'OVERALL: 9' },
        summarize: { text: SUMMARY_TEXT },
      }), inlineQueue: true });
      const created = await app.inject({ method: 'POST', url: '/api/books', payload: { title: 'sum-e2e', characters: [{ name: '张三' }] } });
      const bookId2 = (created.json() as { id: string }).id;
      await app.inject({ method: 'PUT', url: `/api/books/${bookId2}/chapters/1/blueprint`, payload: { title: '章一', blueprint: { goal: 'g', beats: [], mustHaveBeats: [], bannedTopics: [] }, targetChars: 500 } });
      const gen = await app.inject({ method: 'POST', url: `/api/books/${bookId2}/chapters/1/generate`, payload: {} });
      const runId = (gen.json() as { runId: string }).runId;
      for (let i = 0; i < 100; i++) {
        await new Promise((r) => setTimeout(r, 100));
        const rr = await app.inject({ method: 'GET', url: `/api/runs/${runId}` });
        const run = rr.json() as { status: string };
        if (run.status === 'done') break;
      }
      const steps = (await app.inject({ method: 'GET', url: `/api/runs/${runId}` })).json() as { steps: Array<{ step: string; status: string }> };
      const sum = steps.steps.find((s) => s.step === 'summarize')!;
      expect(sum.status).toBe('done');
      const db2 = (app as unknown as { constructor: unknown }) && null;
      void db2;
      await app.close();
      // 直接开库查 summaries
      const dbCheck = openDb(path.join(dir2, 'inkforge.db'));
      const n = (dbCheck.prepare('SELECT COUNT(*) AS n FROM chapter_summaries').get() as { n: number }).n;
      expect(n).toBe(1);
      dbCheck.close();
    } finally {
      try {
        fs.rmSync(dir2, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  }, 30000);
});
