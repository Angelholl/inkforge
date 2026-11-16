import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { RunDto, RunWithStepsDto } from '@inkforge/shared';
import { loadConfig } from '../../src/config';
import { buildApp } from '../../src/app';
import { createDefaultMockProvider, createMockProvider } from '../../src/llm/mock';

const BP = { goal: '推进主线', beats: [], mustHaveBeats: [], bannedTopics: [] };
const BLOCKER_QC = `OVERALL: 5
---
SEVERITY: blocker
DIMENSION: 设定一致
QUOTE: 【章
COMMENT: 恒定 blocker`;

const dirs: string[] = [];
const apps: Array<Awaited<ReturnType<typeof buildApp>>> = [];

async function makeApp(provider: ReturnType<typeof createDefaultMockProvider>): Promise<{ app: Awaited<ReturnType<typeof buildApp>>; baseUrl: string; bookId: string; dataDir: string }> {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkforge-e2e-'));
  dirs.push(dataDir);
  const config = loadConfig({ STRATA_BASE_URL: 'http://127.0.0.1:47831/v1', STRATA_API_KEY: 'strata', STRATA_MODEL: 'iq3_xxs', INKFORGE_DATA_DIR: dataDir });
  const app = await buildApp({ config, provider, inlineQueue: true });
  apps.push(app);
  const created = await app.inject({ method: 'POST', url: '/api/books', payload: { title: 'E2E 书' } });
  const bookId = (created.json() as { id: string }).id;
  const bp = await app.inject({ method: 'PUT', url: `/api/books/${bookId}/chapters/1/blueprint`, payload: { title: '第一章', blueprint: BP, targetChars: 500 } });
  expect(bp.statusCode).toBe(200);
  return { app, baseUrl: '', bookId, dataDir };
}

async function pollRun(app: Awaited<ReturnType<typeof buildApp>>, runId: string, want: string[], timeoutMs: number): Promise<RunDto> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const r = await app.inject({ method: 'GET', url: `/api/runs/${runId}` });
    const run = r.json() as RunDto;
    if (want.includes(run.status)) return run;
    if (Date.now() > deadline) return run;
    await new Promise((res) => setTimeout(res, 100));
  }
}

afterAll(async () => {
  for (const a of apps) await a.close();
  apps.length = 0;
  for (const d of dirs) {
    try {
      fs.rmSync(d, { recursive: true, force: true });
    } catch {
      /* Windows 锁瞬态 */
    }
  }
});

describe('Phase A mock 单章闭环 e2e', () => {
  it('闭环：generate → done ≤10s → 章 done → export 含正文', async () => {
    const { app, bookId, dataDir } = await makeApp(createDefaultMockProvider());
    const gen = await app.inject({ method: 'POST', url: `/api/books/${bookId}/chapters/1/generate`, payload: {} });
    expect(gen.statusCode).toBe(202);
    const runId = (gen.json() as { runId: string }).runId;
    const t0 = Date.now();
    const run = await pollRun(app, runId, ['done'], 10000);
    expect(run.status).toBe('done');
    expect(Date.now() - t0).toBeLessThanOrEqual(10000);
    const book = await app.inject({ method: 'GET', url: `/api/books/${bookId}` });
    expect((book.json() as { chapters: Array<{ status: string }> }).chapters[0].status).toBe('done');
    const ex = await app.inject({ method: 'POST', url: `/api/books/${bookId}/export` });
    const files = (ex.json() as { files: string[] }).files;
    expect(files.length).toBe(1);
    const content = fs.readFileSync(path.join(dataDir, 'exports', 'E2E_书', files[0]), 'utf8');
    // 列表已去 content（B2）：先取 id，再单取正文
    const versions = await app.inject({ method: 'GET', url: `/api/books/${bookId}/chapters/1/versions` });
    const finalizeVersionId = (run as RunWithStepsDto).steps.find((s) => s.step === 'finalize')!.outputVersionId!;
    const cur = (versions.json() as { versions: Array<{ id: string }> }).versions.find((v) => v.id === finalizeVersionId)!;
    const curFull = (await app.inject({ method: 'GET', url: `/api/versions/${cur.id}` })).json() as { content: string };
    expect(content).toContain(curFull.content);
  }, 30000);

  it('needs_human：maxRounds=1 + qc 恒 blocker → ≤1 轮重写必停', async () => {
    const { app, bookId } = await makeApp(
      createMockProvider({
        draft: { textFn: (m) => `【章${m.chapterNo}e2e】恒定正文。` + '停'.repeat(480) },
        qc: { repeat: { text: BLOCKER_QC } },
        rewrite: { textFn: (m) => `【章${m.chapterNo}e2e】恒定正文。` + '停'.repeat(480) },
      }),
    );
    const gen = await app.inject({ method: 'POST', url: `/api/books/${bookId}/chapters/1/generate`, payload: { maxRounds: 1 } });
    const runId = (gen.json() as { runId: string }).runId;
    await pollRun(app, runId, ['done'], 15000);
    const book = (await app.inject({ method: 'GET', url: `/api/books/${bookId}` })).json() as { chapters: Array<{ status: string }> };
    expect(book.chapters[0].status).toBe('needs_human');
    const run = (await app.inject({ method: 'GET', url: `/api/runs/${runId}` })).json() as RunWithStepsDto;
    const rewrites = run.steps.filter((s) => s.step === 'rewrite');
    expect(rewrites.length).toBeLessThanOrEqual(1);
  }, 30000);

  it('cancel：draft 流式中取消 → run cancelled', async () => {
    const { app, bookId } = await makeApp(
      createMockProvider({
        draft: { text: '慢慢输出的正文。'.repeat(60), chunks: 60, chunkDelayMs: 200 },
        qc: { text: 'OVERALL: 9' },
        rewrite: { text: 'OVERALL: 9' },
        summarize: { text: 'SUMMARY: x' },
      }),
    );
    const gen = await app.inject({ method: 'POST', url: `/api/books/${bookId}/chapters/1/generate`, payload: {} });
    const runId = (gen.json() as { runId: string }).runId;
    await new Promise((r) => setTimeout(r, 600)); // 让 draft 进入 inflight
    const cancel = await app.inject({ method: 'POST', url: `/api/runs/${runId}/cancel` });
    expect(cancel.statusCode).toBe(202);
    const run = await pollRun(app, runId, ['cancelled', 'done', 'failed'], 8000);
    expect(run.status).toBe('cancelled');
  }, 30000);
});
