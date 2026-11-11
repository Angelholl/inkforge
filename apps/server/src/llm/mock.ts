import { countChars } from '@inkforge/shared';
import type { StepName } from '@inkforge/shared';
import { ProviderError, type CompletionRequest, type CompletionResult, type LlmProvider } from './types';

export type MockStepBehavior =
  | { text: string }
  | { textFn: (meta: CompletionRequest['meta']) => string }
  | { text: string; chunks: number; chunkDelayMs: number }
  | { error: 'timeout' | 'http_500'; afterMs: number }
  | { sequence: MockStepBehavior[] }
  | { repeat: MockStepBehavior };

export type MockScript = Partial<Record<StepName, MockStepBehavior>>;

function makeAbort(): Error {
  const e = new Error('This operation was aborted');
  e.name = 'AbortError';
  return e;
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(makeAbort());
      return;
    }
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        reject(makeAbort());
      },
      { once: true },
    );
  });

function trimToCount(s: string, n: number): string {
  let count = 0;
  let end = 0;
  for (const ch of s) {
    if (!/\s/.test(ch)) count++;
    end += ch.length;
    if (count === n) break;
  }
  return s.slice(0, end);
}

const STORY = [
  '山道上雨痕未干，少年背着行囊走向镇子。',
  '枫叶贴在水洼边，他在岔路口辨认方向。',
  '茶棚里客商闲谈，风把话音吹散又送来。',
  '他捧着热茶取暖，目光停在告示墙上。',
  '新纸墨迹未干，写着一个他熟悉的名字。',
  '他穿过街面，逐字读完整段告示。',
  '折好纸角之前，他把要领默记在心。',
  '夜幕落下，他敲响客栈后院的侧门。',
  '门内的人看清来客，侧身放行。',
  '灯芯拨亮，墙上一长一短两个影子。',
  '这一夜他们谈了很久，直到灯油见底。',
  '临别时，门内的人塞给他一枚铜牌。',
];

/**
 * 500 字确定性草稿。每句嵌章号标记（【章N段i】），保证章间 8-gram 重合率
 * 远低于 0.35 阈值（固定正文会在多章挂机时误触 L0 重演检查）；无套话表命中。
 */
export function makeMockDraft(chapterNo: number): string {
  const parts = STORY.map((s, i) => `【章${chapterNo}段${i}】${s}`);
  let s = parts.join('');
  let n = 0;
  while (countChars(s) < 500) {
    s += `【章${chapterNo}回${n}】雨点敲着瓦檐，水线在青石上汇成细流。`;
    n++;
  }
  return trimToCount(s, 500);
}

const SUMMARY_SAMPLE = `SUMMARY: 主角抵达镇上，发现告示与故人相关，夜里与故人会面密谈。
BEATS:
- 抵达镇上
- 读告示
- 夜访故人
THREADS:
- [planted] 告示背后的势力
STATE:
少年={"位置":"客栈","持有":["告示内容"]}`;

/** T05-QC-PASS 文样：OVERALL 9 + 1 条 minor，QUOTE 为 makeMockDraft(1) 前缀子串。 */
function qcPassText(): string {
  const quote = makeMockDraft(1).slice(0, 8);
  return `OVERALL: 9
---
SEVERITY: minor
DIMENSION: 节奏
QUOTE: ${quote}
COMMENT: 开头行进节奏稍平，可压缩过渡句`;
}

export function createDefaultMockProvider(): LlmProvider {
  return createMockProvider({
    draft: { textFn: (m) => makeMockDraft(m.chapterNo ?? 1) },
    qc: { text: qcPassText() },
    rewrite: { textFn: (m) => makeMockDraft(m.chapterNo ?? 1) },
    summarize: { text: SUMMARY_SAMPLE },
  });
}

export function createMockProvider(script: MockScript): LlmProvider {
  const seqIndex = new Map<StepName, number>();
  async function runBehavior(behavior: MockStepBehavior, req: CompletionRequest): Promise<CompletionResult> {
    if (req.signal?.aborted) throw makeAbort();
    if ('repeat' in behavior) return runBehavior(behavior.repeat, req);
    if ('sequence' in behavior) {
      const step = req.meta.step;
      const i = seqIndex.get(step) ?? 0;
      seqIndex.set(step, i + 1);
      if (i >= behavior.sequence.length) throw new Error(`mock sequence exhausted for step ${step}`);
      return runBehavior(behavior.sequence[i], req);
    }
    if ('error' in behavior) {
      if (behavior.afterMs > 0) await sleep(behavior.afterMs, req.signal);
      throw new ProviderError(
        `mock injected error: ${behavior.error}`,
        behavior.error === 'timeout' ? 'timeout' : 'http_500',
        behavior.error === 'http_500' ? 500 : undefined,
      );
    }
    const text = 'textFn' in behavior ? behavior.textFn(req.meta) : behavior.text;
    if ('chunks' in behavior && behavior.chunks > 1 && req.onDelta) {
      const size = Math.ceil(text.length / behavior.chunks);
      for (let i = 0; i < text.length; i += size) {
        if (req.signal?.aborted) throw makeAbort();
        await sleep(behavior.chunkDelayMs, req.signal);
        req.onDelta(text.slice(i, i + size));
      }
    }
    if (req.signal?.aborted) throw makeAbort();
    return { text, usage: { promptTokens: 0, completionTokens: text.length }, finishReason: 'end_turn' };
  }
  return {
    async complete(req: CompletionRequest): Promise<CompletionResult> {
      const behavior = script[req.meta.step];
      if (!behavior) throw new Error(`mock script missing step ${req.meta.step}`);
      return runBehavior(behavior, req);
    },
  };
}
