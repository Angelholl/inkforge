import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config';
import { migrate } from '../../src/db/migrate';
import { openDb, type Database } from '../../src/db/open';
import { createBook, setBookStyleProfile } from '../../src/db/repositories/books';
import { listSteps } from '../../src/db/repositories/runs';
import { createMockProvider, makeMockDraft } from '../../src/llm/mock';
import { runChapterPipeline } from '../../src/pipeline/chapter';
import type { StepName } from '@inkforge/shared';

const config = loadConfig({
  STRATA_BASE_URL: 'http://127.0.0.1:47831/v1',
  STRATA_API_KEY: 'strata',
  STRATA_MODEL: 'iq3_xxs',
});

let db: Database;
let dir: string;
let bookId: string;

const COPY_MARKER = '青云剑诀第七重天独此一份秘本万不可外传';

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkforge-gen-drift-'));
  db = openDb(path.join(dir, 't.db'));
  migrate(db);
  bookId = createBook(db, { title: '漂移抄用测书', description: '修真世界。' }).id;
  for (const no of [1, 2]) {
    db.prepare(
      "INSERT INTO chapters(id, book_id, chapter_no, title, blueprint_json, target_chars, created_at) VALUES(?,?,?,?,?,?,?)",
    ).run(`gch${no}`, bookId, no, `第${no}章`, JSON.stringify({ goal: `第${no}章目标`, beats: [], mustHaveBeats: [], bannedTopics: [] }), 500, new Date().toISOString());
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
    /* Windows 锁瞬态 */
  }
});

function freshRun(chapterNo: number): string {
  db.prepare("INSERT INTO runs(id, book_id, mode, chapter_scope_json, created_at) VALUES(?,?, 'generate', ?, ?)").run(
    `grun-${Math.random().toString(36).slice(2)}`,
    bookId,
    JSON.stringify({ from: chapterNo, to: chapterNo }),
    new Date().toISOString(),
  );
  return (db.prepare('SELECT id FROM runs ORDER BY created_at DESC, rowid DESC LIMIT 1').get() as { id: string }).id;
}

function l0Of(runId: string): { name: string; pass: boolean; details: string }[] {
  const qc = listSteps(db, runId).find((s) => s.step === ('qc' as StepName) && s.outputJson) as { outputJson: string } | undefined;
  const parsed = qc ? (JSON.parse(typeof qc.outputJson === 'string' ? qc.outputJson : JSON.stringify(qc.outputJson)) as { l0?: { checks: Array<{ name: string; pass: boolean; details: string }> } }) : undefined;
  if (!parsed?.l0) throw new Error('qc 步缺 l0 输出');
  return parsed.l0.checks;
}

describe('B6 generate 漂移+抄用接线', () => {
  it('绑定档案 → voiceRefMetrics=档案 metrics（极端中位句长触发 style_drift 超带；单软门不拦截 done）', async () => {
    // 直插档案行：metrics 精确控制——仅中位句长超带（p90/对话/去重均在带内或 0 基准跳过），单 softMajor 不触发重写
    const profileId = insertProfile('极端档案', [{ id: 's0', text: '普通样本一段，与草稿无关。'.repeat(5) }], {
      medianSentenceLen: 100,
      p90SentenceLen: 18,
      dialogueRatio: 0,
      uniqueCharRatio: 0,
    });
    setBookStyleProfile(db, bookId, profileId);

    const runId = freshRun(1);
    db.prepare('UPDATE runs SET max_rounds = 1 WHERE id = ?').run(runId);
    const outcome = await runChapterPipeline(
      { db, provider: createDefaultGenProvider(1), config, emit: () => {} },
      { runId, bookId, chapterNo: 1 },
    );
    const checks = l0Of(runId);
    expect(outcome.status).toBe('done'); // style_drift 为软门，单凭它不放行重写
    const drift = checks.find((c) => c.name === 'style_drift')!;
    expect(drift).toBeTruthy();
    expect(drift.pass).toBe(false); // mock 草稿中位 ≈13 vs 档案 100 → 超带
    expect(drift.details).toContain('base=100');
  }, 30000);

  it('绑定档案 → referenceTexts=注入 3 段样本：草稿含 ≥15 连续字重合 → plagiarism_ngram fail（硬门重写后 done）', async () => {
    const sampleText = `${COPY_MARKER}。其余为参考样本正文，供 few-shot 注入与抄用比对。`.repeat(3);
    const profileId = insertProfile('抄用档案', [{ id: 's0', text: sampleText }], {
      medianSentenceLen: 13,
      p90SentenceLen: 18,
      dialogueRatio: 0,
      uniqueCharRatio: 0.19,
    });
    setBookStyleProfile(db, bookId, profileId);

    const runId = freshRun(2);
    db.prepare('UPDATE runs SET max_rounds = 1 WHERE id = ?').run(runId);
    const outcome = await runChapterPipeline(
      { db, provider: createCopyProvider(2), config, emit: () => {} },
      { runId, bookId, chapterNo: 2 },
    );
    const checks = l0Of(runId);
    expect(outcome.status).toBe('done'); // 首轮 plagiarism 硬失败 → 重写（干净稿）→ 次轮 10 分过
    const plagiarism = checks.find((c) => c.name === 'plagiarism_ngram')!;
    expect(plagiarism).toBeTruthy();
    expect(plagiarism.pass).toBe(false);
    expect(plagiarism.details).toContain('≥15 连续字');
  }, 30000);
});

/** 直插 style_profiles 行（metrics_json 精确控制；rules/samples 为最小结构）。 */
function insertProfile(name: string, samples: Array<{ id: string; text: string }>, metrics: Record<string, number>): string {
  const id = `prof-${Math.random().toString(36).slice(2)}`;
  db.prepare(
    'INSERT INTO style_profiles(id, name, source_path, source_hash, version, rules_json, samples_json, metrics_json, created_at) VALUES(?,?,?,?,?,?,?,?,?)',
  ).run(
    id,
    name,
    'inline:test0001',
    `hash-${id}`,
    1,
    JSON.stringify({ rulesText: 'RULES: 测试规则。', dims: {}, axes: {} }),
    JSON.stringify(samples),
    JSON.stringify(metrics),
    new Date().toISOString(),
  );
  return id;
}

/** generate 默认 mock：draft 用 makeMockDraft（设计为过全长 L0）+ qc/summarize 绿文样。 */
function createDefaultGenProvider(chapterNo: number) {
  return createMockProvider({
    draft: { textFn: (m) => makeMockDraft(m.chapterNo ?? 1) },
    qc: { text: 'OVERALL: 9' },
    rewrite: { textFn: (m) => makeMockDraft(m.chapterNo ?? 1) },
    summarize: { text: `SUMMARY: 第${chapterNo}章推进。\nBEATS:\n- 完成\nTHREADS:\nSTATE:` },
  });
}

/** 抄用测 provider：makeMockDraft 中部插入参考样本 20 字标记（章尾专属句保持原位）；次轮 QC 10 分避免无改善停。 */
function createCopyProvider(chapterNo: number) {
  return createMockProvider({
    draft: {
      textFn: (m) => {
        const base = makeMockDraft(m.chapterNo ?? 1);
        const mid = Math.floor(base.length / 2);
        return base.slice(0, mid) + COPY_MARKER + base.slice(mid);
      },
    },
    qc: { sequence: [{ text: 'OVERALL: 8' }, { text: 'OVERALL: 10' }] },
    rewrite: { textFn: (m) => makeMockDraft(m.chapterNo ?? 1) },
    summarize: { text: `SUMMARY: 第${chapterNo}章推进。\nBEATS:\n- 完成\nTHREADS:\nSTATE:` },
  });
}
