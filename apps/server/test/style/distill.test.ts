import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from '../../src/db/migrate';
import { loadConfig } from '../../src/config';
import { openDb, type Database } from '../../src/db/open';
import { distillStyleProfile } from '../../src/style/distill';
import { createMockProvider } from '../../src/llm/mock';
import { runL0Checks } from '../../src/quality/l0';
import { loadCliches } from '../../src/quality/l0';

const RULES_TEXT = `RULES: 平均句长 10-20 字。
RULES: 对话占比 20%-40%。
RULES: 每段不超过 6 行。`;

let db: Database;
let dir: string;
let provider: ReturnType<typeof createMockProvider>;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkforge-style-'));
  db = openDb(path.join(dir, 't.db'));
  migrate(db);
  provider = createMockProvider({ summarize: { text: RULES_TEXT } });
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

function makeSourceFile(content: string): string {
  const p = path.join(dir, `src-${Math.random().toString(36).slice(2)}.txt`);
  fs.writeFileSync(p, content, 'utf8');
  return p;
}

describe('distillStyleProfile', () => {
  it('mock RULES 文样 → profile 落库 version=1；同源二次 → version=2 新行旧行逐字节不变', async () => {
    const src = makeSourceFile('正文样本'.repeat(100));
    const id1 = await distillStyleProfile({ db, provider }, { name: '档案A', sourcePath: src, samples: ['样本一', '样本二'] });
    const row1 = db.prepare('SELECT * FROM style_profiles WHERE id = ?').get(id1) as { version: number; rules_json: string };
    expect(row1.version).toBe(1);
    expect(JSON.parse(row1.rules_json).rulesText).toContain('平均句长');
    const snapshot1 = JSON.stringify(db.prepare('SELECT * FROM style_profiles WHERE id = ?').get(id1));
    const id2 = await distillStyleProfile({ db, provider }, { name: '档案A', sourcePath: src, samples: ['样本一'] });
    const row2 = db.prepare('SELECT * FROM style_profiles WHERE id = ?').get(id2) as { version: number };
    expect(id2).not.toBe(id1);
    expect(row2.version).toBe(2);
    expect(JSON.stringify(db.prepare('SELECT * FROM style_profiles WHERE id = ?').get(id1))).toBe(snapshot1); // 旧行逐字节不变
  });

  it('空源 → 抛错文案钉死「样本为空，禁止蒸馏」', async () => {
    const empty = makeSourceFile('   \n  ');
    await expect(distillStyleProfile({ db, provider }, { name: '空', sourcePath: empty, samples: [] })).rejects.toThrowError('样本为空，禁止蒸馏');
  });
});

describe('CLI 冒烟', () => {
  it('fixture distill → 打印 profileId；空源 exit 1', async () => {
    const { execSync } = await import('node:child_process');
    const fixture = path.resolve(process.cwd(), 'test/fixtures/style-sample.txt');
    const out = execSync(
      `node --import tsx src/style/cli.ts distill --source ${JSON.stringify(fixture)} --name 测试档案`,
      { cwd: process.cwd(), encoding: 'utf8', env: { ...process.env, INKFORGE_DATA_DIR: dir, STRATA_BASE_URL: 'http://x', STRATA_API_KEY: 'k', STRATA_MODEL: 'm', INKFORGE_MOCK: '1' } },
    );
    expect(out).toContain('profileId=');
    let exitCode = 0;
    try {
      execSync(`node --import tsx src/style/cli.ts distill --source ${JSON.stringify(makeSourceFile('  '))} --name 空`, {
        cwd: path.resolve(process.cwd(), '..'),
        encoding: 'utf8',
        env: { ...process.env, INKFORGE_DATA_DIR: dir, STRATA_BASE_URL: 'http://x', STRATA_API_KEY: 'k', STRATA_MODEL: 'm', INKFORGE_MOCK: '1' },
      });
    } catch (e) {
      exitCode = (e as { status?: number }).status ?? 1;
    }
    expect(exitCode).toBe(1);
  });
});

describe('管线风格注入断言', () => {
  it('绑定 profile 后 generate → style_sample_ids 长度 3；无绑定 → 无（挂机路径回归锚）', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkforge-style-e2e-'));
    try {
      const config2 = loadConfig({ STRATA_BASE_URL: 'http://x', STRATA_API_KEY: 'k', STRATA_MODEL: 'm', INKFORGE_DATA_DIR: dataDir, INKFORGE_MOCK: '1' });
      const { buildApp } = await import('../../src/app');
      const app = await buildApp({ config: config2, provider: createMockProvider({
        draft: { textFn: (m) => `【章${m.chapterNo}sty】风格稿。` + 's'.repeat(479) },
        qc: { text: 'OVERALL: 9' },
        rewrite: { text: 'OVERALL: 9' },
        summarize: { text: 'SUMMARY: 风格验证。' },
      }), inlineQueue: true });
      const created = await app.inject({ method: 'POST', url: '/api/books', payload: { title: '风格书' } });
      const bookId = (created.json() as { id: string }).id;
      const bp = { goal: 'g', beats: [], mustHaveBeats: [], bannedTopics: [] };
      await app.inject({ method: 'PUT', url: `/api/books/${bookId}/chapters/1/blueprint`, payload: { title: '章一', blueprint: bp, targetChars: 500 } });
      // 蒸馏档案并绑定（经 API 端点）
      const src = makeSourceFile('风格样本'.repeat(300));
      const profileId = await distillStyleProfile({ db: appDbFor(app, dataDir), provider: createMockProvider({ summarize: { text: RULES_TEXT } }) }, { name: '注入档案', sourcePath: src, samples: [{ id: 'a', text: '样一' }, { id: 'b', text: '样二' }, { id: 'c', text: '样三' }] });
      const bind = await app.inject({ method: 'PUT', url: `/api/books/${bookId}/style`, payload: { profileId } });
      expect(bind.statusCode).toBe(200);
      const badBind = await app.inject({ method: 'PUT', url: `/api/books/${bookId}/style`, payload: { profileId: 'no-such' } });
      expect(badBind.statusCode).toBe(404);
      // 生成
      const gen = await app.inject({ method: 'POST', url: `/api/books/${bookId}/chapters/1/generate`, payload: {} });
      const runId = (gen.json() as { runId: string }).runId;
      for (let i = 0; i < 100; i++) {
        await new Promise((r) => setTimeout(r, 100));
        const rr = await app.inject({ method: 'GET', url: `/api/runs/${runId}` });
        if ((rr.json() as { status: string }).status === 'done') break;
      }
      const versions = (await app.inject({ method: 'GET', url: `/api/books/${bookId}/chapters/1/versions` })).json() as {
        currentVersionId: string | null;
        versions: Array<{ styleSampleIds: string[] }>;
      };
      expect(versions.versions.some((v) => v.styleSampleIds.length === 3)).toBe(true);
      await app.close();
      // 无绑定回归锚：新书不绑档案 → 版本 styleSampleIds=[]
      const app2 = await buildApp({ config: loadConfig({ STRATA_BASE_URL: 'http://x', STRATA_API_KEY: 'k', STRATA_MODEL: 'm', INKFORGE_DATA_DIR: path.join(dataDir, 'no-style'), INKFORGE_MOCK: '1' }), provider: createMockProvider({ draft: { textFn: (m) => `【章${m.chapterNo}ns】无风格稿。` + 'n'.repeat(478) }, qc: { text: 'OVERALL: 9' }, rewrite: { text: 'OVERALL: 9' }, summarize: { text: 'SUMMARY: 无。' } }), inlineQueue: true });
      const created2 = await app2.inject({ method: 'POST', url: '/api/books', payload: { title: '无风格书' } });
      const bookId2 = (created2.json() as { id: string }).id;
      await app2.inject({ method: 'PUT', url: `/api/books/${bookId2}/chapters/1/blueprint`, payload: { title: '章一', blueprint: bp, targetChars: 500 } });
      const gen2 = await app2.inject({ method: 'POST', url: `/api/books/${bookId2}/chapters/1/generate`, payload: {} });
      const runId2 = (gen2.json() as { runId: string }).runId;
      for (let i = 0; i < 100; i++) {
        await new Promise((r) => setTimeout(r, 100));
        const rr = await app2.inject({ method: 'GET', url: `/api/runs/${runId2}` });
        if ((rr.json() as { status: string }).status === 'done') break;
      }
      const versions2 = (await app2.inject({ method: 'GET', url: `/api/books/${bookId2}/chapters/1/versions` })).json() as {
        currentVersionId: string | null;
        versions: Array<{ styleSampleIds: string[] }>;
      };
      expect(versions2.versions.every((v) => v.styleSampleIds.length === 0)).toBe(true);
      await app2.close();
    } finally {
      try {
        fs.rmSync(dataDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  }, 60000);
});

function appDbFor(app: unknown, dataDir: string): Database {
  void app;
  const d = openDb(path.join(dataDir, 'inkforge.db'));
  return d;
}

describe('l0 集成 voiceRefMetrics', () => {
  it('超带 → softMajors=1 且单凭它 gate 不触发（1<2）', () => {
    const cliches = loadCliches(path.resolve(process.cwd(), 'config/quality/cliches.default.txt'));
    const l0 = runL0Checks({
      draft: '短。'.repeat(5),
      targetChars: 100,
      prevTexts: [],
      blueprint: { goal: 'g', beats: [], mustHaveBeats: [], bannedTopics: [] },
      continuity: { characters: [] },
      voiceRefMetrics: { medianSentenceLen: 30, p90SentenceLen: 60, dialogueRatio: 0, uniqueCharRatio: 0 },
      cliches,
    });
    expect(l0.softMajors).toBe(1);
    expect(l0.checks.find((c) => c.name === 'style_drift')!.pass).toBe(false);
  });
});
