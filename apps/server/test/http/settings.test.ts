import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app';
import { loadConfig } from '../../src/config';
import { openDb, type Database } from '../../src/db/open';
import { createDefaultMockProvider } from '../../src/llm/mock';

let dir: string;
let configFile: string;
let app: Awaited<ReturnType<typeof buildApp>>;
let db: Database;

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkforge-settings-'));
  configFile = path.join(dir, 'config.json');
  process.env.INKFORGE_CONFIG_FILE = configFile;
  const config = loadConfig({
    STRATA_BASE_URL: 'http://127.0.0.1:47831/v1',
    STRATA_API_KEY: 'env-key',
    STRATA_MODEL: 'env-model',
    INKFORGE_DATA_DIR: path.join(dir, 'data'),
  });
  db = openDb(path.join(config.dataDir, 'inkforge.db'));
  app = await buildApp({ config, provider: createDefaultMockProvider(), db });
});

afterEach(async () => {
  await app.close();
  db.close();
  delete process.env.INKFORGE_CONFIG_FILE;
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('GET/PUT /api/settings', () => {
  it('PUT 全字段后 GET 返回对应值、hasApiKey=true 且文件含 API Key；mock 开关已删除（payload 带也不落盘）', async () => {
    const put = await app.inject({
      method: 'PUT',
      url: '/api/settings',
      payload: {
        strataBaseUrl: 'http://127.0.0.1:12345/v1',
        strataApiKey: 'sk-test-local',
        strataModel: 'iq3_xxs',
        cloudBaseUrl: 'https://cloud.example.com/v1',
        cloudApiKey: 'cloud-test-key',
        cloudModel: 'cloud-model',
        mock: true, // 已删开关：schema 剥离该字段，不得写入配置
      },
    });
    expect(put.statusCode).toBe(200);
    expect(put.json()).toEqual({ saved: true, restartRequired: true });

    const get = await app.inject({ method: 'GET', url: '/api/settings' });
    expect(get.statusCode).toBe(200);
    const body = get.json();
    expect(body).toMatchObject({
      strataBaseUrl: 'http://127.0.0.1:12345/v1',
      strataModel: 'iq3_xxs',
      hasApiKey: true,
      cloudBaseUrl: 'https://cloud.example.com/v1',
      cloudModel: 'cloud-model',
      hasCloudApiKey: true,
      configPath: configFile,
    });
    // 回归（owner 拍板删开关）：GET 不再回显 mock，PUT 不再写 INKFORGE_MOCK
    expect(body).not.toHaveProperty('mock');
    // 不回显 Key 明文
    expect(get.body).not.toContain('sk-test-local');
    expect(get.body).not.toContain('cloud-test-key');

    const raw = fs.readFileSync(configFile, 'utf8');
    const saved = JSON.parse(raw) as Record<string, string>;
    expect(saved.STRATA_API_KEY).toBe('sk-test-local');
    expect(saved.STRATA_BASE_URL).toBe('http://127.0.0.1:12345/v1');
    expect(saved.INKFORGE_MOCK).toBeUndefined();
  });

  it('PUT 空串字段视为删除，GET hasApiKey=false', async () => {
    await app.inject({
      method: 'PUT',
      url: '/api/settings',
      payload: { strataApiKey: 'sk-temp', strataBaseUrl: 'http://temp/v1' },
    });
    const put = await app.inject({
      method: 'PUT',
      url: '/api/settings',
      payload: { strataApiKey: '', strataBaseUrl: '' },
    });
    expect(put.statusCode).toBe(200);

    const get = await app.inject({ method: 'GET', url: '/api/settings' });
    const body = get.json();
    expect(body.hasApiKey).toBe(false);
    expect(body.strataBaseUrl).toBe('');
    const saved = JSON.parse(fs.readFileSync(configFile, 'utf8')) as Record<string, string>;
    expect(saved.STRATA_API_KEY).toBeUndefined();
    expect(saved.STRATA_BASE_URL).toBeUndefined();
  });

  it('无文件时 GET 全空且 hasApiKey=false（无 mock 字段）', async () => {
    const get = await app.inject({ method: 'GET', url: '/api/settings' });
    expect(get.statusCode).toBe(200);
    const body = get.json();
    expect(body).toMatchObject({
      strataBaseUrl: '',
      strataModel: '',
      hasApiKey: false,
      cloudBaseUrl: '',
      cloudModel: '',
      hasCloudApiKey: false,
      configPath: configFile,
    });
    expect(body).not.toHaveProperty('mock');
  });

  it('loadConfig：仅文件提供 STRATA_* 时不抛，providers.local 取文件值', () => {
    fs.writeFileSync(
      configFile,
      JSON.stringify({
        STRATA_BASE_URL: 'http://file-only/v1',
        STRATA_API_KEY: 'file-key',
        STRATA_MODEL: 'file-model',
      }),
    );
    const config = loadConfig({
      STRATA_BASE_URL: '',
      STRATA_API_KEY: '',
      STRATA_MODEL: '',
      INKFORGE_CONFIG_FILE: configFile,
    });
    expect(config.providers.local.baseURL).toBe('http://file-only/v1');
    expect(config.providers.local.apiKey).toBe('file-key');
    expect(config.providers.local.model).toBe('file-model');
  });
});

describe('GET/PUT /api/settings/quality（B3 入库分阈值可调）', () => {
  it('PUT scoreThreshold=9 → saved 且 GET 回读覆盖值 isDefault=false', async () => {
    const put = await app.inject({ method: 'PUT', url: '/api/settings/quality', payload: { scoreThreshold: 9 } });
    expect(put.statusCode).toBe(200);
    expect(put.json()).toEqual({ saved: true, restartRequired: false });
    const get = await app.inject({ method: 'GET', url: '/api/settings/quality' });
    expect(get.statusCode).toBe(200);
    expect(get.json()).toEqual({ scoreThreshold: 9, isDefault: false });
  });

  it('PUT 越界 11 → 400（不落库）', async () => {
    const put = await app.inject({ method: 'PUT', url: '/api/settings/quality', payload: { scoreThreshold: 11 } });
    expect(put.statusCode).toBe(400);
    const get = await app.inject({ method: 'GET', url: '/api/settings/quality' });
    expect(get.json()).toMatchObject({ scoreThreshold: 8, isDefault: true });
  });

  it('app_meta 存非法值 → readScoreThreshold 判非法，GET 回落默认 8.0 且 isDefault=true', async () => {
    db.prepare("INSERT INTO app_meta(key, value) VALUES('quality_score_threshold', 'abc') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
    const get = await app.inject({ method: 'GET', url: '/api/settings/quality' });
    expect(get.statusCode).toBe(200);
    expect(get.json()).toMatchObject({ scoreThreshold: 8, isDefault: true });
  });
});
