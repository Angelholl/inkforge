import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RunDto } from '@inkforge/shared';
import { loadConfig } from '../../src/config';
import { buildApp } from '../../src/app';
import { createDefaultMockProvider } from '../../src/llm/mock';

const BP = { goal: '推进主线', beats: ['进镇'], mustHaveBeats: [], bannedTopics: [] };

let dir: string;
let app: Awaited<ReturnType<typeof buildApp>>;
let bookId: string;
let runId: string;

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkforge-api-'));
  const config = loadConfig({ STRATA_BASE_URL: 'http://127.0.0.1:47831/v1', STRATA_API_KEY: 'strata', STRATA_MODEL: 'iq3_xxs', INKFORGE_DATA_DIR: dir });
  app = await buildApp({ config, provider: createDefaultMockProvider(), inlineQueue: true });
  const created = await app.inject({ method: 'POST', url: '/api/books', payload: { title: 'API 测试书', description: 'API 描述', characters: [{ name: '张三' }] } });
  expect(created.statusCode).toBe(201);
  bookId = (created.json() as { id: string }).id;
  const bp = await app.inject({ method: 'PUT', url: `/api/books/${bookId}/chapters/1/blueprint`, payload: { title: '第一章', blueprint: BP, targetChars: 500 } });
  expect(bp.statusCode).toBe(200);
});

afterAll(async () => {
  await app.close();
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

describe('REST API', () => {
  it('createBook 重复 title 允许', async () => {
    const r = await app.inject({ method: 'POST', url: '/api/books', payload: { title: 'API 测试书' } });
    expect(r.statusCode).toBe(201);
  });

  it('GET book 含 chapters 且 blueprint 往返', async () => {
    const r = await app.inject({ method: 'GET', url: `/api/books/${bookId}` });
    expect(r.statusCode).toBe(200);
    const body = r.json() as { chapters: Array<{ blueprint: typeof BP }> };
    expect(body.chapters[0].blueprint).toEqual(BP);
  });

  it('generate 202 → 轮询 run ≤10s done → versions ≥1 → rollback 生效', async () => {
    const gen = await app.inject({ method: 'POST', url: `/api/books/${bookId}/chapters/1/generate`, payload: {} });
    expect(gen.statusCode).toBe(202);
    runId = (gen.json() as { runId: string }).runId;
    let run: RunDto | null = null;
    for (let i = 0; i < 100; i++) {
      await new Promise((r) => setTimeout(r, 100));
      const rr = await app.inject({ method: 'GET', url: `/api/runs/${runId}` });
      run = rr.json() as RunDto;
      if (run.status === 'done') break;
    }
    expect(run!.status).toBe('done');
    const versions = await app.inject({ method: 'GET', url: `/api/books/${bookId}/chapters/1/versions` });
    expect((versions.json() as unknown[]).length).toBeGreaterThanOrEqual(1);
    const list = versions.json() as Array<{ id: string; kind: string }>;
    // rollback 到最早版本
    const oldest = list[list.length - 1];
    const rb = await app.inject({ method: 'POST', url: `/api/versions/${oldest.id}/rollback` });
    expect(rb.statusCode).toBe(200);
    expect(rb.json()).toMatchObject({ ok: true, currentVersionId: oldest.id });
  });

  it('export 200 且文件落盘；search 命中', async () => {
    const ex = await app.inject({ method: 'POST', url: `/api/books/${bookId}/export` });
    expect(ex.statusCode).toBe(200);
    console.log('EXPORT_BODY', ex.body.slice(0, 400));
    const files = (ex.json() as { files: string[] }).files;
    expect(files.length).toBeGreaterThanOrEqual(1);
    const hits = await app.inject({ method: 'GET', url: `/api/books/${bookId}/search?q=${encodeURIComponent('章1段')}` });
    expect(hits.statusCode).toBe(200);
    expect((hits.json() as unknown[]).length).toBeGreaterThanOrEqual(1);
  });

  it('zod 非法 body 400；未知 id 404', async () => {
    const bad = await app.inject({ method: 'POST', url: '/api/books', payload: { title: '' } });
    expect(bad.statusCode).toBe(400);
    const nf = await app.inject({ method: 'GET', url: '/api/books/no-such-id' });
    expect(nf.statusCode).toBe(404);
    const nfRun = await app.inject({ method: 'GET', url: '/api/runs/no-such-run' });
    expect(nfRun.statusCode).toBe(404);
    const nfVersion = await app.inject({ method: 'GET', url: '/api/versions/no-such-version' });
    expect(nfVersion.statusCode).toBe(404);
  });

  it('cancel 端点 202（对已完成 run 幂等）', async () => {
    const r = await app.inject({ method: 'POST', url: `/api/runs/${runId}/cancel` });
    expect(r.statusCode).toBe(202);
  });

  it('SPA history 回退：深链接 GET 回 index.html，未知 API 仍 404 JSON（回归：2026-11-12 GUI 目验发现）', async () => {
    const deep = await app.inject({ method: 'GET', url: `/books/${bookId}/chapters/1` });
    expect(deep.statusCode).toBe(200);
    expect(deep.headers['content-type']).toContain('text/html');
    expect(deep.body).toContain('<div id="root">');
    const apiMiss = await app.inject({ method: 'GET', url: '/api/definitely-not-a-route' });
    expect(apiMiss.statusCode).toBe(404);
    expect(apiMiss.headers['content-type']).toContain('application/json');
  });
});
