import type { StepName } from '@inkforge/shared';

export interface CompletionRequest {
  model?: string;
  system: string;
  user: string;
  temperature: number;
  topP: number;
  maxOutputTokens: number;
  timeoutMs: number;
  signal?: AbortSignal;
  meta: { step: StepName; chapterNo?: number; round?: number };
  onDelta?: (text: string) => void;
}

export interface CompletionResult {
  text: string;
  usage: { promptTokens: number; completionTokens: number };
  finishReason: string;
}

export interface LlmProvider {
  complete(req: CompletionRequest): Promise<CompletionResult>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly kind: 'timeout' | 'http_500' | 'http_429' | 'http_529' | 'network' | 'other',
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}
