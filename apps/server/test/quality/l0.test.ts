import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { countChars, type BeatRequirement } from '@inkforge/shared';
import { loadCliches, loadLandingWords, runL0Checks } from '../../src/quality/l0';
import {
  BEAT_BP,
  BEAT_MISS_DRAFT,
  BP_EMPTY,
  CLICHE_DRAFT,
  DECEASED_APPEAR_DRAFT,
  ECHO_BAD_DRAFT,
  ECHO_BAD_PREV,
  ECHO_FREE_DRAFT,
  ECHO_FREE_PREV,
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

describe('L0 echo_20gram + 模板系套话', () => {
  it('echo_20gram：复文置于 42.6% 位置（004 形状）→ 硬失败且 details 报命中与位置', () => {
    const r = runL0Checks({
      draft: ECHO_BAD_DRAFT,
      targetChars: countChars(ECHO_BAD_DRAFT),
      prevTexts: [ECHO_BAD_PREV],
      blueprint: BP_EMPTY,
      continuity: { characters: [] },
      cliches,
    });
    const c = r.checks.find((c) => c.name === 'echo_20gram')!;
    expect(c.pass).toBe(false);
    expect(r.hardFail).toBe(true);
    expect(c.details).toContain('echoHits=');
    expect(c.details).toContain('42.');
    // 双盲区补位证明：章尾无复演，tail_replay 仍通过
    expect(r.checks.find((c) => c.name === 'tail_replay')!.pass).toBe(true);
  });

  it('echo_20gram：prev 非空且零 20-gram 共享 → 通过', () => {
    const r = runL0Checks({
      draft: ECHO_FREE_DRAFT,
      targetChars: countChars(ECHO_FREE_DRAFT),
      prevTexts: [ECHO_FREE_PREV],
      blueprint: BP_EMPTY,
      continuity: { characters: [] },
      cliches,
    });
    const c = r.checks.find((c) => c.name === 'echo_20gram')!;
    expect(c.pass).toBe(true);
    expect(r.hardFail).toBe(false);
  });

  it('cliche：第X层的试炼正在展开 模板系命中', () => {
    const r = runL0Checks({
      draft: '他沿着石阶向上，第四层的试炼正在展开，火光在墙上摇晃。',
      targetChars: 100,
      prevTexts: [],
      blueprint: BP_EMPTY,
      continuity: { characters: [] },
      cliches,
    });
    const c = r.checks.find((c) => c.name === 'cliche')!;
    expect(c.pass).toBe(false);
    expect(r.clicheHits).toContain('第四层的试炼正在展开');
  });
});

describe('L0 beat_coverage 分级词表 AND 层（DEC-2026-1120-10）', () => {
  const LW = { h: ['玉佩光'], l: ['铜镜摇'] }; // 中性占位词表（语义同构：H 词/L 词）
  const gradeBp = {
    goal: 'g',
    beats: [],
    mustHaveBeats: [{ text: 'H（撞见场：房东×阿美）', keywords: ['阿美'], grade: 'H' as const }],
    bannedTopics: [],
  };
  const noGradeBp = {
    goal: 'g',
    beats: [],
    mustHaveBeats: [{ text: '信物到手', keywords: ['玉佩'] }],
    bannedTopics: [],
  };
  const run = (draft: string, bp: object, landingWords?: { h: string[]; l: string[] }) =>
    runL0Checks({ draft, targetChars: 100, prevTexts: [], blueprint: bp as never, continuity: { characters: [] }, cliches, landingWords });
  // 关键词在场文（含 '阿美'，不含任何占位词表词）：隔离 OR 层，专测 AND 层
  const kwDraft = BEAT_MISS_DRAFT + '阿美在门口张望。';

  it('① 人名关键词命中但无词表词 → H 级节拍不覆盖（硬失败）；同输入无词表 → 覆盖（对照证明失败源=AND 层）', () => {
    const r = run(kwDraft, gradeBp, LW);
    const c = r.checks.find((x) => x.name === 'beat_coverage')!;
    expect(c.pass).toBe(false);
    expect(r.hardFail).toBe(true);
    expect(c.details).toContain('H（撞见场：房东×阿美）');
    const orOnly = run(kwDraft, gradeBp);
    expect(orOnly.checks.find((x) => x.name === 'beat_coverage')!.pass).toBe(true);
  });

  it('② 词表词命中但 keyword 全 miss → 不覆盖', () => {
    const r = run(BEAT_MISS_DRAFT + '她抬手碰了碰床头的玉佩光。', gradeBp, LW);
    expect(r.checks.find((x) => x.name === 'beat_coverage')!.pass).toBe(false);
  });

  it('③ keyword 与词表词双命中 → 覆盖', () => {
    const r = run(BEAT_MISS_DRAFT + '阿美侧身，床头的玉佩光晃了一下。', gradeBp, LW);
    expect(r.checks.find((x) => x.name === 'beat_coverage')!.pass).toBe(true);
  });

  it('④ 无 grade 旧条目：词表在场也只走 OR 层，行为与改前逐字节同形', () => {
    const r = run(BEAT_MISS_DRAFT, noGradeBp, LW);
    expect(r.checks.find((x) => x.name === 'beat_coverage')!.pass).toBe(false); // BEAT_MISS_DRAFT 不含 '玉佩'
    const good = run(BEAT_MISS_DRAFT + '他终于握住了那枚玉佩。', noGradeBp, LW);
    expect(good.checks.find((x) => x.name === 'beat_coverage')!.pass).toBe(true);
  });

  it('⑤ 词表缺失/空 → AND 层跳过（fail-open 放行）', () => {
    const empty = { h: [] as string[], l: [] as string[] };
    for (const lw of [undefined, empty]) {
      const r = run(BEAT_MISS_DRAFT + '阿美点头。', gradeBp, lw);
      expect(r.checks.find((x) => x.name === 'beat_coverage')!.pass).toBe(true);
    }
  });

  it('⑥ loadLandingWords：默认文件解析出两节；缺失路径 → 空表不抛', () => {
    const lw = loadLandingWords(path.join(process.cwd(), 'config/quality/landing-words.default.txt'));
    expect(lw.h.length).toBeGreaterThan(0);
    expect(lw.l.length).toBeGreaterThan(0);
    const missing = loadLandingWords(path.join(process.cwd(), 'config/quality/__no_such__.txt'));
    expect(missing).toEqual({ h: [], l: [] });
  });

  it('⑦ loadLandingWords 调情档护栏（DEC-2026-1122-01）：未知 [X] 节=节头识别但不入库，其下行忽略', () => {
    const lw = loadLandingWords(path.join(process.cwd(), 'config/quality/landing-words.default.txt'));
    // 默认文件 [调情] 节的手交词不得进判定池（否则调情又变落地，白删）
    expect(lw.l).not.toContain('手');
    expect(lw.l).not.toContain('握');
    expect(lw.l).not.toContain('套弄');
    expect(lw.h).not.toContain('揉');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkforge-lw-'));
    const f = path.join(dir, 'w.txt');
    fs.writeFileSync(f, '# 注释\n[H]\n甲\n[调情]\n乙\n丙\n[L]\n丁\n', 'utf8');
    expect(loadLandingWords(f)).toEqual({ h: ['甲'], l: ['丁'] });
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('L0 书级落地策略条目（DEC-2026-1122-01）', () => {
  const LW = { h: ['玉佩光'], l: ['铜镜摇', '铜镜暗'] }; // 中性占位词表（语义同构：H 词/L 词；L 两词测「≥2 不同 L」）
  const run = (draft: string, mustHaveBeats: BeatRequirement[], landingWords?: { h: string[]; l: string[] }) =>
    runL0Checks({
      draft,
      targetChars: 100,
      prevTexts: [],
      blueprint: { goal: 'g', beats: [], mustHaveBeats, bannedTopics: [] },
      continuity: { characters: [] },
      cliches,
      landingWords,
    });
  const cover = (draft: string, mustHaveBeats: BeatRequirement[], landingWords?: { h: string[]; l: string[] }) =>
    run(draft, mustHaveBeats, landingWords).checks.find((x) => x.name === 'beat_coverage')!;
  const mandateBeat = (grade: 'H' | 'L', text = '落地场'): BeatRequirement => ({ text, keywords: [], grade, source: 'mandate' });

  it('H 条目：1 个 H 词 → pass；0 H + 恰 1 个 L 词 → fail；0 H + 2 个不同 L 词 → pass', () => {
    const beat = mandateBeat('H');
    expect(cover('她抬手碰了碰床头的玉佩光。', [beat], LW).pass).toBe(true);
    const oneL = cover('铜镜摇了一下。', [beat], LW);
    expect(oneL.pass).toBe(false);
    expect(oneL.details).toContain('书级H未达·落地策略');
    expect(cover('铜镜摇了一下，铜镜暗又亮起。', [beat], LW).pass).toBe(true);
  });

  it('L 条目：1 个 L 词 → pass；无 L 词 → fail', () => {
    const beat = mandateBeat('L');
    expect(cover('铜镜摇了一下。', [beat], LW).pass).toBe(true);
    expect(cover('他推开门。', [beat], LW).pass).toBe(false);
  });

  it('卡源同文条目（无 source）同正文 → 旧语义逐字节不变（1 个 L 词即满足 H 级 AND 层）', () => {
    const cardBeat: BeatRequirement = { text: '落地场', keywords: ['铜镜摇'], grade: 'H' };
    const draft = '铜镜摇了一下。';
    const old = cover(draft, [cardBeat], LW);
    expect(old.pass).toBe(true);
    expect(old.details).not.toContain('书级');
    // 同正文若换成 mandate 条目则最小牙不放行（≥2 不同 L）——证明放宽仅作用于 source==='mandate'
    expect(cover(draft, [mandateBeat('H')], LW).pass).toBe(false);
  });

  it('词表空 → mandate 条目 fail-open pass', () => {
    for (const lw of [undefined, { h: [] as string[], l: [] as string[] }]) {
      expect(cover('他推开门。', [mandateBeat('H')], lw).pass).toBe(true);
      expect(cover('他推开门。', [mandateBeat('L')], lw).pass).toBe(true);
    }
  });
});
