import type { AppConfig, ProviderConfig, RoleName } from '../config';
import type { LlmProvider } from './types';
import { createAnthropicProvider } from './anthropic';
import { createDefaultMockProvider } from './mock';

/** 角色路由：roles[role].provider → providers.local|cloud；指 cloud 未配置 → 抛错。 */
export function pickProviderForRole(config: AppConfig, role: RoleName): ProviderConfig {
  const route = config.roles[role];
  if (route.provider === 'cloud') {
    if (!config.providers.cloud) throw new Error(`role ${role} 指向 cloud 但未配置 INKFORGE_CLOUD_*`);
    return config.providers.cloud;
  }
  return config.providers.local;
}

/** 按角色构造 provider：mock 开关优先（GUI 开发/演示）。 */
export function createRoleProvider(config: AppConfig, role: RoleName): LlmProvider {
  if (config.mock) return createDefaultMockProvider();
  return createAnthropicProvider(pickProviderForRole(config, role));
}
