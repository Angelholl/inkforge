import { ProviderError, type CompletionRequest, type CompletionResult, type LlmProvider } from './types';
import type { ProviderConfig } from '../config';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const RETRYABLE = new Set([429, 500, 502, 503, 504, 529]);
const MAX_RETRIES = 2;

/** Strata 直连（Anthropic Messages 协议，DEC-2026-1111-03）。 */
export function createAnthropicProvider(cfg: ProviderConfig): LlmProvider {
  async function rawRequest(req: CompletionRequest, signal: AbortSignal): Promise<Response> {
    const body = {
      model: req.model ?? cfg.model,
      max_tokens: req.maxOutputTokens,
      system: req.system,
      messages: [{ role: 'user', content: req.user }],
      temperature: req.temperature,
      top_p: req.topP,
      stream: !!req.onDelta,
    };
    return fetch(`${cfg.baseURL}/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': cfg.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
      signal,
    });
  }

  async function complete(req: CompletionRequest): Promise<CompletionResult> {
    const signal = AbortSignal.any([req.signal ?? AbortSignal.timeout(2 ** 30), AbortSignal.timeout(req.timeoutMs)]);
    let lastError: Error = new ProviderError('unreachable', 'other');
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (signal.aborted) throw makeAbort();
      try {
        const resp = await rawRequest(req, signal);
        if (resp.ok) {
          return req.onDelta ? await consumeStream(resp, req) : await consumeJson(resp);
        }
        if (!RETRYABLE.has(resp.status)) {
          const text = await resp.text().catch(() => '');
          throw new ProviderError(`anthropic http ${resp.status}: ${text.slice(0, 200)}`, 'other', resp.status);
        }
        lastError = new ProviderError(`anthropic http ${resp.status}`, 'http_500', resp.status);
      } catch (e) {
        if (e instanceof ProviderError && e.kind === 'other') throw e;
        if ((e as Error).name === 'AbortError' || (e as Error).name === 'TimeoutError') throw makeAbort(e as Error);
        lastError = e as Error;
      }
      if (attempt < MAX_RETRIES) {
        await sleep(500 * 2 ** attempt + Math.floor(Math.random() * 250));
      }
    }
    throw lastError;
  }

  return { complete };
}

async function consumeJson(resp: Response): Promise<CompletionResult> {
  const data = (await resp.json()) as {
    content: Array<{ type: string; text: string }>;
    stop_reason: string | null;
    usage: { input_tokens: number; output_tokens: number };
  };
  return {
    text: data.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join(''),
    usage: { promptTokens: data.usage.input_tokens, completionTokens: data.usage.output_tokens },
    finishReason: data.stop_reason ?? '',
  };
}

interface SseEvent {
  event: string;
  data: string;
}

async function* readSse(resp: Response): AsyncGenerator<SseEvent> {
  const body = resp.body;
  if (!body) throw new ProviderError('empty stream body', 'other');
  const decoder = new TextDecoder();
  let buffer = '';
  for await (const chunk of body) {
    buffer += decoder.decode(chunk as Uint8Array, { stream: true });
    const blocks = buffer.split(/\n\n/);
    buffer = blocks.pop() ?? '';
    for (const block of blocks) {
      let event = 'message';
      const dataLines: string[] = [];
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
      }
      if (dataLines.length > 0) yield { event, data: dataLines.join('\n') };
    }
  }
}

async function consumeStream(resp: Response, req: CompletionRequest): Promise<CompletionResult> {
  let text = '';
  let promptTokens = 0;
  let completionTokens = 0;
  let finishReason = '';
  for await (const evt of readSse(resp)) {
    if (evt.event === 'message_start') {
      const msg = JSON.parse(evt.data) as { message?: { usage?: { input_tokens?: number } } };
      promptTokens = msg.message?.usage?.input_tokens ?? 0;
    } else if (evt.event === 'content_block_delta') {
      const delta = JSON.parse(evt.data) as { delta?: { type?: string; text?: string } };
      if (delta.delta?.type === 'text_delta' && delta.delta.text) {
        text += delta.delta.text;
        req.onDelta?.(delta.delta.text);
      }
    } else if (evt.event === 'message_delta') {
      const d = JSON.parse(evt.data) as { delta?: { stop_reason?: string }; usage?: { output_tokens?: number } };
      completionTokens = d.usage?.output_tokens ?? completionTokens;
      finishReason = d.delta?.stop_reason ?? finishReason;
    } else if (evt.event === 'message_stop') {
      break;
    }
  }
  return { text, usage: { promptTokens, completionTokens }, finishReason };
}

function makeAbort(origin?: Error): Error {
  const e = new Error(origin?.message ?? 'This operation was aborted');
  e.name = 'AbortError';
  return e;
}
