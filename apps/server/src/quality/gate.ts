import type { Finding } from '@inkforge/shared';
import type { L0Report } from './l0';

export interface L1Report {
  findings: Finding[];
  invalidQuotes: number;
  overall: number | null;
  parseErrors: string[];
  repaired: boolean;
}

export interface GateDecision {
  action: 'pass' | 'rewrite' | 'needs_human';
  reasons: string[];
}

/**
 * 门控判定序（短路与，T24"无改善停早于轮数停"语义）：
 * ① l0.hardFail → rewrite（轮未满）否则 needs_human
 * ② softMajors + L1 major ≥ 2 → 同上
 * ③ 任一 blocker → 同上
 * ⑤' prevOverall 存在且增益 < minGain → needs_human（无改善即停，先于阈值判定）
 * ④ overall < threshold（含 null）→ 同①
 * ⑥ pass
 */
export function decideGate(
  input: { l0: L0Report; l1: L1Report; roundsUsed: number; prevOverall?: number | null },
  cfg: { scoreThreshold: number; maxRounds: number; minGain: number },
): GateDecision {
  const reasons: string[] = [];
  const rewriteOrFail = () => {
    if (input.roundsUsed < cfg.maxRounds) return 'rewrite' as const;
    return 'needs_human' as const;
  };

  if (input.l0.hardFail) {
    reasons.push('L0 硬失败');
    return { action: rewriteOrFail(), reasons };
  }
  const majors = input.l1.findings.filter((f) => f.severity === 'major').length;
  if (input.l0.softMajors + majors >= 2) {
    reasons.push(`softMajor ${input.l0.softMajors} + major ${majors} ≥ 2`);
    return { action: rewriteOrFail(), reasons };
  }
  const blockers = input.l1.findings.filter((f) => f.severity === 'blocker');
  if (blockers.length > 0) {
    reasons.push(`blocker ×${blockers.length}`);
    return { action: rewriteOrFail(), reasons };
  }
  if (input.prevOverall != null && input.l1.overall != null) {
    const gain = (input.l1.overall - input.prevOverall) / input.prevOverall;
    if (gain < cfg.minGain) {
      reasons.push(`增益 ${(gain * 100).toFixed(1)}% < ${(cfg.minGain * 100).toFixed(1)}%（无改善即停）`);
      return { action: 'needs_human', reasons };
    }
  }
  if (input.l1.overall == null || input.l1.overall < cfg.scoreThreshold) {
    reasons.push(`overall ${input.l1.overall} < ${cfg.scoreThreshold}`);
    return { action: rewriteOrFail(), reasons };
  }
  return { action: 'pass', reasons: ['全过且分达标'] };
}
