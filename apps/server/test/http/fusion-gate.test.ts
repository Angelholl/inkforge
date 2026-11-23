import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config';
import { buildApp } from '../../src/app';
import { openDb } from '../../src/db/open';
import * as booksRepo from '../../src/db/repositories/books';
import * as chaptersRepo from '../../src/db/repositories/chapters';
import * as continuityRepo from '../../src/db/repositories/continuity';
import { refineForDescription } from '../../src/settings-import';
import { createDefaultMockProvider, createMockProvider, type MockScript } from '../../src/llm/mock';
import type { CompletionRequest, LlmProvider } from '../../src/llm/types';

// 中性仿形 canned 文本（自造占位，禁引 v6 真实文本）
const TENSION_TEXT = [
  'TENSION: 描写密度 | 设定集主张详尽铺陈 | 档案规则偏好留白 | 拉扯 | 偏向档案规则',
  'TENSION: 场景推进 | 大纲卡要求强情节 | 档案规则要求慢节奏 | 冗余 | 保持现状',
].join('\n');

const EXPECTED_ROWS = [
  {
    entry: '描写密度',
    mdSide: '设定集主张详尽铺陈',
    profileSide: '档案规则偏好留白',
    nature: '拉扯',
    suggestion: '偏向档案规则',
  },
  {
    entry: '场景推进',
    mdSide: '大纲卡要求强情节',
    profileSide: '档案规则要求慢节奏',
    nature: '冗余',
    suggestion: '保持现状',
  },
];

// FG-03 只建 analyze describe；FG-04 将在同文件追加 gate/confirm describe（勿预建）
describe('POST /api/books/:bookId/fusion-gate/analyze（Task-03；可见降级钉）', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let bookId: string;
  let emptyBookId: string;
  const plannerCalls: CompletionRequest[] = [];
  let summarizeScript: NonNullable<MockScript['summarize']> = { text: TENSION_TEXT };

  // plannerProvider 缝形态沿 blueprint-suggest.test.ts:40-44：mock 包裹 + 记录调用
  const plannerProvider: LlmProvider = {
    async complete(req) {
      plannerCalls.push(req);
      return createMockProvider({ summarize: summarizeScript }).complete(req);
    },
  };

  beforeAll(async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkforge-fusion-gate-'));
    const config = loadConfig({
      STRATA_BASE_URL: 'http://127.0.0.1:47831/v1',
      STRATA_API_KEY: 'strata',
      STRATA_MODEL: 'iq3_xxs',
      INKFORGE_DATA_DIR: path.join(dir, 'srv'),
    });
    const db = openDb(path.join(config.dataDir, 'inkforge.db'));
    app = await buildApp({ config, provider: createDefaultMockProvider(), plannerProvider, db, inlineQueue: true });
    const created = await app.inject({
      method: 'POST',
      url: '/api/books',
      payload: { title: '张力对照测书', description: '描述：示例设定简介。', outline: '大纲：示例卷一。' },
    });
    bookId = (created.json() as { id: string }).id;
    const empty = await app.inject({ method: 'POST', url: '/api/books', payload: { title: '空书' } });
    emptyBookId = (empty.json() as { id: string }).id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('planner mock 输出两行合法协议 → 200 { rows 钉值, degraded: false }', async () => {
    summarizeScript = { text: TENSION_TEXT };
    const res = await app.inject({
      method: 'POST',
      url: `/api/books/${bookId}/fusion-gate/analyze`,
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ rows: EXPECTED_ROWS, degraded: false });
    const req = plannerCalls[plannerCalls.length - 1]!;
    expect(req.meta.step).toBe('summarize');
    expect(req.timeoutMs).toBe(120000);
    expect(req.user).toContain('【描述】描述：示例设定简介。');
  });

  it('planner mock 输出垃圾文 → 200 { rows: [], degraded: true, degradeReason 非空 }', async () => {
    summarizeScript = { text: '这是一段自由文本，没有任何 TENSION 协议行。' };
    const res = await app.inject({
      method: 'POST',
      url: `/api/books/${bookId}/fusion-gate/analyze`,
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { rows: unknown[]; degraded: boolean; degradeReason?: string };
    expect(body.rows).toEqual([]);
    expect(body.degraded).toBe(true);
    expect(body.degradeReason).toBeTruthy();
  });

  it('planner mock complete 抛错 → 200 degraded: true（不 500/不阻断）', async () => {
    summarizeScript = { error: 'http_500', afterMs: 0 };
    const res = await app.inject({
      method: 'POST',
      url: `/api/books/${bookId}/fusion-gate/analyze`,
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { rows: unknown[]; degraded: boolean; degradeReason?: string };
    expect(body.rows).toEqual([]);
    expect(body.degraded).toBe(true);
    expect(body.degradeReason).toBeTruthy();
  });

  it('无绑无候选空书 → 200 { rows: [], degraded: true }（无对照面即降级）', async () => {
    // 即便 mock 仍能产出合法行，无对照面也须诚实降级、不凭空造张力行
    summarizeScript = { text: TENSION_TEXT };
    const before = plannerCalls.length;
    const res = await app.inject({
      method: 'POST',
      url: `/api/books/${emptyBookId}/fusion-gate/analyze`,
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ rows: [], degraded: true });
    expect(plannerCalls.length).toBe(before);
  });
});

// ── FG-04：gate/confirm describe（追加；上方 FG-03 的 analyze describe 保留不动）──
// 夹具全部中性仿形自造，归档文件写临时 dataDir，禁读 apps/server/data/**、词表、v6 文本
const CARRIED_CHAR = '主角：沈真真，连锁公司业务员。';
const CARRIED_TRAIT = '黏人爽利、记账精。';
const PARTIAL_CARRIED = '临海市的雨夜与旧码头。';
const PARTIAL_RESIDUAL = '桥段以喜剧谈判收场。';
const UNCARRIED = '两种叙述声：占位规则甲。';
const PROFILE_A = 'profile-neutral-a';
const PROFILE_B = 'profile-neutral-b';

const ARCHIVE_MD = [
  '# 《门夹具》中性仿形',
  '',
  '> 定位一句话：中性占位叙述，供门三态回归。',
  '',
  '## 1. 人物圣经',
  CARRIED_CHAR,
  '### 1.1 群像',
  CARRIED_TRAIT,
  '',
  '## 2. 剧情大纲',
  PARTIAL_CARRIED,
  PARTIAL_RESIDUAL,
  '',
  '## 3. 文风规范',
  UNCARRIED,
].join('\n');
const ARCHIVE_DESCRIPTION = refineForDescription(ARCHIVE_MD);

const EXPECTED_ACLASS = [
  {
    heading: '1. 人物圣经',
    verdict: 'fully-carried',
    preset: 'strip',
    removable: true,
    strippableLines: [CARRIED_CHAR, CARRIED_TRAIT],
    residualLines: [],
    level: 2,
  },
  {
    heading: '2. 剧情大纲',
    verdict: 'partially-carried',
    preset: 'keep',
    removable: true,
    strippableLines: [PARTIAL_CARRIED],
    residualLines: [PARTIAL_RESIDUAL],
    level: 2,
  },
  {
    heading: '3. 文风规范',
    verdict: 'not-carried',
    preset: 'keep',
    removable: false,
    strippableLines: [],
    residualLines: [UNCARRIED],
    level: 2,
  },
];

describe('GET/POST /api/books/:bookId/fusion-gate（Task-04；指纹三态 + 单事务批量写）', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let db: ReturnType<typeof openDb>;
  let bookId: string;
  let plainBookId: string;
  let preview = '';

  beforeAll(async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkforge-fusion-confirm-'));
    const config = loadConfig({
      STRATA_BASE_URL: 'http://127.0.0.1:47831/v1',
      STRATA_API_KEY: 'strata',
      STRATA_MODEL: 'iq3_xxs',
      INKFORGE_DATA_DIR: path.join(dir, 'srv'),
    });
    db = openDb(path.join(config.dataDir, 'inkforge.db'));
    app = await buildApp({ config, provider: createDefaultMockProvider(), db, inlineQueue: true });

    const created = await app.inject({
      method: 'POST',
      url: '/api/books',
      payload: {
        title: '门夹具书',
        description: ARCHIVE_DESCRIPTION,
        outline: PARTIAL_CARRIED,
        characters: [{ name: '沈真真', baseSetting: `${CARRIED_CHAR} ${CARRIED_TRAIT}` }],
      },
    });
    bookId = (created.json() as { id: string }).id;
    const importDir = path.join(config.dataDir, 'imports');
    fs.mkdirSync(importDir, { recursive: true });
    fs.writeFileSync(path.join(importDir, `${bookId}-settings.md`), ARCHIVE_MD, 'utf8');

    const plain = await app.inject({ method: 'POST', url: '/api/books', payload: { title: '素书', description: '素书简介。' } });
    plainBookId = (plain.json() as { id: string }).id;

    // 中性风格档案 + 留存原文 + 绑定（权重 60/40，供 suppress 后改 weights 重弹用例）
    const now = new Date().toISOString();
    for (const id of [PROFILE_A, PROFILE_B]) {
      db.prepare('INSERT INTO style_profiles(id,name,source_path,source_hash,version,rules_json,samples_json,metrics_json,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run(
        id, `中性档案-${id}`, 'fixture://neutral', `hash-${id}`, 1,
        JSON.stringify({ rulesText: '中性占位规则文本。' }), '[]', '{}', now,
      );
      db.prepare('INSERT INTO style_sources(id,source_hash,name,text,created_at) VALUES(?,?,?,?,?)').run(
        `src-${id}`, `hash-${id}`, `中性原文-${id}`, '中性占位规则文本。', now,
      );
    }
    booksRepo.setBookStyleBinding(db, bookId, {
      primaryProfileId: PROFILE_A,
      auxProfileIds: [PROFILE_B],
      dimsSource: {},
      weights: { [PROFILE_A]: 60, [PROFILE_B]: 40 },
    }, '{}');
  });

  afterAll(async () => {
    await app.close();
  });

  const gate = (id: string) => app.inject({ method: 'GET', url: `/api/books/${id}/fusion-gate` });
  const confirm = (id: string, payload: Record<string, unknown>) =>
    app.inject({ method: 'POST', url: `/api/books/${id}/fusion-gate/confirm`, payload });

  it('GET 首次（无 gen_gate 记录）→ action show、aClass 按夹具钉值（一 fully/一 partial/一 not）、headWindowWarn 钉', async () => {
    const res = await gate(bookId);
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      action: string; aClass: typeof EXPECTED_ACLASS; previewDescription: string; headWindowWarn: boolean; hasArchive: boolean;
    };
    expect(body.action).toBe('show');
    expect(body.hasArchive).toBe(true);
    expect(body.aClass).toEqual(EXPECTED_ACLASS);
    expect(body.headWindowWarn).toBe(true);
    preview = body.previewDescription;
    expect(preview).not.toContain(CARRIED_TRAIT);
    expect(preview).not.toContain(CARRIED_CHAR);
    expect(preview).toContain('1.1 群像'); // 主审对码修正②：嵌套子标题=段锚恒保留，其下承载行仍剥
    expect(preview).toContain(PARTIAL_RESIDUAL);
  });

  it('取消路径：GET show 后不 confirm 直接再 GET → 仍 show（零写零指纹）', async () => {
    expect(booksRepo.parseGenGate(booksRepo.getBook(db, bookId)!.genGateJson)).toBeNull();
    const res = await gate(bookId);
    expect(res.json()).toMatchObject({ action: 'show' });
    expect(booksRepo.parseGenGate(booksRepo.getBook(db, bookId)!.genGateJson)).toBeNull();
  });

  it('故障注入：styleBinding.primaryProfileId 不存在 → 400、description 未变（事务回滚）、gen_gate 未记、再 GET 仍 show', async () => {
    const before = booksRepo.getBook(db, bookId)!;
    const res = await confirm(bookId, {
      description: '故障注入应先被回滚',
      styleBinding: { primaryProfileId: '不存在', auxProfileIds: [], dimsSource: {}, weights: { '不存在': 100 } },
    });
    expect(res.statusCode).toBe(400);
    const after = booksRepo.getBook(db, bookId)!;
    expect(after.description).toBe(before.description);
    expect(booksRepo.parseGenGate(after.genGateJson)).toBeNull();
    expect((await gate(bookId)).json()).toMatchObject({ action: 'show' });
  });

  it('confirm 全「保持」（body 仅 {}）→ 200 各 skipped、库内 description/绑定逐字节不变、指纹已记 → 再 GET pass', async () => {
    const before = booksRepo.getBook(db, bookId)!;
    const bindingBefore = booksRepo.getBookStyleBinding(db, bookId);
    const res = await confirm(bookId, {});
    expect(res.statusCode).toBe(200);
    expect((res.json() as { results: Record<string, unknown> }).results).toMatchObject({
      description: 'skipped',
      styleBinding: 'skipped',
      plotProfileId: 'skipped',
      spectrumProfileId: 'skipped',
      imitationProfileId: 'skipped',
      suppressed: false,
      fingerprintStored: true,
    });
    const after = booksRepo.getBook(db, bookId)!;
    expect(after.description).toBe(before.description);
    expect(booksRepo.getBookStyleBinding(db, bookId)).toEqual(bindingBefore);
    expect(booksRepo.parseGenGate(after.genGateJson)).not.toBeNull();
    expect((await gate(bookId)).json()).toMatchObject({ action: 'pass' });
  });

  it('confirm 200 后不调 runs 端点 → 库内无 run 行（入队归前端）', async () => {
    const res = await confirm(bookId, {});
    expect(res.statusCode).toBe(200);
    const row = db.prepare('SELECT COUNT(*) AS n FROM runs WHERE book_id = ?').get(bookId) as { n: number };
    expect(row.n).toBe(0);
  });

  it('confirm 带剥节 description → description 生效；characters/outline/伏笔/chapters/landingMandate 逐字节不变（N1/R6）', async () => {
    const before = booksRepo.getBook(db, bookId)!;
    const charsBefore = booksRepo.listCharacters(db, bookId);
    const foresBefore = continuityRepo.listForeshadowings(db, bookId);
    const chaptersBefore = chaptersRepo.listChapters(db, bookId);
    const res = await confirm(bookId, { description: preview });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { results: { description: string } }).results.description).toBe('applied');
    const after = booksRepo.getBook(db, bookId)!;
    expect(after.description).toBe(preview);
    expect(after.description).not.toBe(before.description);
    expect(booksRepo.listCharacters(db, bookId)).toEqual(charsBefore);
    expect(after.outline).toBe(before.outline);
    expect(continuityRepo.listForeshadowings(db, bookId)).toEqual(foresBefore);
    expect(chaptersRepo.listChapters(db, bookId)).toEqual(chaptersBefore);
    expect(after.landingMandateJson).toBe(before.landingMandateJson);
  });

  it('confirm { suppress: true } → gen_gate suppressed:true + 指纹 → GET pass；改 weights → GET show（三态闭环）', async () => {
    const res = await confirm(bookId, { suppress: true });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { results: Record<string, unknown> }).results).toMatchObject({ suppressed: true, fingerprintStored: true });
    expect(booksRepo.parseGenGate(booksRepo.getBook(db, bookId)!.genGateJson)?.suppressed).toBe(true);
    expect((await gate(bookId)).json()).toMatchObject({ action: 'pass' });

    const put = await app.inject({
      method: 'PUT',
      url: `/api/books/${bookId}/style`,
      payload: {
        primaryProfileId: PROFILE_A,
        auxProfileIds: [PROFILE_B],
        dimsSource: {},
        weights: { [PROFILE_A]: 50, [PROFILE_B]: 50 },
      },
    });
    expect(put.statusCode).toBe(200);
    expect((await gate(bookId)).json()).toMatchObject({ action: 'show' });
  });

  it('素书 GET → hasArchive:false、aClass:[]、action show（无归档书也过门）', async () => {
    const res = await gate(plainBookId);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ action: 'show', hasArchive: false, aClass: [] });
  });

  it('gen_gate_json 被外部写坏（直 SQL 置 not-json）→ GET 不抛、按无记录 show（容错钉）', async () => {
    db.prepare("UPDATE books SET gen_gate_json = 'not-json' WHERE id = ?").run(plainBookId);
    const res = await gate(plainBookId);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ action: 'show' });
  });
});
