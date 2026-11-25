import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config';
import { buildApp } from '../../src/app';
import { createMockProvider } from '../../src/llm/mock';
import { migrate } from '../../src/db/migrate';
import { openDb, type Database } from '../../src/db/open';
import * as chaptersRepo from '../../src/db/repositories/chapters';
import { createBook } from '../../src/db/repositories/books';
import { batchBlueprintSuggest } from '../../src/http/blueprint-batch';

// FB-F5-1（DEC-2026-1125-03）：续写书批量蓝图建议——逐章串行、只落蓝图、不自动跑正文
const BP = (g: string) => ({ goal: g, beats: [], mustHaveBeats: [], bannedTopics: [] });
const BLUEPRINT_TEXT = `GOAL: 少年出发寻物\nBEATS:\n- 告别村落\nHOOK: 信物微光再现`;

let dir: string;
let db: Database;
let config: ReturnType<typeof loadConfig>;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkforge-bp-batch-'));
  db = openDb(path.join(dir, 't.db'));
  migrate(db);
  config = loadConfig({ STRATA_BASE_URL: 'http://127.0.0.1:47831/v1', STRATA_API_KEY: 'strata', STRATA_MODEL: 'iq3_xxs', INKFORGE_DATA_DIR: path.join(dir, 'srv') });
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
    /* Windows 锁瞬态 */
  }
});

describe('batchBlueprintSuggest 纯编排（FB-F5-1，DEC-2026-1125-03）', () => {
  it('批量蓝图：仅无蓝图章逐章串行生成并落库（R-F5-1）', async () => {
    const book = createBook(db, { title: '批量编排测书' });
    chaptersRepo.upsertBlueprint(db, { bookId: book.id, chapterNo: 1, title: '第一章', blueprint: BP('x') });
    chaptersRepo.upsertBlueprint(db, { bookId: book.id, chapterNo: 2, title: '第二章', blueprint: BP('保留原样') });
    chaptersRepo.upsertBlueprint(db, { bookId: book.id, chapterNo: 3, title: '第三章', blueprint: BP('x') });
    db.prepare('UPDATE chapters SET blueprint_json = NULL WHERE book_id = ? AND chapter_no IN (1,3)').run(book.id);

    const order: string[] = [];
    const suggestOnce = async (chapterNo: number) => {
      order.push(`${chapterNo}:start`);
      await Promise.resolve(); // 让出微任务：并行会交错 start/end，串行必相邻配对
      order.push(`${chapterNo}:end`);
      return BP(`gen${chapterNo}`);
    };
    const result = await batchBlueprintSuggest({ db, config, plannerProvider: createMockProvider({ summarize: { text: BLUEPRINT_TEXT } }), suggestOnce }, { bookId: book.id });
    expect(result).toEqual({ generated: 2, failed: 0, items: [{ chapterNo: 1, ok: true }, { chapterNo: 3, ok: true }] });
    expect(order).toEqual(['1:start', '1:end', '3:start', '3:end']); // 串行钉（禁 Promise.all）
    const chapters = chaptersRepo.listChapters(db, book.id);
    expect(chapters.find((c) => c.chapterNo === 2)!.blueprint?.goal).toBe('保留原样'); // 已有蓝图章不处理
    expect(chapters.find((c) => c.chapterNo === 1)!.blueprint?.goal).toBe('gen1');
    expect(chapters.find((c) => c.chapterNo === 3)!.blueprint?.goal).toBe('gen3');
  });

  it('批量端点不自动跑正文；POST /api/runs blueprint-less 400 语义不变（R-F5-2）', async () => {
    const app = await buildApp({ config, provider: createMockProvider({ summarize: { text: BLUEPRINT_TEXT } }), plannerProvider: createMockProvider({ summarize: { text: BLUEPRINT_TEXT } }), db, inlineQueue: true });
    const book = createBook(db, { title: '批量端点测书' });
    chaptersRepo.upsertBlueprint(db, { bookId: book.id, chapterNo: 5, title: '第五章', blueprint: BP('x') });
    db.prepare('UPDATE chapters SET blueprint_json = NULL WHERE book_id = ? AND chapter_no = 5').run(book.id);

    const res = await app.inject({ method: 'POST', url: `/api/books/${book.id}/blueprint-suggest/batch` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ generated: 1, failed: 0 });
    // 不自动跑正文：runs 表零行；ch5 已落蓝图
    expect((db.prepare('SELECT COUNT(*) AS n FROM runs').get() as { n: number }).n).toBe(0);
    expect(chaptersRepo.listChapters(db, book.id)[0].blueprint).toBeTruthy();

    // POST /api/runs 对无蓝图章仍 400（既有语义零改动，本卡守）
    chaptersRepo.upsertBlueprint(db, { bookId: book.id, chapterNo: 7, title: '第七章', blueprint: BP('x') });
    db.prepare('UPDATE chapters SET blueprint_json = NULL WHERE book_id = ? AND chapter_no = 7').run(book.id);
    const run = await app.inject({ method: 'POST', url: '/api/runs', payload: { bookId: book.id, fromChapter: 7, toChapter: 7 } });
    expect(run.statusCode).toBe(400);
    await app.close();
  });
});
