import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config';
import { buildApp } from '../../src/app';
import { migrate } from '../../src/db/migrate';
import { openDb, type Database } from '../../src/db/open';
import { createBook, setBookFewshot, setBookStyleProfile } from '../../src/db/repositories/books';
import { getChapter, importOriginalChapters, listVersions, upsertBlueprint } from '../../src/db/repositories/chapters';
import { createRun, listSteps } from '../../src/db/repositories/runs';
import { createDefaultMockProvider, makeMockDraft } from '../../src/llm/mock';
import { runChapterPipeline } from '../../src/pipeline/chapter';
import type { CompletionRequest, LlmProvider } from '../../src/llm/types';

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

const config = loadConfig({
  STRATA_BASE_URL: 'http://127.0.0.1:47831/v1',
  STRATA_API_KEY: 'strata',
  STRATA_MODEL: 'iq3_xxs',
});

let db: Database;
let dir: string;
let bookId: string;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkforge-continue-'));
  db = openDb(path.join(dir, 't.db'));
  migrate(db);
});

afterAll(() => {
  try {
    db.close();
  } catch {
    /* ignore */
  }
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

describe('continue 模式管线', () => {
  it('continue：绑定档案注入风格块与样本 ids（fewshot 关不注入范例片段），l0 含 style_drift', async () => {
    bookId = createBook(db, { title: '续写测试书', description: '修真世界续写设定。' }).id;
    // 2 章 original 种子（锚点正文）
    importOriginalChapters(db, {
      bookId,
      chapters: [
        { title: '第一章', content: makeMockDraft(1) },
        { title: '第二章', content: makeMockDraft(2) },
      ],
    });
    // 绑定 mock 档案：generate 会注入 3 条样本；continue 必须不注入
    db.prepare(
      'INSERT INTO style_profiles(id, name, source_path, source_hash, version, rules_json, samples_json, metrics_json, created_at) VALUES(?,?,?,?,?,?,?,?,?)',
    ).run(
      'mock-profile',
      'mock 档案',
      'inline:mock',
      'mock-hash',
      1,
      JSON.stringify({ rulesText: 'RULES: 句长 10-20 字。' }),
      JSON.stringify([
        { id: 's1', text: '样本一' },
        { id: 's2', text: '样本二' },
        { id: 's3', text: '样本三' },
      ]),
      '{}',
      new Date().toISOString(),
    );
    setBookStyleProfile(db, bookId, 'mock-profile');
    // 第 3 章待续写
    upsertBlueprint(db, {
      bookId,
      chapterNo: 3,
      title: '第三章',
      blueprint: { goal: '续写第三章', beats: [], mustHaveBeats: [], bannedTopics: [] },
      targetChars: 500,
    });

    const run = createRun(db, { bookId, mode: 'continue', chapterScope: { from: 3, to: 3 }, maxRounds: 1 });
    const cap = capturing(createDefaultMockProvider());
    await runChapterPipeline(
      { db, provider: cap.provider, config, emit: () => {} },
      { runId: run.id, bookId, chapterNo: 3 },
    );

    const chapterId = getChapter(db, bookId, 3)!.id;
    const draftVersion = listVersions(db, chapterId).find((v) => v.kind === 'draft')!;
    const row = db.prepare('SELECT style_sample_ids_json FROM chapter_versions WHERE id = ?').get(draftVersion.id) as {
      style_sample_ids_json: string;
    };
    // B4 裁决④：ids 记录不看 fewshot 开关；merge 第 7 步 id 带 `${profileId}:` 命名空间前缀；
    // 无快照回落 live 行（单主 bundle，池 3 条全归主配额），pickStyleSamples 池内轮转 chapterNo=3 → startIdx=2 → s3,s1,s2
    expect(row.style_sample_ids_json).toBe('["mock-profile:s3","mock-profile:s1","mock-profile:s2"]');

    const draft = cap.calls.find((c) => c.step === 'draft')!;
    expect(draft.system).toContain('RULES: 句长 10-20 字。');
    expect(draft.user).toContain('前文腔调优先，文风档案作质感参照。');
    expect(draft.user).not.toContain('【范例片段】');

    const qcStep = listSteps(db, run.id).find((s) => s.step === 'qc')!;
    const l0 = (qcStep.outputJson as { l0: { checks: Array<{ name: string }> } }).l0;
    expect(l0.checks.map((c) => c.name)).toContain('style_drift');
  }, 30000);

  it('continue 开 fewshot → user 注入【范例片段】样本块', async () => {
    setBookFewshot(db, bookId, true);
    const run = createRun(db, { bookId, mode: 'continue', chapterScope: { from: 3, to: 3 }, maxRounds: 1 });
    const cap = capturing(createDefaultMockProvider());
    await runChapterPipeline(
      { db, provider: cap.provider, config, emit: () => {} },
      { runId: run.id, bookId, chapterNo: 3 },
    );
    const draft = cap.calls.find((c) => c.step === 'draft')!;
    expect(draft.user).toContain('【范例片段】');
    expect(draft.user).toContain('样本三');
    // 开关不影响 ids 记录（B4 裁决④）：与用例一同值
    const chapterId = getChapter(db, bookId, 3)!.id;
    const draftVersion = listVersions(db, chapterId).find((v) => v.kind === 'draft')!;
    const row = db.prepare('SELECT style_sample_ids_json FROM chapter_versions WHERE id = ?').get(draftVersion.id) as {
      style_sample_ids_json: string;
    };
    expect(row.style_sample_ids_json).toBe('["mock-profile:s3","mock-profile:s1","mock-profile:s2"]');
  }, 30000);

  it('continue：带 grade 必含节拍在 task 尾部注入硬要求块与文风铁则', async () => {
    upsertBlueprint(db, {
      bookId,
      chapterNo: 4,
      title: '第四章',
      blueprint: { goal: '续写落地', beats: [], mustHaveBeats: [{ text: 'Y（重逢戏）', keywords: ['重逢'], grade: 'H' }], bannedTopics: [] },
      targetChars: 500,
    });
    const run = createRun(db, { bookId, mode: 'continue', chapterScope: { from: 4, to: 4 }, maxRounds: 1 });
    const cap = capturing(createDefaultMockProvider());
    await runChapterPipeline(
      { db, provider: cap.provider, config, emit: () => {} },
      { runId: run.id, bookId, chapterNo: 4 },
    );
    const draft = cap.calls.find((c) => c.step === 'draft')!;
    expect(draft.user).toContain('【本章硬要求】');
    expect(draft.user).toContain('（落地·H级须显性词）');
    expect(draft.user).toContain('【文风铁则】');
    expect(draft.user).toContain('RULES: 句长 10-20 字。');
  }, 30000);

  it('continue 无锚点 → 400 且先于 blueprint 校验', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkforge-continue-http-'));
    const app = await buildApp({
      config: loadConfig({ STRATA_BASE_URL: 'http://x', STRATA_API_KEY: 'k', STRATA_MODEL: 'm', INKFORGE_DATA_DIR: dataDir }),
      provider: createDefaultMockProvider(),
    });
    try {
      const created = await app.inject({ method: 'POST', url: '/api/books', payload: { title: '无锚点书' } });
      const bookId = (created.json() as { id: string }).id;
      // 书无任何章/蓝图：锚点校验必须先于 blueprint 循环
      const res = await app.inject({
        method: 'POST',
        url: '/api/runs',
        payload: { bookId, fromChapter: 1, toChapter: 1, mode: 'continue' },
      });
      expect(res.statusCode).toBe(400);
      const body = res.json() as { error: string };
      expect(body.error).toContain('续写锚点');
      expect(body.error).not.toContain('blueprint missing');
    } finally {
      await app.close();
      try {
        fs.rmSync(dataDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  }, 30000);
});
