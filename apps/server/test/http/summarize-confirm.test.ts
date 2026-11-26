import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { LlmProvider } from '../../src/llm/types';
import { loadConfig } from '../../src/config';
import { buildApp } from '../../src/app';
import { createDefaultMockProvider, createMockProvider } from '../../src/llm/mock';
import { openDb, type Database } from '../../src/db/open';

interface Generated {
  baseVersionId: string;
  summary: string;
  beats: string[];
  openThreads: string[];
  characterDeltas: Array<{ name: string; stateJson: string }>;
}

let dir: string;
let db: Database;
let config: ReturnType<typeof loadConfig>;
let app: FastifyInstance;
let bookId: string;
const chapterNo = 1;
let baseVersionId: string;

async function makeApp(summarizerProvider = createDefaultMockProvider()): Promise<FastifyInstance> {
  return buildApp({ config, provider: createDefaultMockProvider(), summarizerProvider, db });
}

function count(sql: string, ...params: unknown[]): number {
  return (db.prepare(sql).get(...params) as { n: number }).n;
}

function countSummaries(): number {
  return count('SELECT COUNT(*) AS n FROM chapter_summaries WHERE book_id = ?', bookId);
}

function commitUrl(no: number = chapterNo): string {
  return `/api/books/${bookId}/chapters/${no}/summarize/commit`;
}

function validBody() {
  return { baseVersionId, summary: '确认后的摘要', beats: [], threads: [], states: [] };
}

async function generate(target: FastifyInstance = app): Promise<Generated> {
  const r = await target.inject({ method: 'POST', url: `/api/books/${bookId}/chapters/${chapterNo}/summarize` });
  expect(r.statusCode).toBe(200);
  return r.json() as Generated;
}

function bodyFrom(g: Generated) {
  return {
    baseVersionId: g.baseVersionId,
    summary: g.summary,
    beats: g.beats,
    threads: g.openThreads.map((text) => ({ text, include: true })),
    states: g.characterDeltas.map((d) => ({ ...d, include: true })),
  };
}

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkforge-summarize-confirm-'));
  config = loadConfig({ STRATA_BASE_URL: 'http://127.0.0.1:47831/v1', STRATA_API_KEY: 'strata', STRATA_MODEL: 'iq3_xxs', INKFORGE_DATA_DIR: dir });
  db = openDb(path.join(config.dataDir, 'inkforge.db'));
  app = await makeApp();
  const created = await app.inject({ method: 'POST', url: '/api/books', payload: { title: '补摘要确认书' } });
  expect(created.statusCode).toBe(201);
  bookId = (created.json() as { id: string }).id;
  const imported = await app.inject({
    method: 'POST',
    url: `/api/books/${bookId}/import-original`,
    payload: { chapters: [{ title: '第一章 山门', content: '少年抬头望向远方，山风掠过松林。' }] },
  });
  expect(imported.statusCode).toBe(201);
  const versions = await app.inject({ method: 'GET', url: `/api/books/${bookId}/chapters/${chapterNo}/versions` });
  expect(versions.statusCode).toBe(200);
  baseVersionId = (versions.json() as { currentVersionId: string }).currentVersionId;
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

describe('POST /api/books/:bookId/chapters/:chapterNo/summarize + /commit', () => {
  it('空 SUMMARY → 502 可读错误', async () => {
    const badApp = await makeApp(createMockProvider({ summarize: { text: 'SUMMARY:\nBEATS:\n- 空摘要' } }));
    try {
      const before = countSummaries();
      const r = await badApp.inject({ method: 'POST', url: `/api/books/${bookId}/chapters/${chapterNo}/summarize` });
      expect(r.statusCode).toBe(502);
      const body = r.json() as { error: string; reason: string };
      expect(body.error).toBe('摘要生成失败');
      expect(body.reason).toContain('缺少 SUMMARY 行');
      expect(countSummaries()).toBe(before);
    } finally {
      await badApp.close();
    }
  });

  it('活 run 409 / 陈旧 baseVersionId 409 / 非法 stateJson 400 / 无章 404', async () => {
    db.prepare(
      "INSERT INTO runs(id, book_id, mode, status, chapter_scope_json, skip_failures, salvage_partial, max_rounds, created_at) VALUES('summarize-confirm-active', ?, 'generate', 'running', '[1]', 1, 1, 2, ?)",
    ).run(bookId, new Date().toISOString());
    try {
      const gen = await app.inject({ method: 'POST', url: `/api/books/${bookId}/chapters/${chapterNo}/summarize` });
      expect(gen.statusCode).toBe(409);
      const conflict = await app.inject({ method: 'POST', url: commitUrl(), payload: validBody() });
      expect(conflict.statusCode).toBe(409);
    } finally {
      db.prepare("DELETE FROM runs WHERE id = 'summarize-confirm-active'").run();
    }

    const stale = await app.inject({
      method: 'POST',
      url: commitUrl(),
      payload: { ...validBody(), baseVersionId: 'stale-version-id' },
    });
    expect(stale.statusCode).toBe(409);
    expect((stale.json() as { reason: string }).reason).toBe('stale-base-version');

    const badState = await app.inject({
      method: 'POST',
      url: commitUrl(),
      payload: { ...validBody(), states: [{ name: '少年', stateJson: 'not-json', include: true }] },
    });
    expect(badState.statusCode).toBe(400);

    const noChapter = await app.inject({ method: 'POST', url: commitUrl(999), payload: validBody() });
    expect(noChapter.statusCode).toBe(404);
  });

  it('编辑后 summary 压单行且 ≤2000 落库原样', async () => {
    const g = await generate();
    const edited = `${g.summary}\n第二行编辑\n第三行编辑`;
    const before = countSummaries();
    const r = await app.inject({ method: 'POST', url: commitUrl(), payload: { ...bodyFrom(g), summary: edited } });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ ok: true });
    expect(countSummaries()).toBe(before + 1);

    const row = db
      .prepare('SELECT summary FROM chapter_summaries WHERE book_id = ? AND chapter_no = ?')
      .get(bookId, chapterNo) as { summary: string };
    expect(row.summary).toBe(`${g.summary} 第二行编辑 第三行编辑`);
    expect(row.summary).not.toContain('\n');
    expect(row.summary.length).toBeLessThanOrEqual(2000);

    const tooLong = await app.inject({
      method: 'POST',
      url: commitUrl(),
      payload: { ...bodyFrom(g), summary: 'x'.repeat(2001) },
    });
    expect(tooLong.statusCode).toBe(400);
  });

  it('勾选剔除的 THREADS/STATE 行不写库', async () => {
    const created = await app.inject({
      method: 'POST',
      url: `/api/books/${bookId}/characters`,
      payload: { name: '少年', baseSetting: '{"身份":"主角"}' },
    });
    expect(created.statusCode).toBe(201);

    const beforeF = count('SELECT COUNT(*) AS n FROM foreshadowings WHERE book_id = ?', bookId);
    const beforeS = count('SELECT COUNT(*) AS n FROM character_states');
    const beforeSum = countSummaries();
    const g = await generate();
    expect(g.openThreads.length).toBeGreaterThan(0);
    expect(g.characterDeltas.length).toBeGreaterThan(0);

    const r = await app.inject({
      method: 'POST',
      url: commitUrl(),
      payload: {
        ...bodyFrom(g),
        threads: g.openThreads.map((text) => ({ text, include: false })),
        states: g.characterDeltas.map((d) => ({ ...d, include: false })),
      },
    });
    expect(r.statusCode).toBe(200);
    // chapter_summaries 同章 upsert，行数不变（摘要照常落库）
    expect(countSummaries()).toBe(beforeSum);
    expect(count('SELECT COUNT(*) AS n FROM foreshadowings WHERE book_id = ?', bookId)).toBe(beforeF);
    expect(count('SELECT COUNT(*) AS n FROM character_states')).toBe(beforeS);
  });

  it('commit 在途断连不触发落库（abort generate）', async () => {
    const slow = await makeApp(createMockProvider({ summarize: { error: 'http_500', afterMs: 300 } }));
    const ac = new AbortController();
    const before = countSummaries();
    try {
      const pending = slow.inject({
        method: 'POST',
        url: `/api/books/${bookId}/chapters/${chapterNo}/summarize`,
        signal: ac.signal,
      });
      const timer = setTimeout(() => ac.abort(), 30);
      // 断连侧 inject 以 AbortError 收尾；关心的是服务端不落库
      await pending.catch(() => undefined);
      clearTimeout(timer);
      await new Promise((resolve) => setTimeout(resolve, 400)); // 越过 mock 的 300ms 生成窗口
      expect(countSummaries()).toBe(before);
    } finally {
      await slow.close();
    }
  });

  it('真 socket：延迟 provider 应答期间连接未断 → generate 200（回归 close 挂点，收口黑盒实证）', async () => {
    const slowProvider: LlmProvider = {
      async complete() {
        await new Promise((resolve) => setTimeout(resolve, 300));
        return {
          text: 'SUMMARY: 延迟应答梗概\nBEATS:\n- 节拍甲\nTHREADS:\n- [planted] 测试伏笔\nSTATE:\n甲={"位置":"测试"}',
          usage: { promptTokens: 0, completionTokens: 0 },
          finishReason: 'end_turn',
        };
      },
    };
    const app2 = await makeApp(slowProvider);
    try {
      await app2.listen({ port: 0, host: '127.0.0.1' });
      const port = (app2.server.address() as { port: number }).port;
      const r = await fetch(`http://127.0.0.1:${port}/api/books/${bookId}/chapters/${chapterNo}/summarize`, { method: 'POST' });
      expect(r.status).toBe(200);
      const body = (await r.json()) as Generated;
      expect(body.summary).toBe('延迟应答梗概');
    } finally {
      await app2.close();
    }
  });
});
