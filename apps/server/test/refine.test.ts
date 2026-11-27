import { describe, expect, it } from 'vitest';
import type { AppConfig, ProviderConfig } from '../src/config';
import type { CompletionRequest, CompletionResult, LlmProvider } from '../src/llm/types';
import { estimateRefineTokens, refineDescriptionWithLlm, splitRefineSegments } from '../src/refine';

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

  it('map 段报错 → 原样重试一次后成功（原 refine-map-failed 语义更新）', async () => {
    const { provider, calls } = makeProvider((_req, index) => {
      if (index === 2) throw new Error('boom');
      return ok('摘'.repeat(10));
    });
    const result = await refineDescriptionWithLlm(deps(65536, provider), {
      raw: '甲'.repeat(40475),
      budgetChars: 20000,
    });
    expect(calls.length).toBe(6);
    expect(result.description.length).toBe(10);
    expect(result.truncated).toBe(false);
  });

  it('map 段空输出 → 原样重试一次后成功（原 refine-map-empty 语义更新）', async () => {
    const { provider, calls } = makeProvider((_req, index) => ok(index === 1 ? '' : '摘'.repeat(10)));
    const result = await refineDescriptionWithLlm(deps(65536, provider), {
      raw: '甲'.repeat(40475),
      budgetChars: 20000,
    });
    expect(calls.length).toBe(6);
    expect(result.description.length).toBe(10);
    expect(result.truncated).toBe(false);
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

describe('refine map-reduce 容错三件套', () => {
  it('分段器：微段（<50 字）并入下一段，以 \\n\\n 连接', () => {
    const micro = '微'.repeat(20);
    const big = '乙'.repeat(120);
    expect(splitRefineSegments(`${micro}\n\n${big}`)).toEqual([`${micro}\n\n${big}`]);
  });

  it('分段器：末位微段并入前段尾部', () => {
    const big = '乙'.repeat(120);
    const micro = '微'.repeat(20);
    expect(splitRefineSegments(`${big}\n\n${micro}`)).toEqual([`${big}\n\n${micro}`]);
  });

  it('分段器：连续微段依次并入下一段', () => {
    const m1 = '子'.repeat(10);
    const m2 = '丑'.repeat(10);
    const big = '乙'.repeat(120);
    expect(splitRefineSegments(`${m1}\n\n${m2}\n\n${big}`)).toEqual([`${m1}\n\n${m2}\n\n${big}`]);
  });

  it('分段器：现有段落边界 [5000,10666,9334,1000] 不受微段合并影响', () => {
    const raw = 'A'.repeat(5000) + '\n\n' + 'B'.repeat(20000) + '\n\n' + 'C'.repeat(1000);
    expect(splitRefineSegments(raw).map((s) => s.length)).toEqual([5000, 10666, 9334, 1000]);
  });

  it('map 空返回：首次空、重试给正常文本 → 整体成功且 reduce 含重试结果', async () => {
    const { provider, calls } = makeProvider((_req, index) =>
      ok(index === 1 ? '' : index === 2 ? '乙'.repeat(10) : '摘'.repeat(10)),
    );
    const result = await refineDescriptionWithLlm(deps(65536, provider), {
      raw: '甲'.repeat(40475),
      budgetChars: 20000,
    });
    expect(calls.length).toBe(6);
    expect(result.description.length).toBe(10);
    expect(calls[5].user).toContain('乙'.repeat(10));
  });

  it('map 异常：首次 throw、第二次成功 → 整体成功', async () => {
    const { provider, calls } = makeProvider((_req, index) => {
      if (index === 2) throw new Error('boom');
      return ok('摘'.repeat(10));
    });
    const result = await refineDescriptionWithLlm(deps(65536, provider), {
      raw: '甲'.repeat(40475),
      budgetChars: 20000,
    });
    expect(calls.length).toBe(6);
    expect(result.description.length).toBe(10);
  });

  it('map 异常：两次都失败 → 该段原文截断进 mapOutputs（reduce 可见）且 truncated=true', async () => {
    const { provider, calls } = makeProvider((_req, index) => {
      if (index === 2 || index === 3) throw new Error('boom');
      return ok('摘'.repeat(10));
    });
    const result = await refineDescriptionWithLlm(deps(65536, provider), {
      raw: '甲'.repeat(40475),
      budgetChars: 20000,
    });
    expect(calls.length).toBe(6);
    expect(calls[5].user).toContain('甲'.repeat(5000));
    expect(result.truncated).toBe(true);
  });

  it('abort 不吞：signal 在首次调用中 aborted → provider 恰 1 次即抛，无重试无回退', async () => {
    const controller = new AbortController();
    const { provider, calls } = makeProvider(() => {
      controller.abort(new Error('user-cancel'));
      throw new Error('network-abort');
    });
    await expect(
      refineDescriptionWithLlm(deps(65536, provider), {
        raw: '甲'.repeat(40475),
        budgetChars: 20000,
        signal: controller.signal,
      }),
    ).rejects.toThrow('user-cancel');
    expect(calls.length).toBe(1);
  });

  it('abort 不吞：signal 预先 aborted → provider 恰 1 次即抛，不重试不回退', async () => {
    const controller = new AbortController();
    controller.abort(new Error('pre-cancel'));
    const { provider, calls } = makeProvider(() => ok('摘'.repeat(10)));
    await expect(
      refineDescriptionWithLlm(deps(65536, provider), {
        raw: '甲'.repeat(40475),
        budgetChars: 20000,
        signal: controller.signal,
      }),
    ).rejects.toThrow('pre-cancel');
    expect(calls.length).toBe(1);
  });
});
