import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ensureLandingWordsUserFile,
  landingWordsUserPath,
  parseLandingWordsText,
  readLandingWordsUserFile,
  resolveLandingWordsPath,
  validateLandingWordsText,
  writeLandingWordsUserFile,
} from '../../src/quality/landing-words';

const USER_ENV = 'INKFORGE_LANDING_WORDS_USER_PATH';
const DEFAULT_ENV = 'INKFORGE_LANDING_WORDS_PATH';

/** 中性夹具词(玉佩/窗棂系,沿 l0.test LW 先例;1301 纪律:不引真实词表内容)。 */

describe('landing-words 用户词表层（DEC-2026-1122-02）', () => {
  afterEach(() => {
    delete process.env[USER_ENV];
    delete process.env[DEFAULT_ENV];
  });

  it('landingWordsUserPath：userEnv 注入优先；dataDir 注入回落 <dataDir>/landing-words.txt；未注入回落 <cwd>/data/landing-words.txt（DEC-2026-1123-01）', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkforge-lw-'));
    expect(landingWordsUserPath({ env: path.join(dir, 'w.txt') })).toBe(path.join(dir, 'w.txt'));
    expect(landingWordsUserPath({ dataDir: path.join(dir, 'x') })).toBe(path.join(dir, 'x', 'landing-words.txt'));
    const savedDataDir = process.env.INKFORGE_DATA_DIR;
    delete process.env.INKFORGE_DATA_DIR;
    try {
      const fallback = landingWordsUserPath();
      expect(path.isAbsolute(fallback)).toBe(true);
      expect(fallback.endsWith(path.join('data', 'landing-words.txt'))).toBe(true);
    } finally {
      if (savedDataDir !== undefined) process.env.INKFORGE_DATA_DIR = savedDataDir;
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('resolveLandingWordsPath ①：用户文件存在 → 压过 env INKFORGE_LANDING_WORDS_PATH', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkforge-lw-'));
    const user = path.join(dir, 'user.txt');
    fs.writeFileSync(user, '[H]\n玉佩光\n', 'utf8');
    const envFile = path.join(dir, 'env.txt');
    fs.writeFileSync(envFile, '[H]\n窗棂摇\n', 'utf8');
    process.env[DEFAULT_ENV] = envFile;
    expect(resolveLandingWordsPath({ userEnv: user, dataDir: dir })).toBe(user);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('resolveLandingWordsPath ②：无用户文件 → INKFORGE_LANDING_WORDS_PATH 指向存在文件', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkforge-lw-'));
    const envFile = path.join(dir, 'env.txt');
    fs.writeFileSync(envFile, '[L]\n窗棂摇\n', 'utf8');
    process.env[DEFAULT_ENV] = envFile;
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'inkforge-lw-home-'));
    expect(resolveLandingWordsPath({ home, userEnv: undefined, dataDir: dir })).toBe(envFile);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(home, { recursive: true, force: true });
  });

  it('resolveLandingWordsPath ③：全缺 → 回落仓库默认', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'inkforge-lw-home-'));
    expect(resolveLandingWordsPath({ home, userEnv: undefined, dataDir: home }).endsWith('landing-words.default.txt')).toBe(true);
    fs.rmSync(home, { recursive: true, force: true });
  });

  it('resolveLandingWordsPath ④：env 指向不存在路径 → 回落默认（防锁死空表）', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkforge-lw-'));
    process.env[DEFAULT_ENV] = path.join(dir, '__no_such__.txt');
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'inkforge-lw-home-'));
    expect(resolveLandingWordsPath({ home, userEnv: undefined, dataDir: home }).endsWith('landing-words.default.txt')).toBe(true);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(home, { recursive: true, force: true });
  });

  it('ensureLandingWordsUserFile ①：legacy 存在+新位缺失 → 只拷不删、内容逐字相等、返回新位', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'inkforge-lw-home-'));
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkforge-lw-data-'));
    const legacyDir = path.join(home, '.inkforge');
    fs.mkdirSync(legacyDir, { recursive: true });
    const legacy = path.join(legacyDir, 'landing-words.txt');
    const text = '[H]\n玉佩光\n[L]\n窗棂摇\n';
    fs.writeFileSync(legacy, text, 'utf8');
    const newPath = path.join(dataDir, 'landing-words.txt');
    expect(fs.existsSync(newPath)).toBe(false);
    expect(ensureLandingWordsUserFile({ home, dataDir })).toBe(newPath);
    expect(fs.readFileSync(newPath, 'utf8')).toBe(text);
    expect(fs.readFileSync(legacy, 'utf8')).toBe(text);
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it('ensureLandingWordsUserFile ②：新位已有不同内容 → 不覆盖', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'inkforge-lw-home-'));
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkforge-lw-data-'));
    const legacyDir = path.join(home, '.inkforge');
    fs.mkdirSync(legacyDir, { recursive: true });
    fs.writeFileSync(path.join(legacyDir, 'landing-words.txt'), '[H]\n玉佩光\n', 'utf8');
    const newPath = path.join(dataDir, 'landing-words.txt');
    const existing = '[L]\n窗棂摇\n';
    fs.writeFileSync(newPath, existing, 'utf8');
    expect(ensureLandingWordsUserFile({ home, dataDir })).toBe(newPath);
    expect(fs.readFileSync(newPath, 'utf8')).toBe(existing);
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it('ensureLandingWordsUserFile ③：legacy 不存在 → 无副作用，新位不产生文件', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'inkforge-lw-home-'));
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkforge-lw-data-'));
    const newPath = path.join(dataDir, 'landing-words.txt');
    expect(ensureLandingWordsUserFile({ home, dataDir })).toBe(newPath);
    expect(fs.existsSync(newPath)).toBe(false);
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it('ensureLandingWordsUserFile ④：env（userEnv）已设 → legacy 存在也不拷贝（env 分支零迁移；含 env 指向不存在文件）', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'inkforge-lw-home-'));
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkforge-lw-data-'));
    const legacyDir = path.join(home, '.inkforge');
    fs.mkdirSync(legacyDir, { recursive: true });
    const legacy = path.join(legacyDir, 'landing-words.txt');
    const legacyText = '[H]\n玉佩光\n';
    fs.writeFileSync(legacy, legacyText, 'utf8');
    const envFile = path.join(dataDir, 'env-words.txt');
    const envText = '[L]\n窗棂摇\n';
    fs.writeFileSync(envFile, envText, 'utf8');
    expect(ensureLandingWordsUserFile({ home, dataDir, env: envFile })).toBe(envFile);
    expect(fs.readFileSync(envFile, 'utf8')).toBe(envText);
    expect(fs.existsSync(path.join(dataDir, 'landing-words.txt'))).toBe(false);
    const missingEnv = path.join(dataDir, '__no_user__.txt');
    expect(ensureLandingWordsUserFile({ home, dataDir, env: missingEnv })).toBe(missingEnv);
    expect(fs.existsSync(missingEnv)).toBe(false);
    expect(fs.readFileSync(legacy, 'utf8')).toBe(legacyText);
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it('parseLandingWordsText：两节解析；未知节不入池但入 sections；注释空行跳过；去重；无节头词行忽略', () => {
    expect(parseLandingWordsText('[H]\n玉佩光\n[L]\n窗棂摇\n')).toEqual({
      h: ['玉佩光'],
      l: ['窗棂摇'],
      sections: ['H', 'L'],
    });
    expect(parseLandingWordsText('[H]\n甲\n[调情]\n乙\n丙\n[L]\n丁\n')).toEqual({
      h: ['甲'],
      l: ['丁'],
      sections: ['H', '调情', 'L'],
    });
    expect(parseLandingWordsText('# 注释\n\n[H]\n甲\n')).toEqual({ h: ['甲'], l: [], sections: ['H'] });
    expect(parseLandingWordsText('[H]\n甲\n甲\n[L]\n丁\r\n丁\n戊\n')).toEqual({ h: ['甲'], l: ['丁', '戊'], sections: ['H', 'L'] });
    expect(parseLandingWordsText('甲\n乙\n')).toEqual({ h: [], l: [], sections: [] });
  });

  it('validateLandingWordsText：8193 字节拒；8192 过；[H 行拒；[调情] 过；空串过=清空合法', () => {
    expect(validateLandingWordsText('x'.repeat(8193)).ok).toBe(false);
    expect(validateLandingWordsText('x'.repeat(8192)).ok).toBe(true);
    const bad = validateLandingWordsText('# 注\n[H\n甲\n');
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toContain('节头');
    expect(validateLandingWordsText('[调情]\n手\n').ok).toBe(true);
    expect(validateLandingWordsText('').ok).toBe(true);
  });

  it('read/write roundtrip：write 自动 mkdir 子目录；read 缺失→空串', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkforge-lw-'));
    const p = path.join(dir, 'a', 'b', 'w.txt');
    expect(readLandingWordsUserFile(p)).toBe('');
    writeLandingWordsUserFile('[H]\n玉佩光\n[L]\n窗棂摇\n', p);
    expect(readLandingWordsUserFile(p)).toBe('[H]\n玉佩光\n[L]\n窗棂摇\n');
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
