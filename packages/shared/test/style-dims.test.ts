import { describe, expect, it } from 'vitest';
import {
  DIM_SOURCE_COEXIST,
  DIM_SOURCE_NONE,
  LEGACY_DIM_ALIAS,
  LEGACY_DIM_GROUPS,
  STYLE_DIMENSIONS,
  mapLegacyDimSource,
  mergeLegacyDimTexts,
} from '../src/index';

describe('shared/style-dims 六维表与读时别名', () => {
  it('退役八维别名表：8 键映射到新六名，分组按旧表序', () => {
    expect(STYLE_DIMENSIONS).toEqual(['语言与描写', '特色词汇', '结构与节奏', '情感基调', '尺度', '叙述方式']);
    expect(Object.keys(LEGACY_DIM_ALIAS)).toHaveLength(8);
    for (const name of Object.values(LEGACY_DIM_ALIAS)) expect(STYLE_DIMENSIONS).toContain(name);
    expect(LEGACY_DIM_ALIAS).toEqual({
      节奏: '结构与节奏',
      对话: '语言与描写',
      描写: '语言与描写',
      情感基调: '情感基调',
      尺度: '尺度',
      写作特点: '叙述方式',
      特色词汇: '特色词汇',
      章节结构: '结构与节奏',
    });
    expect(Object.keys(LEGACY_DIM_GROUPS)).toHaveLength(6);
    expect(LEGACY_DIM_GROUPS['语言与描写']).toEqual(['对话', '描写']);
    expect(LEGACY_DIM_GROUPS['结构与节奏']).toEqual(['节奏', '章节结构']);
  });

  it('mergeLegacyDimTexts：恒六键、旧名按旧表序拼接去重、新键优先、未知键忽略', () => {
    expect(mergeLegacyDimTexts({})).toEqual({
      语言与描写: '',
      特色词汇: '',
      结构与节奏: '',
      情感基调: '',
      尺度: '',
      叙述方式: '',
    });
    expect(mergeLegacyDimTexts({ 节奏: '甲', 章节结构: '甲' })['结构与节奏']).toBe('甲');
    expect(mergeLegacyDimTexts({ 对话: '甲', 描写: '乙' })['语言与描写']).toBe('甲；乙');
    expect(mergeLegacyDimTexts({ 写作特点: ' 丙 ', 视角: '丁' })['叙述方式']).toBe('丙');
    expect(mergeLegacyDimTexts({ 语言与描写: '新', 对话: '旧' })['语言与描写']).toBe('新');
    const nonString = { 对话: 123, 描写: null } as unknown as Record<string, string>;
    expect(mergeLegacyDimTexts(nonString)['语言与描写']).toBe('');
  });

  it('mapLegacyDimSource：哨兵优先、单键不记 splits、异值折主并记钉死文案', () => {
    expect(mapLegacyDimSource({ 节奏: 'pB', 章节结构: DIM_SOURCE_COEXIST }, 'pA')).toEqual({
      dimsSource: { 结构与节奏: DIM_SOURCE_COEXIST },
      splits: {},
    });
    expect(mapLegacyDimSource({ 节奏: 'pB', 章节结构: DIM_SOURCE_NONE }, 'pA')).toEqual({
      dimsSource: { 结构与节奏: DIM_SOURCE_NONE },
      splits: {},
    });
    expect(mapLegacyDimSource({ 节奏: 'pB', 章节结构: 'pC' }, 'pA')).toEqual({
      dimsSource: { 结构与节奏: 'pA' },
      splits: { 结构与节奏: '旧结构里这一组原本分开跟随档案（节奏/章节结构），重蒸该档案后可再分开' },
    });
    expect(mapLegacyDimSource({ 对话: 'pB' }, 'pA')).toEqual({ dimsSource: { 语言与描写: 'pB' }, splits: {} });
    expect(mapLegacyDimSource({ 情感基调: 'pB', 幻维: 'x' }, 'pA')).toEqual({ dimsSource: { 情感基调: 'pB' }, splits: {} });
    expect(mapLegacyDimSource({ 叙述方式: 'pB', 写作特点: 'pC' }, 'pA')).toEqual({ dimsSource: { 叙述方式: 'pB' }, splits: {} });
    const input = { 节奏: 'pB', 章节结构: 'pC' };
    expect(mapLegacyDimSource(input, 'pA')).toEqual(mapLegacyDimSource(input, 'pA'));
  });
});
