import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { RunWithStepsDto } from '@inkforge/shared';
import { loadConfig } from '../../src/config';
import { migrate } from '../../src/db/migrate';
import { openDb, type Database } from '../../src/db/open';
import { appendCharacterAlias, createBook, createCharacter, listCharacters } from '../../src/db/repositories/books';
import { upsertBlueprint } from '../../src/db/repositories/chapters';
import { getContinuitySnapshot, getRecentSummaries, listForeshadowings } from '../../src/db/repositories/continuity';
import { commitSummarize, generateSummarize, runSummarizeStep, SummarizeParseError } from '../../src/pipeline/summarize';
import { createMockProvider } from '../../src/llm/mock';

const config = loadConfig({ STRATA_BASE_URL: 'http://x', STRATA_API_KEY: 'k', STRATA_MODEL: 'm' });

const PIN_TEXT = `SUMMARY: 重摘要旧章，密信落款人身份仍被埋下。
BEATS:
- 重读旧章
THREADS:
- [planted] 密信落款人身份
STATE:
张三={"位置":"书房"}`;

const TABLES = ['chapter_summaries', 'character_states', 'foreshadowings', 'run_steps'];
function tableCounts(db: Database): number[] {
  return TABLES.map((t) => (db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n);
}

type Ctx = { db: Database; dir: string; bookId: string; chapterId: string };
const ctxs: Ctx[] = [];

function fresh(): Ctx {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkforge-sumCommit-'));
  const db = openDb(path.join(dir, 't.db'));
  migrate(db);
  const bookId = createBook(db, {
    title: '摘要事务测试书',
    characters: [{ name: '张三', baseSetting: '{"位置":"书房"}' }],
  }).id;
  upsertBlueprint(db, {
    bookId, chapterNo: 1, title: '章一',
    blueprint: { goal: 'g', beats: [], mustHaveBeats: [], bannedTopics: [] },
  });
  const chapterId = (db.prepare('SELECT id FROM chapters WHERE book_id=? AND chapter_no=1').get(bookId) as { id: string }).id;
  const ctx = { db, dir, bookId, chapterId };
  ctxs.push(ctx);
  return ctx;
}

afterAll(() => {
  for (const { db, dir } of ctxs) {
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
  }
});

describe('summarize 拆分与 D2 伏笔复活', () => {
  it('0016 迁移：characters.aliases 列存在且旧行默认 []', () => {
    const { db } = fresh();
    const row = db.prepare('SELECT aliases FROM characters LIMIT 1').get() as { aliases: string };
    expect(row.aliases).toBe('[]');
  });

  it('appendCharacterAlias 幂等：重复 append 不产生重复项', () => {
    const { db } = fresh();
    const bookId = createBook(db, { title: '别名幂等测试书' }).id;
    const id = createCharacter(db, bookId, { name: '阿三' }).id;
    appendCharacterAlias(db, id, '阿三');
    appendCharacterAlias(db, id, '阿三');
    expect(listCharacters(db, bookId)[0].aliases).toEqual(['阿三']);
    appendCharacterAlias(db, id, '三哥');
    expect(listCharacters(db, bookId)[0].aliases).toEqual(['阿三', '三哥']);
  });

  it('现状：重摘要旧章复活已回收伏笔（D2 修复前快照）', async () => {
    const { db, bookId, chapterId } = fresh();
    db.prepare('INSERT INTO foreshadowings(id, book_id, description, planted_ch, status, created_at) VALUES(?,?,?,?,?,?)').run(
      'f-d2', bookId, '密信落款人身份', 1, 'resolved', new Date().toISOString(),
    );
    await runSummarizeStep(
      { db, provider: createMockProvider({ summarize: { text: PIN_TEXT } }), config, emit: () => {} },
      { runId: 'r-d2', chapterId, chapterNo: 1, bookId, finalContent: '正文' },
    );
    expect(listForeshadowings(db, bookId).filter((f) => f.description === '密信落款人身份')).toHaveLength(1);
  });

  it('generateSummarize 零写入：chapter_summaries / character_states / foreshadowings / run_steps 四表行数不变', async () => {
    const { db } = fresh();
    const before = tableCounts(db);
    const payload = await generateSummarize(
      { provider: createMockProvider({ summarize: { text: PIN_TEXT } }), config },
      { chapterNo: 1, finalContent: '正文' },
    );
    expect(tableCounts(db)).toEqual(before);
    expect(payload.summary).toBe('重摘要旧章，密信落款人身份仍被埋下。');
    expect(payload.beats).toEqual(['重读旧章']);
    expect(payload.openThreads).toEqual(['[planted] 密信落款人身份']);
    expect(payload.characterDeltas).toEqual([{ name: '张三', stateJson: '{"位置":"书房"}' }]);
  });

  it('commitSummarize 四段齐写：摘要+STATE+THREADS 回收+新埋同现在库', () => {
    const { db, bookId } = fresh();
    db.prepare('INSERT INTO foreshadowings(id, book_id, description, planted_ch, status, created_at) VALUES(?,?,?,?,?,?)').run(
      'f-open', bookId, '密信落款人身份', 1, 'open', new Date().toISOString(),
    );
    commitSummarize(db, bookId, 1, {
      summary: '主角夜探书房，发现密信。',
      beats: ['夜探书房'],
      openThreads: ['[resolved] 密信落款人身份', '[planted] 南下路线'],
      characterDeltas: [{ name: '张三', stateJson: '{"位置":"庭院","持有":["密信"]}' }],
    });
    const summaries = getRecentSummaries(db, bookId, 2);
    expect(summaries).toHaveLength(1);
    expect(summaries[0].summary).toBe('主角夜探书房，发现密信。');
    expect(summaries[0].beats).toEqual(['夜探书房']);
    expect(summaries[0].openThreads).toEqual(['[resolved] 密信落款人身份', '[planted] 南下路线']);
    const snap = getContinuitySnapshot(db, bookId, 2);
    expect(snap.characters).toEqual([{ name: '张三', state: { 位置: '庭院', 持有: ['密信'] } }]);
    const resolved = (db.prepare('SELECT status, resolved_ch FROM foreshadowings WHERE id = ?').get('f-open') as { status: string; resolved_ch: number });
    expect(resolved.status).toBe('resolved');
    expect(resolved.resolved_ch).toBe(1);
    expect(listForeshadowings(db, bookId).find((f) => f.description === '南下路线')?.status).toBe('open');
  });

  it('STATE 非法 JSON 行跳过不影响整步；JSON 非对象（"死了"）抛错且四段零写入回滚', () => {
    const ok = fresh();
    commitSummarize(ok.db, ok.bookId, 1, {
      summary: '合法状态行照常落库。',
      beats: ['b'],
      openThreads: [],
      characterDeltas: [
        { name: '张三', stateJson: '{坏 JSON' },
        { name: '张三', stateJson: '{"位置":"庭院"}' },
      ],
    });
    expect(getRecentSummaries(ok.db, ok.bookId, 2)).toHaveLength(1);
    expect(getContinuitySnapshot(ok.db, ok.bookId, 2).characters[0].state).toMatchObject({ 位置: '庭院' });

    const bad = fresh();
    bad.db.prepare('INSERT INTO foreshadowings(id, book_id, description, planted_ch, status, created_at) VALUES(?,?,?,?,?,?)').run(
      'f-bad', bad.bookId, '密信落款人身份', 1, 'open', new Date().toISOString(),
    );
    const before = tableCounts(bad.db);
    expect(() =>
      commitSummarize(bad.db, bad.bookId, 1, {
        summary: '不该落库。',
        beats: ['b'],
        openThreads: ['[planted] 新伏笔'],
        characterDeltas: [{ name: '张三', stateJson: '"死了"' }],
      }),
    ).toThrow();
    expect(tableCounts(bad.db)).toEqual(before);
  });

  it('空 SUMMARY → generateSummarize 抛 SummarizeParseError', async () => {
    await expect(
      generateSummarize(
        { provider: createMockProvider({ summarize: { text: 'BEATS:\n- x' } }), config },
        { chapterNo: 1, finalContent: '正文' },
      ),
    ).rejects.toBeInstanceOf(SummarizeParseError);
  });

  it('runSummarizeStep：done 失败上抛不 finalize；needs_human 吞掉照常 finalize', async () => {
    const { buildApp } = await import('../../src/app');
    const BP = { goal: '推进主线', beats: [], mustHaveBeats: [], bannedTopics: [] };
    const BLOCKER_QC = `OVERALL: 5
---
SEVERITY: blocker
DIMENSION: 设定一致
QUOTE: 【章
COMMENT: 恒定 blocker`;
    const COMMIT_FAIL_TEXT = `SUMMARY: 坏状态不该落库。
BEATS:
- b
THREADS:
- [planted] 新伏笔
STATE:
张三="死了"`;

    const dirs: string[] = [];
    const apps: Array<Awaited<ReturnType<typeof buildApp>>> = [];
    const makeApp = async (provider: ReturnType<typeof createMockProvider>) => {
      const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkforge-sumCommit-e2e-'));
      dirs.push(dataDir);
      const cfg = loadConfig({
        STRATA_BASE_URL: 'http://127.0.0.1:47831/v1',
        STRATA_API_KEY: 'strata',
        STRATA_MODEL: 'iq3_xxs',
        INKFORGE_DATA_DIR: dataDir,
      });
      const app = await buildApp({ config: cfg, provider, inlineQueue: true });
      apps.push(app);
      const created = await app.inject({ method: 'POST', url: '/api/books', payload: { title: 'sum-commit-e2e' } });
      const bookId = (created.json() as { id: string }).id;
      const bp = await app.inject({
        method: 'PUT',
        url: `/api/books/${bookId}/chapters/1/blueprint`,
        payload: { title: '章一', blueprint: BP, targetChars: 500 },
      });
      expect(bp.statusCode).toBe(200);
      return { app, bookId };
    };
    const pollRun = async (
      app: Awaited<ReturnType<typeof buildApp>>,
      runId: string,
      want: string[],
      timeoutMs: number,
    ): Promise<RunWithStepsDto> => {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        const r = await app.inject({ method: 'GET', url: `/api/runs/${runId}` });
        const run = r.json() as RunWithStepsDto;
        if (want.includes(run.status)) return run;
        if (Date.now() > deadline) return run;
        await new Promise((res) => setTimeout(res, 100));
      }
    };
    const draft = (tag: string) => ({
      textFn: (m: { chapterNo?: number }) => `【章${m.chapterNo}${tag}】恒定正文。` + '停'.repeat(480),
    });

    try {
      // done + 生成失败：错误上抛不 finalize → run 无 finalize 版本指针
      {
        const { app, bookId } = await makeApp(
          createMockProvider({ draft: draft('done'), qc: { text: 'OVERALL: 9' }, summarize: { error: 'http_500', afterMs: 0 } }),
        );
        const gen = await app.inject({ method: 'POST', url: `/api/books/${bookId}/chapters/1/generate`, payload: {} });
        const runId = (gen.json() as { runId: string }).runId;
        const run = await pollRun(app, runId, ['done', 'failed'], 15000);
        expect(run.status).toBe('done');
        expect(run.steps.find((s) => s.step === 'summarize')?.status).toBe('failed');
        expect(run.steps.find((s) => s.step === 'finalize')?.outputVersionId).toBeUndefined();
      }
      // needs_human + 生成失败：吞掉 → summarize step failed 但 run=done 且有 finalize 指针
      {
        const { app, bookId } = await makeApp(
          createMockProvider({
            draft: draft('nh'),
            qc: { repeat: { text: BLOCKER_QC } },
            rewrite: draft('nh'),
            summarize: { error: 'http_500', afterMs: 0 },
          }),
        );
        const gen = await app.inject({ method: 'POST', url: `/api/books/${bookId}/chapters/1/generate`, payload: { maxRounds: 1 } });
        const runId = (gen.json() as { runId: string }).runId;
        const run = await pollRun(app, runId, ['done', 'failed'], 15000);
        expect(run.status).toBe('done');
        expect(run.steps.find((s) => s.step === 'summarize')?.status).toBe('failed');
        expect(run.steps.find((s) => s.step === 'finalize')?.outputVersionId).toBeTruthy();
      }
      // done + commit 失败（stateJson 非对象）：同两态断言
      {
        const { app, bookId } = await makeApp(
          createMockProvider({ draft: draft('doneC'), qc: { text: 'OVERALL: 9' }, summarize: { text: COMMIT_FAIL_TEXT } }),
        );
        const gen = await app.inject({ method: 'POST', url: `/api/books/${bookId}/chapters/1/generate`, payload: {} });
        const runId = (gen.json() as { runId: string }).runId;
        const run = await pollRun(app, runId, ['done', 'failed'], 15000);
        expect(run.status).toBe('done');
        expect(run.steps.find((s) => s.step === 'summarize')?.status).toBe('failed');
        expect(run.steps.find((s) => s.step === 'finalize')?.outputVersionId).toBeUndefined();
      }
      {
        const { app, bookId } = await makeApp(
          createMockProvider({
            draft: draft('nhC'),
            qc: { repeat: { text: BLOCKER_QC } },
            rewrite: draft('nhC'),
            summarize: { text: COMMIT_FAIL_TEXT },
          }),
        );
        const gen = await app.inject({ method: 'POST', url: `/api/books/${bookId}/chapters/1/generate`, payload: { maxRounds: 1 } });
        const runId = (gen.json() as { runId: string }).runId;
        const run = await pollRun(app, runId, ['done', 'failed'], 15000);
        expect(run.status).toBe('done');
        expect(run.steps.find((s) => s.step === 'summarize')?.status).toBe('failed');
        expect(run.steps.find((s) => s.step === 'finalize')?.outputVersionId).toBeTruthy();
      }
    } finally {
      for (const a of apps) await a.close();
      for (const d of dirs) {
        try {
          fs.rmSync(d, { recursive: true, force: true });
        } catch {
          /* ignore */
        }
      }
    }
  }, 90000);
});
