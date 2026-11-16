import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadCliches, runL0Checks } from '../../../src/quality/l0';
import { parseFindings } from '../../../src/llm/plainproto';
import { L0_BAD, L0_GOOD, L1_BAD_RAW, L1_GOOD_RAW, REAL_DIR, type L0Sample } from './corpus';

const cliches = loadCliches(path.join(process.cwd(), 'config/quality/cliches.default.txt'));

function runSample(sample: L0Sample) {
  return runL0Checks({ ...(sample.cliches === false ? {} : { cliches }), ...sample.input });
}

function draftFor(chapterNo: number): string {
  return readFileSync(path.join(REAL_DIR, `draft-${String(chapterNo).padStart(3, '0')}.txt`), 'utf8');
}

describe('QC 召回回归集', () => {
  it('L0 召回：9 条坏样本全部 hardFail 且期望检查项为失败项', () => {
    expect(L0_BAD).toHaveLength(9);
    for (const sample of L0_BAD) {
      const r = runSample(sample);
      expect(r.hardFail, `${sample.name} 应 hardFail`).toBe(true);
      const check = r.checks.find((c) => c.name === sample.expectFail);
      expect(check, `${sample.name} 缺检查项 ${sample.expectFail}`).toBeDefined();
      expect(check!.pass, `${sample.name} 的 ${sample.expectFail} 应 fail`).toBe(false);
    }
  });

  it('L0 误报：5 条好样本全部 hardFail=false', () => {
    expect(L0_GOOD).toHaveLength(5);
    for (const sample of L0_GOOD) {
      const r = runSample(sample);
      expect(r.hardFail, `${sample.name} 不应 hardFail: ${JSON.stringify(r.checks.filter((c) => !c.pass))}`).toBe(false);
    }
    const soft = runSample(L0_GOOD.find((s) => s.name === 'soft_cliche_only')!);
    const cliche = soft.checks.find((c) => c.name === 'cliche')!;
    expect(cliche.pass).toBe(true);
    expect(cliche.details).toContain('宛如');
    const edge = runSample(L0_GOOD.find((s) => s.name === 'band_edge')!);
    expect(edge.checks.find((c) => c.name === 'length')!.pass).toBe(true);
  });

  it('L1 协议语料：3 条修后 raw 全部解析干净且合计 ≥1 条合法 finding', () => {
    let totalFindings = 0;
    L1_GOOD_RAW.forEach(({ chapterNo, raw }) => {
      const parsed = parseFindings(raw);
      expect(parsed.errors).toEqual([]);
      expect(parsed.overall).not.toBeNull();
      expect(parsed.overall!).toBeGreaterThanOrEqual(1);
      expect(parsed.overall!).toBeLessThanOrEqual(10);
      const draft = draftFor(chapterNo);
      for (const f of parsed.findings) {
        expect(draft.includes(f.quote), `quote 非 ${chapterNo} 章 draft 子串: ${f.quote.slice(0, 40)}`).toBe(true);
      }
      totalFindings += parsed.findings.length;
    });
    expect(totalFindings).toBeGreaterThanOrEqual(1);
  });

  it('L1 坏语料：3 条修前 raw 全部不抛异常', () => {
    for (const { raw } of L1_BAD_RAW) {
      expect(() => parseFindings(raw)).not.toThrow();
    }
  });
});
