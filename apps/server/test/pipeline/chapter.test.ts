import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config';
import { migrate } from '../../src/db/migrate';
import { openDb, type Database } from '../../src/db/open';
import { createBook } from '../../src/db/repositories/books';
import { appendChapterVersion, getChapter, getCurrentVersion, listVersions, setCurrentVersion } from '../../src/db/repositories/chapters';
import { listSteps } from '../../src/db/repositories/runs';
import { createDefaultMockProvider, createMockProvider } from '../../src/llm/mock';
import type { RunEvent } from '@inkforge/shared';
import { runChapterPipeline } from '../../src/pipeline/chapter';
import type { CompletionRequest, LlmProvider } from '../../src/llm/types';

const config = loadConfig({
  STRATA_BASE_URL: 'http://127.0.0.1:47831/v1',
  STRATA_API_KEY: 'strata',
  STRATA_MODEL: 'iq3_xxs',
});

let db: Database;
let dir: string;
let bookId: string;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkforge-pipe-'));
  db = openDb(path.join(dir, 't.db'));
  migrate(db);
  bookId = createBook(db, { title: '管线测试书', description: '这是一个修真世界的测试设定。' }).id;
  for (let i = 1; i <= 3; i++) {
    db.prepare(
      "INSERT INTO chapters(id, book_id, chapter_no, title, blueprint_json, target_chars, created_at) VALUES(?,?,?,?,?,?,?)",
    ).run(
      `ch${i}`,
      bookId,
      i,
      `第${i}章`,
      JSON.stringify({ goal: `推进到第${i}章`, beats: [], mustHaveBeats: [], bannedTopics: [] }),
      500,
      new Date().toISOString(),
    );
  }
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

function freshRun(chapterNo: number): string {
  const run = db.prepare("INSERT INTO runs(id, book_id, mode, chapter_scope_json, created_at) VALUES(?,?, 'generate', ?, ?)").run(
    `run-${Math.random().toString(36).slice(2)}`,
    bookId,
    JSON.stringify({ from: chapterNo, to: chapterNo }),
    new Date().toISOString(),
  );
  void run;
  return (db.prepare('SELECT id FROM runs ORDER BY created_at DESC, rowid DESC LIMIT 1').get() as { id: string }).id;
}

function chapterIdOf(no: number): string {
  return (db.prepare('SELECT id FROM chapters WHERE book_id = ? AND chapter_no = ?').get(bookId, no) as { id: string }).id;
}

describe('runChapterPipeline', () => {
  it('场景一 happy（maxRounds=1）：done rounds=0，draft/qc/finalize 全 done，事件首 running 末 done', async () => {
    const runId = freshRun(1);
    db.prepare('UPDATE runs SET max_rounds = 1 WHERE id = ?').run(runId);
    const events: RunEvent[] = [];
    const outcome = await runChapterPipeline(
      { db, provider: createDefaultMockProvider(), config, emit: (e) => events.push(e) },
      { runId, bookId, chapterNo: 1 },
    );
    expect(outcome).toMatchObject({ status: 'done', rounds: 0 });
    expect(outcome.finalVersionId).toBeDefined();
    const steps = listSteps(db, runId);
    expect(steps.map((s) => `${s.step}:${s.status}`)).toEqual(['draft:done', 'qc:done', 'summarize:done', 'finalize:done']);
    expect(events[0]).toMatchObject({ type: 'run.status', status: 'running' });
    expect(events[events.length - 1]).toMatchObject({ type: 'run.status', status: 'done' });
    const ch = getChapter(db, bookId, 1)!;
    expect(ch.status).toBe('done');
    expect(getCurrentVersion(db, ch.id)!.wordCount).toBe(500);
  }, 30000);

  it('场景二 一轮重写：qc 首轮 blocker 次轮 9 → versions=[draft,revised] rounds=1 done', async () => {
    const runId = freshRun(2);
    db.prepare('UPDATE runs SET max_rounds = 2 WHERE id = ?').run(runId);
    const blockerQc = `OVERALL: 7
---
SEVERITY: blocker
DIMENSION: 设定一致
QUOTE: 【章
COMMENT: 引文锚定测试块（blocker）`;
    const goodQc = `OVERALL: 9`;
    const provider = createMockProvider({
      draft: { textFn: (m) => `【章${m.chapterNo}改】独有开头。` + '线'.repeat(480) },
      qc: { sequence: [{ text: blockerQc }, { repeat: { text: goodQc } }] },
      rewrite: { textFn: (m) => `【章${m.chapterNo}修】重写后开头。` + '改'.repeat(480) },
      summarize: { text: 'SUMMARY: 第2章推进完成。\nBEATS:\n- 完成\nTHREADS:\nSTATE:' },
    });
    const outcome = await runChapterPipeline({ db, provider, config, emit: () => {} }, { runId, bookId, chapterNo: 2 });
    expect(outcome.status).toBe('done');
    expect(outcome.rounds).toBe(1);
    const chId = chapterIdOf(2);
    const versions = listVersions(db, chId);
    expect(versions.map((v) => v.kind)).toEqual(['revised', 'draft']);
    expect(outcome.finalVersionId).toBe(versions[0].id);
    expect(getChapter(db, bookId, 2)!.status).toBe('done');
    const steps = listSteps(db, runId);
    expect(steps.map((s) => s.step)).toEqual(['draft', 'qc', 'rewrite', 'qc', 'summarize', 'finalize']);
  }, 30000);

  it('场景三 永不通过（maxRounds=1）：needs_human rounds=1，状态 needs_human', async () => {
    const runId = freshRun(3);
    db.prepare('UPDATE runs SET max_rounds = 1 WHERE id = ?').run(runId);
    const blockerQc = `OVERALL: 5
---
SEVERITY: blocker
DIMENSION: 设定一致
QUOTE: 【章
COMMENT: 恒定 blocker`;
    const provider = createMockProvider({
      draft: { textFn: (m) => `【章${m.chapterNo}三】开头。` + '三'.repeat(480) },
      qc: { repeat: { text: blockerQc } },
      rewrite: { textFn: (m) => `【章${m.chapterNo}三】开头。` + '三'.repeat(480) },
      summarize: { text: 'SUMMARY: 第3章停滞。\nBEATS:\nTHREADS:\nSTATE:' },
    });
    const outcome = await runChapterPipeline({ db, provider, config, emit: () => {} }, { runId, bookId, chapterNo: 3 });
    expect(outcome.status).toBe('needs_human');
    expect(outcome.rounds).toBe(1);
    expect(getChapter(db, bookId, 3)!.status).toBe('needs_human');
    const steps = listSteps(db, runId);
    expect(steps.map((s) => s.step)).toEqual(['draft', 'qc', 'rewrite', 'qc', 'summarize', 'finalize']); // 裁决 B：needs_human 走 summarize→finalize 公共路径（D3）
    // 计划原文"current version=draft"与"相等取新"规则冲突：重写内容与原稿相同时按取新规则取 revised（内容等价），此处断言等价性
    const cur = getCurrentVersion(db, chapterIdOf(3))!;
    const draftV = versionsByKind(chapterIdOf(3), 'draft');
    expect(cur.content).toBe(draftV.content);
  }, 30000);

  it('场景四 draft 流式中止 → failed、draft step failed 且 error 含 AbortError', async () => {
    const runId = freshRun(1);
    const ac = new AbortController();
    const provider = createMockProvider({ draft: { text: '很长的正文。'.repeat(80), chunks: 40, chunkDelayMs: 20 } });
    setTimeout(() => ac.abort(), 80);
    await expect(
      runChapterPipeline({ db, provider, config, emit: () => {} }, { runId, bookId, chapterNo: 1, signal: ac.signal }),
    ).rejects.toThrowError(/aborted/i);
    const draftStep = listSteps(db, runId).find((s) => s.step === 'draft')!;
    expect(draftStep.status).toBe('failed');
    expect(draftStep.error).toContain('aborted');
  }, 30000);

  it('场景五 prompt 稳定性：同输入两次运行 → draft prompt_hash 相等', async () => {
    const runIdA = freshRun(1);
    const runIdB = freshRun(1);
    const provider = createDefaultMockProvider();
    await runChapterPipeline({ db, provider, config, emit: () => {} }, { runId: runIdA, bookId, chapterNo: 1 });
    const hashA = listSteps(db, runIdA).find((s) => s.step === 'draft')!.outputVersionId!;
    await runChapterPipeline({ db, provider, config, emit: () => {} }, { runId: runIdB, bookId, chapterNo: 1 });
    const hashB = listSteps(db, runIdB).find((s) => s.step === 'draft')!.outputVersionId!;
    const vA = (db.prepare('SELECT prompt_hash FROM chapter_versions WHERE id = ?').get(hashA) as { prompt_hash: string }).prompt_hash;
    const vB = (db.prepare('SELECT prompt_hash FROM chapter_versions WHERE id = ?').get(hashB) as { prompt_hash: string }).prompt_hash;
    expect(vA).toBe(vB);
    expect(vA).toBeTruthy();
  }, 30000);
});

function versionsByKind(chapterId: string, kind: string): { content: string } {
  const rows = db.prepare('SELECT content FROM chapter_versions WHERE chapter_id = ? AND kind = ? ORDER BY rowid DESC').all(chapterId, kind) as Array<{ content: string }>;
  return rows[0];
}

// 静默 unused 警告（appendChapterVersion/setCurrentVersion 供后续 T20 使用）
void appendChapterVersion;
void setCurrentVersion;

describe('B1 风格注入接线（T7B）', () => {
  function boundProfileBook(tag: string): string {
    const id = createBook(db, { title: `注入接线测试书 ${tag}`, description: '这是一个修真世界的注入测试设定。' }).id;
    db.prepare(
      "INSERT INTO chapters(id, book_id, chapter_no, title, blueprint_json, target_chars, created_at) VALUES(?,?,?,?,?,?,?)",
    ).run(
      `inj-ch-${tag}`,
      id,
      1,
      '第1章',
      JSON.stringify({ goal: '推进注入测试', beats: [], mustHaveBeats: [], bannedTopics: [] }),
      500,
      new Date().toISOString(),
    );
    const dims = { 节奏: '场景从容，少跳切', 对话: '对话稀疏', 描写: '白描为主', 情感基调: '克制', 写作特点: '短句为主', 特色词汇: '冷僻字少', 章节结构: '单层推进' };
    const axes = { 叙述温度: 20, 语言密度: 80, 叙述者姿态: 50, 节奏: 50, 幽默: 50, 情绪表达: 50 };
    db.prepare(
      'INSERT INTO style_profiles(id, name, source_path, source_hash, version, rules_json, samples_json, metrics_json, created_at) VALUES(?,?,?,?,?,?,?,?,?)',
    ).run(
      `inj-profile-${tag}`,
      '注入档案',
      'src/inj.txt',
      `injhash-${tag}`,
      1,
      JSON.stringify({ rulesText: '短句为主，克制抒情。', dims, axes }),
      JSON.stringify([{ id: 's1', text: '范例片段：他推开门，雨停了。' }]),
      JSON.stringify({}),
      new Date().toISOString(),
    );
    db.prepare('UPDATE books SET style_profile_id = ? WHERE id = ?').run(`inj-profile-${tag}`, id);
    return id;
  }

  function runFor(bid: string): string {
    db.prepare("INSERT INTO runs(id, book_id, mode, chapter_scope_json, max_rounds, created_at) VALUES(?,?, 'generate', ?, 2, ?)").run(
      `run-${Math.random().toString(36).slice(2)}`,
      bid,
      JSON.stringify({ from: 1, to: 1 }),
      new Date().toISOString(),
    );
    return (db.prepare('SELECT id FROM runs ORDER BY created_at DESC, rowid DESC LIMIT 1').get() as { id: string }).id;
  }

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

  it('绑定档案：draft system 含七维画像与六轴低带映射句；fewShot 不再产出空【文风规则】头', async () => {
    const bid = boundProfileBook('a');
    const runId = runFor(bid);
    const cap = capturing(createDefaultMockProvider());
    const outcome = await runChapterPipeline({ db, provider: cap.provider, config, emit: () => {} }, { runId, bookId: bid, chapterNo: 1 });
    expect(outcome.status).toBe('done');
    const draft = cap.calls.find((c) => c.step === 'draft')!;
    // stable 槽进 system（不进 user）：断言抓 system
    expect(draft.system).toContain('【文风画像】');
    expect(draft.system).toContain('· 节奏：场景从容，少跳切');
    expect(draft.system).toContain('【六轴锚点】');
    expect(draft.system).toContain('叙述温度：叙述温度偏冷');
    expect(draft.system).toContain('（值 20）');
    expect(draft.system).not.toContain('幽默：');
    expect(draft.user).toContain('【范例片段】');
    expect(draft.user).not.toContain('【文风规则】');
  }, 30000);

  it('重写轮（targeted）：rewrite system 含 styleRules 精简槽，且不带七维画像槽', async () => {
    const bid = boundProfileBook('b');
    const runId = runFor(bid);
    const majorQc = `OVERALL: 6
---
SEVERITY: major
DIMENSION: 节奏
QUOTE: 【章
COMMENT: 节奏拖沓，需压缩。`;
    const inner = createMockProvider({
      draft: { textFn: (m) => `【章${m.chapterNo}修】独有开头。` + '线'.repeat(480) },
      qc: { sequence: [{ text: majorQc }, { repeat: { text: 'OVERALL: 9' } }] },
      rewrite: { textFn: (m) => `【章${m.chapterNo}改】重写开头。` + '改'.repeat(480) },
      summarize: { text: 'SUMMARY: 第1章推进完成。\nBEATS:\n- 完成\nTHREADS:\nSTATE:' },
    });
    const cap = capturing(inner);
    const outcome = await runChapterPipeline({ db, provider: cap.provider, config, emit: () => {} }, { runId, bookId: bid, chapterNo: 1 });
    expect(outcome.rounds).toBeGreaterThanOrEqual(1);
    const rw = cap.calls.find((c) => c.step === 'rewrite')!;
    expect(rw.system).toContain('短句为主，克制抒情。');
    expect(rw.system).not.toContain('【文风画像】');
  }, 30000);
});

describe('B3 入库分阈值 app_meta 覆盖（章级生效）', () => {
  function bookWithChapter(tag: string): string {
    const id = createBook(db, { title: `阈值测试书 ${tag}` }).id;
    db.prepare('INSERT INTO chapters(id, book_id, chapter_no, title, blueprint_json, target_chars, created_at) VALUES(?,?,?,?,?,?,?)').run(
      `th-ch-${tag}`,
      id,
      1,
      '第1章',
      JSON.stringify({ goal: '阈值场景', beats: [], mustHaveBeats: [], bannedTopics: [] }),
      500,
      new Date().toISOString(),
    );
    return id;
  }

  function newRun(bid: string): string {
    const runId = `run-${Math.random().toString(36).slice(2)}`;
    db.prepare("INSERT INTO runs(id, book_id, mode, max_rounds, chapter_scope_json, created_at) VALUES(?,?, 'generate', 2, ?, ?)").run(
      runId,
      bid,
      JSON.stringify({ from: 1, to: 1 }),
      new Date().toISOString(),
    );
    return runId;
  }

  function providerOverall8(): LlmProvider {
    return createMockProvider({
      draft: { textFn: (m) => `【章${m.chapterNo}阈】独有开头。` + '阈'.repeat(480) },
      qc: { repeat: { text: 'OVERALL: 8' } },
      rewrite: { textFn: (m) => `【章${m.chapterNo}阈】重写后。` + '改'.repeat(480) },
      summarize: { text: 'SUMMARY: 第1章完成。\nBEATS:\n- 完成\nTHREADS:\nSTATE:' },
    });
  }

  function setThreshold(v: string | null): void {
    if (v === null) db.prepare("DELETE FROM app_meta WHERE key = 'quality_score_threshold'").run();
    else
      db
        .prepare("INSERT INTO app_meta(key, value) VALUES('quality_score_threshold', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
        .run(v);
  }

  async function firstQcGate(tag: string): Promise<{ action: string; reasons: string[] }> {
    const bid = bookWithChapter(tag);
    const runId = newRun(bid);
    await runChapterPipeline({ db, provider: providerOverall8(), config, emit: () => {} }, { runId, bookId: bid, chapterNo: 1 });
    const qc1 = listSteps(db, runId).find((s) => s.step === 'qc' && s.attempt === 1)!;
    return (qc1.outputJson as { gate: { action: string; reasons: string[] } }).gate;
  }

  it('overall 8 遇入库阈值 9 → 第一轮 qc 判 rewrite（reasons 含「< 9」）；未覆盖时同场景判 pass', async () => {
    try {
      setThreshold('9');
      const overridden = await firstQcGate('a');
      expect(overridden.action).toBe('rewrite');
      expect(overridden.reasons.some((r) => r.includes('< 9'))).toBe(true);
      setThreshold(null);
      const defaulted = await firstQcGate('b');
      expect(defaulted.action).toBe('pass');
    } finally {
      setThreshold(null);
    }
  }, 60000);
});
