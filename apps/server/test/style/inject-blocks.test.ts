import { describe, expect, it } from 'vitest';
import { AXIS_GUIDES, renderFreqTermsBlock, renderStyleBlock, renderStyleDimsBlock } from '../../src/style/inject';
import { STYLE_AXES, STYLE_DIMENSIONS, type StyleAxis, type StyleDimension } from '@inkforge/shared';
import type { StyleSample } from '../../src/style/distill';
import { buildRewriteSlots } from '../../src/pipeline/rewrite';
import { loadConfig } from '../../src/config';

const cfg = loadConfig({ STRATA_BASE_URL: 'http://x', STRATA_API_KEY: 'k', STRATA_MODEL: 'm' });

const emptyDims = Object.fromEntries(STYLE_DIMENSIONS.map((d) => [d, ''])) as Record<StyleDimension, string>;
const fullDims = Object.fromEntries(STYLE_DIMENSIONS.map((d) => [d, `${d}的画像描述`])) as Record<StyleDimension, string>;
const midAxes = Object.fromEntries(STYLE_AXES.map((a) => [a, 50])) as Record<StyleAxis, number>;
const samples: StyleSample[] = [{ id: 's1', text: '范例片段：他推开门，雨停了。' }];

describe('renderStyleDimsBlock 七维六轴语义句块', () => {
  it('轴值落低带出 low 句、落高带出 high 句、中带整行省略', () => {
    const axes: Record<StyleAxis, number> = { ...midAxes, 叙述温度: 20, 语言密度: 80 };
    const out = renderStyleDimsBlock(emptyDims, axes);
    expect(out).toContain('【六轴锚点】');
    expect(out).toContain(`叙述温度：${AXIS_GUIDES['叙述温度'].low}（值 20）`);
    expect(out).toContain(`语言密度：${AXIS_GUIDES['语言密度'].high}（值 80）`);
    expect(out).not.toContain('叙述者姿态');
    expect(out).not.toContain('幽默');
  });

  it('七维非空时首行为【文风画像】且七行维度齐全', () => {
    const out = renderStyleDimsBlock(fullDims, midAxes);
    const lines = out.split('\n');
    expect(lines[0]).toBe('【文风画像】');
    for (const d of STYLE_DIMENSIONS) {
      expect(lines).toContain(`· ${d}：${d}的画像描述`);
    }
    // 六轴全在中带 → 锚点小节仍出现但无轴行
    expect(lines.filter((l) => l.startsWith('· ') && /（值 \d+）/.test(l))).toHaveLength(0);
  });

  it('dims 全空且六轴全在中带 → 空串；超预算头部截断', () => {
    expect(renderStyleDimsBlock(emptyDims, midAxes)).toBe('');
    const longDims = Object.fromEntries(STYLE_DIMENSIONS.map((d) => [d, `${d}`.repeat(40)])) as Record<StyleDimension, string>;
    const out = renderStyleDimsBlock(longDims, midAxes, 50);
    expect(out.length).toBeLessThanOrEqual(50);
    expect(out.startsWith('【文风画像】')).toBe(true);
  });
});

describe('renderStyleBlock 空规则头修', () => {
  it('rulesText 为空（含纯空白）时不再产出【文风规则】头', () => {
    expect(renderStyleBlock('', samples)).not.toContain('【文风规则】');
    expect(renderStyleBlock('   ', samples, 1200)).not.toContain('【文风规则】');
    expect(renderStyleBlock('规则一', samples)).toContain('【文风规则】\n规则一');
    // 样本与术语行为不变
    expect(renderStyleBlock('', samples)).toContain('【范例片段】');
  });

  it('R-F1-4 注入隔离修正（DEC-2026-1125-03① 推翻 DEC-2026-1120-06 旧钉）：renderStyleBlock 仍不出高频词，常注由 renderFreqTermsBlock 独立承担', () => {
    const terms = [{ term: '青云剑诀', note: '核心功法' }];
    expect(renderStyleBlock('', samples, 1200, terms)).not.toContain('高频词');
    expect(renderFreqTermsBlock(terms, 600)).toContain('【高频词】');
    expect(renderFreqTermsBlock(terms, 600)).toContain('青云剑诀：核心功法');
    expect(renderFreqTermsBlock([], 600)).toBe('');
  });

  it('块序（DEC-2026-1120-10）：范例片段在前、术语表在后且截 5 条', () => {
    const terms = Array.from({ length: 8 }, (_, i) => ({ term: `术语${i}`, note: `注${i}` }));
    const block = renderStyleBlock('', samples, 100000, terms);
    expect(block.indexOf('【范例片段】')).toBeLessThan(block.indexOf('【术语表】'));
    expect(block).toContain('术语4：注4');
    expect(block).not.toContain('术语5：注5'); // slice(0,5)
    expect(block).not.toContain('高频词'); // renderStyleBlock 仍不出高频词（常注走独立槽，DEC-2026-1125-03①）
  });
});

describe('buildRewriteSlots freqTerms 常注槽（FB-F1-3，DEC-2026-1125-03①）', () => {
  it('R-F1-7 targeted 传 freqTerms → stable 槽插在硬规则后（无 styleRules/styleDims 时紧随 hardRules），预算 600', () => {
    const slots = buildRewriteSlots(
      { original: '原稿正文', findings: [], factBaselineText: '', mode: 'targeted', taskInstruction: '仅修复所列问题', hardRules: '硬规则', freqTerms: '【高频词】\n抬眸：测试语境说明' },
      cfg.budgets.rewrite,
    );
    expect(slots.map((s) => s.name)).toEqual(['hardRules', 'freqTerms', 'original', 'findings', 'factBaseline', 'task']);
    const ft = slots.find((s) => s.name === 'freqTerms')!;
    expect(ft.stable).toBe(true);
    expect(ft.keep).toBe('head');
    expect(ft.budgetChars).toBe(600);
  });
});
