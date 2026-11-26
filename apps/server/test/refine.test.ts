import { describe, expect, it } from 'vitest';
import type { AppConfig, ProviderConfig } from '../src/config';
import type { CompletionRequest, CompletionResult, LlmProvider } from '../src/llm/types';
import { estimateRefineTokens, refineDescriptionWithLlm } from '../src/refine';

const LOCAL_MAX_OUTPUT = 8192;
const TIMEOUT = 180000;

function makeProviderConfig(contextWindow: number): ProviderConfig {
  return {
    name: 'local',
    baseURL: 'http://localhost',
    apiKey: 'test',
    model: 'test-model',
    contextWindow,
    maxOutput: LOCAL_MAX_OUTPUT,
    supportsJsonSchema: false,
  };
}

const config = {
  timeouts: { refine: TIMEOUT },
  providers: { local: { maxOutput: LOCAL_MAX_OUTPUT } },
} as unknown as AppConfig;

function ok(text: string): CompletionResult {
  return { text, usage: { promptTokens: 0, completionTokens: 0 }, finishReason: 'stop' };
}

function makeProvider(
  handler: (req: CompletionRequest, index: number) => CompletionResult | Promise<CompletionResult>,
) {
  const calls: CompletionRequest[] = [];
  const provider: LlmProvider = {
    async complete(req) {
      const index = calls.length;
      calls.push(req);
      return handler(req, index);
    },
  };
  return { provider, calls };
}

function deps(contextWindow: number, provider: LlmProvider) {
  return { provider, config, providerConfig: makeProviderConfig(contextWindow) };
}

function segmentSizes(calls: CompletionRequest[], count: number): number[] {
  return calls.slice(0, count).map((c) => {
    const match = c.user.match(/【本段字数】(\d+)/);
    expect(match).not.toBeNull();
    return Number(match![1]);
  });
}

describe('refine 双路径引擎', () => {
  it('单次路径：12000 字输入 + contextWindow=524288 → provider.complete 恰 1 次、description.length=20000、truncated=true，每次 timeoutMs=180000 且 meta.step=refine', async () => {
    const { provider, calls } = makeProvider(() => ok('摘'.repeat(30000)));
    const result = await refineDescriptionWithLlm(deps(524288, provider), {
      raw: '甲'.repeat(12000),
      budgetChars: 20000,
    });
    expect(calls.length).toBe(1);
    expect(calls[0].timeoutMs).toBe(180000);
    expect(calls[0].meta.step).toBe('refine');
    expect(result.description.length).toBe(20000);
    expect(result.truncated).toBe(true);
  });

  it('prompt 含规则/约束/人物关系网与 20000 上限字串', async () => {
    const { provider, calls } = makeProvider(() => ok('摘'.repeat(10)));
    await refineDescriptionWithLlm(deps(524288, provider), {
      raw: '甲'.repeat(12000),
      budgetChars: 20000,
    });
    const prompt = calls[0].user;
    for (const keyword of ['规则', '约束', '人物关系网', '20000']) expect(prompt).toContain(keyword);
  });

  it('输入触发边界：32000 字→1 次；32001 字→5 次（4 map+1 reduce）', async () => {
    const p1 = makeProvider(() => ok('摘'.repeat(10)));
    const r1 = await refineDescriptionWithLlm(deps(524288, p1.provider), {
      raw: '甲'.repeat(32000),
      budgetChars: 20000,
    });
    expect(p1.calls.length).toBe(1);
    expect(r1.description.length).toBe(10);

    const p2 = makeProvider(() => ok('摘'.repeat(10)));
    await refineDescriptionWithLlm(deps(524288, p2.provider), {
      raw: '甲'.repeat(32001),
      budgetChars: 20000,
    });
    expect(p2.calls.length).toBe(5);
  });

  it('窗口触发边界：contextWindow=80000→1 次；65536→3 次（12000 字切 2 段+reduce）；22143→抛 refine-context-too-small', async () => {
    const raw = '甲'.repeat(12000);
    const p1 = makeProvider(() => ok('摘'.repeat(10)));
    await refineDescriptionWithLlm(deps(80000, p1.provider), { raw, budgetChars: 20000 });
    expect(p1.calls.length).toBe(1);

    const p2 = makeProvider(() => ok('摘'.repeat(10)));
    await refineDescriptionWithLlm(deps(65536, p2.provider), { raw, budgetChars: 20000 });
    expect(p2.calls.length).toBe(3);

    const p3 = makeProvider(() => ok('摘'.repeat(10)));
    await expect(
      refineDescriptionWithLlm(deps(22143, p3.provider), { raw, budgetChars: 20000 }),
    ).rejects.toThrow('refine-context-too-small');
  });

  it('64K 窗 + 40475 字 → 4 map + 1 reduce 共 5 次；每段 ≤10666 字（估算 ≤16000 token）；description.length=20000、truncated=true、每次 timeoutMs=180000', async () => {
    const { provider, calls } = makeProvider((_req, index) =>
      ok(index < 4 ? '摘'.repeat(8000) : '终'.repeat(30000)),
    );
    const result = await refineDescriptionWithLlm(deps(65536, provider), {
      raw: '甲'.repeat(40475),
      budgetChars: 20000,
    });
    expect(calls.length).toBe(5);
    expect(segmentSizes(calls, 4)).toEqual([10666, 10666, 10666, 8477]);
    for (const size of segmentSizes(calls, 4)) expect(estimateRefineTokens('甲'.repeat(size))).toBeLessThanOrEqual(16000);
    for (const call of calls) {
      expect(call.timeoutMs).toBe(180000);
      expect(call.meta.step).toBe('refine');
    }
    expect(result.description.length).toBe(20000);
    expect(result.truncated).toBe(true);
  });

  it('段落边界：\\n\\n 优先且不跨段合并，超 10666 字单段硬切 → 段长 [5000,10666,9334,1000]', async () => {
    const raw = 'A'.repeat(5000) + '\n\n' + 'B'.repeat(20000) + '\n\n' + 'C'.repeat(1000);
    const { provider, calls } = makeProvider(() => ok('摘'.repeat(10)));
    await refineDescriptionWithLlm(deps(65536, provider), { raw, budgetChars: 20000 });
    expect(calls.length).toBe(5);
    expect(segmentSizes(calls, 4)).toEqual([5000, 10666, 9334, 1000]);
  });

  it('map 段报错 → 抛 refine-map-failed: segment 3/4，无部分结果', async () => {
    const { provider, calls } = makeProvider((_req, index) => {
      if (index === 2) throw new Error('boom');
      return ok('摘'.repeat(10));
    });
    await expect(
      refineDescriptionWithLlm(deps(65536, provider), {
        raw: '甲'.repeat(40475),
        budgetChars: 20000,
      }),
    ).rejects.toThrow('refine-map-failed: segment 3/4');
    expect(calls.length).toBe(3);
  });

  it('map 段空输出 → 抛 refine-map-empty: segment 2/4', async () => {
    const { provider, calls } = makeProvider((_req, index) => ok(index === 1 ? '' : '摘'.repeat(10)));
    await expect(
      refineDescriptionWithLlm(deps(65536, provider), {
        raw: '甲'.repeat(40475),
        budgetChars: 20000,
      }),
    ).rejects.toThrow('refine-map-empty: segment 2/4');
    expect(calls.length).toBe(2);
  });

  it('reduce 报错 → refine-reduce-failed；reduce 空输出 → refine-reduce-empty', async () => {
    const raw = '甲'.repeat(40475);
    const p1 = makeProvider((_req, index) => {
      if (index === 4) throw new Error('boom');
      return ok('摘'.repeat(10));
    });
    await expect(
      refineDescriptionWithLlm(deps(65536, p1.provider), { raw, budgetChars: 20000 }),
    ).rejects.toThrow('refine-reduce-failed');

    const p2 = makeProvider((_req, index) => ok(index === 4 ? '' : '摘'.repeat(10)));
    await expect(
      refineDescriptionWithLlm(deps(65536, p2.provider), { raw, budgetChars: 20000 }),
    ).rejects.toThrow('refine-reduce-empty');
  });

  it('map 输出超 chunkBudgetChars → 硬截断到 5000 且最终 truncated=true', async () => {
    const { provider, calls } = makeProvider((_req, index) =>
      ok(index < 4 ? '摘'.repeat(8000) : '终'.repeat(100)),
    );
    const result = await refineDescriptionWithLlm(deps(65536, provider), {
      raw: '甲'.repeat(40475),
      budgetChars: 20000,
    });
    for (const call of calls.slice(0, 4)) expect(call.user).toContain('预算 5000 字');
    expect(result.description.length).toBe(100);
    expect(result.truncated).toBe(true);
  });
});
