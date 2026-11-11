import { describe, expect, it } from 'vitest';
import { pickFewShotSamples, sampleReferenceText } from '../../src/style/sample';
import { pickStyleSamples, renderStyleBlock } from '../../src/style/inject';
import { computeStyleMetrics, driftOverBandItems } from '../../src/style/metrics';

describe('sampleReferenceText', () => {
  it('确定性（两次 deep equal）', () => {
    const text = '甲'.repeat(50000);
    expect(sampleReferenceText(text)).toEqual(sampleReferenceText(text));
  });

  it('40 块取 20；20 块以内全取', () => {
    const text = '甲乙丙丁'.repeat(10000); // 40000 字 → segmentChars 1000 → 40 块
    const picked = sampleReferenceText(text, { segmentChars: 1000, maxSegments: 20 });
    expect(picked.length).toBe(20);
    expect(picked.every((p) => p.length <= 1000)).toBe(true);
    const few = sampleReferenceText('甲'.repeat(15000), { segmentChars: 1000, maxSegments: 20 });
    expect(few.length).toBe(15); // 15 块全取
  });
});

describe('pickFewShotSamples', () => {
  it('滑窗均匀取 count 段，确定性', () => {
    const text = '正文段落'.repeat(200); // 800 字
    const a = pickFewShotSamples(text, { count: 4, minChars: 200, maxChars: 400 });
    const b = pickFewShotSamples(text, { count: 4, minChars: 200, maxChars: 400 });
    expect(a).toEqual(b);
    expect(a.length).toBe(4);
    expect(a.every((s) => s.length >= 200 && s.length <= 400)).toBe(true);
  });

  it('文本不足 minChars → []', () => {
    expect(pickFewShotSamples('太短', { minChars: 200 })).toEqual([]);
  });
});

describe('pickStyleSamples + renderStyleBlock', () => {
  const samples = [1, 2, 3, 4, 5].map((i) => ({ id: `s${i}`, text: `片段${i}` }));

  it('len=3 时 ch1 与 ch4 选样 deep equal（轮换周期）', () => {
    const three = samples.slice(0, 3);
    expect(pickStyleSamples(three, 1)).toEqual(pickStyleSamples(three, 4));
    expect(pickStyleSamples(three, 1)).toEqual([three[0], three[1], three[2]]);
    expect(pickStyleSamples(three, 2)).toEqual([three[1], three[2], three[0]]);
  });

  it('len=5 时 ch2 → [s2,s3,s4]', () => {
    expect(pickStyleSamples(samples, 2).map((s) => s.id)).toEqual(['s2', 's3', 's4']);
  });

  it('renderStyleBlock 预算截断', () => {
    const block = renderStyleBlock('规则行', samples, 50);
    expect(block.length).toBeLessThanOrEqual(50);
    const full = renderStyleBlock('规则行', samples, 10000);
    expect(full).toContain('片段5');
  });
});

describe('computeStyleMetrics', () => {
  it('10 句 × 10 字 → medianSentenceLen 10', () => {
    const text = Array.from({ length: 10 }, () => '字'.repeat(10)).join('。') + '。';
    const m = computeStyleMetrics(text);
    expect(m.medianSentenceLen).toBe(10);
  });

  it('1/3 引号内容 → dialogueRatio ≈ 0.33', () => {
    const text = '他说：“这是引号内的话，一共十五个字左右吧”。' + '这是叙述文字没有对话，凑足两倍长度以获得三分之一比例。'.repeat(2);
    const m = computeStyleMetrics(text);
    expect(m.dialogueRatio).toBeGreaterThan(0.2);
    expect(m.dialogueRatio).toBeLessThan(0.5);
  });

  it('driftOverBandItems：超带计数与 0 基准跳过', () => {
    const ref = { medianSentenceLen: 10, p90SentenceLen: 20, dialogueRatio: 0, uniqueCharRatio: 0 };
    const draft = '短。'.repeat(5); // median 1 → |1-10|/10=0.9 超带
    expect(driftOverBandItems(draft, ref)).toBe(2); // median + p90，dialogue/unique 基准 0 跳过
  });
});
