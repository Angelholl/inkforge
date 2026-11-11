import type { StepName } from '@inkforge/shared';
import { ProviderError, type CompletionRequest, type CompletionResult, type LlmProvider } from './types';

export type MockStepBehavior =
  | { text: string }
  | { textFn: (meta: CompletionRequest['meta']) => string }
  | { text: string; chunks: number; chunkDelayMs: number }
  | { textFn: (meta: CompletionRequest['meta']) => string; chunks: number; chunkDelayMs: number }
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

// 短句（≤7 字）：保证任意 8 字窗口都含【章N段i】标记 → 章间 8-gram 零重合（L0 重演阈值 0.35 之下）
const SENTENCES = [
  '夜雨初歇。',
  '山道泥泞。',
  '少年登程。',
  '枫叶贴石。',
  '茶棚歇脚。',
  '客商闲谈。',
  '告示新贴。',
  '墨迹未干。',
  '名字刺目。',
  '穿街读毕。',
  '折角记心。',
  '夜幕低垂。',
  '叩响侧门。',
  '来客审视。',
  '侧身放行。',
  '灯芯拨亮。',
  '影子一长一短',
  '夜谈至深。',
  '灯油见底。',
  '临别赠牌。',
];

/**
 * 500 字确定性草稿。每个 8 字窗口都含章号标记（【章N段i】），章间 8-gram 重合率为 0
 * （L0 重演阈值 0.35）；无套话表命中。
 */
export function makeMockDraft(chapterNo: number): string {
  let i = 0;
  let s = '';
  const unit = (idx: number) => `【章${chapterNo}段${idx}】${SENTENCES[idx % SENTENCES.length]}`;
  while (true) {
    s += unit(i++);
    if (s.length >= 520) break;
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
