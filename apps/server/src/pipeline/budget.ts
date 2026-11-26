import type { ProviderConfig } from '../config';

// DEC-2026-1126-06：长章输出预算自适应。旧版硬编码 maxOutput=8192 在 CJK 约 4 token/字时
// 只能写约 2000 字，6000 字目标在 token 层不可达，正文常停在半截句。
export const TOKENS_PER_CHAR = 4.0;
export const MARGIN_TOKENS = 2048;
export const PROMPT_RESERVE_TOKENS = 4096;
export const CEILING_TOKENS = 512000;
export const FLOOR_TOKENS = 1024;

/**
 * 按目标字数估算单次 completion 的输出预算：目标 token + 余量，再受 provider 窗口剩余量约束，
 * 最后夹在 [floor, ceiling] 内。
 *
 * 实现决策：不做运行期 /models 探测。config 中 local 窗口写死 524288，而 iq3_s 实际 n_ctx
 * 为 393216；当前用量（提示约数万 token、输出预算最多数万 token）远不到任一边界，
 * 直接用 config 窗口做静态 clamp 即可，无需引入网络探测。
 */
export function estimateOutputBudget(
  targetChars: number,
  promptTokensEstimate: number,
  provider: ProviderConfig,
): number {
  return Math.max(
    FLOOR_TOKENS,
    Math.min(
      CEILING_TOKENS,
      Math.ceil(targetChars * TOKENS_PER_CHAR) + MARGIN_TOKENS,
      provider.contextWindow - promptTokensEstimate - PROMPT_RESERVE_TOKENS,
    ),
  );
}

export function sumSlotBudget(b: Record<string, number>): number {
  return Object.values(b).reduce((sum, value) => sum + value, 0);
}
