import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config';
import { migrate } from '../../src/db/migrate';
import { openDb, type Database } from '../../src/db/open';
import { createBook } from '../../src/db/repositories/books';
import { upsertBlueprint, listVersions, getCurrentVersion, getChapter } from '../../src/db/repositories/chapters';
import { createRun, listSteps } from '../../src/db/repositories/runs';
import { runChapterPipeline } from '../../src/pipeline/chapter';
import { createMockProvider } from '../../src/llm/mock';
import type { CompletionRequest } from '../../src/llm/types';
import type { ChapterBlueprint } from '@inkforge/shared';

const BP: ChapterBlueprint = { goal: 'g', beats: [], mustHaveBeats: [], bannedTopics: [] };
const config = loadConfig({ STRATA_BASE_URL: 'http://x', STRATA_API_KEY: 'k', STRATA_MODEL: 'm' });

let db: Database;
let dir: string;
let bookId: string;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkforge-term-'));
  db = openDb(path.join(dir, 't.db'));
  migrate(db);
  bookId = createBook(db, { title: '终止回归书' }).id;
  upsertBlueprint(db, { bookId, chapterNo: 1, title: '章一', blueprint: BP, targetChars: 500 });
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

const BLOCKER_QC = `OVERALL: 5
---
SEVERITY: blocker
DIMENSION: 设定一致
QUOTE: 【章
COMMENT: 恒定 blocker`;

const mkDraft = (chapterNo: number) => `【章${chapterNo}t】终止回归正文。` + 't'.repeat(478);

describe('终止条件回归（基线只增不减）', () => {
  it('never-pass：max_rounds=2 + qc 恒 blocker → rewrite×2 必停 needs_human', async () => {
    const run = createRun(db, { bookId, mode: 'generate', chapterScope: { from: 1, to: 1 }, maxRounds: 2 });
    const provider = createMockProvider({
      draft: { textFn: (m) => mkDraft(m.chapterNo ?? 1) },
      qc: { repeat: { text: BLOCKER_QC } },
      rewrite: { textFn: (m) => mkDraft(m.chapterNo ?? 1) + 'r'.repeat(1) },
      summarize: { text: 'SUMMARY: x' },
    });
    const outcome = await runChapterPipeline({ db, provider, config, emit: () => {} }, { runId: run.id, bookId, chapterNo: 1 });
    expect(outcome.status).toBe('needs_human');
    expect(outcome.rounds).toBe(2);
    const steps = listSteps(db, run.id);
    expect(steps.filter((s) => s.step === 'rewrite')).toHaveLength(2);
    const versions = listVersions(db, (db.prepare('SELECT id FROM chapters WHERE book_id=? AND chapter_no=1').get(bookId) as { id: string }).id);
    expect(versions.map((v) => v.kind)).toEqual(['revised', 'revised', 'draft']); // DESC：两次重写最新在前
    const cur = getCurrentVersion(db, versions[0].chapterId)!;
    expect(cur.id).toBe(versions[0].id); // overall 相等取新
    expect(getChapter(db, bookId, 1)!.status).toBe('needs_human');
    // D3 追加断言：needs_human 终态也必须落 summarize 与摘要，且 finalize 指针=最佳版本
    expect(steps.some((s) => s.step === 'summarize' && s.status === 'done')).toBe(true);
    const summaryCount = (db.prepare('SELECT COUNT(*) AS c FROM chapter_summaries WHERE book_id=? AND chapter_no=1').get(bookId) as { c: number }).c;
    expect(summaryCount).toBe(1);
    const finRow = steps.find((s) => s.step === 'finalize' && s.status === 'done');
    expect(finRow).toBeTruthy();
    expect(finRow!.outputVersionId).toBe(versions[0].id);
  }, 30000);

  it('no-improve：overall [5.0→5.2] 增益 4%<5% → rewrite×1 无改善停（早于轮数）', async () => {
    upsertBlueprint(db, { bookId, chapterNo: 2, title: '章二', blueprint: BP, targetChars: 500 });
    const run = createRun(db, { bookId, mode: 'generate', chapterScope: { from: 2, to: 2 }, maxRounds: 5 });
    const provider = createMockProvider({
      draft: { textFn: (m) => `【章${m.chapterNo}n】无改善正文。` + 'n'.repeat(478) },
      // 计划钉值矛盾修正：OVERALL 解析钉死 1-10 整数，小数 5.0/5.2 会触发修复重试——改整数 [5→5]（增益 0%<5%）
      qc: { sequence: [{ text: 'OVERALL: 5' }, { repeat: { text: 'OVERALL: 5' } }] },
      rewrite: { textFn: (m) => `【章${m.chapterNo}n】无改善正文改。` + 'm'.repeat(477) },
      summarize: { text: 'SUMMARY: x' },
    });
    const outcome = await runChapterPipeline({ db, provider, config, emit: () => {} }, { runId: run.id, bookId, chapterNo: 2 });
    expect(outcome.status).toBe('needs_human');
    expect(outcome.rounds).toBe(1);
    const steps = listSteps(db, run.id);
    expect(steps.filter((s) => s.step === 'rewrite')).toHaveLength(1); // 无改善停早于轮数停（maxRounds=5 未用满）
    expect(getChapter(db, bookId, 2)!.status).toBe('needs_human');
  }, 30000);

  it('no-improve 三版 6/7/5：摘要取 best 版正文且重入幂等', async () => {
    upsertBlueprint(db, { bookId, chapterNo: 3, title: '章三', blueprint: BP, targetChars: 500 });
    const run = createRun(db, { bookId, mode: 'generate', chapterScope: { from: 3, to: 3 }, maxRounds: 2 });
    const provider = createMockProvider({
      draft: { text: '【甲版】' + 'x'.repeat(485) },
      rewrite: { sequence: [{ text: '【乙版】' + 'y'.repeat(485) }, { text: '【丙版】' + 'z'.repeat(485) }] },
      qc: { sequence: [{ text: 'OVERALL: 6' }, { text: 'OVERALL: 7' }, { text: 'OVERALL: 5' }, { repeat: { text: 'OVERALL: 5' } }] },
      summarize: { text: 'SUMMARY: x' },
    });
    const summarizeUsers: string[] = [];
    const wrappingProvider = {
      complete: async (req: CompletionRequest) => {
        if (req.meta.step === 'summarize') summarizeUsers.push(req.user);
        return provider.complete(req);
      },
    };
    const outcome = await runChapterPipeline({ db, provider: wrappingProvider, config, emit: () => {} }, { runId: run.id, bookId, chapterNo: 3 });
    expect(outcome.status).toBe('needs_human');
    expect(outcome.rounds).toBe(2);
    expect(summarizeUsers).toHaveLength(1);
    // 摘要请求必须携带 best（7 分乙版）正文，而非 currentVersion（丙版）或首版（甲版）
    expect(summarizeUsers[0]).toContain('【乙版】');
    expect(summarizeUsers[0]).not.toContain('【丙版】');
    expect(summarizeUsers[0]).not.toContain('【甲版】');
    // 重入：同 runId 同章 resumeFrom 'qc' → 不抛（finalize 幂等消除 UNIQUE 冲突）
    await runChapterPipeline({ db, provider: wrappingProvider, config, emit: () => {} }, { runId: run.id, bookId, chapterNo: 3, resumeFrom: 'qc' });
    const summaryCount = (db.prepare('SELECT COUNT(*) AS c FROM chapter_summaries WHERE book_id=? AND chapter_no=3').get(bookId) as { c: number }).c;
    expect(summaryCount).toBe(1);
    expect(listSteps(db, run.id).filter((s) => s.step === 'finalize').length).toBeLessThanOrEqual(2);
  }, 30000);
});
