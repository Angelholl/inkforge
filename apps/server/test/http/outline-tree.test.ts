import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config';
import { buildApp } from '../../src/app';
import { createMockProvider } from '../../src/llm/mock';
import { openDb, type Database } from '../../src/db/open';
import * as continuityRepo from '../../src/db/repositories/continuity';
import type { OutlineTreeDto } from '@inkforge/shared';

const TREE_TEXT = `VOLUME: 第一卷 草原崛起
STAGE: 觉醒篇
CARD: 第1-2章 出发
BODY: 告别村落。
CARD: 第3-4章 边城
BODY: 守卫盘查。
STAGE: 汇流篇
CARD: 第5-6章 商路
VOLUME: 第二卷 王城风云
STAGE: 入城篇
CARD: 第7-8章 入城`;

const REPORT_TEXT = `1. 第2章摘要推进至「边城风波」，与卡安排一致。
2. 第3章出现未安排的支线人物，建议并入第3-4章卡。`;

let dir: string;
let db: Database;
let app: Awaited<ReturnType<typeof buildApp>>;

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkforge-outline-tree-'));
  const config = loadConfig({ STRATA_BASE_URL: 'http://127.0.0.1:47831/v1', STRATA_API_KEY: 'strata', STRATA_MODEL: 'iq3_xxs', INKFORGE_DATA_DIR: dir });
  db = openDb(path.join(config.dataDir, 'inkforge.db'));
  app = await buildApp({
    config,
    provider: createMockProvider({ summarize: { text: TREE_TEXT } }),
    summarizerProvider: createMockProvider({ summarize: { text: TREE_TEXT } }),
    plannerProvider: createMockProvider({ summarize: { text: TREE_TEXT } }),
    db,
    inlineQueue: true,
  });
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

async function createBook(title: string): Promise<string> {
  const r = await app.inject({ method: 'POST', url: '/api/books', payload: { title } });
  expect(r.statusCode).toBe(201);
  return (r.json() as { id: string }).id;
}

describe('三级大纲树路由', () => {
  it('suggest 产 draft 不入库 → PUT 整树替换 → GET 往返一致', async () => {
    const bookId = await createBook('三级树测试书');
    // 初始无树
    const empty = await app.inject({ method: 'GET', url: `/api/books/${bookId}/outline-tree` });
    expect(empty.statusCode).toBe(200);
    expect((empty.json() as { tree: OutlineTreeDto | null }).tree).toBeNull();

    // suggest：200 draft，不入库
    const sug = await app.inject({ method: 'POST', url: `/api/books/${bookId}/outline-tree-suggest`, payload: { chapterCount: 8 } });
    expect(sug.statusCode).toBe(200);
    const draft = (sug.json() as { tree: OutlineTreeDto; source: string });
    expect(draft.source).toBe('llm');
    expect(draft.tree.volumes).toHaveLength(2);
    expect(draft.tree.volumes[0].stages[0].cards[0]).toMatchObject({ title: '出发', chapterFrom: 1, chapterTo: 2 });
    const afterSug = await app.inject({ method: 'GET', url: `/api/books/${bookId}/outline-tree` });
    expect((afterSug.json() as { tree: OutlineTreeDto | null }).tree).toBeNull();

    // PUT 整树替换 → GET 往返
    const put = await app.inject({ method: 'PUT', url: `/api/books/${bookId}/outline-tree`, payload: { tree: draft.tree } });
    expect(put.statusCode).toBe(200);
    const saved = (put.json() as { tree: OutlineTreeDto }).tree;
    expect(saved.volumes.map((v) => [v.seq, v.title])).toEqual([
      [1, '第一卷 草原崛起'],
      [2, '第二卷 王城风云'],
    ]);
    expect(saved.volumes[0].stages.map((s) => s.seq)).toEqual([1, 2]);
    expect(saved.volumes[0].stages[0].cards.map((c) => c.title)).toEqual(['出发', '边城']);
    expect(saved.volumes[0].stages[0].cards[0].body).toBe('告别村落。');

    const get = await app.inject({ method: 'GET', url: `/api/books/${bookId}/outline-tree` });
    expect(get.json()).toEqual({ tree: saved });

    // 行数守恒：2 卷 + 3 阶段 + 4 卡
    const n = db.prepare('SELECT COUNT(*) AS n FROM outline_nodes WHERE book_id = ?').get(bookId) as { n: number };
    expect(n.n).toBe(9);

    // 再 PUT 一棵空树 → 清空该书节点
    const putEmpty = await app.inject({ method: 'PUT', url: `/api/books/${bookId}/outline-tree`, payload: { tree: { volumes: [] } } });
    expect(putEmpty.statusCode).toBe(200);
    expect((putEmpty.json() as { tree: OutlineTreeDto | null }).tree).toBeNull();
  });

  it('守卫：404（书不存在）/ 400（参数缺、无树、无可比卡）/ 删书级联清树', async () => {
    const missSug = await app.inject({ method: 'POST', url: '/api/books/no-such-book/outline-tree-suggest', payload: { chapterCount: 4 } });
    expect(missSug.statusCode).toBe(404);
    const missGet = await app.inject({ method: 'GET', url: '/api/books/no-such-book/outline-tree' });
    expect(missGet.statusCode).toBe(404);
    const missPut = await app.inject({ method: 'PUT', url: '/api/books/no-such-book/outline-tree', payload: { tree: { volumes: [] } } });
    expect(missPut.statusCode).toBe(404);
    const missCheck = await app.inject({ method: 'POST', url: '/api/books/no-such-book/outline-check', payload: {} });
    expect(missCheck.statusCode).toBe(404);

    const bookId = await createBook('守卫测试书');
    const badCount = await app.inject({ method: 'POST', url: `/api/books/${bookId}/outline-tree-suggest`, payload: { chapterCount: 0 } });
    expect(badCount.statusCode).toBe(400);
    const badPut = await app.inject({ method: 'PUT', url: `/api/books/${bookId}/outline-tree`, payload: { volumes: [] } });
    expect(badPut.statusCode).toBe(400);
    const noTree = await app.inject({ method: 'POST', url: `/api/books/${bookId}/outline-check`, payload: {} });
    expect(noTree.statusCode).toBe(400);
    expect(((noTree.json() as { error: string }).error)).toContain('尚未保存大纲树');

    // 保存无区间卡的树 → check 无可比卡 400；再保存正常树 → 删书级联不炸（FK 非级联依赖 12 表补齐）
    const nullCardTree: OutlineTreeDto = {
      volumes: [{ title: '卷', body: '', seq: 1, stages: [{ title: '阶段', body: '', seq: 1, cards: [{ title: '未定卡', body: '', seq: 1, chapterFrom: null, chapterTo: null }] }] }],
    };
    const putNull = await app.inject({ method: 'PUT', url: `/api/books/${bookId}/outline-tree`, payload: { tree: nullCardTree } });
    expect(putNull.statusCode).toBe(200);
    const noCards = await app.inject({ method: 'POST', url: `/api/books/${bookId}/outline-check`, payload: {} });
    expect(noCards.statusCode).toBe(400);

    const tree: OutlineTreeDto = {
      volumes: [{ title: '卷', body: '', seq: 1, stages: [{ title: '阶段', body: '', seq: 1, cards: [{ title: '卡', body: '', seq: 1, chapterFrom: 1, chapterTo: 2 }] }] }],
    };
    await app.inject({ method: 'PUT', url: `/api/books/${bookId}/outline-tree`, payload: { tree } });
    const del = await app.inject({ method: 'DELETE', url: `/api/books/${bookId}` });
    expect(del.statusCode).toBe(200);
    const afterDel = db.prepare('SELECT COUNT(*) AS n FROM outline_nodes WHERE book_id = ?').get(bookId) as { n: number };
    expect(afterDel.n).toBe(0);
  });

  it('outline-check：近 3 章摘要 vs 卡安排 → mock 报告返回不入库；无摘要 400', async () => {
    const config = loadConfig({ STRATA_BASE_URL: 'http://127.0.0.1:47831/v1', STRATA_API_KEY: 'strata', STRATA_MODEL: 'iq3_xxs', INKFORGE_DATA_DIR: dir });
    const app2 = await buildApp({
      config,
      provider: createMockProvider({ draft: { text: 'x' }, qc: { text: '' }, summarize: { text: 'y' } }),
      plannerProvider: createMockProvider({ summarize: { text: REPORT_TEXT } }),
      db,
      inlineQueue: true,
    });
    try {
      const created = await app2.inject({ method: 'POST', url: '/api/books', payload: { title: '偏离复核测书' } });
      const bookId = (created.json() as { id: string }).id;
      const tree: OutlineTreeDto = {
        volumes: [
          {
            title: '卷一',
            body: '',
            seq: 1,
            stages: [
              {
                title: '阶段一',
                body: '',
                seq: 1,
                cards: [
                  { title: '出发', body: '告别村落。', seq: 1, chapterFrom: 1, chapterTo: 2 },
                  { title: '边城', body: '守卫盘查。', seq: 2, chapterFrom: 3, chapterTo: 4 },
                  { title: '商路', body: '', seq: 3, chapterFrom: 5, chapterTo: 6 },
                ],
              },
            ],
          },
        ],
      };
      const put = await app2.inject({ method: 'PUT', url: `/api/books/${bookId}/outline-tree`, payload: { tree } });
      expect(put.statusCode).toBe(200);

      // 无摘要 → 400
      const noSum = await app2.inject({ method: 'POST', url: `/api/books/${bookId}/outline-check`, payload: {} });
      expect(noSum.statusCode).toBe(400);
      expect(((noSum.json() as { error: string }).error)).toContain('无章节摘要');

      // 近 3 章摘要（1-3 章）+ upToChapter 缺省=最大摘要章号 → 200 报告
      continuityRepo.upsertChapterSummary(db, { bookId, chapterNo: 1, summary: '少年出发', beats: [], openThreads: [] });
      continuityRepo.upsertChapterSummary(db, { bookId, chapterNo: 2, summary: '抵达边城', beats: [], openThreads: [] });
      continuityRepo.upsertChapterSummary(db, { bookId, chapterNo: 3, summary: '支线人物登场', beats: [], openThreads: [] });
      const check = await app2.inject({ method: 'POST', url: `/api/books/${bookId}/outline-check`, payload: {} });
      expect(check.statusCode).toBe(200);
      expect((check.json() as { report: string }).report).toBe(REPORT_TEXT);

      // upToChapter 显式收窄取窗：upTo=2 → 摘要取 [2,1]
      const captured: Array<{ user: string; meta: { chapterNo?: number } }> = [];
      const app3 = await buildApp({
        config,
        provider: createMockProvider({ draft: { text: 'x' }, qc: { text: '' }, summarize: { text: 'y' } }),
        plannerProvider: {
          complete: async (req) => {
            captured.push({ user: req.user, meta: req.meta });
            return { text: REPORT_TEXT, usage: { promptTokens: 0, completionTokens: 0 }, finishReason: 'stop' };
          },
        },
        db,
        inlineQueue: true,
      });
      try {
        const narrowed = await app3.inject({ method: 'POST', url: `/api/books/${bookId}/outline-check`, payload: { upToChapter: 2 } });
        expect(narrowed.statusCode).toBe(200);
        expect(captured).toHaveLength(1);
        expect(captured[0].user).toContain('第2章: 抵达边城');
        expect(captured[0].user).toContain('第1章: 少年出发');
        expect(captured[0].user).not.toContain('第3章');
        expect(captured[0].user).toContain('第1-2章 出发');
        expect(captured[0].user).not.toContain('第3-4章'); // 卡按 upTo 收窄
        expect(captured[0].user).not.toContain('第5-6章');
        // 复核不入库：无任何落表副作用
        const n = db.prepare("SELECT COUNT(*) AS n FROM outline_nodes WHERE book_id = ? AND level = 'card'").get(bookId) as { n: number };
        expect(n.n).toBe(3);
      } finally {
        await app3.close();
      }
    } finally {
      await app2.close();
    }
  });
});
