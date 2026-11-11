import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EventEmitter } from 'node:events';
import { z } from 'zod';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { RunEvent } from '@inkforge/shared';
import type { Database } from '../db/open';
import { runChapterPipeline } from '../pipeline/chapter';
import * as booksRepo from '../db/repositories/books';
import * as chaptersRepo from '../db/repositories/chapters';
import * as runsRepo from '../db/repositories/runs';
import { searchChapters } from '../db/repositories/fts';
import { exportBook } from '../export/export';
import { handleSse } from './sse';
import { blueprintSchema, createBookSchema, generateSchema } from './schemas';
import type { AppConfig } from '../config';
import type { LlmProvider } from '../llm/types';

const WEB_DIST = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../web/dist');

export interface RouteState {
  db: Database;
  config: AppConfig;
  provider: LlmProvider;
  bus: EventEmitter;
  runAborts: Map<string, AbortController>;
}

export async function registerRoutes(app: FastifyInstance, state: RouteState): Promise<void> {
  const { db, config, provider, bus, runAborts } = state;

  await app.register(cors, { origin: ['http://localhost:5173', 'tauri://localhost', 'http://tauri.localhost'] });
  if (fs.existsSync(WEB_DIST)) {
    await app.register(fastifyStatic, { root: WEB_DIST });
  }

  // ── books ──
  app.post('/api/books', async (req, reply) => {
    const body = parseBody(reply, createBookSchema, req.body);
    if (!body) return;
    reply.code(201).send(booksRepo.createBook(db, body));
  });

  app.get('/api/books', async () => booksRepo.listBooks(db));

  app.get('/api/books/:bookId', async (req, reply) => {
    const { bookId } = req.params as { bookId: string };
    const book = booksRepo.getBook(db, bookId);
    if (!book) return reply.code(404).send({ error: 'not found' });
    reply.send({ ...book, chapters: chaptersRepo.listChapters(db, bookId), runs: runsRepo.listRunsByBook(db, bookId) });
  });

  app.put('/api/books/:bookId/chapters/:chapterNo/blueprint', async (req, reply) => {
    const { bookId, chapterNo } = req.params as { bookId: string; chapterNo: string };
    if (!booksRepo.getBook(db, bookId)) return reply.code(404).send({ error: 'not found' });
    const body = parseBody(reply, blueprintSchema, req.body);
    if (!body) return;
    reply.send(
      chaptersRepo.upsertBlueprint(db, {
        bookId,
        chapterNo: Number(chapterNo),
        title: body.title,
        blueprint: body.blueprint,
        targetChars: body.targetChars,
      }),
    );
  });

  const startRun = (reply: FastifyReply, bookId: string, scope: { from: number; to: number }, maxRounds?: number): void => {
    const run = runsRepo.createRun(db, { bookId, mode: 'generate', chapterScope: scope, maxRounds });
    const ac = new AbortController();
    runAborts.set(run.id, ac);
    reply.code(202).send({ runId: run.id });
    // Phase A：服务内联异步执行（不 await）；T18 起改走 worker 队列
    void (async () => {
      try {
        updateRunStatusRunning(run.id);
        for (let no = scope.from; no <= scope.to; no++) {
          if (ac.signal.aborted) break;
          await runChapterPipeline({ db, provider, config, emit: (e) => bus.emit(run.id, e) }, { runId: run.id, bookId, chapterNo: no, signal: ac.signal });
        }
        updateRunStatusEnd(run.id, ac.signal.aborted ? 'cancelled' : 'done', ac.signal.aborted ? undefined : undefined);
      } catch (e) {
        const aborted = ac.signal.aborted || (e as Error).name === 'AbortError';
        updateRunStatusEnd(run.id, aborted ? 'cancelled' : 'failed', aborted ? undefined : (e as Error).message);
      } finally {
        runAborts.delete(run.id);
      }
    })();
  };
  const { updateRunStatus } = runsRepo;
  function updateRunStatusRunning(runId: string): void {
    updateRunStatus(db, runId, 'running', { startedAt: new Date().toISOString() });
    bus.emit(runId, { type: 'run.status', runId, status: 'running', ts: new Date().toISOString() } satisfies RunEvent);
  }
  function updateRunStatusEnd(runId: string, status: 'done' | 'cancelled' | 'failed', error?: string): void {
    updateRunStatus(db, runId, status, { endedAt: new Date().toISOString(), error });
    bus.emit(runId, { type: 'run.status', runId, status, ts: new Date().toISOString() } satisfies RunEvent);
  }

  app.post('/api/books/:bookId/chapters/:chapterNo/generate', async (req, reply) => {
    const { bookId, chapterNo } = req.params as { bookId: string; chapterNo: string };
    const chapter = chaptersRepo.getChapter(db, bookId, Number(chapterNo));
    if (!chapter || !chapter.blueprint) return reply.code(404).send({ error: 'not found' });
    const body = parseBody(reply, generateSchema, req.body ?? {});
    if (!body) return;
    startRun(reply, bookId, { from: Number(chapterNo), to: Number(chapterNo) }, body.maxRounds);
  });

  app.post('/api/books/:bookId/generate-all', async (req, reply) => {
    // 便捷端点：整书逐章生成（Phase A 内联版；T18 起走 runs 队列）
    const { bookId } = req.params as { bookId: string };
    const chapters = chaptersRepo.listChapters(db, bookId);
    if (chapters.length === 0 || chapters.some((c) => !c.blueprint)) return reply.code(400).send({ error: 'blueprint missing' });
    const body = parseBody(reply, generateSchema, req.body ?? {});
    if (!body) return;
    startRun(reply, bookId, { from: chapters[0].chapterNo, to: chapters[chapters.length - 1].chapterNo }, body.maxRounds);
  });

  // ── runs ──
  app.get('/api/runs/:runId', async (req, reply) => {
    const { runId } = req.params as { runId: string };
    const run = runsRepo.getRun(db, runId);
    if (!run) return reply.code(404).send({ error: 'not found' });
    reply.send({ ...run, steps: runsRepo.listSteps(db, runId) });
  });

  app.get('/api/runs/:runId/events', async (req, reply) => {
    const { runId } = req.params as { runId: string };
    handleSse(req, reply, runId, {
      getSnapshot: (id) => {
        const run = runsRepo.getRun(db, id);
        if (!run) return null;
        return { run, steps: runsRepo.listSteps(db, id) };
      },
      subscribe: (id, l) => bus.on(id, l),
      unsubscribe: (id, l) => bus.off(id, l),
      pingMs: Number(process.env.INKFORGE_TEST_SSE_PING_MS ?? 15000),
      deltaThrottleMs: 500,
    });
  });

  app.post('/api/runs/:runId/cancel', async (req, reply) => {
    const { runId } = req.params as { runId: string };
    if (!runsRepo.getRun(db, runId)) return reply.code(404).send({ error: 'not found' });
    runAborts.get(runId)?.abort();
    reply.code(202).send({ ok: true });
  });

  // ── versions ──
  app.get('/api/books/:bookId/chapters/:chapterNo/versions', async (req, reply) => {
    const { bookId, chapterNo } = req.params as { bookId: string; chapterNo: string };
    const chapter = chaptersRepo.getChapter(db, bookId, Number(chapterNo));
    if (!chapter) return reply.code(404).send({ error: 'not found' });
    reply.send(chaptersRepo.listVersions(db, chapter.id));
  });

  app.get('/api/versions/:versionId', async (req, reply) => {
    const { versionId } = req.params as { versionId: string };
    const v = chaptersRepo.getVersion(db, versionId);
    if (!v) return reply.code(404).send({ error: 'not found' });
    reply.send(v);
  });

  app.post('/api/versions/:versionId/rollback', async (req, reply) => {
    const { versionId } = req.params as { versionId: string };
    const v = chaptersRepo.getVersion(db, versionId);
    if (!v) return reply.code(404).send({ error: 'not found' });
    chaptersRepo.setCurrentVersion(db, v.chapterId, versionId);
    reply.send({ ok: true, currentVersionId: versionId });
  });

  // ── export / search ──
  app.post('/api/books/:bookId/export', async (req, reply) => {
    const { bookId } = req.params as { bookId: string };
    const book = booksRepo.getBook(db, bookId);
    if (!book) return reply.code(404).send({ error: 'not found' });
    const outDir = path.join(config.dataDir, 'exports', book.title.replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 50));
    reply.send(await exportBook(db, bookId, outDir));
  });

  app.get('/api/books/:bookId/search', async (req, reply) => {
    const { bookId } = req.params as { bookId: string };
    const q = (req.query as { q?: string }).q ?? '';
    if (!booksRepo.getBook(db, bookId)) return reply.code(404).send({ error: 'not found' });
    reply.send(searchChapters(db, bookId, q));
  });
}

function parseBody<T extends z.ZodTypeAny>(reply: FastifyReply, schema: T, body: unknown): z.infer<T> | null {
  try {
    return schema.parse(body) as z.infer<T>;
  } catch (e) {
    reply.code(400).send({ error: (e as z.ZodError).message });
    return null;
  }
}
