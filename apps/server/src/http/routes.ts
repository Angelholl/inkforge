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
import * as continuityRepo from '../db/repositories/continuity';
import * as runsRepo from '../db/repositories/runs';
import * as outlineRepo from '../db/repositories/outline';
import * as imitationRepo from '../db/repositories/imitation';
import { searchChapters } from '../db/repositories/fts';
import { backupBookPredelete } from '../db/backup';
import { exportBook, safeSegment } from '../export/export';
import { handleSse } from './sse';
import { mergeSeedIntoBlueprint } from './blueprint-merge';
import { batchBlueprintSuggest } from './blueprint-batch';
import { blueprintSchema, bookMetaPutSchema, characterInstantiateSchema, createBookSchema, createCharacterSchema, createRunSchema, distillStyleSchema, distillTemplatePutSchema, foreshadowingCreateSchema, foreshadowingUpdateSchema, fusionGateAnalyzeSchema, fusionGateConfirmSchema, generateSchema, imitationAnalyzeSchema, imitationBindSchema, imitationSaveSchema, importOriginalSchema, landingWordsPutSchema, outlineCheckSchema, outlineTreePutSchema, outlineTreeSuggestSchema, plotAnalyzeSchema, plotBindSchema, plotSaveSchema, polishSchema, qualityPutSchema, rewriteSelectionSchema, settingsImportApplySchema, settingsImportPreviewSchema, settingsImportRefineSchema, spectrumAnalyzeSchema, spectrumBindSchema, spectrumSaveSchema, styleBindSchema, styleFewshotPutSchema, styleProfileCreateSchema, summaryCommitSchema, updateCharacterSchema } from './schemas';
import { instantiateCharacters } from './character-instantiate';
import { abortOnDisconnect } from './close-abort';
import { analyzeImitation } from '../imitation';
import { analyzePlot } from '../plot';
import { analyzeSpectrum } from '../spectrum';
import { buildTensionPrompt, parseTensionRows } from '../fusion/tension';
import { applyFusionConfirm, type ConfirmDecisions } from '../fusion/apply';
import { computeFusionRows, type FusionCarriers } from '../fusion/engine';
import { injectionFaceFingerprint, type InjectionFace } from '../fusion/fingerprint';
import { parseLandingCell, parseSettingsCompendium, refineForDescription, splitCompendiumSections } from '../settings-import';
import { ensureLandingWordsUserFile, parseLandingWordsText, readLandingWordsUserFile, resolveLandingWordsPath, validateLandingWordsText, writeLandingWordsUserFile } from '../quality/landing-words';
import { analyzeStyle } from '../style/analysis';
import * as plotRepo from '../db/repositories/plot';
import * as spectrumRepo from '../db/repositories/spectrum';
import { saveStyleProfile } from '../style/analysis';
import { buildStyleBundle, contentFromProfileRow, type StyleProfileContent } from '../style/merge';
import * as distillJobRepo from '../style/distill-job';
import { pickFewShotAndHeldOut } from '../style/sample';
import type { ChapterBlueprint, DistillStyleDraftDto, OutlineCardDto, OutlineTreeDto, StyleAnalysisDto, SummaryCommitBody, SummaryGenerateResultDto } from '@inkforge/shared';
import { countChars, FULL_TEXT_REWRITE_MAX_CHARS, mergeLegacyDimTexts, parseLandingMandate } from '@inkforge/shared';
import { commitSummarize, generateSummarize } from '../pipeline/summarize';
import { refineDescriptionWithLlm } from '../refine';
import { configFilePath, readScoreThreshold, readSettingsFile, writeScoreThreshold, writeSettingsFile } from '../settings';
import { createRoleProvider, pickProviderForRole } from '../llm/factory';
import { parseBlueprint, parseOutline, parseOutlineTree, type ParsedBlueprint } from '../llm/plainproto';
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
  // mock 开关已彻底删除（owner 拍板）：mock 只认 INKFORGE_MOCK 环境变量（开发/测试用）
});

const blueprintSuggestSchema = z.object({ chapterNo: z.number().int().positive(), seed: z.object({ goal: z.string().optional(), beats: z.array(z.string()).optional(), mustHaveBeats: z.array(z.object({ text: z.string(), keywords: z.array(z.string()).optional(), grade: z.enum(['H', 'L']).optional() })).optional(), bannedTopics: z.array(z.string()).optional() }).optional(), draftText: z.string().min(1).max(20000).optional() });
const outlineSuggestSchema = z.object({ chapterCount: z.number().int().min(1).max(50) });

/** 按章号取命中卡：树遍历序（卷→阶段→卡 seq）首个 chapterFrom/To 非空且覆盖该章的卡；区间重叠首卡胜（与 apply 同语义）。 */
function findOutlineCardForChapter(tree: OutlineTreeDto, chapterNo: number): OutlineCardDto | undefined {
  for (const vol of tree.volumes) {
    for (const stage of vol.stages) {
      for (const card of stage.cards) {
        if (card.chapterFrom == null || card.chapterTo == null) continue; // DTO=number|undefined（同 1-2 钉正）
        if (card.chapterFrom <= chapterNo && chapterNo <= card.chapterTo) return card;
      }
    }
  }
  return undefined;
}

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
  /** refiner 角色注入缝；缺省由 createRoleProvider(config,'refiner') 构造 */
  refinerProvider?: LlmProvider;
  bus: EventEmitter;
  runAborts: Map<string, AbortController>;
}

export async function registerRoutes(app: FastifyInstance, state: RouteState): Promise<void> {
  const { db, config, provider, bus, runAborts } = state;

  await app.register(cors, {
    origin: ['http://localhost:5173', 'tauri://localhost', 'http://tauri.localhost'],
    // 默认仅 GET/HEAD/POST，DELETE 预检会被浏览器拒（书架删除 Failed to fetch 根因）
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
  });
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

  app.post('/api/books/:bookId/characters/instantiate', async (req, reply) => {
    // FB-F2-2（DEC-2026-1125-03）：光谱档案→AI 实例化人物卡——返回草稿供审阅，保存仍走既有 POST /characters（409 语义不动）
    const { bookId } = req.params as { bookId: string };
    if (!booksRepo.getBook(db, bookId)) return reply.code(404).send({ error: 'not found' });
    const body = parseBody(reply, characterInstantiateSchema, req.body ?? {});
    if (!body) return;
    const book0 = booksRepo.getBook(db, bookId)!; // 上方已验存在
    if (!book0.spectrumProfileId) return reply.code(400).send({ error: '未绑定人物光谱档案' });
    // planner 注入缝沿 plot/spectrum 测试先例（缺省 createRoleProvider 指向真实地址会挂死）
    const provider = state.plannerProvider ?? createRoleProvider(config, 'planner');
    reply.send(await instantiateCharacters({ db, provider }, { bookId, maxCards: body.maxCards }));
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

  // ── 伏笔 CRUD（三小件 C2）──
  app.get('/api/books/:bookId/foreshadowings', async (req, reply) => {
    const { bookId } = req.params as { bookId: string };
    if (!booksRepo.getBook(db, bookId)) return reply.code(404).send({ error: 'not found' });
    reply.send(continuityRepo.listForeshadowings(db, bookId));
  });

  app.post('/api/books/:bookId/foreshadowings', async (req, reply) => {
    const { bookId } = req.params as { bookId: string };
    if (!booksRepo.getBook(db, bookId)) return reply.code(404).send({ error: 'not found' });
    const body = parseBody(reply, foreshadowingCreateSchema, req.body);
    if (!body) return;
    const id = continuityRepo.upsertForeshadowing(db, { bookId, description: body.description, plantedCh: body.plantedCh });
    reply.code(201).send(continuityRepo.getForeshadowing(db, id));
  });

  app.put('/api/books/:bookId/foreshadowings/:foreshadowingId', async (req, reply) => {
    const { bookId, foreshadowingId } = req.params as { bookId: string; foreshadowingId: string };
    if (!booksRepo.getBook(db, bookId)) return reply.code(404).send({ error: 'not found' });
    const body = parseBody(reply, foreshadowingUpdateSchema, req.body);
    if (!body) return;
    try {
      const updated = continuityRepo.updateForeshadowing(db, foreshadowingId, body);
      if (!updated) return reply.code(404).send({ error: 'not found' });
      reply.send(updated);
    } catch (e) {
      reply.code(400).send({ error: (e as Error).message });
    }
  });

  app.delete('/api/books/:bookId/foreshadowings/:foreshadowingId', async (req, reply) => {
    const { bookId, foreshadowingId } = req.params as { bookId: string; foreshadowingId: string };
    if (!booksRepo.getBook(db, bookId)) return reply.code(404).send({ error: 'not found' });
    if (!continuityRepo.deleteForeshadowing(db, foreshadowingId)) return reply.code(404).send({ error: 'not found' });
    reply.send({ ok: true });
  });

  app.post('/api/books/:bookId/import-original', async (req, reply) => {
    const { bookId } = req.params as { bookId: string };
    if (!booksRepo.getBook(db, bookId)) return reply.code(404).send({ error: 'not found' });
    const body = parseBody(reply, importOriginalSchema, req.body);
    if (!body) return;
    reply.code(201).send(chaptersRepo.importOriginalChapters(db, { bookId, chapters: body.chapters }));
  });

  // ── 设定集导入（DEC-2026-1120-04：preview 纯解析出草稿；apply 事务建书+归档+文风步）──
  app.post('/api/settings-import/preview', async (req, reply) => {
    const body = parseBody(reply, settingsImportPreviewSchema, req.body);
    if (!body) return;
    reply.send(parseSettingsCompendium(body.content));
  });

  app.post('/api/settings-import/apply', async (req, reply) => {
    const body = parseBody(reply, settingsImportApplySchema, req.body);
    if (!body) return;
    const d = body.draft;
    const title = d.title.trim();
    if (title === '') return reply.code(400).send({ error: '书名不能为空' });
    // 人物卡按 name 去重（预览未去重的手改兜底）
    const seenNames = new Set<string>();
    const characters = d.characters.filter((c) => {
      const key = c.name.trim();
      if (key === '' || seenNames.has(key)) return false;
      seenNames.add(key);
      return true;
    });
    const warnings: string[] = [];
    let bookId: string;
    try {
      // 嵌套事务=createBook 内部事务以 savepoint 运行，任一环失败整体回滚
      bookId = db.transaction(() => {
        const book = booksRepo.createBook(db, { title, description: d.description, outline: d.outline, characters });
        outlineRepo.replaceOutlineTree(db, book.id, d.outlineTree);
        // 章骨架（DEC-2026-1120-10）：单一真值源=outlineTree 卡；区间重叠首卡胜（遍历序先到先得）
        const claimed = new Set<number>();
        let skeletonCapped = false;
        for (const vol of d.outlineTree.volumes) {
          for (const stage of vol.stages) {
            for (const card of stage.cards) {
              if (skeletonCapped) break;
              if (card.chapterFrom == null || card.chapterTo == null) continue;
              if (card.chapterFrom < 1 || card.chapterTo < card.chapterFrom) continue;
              const landing = parseLandingCell(card.body);
              const mustHave = landing !== null && landing.keywords.length > 0
                ? [{ text: card.body.trim(), keywords: landing.keywords, grade: landing.grade }]
                : [];
              let contributed = 0;
              const to = Math.min(card.chapterTo, card.chapterFrom + 49); // 单卡展开上限 50 章（沿 outlineItems 预填先例）
              for (let ch = card.chapterFrom; ch <= to; ch++) {
                if (claimed.has(ch)) continue; // 区间重叠=首卡胜
                if (claimed.size >= 300) {
                  warnings.push('章骨架超过 300 章，已截断（保留前 300）');
                  skeletonCapped = true;
                  break;
                }
                claimed.add(ch);
                contributed += 1;
                chaptersRepo.upsertBlueprint(db, {
                  bookId: book.id,
                  chapterNo: ch,
                  title: card.title !== '' ? card.title : `第${ch}章`,
                  blueprint: {
                    goal: card.body !== '' ? card.body : card.title, // 空 body 回落卡题（沿 outlineItems 先例）
                    beats: [],
                    mustHaveBeats: mustHave,
                    bannedTopics: [],
                  },
                });
              }
              if (contributed > 0 && landing !== null && landing.keywords.length === 0) {
                warnings.push(`卡「${card.title}」落地格「${card.body.trim()}」未解析出可靠关键词，未预填必含节拍（可手补蓝图）`);
              }
            }
          }
        }
        for (const f of d.foreshadowings) {
          continuityRepo.upsertForeshadowing(db, { bookId: book.id, description: f.description, plantedCh: f.plantedCh });
        }
        // 勾选才写 mandate（DEC-2026-1122-01 Task-04）：enabled=true 时在同一事务内写 cadence（N 取钉值），
        // 失败随建书回滚=与书同生共死；未勾选/默认 false 零写入（新书 landingMandate=null=off）
        if (body.landingMandate.enabled) {
          booksRepo.updateBookMeta(db, book.id, {
            landingMandate: { mode: 'cadence', heavyEveryN: body.landingMandate.heavyEveryN },
          });
        }
        return book.id;
      })();
    } catch (e) {
      return reply.code(500).send({ error: `设定导入落库失败：${(e as Error).message}` });
    }
    // 文风步（拍板②）与归档共用警示通道
    // 整篇 MD 归档（沿 data/exports 先例；未映射节信息兜底）。书已建成（事务已提交），
    // 归档失败降级 warning 而非 500：500 会让 owner 误以为建书失败而重试 → 重复建书
    //（2026-11-20 审计发现，同文风步「失败不回滚建书」先例）
    const importDir = path.join(config.dataDir, 'imports');
    const sourcePath = path.join(importDir, `${bookId}-settings.md`);
    let archived = true;
    try {
      await fs.promises.mkdir(importDir, { recursive: true });
      await fs.promises.writeFile(sourcePath, body.content, 'utf8');
    } catch (e) {
      archived = false;
      warnings.push(`设定集原文归档失败：${(e as Error).message}（书已建成，原文请自行留存）`);
    }
    let styleProfileId: string | null = null;
    const styleText = d.styleSection.trim();
    if (d.importStyle && styleText !== '') {
      if (styleText.replace(/\s/g, '').length < 200) {
        warnings.push('文风节不足 200 字，已跳过风格档案导入（可在蒸馏工作台手动蒸馏）');
      } else {
        try {
          const plannerProvider = state.plannerProvider ?? createRoleProvider(config, 'planner');
          const { analysis } = await analyzeStyle({ provider: plannerProvider }, { sourceText: styleText, samples: [styleText] });
          const { id: profileId } = saveStyleProfile(db, {
            name: `${title}·文风规范`,
            source: styleText,
            analysis: analysis as StyleAnalysisDto,
            samples: [{ id: 's0', text: styleText }],
            evaluation: [],
          });
          const row = db
            .prepare('SELECT id, version, rules_json, samples_json, metrics_json FROM style_profiles WHERE id = ?')
            .get(profileId) as { id: string; version: number; rules_json: string; samples_json: string; metrics_json: string };
          const bundle = buildStyleBundle({
            primaryProfileId: profileId,
            auxProfileIds: [],
            dimsSource: {},
            profiles: { [profileId]: contentFromProfileRow(row) },
          });
          booksRepo.setBookStyleBinding(db, bookId, { primaryProfileId: profileId, auxProfileIds: [], dimsSource: {}, weights: {} }, JSON.stringify(bundle));
          styleProfileId = profileId;
        } catch (e) {
          warnings.push(`文风节导入风格档案失败：${(e as Error).message}（书已建成，可在蒸馏工作台手动蒸馏）`);
        }
      }
    }
    const volumes = d.outlineTree.volumes;
    reply.code(201).send({
      bookId,
      sourcePath: archived ? sourcePath : null,
      styleProfileId,
      warnings,
      counts: {
        characters: characters.length,
        volumes: volumes.length,
        stages: volumes.reduce((n, v) => n + v.stages.length, 0),
        cards: volumes.reduce((n, v) => n + v.stages.reduce((m, s) => m + s.cards.length, 0), 0),
        foreshadowings: d.foreshadowings.length,
      },
    });
  });

  // T8（D4 设定集精炼端点）：502+errors 外部契约定死，不做 catch 降级、不写库
  app.post('/api/settings-import/refine', async (req, reply) => {
    const body = parseBody(reply, settingsImportRefineSchema, req.body);
    if (!body) return;
    const ac = new AbortController();
    abortOnDisconnect(reply, ac);
    const provider = state.refinerProvider ?? createRoleProvider(config, 'refiner');
    try {
      const result = await refineDescriptionWithLlm(
        { provider, config, providerConfig: pickProviderForRole(config, 'refiner') },
        { raw: body.content, budgetChars: 20000, signal: ac.signal },
      );
      reply.send(result);
    } catch (e) {
      reply.code(502).send({ error: 'refine failed', reason: (e as Error).message });
    }
  });

  app.get('/api/books/:bookId', async (req, reply) => {
    const { bookId } = req.params as { bookId: string };
    const book = booksRepo.getBook(db, bookId);
    if (!book) return reply.code(404).send({ error: 'not found' });
    // 落地策略（DEC-2026-1122-01）：覆盖为解析形态并删原始 JSON 串键（不向客户端泄漏 landingMandateJson）
    // 门状态同源（Task-04）：genGateJson 亦不向客户端泄漏，沿本先例解构 void
    const { landingMandateJson, genGateJson, ...bookRest } = book;
    void landingMandateJson;
    void genGateJson;
    reply.send({ ...bookRest, landingMandate: parseLandingMandate(book.landingMandateJson), styleBinding: booksRepo.getBookStyleBinding(db, bookId), chapters: chaptersRepo.listChapters(db, bookId), runs: runsRepo.listRunsByBook(db, bookId) });
  });

  app.put('/api/books/:bookId/chapters/:chapterNo/blueprint', async (req, reply) => {
    const { bookId, chapterNo } = req.params as { bookId: string; chapterNo: string };
    if (!booksRepo.getBook(db, bookId)) return reply.code(404).send({ error: 'not found' });
    const body = parseBody(reply, blueprintSchema, req.body);
    if (!body) return;
    const existingBeats = chaptersRepo.getChapter(db, bookId, Number(chapterNo))?.blueprint?.mustHaveBeats ?? [];
    const mergedBeats = [...existingBeats];
    for (const m of body.blueprint.mustHaveBeats) {
      if (!mergedBeats.some((x) => x.text.trim() === m.text.trim())) mergedBeats.push(m); // 去重键=text trim 全等（不含 grade）；卡预填在前（优先存活，grade 随条目保留）
    }
    reply.send(
      chaptersRepo.upsertBlueprint(db, {
        bookId,
        chapterNo: Number(chapterNo),
        title: body.title,
        blueprint: { ...body.blueprint, mustHaveBeats: mergedBeats },
        targetChars: body.targetChars,
      }),
    );
  });

  app.post('/api/books/:bookId/blueprint-suggest', async (req, reply) => {
    const { bookId } = req.params as { bookId: string };
    if (!booksRepo.getBook(db, bookId)) return reply.code(404).send({ error: 'not found' });
    const body = parseBody(reply, blueprintSuggestSchema, req.body);
    if (!body) return;
    // FB-F5-1（DEC-2026-1125-03）：核心提取为 suggestBlueprintCore，单章路由与批量端点共用同一装配/合并语义
    const r = await suggestBlueprintCore(bookId, body.chapterNo, body.seed, body.draftText);
    return reply.code(r.code).send(r.payload);
  });

  app.post('/api/books/:bookId/blueprint-suggest/batch', async (req, reply) => {
    // FB-F5-1（DEC-2026-1125-03）：批量蓝图建议——逐章串行、只落蓝图不跑正文（critic 锁边界）
    const { bookId } = req.params as { bookId: string };
    if (!booksRepo.getBook(db, bookId)) return reply.code(404).send({ error: 'not found' });
    const result = await batchBlueprintSuggest(
      {
        db,
        config,
        plannerProvider: state.plannerProvider ?? createRoleProvider(config, 'planner'),
        suggestOnce: async (chapterNo) => {
          const r = await suggestBlueprintCore(bookId, chapterNo);
          if (r.code !== 200) throw new Error(`chapter ${chapterNo}: http ${r.code}`);
          return (r.payload as { blueprint: ChapterBlueprint }).blueprint;
        },
      },
      { bookId },
    );
    reply.send(result);
  });

  async function suggestBlueprintCore(bookId: string, chapterNo: number, seed?: z.infer<typeof blueprintSuggestSchema>['seed'], draftText?: string): Promise<{ code: number; payload: Record<string, unknown> }> {
    const book = booksRepo.getBook(db, bookId)!; // 调用方已验存在

    const prevChapter = chaptersRepo.getChapter(db, bookId, chapterNo - 1);
    const prevVersion = prevChapter?.currentVersionId ? chaptersRepo.getVersion(db, prevChapter.currentVersionId) : undefined;
    const prevTail = prevVersion?.content ?? '';
    const continuityText = continuityRepo.renderSnapshotText(continuityRepo.getContinuitySnapshot(db, bookId, chapterNo));
    // 注入面（本轮钉死）：绑定仿写档案时结构摘要入 planner 槽；drafter 不注入（Pagekin 红线：参考不混入正文）
    const imitationBrief = (() => {
      if (!book.imitationProfileId) return '';
      const p = imitationRepo.getImitationProfile(db, book.imitationProfileId);
      return p ? `【参考作品结构拆解】\n${p.structure.join('\n')}` : '';
    })();
    // 剧情参考（DEC-2026-1120-03）：绑定剧情档案时并列注入 planner 槽；drafter 不注入（红线同上）
    const plotBrief = (() => {
      if (!book.plotProfileId) return '';
      const p = plotRepo.getPlotProfile(db, book.plotProfileId);
      return p ? `【剧情参考】\n${p.structure.join('\n')}` : '';
    })();
    // 人物光谱参考（DEC-2026-1120-09）：绑定光谱档案时并列注入 planner 槽；drafter/related 不注入（红线同 PLOT）
    const spectrumBrief = (() => {
      if (!book.spectrumProfileId) return '';
      const p = spectrumRepo.getSpectrumProfile(db, book.spectrumProfileId);
      return p ? `【人物光谱参考】\n${p.structure.join('\n')}` : '';
    })();
    const outlineCard = findOutlineCardForChapter(outlineRepo.getOutlineTree(db, bookId) ?? { volumes: [] }, chapterNo);
    const outlineCardBrief = outlineCard
      ? `【本章大纲卡】\n${renderOutlineCardSchedule([outlineCard])}` // 复用 renderOutlineCardSchedule，产出 "第a-b章 卡题：body"
      : '';

    const taskText = renderBlueprintTask({
      chapterNo,
      bookTitle: book.title,
      prevTail,
      continuityText,
    });
    const worldviewBrief = book.description; // FB-F3-1（DEC-2026-1125-03）：世界观走 planner 独立槽，不再挤 task 里的【书籍简介】行
    // D4（BR-5）：散文草稿独立 planner 槽，与世界观槽并列、不挤 task
    const draftTextBrief = draftText?.trim()
      ? `【散文草稿】用户已为本章写好草稿，请保留其情节走向与要点，扩写为本章完整蓝图（GOAL/BEATS/HOOK/LANDING）：\n${draftText}`
      : '';
    const b = config.budgets.planner;
    const slots = [
      { name: 'hardRules', content: PLANNER_HARD_RULES, budgetChars: b.hardRules, stable: true, keep: 'head' as const },
      { name: 'continuity', content: continuityText, budgetChars: b.continuity, stable: false, keep: 'head' as const },
      ...(imitationBrief ? [{ name: 'imitationStructure', content: imitationBrief, budgetChars: 600, stable: false, keep: 'head' as const }] : []),
      ...(plotBrief ? [{ name: 'plotReference', content: plotBrief, budgetChars: 1500, stable: false, keep: 'head' as const }] : []),
      ...(spectrumBrief ? [{ name: 'spectrumReference', content: spectrumBrief, budgetChars: 1500, stable: false, keep: 'head' as const }] : []),
      ...(outlineCardBrief ? [{ name: 'outlineCard', content: outlineCardBrief, budgetChars: 600, stable: false, keep: 'head' as const }] : []),
      ...(worldviewBrief ? [{ name: 'worldview', content: worldviewBrief, budgetChars: 2000, stable: true, keep: 'head' as const }] : []),
      { name: 'prevTail', content: prevTail, budgetChars: b.prevTail, stable: false, keep: 'head' as const },
      ...(draftTextBrief ? [{ name: 'draftText', content: draftTextBrief, budgetChars: 3000, stable: false, keep: 'head' as const }] : []),
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

    const cardLanding = outlineCard ? parseLandingCell(outlineCard.body) : null;
    // 主审裁决 2026-11-22：仅当该章无确定性落地时才要求模型出 LANDING（卡有书零扰动零额外重试）；mandate 不参与判定，mandateOn 变量不引入
    const expectsLanding = cardLanding === null || cardLanding.keywords.length === 0;
    const landingOk = (r: ParsedBlueprint): boolean =>
      r.landingRaw !== null && parseLandingCell(r.landingRaw) !== null && parseLandingCell(r.landingRaw)!.keywords.length > 0;
    const warnings: string[] = [];
    // FB-F3-1（DEC-2026-1125-03）：worldview 独立槽超预算的可观测——拍板数 2000，截断必须可见
    if ((book.description?.length ?? 0) > 2000) warnings.push('书籍简介超 2000 字，planner 世界观槽已按 head 截断');
    if ((draftText?.length ?? 0) > 3000) warnings.push('散文草稿超 3000 字，planner 草稿槽已按 head 截断');

    const first = parseBlueprint((await plannerProvider.complete(baseReq(assembled.user))).text);
    let report = first;
    if (first.errors.length > 0 || (expectsLanding && !landingOk(first))) {
      report = parseBlueprint(
        (await plannerProvider.complete(baseReq(`${assembled.user}\n\n${repairPrompt(first.errors)}\n输出必须含一行 LANDING: H（场景）形态落地格`))).text,
      );
    }
    if (report.errors.length > 0) return { code: 502, payload: { error: 'blueprint parse failed', errors: report.errors } };
    // 终态不合格绝不 500，走 warnings 降级
    if (expectsLanding && !landingOk(report)) {
      warnings.push(
        report.landingRaw === null
          ? 'planner 未输出 LANDING 落地格行，已按无模型落地格处理'
          : 'planner LANDING 落地格不合格，已丢弃',
      );
    }
    // 确定性叠加（DEC-2026-1120-10）：落地格解析结果直接合并（含 grade），不依赖模型输出；parseBlueprint 恒产 mustHaveBeats:[]，并集语义面向未来
    if (outlineCard) {
      const landing = parseLandingCell(outlineCard.body);
      if (landing !== null && landing.keywords.length > 0 && !report.blueprint.mustHaveBeats.some((m) => m.text.trim() === outlineCard.body.trim())) {
        report.blueprint.mustHaveBeats = [...report.blueprint.mustHaveBeats, { text: outlineCard.body.trim(), keywords: landing.keywords, grade: landing.grade }];
      }
    }
    // 层②模型 LANDING 叠加：卡条目排前=卡优先；模型条目不写 source（与卡同旧语义）
    if (landingOk(report)) {
      const cell = parseLandingCell(report.landingRaw!)!;
      const text = report.landingRaw!.trim();
      if (!report.blueprint.mustHaveBeats.some((m) => m.text.trim() === text)) {
        report.blueprint.mustHaveBeats = [...report.blueprint.mustHaveBeats, { text, keywords: cell.keywords, grade: cell.grade }];
      }
    }
    // FB-F4-2（DEC-2026-1125-03）：确定性合并 seed——手写内容服务端直保，不赌模型遵循度（空 seed 恒等）
    report.blueprint = mergeSeedIntoBlueprint(seed, report.blueprint);
    return { code: 200, payload: { blueprint: report.blueprint, source: 'llm', ...(warnings.length > 0 ? { warnings } : {}) } };
  }

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

  // 批量校对（B10）：kind='polish' run，队列按 kind 分支走三 pass 校对管线
  app.post('/api/books/:bookId/polish', async (req, reply) => {
    const { bookId } = req.params as { bookId: string };
    if (!booksRepo.getBook(db, bookId)) return reply.code(404).send({ error: 'not found' });
    const body = parseBody(reply, polishSchema, req.body);
    if (!body) return;
    if (body.chapterFrom > body.chapterTo) return reply.code(400).send({ error: 'chapterFrom 不得大于 chapterTo' });
    const run = runsRepo.createRun(db, {
      bookId,
      mode: 'generate',
      kind: 'polish',
      chapterScope: { from: body.chapterFrom, to: body.chapterTo },
    });
    reply.code(202).send({ runId: run.id });
  });
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

  // run 产物版本（C 方案③）：run_id 反查 chapter_versions，正文内联；未知 run 404
  app.get('/api/runs/:runId/versions', async (req, reply) => {
    const { runId } = req.params as { runId: string };
    if (!runsRepo.getRun(db, runId)) return reply.code(404).send({ error: 'not found' });
    reply.send({ runId, versions: chaptersRepo.listVersionsByRun(db, runId) });
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
    if (body.profileId === null) {
      // 解绑：清主镜像、关联表与快照（binding=null 三处全清）
      booksRepo.setBookStyleBinding(db, bookId, null, null);
      return reply.send({ ok: true, styleProfileId: null });
    }
    // legacy {profileId: 字符串} 归一单主六维全主；新 body 走 primary/aux/dimsSource/weights
    const primaryProfileId = typeof body.profileId === 'string' ? body.profileId : body.primaryProfileId!;
    const auxProfileIds = typeof body.profileId === 'string' ? [] : (body.auxProfileIds ?? []);
    const dimsSource = typeof body.profileId === 'string' ? {} : (body.dimsSource ?? {});
    // 融合比例（DEC-2026-1117-05）：legacy 单绑无比例；新绑定缺省=legacy 口径（空对象，按贡献维数计权）
    const weights = typeof body.profileId === 'string' ? {} : (body.weights ?? {});
    // 逐 id 存在性 + 内容冻结（容错解析：坏 JSON 降级空内容，对齐 polish.ts 语义，不整绑失败）
    const profiles: Record<string, StyleProfileContent> = {};
    for (const id of [primaryProfileId, ...auxProfileIds]) {
      const row = db
        .prepare('SELECT id, version, rules_json, samples_json, metrics_json FROM style_profiles WHERE id = ?')
        .get(id) as { id: string; version: number; rules_json: string; samples_json: string; metrics_json: string } | undefined;
      if (!row) return reply.code(404).send({ error: 'profile not found' });
      profiles[id] = contentFromProfileRow(row);
    }
    // 绑定即组装 V2 bundle 冻结内容落快照（后续改档案不影响已绑定书），主镜像写 books.style_profile_id
    const bundle = buildStyleBundle({
      primaryProfileId,
      auxProfileIds,
      dimsSource,
      profiles,
      weights: Object.keys(weights).length > 0 ? weights : undefined,
    });
    booksRepo.setBookStyleBinding(db, bookId, { primaryProfileId, auxProfileIds, dimsSource, weights }, JSON.stringify(bundle));
    reply.send({ ok: true, styleProfileId: primaryProfileId });
  });

  // B4 裁决④：逐书文风示例开关（只控注入；抄用检测恒取绑定样本，见 pipeline/chapter.ts）
  app.put('/api/books/:bookId/style-fewshot', async (req, reply) => {
    const { bookId } = req.params as { bookId: string };
    if (!booksRepo.getBook(db, bookId)) return reply.code(404).send({ error: 'not found' });
    const body = parseBody(reply, styleFewshotPutSchema, req.body);
    if (!body) return;
    booksRepo.setBookFewshot(db, bookId, body.on);
    reply.send({ ok: true, styleFewshotOn: body.on });
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
      boundBooks: booksRepo.listBooksBoundToProfile(db, 'style', r.id),
    }));
  });

  // 档案详情（DEC-2026-1120-08）：只读查看面板用。list dto 基础上加 analysis/evaluation/sourcePath；
  // analysis 从 rules_json 反序列化，freqTerms 旧档案无键 → ?? [] 兜底；evaluation 未整表落库，
  // 由 metrics_json 的 selfScore/selfReason 还原为单项数组（无自评则缺省）
  app.get('/api/style-profiles/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const row = db
      .prepare('SELECT id, name, version, source_path, rules_json, metrics_json, created_at FROM style_profiles WHERE id = ?')
      .get(id) as
      | { id: string; name: string; version: number; source_path: string; rules_json: string; metrics_json: string; created_at: string }
      | undefined;
    if (!row) return reply.code(404).send({ error: 'not found' });
    const rulesData = JSON.parse(row.rules_json) as {
      rulesText?: string;
      dims?: StyleAnalysisDto['dims'];
      axes?: StyleAnalysisDto['axes'];
      rules?: string[];
      terms?: StyleAnalysisDto['terms'];
      freqTerms?: StyleAnalysisDto['freqTerms'];
    };
    const analysis: StyleAnalysisDto = {
      dims: mergeLegacyDimTexts(rulesData.dims ?? ({} as StyleAnalysisDto['dims'])),
      axes: rulesData.axes ?? ({} as StyleAnalysisDto['axes']),
      rules: rulesData.rules ?? (rulesData.rulesText ?? '').split('\n').map((s) => s.trim()).filter((s) => s !== ''),
      terms: rulesData.terms ?? [],
      freqTerms: rulesData.freqTerms ?? [],
    };
    const metrics = JSON.parse(row.metrics_json) as Record<string, number | string>;
    const evaluation =
      typeof metrics.selfScore === 'number'
        ? [{ score: metrics.selfScore, reason: typeof metrics.selfReason === 'string' ? metrics.selfReason : '' }]
        : undefined;
    reply.send({
      id: row.id,
      name: row.name,
      version: row.version,
      createdAt: row.created_at,
      metrics,
      sourcePath: row.source_path,
      analysis,
      ...(evaluation !== undefined ? { evaluation } : {}),
    });
  });

  // B4 裁决②：档案删除。只删被删 id 那一行（同 source_hash 的其他版本不受牵连，版本族靠 source_hash 组织）；
  // 仍被任何书绑定 → 409 并回绑定书列表，绝不静默解绑（books.style_profile_id 无外键，靠这里守住引用）。
  app.delete('/api/style-profiles/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!db.prepare('SELECT id FROM style_profiles WHERE id = ?').get(id)) return reply.code(404).send({ error: 'not found' });
    const bound = booksRepo.listBooksBoundToProfile(db, 'style', id); // 关联表反查（含辅档案被绑场景）
    if (bound.length > 0) {
      return reply.code(409).send({ error: '该风格档案已被书绑定，请先解绑再删除', books: bound });
    }
    db.prepare('DELETE FROM style_profiles WHERE id = ?').run(id);
    reply.send({ ok: true });
  });

  // 同 source_hash 版本列表（批次三版本视图；未知档案 404）
  app.get('/api/style-profiles/:id/versions', async (req, reply) => {
    const { id } = req.params as { id: string };
    const anchor = db.prepare('SELECT source_hash FROM style_profiles WHERE id = ?').get(id) as { source_hash: string } | undefined;
    if (!anchor) return reply.code(404).send({ error: 'not found' });
    const rows = db
      .prepare('SELECT id, name, version, metrics_json, created_at FROM style_profiles WHERE source_hash = ? ORDER BY version')
      .all(anchor.source_hash) as Array<{ id: string; name: string; version: number; metrics_json: string; created_at: string }>;
    return rows.map((r) => {
      let selfScore: number | undefined;
      try {
        const m = JSON.parse(r.metrics_json) as Record<string, number | string>;
        if (typeof m.selfScore === 'number') selfScore = m.selfScore;
      } catch {
        /* 损坏 metrics 无分展示 */
      }
      return { id: r.id, name: r.name, version: r.version, createdAt: r.created_at, selfScore };
    });
  });

  // ── 蒸馏模板（app_meta.distill_template，空串=默认；DEC-2026-1115-04 批次二）──
  const getDistillTemplate = (): string =>
    (db.prepare("SELECT value FROM app_meta WHERE key = 'distill_template'").get() as { value: string } | undefined)?.value ?? '';

  app.get('/api/settings/distill-template', async () => ({ template: getDistillTemplate() }));

  app.put('/api/settings/distill-template', async (req, reply) => {
    const body = parseBody(reply, distillTemplatePutSchema, req.body ?? {});
    if (!body) return;
    db.prepare('INSERT INTO app_meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(
      'distill_template',
      body.template,
    );
    reply.send({ saved: true });
  });

  // 蒸馏两步（DEC-2026-1115-04 #7 确认门 + DEC-2026-1116-01 反馈⑤后台化）：守卫仍同步 400，
  // 模型调用挪进 distill_jobs（202 + 轮询 GET job），「草稿→确认入库」两步不变
  app.post('/api/style-profiles/distill', async (req, reply) => {
    const body = parseBody(reply, distillStyleSchema, req.body);
    if (!body) return;
    if (body.text.replace(/\s/g, '').length < 200) {
      return reply.code(400).send({ error: '样本为空，禁止蒸馏' });
    }
    if (pickFewShotAndHeldOut(body.text, { count: body.maxSegments }).fewShot.length === 0) {
      return reply.code(400).send({ error: '样本过短，无法采样' });
    }
    const jobId = distillJobRepo.createDistillJob(db, null);
    void distillJobRepo.runDistillJob(
      { db, provider: state.summarizerProvider ?? createRoleProvider(config, 'summarizer'), config, getTemplate: getDistillTemplate },
      jobId,
      { name: body.name, text: body.text, maxSegments: body.maxSegments, temperature: body.temperature },
    );
    reply.code(202).send({ jobId });
  });

  // 轮询端点：queued/running/done/failed 四态 + 里程碑进度；未知 404
  app.get('/api/style-profiles/jobs/:jobId', async (req, reply) => {
    const { jobId } = req.params as { jobId: string };
    const job = distillJobRepo.getDistillJob(db, jobId);
    if (!job) return reply.code(404).send({ error: 'not found' });
    reply.send({
      id: job.id,
      status: job.status,
      progress: job.progress,
      stage: job.stage,
      error: job.error,
      result: job.result_json ? (JSON.parse(job.result_json) as DistillStyleDraftDto) : null,
    });
  });

  // 重新蒸馏（B5）：复用 style_sources 里留存的原文；未留存 → 409，绝不要求前端回传整篇原文
  app.post('/api/style-profiles/:id/redistill', async (req, reply) => {
    const { id } = req.params as { id: string };
    const profile = db
      .prepare('SELECT id, name, source_hash FROM style_profiles WHERE id = ?')
      .get(id) as { id: string; name: string; source_hash: string } | undefined;
    if (!profile) return reply.code(404).send({ error: 'not found' });
    const src = db.prepare('SELECT text FROM style_sources WHERE source_hash = ?').get(profile.source_hash) as { text: string } | undefined;
    if (!src) return reply.code(409).send({ error: '原文未留存，无法重新蒸馏' });
    const jobId = distillJobRepo.createDistillJob(db, profile.id);
    void distillJobRepo.runDistillJob(
      { db, provider: state.summarizerProvider ?? createRoleProvider(config, 'summarizer'), config, getTemplate: getDistillTemplate },
      jobId,
      { name: profile.name, text: src.text },
    );
    reply.code(202).send({ jobId });
  });

  app.post('/api/style-profiles', async (req, reply) => {
    const body = parseBody(reply, styleProfileCreateSchema, req.body);
    if (!body) return;
    if (body.text.replace(/\s/g, '').length < 200) {
      return reply.code(400).send({ error: '样本为空，禁止蒸馏' });
    }
    const { id, version } = saveStyleProfile(db, {
      name: body.name,
      source: body.text,
      analysis: body.analysis as StyleAnalysisDto,
      samples: body.samples.map((t, i) => ({ id: `s${i}`, text: t })),
      evaluation: body.evaluation,
    });
    reply.code(201).send({ profileId: id, version });
  });

  // ── 拆解仿写（Pagekin 式；analyze 产 draft 不入库，save 落档案）──
  app.post('/api/imitation-profiles/analyze', async (req, reply) => {
    const body = parseBody(reply, imitationAnalyzeSchema, req.body);
    if (!body) return;
    if (body.text.replace(/\s/g, '').length < 200) {
      return reply.code(400).send({ error: '样本为空或不足 200 字，禁止拆解' });
    }
    const provider = state.summarizerProvider ?? createRoleProvider(config, 'summarizer');
    try {
      const draft = await analyzeImitation({ db, provider }, body);
      reply.send({ draft });
    } catch (e) {
      reply.code(502).send({ error: (e as Error).message });
    }
  });

  app.post('/api/imitation-profiles', async (req, reply) => {
    const body = parseBody(reply, imitationSaveSchema, req.body);
    if (!body) return;
    const saved = imitationRepo.saveImitationProfile(db, body.draft);
    reply.code(201).send(saved);
  });

  app.get('/api/imitation-profiles', async () =>
    imitationRepo.listImitationProfiles(db).map((p) => ({ ...p, boundBooks: booksRepo.listBooksBoundToProfile(db, 'imitation', p.id) })),
  );

  app.delete('/api/imitation-profiles/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!imitationRepo.deleteImitationProfile(db, id)) return reply.code(404).send({ error: 'not found' });
    reply.send({ ok: true });
  });

  app.put('/api/books/:bookId/imitation', async (req, reply) => {
    const { bookId } = req.params as { bookId: string };
    if (!booksRepo.getBook(db, bookId)) return reply.code(404).send({ error: 'not found' });
    const body = parseBody(reply, imitationBindSchema, req.body);
    if (!body) return;
    if (body.profileId !== null && !imitationRepo.getImitationProfile(db, body.profileId)) {
      return reply.code(404).send({ error: 'profile not found' });
    }
    booksRepo.setBookImitation(db, bookId, body.profileId);
    reply.send({ ok: true, imitationProfileId: body.profileId });
  });

  // ── 剧情蒸馏（DEC-2026-1120-03）：五端点沿仿写同构；注入面=blueprint-suggest planner 槽 plotReference ──
  app.post('/api/plot-profiles/analyze', async (req, reply) => {
    const body = parseBody(reply, plotAnalyzeSchema, req.body);
    if (!body) return;
    try {
      const draft = await analyzePlot({ db, provider }, body);
      reply.send({ draft });
    } catch (e) {
      reply.code(502).send({ error: (e as Error).message });
    }
  });

  app.post('/api/plot-profiles', async (req, reply) => {
    const body = parseBody(reply, plotSaveSchema, req.body);
    if (!body) return;
    const saved = plotRepo.savePlotProfile(db, body.draft);
    reply.code(201).send(saved);
  });

  app.get('/api/plot-profiles', async () =>
    plotRepo.listPlotProfiles(db).map((p) => ({ ...p, boundBooks: booksRepo.listBooksBoundToProfile(db, 'plot', p.id) })),
  );

  app.delete('/api/plot-profiles/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!plotRepo.deletePlotProfile(db, id)) return reply.code(404).send({ error: 'not found' });
    reply.send({ ok: true });
  });

  app.put('/api/books/:bookId/plot', async (req, reply) => {
    const { bookId } = req.params as { bookId: string };
    if (!booksRepo.getBook(db, bookId)) return reply.code(404).send({ error: 'not found' });
    const body = parseBody(reply, plotBindSchema, req.body);
    if (!body) return;
    if (body.profileId !== null && !plotRepo.getPlotProfile(db, body.profileId)) {
      return reply.code(404).send({ error: 'profile not found' });
    }
    booksRepo.setBookPlotProfile(db, bookId, body.profileId);
    reply.send({ ok: true, plotProfileId: body.profileId });
  });

  // ── 人物光谱蒸馏（DEC-2026-1120-09）：五端点沿剧情同构；注入面=blueprint-suggest planner 槽 spectrumReference（drafter 红线不注入）──
  app.post('/api/spectrum-profiles/analyze', async (req, reply) => {
    const body = parseBody(reply, spectrumAnalyzeSchema, req.body);
    if (!body) return;
    try {
      const draft = await analyzeSpectrum({ db, provider }, body);
      reply.send({ draft });
    } catch (e) {
      reply.code(502).send({ error: (e as Error).message });
    }
  });

  app.post('/api/spectrum-profiles', async (req, reply) => {
    const body = parseBody(reply, spectrumSaveSchema, req.body);
    if (!body) return;
    const saved = spectrumRepo.saveSpectrumProfile(db, body.draft);
    reply.code(201).send(saved);
  });

  app.get('/api/spectrum-profiles', async () =>
    spectrumRepo.listSpectrumProfiles(db).map((p) => ({ ...p, boundBooks: booksRepo.listBooksBoundToProfile(db, 'spectrum', p.id) })),
  );

  app.delete('/api/spectrum-profiles/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!spectrumRepo.deleteSpectrumProfile(db, id)) return reply.code(404).send({ error: 'not found' });
    reply.send({ ok: true });
  });

  app.put('/api/books/:bookId/spectrum', async (req, reply) => {
    const { bookId } = req.params as { bookId: string };
    if (!booksRepo.getBook(db, bookId)) return reply.code(404).send({ error: 'not found' });
    const body = parseBody(reply, spectrumBindSchema, req.body);
    if (!body) return;
    if (body.profileId !== null && !spectrumRepo.getSpectrumProfile(db, body.profileId)) {
      return reply.code(404).send({ error: 'profile not found' });
    }
    booksRepo.setBookSpectrumProfile(db, bookId, body.profileId);
    reply.send({ ok: true, spectrumProfileId: body.profileId });
  });

  // ── 融合门张力对照（Task-03；POST analyze 无写；降级可见钉：恒 200，绝不 500 阻断确认）──
  app.post('/api/books/:bookId/fusion-gate/analyze', async (req, reply) => {
    const { bookId } = req.params as { bookId: string };
    const book = booksRepo.getBook(db, bookId);
    if (!book) return reply.code(404).send({ error: 'not found' });
    // 空 body schema：不收字段，全部服务端取数
    if (!parseBody(reply, fusionGateAnalyzeSchema, req.body)) return;

    // 坏 JSON 容错：rulesText 取不到即空串，不抛（与 style/merge.ts:118 同形）
    const styleRulesText = (row: { rules_json: string }): string => {
      try {
        const data = JSON.parse(row.rules_json) as { rulesText?: string };
        return typeof data.rulesText === 'string' ? data.rulesText : '';
      } catch {
        return '';
      }
    };

    // bound=绑定现状：主辅档案 rulesText + 三类已绑 structure
    const boundStyles: Array<{ name: string; rulesText: string }> = [];
    const binding = booksRepo.getBookStyleBinding(db, bookId);
    // 键=trimmed name，值=id 数组；同名多义自然收多值，供占比落点精确匹配（不透出给 prompt）
    const nameToIds = new Map<string, string[]>();
    if (binding) {
      for (const profileId of [binding.primaryProfileId, ...binding.auxProfileIds]) {
        const row = db
          .prepare('SELECT id, name, rules_json FROM style_profiles WHERE id = ?')
          .get(profileId) as { id: string; name: string; rules_json: string } | undefined;
        if (row) {
          boundStyles.push({ name: row.name, rulesText: styleRulesText(row) });
          const key = row.name.trim();
          const ids = nameToIds.get(key) ?? [];
          ids.push(row.id);
          nameToIds.set(key, ids);
        }
      }
    }

    // 三类 planner 档案：已绑取详情，候选取全局列表（cap 与截断由 buildTensionPrompt 钉）
    const plannerSources = [
      {
        kind: 'plot' as const,
        boundId: book.plotProfileId,
        get: (id: string) => plotRepo.getPlotProfile(db, id),
        list: () => plotRepo.listPlotProfiles(db),
      },
      {
        kind: 'spectrum' as const,
        boundId: book.spectrumProfileId,
        get: (id: string) => spectrumRepo.getSpectrumProfile(db, id),
        list: () => spectrumRepo.listSpectrumProfiles(db),
      },
      {
        kind: 'imitation' as const,
        boundId: book.imitationProfileId,
        get: (id: string) => imitationRepo.getImitationProfile(db, id),
        list: () => imitationRepo.listImitationProfiles(db),
      },
    ];
    const boundPlanner: Array<{ kind: 'plot' | 'spectrum' | 'imitation'; name: string; structure: string }> = [];
    const candidatePlanner: Array<{ kind: 'plot' | 'spectrum' | 'imitation'; name: string; structure: string }> = [];
    for (const source of plannerSources) {
      if (source.boundId) {
        const p = source.get(source.boundId);
        if (p) boundPlanner.push({ kind: source.kind, name: p.name, structure: p.structure.join('\n') });
      }
      for (const p of source.list()) {
        candidatePlanner.push({ kind: source.kind, name: p.name, structure: p.structure.join('\n') });
      }
    }

    // candidates=全局 style_profiles rules_json
    const candidateStyles: Array<{ name: string; rulesText: string }> = [];
    const styleRows = db
      .prepare('SELECT name, rules_json FROM style_profiles ORDER BY created_at DESC')
      .all() as Array<{ name: string; rules_json: string }>;
    for (const row of styleRows) candidateStyles.push({ name: row.name, rulesText: styleRulesText(row) });

    // 无对照面即降级（诚实呈现，不凭空造张力行）
    const hasSurface =
      book.description.trim() !== '' ||
      book.outline.trim() !== '' ||
      boundStyles.length + boundPlanner.length + candidateStyles.length + candidatePlanner.length > 0;
    if (!hasSurface) {
      return reply.send({ rows: [], degraded: true, degradeReason: '无对照面（简介/大纲与档案均为空），本次未做张力对照' });
    }

    const prompt = buildTensionPrompt({
      description: book.description,
      outline: book.outline,
      boundStyles,
      boundPlanner,
      candidateStyles,
      candidatePlanner,
    });
    const analyzer = state.plannerProvider ?? createRoleProvider(config, 'planner');
    try {
      // summarize 步缝（同 routes.ts:458 planner 缝形态）；超时/抛错在下方 catch 统一降级
      const completion = await analyzer.complete({
        system: '【硬规则】你是长篇小说的融合编辑，只输出张力行协议（TENSION: 六段竖线分隔）；不要输出 JSON、markdown 代码块或任何解释。',
        user: prompt,
        temperature: 0.3,
        topP: 0.9,
        maxOutputTokens: config.providers.local.maxOutput,
        timeoutMs: 120000,
        meta: { step: 'summarize' },
      });
      const { rows, invalid } = parseTensionRows(completion.text);
      if (rows.length === 0) {
        return reply.send({
          rows: [],
          degraded: true,
          degradeReason:
            invalid > 0
              ? `模型输出无有效张力协议行（丢弃非法行 ${invalid} 条），本次未做张力对照`
              : '模型输出无张力协议行，本次未做张力对照',
        });
      }
      // 响应不透出 profileName；仅已绑集合（主+辅）内按名精确匹配；未命中/同名多义/无绑定降 none 行保留
      const dtoRows = rows.map((row) => {
        const { profileName, ...rest } = row;
        if (row.lever !== 'weights') return rest;
        const ids = binding ? nameToIds.get((profileName ?? '').trim()) : undefined;
        return ids?.length === 1 ? { ...rest, profileId: ids[0] } : { ...rest, lever: 'none' as const };
      });
      return reply.send({ rows: dtoRows, degraded: false });
    } catch (e) {
      return reply.send({ rows: [], degraded: true, degradeReason: `张力对照调用失败：${(e as Error).message}` });
    }
  });

  // ── 融合门状态与确认（Task-04；GET 无写三态 / POST 单事务批量写）──
  // 注入面组装（GET gate / POST confirm 共用）：恒取库内现状，不读活档案（指纹钉）
  const buildInjectionFace = (bookId: string, book: booksRepo.Book): InjectionFace => ({
    description: book.description,
    styleBinding: booksRepo.getBookStyleBinding(db, bookId),
    styleFewshotOn: book.styleFewshotOn,
    styleSnapshotJson: book.styleSnapshotJson,
    plotProfileId: book.plotProfileId,
    spectrumProfileId: book.spectrumProfileId,
    imitationProfileId: book.imitationProfileId,
  });

  // A 类行载体：五类文本拼接（listCharacters / book.outline / 章蓝图 goal / 伏笔 description /
  // 已绑 style_sources.text 按 source_hash）——只供片段级判定，绝不回流解析输入（N1）
  const buildCarriers = (bookId: string, book: booksRepo.Book, binding: booksRepo.StyleBinding | null): FusionCarriers => {
    const styleSourcesText = binding
      ? [binding.primaryProfileId, ...binding.auxProfileIds]
          .map((id) => db.prepare('SELECT source_hash FROM style_profiles WHERE id = ?').get(id) as { source_hash: string } | undefined)
          .filter((r): r is { source_hash: string } => r !== undefined)
          .map((r) => (db.prepare('SELECT text FROM style_sources WHERE source_hash = ?').get(r.source_hash) as { text: string } | undefined)?.text ?? '')
          .filter((t) => t !== '')
          .join('\n')
      : '';
    return {
      charactersText: booksRepo.listCharacters(db, bookId).map((c) => c.baseSetting).join('\n'),
      outlineText: book.outline,
      blueprintGoalsText: chaptersRepo.listChapters(db, bookId).map((c) => c.blueprint?.goal ?? '').filter((t) => t !== '').join('\n'),
      foreshadowingsText: continuityRepo.listForeshadowings(db, bookId).map((f) => f.description).join('\n'),
      styleSourcesText,
    };
  };

  app.get('/api/books/:bookId/fusion-gate', async (req, reply) => {
    const { bookId } = req.params as { bookId: string };
    const book = booksRepo.getBook(db, bookId);
    if (!book) return reply.code(404).send({ error: 'not found' });

    const face = buildInjectionFace(bookId, book);
    const fingerprint = injectionFaceFingerprint(face);
    const stored = booksRepo.parseGenGate(book.genGateJson);
    // 指纹未变即直通（含 suppress 写过的指纹）；取消零写零指纹 → 下次必重弹
    if (stored && stored.fingerprint === fingerprint) {
      return reply.send({ action: 'pass', fingerprint });
    }

    // show：归档存在则按 imports 归档重解析出 A 类行；无归档书 aClass 空仍 show（规格泛型：非 MD 书也过门）
    let aClass: ReturnType<typeof computeFusionRows>['rows'] = [];
    let previewDescription = '';
    let headWindowWarn = false;
    let hasArchive = false;
    const archivePath = path.join(config.dataDir, 'imports', `${bookId}-settings.md`);
    if (fs.existsSync(archivePath)) {
      const raw = await fs.promises.readFile(archivePath, 'utf8');
      const sections = splitCompendiumSections(raw).map((s) => ({
        heading: s.heading,
        level: s.level,
        lines: refineForDescription(s.lines.join('\n')).split('\n'),
      }));
      const consumedHeadings = parseSettingsCompendium(raw).consumedSections ?? [];
      const result = computeFusionRows({
        description: book.description,
        sections,
        consumedHeadings,
        carriers: buildCarriers(bookId, book, face.styleBinding),
      });
      aClass = result.rows;
      previewDescription = result.previewDescription;
      headWindowWarn = result.headWindowWarn;
      hasArchive = true;
    }
    const profileNames: Record<string, string> = {};
    const styleBinding = face.styleBinding;
    if (styleBinding) {
      for (const id of [styleBinding.primaryProfileId, ...styleBinding.auxProfileIds]) {
        const row = db.prepare('SELECT name FROM style_profiles WHERE id = ?').get(id) as { name: string } | undefined;
        if (row) profileNames[id] = row.name;
      }
    }
    if (book.plotProfileId) {
      const name = plotRepo.getPlotProfile(db, book.plotProfileId)?.name;
      if (name !== undefined) profileNames[book.plotProfileId] = name;
    }
    if (book.spectrumProfileId) {
      const name = spectrumRepo.getSpectrumProfile(db, book.spectrumProfileId)?.name;
      if (name !== undefined) profileNames[book.spectrumProfileId] = name;
    }
    if (book.imitationProfileId) {
      const name = imitationRepo.getImitationProfile(db, book.imitationProfileId)?.name;
      if (name !== undefined) profileNames[book.imitationProfileId] = name;
    }
    reply.send({
      action: 'show',
      fingerprint,
      aClass,
      previewDescription,
      headWindowWarn,
      hasArchive,
      binding: {
        styleBinding: face.styleBinding,
        styleFewshotOn: book.styleFewshotOn,
        snapshotPresent: book.styleSnapshotJson !== null,
        plotProfileId: book.plotProfileId,
        spectrumProfileId: book.spectrumProfileId,
        imitationProfileId: book.imitationProfileId,
        // profileNames 不入指纹（展示用查名，fingerprint.ts 注入面七键不含）
        profileNames,
      },
    });
  });

  app.post('/api/books/:bookId/fusion-gate/confirm', async (req, reply) => {
    const { bookId } = req.params as { bookId: string };
    const book = booksRepo.getBook(db, bookId);
    if (!book) return reply.code(404).send({ error: 'not found' });
    const parsed = parseBody(reply, fusionGateConfirmSchema, req.body);
    if (parsed === null) return;
    const face = buildInjectionFace(bookId, book);
    const { fingerprint: clientFingerprint, ...decisions }: ConfirmDecisions & { fingerprint?: string } = parsed ?? {};
    if (clientFingerprint !== undefined && clientFingerprint !== injectionFaceFingerprint(face)) {
      return reply.code(409).send({ error: '参考资料已变动，本次确认内容过期，请重新打开确认门', reason: 'stale-fingerprint' });
    }
    try {
      const outcome = applyFusionConfirm(db, bookId, decisions, face);
      reply.send({ results: outcome.results, fingerprint: outcome.fingerprint });
    } catch (e) {
      // 事务已全回滚=零半写；指纹未写 → 下次 GET 仍 show
      reply.code(400).send({ error: (e as Error).message });
    }
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
    const ac = new AbortController();
    abortOnDisconnect(reply, ac);
    const provider = state.summarizerProvider ?? createRoleProvider(config, 'summarizer');
    try {
      const payload = await generateSummarize(
        { provider, config },
        { chapterNo: Number(chapterNo), finalContent: version.content, signal: ac.signal },
      );
      const result: SummaryGenerateResultDto = { ...payload, baseVersionId: ch.currentVersionId };
      reply.send(result);
    } catch (e) {
      reply.code(502).send({ error: '摘要生成失败', reason: (e as Error).message });
    }
  });

  // 三项校验只放路由层：陈旧校验不得进共用 commitSummarize（流水线 finalize 前 currentVersionId 仍是旧值）
  app.post('/api/books/:bookId/chapters/:chapterNo/summarize/commit', async (req, reply) => {
    const { bookId, chapterNo } = req.params as { bookId: string; chapterNo: string };
    const body: SummaryCommitBody | null = parseBody(reply, summaryCommitSchema, req.body);
    if (body === null) return;
    if (!booksRepo.getBook(db, bookId)) return reply.code(404).send({ error: 'not found' });
    const ch = chaptersRepo.getChapter(db, bookId, Number(chapterNo));
    if (!ch || !ch.currentVersionId) return reply.code(404).send({ error: 'not found' });
    if (ch.currentVersionId !== body.baseVersionId) {
      return reply.code(409).send({ error: '章节版本已变动，请重新生成摘要', reason: 'stale-base-version' });
    }
    const activeRun = db.prepare("SELECT id FROM runs WHERE book_id = ? AND status IN ('queued','running')").get(bookId) as { id: string } | undefined;
    if (activeRun) return reply.code(409).send({ error: 'book has active run' });
    try {
      commitSummarize(db, bookId, Number(chapterNo), {
        summary: body.summary,
        beats: body.beats,
        openThreads: body.threads.filter((t) => t.include).map((t) => t.text),
        characterDeltas: body.states.filter((s) => s.include).map((s) => ({ name: s.name, stateJson: s.stateJson })),
      });
      reply.send({ ok: true });
    } catch (e) {
      reply.code(400).send({ error: (e as Error).message });
    }
  });

  // ── versions ──
  app.get('/api/books/:bookId/chapters/:chapterNo/versions', async (req, reply) => {
    const { bookId, chapterNo } = req.params as { bookId: string; chapterNo: string };
    const chapter = chaptersRepo.getChapter(db, bookId, Number(chapterNo));
    if (!chapter) return reply.code(404).send({ error: 'not found' });
    reply.send({ currentVersionId: chapter.currentVersionId ?? null, versions: chaptersRepo.listVersions(db, chapter.id) });
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

  // B2 裁决①（DEC-2026-1116-01）四步：取版本 → 拦 current → 拦活 run 引用 → 删前快照 → 硬删留墓碑
  app.delete('/api/versions/:versionId', async (req, reply) => {
    const { versionId } = req.params as { versionId: string };
    const v = chaptersRepo.getVersion(db, versionId);
    if (!v) return reply.code(404).send({ error: 'not found' });
    const chapter = chaptersRepo.getChapterById(db, v.chapterId);
    if (!chapter) return reply.code(404).send({ error: 'not found' });
    if (chapter.currentVersionId === versionId) {
      return reply.code(409).send({ error: '当前版本不可删除（先回滚到其他版本）', reason: 'current' });
    }
    const active = chaptersRepo.findActiveRunRef(db, versionId);
    if (active) {
      return reply.code(409).send({ error: `版本被 ${active.status} 状态的运行引用，暂不可删除`, reason: 'run-active', runStatus: active.status });
    }
    // 快照先于删除事务（VACUUM INTO 不能在事务内）；目录沿用 queue.ts 的按书子目录惯例
    backupBookPredelete(db, chapter.bookId, path.join(config.dataDir, 'backups', chapter.bookId));
    chaptersRepo.deleteChapterVersionWithTombstone(db, versionId);
    reply.send({ ok: true });
  });

  // 删章（DEC-2026-1120-02）：按依赖序显式清理该章版本/运行步/摘要/人物状态；runs 头保留（报表降级已有）。
  // 活动 run（queued/running/paused）chapter_scope 覆盖该章 → 409（坏 scope JSON 保守视为覆盖）。
  app.delete('/api/books/:bookId/chapters/:chapterNo', async (req, reply) => {
    const { bookId } = req.params as { bookId: string };
    const chapterNo = Number((req.params as { chapterNo: string }).chapterNo);
    if (!Number.isInteger(chapterNo) || chapterNo <= 0) return reply.code(400).send({ error: '章号须为正整数' });
    if (!booksRepo.getBook(db, bookId)) return reply.code(404).send({ error: 'not found' });
    if (!chaptersRepo.getChapter(db, bookId, chapterNo)) return reply.code(404).send({ error: 'not found' });
    const activeRuns = db
      .prepare("SELECT id, status, chapter_scope_json FROM runs WHERE book_id = ? AND status IN ('queued','running','paused')")
      .all(bookId) as Array<{ id: string; status: string; chapter_scope_json: string }>;
    for (const r of activeRuns) {
      let covers = true;
      try {
        const scope = JSON.parse(r.chapter_scope_json) as { from: number; to: number };
        covers = chapterNo >= scope.from && chapterNo <= scope.to;
      } catch {
        /* 坏 JSON：保守视为覆盖 */
      }
      if (covers) {
        return reply.code(409).send({ error: `章节被 ${r.status} 状态的运行引用，暂不可删除`, reason: 'run-active', runId: r.id, runStatus: r.status });
      }
    }
    // 快照先于删除事务（VACUUM INTO 不能在事务内）
    backupBookPredelete(db, bookId, path.join(config.dataDir, 'backups', bookId));
    chaptersRepo.deleteChapterWithCleanup(db, bookId, chapterNo);
    reply.send({ ok: true });
  });

  // 版本 → 质检明细（B3 解释性）：qc 步 outputJson 已存 l0/l1/gate，按 output_version_id 反查
  app.get('/api/versions/:versionId/qc', async (req, reply) => {
    const { versionId } = req.params as { versionId: string };
    if (!chaptersRepo.getVersion(db, versionId)) return reply.code(404).send({ error: 'not found' });
    const rows = db
      .prepare("SELECT attempt, output_json FROM run_steps WHERE output_version_id = ? AND step = 'qc' AND status = 'done' ORDER BY attempt")
      .all(versionId) as Array<{ attempt: number; output_json: string }>;
    const attempts = rows.map((r) => {
      const oj = JSON.parse(r.output_json || '{}') as { l0?: object; l1?: object; gate?: { action?: string; reasons?: string[] } };
      return {
        attempt: r.attempt,
        l0: oj.l0 ?? {},
        l1: oj.l1 ?? {},
        gate: { action: oj.gate?.action ?? 'unknown', reasons: oj.gate?.reasons ?? [] },
      };
    });
    reply.send({ attempts });
  });

  // ── report / 选段重写（T30）──
  app.get('/api/runs/:runId/report', async (req, reply) => {
    const { runId } = req.params as { runId: string };
    const run = runsRepo.getRun(db, runId);
    if (!run) return reply.code(404).send({ error: 'not found' });
    const steps = runsRepo.listSteps(db, runId);
    const chapters: Array<{ chapterNo: number; steps: Array<{ step: string; attempt: number; ms: number; usage: { promptTokens: number; completionTokens: number }; versionDeleted?: boolean; versionId?: string }> }> = [];
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
        // B2：usage 解析序 outputJson.usage（draft/rewrite 自本卡起落）→ 版本 params.usage（历史）→ 零；
        // 版本行已被硬删 → 标 versionDeleted，报表不再依赖版本行存活
        let usage = { promptTokens: 0, completionTokens: 0 };
        let versionDeleted: boolean | undefined;
        const outV = st.outputVersionId ? chaptersRepo.getVersion(db, st.outputVersionId) : undefined;
        if (st.outputVersionId && !outV) versionDeleted = true;
        const oj = st.outputJson as { usage?: { promptTokens?: number; completionTokens?: number } } | undefined;
        const u = oj?.usage ?? (outV?.params as { usage?: { promptTokens?: number; completionTokens?: number } } | undefined)?.usage;
        if (u) usage = { promptTokens: u.promptTokens ?? 0, completionTokens: u.completionTokens ?? 0 };
        totalPrompt += usage.promptTokens;
        totalCompletion += usage.completionTokens;
        return { step: st.step, attempt: st.attempt, ms, usage, ...(versionDeleted ? { versionDeleted: true } : {}), ...(st.outputVersionId ? { versionId: st.outputVersionId } : {}) };
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
    // 全文模式（DEC-2026-1120-01）：body 无 selection 键 → 指令作用于该版本整章正文
    const { selection, instruction } = body;
    const full = selection === undefined;
    const sourceText = full ? v.content : selection;
    if (full && countChars(v.content) === 0) {
      return reply.code(400).send({ error: '当前版本无正文', reason: 'empty-content' });
    }
    if (full && countChars(v.content) > FULL_TEXT_REWRITE_MAX_CHARS) {
      return reply.code(400).send({
        error: `全文 ${countChars(v.content)} 字超出单轮改写上限 ${FULL_TEXT_REWRITE_MAX_CHARS} 字，请改用选段重写（分段粘贴）或批量校对`,
        reason: 'fulltext-too-long',
      });
    }
    const chapter = chaptersRepo.getChapterById(db, v.chapterId)!;
    // 正文只走 original 槽、指令只走 task 槽：正文内嵌 task 槽（budget 500/head）会把【指令】截丢
    const target = full ? '全文' : '选段';
    const taskInstruction = `对上面的${target}按指令改写，只输出改写后的${target}文本。\n【指令】${instruction}`;
    const slots = [
      { name: 'hardRules', content: '', budgetChars: 500, stable: true, keep: 'head' as const },
      { name: 'original', content: sourceText, budgetChars: full ? FULL_TEXT_REWRITE_MAX_CHARS : 6000, stable: false, keep: 'head' as const },
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
      params: {
        selectionRewrite: true,
        ...(full ? { fullText: true } : { selection }),
        instruction,
        usage: res.usage,
      },
    });
    reply.code(201).send(newVersion); // 不移动 current 指针
  });

  // ── export / search ──
  app.post('/api/books/:bookId/export', async (req, reply) => {
    const { bookId } = req.params as { bookId: string };
    const book = booksRepo.getBook(db, bookId);
    if (!book) return reply.code(404).send({ error: 'not found' });
    // C3 导出格式：query.format 枚举校验，缺省 txt（DEC-2026-1118-01 owner 令：默认不作 .md）
    const rawFormat = (req.query as { format?: string }).format ?? 'txt';
    const formats = ['chapters-md', 'combined-md', 'txt'] as const;
    if (!formats.includes(rawFormat as (typeof formats)[number])) {
      return reply.code(400).send({ error: `format 须为 ${formats.join('/')}` });
    }
    const outDir = path.join(config.dataDir, 'exports', safeSegment(book.title)); // 纯点号书名防目录越级（audit 2026-11-23 F-3）
    const result = await exportBook(db, bookId, outDir, rawFormat as (typeof formats)[number]);
    // D3 澄清（DEC-2026-1117-05）：回传落盘目录绝对路径，前端 toast 报位
    reply.send({ ...result, outDir: path.resolve(outDir) });
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
    writeSettingsFile(next);
    reply.send({ saved: true, restartRequired: true });
  });

  // ── 质量阈值（B3：app_meta 持久化，章级生效，改值不重启）──
  app.get('/api/settings/quality', async (req, reply) => {
    const stored = readScoreThreshold(db);
    reply.send({ scoreThreshold: stored ?? config.quality.scoreThreshold, isDefault: stored === undefined });
  });

  app.put('/api/settings/quality', async (req, reply) => {
    const body = parseBody(reply, qualityPutSchema, req.body ?? {});
    if (!body) return;
    writeScoreThreshold(db, body.scoreThreshold);
    reply.send({ saved: true, restartRequired: false });
  });

  // ── 落地分级词表（DEC-2026-1122-02：用户数据层，设置页可视化编辑）──
  // GET 展示「实际生效」的词表（resolve 解析序=用户文件>env>仓库默认），PUT 写用户文件；
  // 生效=下一次生成 run（chapter.ts 按章装载，非热切），进行中 run 不受影响。
  app.get('/api/landing-words', async () => {
    const p = resolveLandingWordsPath();
    const text = readLandingWordsUserFile(p);
    const parsed = parseLandingWordsText(text);
    return { text, counts: { h: parsed.h.length, l: parsed.l.length }, sections: parsed.sections, path: p };
  });

  app.put('/api/landing-words', async (req, reply) => {
    const body = parseBody(reply, landingWordsPutSchema, req.body ?? {});
    if (!body) return;
    const v = validateLandingWordsText(body.text);
    if (!v.ok) {
      reply.code(400).send({ error: v.error });
      return;
    }
    try {
      writeLandingWordsUserFile(body.text, ensureLandingWordsUserFile());
    } catch {
      reply.code(500).send({ error: '词表写入失败' });
      return;
    }
    const parsed = parseLandingWordsText(body.text);
    return { saved: true, counts: { h: parsed.h.length, l: parsed.l.length }, sections: parsed.sections };
  });
}

function parseBody<T extends z.ZodTypeAny>(reply: FastifyReply, schema: T, body: unknown): z.infer<T> | null {
  try {
    return schema.parse(body) as z.infer<T>;
  } catch (e) {
    // 400 人话化（owner 反馈：zod 原始 issue JSON 数组不可读）：逐 issue「path: message」分号连接
    const zerr = e as z.ZodError;
    const detail = zerr?.issues?.map((i) => `${i.path.length > 0 ? i.path.join('.') : '(body)'}: ${i.message}`).join('；');
    reply.code(400).send({ error: `请求参数不合法：${detail ?? zerr.message}` });
    return null;
  }
}
