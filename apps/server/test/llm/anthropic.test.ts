import http from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { createAnthropicProvider } from '../../src/llm/anthropic';
import type { CompletionRequest, LlmProvider } from '../../src/llm/types';
import type { ProviderConfig } from '../../src/config';

const cfg: ProviderConfig = {
  name: 'local',
  baseURL: 'http://127.0.0.1:0/v1', // 每个用例起随机端口后覆盖
  apiKey: 'strata',
  model: 'iq3_xxs',
  contextWindow: 524288,
  maxOutput: 8192,
  supportsJsonSchema: false,
};

const baseReq = (over: Partial<CompletionRequest> = {}): CompletionRequest => ({
  system: '<system 文本>',
  user: '<user 文本>',
  temperature: 0.9,
  topP: 0.9,
  maxOutputTokens: 512,
  timeoutMs: 2000,
  meta: { step: 'draft', chapterNo: 1 },
  ...over,
});

const servers: http.Server[] = [];
const cleanup = () => {
  for (const s of servers) s.close();
  servers.length = 0;
};
afterEach(cleanup);

function startServer(handler: (req: http.IncomingMessage, res: http.ServerResponse, body: string) => void): Promise<number> {
  return new Promise((resolve) => {
    const s = http.createServer((req, res) => {
      let raw = '';
      req.on('data', (c) => (raw += c));
      req.on('end', () => handler(req, res, raw));
    });
    servers.push(s);
    s.listen(0, '127.0.0.1', () => resolve((s.address() as { port: number }).port));
  });
}

const CANNED = {
  id: 'msg_1',
  type: 'message',
  role: 'assistant',
  model: 'iq3_xxs',
  content: [{ type: 'text', text: '你好' }],
  stop_reason: 'end_turn',
  usage: { input_tokens: 12, output_tokens: 3 },
};

describe('anthropic provider', () => {
  it('非流式：解析文本/usage/finishReason，并断言请求头与 body', async () => {
    let captured: { headers: http.IncomingHttpHeaders; body: string } | null = null;
    const port = await startServer((req, res, body) => {
      captured = { headers: req.headers, body };
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(CANNED));
    });
    const p: LlmProvider = createAnthropicProvider({ ...cfg, baseURL: `http://127.0.0.1:${port}/v1` });
    const r = await p.complete(baseReq());
    expect(r.text).toBe('你好');
    expect(r.usage).toEqual({ promptTokens: 12, completionTokens: 3 });
    expect(r.finishReason).toBe('end_turn');
    expect(captured!.headers['x-api-key']).toBe('strata');
    expect(captured!.headers['anthropic-version']).toBe('2023-06-01');
    const sent = JSON.parse(captured!.body) as Record<string, unknown>;
    expect(sent.max_tokens).toBe(512);
    expect(sent.stream).toBe(false);
    expect(sent.model).toBe('iq3_xxs');
  });

  it('首响应 500 次响应 200 → 重试成功且请求两次', async () => {
    let count = 0;
    const port = await startServer((_req, res) => {
      count++;
      if (count === 1) {
        res.statusCode = 500;
        res.end('boom');
      } else {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify(CANNED));
      }
    });
    const p = createAnthropicProvider({ ...cfg, baseURL: `http://127.0.0.1:${port}/v1` });
    const r = await p.complete(baseReq());
    expect(r.text).toBe('你好');
    expect(count).toBe(2);
  });

  it('超时 → AbortError', async () => {
    const port = await startServer((_req, res) => {
      setTimeout(() => {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify(CANNED));
      }, 200);
    });
    const p = createAnthropicProvider({ ...cfg, baseURL: `http://127.0.0.1:${port}/v1` });
    await expect(p.complete(baseReq({ timeoutMs: 50 }))).rejects.toSatisfy((e: Error) => {
      expect(e.name).toBe('AbortError');
      return true;
    });
  });

  it('流式：3 片 delta 依序回调，文本拼接与 output tokens 正确', async () => {
    const events = [
      'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_2","role":"assistant","usage":{"input_tokens":12}}}',
      'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"你"}}',
      'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"好"}}',
      'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"啊"}}',
      'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":3}}',
      'event: message_stop\ndata: {"type":"message_stop"}',
    ];
    const port = await startServer((_req, res) => {
      res.setHeader('content-type', 'text/event-stream');
      let i = 0;
      const timer = setInterval(() => {
        if (i < events.length) res.write(events[i++] + '\n\n');
        else {
          clearInterval(timer);
          res.end();
        }
      }, 5);
    });
    const p = createAnthropicProvider({ ...cfg, baseURL: `http://127.0.0.1:${port}/v1` });
    const deltas: string[] = [];
    const r = await p.complete(baseReq({ onDelta: (t) => deltas.push(t) }));
    expect(deltas).toEqual(['你', '好', '啊']);
    expect(r.text).toBe('你好啊');
    expect(r.usage).toEqual({ promptTokens: 12, completionTokens: 3 });
    expect(r.finishReason).toBe('end_turn');
  });
});
