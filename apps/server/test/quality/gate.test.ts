import { describe, expect, it } from 'vitest';
import { decideGate, type L1Report } from '../../src/quality/gate';
import type { L0Report } from '../../src/quality/l0';

const CFG = { scoreThreshold: 8.0, maxRounds: 2, minGain: 0.05 };

function l0(over: Partial<Pick<L0Report, 'hardFail' | 'softMajors'>> = {}): L0Report {
  return { checks: [], hardFail: over.hardFail ?? false, softMajors: over.softMajors ?? 0, metrics: { charCount: 0, replayRatio: 0 }, clicheHits: [] };
}
function l1(over: Partial<L1Report> = {}): L1Report {
  return {
    findings: over.findings ?? [],
    invalidQuotes: 0,
    overall: over.overall ?? 9,
    parseErrors: [],
    repaired: false,
  };
}

describe('decideGate 表驱动 8 例', () => {
  it('① hardFail + 轮满(2/2) → needs_human', () => {
    const r = decideGate({ l0: l0({ hardFail: true }), l1: l1(), roundsUsed: 2 }, CFG);
    expect(r.action).toBe('needs_human');
  });
  it('① hardFail + 轮未满 → rewrite', () => {
    const r = decideGate({ l0: l0({ hardFail: true }), l1: l1(), roundsUsed: 0 }, CFG);
    expect(r.action).toBe('rewrite');
  });
  it('softMajor×1 + major×0 + overall 8.5 → pass', () => {
    const r = decideGate({ l0: l0({ softMajors: 1 }), l1: l1({ overall: 8.5 }), roundsUsed: 0 }, CFG);
    expect(r.action).toBe('pass');
  });
  it('softMajor×1 + major×1 → rewrite', () => {
    const r = decideGate(
      { l0: l0({ softMajors: 1 }), l1: l1({ findings: [{ severity: 'major', dimension: '节奏', quote: 'q', comment: 'c' }], overall: 8.5 }), roundsUsed: 0 },
      CFG,
    );
    expect(r.action).toBe('rewrite');
  });
  it('③ blocker×1 → rewrite', () => {
    const r = decideGate(
      { l0: l0(), l1: l1({ findings: [{ severity: 'blocker', dimension: '设定一致', quote: 'q', comment: 'c' }] }), roundsUsed: 1 },
      CFG,
    );
    expect(r.action).toBe('rewrite');
  });
  it('④ overall 7.9 → rewrite', () => {
    const r = decideGate({ l0: l0(), l1: l1({ overall: 7.9 }), roundsUsed: 0 }, CFG);
    expect(r.action).toBe('rewrite');
  });
  it('④ overall 8.0（边界含）→ pass', () => {
    const r = decideGate({ l0: l0(), l1: l1({ overall: 8.0 }), roundsUsed: 0 }, CFG);
    expect(r.action).toBe('pass');
  });
  it("⑤' prevOverall 5.0 → 5.2（增益 4%）→ needs_human（无改善先于阈值）", () => {
    const r = decideGate({ l0: l0(), l1: l1({ overall: 5.2 }), roundsUsed: 0, prevOverall: 5.0 }, { ...CFG, maxRounds: 5 });
    expect(r.action).toBe('needs_human');
  });
});
