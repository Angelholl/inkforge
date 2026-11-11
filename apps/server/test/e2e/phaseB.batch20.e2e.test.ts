import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RunWithStepsDto } from '@inkforge/shared';
import { loadConfig } from '../../src/config';
import { buildApp } from '../../src/app';
import { createDefaultMockProvider, createMockProvider } from '../../src/llm/mock';

const BP = (i: number) => ({ goal: `试炼第${i}层`, beats: [`进${i}`, `试${i}`, `收${i}`], mustHaveBeats: [], bannedTopics: [] });

const dirs: string[] = [];
const apps: Array<Awaited<ReturnType<typeof buildApp>>> = [];

async function makeApp(provider: ReturnType<typeof createDefaultMockProvider>): Promise<{ app: Awaited<ReturnType<typeof buildApp>>; bookId: string; dataDir: string }> {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkforge-b20-'));
  dirs.push(dataDir);
  const config = loadConfig({ STRATA_BASE_URL: 'http://x', STRATA_API_KEY: 'k', STRATA_MODEL: 'm', INKFORGE_DATA_DIR: dataDir });
  const app = await buildApp({ config, provider, inlineQueue: true });
  apps.push(app);
  const created = await app.inject({ method: 'POST', url: '/api/books', payload: { title: '批量书' } });
  const bookId = (created.json() as { id: string }).id;
  for (let i = 1; i <= 20; i++) {
    const r = await app.inject({ method: 'PUT', url: `/api/books/${bookId}/chapters/${i}/blueprint`, payload: { title: `第${i}层`, blueprint: BP(i), targetChars: 500 } });
    expect(r.statusCode).toBe(200);
  }
  return { app, bookId, dataDir };
}

async function runAll(app: Awaited<ReturnType<typeof buildApp>>, bookId: string, timeoutMs = 60000): Promise<{ runId: string; status: string }> {
  const gen = await app.inject({ method: 'POST', url: `/api/books/${bookId}/generate-all`, payload: {} });
  expect(gen.statusCode).toBe(202);
  const runId = (gen.json() as { runId: string }).runId;
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const r = await app.inject({ method: 'GET', url: `/api/runs/${runId}` });
    const run = r.json() as { status: string };
    if (['done', 'failed', 'cancelled'].includes(run.status)) return { runId, status: run.status };
    if (Date.now() > deadline) return { runId, status: run.status };
    await new Promise((res) => setTimeout(res, 200));
  }
}

afterAll(async () => {
  for (const a of apps) await a.close();
  apps.length = 0;
  for (const d of dirs) {
    try {
      fs.rmSync(d, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
});

describe('Phase B batch20 e2e', () => {
  it('20 章 target 500 mock 全过 → run done（<60s）', async () => {
    const { app, bookId } = await makeApp(createDefaultMockProvider());
    const t0 = Date.now();
    const { runId, status } = await runAll(app, bookId);
    expect(status).toBe('done');
    expect(Date.now() - t0).toBeLessThan(60000);
    const run = (await app.inject({ method: 'GET', url: `/api/runs/${runId}` })).json() as RunWithStepsDto;
    expect(run.steps.length).toBeGreaterThanOrEqual(20 * 4); // 每章 ≥4 步
    void run;
  }, 120000);

  it('ch7 注入 draft 失败 → run done、ch7 无 current_version', async () => {
    const mod = await import('../../src/llm/mock');
    const fallback = mod.createDefaultMockProvider();
    const provider = {
      async complete(req: { meta: { chapterNo?: number; step: string } }) {
        if (req.meta.step === 'draft' && req.meta.chapterNo === 7) {
          const e = new Error('mock injected error: http_500');
          e.name = 'ProviderError';
          throw e;
        }
        return fallback.complete(req as never);
      },
    } as never;
    const { app, bookId } = await makeApp(provider);
    const { runId, status } = await runAll(app, bookId);
    expect(status).toBe('done'); // skip_failures=1
    const book = (await app.inject({ method: 'GET', url: `/api/books/${bookId}` })).json() as {
      chapters: Array<{ chapterNo: number; status: string; currentVersionId?: string }>;
    };
    const ch7 = book.chapters.find((c) => c.chapterNo === 7)!;
    expect(ch7.status).toBe('needs_human');
    expect(ch7.currentVersionId).toBeUndefined();
    const ch8 = book.chapters.find((c) => c.chapterNo === 8)!;
    expect(ch8.status).toBe('done'); // 后续章继续
  }, 120000);
});
