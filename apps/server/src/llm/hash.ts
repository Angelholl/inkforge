import { createHash } from 'node:crypto';

/** prompt 稳定性指纹：同输入必同哈希（KV cache 前缀复用前置）。 */
export function hashPrompt(system: string, user: string): string {
  return createHash('sha256').update(system).update('\x00').update(user).digest('hex');
}
