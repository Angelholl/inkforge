import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config';
import { buildApp } from '../../src/app';
import { openDb, type Database } from '../../src/db/open';
import { createMockProvider } from '../../src/llm/mock';

const USER_ENV = 'INKFORGE_LANDING_WORDS_USER_PATH';
const DEFAULT_ENV = 'INKFORGE_LANDING_WORDS_PATH';

let dir: string;
let db: Database;
let app: Awaited<ReturnType<typeof buildApp>>;

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkforge-lwapi-'));
  const config = loadConfig({ STRATA_BASE_URL: 'http://127.0.0.1:47831/v1', STRATA_API_KEY: 'strata', STRATA_MODEL: 'iq3_xxs', INKFORGE_DATA_DIR: dir });
  db = openDb(path.join(config.dataDir, 'inkforge.db'));
  app = await buildApp({
    config,
    provider: createMockProvider({ draft: { text: 'x' }, qc: { text: '' }, summarize: { text: 'y' } }),
    db,
    inlineQueue: true,
  });
});

afterAll(async () => {
  delete process.env[USER_ENV];
  delete process.env[DEFAULT_ENV];
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

describe('落地分级词表 API（DEC-2026-1122-02）', () => {
  afterEach(() => {
    delete process.env[USER_ENV];
    delete process.env[DEFAULT_ENV];
  });

  it('GET：用户文件缺失 → 回落默认（出厂中性模板两空节，counts 全 0）', async () => {
    // userEnv 指向不存在文件 → resolve 回落默认（隔离开发机真实 ~/.inkforge 用户文件）
    process.env[USER_ENV] = path.join(dir, '__no_user__.txt');
    const g = await app.inject({ method: 'GET', url: '/api/landing-words' });
    expect(g.statusCode).toBe(200);
    const body = g.json() as { text: string; counts: { h: number; l: number }; sections: string[]; path: string };
    expect(body.counts).toEqual({ h: 0, l: 0 });
    expect(body.sections).toEqual(['H', 'L']);
    expect(body.text).toContain('[H]');
    expect(body.path.endsWith('landing-words.default.txt')).toBe(true);
  });

  it('GET：userEnv 指向用户文件 → text/counts/sections/path 命中（[调情] 不入池入 sections）', async () => {
    const f = path.join(dir, 'user-lw.txt');
    fs.writeFileSync(f, '[H]\n玉佩光\n[L]\n窗棂摇\n窗棂暗\n[调情]\n折扇\n', 'utf8');
    process.env[USER_ENV] = f;
    const g = await app.inject({ method: 'GET', url: '/api/landing-words' });
    expect(g.statusCode).toBe(200);
    const body = g.json() as { text: string; counts: { h: number; l: number }; sections: string[]; path: string };
    expect(body.path).toBe(f);
    expect(body.counts).toEqual({ h: 1, l: 2 });
    expect(body.sections).toEqual(['H', 'L', '调情']);
    expect(body.text).toContain('玉佩光');
  });

  it('PUT 合法 → 写 userEnv 文件+回 counts；后续 GET 回读且 path 指向用户文件', async () => {
    const f = path.join(dir, 'put-lw.txt');
    process.env[USER_ENV] = f;
    const p = await app.inject({ method: 'PUT', url: '/api/landing-words', payload: { text: '[H]\n玉佩光\n[L]\n窗棂摇\n' } });
    expect(p.statusCode).toBe(200);
    const body = p.json() as { saved: boolean; counts: { h: number; l: number }; sections: string[] };
    expect(body.saved).toBe(true);
    expect(body.counts).toEqual({ h: 1, l: 1 });
    expect(body.sections).toEqual(['H', 'L']);
    expect(fs.readFileSync(f, 'utf8')).toContain('玉佩光');
    const g = await app.inject({ method: 'GET', url: '/api/landing-words' });
    expect((g.json() as { path: string }).path).toBe(f);
  });

  it('PUT 超 8KB → 400 error 含「8KB」，不写盘', async () => {
    const f = path.join(dir, 'big.txt');
    process.env[USER_ENV] = f;
    const p = await app.inject({ method: 'PUT', url: '/api/landing-words', payload: { text: 'x'.repeat(8193) } });
    expect(p.statusCode).toBe(400);
    expect((p.json() as { error: string }).error).toContain('8KB');
    expect(fs.existsSync(f)).toBe(false);
  });

  it('PUT 非法节头 [H → 400 error 含「节头」，不写盘', async () => {
    const f = path.join(dir, 'bad.txt');
    process.env[USER_ENV] = f;
    const p = await app.inject({ method: 'PUT', url: '/api/landing-words', payload: { text: '# 注\n[H\n甲\n' } });
    expect(p.statusCode).toBe(400);
    expect((p.json() as { error: string }).error).toContain('节头');
    expect(fs.existsSync(f)).toBe(false);
  });

  it('PUT 空串 → 合法（=清空词表，空表 fail-open）', async () => {
    const f = path.join(dir, 'empty.txt');
    process.env[USER_ENV] = f;
    const p = await app.inject({ method: 'PUT', url: '/api/landing-words', payload: { text: '' } });
    expect(p.statusCode).toBe(200);
    expect((p.json() as { counts: { h: number; l: number } }).counts).toEqual({ h: 0, l: 0 });
    expect(fs.readFileSync(f, 'utf8')).toBe('');
  });
});
