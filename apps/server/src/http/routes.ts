import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EventEmitter } from 'node:events';
import { z } from 'zod';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { Database } from '../db/open';
import { assembleContext } from '../context/assembler';
import * as booksRepo from '../db/repositories/books';
import * as chaptersRepo from '../db/repositories/chapters';
import * as runsRepo from '../db/repositories/runs';
import { searchChapters } from '../db/repositories/fts';
import { exportBook } from '../export/export';
import { handleSse } from './sse';
import { blueprintSchema, createBookSchema, createRunSchema, generateSchema, rewriteSelectionSchema, styleBindSchema } from './schemas';
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
    // 委托 runs 队列：创建 run 即 202，执行由队列（inline 或 worker）负责
    const run = runsRepo.createRun(db, { bookId, mode: 'generate', chapterScope: scope, maxRounds });
    reply.code(202).send({ runId: run.id });
  };
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
  app.post('/api/runs', async (req, reply) => {
    const body = parseBody(reply, createRunSchema, req.body);
    if (!body) return;
    if (!booksRepo.getBook(db, body.bookId)) return reply.code(404).send({ error: 'not found' });
    for (let no = body.fromChapter; no <= body.toChapter; no++) {
      const ch = chaptersRepo.getChapter(db, body.bookId, no);
      if (!ch || !ch.blueprint) return reply.code(400).send({ error: `chapter ${no} blueprint missing` });
    }
    const run = runsRepo.createRun(db, { bookId: body.bookId, mode: 'generate', chapterScope: { from: body.fromChapter, to: body.toChapter }, maxRounds: body.maxRounds });
    reply.code(202).send({ runId: run.id });
  });

  app.post('/api/runs/:runId/pause', async (req, reply) => {
    const { runId } = req.params as { runId: string };
    const run = runsRepo.getRun(db, runId);
    if (!run) return reply.code(404).send({ error: 'not found' });
    if (run.status !== 'running' && run.status !== 'queued') return reply.code(409).send({ error: `run is ${run.status}` });
    runsRepo.updateRunStatus(db, runId, 'paused');
    reply.code(202).send({ ok: true });
  });

  app.post('/api/runs/:runId/resume', async (req, reply) => {
    const { runId } = req.params as { runId: string };
    const run = runsRepo.getRun(db, runId);
    if (!run) return reply.code(404).send({ error: 'not found' });
    if (run.status !== 'paused') return reply.code(409).send({ error: `run is ${run.status}` });
    runsRepo.updateRunStatus(db, runId, 'queued');
    reply.code(202).send({ ok: true });
  });

  app.post('/api/runs/:runId/chapters/:chapterNo/rerun', async (req, reply) => {
    const { runId, chapterNo } = req.params as { runId: string; chapterNo: string };
    const run = runsRepo.getRun(db, runId);
    if (!run) return reply.code(404).send({ error: 'not found' });
    const no = Number(chapterNo);
    const ch = chaptersRepo.getChapter(db, run.bookId, no);
    if (!ch || !ch.blueprint) return reply.code(400).send({ error: `chapter ${no} blueprint missing` });
    const rerun = runsRepo.createRun(db, { bookId: run.bookId, mode: 'generate', chapterScope: { from: no, to: no }, maxRounds: run.maxRounds });
    reply.code(202).send({ runId: rerun.id });
  });

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
    // 队列模式：置 cancelled，队列轮询负责 abort 当前章；兼容旧内联 AbortController
    runsRepo.updateRunStatus(db, runId, 'cancelled');
    runAborts.get(runId)?.abort();
    reply.code(202).send({ ok: true });
  });

  // ── partial 残稿（T19）──
  app.get('/api/runs/:runId/chapters/:chapterNo/partial', async (req, reply) => {
    const { runId, chapterNo } = req.params as { runId: string; chapterNo: string };
    const row = db
      .prepare(
        `SELECT po.content, po.updated_at FROM partial_outputs po
         JOIN run_steps rs ON rs.id = po.run_step_id
         JOIN chapters c ON c.id = rs.chapter_id
         WHERE rs.run_id = ? AND c.chapter_no = ?
         ORDER BY po.updated_at DESC LIMIT 1`,
      )
      .get(runId, Number(chapterNo)) as { content: string; updated_at: string } | undefined;
    if (!row) return reply.code(404).send({ error: 'not found' });
    reply.send({ content: row.content, updatedAt: row.updated_at });
  });

  app.post('/api/runs/:runId/chapters/:chapterNo/partial/adopt', async (req, reply) => {
    const { runId, chapterNo } = req.params as { runId: string; chapterNo: string };
    const stepRow = db
      .prepare(
        `SELECT po.content, rs.chapter_id, rs.run_id FROM partial_outputs po
         JOIN run_steps rs ON rs.id = po.run_step_id
         JOIN chapters c ON c.id = rs.chapter_id
         WHERE rs.run_id = ? AND c.chapter_no = ?
         ORDER BY po.updated_at DESC LIMIT 1`,
      )
      .get(runId, Number(chapterNo)) as { content: string; chapter_id: string; run_id: string } | undefined;
    if (!stepRow) return reply.code(404).send({ error: 'not found' });
    const version = chaptersRepo.appendChapterVersion(db, {
      chapterId: stepRow.chapter_id,
      kind: 'draft',
      content: stepRow.content,
      runId: stepRow.run_id,
      params: { salvaged: true },
    });
    reply.code(201).send(version); // 不移动 current 指针
  });

  app.put('/api/books/:bookId/style', async (req, reply) => {
    const { bookId } = req.params as { bookId: string };
    if (!booksRepo.getBook(db, bookId)) return reply.code(404).send({ error: 'not found' });
    const body = parseBody(reply, styleBindSchema, req.body);
    if (!body) return;
    const profile = db.prepare('SELECT id FROM style_profiles WHERE id = ?').get(body.profileId) as { id: string } | undefined;
    if (!profile) return reply.code(404).send({ error: 'profile not found' });
    booksRepo.setBookStyleProfile(db, bookId, body.profileId);
    reply.send({ ok: true, styleProfileId: body.profileId });
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

  // ── report / 选段重写（T30）──
  app.get('/api/runs/:runId/report', async (req, reply) => {
    const { runId } = req.params as { runId: string };
    const run = runsRepo.getRun(db, runId);
    if (!run) return reply.code(404).send({ error: 'not found' });
    const steps = runsRepo.listSteps(db, runId);
    const chapters: Array<{ chapterNo: number; steps: Array<{ step: string; attempt: number; ms: number; usage: { promptTokens: number; completionTokens: number } }> }> = [];
    let totalMs = 0;
    let totalPrompt = 0;
    let totalCompletion = 0;
    const byChapter = new Map<string, typeof steps>();
    for (const st of steps) byChapter.set(st.chapterId, [...(byChapter.get(st.chapterId) ?? []), st]);
    for (const [chapterId, chSteps] of byChapter) {
      const ch = chaptersRepo.getChapterById(db, chapterId);
      const chapterNo = ch?.chapterNo ?? 0;
      const stepRows = chSteps.map((st) => {
        const ms = st.startedAt && st.endedAt ? new Date(st.endedAt).getTime() - new Date(st.startedAt).getTime() : 0;
        totalMs += ms;
        let usage = { promptTokens: 0, completionTokens: 0 };
        if (st.outputVersionId) {
          const v = chaptersRepo.getVersion(db, st.outputVersionId);
          const u = (v?.params as { usage?: { promptTokens?: number; completionTokens?: number } } | undefined)?.usage;
          if (u) usage = { promptTokens: u.promptTokens ?? 0, completionTokens: u.completionTokens ?? 0 };
        }
        totalPrompt += usage.promptTokens;
        totalCompletion += usage.completionTokens;
        return { step: st.step, attempt: st.attempt, ms, usage };
      });
      chapters.push({ chapterNo, steps: stepRows });
    }
    chapters.sort((a, b) => a.chapterNo - b.chapterNo);
    reply.send({ chapters, totals: { ms: totalMs, promptTokens: totalPrompt, completionTokens: totalCompletion } });
  });

  app.post('/api/versions/:versionId/rewrite-selection', async (req, reply) => {
    const { versionId } = req.params as { versionId: string };
    const body = parseBody(reply, rewriteSelectionSchema, req.body);
    if (!body) return;
    const v = chaptersRepo.getVersion(db, versionId);
    if (!v) return reply.code(404).send({ error: 'not found' });
    const chapter = chaptersRepo.getChapterById(db, v.chapterId)!;
    const taskInstruction = `对以下选段按指令改写，只输出改写后的选段文本。
【选段】${body.selection}
【指令】${body.instruction}`;
    const slots = [
      { name: 'hardRules', content: '', budgetChars: 500, stable: true, keep: 'head' as const },
      { name: 'original', content: body.selection, budgetChars: 6000, stable: false, keep: 'head' as const },
      { name: 'task', content: taskInstruction, budgetChars: 500, stable: false, keep: 'head' as const },
    ];
    const assembled = assembleContext(slots, config.providers.local.contextWindow - config.providers.local.maxOutput - 500);
    const res = await provider.complete({
      system: assembled.system,
      user: assembled.user,
      temperature: 0.7,
      topP: 0.9,
      maxOutputTokens: config.providers.local.maxOutput,
      timeoutMs: config.timeouts.rewrite,
      meta: { step: 'rewrite', chapterNo: chapter.chapterNo },
    });
    const newVersion = chaptersRepo.appendChapterVersion(db, {
      chapterId: v.chapterId,
      kind: 'revised',
      content: res.text,
      runId: v.runId,
      model: config.providers.local.model,
      parentVersionId: v.id,
      params: { selectionRewrite: true, selection: body.selection, instruction: body.instruction, usage: res.usage },
    });
    reply.code(201).send(newVersion); // 不移动 current 指针
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
