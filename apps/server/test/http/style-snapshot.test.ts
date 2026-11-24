import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config';
import { buildApp } from '../../src/app';
import { createMockProvider, makeMockDraft } from '../../src/llm/mock';
import { openDb, type Database } from '../../src/db/open';
import { saveStyleProfile } from '../../src/style/analysis';
import { runChapterPipeline } from '../../src/pipeline/chapter';
import type { LlmProvider } from '../../src/llm/types';
import type { StyleAnalysisDto } from '@inkforge/shared';
import { STYLE_AXES, STYLE_DIMENSIONS } from '@inkforge/shared';

const ANALYSIS_TEXT = `DIM: 结构与节奏: 短句为主。
AXIS: 叙述温度: 60
RULES: 平均句长 10-20 字。`;

const config = loadConfig({ STRATA_BASE_URL: 'http://127.0.0.1:47831/v1', STRATA_API_KEY: 'strata', STRATA_MODEL: 'iq3_xxs' });

let dir: string;
let db: Database;
let app: Awaited<ReturnType<typeof buildApp>>;
let bookId: string;

const emptyAnalysis = (rules: string[]): StyleAnalysisDto => ({
  dims: Object.fromEntries(STYLE_DIMENSIONS.map((d) => [d, ''])) as StyleAnalysisDto['dims'],
  axes: Object.fromEntries(STYLE_AXES.map((a) => [a, 0])) as StyleAnalysisDto['axes'],
  rules,
});

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkforge-snapshot-'));
  const cfg = loadConfig({ STRATA_BASE_URL: 'http://127.0.0.1:47831/v1', STRATA_API_KEY: 'strata', STRATA_MODEL: 'iq3_xxs', INKFORGE_DATA_DIR: dir });
  db = openDb(path.join(cfg.dataDir, 'inkforge.db'));
  app = await buildApp({
    config: cfg,
    provider: createMockProvider({ draft: { text: 'x' }, qc: { text: '' }, summarize: { text: 'y' } }),
    summarizerProvider: createMockProvider({ summarize: { text: ANALYSIS_TEXT } }),
    db,
    inlineQueue: true,
  });
  const created = await app.inject({ method: 'POST', url: '/api/books', payload: { title: '快照测书' } });
  bookId = (created.json() as { id: string }).id;
  db.prepare(
    "INSERT INTO chapters(id, book_id, chapter_no, title, blueprint_json, target_chars, created_at) VALUES(?,?,?,?,?,?,?)",
  ).run('sch1', bookId, 1, '第1章', JSON.stringify({ goal: '第1章目标', beats: [], mustHaveBeats: [], bannedTopics: [] }), 500, new Date().toISOString());
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

describe('B7 persona 快照 + 版本视图', () => {
  it('绑定写快照（profileId/version/boundAt/rules/samples）；解绑清引用与快照；未知档案 404', async () => {
    const { id: pid } = saveStyleProfile(db, { name: '快照档案', source: `${'源文本甲'.repeat(100)}`, analysis: emptyAnalysis(['快照规则v1标记']), samples: [{ id: 's0', text: '样本文本甲' }] });
    const bind = await app.inject({ method: 'PUT', url: `/api/books/${bookId}/style`, payload: { profileId: pid } });
    expect(bind.statusCode).toBe(200);

    const b1 = (await app.inject({ method: 'GET', url: `/api/books/${bookId}` })).json() as { styleProfileId: string; styleSnapshotJson: string };
    expect(b1.styleProfileId).toBe(pid);
    const snap = JSON.parse(b1.styleSnapshotJson) as {
      v: number;
      primaryProfileId: string;
      boundAt: string;
      profiles: Record<string, { version: number; rulesText: string; samples: Array<{ id: string; text: string }> }>;
    };
    expect(snap.v).toBe(2);
    expect(snap.primaryProfileId).toBe(pid);
    expect(snap.boundAt).toBeTruthy();
    expect(snap.profiles[pid].version).toBe(1);
    expect(snap.profiles[pid].rulesText).toBe('快照规则v1标记');
    expect(snap.profiles[pid].samples[0].text).toBe('样本文本甲');

    const unbind = await app.inject({ method: 'PUT', url: `/api/books/${bookId}/style`, payload: { profileId: null } });
    expect(unbind.statusCode).toBe(200);
    const b2 = (await app.inject({ method: 'GET', url: `/api/books/${bookId}` })).json() as { styleProfileId: string | null; styleSnapshotJson: string | null };
    expect(b2.styleProfileId).toBeNull();
    expect(b2.styleSnapshotJson).toBeNull();

    const miss = await app.inject({ method: 'PUT', url: `/api/books/${bookId}/style`, payload: { profileId: 'no-such' } });
    expect(miss.statusCode).toBe(404);
  });

  it('档案升版后快照仍锚绑定版内容；versions 列同 hash 全版本升序；未知档案 404', async () => {
    const src = '版本档案独有源文本'.repeat(60);
    const { id: pid1, version: v1 } = saveStyleProfile(db, { name: '版本档案', source: src, analysis: emptyAnalysis(['版本一规则']), samples: [{ id: 's0', text: '样本一' }] });
    const { id: pid2, version: v2 } = saveStyleProfile(db, { name: '版本档案', source: src, analysis: emptyAnalysis(['版本二规则']), samples: [{ id: 's0', text: '样本一' }] });
    expect(v2).toBe(v1 + 1);

    await app.inject({ method: 'PUT', url: `/api/books/${bookId}/style`, payload: { profileId: pid1 } });
    const snap = JSON.parse(
      ((await app.inject({ method: 'GET', url: `/api/books/${bookId}` })).json() as { styleSnapshotJson: string }).styleSnapshotJson,
    ) as { v: number; primaryProfileId: string; profiles: Record<string, { version: number; rulesText: string }> };
    expect(snap.v).toBe(2);
    expect(snap.primaryProfileId).toBe(pid1);
    expect(snap.profiles[pid1].version).toBe(v1);
    expect(snap.profiles[pid1].rulesText).toContain('版本一规则');

    const versions = await app.inject({ method: 'GET', url: `/api/style-profiles/${pid1}/versions` });
    expect(versions.statusCode).toBe(200);
    const rows = versions.json() as Array<{ id: string; version: number; name: string }>;
    expect(rows.map((r) => r.version)).toEqual([v1, v2]);
    expect(new Set(rows.map((r) => r.id))).toEqual(new Set([pid1, pid2]));
    const miss = await app.inject({ method: 'GET', url: '/api/style-profiles/no-such/versions' });
    expect(miss.statusCode).toBe(404);
    await app.inject({ method: 'PUT', url: `/api/books/${bookId}/style`, payload: { profileId: null } });
  });

  it('generate 读快照优先：档案已升版，draft prompt 注入快照版规则而非档案现值', async () => {
    const src = '快照优先档案独有源文本'.repeat(60);
    const { id: pid1 } = saveStyleProfile(db, { name: '快照优先档案', source: src, analysis: emptyAnalysis(['快照v1注入标记']), samples: [{ id: 's0', text: '快照样本片段甲' }] });
    const { id: pid2 } = saveStyleProfile(db, { name: '快照优先档案', source: src, analysis: emptyAnalysis(['档案v2新规则']), samples: [{ id: 's0', text: '快照样本片段甲' }] });
    expect(pid2).not.toBe(pid1);
    await app.inject({ method: 'PUT', url: `/api/books/${bookId}/style`, payload: { profileId: pid1 } });

    const bookRow = db.prepare('SELECT style_profile_id, style_snapshot_json FROM books WHERE id = ?').get(bookId) as { style_profile_id: string; style_snapshot_json: string };
    console.log('[snap3-book]', JSON.stringify(bookRow).slice(0, 400));
    console.log('[snap3-pid1-rules]', (db.prepare('SELECT rules_json FROM style_profiles WHERE id = ?').get(pid1) as { rules_json: string }).rules_json);

    const captured: string[] = [];
    const capturing: LlmProvider = {
      complete: async (req) => {
        if (req.meta.step === 'draft') {
          captured.push(`${req.system}\n----\n${req.user}`); // styleRules 为 stable 槽进 system
          return { text: makeMockDraft(1), usage: { promptTokens: 0, completionTokens: 0 }, finishReason: 'stop' };
        }
        if (req.meta.step === 'qc') return { text: 'OVERALL: 9', usage: { promptTokens: 0, completionTokens: 0 }, finishReason: 'stop' };
        return { text: 'SUMMARY: 推进。\nBEATS:\nTHREADS:\nSTATE:', usage: { promptTokens: 0, completionTokens: 0 }, finishReason: 'stop' };
      },
    };
    db.prepare("INSERT INTO runs(id, book_id, mode, chapter_scope_json, created_at) VALUES(?,?, 'generate', ?, ?)").run(
      'snap-run-1',
      bookId,
      JSON.stringify({ from: 1, to: 1 }),
      new Date().toISOString(),
    );
    await runChapterPipeline({ db, provider: capturing, config, emit: () => {} }, { runId: 'snap-run-1', bookId, chapterNo: 1 });
    expect(captured.length).toBeGreaterThan(0);
    expect(captured[0]).toContain('快照v1注入标记'); // 快照优先
    expect(captured[0]).not.toContain('档案v2新规则');
  }, 30000);

  it('重蒸产生新 id 不刷新绑定快照；辅档案冻结内容独立', async () => {
    const src = '重蒸冻结源文本'.repeat(60);
    const { id: p1, version: v1 } = saveStyleProfile(db, { name: '重蒸档案', source: src, analysis: emptyAnalysis(['重蒸v1规则']), samples: [{ id: 's0', text: '重蒸样本一' }] });
    const bind = await app.inject({ method: 'PUT', url: `/api/books/${bookId}/style`, payload: { profileId: p1 } });
    expect(bind.statusCode).toBe(200);

    // 同 source 再存 → 新 id 新版本；绑定书快照不刷新
    const { id: p2 } = saveStyleProfile(db, { name: '重蒸档案', source: src, analysis: emptyAnalysis(['重蒸v2规则']), samples: [{ id: 's0', text: '重蒸样本二' }] });
    expect(p2).not.toBe(p1);

    const snap = JSON.parse(
      ((await app.inject({ method: 'GET', url: `/api/books/${bookId}` })).json() as { styleSnapshotJson: string }).styleSnapshotJson,
    ) as { v: number; primaryProfileId: string; profiles: Record<string, { version: number; rulesText: string }> };
    expect(snap.v).toBe(2);
    expect(snap.primaryProfileId).toBe(p1);
    expect(snap.profiles[p1].version).toBe(v1);
    expect(snap.profiles[p1].rulesText).toBe('重蒸v1规则');
    expect(snap.profiles[p2]).toBeUndefined(); // 新 id 不入快照

    await app.inject({ method: 'PUT', url: `/api/books/${bookId}/style`, payload: { profileId: null } });
  });
});
