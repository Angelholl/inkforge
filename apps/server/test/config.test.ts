import fs from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig, pickBudgetProfile } from '../src/config';
import { readSettingsFile } from '../src/settings';

const LEGAL_ENV = {
  STRATA_BASE_URL: 'http://127.0.0.1:47831/v1',
  STRATA_API_KEY: 'strata',
  STRATA_MODEL: 'iq3_xxs',
};

/** 向测试封闭的设置文件（setup.env.ts 指向 tmpdir）写入 JSON。 */
function writeCfg(obj: Record<string, string>): void {
  fs.writeFileSync(process.env.INKFORGE_CONFIG_FILE!, JSON.stringify(obj), 'utf8');
}

describe('loadConfig', () => {
  it('最小合法 env → 默认值与钉值全表', () => {
    const c = loadConfig(LEGAL_ENV);
    expect(c.port).toBe(8787);
    expect(c.dataDir).toBe('data');
    expect(c.mock).toBe(false);
    expect(c.providers.local).toEqual({
      name: 'local',
      baseURL: 'http://127.0.0.1:47831/v1',
      apiKey: 'strata',
      model: 'iq3_xxs',
      contextWindow: 524288,
      maxOutput: 8192,
      supportsJsonSchema: false,
    });
    expect(c.budgets.draft).toEqual({
      hardRules: 500,
      worldview: 20000,
      characters: 8000,
      styleRules: 1000,
      styleDims: 1600,
      blueprint: 1000,
      continuity: 2500,
      prevTail: 1500,
      fewShot: 2500,
      task: 800,
    });
    expect(c.budgets.draft8k).toEqual({
      hardRules: 300,
      worldview: 200,
      characters: 0,
      styleRules: 0,
      styleDims: 0,
      blueprint: 500,
      continuity: 1000,
      prevTail: 800,
      fewShot: 1000,
      task: 200,
    });
    expect(c.budgets.qc).toEqual({ hardRules: 400, draft: 6000, blueprint: 500, continuity: 500 });
    expect(c.budgets.qc8k).toEqual({ hardRules: 300, draft: 3000, blueprint: 300, continuity: 200 });
    expect(c.budgets.rewrite).toEqual({
      hardRules: 500,
      styleRules: 400,
      styleDims: 1600, // DEC-2026-1122-03①：targeted 补画像与样本槽，预算对齐 draft
      fewShot: 2500,
      original: 6000,
      findings: 800,
      factBaseline: 1000,
      task: 800,
    });
    expect(c.quality).toEqual({ targetChars: 3000, scoreThreshold: 8.0, minGain: 0.05, maxRounds: 2 });
    expect(c.timeouts).toEqual({ draft: 3600000, qc: 900000, rewrite: 3600000, summarize: 1200000 });
    for (const role of ['planner', 'drafter', 'qc', 'rewriter', 'summarizer'] as const) {
      expect(c.roles[role]).toEqual({ provider: 'local', model: 'iq3_xxs' });
    }
  });

  it('budgets.planner 钉值', () => {
    const c = loadConfig(LEGAL_ENV);
    expect(c.budgets.planner).toEqual({ hardRules: 300, continuity: 1500, prevTail: 1500, task: 800 });
  });

  it('缺 STRATA_API_KEY → ZodError', () => {
    const env = { STRATA_BASE_URL: 'http://x', STRATA_MODEL: 'm' };
    expect(() => loadConfig(env)).toThrowError(expect.objectContaining({ name: 'ZodError' }));
  });

  it('缺 STRATA_BASE_URL → ZodError', () => {
    const env = { STRATA_API_KEY: 'k', STRATA_MODEL: 'm' };
    expect(() => loadConfig(env)).toThrowError(expect.objectContaining({ name: 'ZodError' }));
  });

  it('INKFORGE_MOCK=1 → mock true；cloud 三 env 齐备 → cloud provider 出现', () => {
    const c = loadConfig({
      ...LEGAL_ENV,
      INKFORGE_MOCK: '1',
      INKFORGE_CLOUD_BASE_URL: 'https://api.example.com/v1',
      INKFORGE_CLOUD_API_KEY: 'sk-test',
      INKFORGE_CLOUD_MODEL: 'cloud-model',
    });
    expect(c.mock).toBe(true);
    expect(c.providers.cloud).toEqual({
      name: 'cloud',
      baseURL: 'https://api.example.com/v1',
      apiKey: 'sk-test',
      model: 'cloud-model',
      contextWindow: 200000,
      maxOutput: 8192,
      supportsJsonSchema: true,
    });
  });

  it('cloud 缺任一 env → cloud provider 不出现', () => {
    const c = loadConfig({ ...LEGAL_ENV, INKFORGE_CLOUD_BASE_URL: 'https://x', INKFORGE_CLOUD_API_KEY: 'k' });
    expect(c.providers.cloud).toBeUndefined();
  });
});

describe('设置文件通道封闭（回归 DEC-2026-1117-02 P2：mock 仅认环境变量）', () => {
  afterEach(() => {
    try {
      fs.unlinkSync(process.env.INKFORGE_CONFIG_FILE!);
    } catch {
      /* 已不存在 */
    }
  });

  it('config.json 含 INKFORGE_MOCK → readSettingsFile strip 该键（旧设置页开关残留键成死数据）', () => {
    writeCfg({ STRATA_BASE_URL: 'http://x', STRATA_API_KEY: 'k', STRATA_MODEL: 'm', INKFORGE_MOCK: '1' });
    expect(readSettingsFile()).not.toHaveProperty('INKFORGE_MOCK');
  });

  it('config.json 含 INKFORGE_MOCK=1 → loadConfig mock 仍 false（文件通道无法启用 mock）', () => {
    writeCfg({ STRATA_BASE_URL: 'http://x', STRATA_API_KEY: 'k', STRATA_MODEL: 'm', INKFORGE_MOCK: '1' });
    expect(loadConfig(LEGAL_ENV).mock).toBe(false);
  });

  it('config.json 的合法键仍生效：STRATA_API_KEY 文件值覆盖 env', () => {
    writeCfg({ STRATA_BASE_URL: 'http://file', STRATA_API_KEY: 'from-file', STRATA_MODEL: 'm-file' });
    const c = loadConfig(LEGAL_ENV);
    expect(c.providers.local.apiKey).toBe('from-file');
    expect(c.providers.local.model).toBe('m-file');
  });
});

describe('pickBudgetProfile', () => {
  it('≤8192 → draft8k，否则 draft', () => {
    expect(pickBudgetProfile(8192)).toBe('draft8k');
    expect(pickBudgetProfile(8193)).toBe('draft');
    expect(pickBudgetProfile(524288)).toBe('draft');
  });
});

describe('budgets.outline', () => {
  it('钉值', () => {
    const c = loadConfig(LEGAL_ENV);
    expect(c.budgets.outline).toEqual({ hardRules: 300, worldview: 20000, characters: 8000, outline: 8000, task: 600 });
  });
});
