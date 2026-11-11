import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config';
import { migrate } from '../../src/db/migrate';
import { openDb, type Database } from '../../src/db/open';
import { createBook } from '../../src/db/repositories/books';
import { upsertBlueprint, listVersions } from '../../src/db/repositories/chapters';
import { listSteps } from '../../src/db/repositories/runs';
import { runChapterPipeline } from '../../src/pipeline/chapter';
import { createMockProvider } from '../../src/llm/mock';
import type { ChapterBlueprint } from '@inkforge/shared';

const BP: ChapterBlueprint = { goal: 'g', beats: [], mustHaveBeats: [], bannedTopics: [] };
const config = loadConfig({ STRATA_BASE_URL: 'http://x', STRATA_API_KEY: 'k', STRATA_MODEL: 'm' });

let db: Database;
let dir: string;
let bookId: string;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkforge-route-'));
  db = openDb(path.join(dir, 't.db'));
  migrate(db);
  bookId = createBook(db, { title: '路由 e2e 书' }).id;
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

describe('routing e2e（双 mock 分账）', () => {
  it('qc 步 usageProvider=cloud、draft 版本 provider=local', async () => {
    const run = (db
      .prepare("INSERT INTO runs(id, book_id, mode, chapter_scope_json, created_at) VALUES(?,?, 'generate', ?, ?)")
      .run(`run-route-${Math.random().toString(36).slice(2)}`, bookId, JSON.stringify({ from: 1, to: 1 }), new Date().toISOString()),
    void 0);
    void run;
    const runId = (db.prepare('SELECT id FROM runs ORDER BY created_at DESC LIMIT 1').get() as { id: string }).id;

    const localDraft = createMockProvider({ draft: { textFn: (m) => `【章${m.chapterNo}L】本地稿。` + 'L'.repeat(479) } });
    const cloudQc = createMockProvider({ qc: { text: 'OVERALL: 9' } });
    await runChapterPipeline(
      {
        db,
        provider: localDraft, // 兜底（rewriter/summarizer 落本地）
        providers: {
          drafter: localDraft,
          qc: cloudQc,
          rewriter: localDraft,
          summarizer: createMockProvider({ summarize: { text: 'SUMMARY: 路由验证。' } }),
          labels: { drafter: 'local', qc: 'cloud', rewriter: 'local', summarizer: 'local' },
        },
        config,
        emit: () => {},
      },
      { runId, bookId, chapterNo: 1 },
    );
    const qcStep = listSteps(db, runId).find((s) => s.step === 'qc')!;
    expect((qcStep.outputJson as { usageProvider?: string }).usageProvider).toBe('cloud');
    const draftVersion = listVersions(db, (db.prepare('SELECT id FROM chapters WHERE book_id=? AND chapter_no=1').get(bookId) as { id: string }).id).find(
      (v) => v.kind === 'draft',
    )!;
    expect((draftVersion.params as { provider?: string }).provider).toBe('local');
  }, 30000);
});
