import { describe, expect, it } from 'vitest';
import { injectionFaceFingerprint, type InjectionFace } from '../../src/fusion/fingerprint';

const FACE: InjectionFace = {
  description: '示例之作：一个平凡学徒在北境书院求索的修炼故事。',
  styleBinding: {
    primaryProfileId: 'p-main',
    auxProfileIds: ['p-aux'],
    dimsSource: { 对白: 'p-aux' },
    weights: { 'p-main': 60, 'p-aux': 40 },
  },
  styleFewshotOn: true,
  styleSnapshotJson: '{"profileId":"p-main","version":1}',
  plotProfileId: 'p-plot',
  spectrumProfileId: 'p-spec',
  imitationProfileId: 'p-imit',
};

describe('injectionFaceFingerprint（规格 §3.5 触发指纹钉）', () => {
  it('同输入两次调用 → 指纹逐字符相等（N3 确定性）', () => {
    expect(injectionFaceFingerprint(FACE)).toBe(injectionFaceFingerprint({ ...FACE }));
  });

  it('注入面七要素各自变化 → 指纹均改变', () => {
    const base = injectionFaceFingerprint(FACE);
    const variants: Array<[string, InjectionFace]> = [
      ['description 变一字符', { ...FACE, description: FACE.description + '。' }],
      ['weights 变一值', { ...FACE, styleBinding: { ...FACE.styleBinding!, weights: { 'p-main': 70, 'p-aux': 30 } } }],
      ['dimsSource 变一映射', { ...FACE, styleBinding: { ...FACE.styleBinding!, dimsSource: { 对白: 'p-main' } } }],
      ['styleFewshotOn 翻转', { ...FACE, styleFewshotOn: false }],
      ['styleSnapshotJson 变', { ...FACE, styleSnapshotJson: '{"profileId":"p-main","version":2}' }],
      ['plotProfileId 变', { ...FACE, plotProfileId: 'p-plot2' }],
      ['spectrumProfileId 变', { ...FACE, spectrumProfileId: 'p-spec2' }],
      ['imitationProfileId 变', { ...FACE, imitationProfileId: 'p-imit2' }],
      ['styleBinding 解绑为 null', { ...FACE, styleBinding: null }],
    ];
    for (const [label, face] of variants) {
      expect(injectionFaceFingerprint(face), label).not.toBe(base);
    }
  });

  it('接口键集恰七键，无 mandate/词表键（R6 结构级钉）', () => {
    expect(Object.keys(FACE).sort()).toEqual(
      ['description', 'imitationProfileId', 'plotProfileId', 'spectrumProfileId', 'styleBinding', 'styleFewshotOn', 'styleSnapshotJson'].sort(),
    );
    expect(Object.keys(FACE)).not.toContain('landingMandateJson');
    expect(Object.keys(FACE)).not.toContain('landingWords');
  });
});
