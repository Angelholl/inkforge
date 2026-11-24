import { describe, expect, it } from 'vitest';
import { DIM_SOURCE_COEXIST, DIM_SOURCE_NONE, STYLE_AXES, STYLE_DIMENSIONS, type StyleAxis, type StyleDimension, type StyleTermDto } from '@inkforge/shared';
import type { StyleSample } from '../../src/style/distill';
import {
  buildStyleBundle,
  contentFromProfileRow,
  mergeStyleProfiles,
  normalizeDimsSource,
  parseStyleBundle,
  type StyleBundleV2,
  type StyleProfileContent,
} from '../../src/style/merge';

const fullDims = Object.fromEntries(STYLE_DIMENSIONS.map((d) => [d, `${d}的画像描述`])) as Record<StyleDimension, string>;
const fullAxes = Object.fromEntries(STYLE_AXES.map((a) => [a, 50])) as Record<StyleAxis, number>;

function prof(over: Partial<StyleProfileContent> = {}): StyleProfileContent {
  return { version: 1, metricsJson: '', rulesText: '', dims: {}, axes: {}, terms: [], samples: [], ...over };
}

function bundle(over: {
  primaryProfileId?: string;
  auxProfileIds?: string[];
  dimsSource?: Record<string, string>;
  profiles?: Record<string, StyleProfileContent>;
  boundAt?: string;
  weights?: Record<string, number>;
}): StyleBundleV2 {
  return buildStyleBundle({
    primaryProfileId: over.primaryProfileId ?? 'p1',
    auxProfileIds: over.auxProfileIds ?? [],
    dimsSource: over.dimsSource ?? {},
    profiles: over.profiles ?? { p1: prof({ dims: { ...fullDims }, axes: { ...fullAxes }, samples: [{ id: 's0', text: 't0' }, { id: 's1', text: 't1' }, { id: 's2', text: 't2' }, { id: 's3', text: 't3' }] }) },
    boundAt: over.boundAt ?? '2026-01-01T00:00:00.000Z',
    weights: over.weights,
  });
}

describe('mergeStyleProfiles 风格合并纯函数', () => {
  it('单主档案：七维全主、六轴原值、样本配额 3', () => {
    const axes = { ...fullAxes, 叙述温度: 70, 幽默: 80 };
    const b = bundle({ profiles: { p1: prof({ dims: { ...fullDims }, axes, samples: [{ id: 's0', text: 't0' }, { id: 's1', text: 't1' }, { id: 's2', text: 't2' }, { id: 's3', text: 't3' }] }) } });
    const m = mergeStyleProfiles(b, 1);
    for (const d of STYLE_DIMENSIONS) expect(m.dims[d]).toBe(`${d}的画像描述`);
    expect(m.axes).toEqual(axes);
    expect(m.samples).toHaveLength(3);
    expect(m.primaryMetricsJson).toBe('');
  });

  it('双档案按贡献维数加权取整：主 2 维 70 / 辅 3 维 56 → 62', () => {
    const dimsA = { 语言与描写: 'A对话；A描写', 结构与节奏: 'A节奏', 情感基调: 'A情感' } as Partial<Record<StyleDimension, string>>;
    const dimsB = { 叙述方式: 'B写作', 特色词汇: 'B词汇', 结构与节奏: 'B章节' } as Partial<Record<StyleDimension, string>>;
    const b = bundle({
      primaryProfileId: 'pA',
      auxProfileIds: ['pB'],
      dimsSource: { 叙述方式: 'pB', 特色词汇: 'pB', 结构与节奏: 'pB' },
      profiles: {
        pA: prof({ dims: dimsA, axes: { ...fullAxes, 叙述温度: 70 } }),
        pB: prof({ dims: dimsB, axes: { ...fullAxes, 叙述温度: 56 } }),
      },
    });
    const m = mergeStyleProfiles(b, 1);
    expect(m.axes['叙述温度']).toBe(62);
    expect(m.dims['叙述方式']).toBe('B写作');
    expect(m.dims['结构与节奏']).toBe('B章节');
  });

  it('主零贡献保底权重 1：主 70 / 辅 56 → 58', () => {
    const b = bundle({
      primaryProfileId: 'pA',
      auxProfileIds: ['pB'],
      dimsSource: Object.fromEntries(STYLE_DIMENSIONS.map((d) => [d, 'pB'])),
      profiles: {
        pA: prof({ dims: { ...fullDims }, axes: { ...fullAxes, 叙述温度: 70 } }),
        pB: prof({ dims: { ...fullDims }, axes: { ...fullAxes, 叙述温度: 56 } }),
      },
    });
    const m = mergeStyleProfiles(b, 1);
    expect(m.axes['叙述温度']).toBe(58);
  });

  it('辅档案缺轴值 → 该轴在有余值档案间重归一', () => {
    const dimsA = { 语言与描写: 'A对话；A描写', 结构与节奏: 'A节奏', 情感基调: 'A情感' } as Partial<Record<StyleDimension, string>>;
    const dimsB = { 叙述方式: 'B写作', 特色词汇: 'B词汇', 结构与节奏: 'B章节' } as Partial<Record<StyleDimension, string>>;
    const axesB = { ...fullAxes } as Partial<Record<StyleAxis, number>>;
    delete axesB['叙述温度'];
    const b = bundle({
      primaryProfileId: 'pA',
      auxProfileIds: ['pB'],
      dimsSource: { 叙述方式: 'pB', 特色词汇: 'pB', 结构与节奏: 'pB' },
      profiles: {
        pA: prof({ dims: dimsA, axes: { ...fullAxes, 叙述温度: 70 } }),
        pB: prof({ dims: dimsB, axes: axesB }),
      },
    });
    const m = mergeStyleProfiles(b, 1);
    expect(m.axes['叙述温度']).toBe(70);
  });

  it('规则合并：主全量保留，辅去重补充受 800 总预算封顶（预算内追加）', () => {
    const main700 = '甲'.repeat(700);
    const b1 = bundle({ profiles: { p1: prof({ rulesText: main700 }), p2: prof({ rulesText: '乙'.repeat(30) }) }, auxProfileIds: ['p2'] });
    const m1 = mergeStyleProfiles(b1, 1);
    expect(m1.rulesText.length).toBe(700 + 1 + 30);
  });

  it('辅行超 800 封顶：break 当前辅档案不再补', () => {
    const main700 = '丙'.repeat(700);
    const b2 = bundle({ profiles: { p1: prof({ rulesText: main700 }), p2: prof({ rulesText: `${main700}\n${'丁'.repeat(120)}` }) }, auxProfileIds: ['p2'] });
    const m2 = mergeStyleProfiles(b2, 1);
    expect(m2.rulesText).toBe(main700); // 首行重复跳过；次行 700+1+120=821>800 → break
  });

  it('主 rulesText 超 800：全量保留且不补辅', () => {
    const main850 = '戊'.repeat(850);
    const b = bundle({ profiles: { p1: prof({ rulesText: main850 }), p2: prof({ rulesText: '己'.repeat(20) }) }, auxProfileIds: ['p2'] });
    const m = mergeStyleProfiles(b, 1);
    expect(m.rulesText).toBe(main850);
  });

  it('术语并集主优先、上限 10 条', () => {
    const mainTerms: StyleTermDto[] = Array.from({ length: 8 }, (_, i) => ({ term: `主术语${i}`, note: `注${i}` }));
    const auxTerms: StyleTermDto[] = [
      { term: '主术语6', note: '辅重复注' },
      { term: '主术语7', note: '辅重复注' },
      { term: '辅新词1', note: '辅注1' },
      { term: '辅新词2', note: '辅注2' },
    ];
    const b = bundle({ profiles: { p1: prof({ terms: mainTerms }), p2: prof({ terms: auxTerms }) }, auxProfileIds: ['p2'] });
    const m = mergeStyleProfiles(b, 1);
    expect(m.terms).toHaveLength(10);
    expect(m.terms.slice(0, 8)).toEqual(mainTerms);
    expect(m.terms[8]).toEqual({ term: '辅新词1', note: '辅注1' });
    expect(m.terms[9]).toEqual({ term: '辅新词2', note: '辅注2' });
  });

  it('freqTerms 并集主优先、上限 10 条；缺字段按 [] 兜底（DEC-2026-1120-06）', () => {
    const mainFreq: StyleTermDto[] = Array.from({ length: 8 }, (_, i) => ({ term: `主高频${i}`, note: `注${i}` }));
    const auxFreq: StyleTermDto[] = [
      { term: '主高频6', note: '辅重复注' },
      { term: '主高频7', note: '辅重复注' },
      { term: '辅高频1', note: '辅注1' },
      { term: '辅高频2', note: '辅注2' },
    ];
    const b = bundle({ profiles: { p1: prof({ freqTerms: mainFreq }), p2: prof({ freqTerms: auxFreq }) }, auxProfileIds: ['p2'] });
    const m = mergeStyleProfiles(b, 1);
    expect(m.freqTerms).toHaveLength(10);
    expect(m.freqTerms.slice(0, 8)).toEqual(mainFreq);
    expect(m.freqTerms[8]).toEqual({ term: '辅高频1', note: '辅注1' });
    expect(m.freqTerms[9]).toEqual({ term: '辅高频2', note: '辅注2' });
    // 双方均无 freqTerms（旧档案）→ []
    const none = mergeStyleProfiles(bundle({ auxProfileIds: ['p2'] }), 1);
    expect(none.freqTerms).toEqual([]);
  });

  it('样本席位最大余数法：wA=2/wB=3 → A1+B2', () => {
    const dimsA = { 语言与描写: 'A对话；A描写', 结构与节奏: 'A节奏', 情感基调: 'A情感' } as Partial<Record<StyleDimension, string>>;
    const dimsB = { 叙述方式: 'B写作', 特色词汇: 'B词汇', 结构与节奏: 'B章节' } as Partial<Record<StyleDimension, string>>;
    const poolA: StyleSample[] = [{ id: 'a0', text: 'xa0' }, { id: 'a1', text: 'xa1' }, { id: 'a2', text: 'xa2' }];
    const poolB: StyleSample[] = [{ id: 'b0', text: 'xb0' }, { id: 'b1', text: 'xb1' }];
    const b = bundle({
      primaryProfileId: 'pA',
      auxProfileIds: ['pB'],
      dimsSource: { 叙述方式: 'pB', 特色词汇: 'pB', 结构与节奏: 'pB' },
      profiles: { pA: prof({ dims: dimsA, samples: poolA }), pB: prof({ dims: dimsB, samples: poolB }) },
    });
    const m = mergeStyleProfiles(b, 1);
    const ids = m.samples.map((s) => s.id);
    expect(ids.filter((id) => id.startsWith('pA:'))).toHaveLength(1);
    expect(ids.filter((id) => id.startsWith('pB:'))).toHaveLength(2);
    // id 命名空间前缀且不改池内原对象
    expect(ids.every((id) => id.includes(':'))).toBe(true);
    expect(poolA[0].id).toBe('a0');
  });

  it('样本逐章轮转：chapterNo=1 → [pA:s0,pA:s1]，chapterNo=2 → [pA:s1,pA:s2]', () => {
    const dimsA = { 结构与节奏: 'A节奏', 语言与描写: 'A对话' } as Partial<Record<StyleDimension, string>>;
    const poolA: StyleSample[] = [{ id: 's0', text: 'x0' }, { id: 's1', text: 'x1' }, { id: 's2', text: 'x2' }, { id: 's3', text: 'x3' }];
    const poolB: StyleSample[] = [{ id: 'b0', text: 'xb0' }];
    const b = bundle({
      primaryProfileId: 'pA',
      auxProfileIds: ['pB'],
      dimsSource: { 语言与描写: 'pB' },
      profiles: { pA: prof({ dims: dimsA, samples: poolA }), pB: prof({ dims: { 语言与描写: 'B描写' }, samples: poolB }) },
    });
    const m1 = mergeStyleProfiles(b, 1);
    const idsA1 = m1.samples.map((s) => s.id).filter((id) => id.startsWith('pA:'));
    expect(idsA1).toEqual(['pA:s0', 'pA:s1']);
    const m2 = mergeStyleProfiles(b, 2);
    const idsA2 = m2.samples.map((s) => s.id).filter((id) => id.startsWith('pA:'));
    expect(idsA2).toEqual(['pA:s1', 'pA:s2']);
  });

  it('辅样本不足 → 空缺席位顺延主池补满 3', () => {
    const poolA: StyleSample[] = [{ id: 'a0', text: 'xa0' }, { id: 'a1', text: 'xa1' }, { id: 'a2', text: 'xa2' }, { id: 'a3', text: 'xa3' }];
    const b = bundle({
      primaryProfileId: 'pA',
      auxProfileIds: ['pB'],
      dimsSource: Object.fromEntries(STYLE_DIMENSIONS.map((d) => [d, 'pB'])),
      profiles: { pA: prof({ dims: { ...fullDims }, samples: poolA }), pB: prof({ dims: { ...fullDims }, samples: [] }) },
    });
    const m = mergeStyleProfiles(b, 1);
    expect(m.samples).toHaveLength(3);
    expect(m.samples.map((s) => s.id)).toEqual(['pA:a0', 'pA:a1', 'pA:a2']);
  });

  it('V1 旧快照适配：单主七维全主、注入形状齐备', () => {
    const raw = JSON.stringify({
      profileId: 'p1',
      version: 1,
      rulesJson: '{"rulesText":"R","dims":{},"axes":{},"terms":[]}',
      samplesJson: '[{"id":"s0","text":"t"}]',
      boundAt: '2026-01-02T00:00:00.000Z',
    });
    const b = parseStyleBundle(raw);
    expect(b).toBeDefined();
    const m = mergeStyleProfiles(b!, 1);
    expect(m.rulesText).toBe('R');
    expect(m.samples).toHaveLength(1);
    expect(m.samples[0]).toEqual({ id: 'p1:s0', text: 't' });
    const norm = normalizeDimsSource(b!.dimsSource, b!.primaryProfileId);
    for (const d of STYLE_DIMENSIONS) expect(norm[d]).toBe('p1');
    for (const d of STYLE_DIMENSIONS) expect(typeof m.dims[d]).toBe('string');
    expect(m.terms).toEqual([]);
    expect(typeof m.axes).toBe('object');
    expect(m.primaryMetricsJson).toBe('');
  });

  it('损坏快照 JSON → undefined', () => {
    expect(parseStyleBundle('not-json{')).toBeUndefined();
    expect(parseStyleBundle(null)).toBeUndefined();
    expect(parseStyleBundle(undefined)).toBeUndefined();
    expect(parseStyleBundle('{"rulesJson":"{}"}')).toBeUndefined();
  });

  it('normalizeDimsSource：缺键/越权值/空串全归主', () => {
    const norm = normalizeDimsSource({ 对话: 'pX', 描写: '', 节奏: 'p1' }, 'p1');
    for (const d of STYLE_DIMENSIONS) expect(norm[d]).toBe('p1');
  });

  it('实际贡献计权：辅映射维文本空回落主 → 权归主、辅零贡献不参与轴', () => {
    const dimsA = { ...fullDims };
    const b = bundle({
      primaryProfileId: 'pA',
      auxProfileIds: ['pB'],
      dimsSource: Object.fromEntries(['叙述方式', '特色词汇', '结构与节奏'].map((d) => [d, 'pB'])),
      profiles: {
        pA: prof({ dims: dimsA, axes: { ...fullAxes, 叙述温度: 70 } }),
        pB: prof({ dims: { 叙述方式: '', 特色词汇: '', 结构与节奏: '' }, axes: { ...fullAxes, 叙述温度: 56 } }),
      },
    });
    const m = mergeStyleProfiles(b, 1);
    expect(m.axes['叙述温度']).toBe(70);
    expect(m.dims['叙述方式']).toBe('叙述方式的画像描述');
  });

  it('轴参与需 w>0：主缺该轴且其余档案均零贡献 → 该轴不写入结果', () => {
    const dimsB = { 结构与节奏: 'B节奏；B章节', 语言与描写: 'B对话；B描写', 情感基调: 'B情感', 叙述方式: 'B写作', 特色词汇: 'B词汇' } as Partial<Record<StyleDimension, string>>;
    const axesA = { ...fullAxes } as Partial<Record<StyleAxis, number>>;
    delete axesA['叙述温度'];
    const b = bundle({
      primaryProfileId: 'pA',
      auxProfileIds: ['pB'],
      dimsSource: {},
      profiles: {
        pA: prof({ dims: { 结构与节奏: 'A节奏', 语言与描写: 'A对话' }, axes: axesA }),
        pB: prof({ dims: dimsB, axes: { ...fullAxes, 叙述温度: 56 } }),
      },
    });
    const m = mergeStyleProfiles(b, 1);
    expect('叙述温度' in m.axes).toBe(false);
    expect(m.axes['幽默']).toBe(50);
  });

  it('规则多辅：B 行超预算 break、C 短行仍可补入', () => {
    const main300 = '甲'.repeat(300);
    const b = bundle({
      primaryProfileId: 'pA',
      profiles: {
        pA: prof({ rulesText: main300 }),
        pB: prof({ rulesText: '乙'.repeat(520) }), // 800 封顶下仍超预算：300+1+520=821>800 → break（DEC-2026-1120-10 冲击清单漏列项主审补录）
        pC: prof({ rulesText: '丙'.repeat(60) }),
      },
      auxProfileIds: ['pB', 'pC'],
    });
    const m = mergeStyleProfiles(b, 1);
    expect(m.rulesText.length).toBe(361);
    expect(m.rulesText).not.toContain('乙');
    expect(m.rulesText.endsWith('丙'.repeat(60))).toBe(true);
  });

  it('样本顺延多轮循环：A 池 1/B 池 0/C 池 5 → A1+C2', () => {
    const dimsA = { 结构与节奏: 'A节奏', 语言与描写: 'A对话；A描写' } as Partial<Record<StyleDimension, string>>;
    const dimsB = { 情感基调: 'B情感', 叙述方式: 'B写作' } as Partial<Record<StyleDimension, string>>;
    const dimsC = { 特色词汇: 'C词汇', 结构与节奏: 'C章节' } as Partial<Record<StyleDimension, string>>;
    const poolA: StyleSample[] = [{ id: 'a0', text: 'xa0' }];
    const poolC: StyleSample[] = [{ id: 'c0', text: 'xc0' }, { id: 'c1', text: 'xc1' }, { id: 'c2', text: 'xc2' }, { id: 'c3', text: 'xc3' }, { id: 'c4', text: 'xc4' }];
    const b = bundle({
      primaryProfileId: 'pA',
      auxProfileIds: ['pB', 'pC'],
      dimsSource: { ...dimsB, ...dimsC },
      profiles: { pA: prof({ dims: dimsA, samples: poolA }), pB: prof({ dims: dimsB, samples: [] }), pC: prof({ dims: dimsC, samples: poolC }) },
    });
    const m = mergeStyleProfiles(b, 1);
    const ids = m.samples.map((s) => s.id);
    expect(ids.filter((id) => id.startsWith('pA:'))).toHaveLength(1);
    expect(ids.filter((id) => id.startsWith('pB:'))).toHaveLength(0);
    expect(ids.filter((id) => id.startsWith('pC:'))).toHaveLength(2);
    expect(ids).toEqual(['pA:a0', 'pC:c0', 'pC:c1']);
  });

  it('辅列表含主去重：同一档案不双计权重与样本', () => {
    const p = prof({ dims: { ...fullDims }, axes: { ...fullAxes, 叙述温度: 70 }, samples: [{ id: 's0', text: 'x0' }, { id: 's1', text: 'x1' }, { id: 's2', text: 'x2' }, { id: 's3', text: 'x3' }] });
    const withDup = mergeStyleProfiles(bundle({ primaryProfileId: 'p1', auxProfileIds: ['p1'], profiles: { p1: p } }), 1);
    const pure = mergeStyleProfiles(bundle({ primaryProfileId: 'p1', auxProfileIds: [], profiles: { p1: p } }), 1);
    expect(withDup).toEqual(pure);
  });

  it('contentFromProfileRow：坏 JSON/缺键降级空内容不抛', () => {
    const c = contentFromProfileRow({ version: 3, rules_json: 'not-json{', samples_json: 'x', metrics_json: '' });
    expect(c.rulesText).toBe('');
    expect(c.dims).toEqual({ 语言与描写: '', 特色词汇: '', 结构与节奏: '', 情感基调: '', 尺度: '', 叙述方式: '' });
    expect(c.axes).toEqual({});
    expect(c.terms).toEqual([]);
    expect(c.samples).toEqual([]);
    expect(c.version).toBe(3);
    expect(c.metricsJson).toBe('');
  });

  it('确定性：同输入两次 deep-equal + profiles 键序置换输出不变', () => {
    const dimsA = { 结构与节奏: 'A节奏', 语言与描写: 'A对话' } as Partial<Record<StyleDimension, string>>;
    const dimsB = { 语言与描写: 'B描写' } as Partial<Record<StyleDimension, string>>;
    const profiles: Record<string, StyleProfileContent> = {
      pA: prof({ dims: dimsA, axes: { ...fullAxes, 叙述温度: 70 }, samples: [{ id: 'a0', text: 'xa0' }, { id: 'a1', text: 'xa1' }] }),
      pB: prof({ dims: dimsB, axes: { ...fullAxes, 叙述温度: 56 }, samples: [{ id: 'b0', text: 'xb0' }] }),
    };
    const b1 = bundle({ primaryProfileId: 'pA', auxProfileIds: ['pB'], dimsSource: { 语言与描写: 'pB' }, profiles });
    const r1 = mergeStyleProfiles(b1, 1);
    const r2 = mergeStyleProfiles(b1, 1);
    expect(r2).toEqual(r1);
    const b2 = bundle({ primaryProfileId: 'pA', auxProfileIds: ['pB'], dimsSource: { 语言与描写: 'pB' }, profiles: { pB: profiles.pB, pA: profiles.pA } });
    expect(mergeStyleProfiles(b2, 1)).toEqual(r1);
  });
});

describe('weights 加权路径（DEC-2026-1117-05）', () => {
  /** 与「双档案按贡献维数加权取整」同型的基准 fixture：主 pA 叙述温度 70（2 维实际贡献）、辅 pB 56（3 维实际贡献）。 */
  function abProfiles(samplesA = false, samplesB = false, axesB?: Partial<Record<StyleAxis, number>>): Record<string, StyleProfileContent> {
    const dimsA = { 语言与描写: 'A对话；A描写', 结构与节奏: 'A节奏', 情感基调: 'A情感' } as Partial<Record<StyleDimension, string>>;
    const dimsB = { 叙述方式: 'B写作', 特色词汇: 'B词汇', 结构与节奏: 'B章节' } as Partial<Record<StyleDimension, string>>;
    const poolA: StyleSample[] = [{ id: 'a0', text: 'xa0' }, { id: 'a1', text: 'xa1' }, { id: 'a2', text: 'xa2' }, { id: 'a3', text: 'xa3' }];
    const poolB: StyleSample[] = [{ id: 'b0', text: 'xb0' }, { id: 'b1', text: 'xb1' }];
    return {
      pA: prof({ dims: dimsA, axes: { ...fullAxes, 叙述温度: 70 }, samples: samplesA ? poolA : [] }),
      pB: prof({ dims: dimsB, axes: axesB ?? { ...fullAxes, 叙述温度: 56 }, samples: samplesB ? poolB : [] }),
    };
  }

  const DIMS_SRC_3B = { 叙述方式: 'pB', 特色词汇: 'pB', 结构与节奏: 'pB' };
  const DIMS_SRC_ALL_B = Object.fromEntries(STYLE_DIMENSIONS.map((d) => [d, 'pB']));

  it('legacy 回归：mergeVersion=1 无 weights bundle 走贡献维数计权（主 2 维 70/辅 3 维 56 → 62）', () => {
    // 手写字面量直喂（不经 buildStyleBundle，防 mergeVersion=2 污染）：无 weights 键 = legacy 路径
    const legacyBundle: StyleBundleV2 = {
      v: 2,
      mergeVersion: 1,
      boundAt: '2026-01-01T00:00:00.000Z',
      primaryProfileId: 'pA',
      auxProfileIds: ['pB'],
      dimsSource: { ...DIMS_SRC_3B },
      profiles: abProfiles(true, true),
    };
    const m = mergeStyleProfiles(legacyBundle, 1);
    expect(m.axes['叙述温度']).toBe(62);
    const parsed = parseStyleBundle(JSON.stringify(legacyBundle));
    expect(parsed?.weights).toBeUndefined();
  });

  it('legacy 回归：主保底 1 生效（六维全辅 wA=1/wB=6 → 58）', () => {
    // pB 六维文本俱全 → 六维实际来源全为 pB（主零实际贡献）→ legacy 主保底 1
    const legacyBundle: StyleBundleV2 = {
      v: 2,
      mergeVersion: 1,
      boundAt: '2026-01-01T00:00:00.000Z',
      primaryProfileId: 'pA',
      auxProfileIds: ['pB'],
      dimsSource: { ...DIMS_SRC_ALL_B },
      profiles: {
        pA: prof({ dims: { ...fullDims }, axes: { ...fullAxes, 叙述温度: 70 } }),
        pB: prof({ dims: { ...fullDims }, axes: { ...fullAxes, 叙述温度: 56 } }),
      },
    };
    const m = mergeStyleProfiles(legacyBundle, 1);
    expect(m.axes['叙述温度']).toBe(58);
  });

  it('加权六轴：weights {pA:70,pB:30} → (70×70+30×56)/100=65.8→66', () => {
    const b = bundle({
      primaryProfileId: 'pA',
      auxProfileIds: ['pB'],
      dimsSource: { ...DIMS_SRC_3B },
      profiles: abProfiles(),
      weights: { pA: 70, pB: 30 },
    });
    const m = mergeStyleProfiles(b, 1);
    expect(m.axes['叙述温度']).toBe(66);
    expect(m.dims['叙述方式']).toBe('B写作'); // 七维不受比例影响
    expect(m.dims['结构与节奏']).toBe('B章节');
  });

  it('加权样本席位：70/30 → pA 2 席 pB 1 席', () => {
    const b = bundle({
      primaryProfileId: 'pA',
      auxProfileIds: ['pB'],
      dimsSource: { ...DIMS_SRC_3B },
      profiles: abProfiles(true, true),
      weights: { pA: 70, pB: 30 },
    });
    const m = mergeStyleProfiles(b, 1);
    const ids = m.samples.map((s) => s.id);
    expect(ids.filter((id) => id.startsWith('pA:'))).toHaveLength(2); // exact 2.1 → floor 2
    expect(ids.filter((id) => id.startsWith('pB:'))).toHaveLength(1); // exact 0.9 → 余席 0.9>0.1 归 pB
  });

  it('加权且辅缺轴 → 权重重归一：pB 无叙述温度 → 该轴仅 pA 参与 → 70', () => {
    const axesB = { ...fullAxes } as Partial<Record<StyleAxis, number>>;
    delete axesB['叙述温度'];
    const b = bundle({
      primaryProfileId: 'pA',
      auxProfileIds: ['pB'],
      dimsSource: { ...DIMS_SRC_3B },
      profiles: abProfiles(false, false, axesB),
      weights: { pA: 70, pB: 30 },
    });
    const m = mergeStyleProfiles(b, 1);
    expect(m.axes['叙述温度']).toBe(70);
  });

  it('主保底废除：加权路径六维全辅 weights {50,50} → 63（legacy 同输入为 58）', () => {
    const b = bundle({
      primaryProfileId: 'pA',
      auxProfileIds: ['pB'],
      dimsSource: { ...DIMS_SRC_ALL_B },
      profiles: abProfiles(),
      weights: { pA: 50, pB: 50 },
    });
    const m = mergeStyleProfiles(b, 1);
    expect(m.axes['叙述温度']).toBe(63); // (70×50+56×50)/100=63，无主保底
  });

  it('weights 缺键/非法防御：{pA:100} 缺 pB → pB 权 0：六轴取 pA 原值 70、样本 3 席全 pA', () => {
    const b = bundle({
      primaryProfileId: 'pA',
      auxProfileIds: ['pB'],
      dimsSource: { ...DIMS_SRC_3B },
      profiles: abProfiles(true, true),
      weights: { pA: 100 },
    });
    const m = mergeStyleProfiles(b, 1);
    expect(m.axes['叙述温度']).toBe(70);
    const ids = m.samples.map((s) => s.id);
    expect(ids.filter((id) => id.startsWith('pA:'))).toHaveLength(3);
    expect(ids.filter((id) => id.startsWith('pB:'))).toHaveLength(0);
  });

  it('weights 全非法（W=0）防御：{pA:0,pB:0} → 六轴不写入、样本顺延主→辅补满', () => {
    const b = bundle({
      primaryProfileId: 'pA',
      auxProfileIds: ['pB'],
      dimsSource: { ...DIMS_SRC_3B },
      profiles: abProfiles(true, true),
      weights: { pA: 0, pB: 0 },
    });
    const m = mergeStyleProfiles(b, 1);
    expect(Object.keys(m.axes)).toHaveLength(0);
    expect(m.samples.map((s) => s.id)).toEqual(['pA:a0', 'pA:a1', 'pB:b0']); // 顺延循环按主→辅补满
  });

  it('mergeVersion 与 weights 序列化门：带 weights → mergeVersion=2 且 JSON 含键、parse 回读；不带 → 无键 undefined；V1 → undefined', () => {
    const withW = bundle({ primaryProfileId: 'pA', auxProfileIds: ['pB'], dimsSource: {}, weights: { pA: 70, pB: 30 } });
    expect(withW.mergeVersion).toBe(2);
    const raw = JSON.stringify(withW);
    expect(raw).toContain('"weights"');
    expect(parseStyleBundle(raw)?.weights).toEqual({ pA: 70, pB: 30 });

    const noW = bundle({ primaryProfileId: 'pA', auxProfileIds: ['pB'], dimsSource: {} });
    expect(JSON.stringify(noW)).not.toContain('"weights"');
    expect(parseStyleBundle(JSON.stringify(noW))?.weights).toBeUndefined();

    const v1raw = JSON.stringify({ profileId: 'p1', version: 1, rulesJson: '{"rulesText":"R"}', samplesJson: '[]', boundAt: '2026-01-02T00:00:00.000Z' });
    expect(parseStyleBundle(v1raw)?.weights).toBeUndefined();
  });

  it('单档案加权 weights {p1:100}：输出与 legacy 单主 deep-equal（六轴原值/样本 3/dims 全主）', () => {
    const p = prof({
      dims: { ...fullDims },
      axes: { ...fullAxes, 叙述温度: 70 },
      samples: [{ id: 's0', text: 'x0' }, { id: 's1', text: 'x1' }, { id: 's2', text: 'x2' }, { id: 's3', text: 'x3' }],
    });
    const weighted = mergeStyleProfiles(bundle({ primaryProfileId: 'p1', profiles: { p1: p }, weights: { p1: 100 } }), 1);
    const legacy = mergeStyleProfiles(bundle({ primaryProfileId: 'p1', profiles: { p1: p } }), 1);
    expect(weighted).toEqual(legacy);
    expect(weighted.samples).toHaveLength(3);
  });
});

describe('七维共存（DEC-2026-1118-03）', () => {
  it('共存维拼接：特色词汇=主辅按绑定序 "A词汇；B词汇"，单源维不受影响', () => {
    const b = bundle({
      primaryProfileId: 'pA',
      auxProfileIds: ['pB'],
      dimsSource: { 特色词汇: DIM_SOURCE_COEXIST },
      profiles: { pA: prof({ dims: { 特色词汇: 'A词汇', 结构与节奏: 'A节奏' } }), pB: prof({ dims: { 特色词汇: 'B词汇' } }) },
    });
    const m = mergeStyleProfiles(b, 1);
    expect(m.dims['特色词汇']).toBe('A词汇；B词汇');
    expect(m.dims['结构与节奏']).toBe('A节奏');
  });

  it('共存全等去重：辅文本与主全等 → 只出现一次，legacy 计权只记主（辅零贡献 → 该轴取主原值）', () => {
    const same = Object.fromEntries(STYLE_DIMENSIONS.map((d) => [d, `${d}同文`])) as Partial<Record<StyleDimension, string>>;
    const b = bundle({
      primaryProfileId: 'pA',
      auxProfileIds: ['pB'],
      dimsSource: Object.fromEntries(STYLE_DIMENSIONS.map((d) => [d, DIM_SOURCE_COEXIST])),
      profiles: { pA: prof({ dims: same, axes: { ...fullAxes, 叙述温度: 70 } }), pB: prof({ dims: { ...same }, axes: { ...fullAxes, 叙述温度: 56 } }) },
    });
    const m = mergeStyleProfiles(b, 1);
    expect(m.dims['特色词汇']).toBe('特色词汇同文'); // 无 '；' 拼接痕迹
    expect(m.axes['叙述温度']).toBe(70); // 去重段不计辅贡献 → wB=0 不参与
  });

  it('共存计权：六维全共存主辅文本各异 → legacy wA=6/wB=6 → 轴 63、样本 A2+B1', () => {
    const dimsA = Object.fromEntries(STYLE_DIMENSIONS.map((d) => [d, `A${d}`])) as Partial<Record<StyleDimension, string>>;
    const dimsB = Object.fromEntries(STYLE_DIMENSIONS.map((d) => [d, `B${d}`])) as Partial<Record<StyleDimension, string>>;
    const poolA: StyleSample[] = [{ id: 'a0', text: 'xa0' }, { id: 'a1', text: 'xa1' }, { id: 'a2', text: 'xa2' }];
    const poolB: StyleSample[] = [{ id: 'b0', text: 'xb0' }];
    const b = bundle({
      primaryProfileId: 'pA',
      auxProfileIds: ['pB'],
      dimsSource: Object.fromEntries(STYLE_DIMENSIONS.map((d) => [d, DIM_SOURCE_COEXIST])),
      profiles: { pA: prof({ dims: dimsA, axes: { ...fullAxes, 叙述温度: 70 }, samples: poolA }), pB: prof({ dims: dimsB, axes: { ...fullAxes, 叙述温度: 56 }, samples: poolB }) },
    });
    const m = mergeStyleProfiles(b, 1);
    expect(m.axes['叙述温度']).toBe(63); // (6×70+6×56)/12
    const ids = m.samples.map((s) => s.id);
    expect(ids.filter((id) => id.startsWith('pA:'))).toHaveLength(2); // 1.5/1.5 平手主先补足
    expect(ids.filter((id) => id.startsWith('pB:'))).toHaveLength(1);
    expect(m.dims['结构与节奏']).toBe('A结构与节奏；B结构与节奏');
  });

  it('共存单边空/全空：辅该维空 → 仅主文本；该维全空 → 空串不占注入行', () => {
    const b = bundle({
      primaryProfileId: 'pA',
      auxProfileIds: ['pB'],
      dimsSource: { 特色词汇: DIM_SOURCE_COEXIST, 结构与节奏: DIM_SOURCE_COEXIST },
      profiles: { pA: prof({ dims: { 特色词汇: 'A词汇' } }), pB: prof({ dims: {} }) },
    });
    const m = mergeStyleProfiles(b, 1);
    expect(m.dims['特色词汇']).toBe('A词汇');
    expect(m.dims['结构与节奏']).toBe('');
  });

  it('加权路径与共存正交：weights {pA:60,pB:40} + 共存维 → 轴 64、共存拼接照常', () => {
    const b = bundle({
      primaryProfileId: 'pA',
      auxProfileIds: ['pB'],
      dimsSource: { 特色词汇: DIM_SOURCE_COEXIST },
      weights: { pA: 60, pB: 40 },
      profiles: { pA: prof({ dims: { 特色词汇: 'A词汇' }, axes: { ...fullAxes, 叙述温度: 70 } }), pB: prof({ dims: { 特色词汇: 'B词汇' }, axes: { ...fullAxes, 叙述温度: 56 } }) },
    });
    const m = mergeStyleProfiles(b, 1);
    expect(m.axes['叙述温度']).toBe(64); // (60×70+40×56)/100=64.4→64
    expect(m.dims['特色词汇']).toBe('A词汇；B词汇');
  });
});

describe('七维不采用（DEC-2026-1124-04）', () => {
  it('哨兵维空文本零贡献：特色词汇=DIM_SOURCE_NONE → 该维恒空，其余维照常；axes/samples 与「来源文本空」对照组全等，对照组回落主档文本（分界钉）', () => {
    const profiles = {
      pA: prof({ dims: { 特色词汇: 'A词汇', 结构与节奏: 'A节奏' }, axes: { ...fullAxes, 叙述温度: 70 } }),
      pB: prof({ dims: { 特色词汇: '', 结构与节奏: 'B节奏' }, axes: { ...fullAxes, 叙述温度: 56 } }), // pB 特色词汇文本空
    };
    const sent = mergeStyleProfiles(
      bundle({ primaryProfileId: 'pA', auxProfileIds: ['pB'], dimsSource: { 特色词汇: DIM_SOURCE_NONE, 结构与节奏: 'pB' }, profiles }), 1,
    );
    expect(sent.dims['特色词汇']).toBe(''); // 哨兵维空文本，不回落主档
    expect(sent.dims['结构与节奏']).toBe('B节奏'); // 其余维不受影响
    const ctrl = mergeStyleProfiles(
      bundle({ primaryProfileId: 'pA', auxProfileIds: ['pB'], dimsSource: { 特色词汇: 'pB', 结构与节奏: 'pB' }, profiles }), 1,
    );
    expect(sent.axes).toEqual(ctrl.axes); // 哨兵零贡献 ≈ 该维来源文本空（对照）→ 加权不受影响
    expect(sent.samples.map((s) => s.id)).toEqual(ctrl.samples.map((s) => s.id)); // 席位不受影响
    expect(ctrl.dims['特色词汇']).toBe('A词汇'); // 对照分界：来源文本空→回落主档文本；哨兵→恒空
  });
});

describe('读时别名接线（DM-1）', () => {
  it('parseStyleBundle：V2 旧键 dimsSource 归六维（哨兵优先）、逐 profile dims 旧文按组拼接', () => {
    const raw = JSON.stringify({
      profileId: 'pA',
      auxProfileIds: ['pB'],
      dimsSource: { 对话: 'pB', 节奏: 'pC', 章节结构: DIM_SOURCE_COEXIST },
      profiles: {
        pA: prof({ dims: { 对话: '甲', 描写: '乙' } as unknown as Partial<Record<StyleDimension, string>> }),
        pB: prof({ dims: { 节奏: '丙' } as unknown as Partial<Record<StyleDimension, string>> }),
      },
    });
    const bundle = parseStyleBundle(raw)!;
    expect(bundle.dimsSource).toEqual({ 语言与描写: 'pB', 结构与节奏: DIM_SOURCE_COEXIST });
    expect(bundle.profiles.pA.dims['语言与描写']).toBe('甲；乙');
    expect(bundle.profiles.pB.dims['结构与节奏']).toBe('丙');
  });

  it('parseStyleBundle：V1 旧快照 rulesJson 内八维 dims 读出即六维', () => {
    const raw = JSON.stringify({
      profileId: 'pA',
      version: 1,
      rulesJson: JSON.stringify({ rulesText: '', dims: { 节奏: '丁' } }),
      samplesJson: '[]',
    });
    const bundle = parseStyleBundle(raw)!;
    expect(bundle.profiles.pA.dims['结构与节奏']).toBe('丁');
  });

  it('contentFromProfileRow：rules_json 含旧八维 dims → 返回恰六键', () => {
    const row = {
      version: 1,
      rules_json: JSON.stringify({ rulesText: 'R', dims: { 节奏: '甲', 对话: '乙', 描写: '丙', 写作特点: '丁', 章节结构: '戊' } }),
      samples_json: '[]',
      metrics_json: '{}',
    };
    const content = contentFromProfileRow(row);
    expect(Object.keys(content.dims)).toHaveLength(6);
    expect(content.dims['结构与节奏']).toBe('甲；戊');
    expect(content.dims['语言与描写']).toBe('乙；丙');
  });
});
