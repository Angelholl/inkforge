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
const REFINE_MICRO_SEGMENT_CHARS = 50;

function refineAbortError(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new Error('refine-aborted');
}

export function estimateRefineTokens(s: string): number {
  return Math.ceil(s.length * REFINE_TOKEN_PER_CHAR);
}

/** 段落优先、超长段内按硬上限切；微段（<50 字）并入相邻段，不跨段合并。 */
export function splitRefineSegments(raw: string): string[] {
  const paragraphs = raw.split('\n\n').filter((paragraph) => paragraph.length > 0);
  const merged: string[] = [];
  let pending: string[] = [];
  for (const paragraph of paragraphs) {
    if (paragraph.length < REFINE_MICRO_SEGMENT_CHARS) {
      pending.push(paragraph);
      continue;
    }
    merged.push([...pending, paragraph].join('\n\n'));
    pending = [];
  }
  if (pending.length > 0) {
    if (merged.length > 0) merged[merged.length - 1] += '\n\n' + pending.join('\n\n');
    else merged.push(pending.join('\n\n'));
  }

  const segments: string[] = [];
  for (const paragraph of merged) {
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
    const segment = segments[i];
    const request = { ...baseRequest, user: renderRefineTask(segment, chunkBudgetChars) };
    let text = '';
    let succeeded = false;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await provider.complete(request);
        if (signal?.aborted) throw refineAbortError(signal);
        text = res.text.trim();
        if (text !== '') {
          succeeded = true;
          break;
        }
      } catch {
        if (signal?.aborted) throw refineAbortError(signal);
        // 异常或空返回原样重试一次；两次都失败则在循环外降级为该段原文
      }
    }
    if (!succeeded) {
      if (segment.length > chunkBudgetChars) {
        mapOutputs.push(segment.slice(0, chunkBudgetChars));
        segmentTruncated = true;
      } else {
        mapOutputs.push(segment);
      }
      continue;
    }
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
    if (signal?.aborted) throw refineAbortError(signal);
    throw new Error('refine-reduce-failed');
  }
  if (signal?.aborted) throw refineAbortError(signal);
  const reducedText = reduced.text.trim();
  if (reducedText === '') throw new Error('refine-reduce-empty');
  return {
    description: reducedText.replace(/\n{3,}/g, '\n\n').slice(0, budgetChars),
    truncated: segmentTruncated || reducedText.length > budgetChars,
  };
}
