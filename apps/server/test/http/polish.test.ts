import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config';
import { buildApp } from '../../src/app';
import { createMockProvider } from '../../src/llm/mock';
import { openDb, type Database } from '../../src/db/open';
import { getRun, listSteps } from '../../src/db/repositories/runs';
import { appendChapterVersion, getChapter, listVersions, setCurrentVersion } from '../../src/db/repositories/chapters';
import { createBook, setBookStyleBinding } from '../../src/db/repositories/books';
import * as booksRepo from '../../src/db/repositories/books';
import { createRun } from '../../src/db/repositories/runs';
import { buildStyleBundle, mergeStyleProfiles, type StyleProfileContent } from '../../src/style/merge';
import { runPolishChapter, polishBenchmarks } from '../../src/pipeline/polish';
import { createDefaultMockProvider } from '../../src/llm/mock';
import type { CompletionRequest, LlmProvider } from '../../src/llm/types';

let dir: string;
let db: Database;
let app: Awaited<ReturnType<typeof buildApp>>;
let bookId: string;
let config: ReturnType<typeof loadConfig>;

const POLISH_OUTPUT = '校对后的正文内容，句式自然，无套话。'.repeat(10);

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkforge-polish-'));
  config = loadConfig({ STRATA_BASE_URL: 'http://127.0.0.1:47831/v1', STRATA_API_KEY: 'strata', STRATA_MODEL: 'iq3_xxs', INKFORGE_DATA_DIR: dir });
  db = openDb(path.join(config.dataDir, 'inkforge.db'));
  app = await buildApp({
    config,
    provider: createMockProvider({
      draft: { text: 'x' },
      qc: { text: '' },
      summarize: { text: 'y' },
      rewrite: { text: POLISH_OUTPUT },
    }),
    db,
    inlineQueue: true,
  });
  const created = await app.inject({ method: 'POST', url: '/api/books', payload: { title: '校对测书', description: '修真。' } });
  bookId = (created.json() as { id: string }).id;
  for (const no of [1, 2]) {
    db.prepare(
      "INSERT INTO chapters(id, book_id, chapter_no, title, blueprint_json, target_chars, created_at) VALUES(?,?,?,?,?,?,?)",
    ).run(`pch${no}`, bookId, no, `第${no}章`, JSON.stringify({ goal: `第${no}章目标`, beats: [], mustHaveBeats: [], bannedTopics: [] }), 500, new Date().toISOString());
  }
  // 章 1 有正文；章 2 无
  const ch = getChapter(db, bookId, 1)!;
  const v = appendChapterVersion(db, { chapterId: ch.id, kind: 'draft', content: '原始正文，包含「不是…而是…」套话句式与冗余场景。'.repeat(6) });
  setCurrentVersion(db, ch.id, v.id);
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

describe('B10 批量校对（polish run）', () => {
  it('POST polish → 202 且 run.kind=polish；from>to 400；未知书 404', async () => {
    const r = await app.inject({ method: 'POST', url: `/api/books/${bookId}/polish`, payload: { chapterFrom: 1, chapterTo: 1 } });
    expect(r.statusCode).toBe(202);
    const runId = (r.json() as { runId: string }).runId;
    // inline 队列即刻执行，等待完成
    await waitForDone(runId);
    const run = getRun(db, runId)!;
    expect(run.kind).toBe('polish');
    expect(run.status).toBe('done');

    const bad = await app.inject({ method: 'POST', url: `/api/books/${bookId}/polish`, payload: { chapterFrom: 3, chapterTo: 1 } });
    expect(bad.statusCode).toBe(400);
    const miss = await app.inject({ method: 'POST', url: '/api/books/no-such/polish', payload: { chapterFrom: 1, chapterTo: 1 } });
    expect(miss.statusCode).toBe(404);
  });

  it('全链：三 pass（结构重构→风格一致→去 AI 化）step=rewrite attempt=1..3 → 单个 revised 版本（params.polish+L0）且 current 不动', async () => {
    const r = await app.inject({ method: 'POST', url: `/api/books/${bookId}/polish`, payload: { chapterFrom: 1, chapterTo: 1 } });
    const runId = (r.json() as { runId: string }).runId;
    await waitForDone(runId);

    const steps = listSteps(db, runId).filter((s) => s.step === 'rewrite');
    expect(steps.map((s) => s.attempt)).toEqual([1, 2, 3]);
    expect(steps.every((s) => s.status === 'done')).toBe(true);
    const passNames = steps.map((s) => (s.outputJson as { polishPass?: string }).polishPass);
    expect(passNames).toEqual(['结构重构', '风格一致', '去 AI 化']);

    const ch = getChapter(db, bookId, 1)!;
    const versions = listVersions(db, ch.id) as Array<{ id: string; kind: string; runId?: string; params: object }>;
    const revised = versions.filter((v) => v.kind === 'revised' && v.runId === runId);
    expect(revised).toHaveLength(1);
    const params = revised[0].params as { polish?: boolean; passes?: number; l0?: { checks: unknown[] } };
    expect(params.polish).toBe(true);
    expect(params.passes).toBe(3);
    expect(params.l0?.checks?.length).toBeGreaterThan(0);
    // current 指针不动（人工采用）
    expect(ch.currentVersionId).not.toBe(revised[0].id);
  });

  it('无正文章跳过：scope 覆盖章 2（无 current 版本）→ run done 且无 rewrite 步', async () => {
    const r = await app.inject({ method: 'POST', url: `/api/books/${bookId}/polish`, payload: { chapterFrom: 2, chapterTo: 2 } });
    const runId = (r.json() as { runId: string }).runId;
    await waitForDone(runId);
    expect(getRun(db, runId)!.status).toBe('done');
    expect(listSteps(db, runId)).toHaveLength(0);
  });
});

describe('polishBenchmarks（混合档案基准）', () => {
  function capturing(inner: LlmProvider): { calls: Array<{ step: string; system: string; user: string }>; provider: LlmProvider } {
    const calls: Array<{ step: string; system: string; user: string }> = [];
    return {
      calls,
      provider: {
        complete: async (req: CompletionRequest) => {
          calls.push({ step: String((req.meta as { step?: string } | undefined)?.step ?? ''), system: req.system ?? '', user: req.user ?? '' });
          return inner.complete(req);
        },
      },
    };
  }

  function setupBoundBook(suffix: string): string {
    const bid = createBook(db, { title: '校对混合档案书', description: '修真。' }).id;
    db.prepare(
      "INSERT INTO chapters(id, book_id, chapter_no, title, blueprint_json, target_chars, created_at) VALUES(?,?,?,?,?,?,?)",
    ).run(
      `pb-ch${suffix}`,
      bid,
      1,
      '第1章',
      JSON.stringify({ goal: '混合档案校对测试', beats: [], mustHaveBeats: [], bannedTopics: [] }),
      500,
      new Date().toISOString(),
    );
    const ch = getChapter(db, bid, 1)!;
    const v = appendChapterVersion(db, { chapterId: ch.id, kind: 'draft', content: '原始正文，包含「不是…而是…」套话句式。'.repeat(6) });
    setCurrentVersion(db, ch.id, v.id);
    const bundle = buildStyleBundle({
      primaryProfileId: 'pb-main',
      auxProfileIds: ['pb-aux'],
      dimsSource: { 叙述方式: 'pb-aux', 特色词汇: 'pb-aux', 结构与节奏: 'pb-aux' },
      profiles: {
        'pb-main': {
          version: 1,
          metricsJson: '{}',
          rulesText: '主规则',
          dims: { 结构与节奏: '主节奏', 语言与描写: '主对话；主描写', 情感基调: '主情感基调' },
          axes: {},
          terms: [],
          samples: [
            { id: 's1', text: '主样本一' },
            { id: 's2', text: '主样本二' },
          ],
        },
        'pb-aux': {
          version: 1,
          metricsJson: '',
          rulesText: '',
          dims: { 叙述方式: '辅写作特点', 特色词汇: '辅特色词汇', 结构与节奏: '辅章节结构' },
          axes: {},
          terms: [{ term: '灵力', note: '代指法力' }],
          samples: [{ id: 'a1', text: '辅样本一' }],
        },
      } satisfies Record<string, StyleProfileContent>,
    });
    setBookStyleBinding(
      db,
      bid,
      { primaryProfileId: 'pb-main', auxProfileIds: ['pb-aux'], dimsSource: { 叙述方式: 'pb-aux', 特色词汇: 'pb-aux', 结构与节奏: 'pb-aux' }, weights: {} },
      JSON.stringify(bundle),
    );
    return bid;
  }

  it('polishBenchmarks：合并档案基准——术语并集含辅、referenceTexts 直取 merged.samples 无二次轮转', async () => {
    const bid = setupBoundBook('a');
    const book = booksRepo.getBook(db, bid)!;
    const bundle = JSON.parse(book.styleSnapshotJson!) as Parameters<typeof mergeStyleProfiles>[0];
    const merged = mergeStyleProfiles(bundle, 2);

    const out = polishBenchmarks(db, book, 2);
    expect(out.terms).toContainEqual({ term: '灵力', note: '代指法力' });
    expect(merged.samples).toHaveLength(3);
    expect(out.referenceTexts).toEqual(merged.samples.map((s) => s.text));
    expect(out.voiceRefMetrics).toEqual({});

    // 注入面：runPolishChapter 既有 harness，task 槽含辅档案术语条目
    const runId = createRun(db, { bookId: bid, mode: 'generate', chapterScope: { from: 1, to: 1 }, kind: 'polish' }).id;
    const cap = capturing(createDefaultMockProvider());
    await runPolishChapter({ db, provider: cap.provider, config, emit: () => {} }, { runId, bookId: bid, chapterNo: 1 });
    const rewrites = cap.calls.filter((c) => c.step === 'rewrite');
    expect(rewrites).toHaveLength(3);
    expect(rewrites.some((c) => c.user.includes('灵力：代指法力'))).toBe(true);
  });

  it('不采用哨兵：特色词汇=__none__ → merged 该维空、terms 与 rewrite 词表不受影响（DEC-2026-1124-04）', async () => {
    const bid = createBook(db, { title: '校对不采用哨兵书', description: '修真。' }).id;
    db.prepare(
      "INSERT INTO chapters(id, book_id, chapter_no, title, blueprint_json, target_chars, created_at) VALUES(?,?,?,?,?,?,?)",
    ).run(
      'pb-none-ch',
      bid,
      1,
      '第1章',
      JSON.stringify({ goal: '不采用哨兵校对测试', beats: [], mustHaveBeats: [], bannedTopics: [] }),
      500,
      new Date().toISOString(),
    );
    const ch = getChapter(db, bid, 1)!;
    const v = appendChapterVersion(db, { chapterId: ch.id, kind: 'draft', content: '原始正文，包含「不是…而是…」套话句式。'.repeat(6) });
    setCurrentVersion(db, ch.id, v.id);
    // 主档保留该维文本，哨兵须阻断回落主档；辅档同维文本在场但不采用
    const dimsSource = { 叙述方式: 'pb-aux', 特色词汇: '__none__', 结构与节奏: 'pb-aux' };
    const bundle = buildStyleBundle({
      primaryProfileId: 'pb-main',
      auxProfileIds: ['pb-aux'],
      dimsSource,
      profiles: {
        'pb-main': {
          version: 1,
          metricsJson: '{}',
          rulesText: '主规则',
          dims: { 结构与节奏: '主节奏', 语言与描写: '主对话；主描写', 情感基调: '主情感基调', 特色词汇: '主特色词汇文本' },
          axes: {},
          terms: [],
          samples: [
            { id: 's1', text: '主样本一' },
            { id: 's2', text: '主样本二' },
          ],
        },
        'pb-aux': {
          version: 1,
          metricsJson: '',
          rulesText: '',
          dims: { 叙述方式: '辅写作特点', 特色词汇: '辅特色词汇文本', 结构与节奏: '辅章节结构' },
          axes: {},
          terms: [{ term: '灵力', note: '代指法力' }],
          samples: [{ id: 'a1', text: '辅样本一' }],
        },
      } satisfies Record<string, StyleProfileContent>,
    });
    setBookStyleBinding(db, bid, { primaryProfileId: 'pb-main', auxProfileIds: ['pb-aux'], dimsSource, weights: {} }, JSON.stringify(bundle));

    const book = booksRepo.getBook(db, bid)!;
    const merged = mergeStyleProfiles(JSON.parse(book.styleSnapshotJson!) as Parameters<typeof mergeStyleProfiles>[0], 2);
    expect(merged.dims['特色词汇']).toBe('');

    const out = polishBenchmarks(db, book, 2);
    expect(out.terms).toContainEqual({ term: '灵力', note: '代指法力' });

    const runId = createRun(db, { bookId: bid, mode: 'generate', chapterScope: { from: 1, to: 1 }, kind: 'polish' }).id;
    const cap = capturing(createDefaultMockProvider());
    await runPolishChapter({ db, provider: cap.provider, config, emit: () => {} }, { runId, bookId: bid, chapterNo: 1 });
    const rewrites = cap.calls.filter((c) => c.step === 'rewrite');
    expect(rewrites.some((c) => c.user.includes('灵力：代指法力'))).toBe(true);
  });
});

function waitForDone(runId: string, timeoutMs = 15000): Promise<void> {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const tick = () => {
      const run = getRun(db, runId);
      if (run && (run.status === 'done' || run.status === 'failed' || run.status === 'cancelled')) {
        resolve();
        return;
      }
      if (Date.now() - t0 > timeoutMs) {
        reject(new Error(`run ${runId} 未在时限内完成: ${run?.status}`));
        return;
      }
      setTimeout(tick, 100);
    };
    tick();
  });
}
