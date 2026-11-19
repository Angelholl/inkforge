import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config';
import { buildApp } from '../../src/app';
import { createMockProvider } from '../../src/llm/mock';
import { openDb, type Database } from '../../src/db/open';
import { appendChapterVersion, getChapter, setCurrentVersion } from '../../src/db/repositories/chapters';
import type { CompletionRequest, LlmProvider } from '../../src/llm/types';

// DEC-2026-1120-01：全文改写开关 + 8000 字硬门 + 指令截断修复（F2）回归
let dir: string;
let db: Database;
let app: Awaited<ReturnType<typeof buildApp>>;
let bookId: string;
let calls: CompletionRequest[];
let vidNormal: string;
let vidLong: string;
let vidEmpty: string;

const NORMAL_CONTENT = '夜雨初歇。山道泥泞。'.repeat(30); // ~600 字
const REWRITE_OUTPUT = '改写后的全文正文。';

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkforge-rewrite-fulltext-'));
  const config = loadConfig({ STRATA_BASE_URL: 'http://127.0.0.1:47831/v1', STRATA_API_KEY: 'strata', STRATA_MODEL: 'iq3_xxs', INKFORGE_DATA_DIR: dir });
  db = openDb(path.join(config.dataDir, 'inkforge.db'));
  calls = [];
  const inner = createMockProvider({ rewrite: { text: REWRITE_OUTPUT } });
  const provider: LlmProvider = {
    async complete(req) {
      calls.push(req);
      return inner.complete(req);
    },
  };
  app = await buildApp({ config, provider, db, inlineQueue: true });
  const created = await app.inject({ method: 'POST', url: '/api/books', payload: { title: '全文改写测书', description: '修真。' } });
  bookId = (created.json() as { id: string }).id;
  db.prepare(
    'INSERT INTO chapters(id, book_id, chapter_no, title, blueprint_json, target_chars, created_at) VALUES(?,?,?,?,?,?,?)',
  ).run('pfull1', bookId, 1, '第1章', JSON.stringify({ goal: '第1章目标', beats: [], mustHaveBeats: [], bannedTopics: [] }), 500, new Date().toISOString());
  const ch = getChapter(db, bookId, 1)!;
  const vNormal = appendChapterVersion(db, { chapterId: ch.id, kind: 'draft', content: NORMAL_CONTENT });
  setCurrentVersion(db, ch.id, vNormal.id);
  vidNormal = vNormal.id;
  vidLong = appendChapterVersion(db, { chapterId: ch.id, kind: 'draft', content: '夜'.repeat(8001) }).id; // 超门版本
  vidEmpty = appendChapterVersion(db, { chapterId: ch.id, kind: 'draft', content: '' }).id; // 空正文版本
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

describe('全文改写（DEC-2026-1120-01）', () => {
  it('全文模式：201 revised、params.fullText=true 无 selection、parentVersionId 指原版本、current 不动、prompt 含完整指令与全文正文', async () => {
    const before = getChapter(db, bookId, 1)!.currentVersionId;
    const r = await app.inject({ method: 'POST', url: `/api/versions/${vidNormal}/rewrite-selection`, payload: { instruction: '统一全文用词并去掉套话' } });
    expect(r.statusCode).toBe(201);
    const body = r.json() as { id: string; kind: string; parentVersionId: string; params: Record<string, unknown> };
    expect(body.kind).toBe('revised');
    expect(body.params.fullText).toBe(true);
    expect('selection' in body.params).toBe(false);
    expect(body.params.selectionRewrite).toBe(true);
    expect(body.parentVersionId).toBe(vidNormal);
    expect(getChapter(db, bookId, 1)!.currentVersionId).toBe(before);

    const req = calls[calls.length - 1];
    expect(req.user).toContain('【指令】统一全文用词并去掉套话');
    expect(req.user).toContain('夜雨初歇');
  });

  it('全文超 8000 字 → 400 fulltext-too-long，且未发起模型调用', async () => {
    const countBefore = calls.length;
    const r = await app.inject({ method: 'POST', url: `/api/versions/${vidLong}/rewrite-selection`, payload: { instruction: '润色全文' } });
    expect(r.statusCode).toBe(400);
    const body = r.json() as { error: string; reason: string };
    expect(body.reason).toBe('fulltext-too-long');
    expect(body.error).toContain('8000');
    expect(calls.length).toBe(countBefore);
  });

  it('全文空正文 → 400 当前版本无正文', async () => {
    const r = await app.inject({ method: 'POST', url: `/api/versions/${vidEmpty}/rewrite-selection`, payload: { instruction: '润色全文' } });
    expect(r.statusCode).toBe(400);
    expect((r.json() as { error: string }).error).toBe('当前版本无正文');
  });

  it('selection 模式回归：201 且 params.selection 在场', async () => {
    const r = await app.inject({ method: 'POST', url: `/api/versions/${vidNormal}/rewrite-selection`, payload: { selection: '一小段文字', instruction: '压缩它' } });
    expect(r.statusCode).toBe(201);
    const body = r.json() as { params: Record<string, unknown> };
    expect(body.params.selection).toBe('一小段文字');
    expect(body.params.fullText).toBeUndefined();
  });

  it('长选段（>500 字符）指令不被 task 槽截断（F2 回归钉死）', async () => {
    const longSelection = '甲'.repeat(600);
    const r = await app.inject({ method: 'POST', url: `/api/versions/${vidNormal}/rewrite-selection`, payload: { selection: longSelection, instruction: '压缩到三分之一' } });
    expect(r.statusCode).toBe(201);
    const req = calls[calls.length - 1];
    expect(req.user).toContain('【指令】压缩到三分之一');
    expect(req.user).toContain(longSelection);
  });

  it('缺 instruction → 400', async () => {
    const r = await app.inject({ method: 'POST', url: `/api/versions/${vidNormal}/rewrite-selection`, payload: { selection: '一小段文字' } });
    expect(r.statusCode).toBe(400);
  });
});
