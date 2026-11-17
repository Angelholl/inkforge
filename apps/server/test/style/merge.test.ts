import { describe, expect, it } from 'vitest';
import { STYLE_AXES, STYLE_DIMENSIONS, type StyleAxis, type StyleDimension, type StyleTermDto } from '@inkforge/shared';
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
}): StyleBundleV2 {
  return buildStyleBundle({
    primaryProfileId: over.primaryProfileId ?? 'p1',
    auxProfileIds: over.auxProfileIds ?? [],
    dimsSource: over.dimsSource ?? {},
    profiles: over.profiles ?? { p1: prof({ dims: { ...fullDims }, axes: { ...fullAxes }, samples: [{ id: 's0', text: 't0' }, { id: 's1', text: 't1' }, { id: 's2', text: 't2' }, { id: 's3', text: 't3' }] }) },
    boundAt: over.boundAt ?? '2026-01-01T00:00:00.000Z',
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

  it('双档案按贡献维数加权取整：主 4 维 70 / 辅 3 维 56 → 64', () => {
    const dimsA = { 节奏: 'A节奏', 对话: 'A对话', 描写: 'A描写', 情感基调: 'A情感' } as Partial<Record<StyleDimension, string>>;
    const dimsB = { 写作特点: 'B写作', 特色词汇: 'B词汇', 章节结构: 'B章节' } as Partial<Record<StyleDimension, string>>;
    const b = bundle({
      primaryProfileId: 'pA',
      auxProfileIds: ['pB'],
      dimsSource: { 写作特点: 'pB', 特色词汇: 'pB', 章节结构: 'pB' },
      profiles: {
        pA: prof({ dims: dimsA, axes: { ...fullAxes, 叙述温度: 70 } }),
        pB: prof({ dims: dimsB, axes: { ...fullAxes, 叙述温度: 56 } }),
      },
    });
    const m = mergeStyleProfiles(b, 1);
    expect(m.axes['叙述温度']).toBe(64);
    expect(m.dims['写作特点']).toBe('B写作');
    expect(m.dims['节奏']).toBe('A节奏');
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
    const dimsA = { 节奏: 'A节奏', 对话: 'A对话', 描写: 'A描写', 情感基调: 'A情感' } as Partial<Record<StyleDimension, string>>;
    const dimsB = { 写作特点: 'B写作', 特色词汇: 'B词汇', 章节结构: 'B章节' } as Partial<Record<StyleDimension, string>>;
    const axesB = { ...fullAxes } as Partial<Record<StyleAxis, number>>;
    delete axesB['叙述温度'];
    const b = bundle({
      primaryProfileId: 'pA',
      auxProfileIds: ['pB'],
      dimsSource: { 写作特点: 'pB', 特色词汇: 'pB', 章节结构: 'pB' },
      profiles: {
        pA: prof({ dims: dimsA, axes: { ...fullAxes, 叙述温度: 70 } }),
        pB: prof({ dims: dimsB, axes: axesB }),
      },
    });
    const m = mergeStyleProfiles(b, 1);
    expect(m.axes['叙述温度']).toBe(70);
  });

  it('规则合并：主全量保留，辅去重补充受 400 总预算封顶', () => {
    const main380 = '甲'.repeat(380);
    const b1 = bundle({ profiles: { p1: prof({ rulesText: main380 }), p2: prof({ rulesText: '乙'.repeat(30) }) }, auxProfileIds: ['p2'] });
    const m1 = mergeStyleProfiles(b1, 1);
    expect(m1.rulesText.length).toBe(380);

    const main300 = '丙'.repeat(300);
    const b2 = bundle({ profiles: { p1: prof({ rulesText: main300 }), p2: prof({ rulesText: `${main300}\n${'丁'.repeat(60)}` }) }, auxProfileIds: ['p2'] });
    const m2 = mergeStyleProfiles(b2, 1);
    expect(m2.rulesText.length).toBe(300 + 1 + 60);
    expect(m2.rulesText.startsWith(main300)).toBe(true);
    expect(m2.rulesText.endsWith('丁'.repeat(60))).toBe(true);
  });

  it('主 rulesText 超 400：全量保留且不补辅', () => {
    const main420 = '戊'.repeat(420);
    const b = bundle({ profiles: { p1: prof({ rulesText: main420 }), p2: prof({ rulesText: '己'.repeat(20) }) }, auxProfileIds: ['p2'] });
    const m = mergeStyleProfiles(b, 1);
    expect(m.rulesText).toBe(main420);
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

  it('样本席位最大余数法：wA=4/wB=3 → A2+B1', () => {
    const dimsA = { 节奏: 'A节奏', 对话: 'A对话', 描写: 'A描写', 情感基调: 'A情感' } as Partial<Record<StyleDimension, string>>;
    const dimsB = { 写作特点: 'B写作', 特色词汇: 'B词汇', 章节结构: 'B章节' } as Partial<Record<StyleDimension, string>>;
    const poolA: StyleSample[] = [{ id: 'a0', text: 'xa0' }, { id: 'a1', text: 'xa1' }, { id: 'a2', text: 'xa2' }];
    const poolB: StyleSample[] = [{ id: 'b0', text: 'xb0' }, { id: 'b1', text: 'xb1' }];
    const b = bundle({
      primaryProfileId: 'pA',
      auxProfileIds: ['pB'],
      dimsSource: { 写作特点: 'pB', 特色词汇: 'pB', 章节结构: 'pB' },
      profiles: { pA: prof({ dims: dimsA, samples: poolA }), pB: prof({ dims: dimsB, samples: poolB }) },
    });
    const m = mergeStyleProfiles(b, 1);
    const ids = m.samples.map((s) => s.id);
    expect(ids.filter((id) => id.startsWith('pA:'))).toHaveLength(2);
    expect(ids.filter((id) => id.startsWith('pB:'))).toHaveLength(1);
    // id 命名空间前缀且不改池内原对象
    expect(ids.every((id) => id.includes(':'))).toBe(true);
    expect(poolA[0].id).toBe('a0');
  });

  it('样本逐章轮转：chapterNo=1 → [pA:s0,pA:s1]，chapterNo=2 → [pA:s1,pA:s2]', () => {
    const dimsA = { 节奏: 'A节奏', 对话: 'A对话' } as Partial<Record<StyleDimension, string>>;
    const poolA: StyleSample[] = [{ id: 's0', text: 'x0' }, { id: 's1', text: 'x1' }, { id: 's2', text: 'x2' }, { id: 's3', text: 'x3' }];
    const poolB: StyleSample[] = [{ id: 'b0', text: 'xb0' }];
    const b = bundle({
      primaryProfileId: 'pA',
      auxProfileIds: ['pB'],
      dimsSource: { 描写: 'pB' },
      profiles: { pA: prof({ dims: dimsA, samples: poolA }), pB: prof({ dims: { 描写: 'B描写' }, samples: poolB }) },
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
      dimsSource: Object.fromEntries(['写作特点', '特色词汇', '章节结构'].map((d) => [d, 'pB'])),
      profiles: {
        pA: prof({ dims: dimsA, axes: { ...fullAxes, 叙述温度: 70 } }),
        pB: prof({ dims: { 写作特点: '', 特色词汇: '', 章节结构: '' }, axes: { ...fullAxes, 叙述温度: 56 } }),
      },
    });
    const m = mergeStyleProfiles(b, 1);
    expect(m.axes['叙述温度']).toBe(70);
    expect(m.dims['写作特点']).toBe('写作特点的画像描述');
  });

  it('轴参与需 w>0：主缺该轴且其余档案均零贡献 → 该轴不写入结果', () => {
    const dimsB = { 节奏: 'B节奏', 对话: 'B对话', 描写: 'B描写', 情感基调: 'B情感', 写作特点: 'B写作', 特色词汇: 'B词汇', 章节结构: 'B章节' } as Partial<Record<StyleDimension, string>>;
    const axesA = { ...fullAxes } as Partial<Record<StyleAxis, number>>;
    delete axesA['叙述温度'];
    const b = bundle({
      primaryProfileId: 'pA',
      auxProfileIds: ['pB'],
      dimsSource: {},
      profiles: {
        pA: prof({ dims: { 节奏: 'A节奏', 对话: 'A对话' }, axes: axesA }),
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
        pB: prof({ rulesText: '乙'.repeat(120) }),
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
    const dimsA = { 节奏: 'A节奏', 对话: 'A对话', 描写: 'A描写' } as Partial<Record<StyleDimension, string>>;
    const dimsB = { 情感基调: 'B情感', 写作特点: 'B写作' } as Partial<Record<StyleDimension, string>>;
    const dimsC = { 特色词汇: 'C词汇', 章节结构: 'C章节' } as Partial<Record<StyleDimension, string>>;
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
    expect(c.dims).toEqual({});
    expect(c.axes).toEqual({});
    expect(c.terms).toEqual([]);
    expect(c.samples).toEqual([]);
    expect(c.version).toBe(3);
    expect(c.metricsJson).toBe('');
  });

  it('确定性：同输入两次 deep-equal + profiles 键序置换输出不变', () => {
    const dimsA = { 节奏: 'A节奏', 对话: 'A对话' } as Partial<Record<StyleDimension, string>>;
    const dimsB = { 描写: 'B描写' } as Partial<Record<StyleDimension, string>>;
    const profiles: Record<string, StyleProfileContent> = {
      pA: prof({ dims: dimsA, axes: { ...fullAxes, 叙述温度: 70 }, samples: [{ id: 'a0', text: 'xa0' }, { id: 'a1', text: 'xa1' }] }),
      pB: prof({ dims: dimsB, axes: { ...fullAxes, 叙述温度: 56 }, samples: [{ id: 'b0', text: 'xb0' }] }),
    };
    const b1 = bundle({ primaryProfileId: 'pA', auxProfileIds: ['pB'], dimsSource: { 描写: 'pB' }, profiles });
    const r1 = mergeStyleProfiles(b1, 1);
    const r2 = mergeStyleProfiles(b1, 1);
    expect(r2).toEqual(r1);
    const b2 = bundle({ primaryProfileId: 'pA', auxProfileIds: ['pB'], dimsSource: { 描写: 'pB' }, profiles: { pB: profiles.pB, pA: profiles.pA } });
    expect(mergeStyleProfiles(b2, 1)).toEqual(r1);
  });
});
