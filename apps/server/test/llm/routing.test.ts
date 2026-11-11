import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config';
import { pickProviderForRole, createRoleProvider } from '../../src/llm/factory';

const BASE = { STRATA_BASE_URL: 'http://127.0.0.1:47831/v1', STRATA_API_KEY: 'strata', STRATA_MODEL: 'iq3_xxs' };

describe('pickProviderForRole', () => {
  it('默认全 local', () => {
    const c = loadConfig(BASE);
    for (const role of ['planner', 'drafter', 'qc', 'rewriter', 'summarizer'] as const) {
      expect(pickProviderForRole(c, role).name).toBe('local');
    }
  });

  it('INKFORGE_ROLE_QC=cloud + cloud 三 env 齐 → qc→cloud', () => {
    const c = loadConfig({
      ...BASE,
      INKFORGE_ROLE_QC: 'cloud',
      INKFORGE_CLOUD_BASE_URL: 'https://api.example.com/v1',
      INKFORGE_CLOUD_API_KEY: 'sk-test',
      INKFORGE_CLOUD_MODEL: 'cloud-model',
    });
    expect(pickProviderForRole(c, 'qc').name).toBe('cloud');
    expect(pickProviderForRole(c, 'qc').model).toBe('cloud-model');
    expect(pickProviderForRole(c, 'drafter').name).toBe('local');
  });

  it('指 cloud 未配置 → 抛错', () => {
    const c = loadConfig({ ...BASE, INKFORGE_ROLE_QC: 'cloud' });
    expect(() => pickProviderForRole(c, 'qc')).toThrowError(/指向 cloud 但未配置/);
  });

  it('supportsJsonSchema=false 时恒走 plain 协议（Strata 本地恒 false）', () => {
    const c = loadConfig(BASE);
    expect(pickProviderForRole(c, 'drafter').supportsJsonSchema).toBe(false);
  });
});

describe('createRoleProvider', () => {
  it('mock=1 → 全角色走默认 mock（分账不受影响）', () => {
    const c = loadConfig({ ...BASE, INKFORGE_MOCK: '1' });
    for (const role of ['drafter', 'qc'] as const) {
      const p = createRoleProvider(c, role);
      expect(typeof p.complete).toBe('function');
    }
  });
});
