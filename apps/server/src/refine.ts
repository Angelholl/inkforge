import type { SettingsImportRefineResult } from '@inkforge/shared';
import type { AppConfig, ProviderConfig } from './config';
import type { CompletionResult, LlmProvider } from './llm/types';
import { renderRefineReduceTask, renderRefineTask } from './prompts/render';

// 中文估算取上沿 1.5 token/字；不借用英文预算档位的 4.0 假设。
const REFINE_TOKEN_PER_CHAR = 1.5;
const REFINE_INPUT_THRESHOLD_TOKENS = 48000;
const REFINE_WINDOW_FLOOR = 80000;
const REFINE_CHUNK_TARGET_TOKENS = 16000;
const REFINE_CHUNK_MAX_CHARS = 10666;
const REFINE_OUTPUT_RESERVE_TOKENS = 4096;
const REFINE_WINDOW_MARGIN = 2048;
const REFINE_MIN_MAP_WINDOW = REFINE_CHUNK_TARGET_TOKENS + REFINE_OUTPUT_RESERVE_TOKENS + REFINE_WINDOW_MARGIN;

export function estimateRefineTokens(s: string): number {
  return Math.ceil(s.length * REFINE_TOKEN_PER_CHAR);
}

/** 段落优先、超长段内按硬上限切；不跨段合并。 */
export function splitRefineSegments(raw: string): string[] {
  const segments: string[] = [];
  for (const paragraph of raw.split('\n\n')) {
    if (paragraph.length === 0) continue;
    for (let offset = 0; offset < paragraph.length; offset += REFINE_CHUNK_MAX_CHARS) {
      segments.push(paragraph.slice(offset, offset + REFINE_CHUNK_MAX_CHARS));
    }
  }
  return segments.length > 0 ? segments : [''];
}

/** 单次精炼 + 超预算/小窗时分块 map-reduce；每次调用独立超时，共享 signal，失败整体抛出。 */
export async function refineDescriptionWithLlm(
  deps: { provider: LlmProvider; config: AppConfig; providerConfig: ProviderConfig },
  input: { raw: string; budgetChars: number; signal?: AbortSignal },
): Promise<SettingsImportRefineResult> {
  const { provider, config, providerConfig } = deps;
  const { raw, budgetChars, signal } = input;

  const needChunk =
    estimateRefineTokens(raw) > REFINE_INPUT_THRESHOLD_TOKENS ||
    providerConfig.contextWindow < REFINE_WINDOW_FLOOR;

  if (needChunk && providerConfig.contextWindow < REFINE_MIN_MAP_WINDOW) {
    throw new Error('refine-context-too-small');
  }

  const baseRequest = {
    system: '你是设定集精炼助手。严格按输出格式作答。',
    temperature: 0.3,
    topP: 0.9,
    maxOutputTokens: config.providers.local.maxOutput,
    timeoutMs: config.timeouts.refine,
    meta: { step: 'refine' as const },
    signal,
  };

  if (!needChunk) {
    const res = await provider.complete({ ...baseRequest, user: renderRefineTask(raw, budgetChars) });
    const text = res.text.trim();
    return {
      description: text.replace(/\n{3,}/g, '\n\n').slice(0, budgetChars),
      truncated: text.length > budgetChars,
    };
  }

  const segments = splitRefineSegments(raw);
  const n = segments.length;
  const chunkBudgetChars = Math.floor(budgetChars / n);
  const mapOutputs: string[] = [];
  let segmentTruncated = false;

  for (let i = 0; i < n; i++) {
    let res: CompletionResult;
    try {
      res = await provider.complete({
        ...baseRequest,
        user: renderRefineTask(segments[i], chunkBudgetChars),
      });
    } catch {
      throw new Error(`refine-map-failed: segment ${i + 1}/${n}`);
    }
    const text = res.text.trim();
    if (text === '') throw new Error(`refine-map-empty: segment ${i + 1}/${n}`);
    if (text.length > chunkBudgetChars) {
      mapOutputs.push(text.slice(0, chunkBudgetChars));
      segmentTruncated = true;
    } else {
      mapOutputs.push(text);
    }
  }

  let reduced: CompletionResult;
  try {
    reduced = await provider.complete({
      ...baseRequest,
      user: renderRefineReduceTask(mapOutputs, budgetChars),
    });
  } catch {
    throw new Error('refine-reduce-failed');
  }
  const reducedText = reduced.text.trim();
  if (reducedText === '') throw new Error('refine-reduce-empty');
  return {
    description: reducedText.replace(/\n{3,}/g, '\n\n').slice(0, budgetChars),
    truncated: segmentTruncated || reducedText.length > budgetChars,
  };
}
