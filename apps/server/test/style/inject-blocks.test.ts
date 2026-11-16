import { describe, expect, it } from 'vitest';
import { AXIS_GUIDES, renderStyleBlock, renderStyleDimsBlock } from '../../src/style/inject';
import { STYLE_AXES, STYLE_DIMENSIONS, type StyleAxis, type StyleDimension } from '@inkforge/shared';
import type { StyleSample } from '../../src/style/distill';

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
});
