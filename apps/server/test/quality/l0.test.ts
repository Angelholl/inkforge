import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadCliches, runL0Checks } from '../../src/quality/l0';
import {
  BEAT_BP,
  BEAT_MISS_DRAFT,
  BP_EMPTY,
  CLICHE_DRAFT,
  DECEASED_APPEAR_DRAFT,
  HAPPY_DRAFT,
  PLAGIARISM_DRAFT,
  PLAGIARISM_REF,
  REPLAY_DRAFT,
  REPLAY_PREV,
  SHORT_DRAFT,
  TAIL_REPLAY_DRAFT,
  TAIL_REPLAY_PREV,
} from './fixtures';

const cliches = loadCliches(path.join(process.cwd(), 'config/quality/cliches.default.txt'));

describe('L0 length + cliche', () => {
  it('HAPPY 以 target=120 过；SHORT 以 target=300 fail', () => {
    const ok = runL0Checks({ draft: HAPPY_DRAFT, targetChars: 120, prevTexts: [], blueprint: BP_EMPTY, continuity: { characters: [] }, cliches });
    expect(ok.checks.find((c) => c.name === 'length')!.pass).toBe(true);
    const bad = runL0Checks({ draft: SHORT_DRAFT, targetChars: 300, prevTexts: [], blueprint: BP_EMPTY, continuity: { characters: [] }, cliches });
    expect(bad.checks.find((c) => c.name === 'length')!.pass).toBe(false);
    expect(bad.hardFail).toBe(true);
  });

  it('cliche：硬禁命中 fail；建议级命中 pass 且 details 非空', () => {
    const hard = runL0Checks({ draft: CLICHE_DRAFT, targetChars: 100, prevTexts: [], blueprint: BP_EMPTY, continuity: { characters: [] }, cliches });
    expect(hard.checks.find((c) => c.name === 'cliche')!.pass).toBe(false);
    expect(hard.hardFail).toBe(true);
    const soft = runL0Checks({
      draft: '湖面宛如镜子。此外无事。',
      targetChars: 20,
      prevTexts: [],
      blueprint: BP_EMPTY,
      continuity: { characters: [] },
      cliches,
    });
    const c = soft.checks.find((c) => c.name === 'cliche')!;
    expect(c.pass).toBe(true);
    expect(c.details).toContain('宛如');
  });
});

describe('L0 replay + plagiarism', () => {
  it('REPLAY 对 prev → fail 且 replayRatio>0.35', () => {
    const r = runL0Checks({ draft: REPLAY_DRAFT, targetChars: 500, prevTexts: [REPLAY_PREV], blueprint: BP_EMPTY, continuity: { characters: [] }, cliches });
    const c = r.checks.find((c) => c.name === 'replay_ngram')!;
    expect(c.pass).toBe(false);
    expect(r.metrics.replayRatio).toBeGreaterThan(0.35);
  });

  it('plagiarism：≥15 连续字命中 fail', () => {
    const r = runL0Checks({
      draft: PLAGIARISM_DRAFT,
      targetChars: 500,
      prevTexts: [],
      blueprint: BP_EMPTY,
      continuity: { characters: [] },
      referenceTexts: [PLAGIARISM_REF],
      cliches,
    });
    expect(r.checks.find((c) => c.name === 'plagiarism_ngram')!.pass).toBe(false);
    expect(r.hardFail).toBe(true);
  });
});

describe('L0 beat/continuity + 全过基线', () => {
  it('beat_coverage：缺关键词 fail；补齐后 pass', () => {
    const bad = runL0Checks({ draft: BEAT_MISS_DRAFT, targetChars: 100, prevTexts: [], blueprint: BEAT_BP, continuity: { characters: [] }, cliches });
    expect(bad.checks.find((c) => c.name === 'beat_coverage')!.pass).toBe(false);
    const good = runL0Checks({ draft: BEAT_MISS_DRAFT + '他终于握住了那枚温润的玉佩。', targetChars: 100, prevTexts: [], blueprint: BEAT_BP, continuity: { characters: [] }, cliches });
    expect(good.checks.find((c) => c.name === 'beat_coverage')!.pass).toBe(true);
  });

  it('continuity_facts：deceased 角色出现 fail', () => {
    const r = runL0Checks({
      draft: DECEASED_APPEAR_DRAFT,
      targetChars: 100,
      prevTexts: [],
      blueprint: BP_EMPTY,
      continuity: { characters: [{ name: '李慕白', state: { deceased: true } }] },
      cliches,
    });
    expect(r.checks.find((c) => c.name === 'continuity_facts')!.pass).toBe(false);
    expect(r.hardFail).toBe(true);
  });

  it('HAPPY 全过：hardFail=false softMajars=0', () => {
    const r = runL0Checks({ draft: HAPPY_DRAFT, targetChars: 120, prevTexts: [], blueprint: BP_EMPTY, continuity: { characters: [] }, cliches });
    expect(r.hardFail).toBe(false);
    expect(r.softMajors).toBe(0);
    for (const c of r.checks) {
      expect(c.pass).toBe(true);
    }
  });
});

describe('L0 tail_replay + 实证套话', () => {
  it('tail_replay：章尾复现前文尾段 → 硬失败', () => {
    const r = runL0Checks({ draft: TAIL_REPLAY_DRAFT, targetChars: 500, prevTexts: [TAIL_REPLAY_PREV], blueprint: BP_EMPTY, continuity: { characters: [] }, cliches });
    const c = r.checks.find((c) => c.name === 'tail_replay')!;
    expect(c.pass).toBe(false);
    expect(r.hardFail).toBe(true);
  });

  it('tail_replay：独立章尾 → 通过', () => {
    const r = runL0Checks({ draft: HAPPY_DRAFT, targetChars: 120, prevTexts: [TAIL_REPLAY_PREV], blueprint: BP_EMPTY, continuity: { characters: [] }, cliches });
    const c = r.checks.find((c) => c.name === 'tail_replay')!;
    expect(c.pass).toBe(true);
    expect(r.hardFail).toBe(false);
  });

  it('cliche：新增实证套话句命中', () => {
    const r = runL0Checks({ draft: '事了之后，他步伐沉稳，眼神冷峻地离开。', targetChars: 100, prevTexts: [], blueprint: BP_EMPTY, continuity: { characters: [] }, cliches });
    const c = r.checks.find((c) => c.name === 'cliche')!;
    expect(c.pass).toBe(false);
    expect(r.clicheHits).toContain('步伐沉稳，眼神冷峻');
  });
});
