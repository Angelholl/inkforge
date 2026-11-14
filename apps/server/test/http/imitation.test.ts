import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config';
import { buildApp } from '../../src/app';
import { createMockProvider } from '../../src/llm/mock';
import { openDb, type Database } from '../../src/db/open';
import type { ImitationDraftDto } from '@inkforge/shared';

const STRUCTURE_TEXT = `STRUCTURE: 开篇以失去引子建立动机。
STRUCTURE: 双线交织推进。
STRUCTURE: 卷末身份揭示收束。
STRUCTURE: 高潮前全线挫败。
STRUCTURE: 结局回收信物。`;

const RULES_TEXT = `RULES: 平均句长 10-20 字。
RULES: 对话占比 20%-40%。`;

function blueprintText(chapters: number): string {
  return Array.from({ length: chapters }, (_, i) => `# ${i + 1}\nGOAL: 第${i + 1}章目标\nBEATS:\n- 节拍一\n- 节拍二\nHOOK: 钩子${i + 1}`).join('\n');
}

const SAMPLE = '山川草木皆有意。'.repeat(60) + '少年负匣而行。'.repeat(40);

let dir: string;
let db: Database;
let app: Awaited<ReturnType<typeof buildApp>>;
let draft: ImitationDraftDto;

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkforge-imitation-http-'));
  const config = loadConfig({ STRATA_BASE_URL: 'http://127.0.0.1:47831/v1', STRATA_API_KEY: 'strata', STRATA_MODEL: 'iq3_xxs', INKFORGE_DATA_DIR: dir });
  db = openDb(path.join(config.dataDir, 'inkforge.db'));
  app = await buildApp({
    config,
    provider: createMockProvider({ summarize: { text: STRUCTURE_TEXT } }),
    summarizerProvider: createMockProvider({
      summarize: { sequence: [{ text: STRUCTURE_TEXT }, { text: RULES_TEXT }, { text: blueprintText(3) }] },
    }),
    db,
    inlineQueue: true,
  });
  const r = await app.inject({ method: 'POST', url: '/api/imitation-profiles/analyze', payload: { name: '仿写HTTP', text: SAMPLE, chapterCount: 3 } });
  expect(r.statusCode).toBe(200);
  draft = (r.json() as { draft: ImitationDraftDto }).draft;
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

describe('拆解仿写路由', () => {
  it('analyze：draft 三段齐备且不入库；<200 字 400；坏体 400', async () => {
    expect(draft.structure).toHaveLength(5);
    expect(draft.style.rulesText).toContain('平均句长');
    expect(draft.blueprint).toHaveLength(3);
    expect(draft.metrics).toHaveProperty('dialogueRatio');
    const n = db.prepare('SELECT COUNT(*) AS n FROM imitation_profiles').get() as { n: number };
    expect(n.n).toBe(0);

    const short = await app.inject({ method: 'POST', url: '/api/imitation-profiles/analyze', payload: { name: 'x', text: '太短', chapterCount: 3 } });
    expect(short.statusCode).toBe(400);
    const bad = await app.inject({ method: 'POST', url: '/api/imitation-profiles/analyze', payload: { name: 'x', text: SAMPLE } });
    expect(bad.statusCode).toBe(400);
  });

  it('save→list→get 往返：version 服务端计算；同 hash 二存 version+1 不可变', async () => {
    const save1 = await app.inject({ method: 'POST', url: '/api/imitation-profiles', payload: { draft } });
    expect(save1.statusCode).toBe(201);
    expect(save1.json()).toEqual({ id: expect.any(String), version: 1 });

    const save2 = await app.inject({ method: 'POST', url: '/api/imitation-profiles', payload: { draft } });
    expect(save2.json()).toEqual({ id: expect.any(String), version: 2 });

    const list = await app.inject({ method: 'GET', url: '/api/imitation-profiles' });
    expect(list.statusCode).toBe(200);
    // list 即全量 detail（structure/blueprint/style 直读，无需 GET-by-id）
    const rows = list.json() as Array<{ id: string; name: string; version: number; sourcePath: string; structure: string[]; style: { rulesText: string }; blueprint: Array<{ chapterNo: number }> }>;
    expect(rows).toHaveLength(2);
    expect(rows[0].version).toBe(2); // created_at DESC，新行在前
    expect(rows[0].sourcePath).toBe(draft.sourcePath);
    expect(rows[1].structure).toEqual(draft.structure);
    expect(rows[1].blueprint).toHaveLength(3);
    expect(rows[1].style.rulesText).toBe(draft.style.rulesText);
  });

  it('绑定：404 守卫 + 成功绑定 + book 字段往返 + 解绑', async () => {
    const created = await app.inject({ method: 'POST', url: '/api/books', payload: { title: '仿写绑定测书' } });
    const bookId = (created.json() as { id: string }).id;

    const missBook = await app.inject({ method: 'PUT', url: '/api/books/no-such/imitation', payload: { profileId: null } });
    expect(missBook.statusCode).toBe(404);

    const missProfile = await app.inject({ method: 'PUT', url: `/api/books/${bookId}/imitation`, payload: { profileId: 'no-such-profile' } });
    expect(missProfile.statusCode).toBe(404);

    const list = await app.inject({ method: 'GET', url: '/api/imitation-profiles' });
    const profileId = (list.json() as Array<{ id: string }>)[0].id;
    const bind = await app.inject({ method: 'PUT', url: `/api/books/${bookId}/imitation`, payload: { profileId } });
    expect(bind.statusCode).toBe(200);

    const book = await app.inject({ method: 'GET', url: `/api/books/${bookId}` });
    expect((book.json() as { imitationProfileId: string }).imitationProfileId).toBe(profileId);

    const unbind = await app.inject({ method: 'PUT', url: `/api/books/${bookId}/imitation`, payload: { profileId: null } });
    expect(unbind.statusCode).toBe(200);
    const bookAfter = await app.inject({ method: 'GET', url: `/api/books/${bookId}` });
    expect((bookAfter.json() as { imitationProfileId: string | null }).imitationProfileId).toBeNull();
  });

  it('delete：解绑引用 + 404 复删', async () => {
    const created = await app.inject({ method: 'POST', url: '/api/books', payload: { title: '仿写删除测书' } });
    const bookId = (created.json() as { id: string }).id;
    const list = await app.inject({ method: 'GET', url: '/api/imitation-profiles' });
    const profileId = (list.json() as Array<{ id: string }>)[0].id;
    await app.inject({ method: 'PUT', url: `/api/books/${bookId}/imitation`, payload: { profileId } });

    const del = await app.inject({ method: 'DELETE', url: `/api/imitation-profiles/${profileId}` });
    expect(del.statusCode).toBe(200);
    // 绑定被清空
    const book = await app.inject({ method: 'GET', url: `/api/books/${bookId}` });
    expect((book.json() as { imitationProfileId: string | null }).imitationProfileId).toBeNull();
    // 行数归零（本文件两行全删：先删一行，再删另一行）
    const rest = (await app.inject({ method: 'GET', url: '/api/imitation-profiles' })).json() as Array<{ id: string }>;
    if (rest.length > 0) {
      await app.inject({ method: 'DELETE', url: `/api/imitation-profiles/${rest[0].id}` });
    }
    const n = db.prepare('SELECT COUNT(*) AS n FROM imitation_profiles').get() as { n: number };
    expect(n.n).toBe(0);
    const redel = await app.inject({ method: 'DELETE', url: `/api/imitation-profiles/${profileId}` });
    expect(redel.statusCode).toBe(404);
  });
});
