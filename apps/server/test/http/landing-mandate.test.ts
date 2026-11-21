import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config';
import { buildApp } from '../../src/app';
import { openDb } from '../../src/db/open';
import { createDefaultMockProvider } from '../../src/llm/mock';
import { getChapter, upsertBlueprint } from '../../src/db/repositories/chapters';

// 测试夹具中性前缀（与生产钉值文案同形态，1301 纪律：不引用真实词表）
const MANDATE_TEST_PREFIX = '〔书级落地策略〕';

describe('书级落地策略 PUT /meta 三态校验 + GET book 解析形态（DEC-2026-1122-01）', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let db: ReturnType<typeof openDb>;
  let bookId: string;

  beforeAll(async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkforge-landing-'));
    const config = loadConfig({
      STRATA_BASE_URL: 'http://127.0.0.1:47831/v1', STRATA_API_KEY: 'strata', STRATA_MODEL: 'iq3_xxs',
      INKFORGE_DATA_DIR: path.join(dir, 'srv'),
    });
    db = openDb(path.join(config.dataDir, 'inkforge.db'));
    app = await buildApp({ config, provider: createDefaultMockProvider(), db, inlineQueue: true });
    const created = await app.inject({ method: 'POST', url: '/api/books', payload: { title: '落地策略测书' } });
    bookId = (created.json() as { id: string }).id;
  });

  afterAll(async () => {
    await app.close();
    try {
      db.close();
    } catch {
      /* ignore */
    }
  });

  it('PUT meta cadence+heavyEveryN=3 → 200，GET 回 {mode:"cadence",heavyEveryN:3}', async () => {
    const put = await app.inject({
      method: 'PUT',
      url: `/api/books/${bookId}/meta`,
      payload: { landingMandate: { mode: 'cadence', heavyEveryN: 3 } },
    });
    expect(put.statusCode).toBe(200);
    const got = await app.inject({ method: 'GET', url: `/api/books/${bookId}` });
    expect((got.json() as { landingMandate: unknown }).landingMandate).toEqual({ mode: 'cadence', heavyEveryN: 3 });
  });

  it('PUT meta {mode:"off"} → 200，GET 回 {mode:"off"}（无 heavyEveryN 键）', async () => {
    const put = await app.inject({
      method: 'PUT',
      url: `/api/books/${bookId}/meta`,
      payload: { landingMandate: { mode: 'off' } },
    });
    expect(put.statusCode).toBe(200);
    const got = await app.inject({ method: 'GET', url: `/api/books/${bookId}` });
    expect((got.json() as { landingMandate: unknown }).landingMandate).toEqual({ mode: 'off' });
  });

  it('PUT meta landingMandate=null → 200，GET 回 landingMandate:null', async () => {
    const put = await app.inject({
      method: 'PUT',
      url: `/api/books/${bookId}/meta`,
      payload: { landingMandate: null },
    });
    expect(put.statusCode).toBe(200);
    const got = await app.inject({ method: 'GET', url: `/api/books/${bookId}` });
    const body = got.json() as { landingMandate: unknown; landingMandateJson?: unknown };
    expect(body.landingMandate).toBeNull();
    expect(body.landingMandateJson).toBeUndefined(); // 原始 JSON 串不外泄
  });

  it('PUT meta heavyEveryN=0/1/-2/1.5 → 各 400（error 含 heavyEveryN）', async () => {
    for (const n of [0, 1, -2, 1.5]) {
      const put = await app.inject({
        method: 'PUT',
        url: `/api/books/${bookId}/meta`,
        payload: { landingMandate: { mode: 'cadence', heavyEveryN: n } },
      });
      expect(put.statusCode).toBe(400);
      expect(JSON.stringify(put.json())).toContain('heavyEveryN');
    }
  });

  it('PUT meta mode:"daily" → 400', async () => {
    const put = await app.inject({
      method: 'PUT',
      url: `/api/books/${bookId}/meta`,
      payload: { landingMandate: { mode: 'daily' } },
    });
    expect(put.statusCode).toBe(400);
  });

  it('PUT meta 不带 landingMandate → 既有 title 更新不受影响、策略值不动', async () => {
    const put = await app.inject({
      method: 'PUT',
      url: `/api/books/${bookId}/meta`,
      payload: { title: '改题之书' },
    });
    expect(put.statusCode).toBe(200);
    const got = await app.inject({ method: 'GET', url: `/api/books/${bookId}` });
    const body = got.json() as { title: string; landingMandate: unknown };
    expect(body.title).toBe('改题之书');
    expect(body.landingMandate).toBeNull(); // 冲击清单 #11：旧 payload 行为不变
  });

  it('PUT blueprint 同 text 前缀条目 → 并集去重保留库内 mandate 条目（source 存活、条目数不增）', async () => {
    const text = `${MANDATE_TEST_PREFIX}本章须完成一次高强落地（H级）重场戏，落地分级词表须显性命中`;
    upsertBlueprint(db, {
      bookId,
      chapterNo: 1,
      title: '第一章',
      blueprint: { goal: '推进主线', beats: [], mustHaveBeats: [{ text, keywords: [], grade: 'H', source: 'mandate' }], bannedTopics: [] },
      targetChars: 3000,
    });
    const put = await app.inject({
      method: 'PUT',
      url: `/api/books/${bookId}/chapters/1/blueprint`,
      payload: {
        title: '第一章',
        blueprint: { goal: '推进主线', beats: [], mustHaveBeats: [{ text: `  ${text}  `, keywords: ['玉佩'] }], bannedTopics: [] },
      },
    });
    expect(put.statusCode).toBe(200);
    const beats = getChapter(db, bookId, 1)!.blueprint!.mustHaveBeats;
    expect(beats).toHaveLength(1);
    expect(beats[0]!.source).toBe('mandate');
  });
});
