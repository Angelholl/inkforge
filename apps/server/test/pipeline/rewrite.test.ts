import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config';
import { chooseRewriteMode, buildRewriteSlots } from '../../src/pipeline/rewrite';
import type { L0Report } from '../../src/quality/l0';
import type { L1Report } from '../../src/quality/gate';
import type { Finding } from '@inkforge/shared';

const config = loadConfig({ STRATA_BASE_URL: 'http://x', STRATA_API_KEY: 'k', STRATA_MODEL: 'm' });

const f = (severity: Finding['severity']): Finding => ({ severity, dimension: '节奏', quote: 'q', comment: 'c' });

function l0(over: Partial<Pick<L0Report, 'hardFail' | 'softMajors' | 'checks'>> = {}): L0Report {
  return {
    checks: over.checks ?? [{ name: 'length', pass: true, details: '' }],
    hardFail: over.hardFail ?? false,
    softMajors: over.softMajors ?? 0,
    metrics: { charCount: 0, replayRatio: 0 },
    clicheHits: [],
  };
}
function l1(findings: Finding[]): L1Report {
  return { findings, invalidQuotes: 0, overall: 8.5, parseErrors: [], repaired: false };
}

describe('chooseRewriteMode 表驱动 4 例', () => {
  it('hardFail → full', () => {
    expect(chooseRewriteMode(l0({ hardFail: true }), l1([]))).toBe('full');
  });
  it('1 blocker → full', () => {
    expect(chooseRewriteMode(l0(), l1([f('blocker')]))).toBe('full');
  });
  it('仅 2 major、L0 全过 → targeted', () => {
    expect(chooseRewriteMode(l0(), l1([f('major'), f('major')]))).toBe('targeted');
  });
  it('1 major + 1 softMajor 且 L0 全过 → targeted', () => {
    expect(chooseRewriteMode(l0({ softMajors: 1 }), l1([f('major')]))).toBe('targeted');
  });
  it('L0 不通过检查项 ≥3 → full', () => {
    const checks = [
      { name: 'length' as const, pass: false, details: '' },
      { name: 'cliche' as const, pass: false, details: '' },
      { name: 'beat_coverage' as const, pass: false, details: '' },
    ];
    expect(chooseRewriteMode(l0({ checks }), l1([]))).toBe('full');
  });
});

describe('buildRewriteSlots', () => {
  it('targeted 未传 styleDims/fewShot → 槽名集维持精简集（兜底证不传不插、零回归）；findings 槽含 blocker 不含 minor', () => {
    const slots = buildRewriteSlots(
      {
        original: '原稿正文',
        findings: [f('blocker'), f('minor'), f('major')],
        factBaselineText: '事实基线',
        mode: 'targeted',
        taskInstruction: '仅修复所列问题',
        hardRules: '硬规则',
      },
      config.budgets.rewrite,
    );
    expect(slots.map((s) => s.name)).toEqual(['hardRules', 'original', 'findings', 'factBaseline', 'task']);
    const findingsSlot = slots.find((s) => s.name === 'findings')!;
    expect(findingsSlot.content).toContain('blocker');
    expect(findingsSlot.content).toContain('major');
    expect(findingsSlot.content).not.toContain('minor');
    expect(slots.find((s) => s.name === 'original')!.content).toBe('原稿正文');
    expect(slots.find((s) => s.name === 'hardRules')!.stable).toBe(true);
  });

  it('full 槽名集与 draftSlots 一致', () => {
    const slots = buildRewriteSlots(
      {
        original: '原稿',
        findings: [],
        factBaselineText: '',
        mode: 'full',
        taskInstruction: '按硬规则整章重写',
        hardRules: '硬规则',
        worldview: '世界观',
        blueprint: '蓝图',
        continuity: '连续性',
        prevTail: '上一章末尾',
        draftBudgets: config.budgets.draft,
      },
      config.budgets.rewrite,
    );
    expect(slots.map((s) => s.name)).toEqual(['hardRules', 'worldview', 'blueprint', 'continuity', 'prevTail', 'task']);
    expect(slots.find((s) => s.name === 'task')!.content).toBe('按硬规则整章重写');
  });

  it('targeted 传入 styleRules 时槽紧随 hardRules 且 stable（B1 精简槽）', () => {
    const slots = buildRewriteSlots(
      {
        original: '原稿正文',
        findings: [f('major')],
        factBaselineText: '事实基线',
        mode: 'targeted',
        taskInstruction: '仅修复所列问题',
        hardRules: '硬规则',
        styleRules: '节奏偏缓，少用感叹。',
      },
      config.budgets.rewrite,
    );
    expect(slots.map((s) => s.name)).toEqual(['hardRules', 'styleRules', 'original', 'findings', 'factBaseline', 'task']);
    const st = slots.find((s) => s.name === 'styleRules')!;
    expect(st.stable).toBe(true);
    expect(st.keep).toBe('head');
    expect(st.budgetChars).toBe(400);
    expect(st.content).toBe('节奏偏缓，少用感叹。');
  });

  it('targeted 传入 styleDims+fewShot → 双槽插 styleRules 后（DEC-2026-1122-03①）', () => {
    const slots = buildRewriteSlots(
      {
        original: '原稿正文',
        findings: [f('major')],
        factBaselineText: '事实基线',
        mode: 'targeted',
        taskInstruction: '仅修复所列问题',
        hardRules: '硬规则',
        styleRules: '节奏偏缓，少用感叹。',
        styleDims: '【文风画像】\n· 尺度：高直白度',
        fewShot: '【范例片段】\n样本',
      },
      config.budgets.rewrite,
    );
    expect(slots.map((s) => s.name)).toEqual(['hardRules', 'styleRules', 'styleDims', 'fewShot', 'original', 'findings', 'factBaseline', 'task']);
    const sd = slots.find((s) => s.name === 'styleDims')!;
    expect(sd.stable).toBe(true);
    expect(sd.budgetChars).toBe(1600); // 对齐 draft 槽（config.ts BUDGETS_DRAFT.styleDims）
    const fs = slots.find((s) => s.name === 'fewShot')!;
    expect(fs.stable).toBe(false);
    expect(fs.budgetChars).toBe(2500); // 对齐 draft 槽（config.ts BUDGETS_DRAFT.fewShot）
  });

  it('full 传入 styleDims 时经 draftSlots 产出 styleDims 槽', () => {
    const slots = buildRewriteSlots(
      {
        original: '原稿',
        findings: [],
        factBaselineText: '',
        mode: 'full',
        taskInstruction: '整章重写',
        hardRules: '硬规则',
        worldview: '世界观',
        styleDims: '【文风画像】\n· 节奏：测试画像',
        blueprint: '蓝图',
        continuity: '连续性',
        prevTail: '上一章末尾',
        draftBudgets: config.budgets.draft,
      },
      config.budgets.rewrite,
    );
    expect(slots.map((s) => s.name)).toEqual(['hardRules', 'worldview', 'styleDims', 'blueprint', 'continuity', 'prevTail', 'task']);
    expect(slots.find((s) => s.name === 'styleDims')!.stable).toBe(true);
  });
});
