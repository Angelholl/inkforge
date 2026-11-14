import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { Database } from '../db/open';
import { assembleContext } from '../context/assembler';
import * as booksRepo from '../db/repositories/books';
import * as chaptersRepo from '../db/repositories/chapters';
import * as continuityRepo from '../db/repositories/continuity';
import * as runsRepo from '../db/repositories/runs';
import * as outlineRepo from '../db/repositories/outline';
import { searchChapters } from '../db/repositories/fts';
import { exportBook } from '../export/export';
import { handleSse } from './sse';
import { blueprintSchema, bookMetaPutSchema, createBookSchema, createCharacterSchema, createRunSchema, distillStyleSchema, generateSchema, importOriginalSchema, outlineCheckSchema, outlineTreePutSchema, outlineTreeSuggestSchema, rewriteSelectionSchema, styleBindSchema, updateCharacterSchema } from './schemas';
import { distillStyleProfile } from '../style/distill';
import { runSummarizeStep } from '../pipeline/summarize';
import { pickFewShotSamples } from '../style/sample';
import { configFilePath, readSettingsFile, writeSettingsFile } from '../settings';
import { createRoleProvider } from '../llm/factory';
import { parseBlueprint, parseOutline, parseOutlineTree } from '../llm/plainproto';
import { repairPrompt } from '../quality/l1';
import { renderBlueprintTask, renderCharacterCards, renderOutlineCardSchedule, renderOutlineCheckTask, renderOutlineTask, renderOutlineTreeBrief, renderOutlineTreeTask } from '../prompts/render';
import type { AppConfig } from '../config';
import type { LlmProvider } from '../llm/types';

const WEB_DIST = process.env.INKFORGE_WEB_DIST ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../web/dist');

const settingsPutSchema = z.object({
  strataBaseUrl: z.string().optional(),
  strataApiKey: z.string().optional(),
  strataModel: z.string().optional(),
  cloudBaseUrl: z.string().optional(),
  cloudApiKey: z.string().optional(),
  cloudModel: z.string().optional(),
  mock: z.boolean().optional(),
});

const blueprintSuggestSchema = z.object({ chapterNo: z.number().int().positive() });
const outlineSuggestSchema = z.object({ chapterCount: z.number().int().min(1).max(50) });

const PLANNER_HARD_RULES =
  '【硬规则】你是长篇小说的策划编辑，只输出章节蓝图行协议；不要输出 JSON、markdown 代码块或任何解释。';

const OUTLINE_TREE_HARD_RULES =
  '【硬规则】你是长篇小说的策划编辑，只输出三级大纲树行协议（VOLUME:/STAGE:/CARD:/BODY:）；不要输出 JSON、markdown 代码块或任何解释。';

const OUTLINE_CHECK_HARD_RULES =
  '【硬规则】你是长篇小说的策划编辑，只输出大纲偏离复核报告（自由文本）；不要输出 JSON、markdown 代码块或任何解释。';

export interface RouteState {
  db: Database;
  config: AppConfig;
  provider: LlmProvider;
  /** planner 角色注入缝；缺省由 createRoleProvider(config,'planner') 构造 */
  plannerProvider?: LlmProvider;
  summarizerProvider?: LlmProvider;
  bus: EventEmitter;
  runAborts: Map<string, AbortController>;
}

export async function registerRoutes(app: FastifyInstance, state: RouteState): Promise<void> {
  const { db, config, provider, bus, runAborts } = state;

  await app.register(cors, { origin: ['http://localhost:5173', 'tauri://localhost', 'http://tauri.localhost'] });
  if (fs.existsSync(WEB_DIST)) {
    await app.register(fastifyStatic, { root: WEB_DIST });
    // SPA history 回退：非 /api 的 GET 未命中路由时回 index.html（深链接刷新/直开不 404）
    app.setNotFoundHandler((req, reply) => {
      if (req.method === 'GET' && !req.url.startsWith('/api/')) {
        reply.type('text/html').send(fs.readFileSync(path.join(WEB_DIST, 'index.html')));
        return;
      }
      reply.code(404).send({ message: `Route ${req.method}:${req.url} not found`, error: 'Not Found', statusCode: 404 });
    });
  }

  // ── books ──
  app.post('/api/books', async (req, reply) => {
    const body = parseBody(reply, createBookSchema, req.body);
    if (!body) return;
    reply.code(201).send(booksRepo.createBook(db, body));
  });

  app.get('/api/books', async () => booksRepo.listBooks(db));

  // 删书：活动 run（queued/running/paused）时拒绝，防 worker 写入中途断链
  app.delete('/api/books/:bookId', async (req, reply) => {
    const { bookId } = req.params as { bookId: string };
    if (!booksRepo.getBook(db, bookId)) return reply.code(404).send({ error: 'not found' });
    const activeRun = db
      .prepare("SELECT id FROM runs WHERE book_id = ? AND status IN ('queued','running','paused') LIMIT 1")
      .get(bookId);
    if (activeRun) return reply.code(409).send({ error: '该书存在进行中的 run，请先取消或完成后再删除' });
    booksRepo.deleteBook(db, bookId);
    reply.send({ ok: true });
  });

  app.put('/api/books/:bookId/meta', async (req, reply) => {
    const { bookId } = req.params as { bookId: string };
    if (!booksRepo.getBook(db, bookId)) return reply.code(404).send({ error: 'not found' });
    const body = parseBody(reply, bookMetaPutSchema, req.body);
    if (!body) return;
    const book = booksRepo.updateBookMeta(db, bookId, body);
    reply.send(book);
  });

  // ── 人物卡（characters 表，character_states 以 character_id 联动连续性）──
  app.get('/api/books/:bookId/characters', async (req, reply) => {
    const { bookId } = req.params as { bookId: string };
    if (!booksRepo.getBook(db, bookId)) return reply.code(404).send({ error: 'not found' });
    reply.send(booksRepo.listCharacters(db, bookId));
  });

  app.post('/api/books/:bookId/characters', async (req, reply) => {
    const { bookId } = req.params as { bookId: string };
    if (!booksRepo.getBook(db, bookId)) return reply.code(404).send({ error: 'not found' });
    const body = parseBody(reply, createCharacterSchema, req.body);
    if (!body) return;
    if (booksRepo.getCharacterByName(db, bookId, body.name)) {
      return reply.code(409).send({ error: '人物卡重名' });
    }
    reply.code(201).send(booksRepo.createCharacter(db, bookId, body));
  });

  app.put('/api/books/:bookId/characters/:characterId', async (req, reply) => {
    const { bookId, characterId } = req.params as { bookId: string; characterId: string };
    if (!booksRepo.getBook(db, bookId)) return reply.code(404).send({ error: 'not found' });
    const body = parseBody(reply, updateCharacterSchema, req.body);
    if (!body) return;
    const updated = booksRepo.updateCharacter(db, bookId, characterId, body);
    if (!updated) return reply.code(404).send({ error: 'not found' });
    reply.send(updated);
  });

  app.delete('/api/books/:bookId/characters/:characterId', async (req, reply) => {
    const { bookId, characterId } = req.params as { bookId: string; characterId: string };
    if (!booksRepo.getBook(db, bookId)) return reply.code(404).send({ error: 'not found' });
    if (!booksRepo.deleteCharacter(db, bookId, characterId)) return reply.code(404).send({ error: 'not found' });
    reply.send({ ok: true });
  });

  app.post('/api/books/:bookId/import-original', async (req, reply) => {
    const { bookId } = req.params as { bookId: string };
    if (!booksRepo.getBook(db, bookId)) return reply.code(404).send({ error: 'not found' });
    const body = parseBody(reply, importOriginalSchema, req.body);
    if (!body) return;
    reply.code(201).send(chaptersRepo.importOriginalChapters(db, { bookId, chapters: body.chapters }));
  });

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

  app.post('/api/books/:bookId/blueprint-suggest', async (req, reply) => {
    const { bookId } = req.params as { bookId: string };
    const book = booksRepo.getBook(db, bookId);
    if (!book) return reply.code(404).send({ error: 'not found' });
    const body = parseBody(reply, blueprintSuggestSchema, req.body);
    if (!body) return;
    const { chapterNo } = body;

    const prevChapter = chaptersRepo.getChapter(db, bookId, chapterNo - 1);
    const prevVersion = prevChapter?.currentVersionId ? chaptersRepo.getVersion(db, prevChapter.currentVersionId) : undefined;
    const prevTail = prevVersion?.content ?? '';
    const continuityText = continuityRepo.renderSnapshotText(continuityRepo.getContinuitySnapshot(db, bookId, chapterNo));

    const taskText = renderBlueprintTask({
      chapterNo,
      bookTitle: book.title,
      bookDescription: book.description,
      prevTail,
      continuityText,
    });
    const b = config.budgets.planner;
    const slots = [
      { name: 'hardRules', content: PLANNER_HARD_RULES, budgetChars: b.hardRules, stable: true, keep: 'head' as const },
      { name: 'continuity', content: continuityText, budgetChars: b.continuity, stable: false, keep: 'head' as const },
      { name: 'prevTail', content: prevTail, budgetChars: b.prevTail, stable: false, keep: 'tail' as const },
      { name: 'task', content: taskText, budgetChars: b.task, stable: false, keep: 'head' as const },
    ];
    const totalBudget = config.providers.local.contextWindow - config.providers.local.maxOutput - 500;
    const assembled = assembleContext(slots, totalBudget);

    const plannerProvider = state.plannerProvider ?? createRoleProvider(config, 'planner');
    const baseReq = (user: string) => ({
      system: assembled.system,
      user,
      temperature: 0.3,
      topP: 0.9,
      maxOutputTokens: config.providers.local.maxOutput,
      timeoutMs: 180000,
      meta: { step: 'summarize' as const, chapterNo },
    });

    const first = parseBlueprint((await plannerProvider.complete(baseReq(assembled.user))).text);
    let report = first;
    if (first.errors.length > 0) {
      report = parseBlueprint(
        (await plannerProvider.complete(baseReq(`${assembled.user}\n\n${repairPrompt(first.errors)}`))).text,
      );
    }
    if (report.errors.length > 0) return reply.code(502).send({ error: 'blueprint parse failed', errors: report.errors });
    reply.send({ blueprint: report.blueprint, source: 'llm' });
  });

  app.post('/api/books/:bookId/outline-suggest', async (req, reply) => {
    const { bookId } = req.params as { bookId: string };
    const book = booksRepo.getBook(db, bookId);
    if (!book) return reply.code(404).send({ error: 'not found' });
    const body = parseBody(reply, outlineSuggestSchema, req.body);
    if (!body) return;
    const { chapterCount } = body;

    const ob = config.budgets.outline;
    const charactersText = renderCharacterCards(booksRepo.listCharacters(db, bookId));
    const slots = [
      { name: 'hardRules', content: PLANNER_HARD_RULES, budgetChars: ob.hardRules, stable: true, keep: 'head' as const },
      { name: 'worldview', content: book.description, budgetChars: ob.worldview, stable: false, keep: 'head' as const },
      ...(charactersText ? [{ name: 'characters', content: charactersText, budgetChars: ob.characters, stable: false, keep: 'head' as const }] : []),
      ...(book.outline ? [{ name: 'outline', content: book.outline, budgetChars: ob.outline, stable: false, keep: 'head' as const }] : []),
      { name: 'task', content: renderOutlineTask({ bookTitle: book.title, chapterCount }), budgetChars: ob.task, stable: false, keep: 'head' as const },
    ];
    const totalBudget = config.providers.local.contextWindow - config.providers.local.maxOutput - 500;
    const assembled = assembleContext(slots, totalBudget);

    const plannerProvider = state.plannerProvider ?? createRoleProvider(config, 'planner');
    const baseReq = (user: string) => ({
      system: assembled.system,
      user,
      temperature: 0.3,
      topP: 0.9,
      maxOutputTokens: config.providers.local.maxOutput,
      timeoutMs: 180000,
      meta: { step: 'summarize' as const, chapterNo: 1 },
    });

    const first = parseOutline((await plannerProvider.complete(baseReq(assembled.user))).text, chapterCount);
    let report = first;
    if (first.errors.length > 0) {
      report = parseOutline(
        (await plannerProvider.complete(baseReq(`${assembled.user}

${repairPrompt(first.errors)}`))).text,
        chapterCount,
      );
    }
    if (report.errors.length > 0) return reply.code(502).send({ error: 'outline parse failed', errors: report.errors });
    reply.send({ outline: report.outline, source: 'llm' });
  });

  // ── 三级大纲树（卷→阶段→滚动卡；suggest 产 draft 不入库，PUT 整树替换）──
  app.post('/api/books/:bookId/outline-tree-suggest', async (req, reply) => {
    const { bookId } = req.params as { bookId: string };
    const book = booksRepo.getBook(db, bookId);
    if (!book) return reply.code(404).send({ error: 'not found' });
    const body = parseBody(reply, outlineTreeSuggestSchema, req.body);
    if (!body) return;
    const { chapterCount } = body;

    const ob = config.budgets.outline;
    const charactersText = renderCharacterCards(booksRepo.listCharacters(db, bookId));
    // 注入已有上层节点上下文：防重复生成、保持与已存树的延续
    const treeBrief = (() => {
      const existing = outlineRepo.getOutlineTree(db, bookId);
      return existing ? renderOutlineTreeBrief(existing) : '';
    })();
    const slots = [
      { name: 'hardRules', content: OUTLINE_TREE_HARD_RULES, budgetChars: ob.hardRules, stable: true, keep: 'head' as const },
      { name: 'worldview', content: book.description, budgetChars: ob.worldview, stable: false, keep: 'head' as const },
      ...(charactersText ? [{ name: 'characters', content: charactersText, budgetChars: ob.characters, stable: false, keep: 'head' as const }] : []),
      ...(book.outline ? [{ name: 'outline', content: book.outline, budgetChars: ob.outline, stable: false, keep: 'head' as const }] : []),
      ...(treeBrief ? [{ name: 'existingTree', content: treeBrief, budgetChars: ob.outline, stable: false, keep: 'head' as const }] : []),
      { name: 'task', content: renderOutlineTreeTask({ bookTitle: book.title, chapterCount }), budgetChars: ob.task, stable: false, keep: 'head' as const },
    ];
    const totalBudget = config.providers.local.contextWindow - config.providers.local.maxOutput - 500;
    const assembled = assembleContext(slots, totalBudget);

    const plannerProvider = state.plannerProvider ?? createRoleProvider(config, 'planner');
    const baseReq = (user: string) => ({
      system: assembled.system,
      user,
      temperature: 0.3,
      topP: 0.9,
      maxOutputTokens: config.providers.local.maxOutput,
      timeoutMs: 180000,
      meta: { step: 'summarize' as const, chapterNo: 1 },
    });

    const first = parseOutlineTree((await plannerProvider.complete(baseReq(assembled.user))).text);
    let report = first;
    if (first.errors.length > 0) {
      report = parseOutlineTree(
        (await plannerProvider.complete(baseReq(`${assembled.user}\n\n${repairPrompt(first.errors)}`))).text,
      );
    }
    if (report.errors.length > 0) return reply.code(502).send({ error: 'outline-tree parse failed', errors: report.errors });
    reply.send({ tree: report.tree, source: 'llm' });
  });

  app.get('/api/books/:bookId/outline-tree', async (req, reply) => {
    const { bookId } = req.params as { bookId: string };
    if (!booksRepo.getBook(db, bookId)) return reply.code(404).send({ error: 'not found' });
    reply.send({ tree: outlineRepo.getOutlineTree(db, bookId) });
  });

  app.put('/api/books/:bookId/outline-tree', async (req, reply) => {
    const { bookId } = req.params as { bookId: string };
    if (!booksRepo.getBook(db, bookId)) return reply.code(404).send({ error: 'not found' });
    const body = parseBody(reply, outlineTreePutSchema, req.body);
    if (!body) return;
    outlineRepo.replaceOutlineTree(db, bookId, body.tree);
    reply.send({ tree: outlineRepo.getOutlineTree(db, bookId) });
  });

  // 偏离复核：近 3 章摘要 vs 已存卡安排，LLM 语义复核，报告文本返回不入库
  app.post('/api/books/:bookId/outline-check', async (req, reply) => {
    const { bookId } = req.params as { bookId: string };
    if (!booksRepo.getBook(db, bookId)) return reply.code(404).send({ error: 'not found' });
    const body = parseBody(reply, outlineCheckSchema, req.body ?? {});
    if (!body) return;

    const tree = outlineRepo.getOutlineTree(db, bookId);
    if (!tree) return reply.code(400).send({ error: '尚未保存大纲树，无法复核' });

    // upToChapter 缺省取最大摘要章号；getRecentSummaries 语义为「before 章号之前」取窗，故 +1 含端点
    const maxRow = db.prepare('SELECT MAX(chapter_no) AS n FROM chapter_summaries WHERE book_id = ?').get(bookId) as { n: number | null };
    const upTo = body.upToChapter ?? maxRow.n ?? 0;
    const summaries = continuityRepo.getRecentSummaries(db, bookId, upTo + 1, 3);
    if (summaries.length === 0) return reply.code(400).send({ error: '该范围无章节摘要，请先生成或导入章节摘要' });

    const summariesText = summaries.map((s) => `第${s.chapterNo}章: ${s.summary}`).join('\n');
    const cards = tree.volumes.flatMap((v) => v.stages.flatMap((s) => s.cards)).filter((c) => c.chapterFrom !== null && c.chapterFrom <= upTo);
    const cardsText = renderOutlineCardSchedule(cards);
    if (cardsText === '') return reply.code(400).send({ error: '大纲树中无可比对的卡安排' });

    const plannerProvider = state.plannerProvider ?? createRoleProvider(config, 'planner');
    const res = await plannerProvider.complete({
      system: OUTLINE_CHECK_HARD_RULES,
      user: renderOutlineCheckTask({ summariesText, cardsText }),
      temperature: 0.2,
      topP: 0.9,
      maxOutputTokens: config.providers.local.maxOutput,
      timeoutMs: config.timeouts.summarize,
      meta: { step: 'summarize' as const, chapterNo: upTo },
    });
    reply.send({ report: res.text });
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
    // ① book 存在
    if (!booksRepo.getBook(db, body.bookId)) return reply.code(404).send({ error: 'not found' });
    // ② continue 锚点先验（M11：必须先于 ③ blueprint 校验）
    if (body.mode === 'continue') {
      const anchorNo = body.fromChapter - 1;
      const anchor = chaptersRepo.getChapter(db, body.bookId, anchorNo);
      if (!anchor || !anchor.currentVersionId) return reply.code(400).send({ error: `chapter ${anchorNo} 无续写锚点` });
    }
    // ③ blueprint 逐章校验（generate/continue 共用）
    for (let no = body.fromChapter; no <= body.toChapter; no++) {
      const ch = chaptersRepo.getChapter(db, body.bookId, no);
      if (!ch || !ch.blueprint) return reply.code(400).send({ error: `chapter ${no} blueprint missing` });
    }
    // ④ createRun 透传 mode
    const run = runsRepo.createRun(db, { bookId: body.bookId, mode: body.mode, chapterScope: { from: body.fromChapter, to: body.toChapter }, maxRounds: body.maxRounds });
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

  app.get('/api/style-profiles', async () => {
    const rows = db
      .prepare('SELECT id, name, version, source_path, metrics_json, created_at FROM style_profiles ORDER BY created_at DESC')
      .all() as Array<{ id: string; name: string; version: number; source_path: string; metrics_json: string; created_at: string }>;
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      version: r.version,
      createdAt: r.created_at,
      metrics: JSON.parse(r.metrics_json) as Record<string, number | string>,
      sourcePath: r.source_path,
    }));
  });

  app.post('/api/style-profiles/distill', async (req, reply) => {
    const body = parseBody(reply, distillStyleSchema, req.body);
    if (!body) return;
    if (body.text.replace(/\s/g, '').length < 200) {
      return reply.code(400).send({ error: '样本为空，禁止蒸馏' });
    }
    const provider = state.summarizerProvider ?? createRoleProvider(config, 'summarizer');
    const profileId = await distillStyleProfile(
      { db, provider },
      { name: body.name, sourceText: body.text, samples: pickFewShotSamples(body.text) },
    );
    reply.code(201).send({ profileId });
  });

  app.post('/api/books/:bookId/chapters/:chapterNo/summarize', async (req, reply) => {
    const { bookId, chapterNo } = req.params as { bookId: string; chapterNo: string };
    if (!booksRepo.getBook(db, bookId)) return reply.code(404).send({ error: 'not found' });
    const ch = chaptersRepo.getChapter(db, bookId, Number(chapterNo));
    if (!ch || !ch.currentVersionId) return reply.code(404).send({ error: 'not found' });
    const activeRun = db.prepare("SELECT id FROM runs WHERE book_id = ? AND status IN ('queued','running')").get(bookId) as { id: string } | undefined;
    if (activeRun) return reply.code(409).send({ error: 'book has active run' });
    const version = db.prepare('SELECT content FROM chapter_versions WHERE id = ?').get(ch.currentVersionId) as { content: string } | undefined;
    if (!version) return reply.code(404).send({ error: 'not found' });
    const provider = state.summarizerProvider ?? createRoleProvider(config, 'summarizer');
    await runSummarizeStep(
      { db, provider, config, emit: () => {} },
      { runId: `manual-${randomUUID()}`, chapterId: ch.id, chapterNo: Number(chapterNo), bookId, finalContent: version.content },
    );
    reply.send({ ok: true });
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

  // ── settings ──
  app.get('/api/settings', async () => {
    const s = readSettingsFile();
    return {
      strataBaseUrl: s.STRATA_BASE_URL ?? '',
      strataModel: s.STRATA_MODEL ?? '',
      hasApiKey: Boolean(s.STRATA_API_KEY),
      cloudBaseUrl: s.INKFORGE_CLOUD_BASE_URL ?? '',
      cloudModel: s.INKFORGE_CLOUD_MODEL ?? '',
      hasCloudApiKey: Boolean(s.INKFORGE_CLOUD_API_KEY),
      mock: s.INKFORGE_MOCK === '1',
      configPath: configFilePath(),
    };
  });

  app.put('/api/settings', async (req, reply) => {
    const body = parseBody(reply, settingsPutSchema, req.body ?? {});
    if (!body) return;
    const next = { ...readSettingsFile() };
    const setOrDelete = (key: string, value: string | undefined): void => {
      if (value === undefined) return;
      if (value === '') delete next[key];
      else next[key] = value;
    };
    setOrDelete('STRATA_BASE_URL', body.strataBaseUrl);
    setOrDelete('STRATA_API_KEY', body.strataApiKey);
    setOrDelete('STRATA_MODEL', body.strataModel);
    setOrDelete('INKFORGE_CLOUD_BASE_URL', body.cloudBaseUrl);
    setOrDelete('INKFORGE_CLOUD_API_KEY', body.cloudApiKey);
    setOrDelete('INKFORGE_CLOUD_MODEL', body.cloudModel);
    if (body.mock !== undefined) next.INKFORGE_MOCK = body.mock ? '1' : '0';
    writeSettingsFile(next);
    reply.send({ saved: true, restartRequired: true });
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
