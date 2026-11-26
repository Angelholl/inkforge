import { describe, expect, it } from 'vitest';
import { countChars } from '@inkforge/shared';
import { createDefaultMockProvider, createMockProvider, makeMockDraft } from '../../src/llm/mock';
import { ProviderError, type CompletionRequest } from '../../src/llm/types';

const baseReq = (over: Partial<CompletionRequest> = {}): CompletionRequest => ({
  system: 's',
  user: 'u',
  temperature: 0.9,
  topP: 0.9,
  maxOutputTokens: 8192,
  timeoutMs: 1000,
  meta: { step: 'qc' },
  ...over,
});

describe('mock provider 路由与非流式', () => {
  it('按 step 路由；无脚本步骤抛错', async () => {
    const p = createMockProvider({ qc: { text: 'Q' } });
    const r = await p.complete(baseReq());
    expect(r.text).toBe('Q');
    expect(r.usage.completionTokens).toBe(1);
    await expect(p.complete(baseReq({ meta: { step: 'draft' } }))).rejects.toThrowError(/mock script missing step draft/);
  });

  it('usage.completionTokens === text.length', async () => {
    const p = createMockProvider({ draft: { text: '一二三四五' } });
    const r = await p.complete(baseReq({ meta: { step: 'draft' } }));
    expect(r.usage.completionTokens).toBe(5);
  });

  it('finishReason 缺省仍为 end_turn（DEC-2026-1126-07）', async () => {
    const p = createMockProvider({ qc: { text: 'OVERALL: 9' } });
    const r = await p.complete(baseReq());
    expect(r.finishReason).toBe('end_turn');
  });
});

describe('mock provider 流式/失败/中止/序列/textFn', () => {
  it('流式拆分：onDelta 依序收片后 resolve', async () => {
    const p = createMockProvider({ qc: { text: 'ABCDEFG', chunks: 3, chunkDelayMs: 10 } });
    const deltas: string[] = [];
    const r = await p.complete(baseReq({ onDelta: (t) => deltas.push(t) }));
    expect(deltas.join('')).toBe('ABCDEFG');
    expect(deltas.length).toBe(3);
    expect(r.text).toBe('ABCDEFG');
  });

  it('error 注入 http_500 → ProviderError', async () => {
    const p = createMockProvider({ qc: { error: 'http_500', afterMs: 20 } });
    await expect(p.complete(baseReq())).rejects.toSatisfy((e: Error) => {
      expect(e).toBeInstanceOf(ProviderError);
      expect(e.name).toBe('ProviderError');
      expect(e.message).toContain('http_500');
      return true;
    });
  });

  it('AbortController 中止 → AbortError', async () => {
    const ac = new AbortController();
    const p = createMockProvider({ qc: { error: 'timeout', afterMs: 500 } });
    setTimeout(() => ac.abort(), 5);
    await expect(p.complete(baseReq({ signal: ac.signal }))).rejects.toSatisfy((e: Error) => {
      expect(e.name).toBe('AbortError');
      return true;
    });
  });

  it('sequence：两次得 A、B，第三次拒绝', async () => {
    const p = createMockProvider({ qc: { sequence: [{ text: 'A' }, { text: 'B' }] } });
    expect((await p.complete(baseReq())).text).toBe('A');
    expect((await p.complete(baseReq())).text).toBe('B');
    await expect(p.complete(baseReq())).rejects.toThrowError(/mock sequence exhausted/);
  });

  it('textFn 按章号变化', async () => {
    const p = createMockProvider({ draft: { textFn: (m) => String(m.chapterNo) } });
    expect((await p.complete(baseReq({ meta: { step: 'draft', chapterNo: 7 } }))).text).toBe('7');
  });

  it('repeat：恒定返回', async () => {
    const p = createMockProvider({ qc: { repeat: { text: 'X' } } });
    expect((await p.complete(baseReq())).text).toBe('X');
    expect((await p.complete(baseReq())).text).toBe('X');
  });
});

describe('默认 mock 脚本', () => {
  it('makeMockDraft 500 字、章间不同', () => {
    expect(countChars(makeMockDraft(3))).toBe(500);
    expect(makeMockDraft(1)).not.toBe(makeMockDraft(2));
  });

  it('默认 provider 四步齐备且 qc 为 OVERALL 9 文样', async () => {
    const p = createDefaultMockProvider();
    const draft = await p.complete(baseReq({ meta: { step: 'draft', chapterNo: 1 } }));
    expect(countChars(draft.text)).toBe(500);
    const qc = await p.complete(baseReq({ meta: { step: 'qc' } }));
    expect(qc.text).toContain('OVERALL: 9');
    expect(qc.text).toContain('SEVERITY: minor');
    const rewrite = await p.complete(baseReq({ meta: { step: 'rewrite', chapterNo: 1 } }));
    expect(rewrite.text).toBe(draft.text);
    const summary = await p.complete(baseReq({ meta: { step: 'summarize' } }));
    expect(summary.text).toContain('SUMMARY:');
  });
});
