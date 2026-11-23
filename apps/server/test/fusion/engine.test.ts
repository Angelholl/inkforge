import { describe, expect, it } from 'vitest';
import {
  applyStripping,
  computeFusionRows,
  type FusionAClassRow,
  type FusionCarriers,
} from '../../src/fusion/engine';

// 中性仿形夹具（《示例之作》系，全局内容无关律：carrier 文本由夹具自造，禁引 v6 真实文本）
const HEAD = '《示例之作》题名行';
const RESIDUAL = '**借口律**：每场戏必须有社会可接受的借口。';
const CARRIED_RULE = '观众律：每场戏至少一双眼睛。';
const CARRIED_CHAR = '主角：沈真真，连锁公司业务员。';
const CARRIED_TRAIT = '黏人爽利、记账精。';
const UNCARRIED = '临海市的雨夜与旧码头。';
const BRIDGE_RESIDUAL = '桥段节的残段：占位未抽取叙述。';

const DESCRIPTION = [
  HEAD,
  '> 定位一句话：群像引擎的中性占位叙述。',
  '1. 规则节',
  RESIDUAL,
  CARRIED_RULE,
  '2. 人物节',
  CARRIED_CHAR,
  CARRIED_TRAIT,
  '3. 场景节',
  UNCARRIED,
  '4. 桥段节',
  CARRIED_TRAIT,
  BRIDGE_RESIDUAL,
].join('\n');

const SECTIONS = [
  { heading: '1. 规则节', lines: [RESIDUAL, CARRIED_RULE] },
  { heading: '2. 人物节', lines: [CARRIED_CHAR, CARRIED_TRAIT] },
  { heading: '3. 场景节', lines: [UNCARRIED] },
  { heading: '4. 桥段节', lines: [CARRIED_TRAIT, BRIDGE_RESIDUAL] },
];

function makeCarriers(): FusionCarriers {
  return {
    charactersText: `${CARRIED_CHAR}｜${CARRIED_TRAIT}`,
    outlineText: CARRIED_RULE,
    blueprintGoalsText: '',
    foreshadowingsText: '',
    styleSourcesText: '',
  };
}

function makeInput(description = DESCRIPTION) {
  return {
    description,
    sections: SECTIONS.map((s) => ({ heading: s.heading, lines: [...s.lines] })),
    consumedHeadings: SECTIONS.map((s) => s.heading),
    carriers: makeCarriers(),
  };
}

function rowOf(rows: FusionAClassRow[], heading: string): FusionAClassRow {
  const row = rows.find((r) => r.heading === heading);
  if (!row) throw new Error(`未找到行：${heading}`);
  return row;
}

describe('computeFusionRows / applyStripping（A 类剥节引擎，规格 §2 v2.2）', () => {
  it('全量承载节 → verdict fully-carried、preset strip、residualLines 空', () => {
    const { rows } = computeFusionRows(makeInput());
    const row = rowOf(rows, '2. 人物节');
    expect(row.verdict).toBe('fully-carried');
    expect(row.preset).toBe('strip');
    expect(row.removable).toBe(true);
    expect(row.strippableLines).toEqual([CARRIED_CHAR, CARRIED_TRAIT]);
    expect(row.residualLines).toEqual([]);
  });

  it('部分承载节 → preset keep、承载行入 strippableLines、标签行残段入 residualLines', () => {
    const { rows } = computeFusionRows(makeInput());
    const row = rowOf(rows, '1. 规则节');
    expect(row.verdict).toBe('partially-carried');
    expect(row.preset).toBe('keep');
    expect(row.strippableLines).toEqual([CARRIED_RULE]);
    expect(row.residualLines).toEqual([RESIDUAL]);
  });

  it('零承载节 → verdict not-carried、removable false、strippableLines 空', () => {
    const { rows } = computeFusionRows(makeInput());
    const row = rowOf(rows, '3. 场景节');
    expect(row.verdict).toBe('not-carried');
    expect(row.removable).toBe(false);
    expect(row.preset).toBe('keep');
    expect(row.strippableLines).toEqual([]);
    expect(row.residualLines).toEqual([UNCARRIED]);
  });

  it('applyStripping 只删所选节承载行、残段与未选节逐字节保留；剥后 carriers 源文本不变（N1）', () => {
    const input = makeInput();
    const carriersBefore = structuredClone(input.carriers);
    const { previewDescription } = computeFusionRows(input);
    expect(input.carriers).toEqual(carriersBefore);
    expect(input.description).toBe(DESCRIPTION);
    // 人物节（所选 strip）两行被删
    expect(previewDescription).not.toContain(CARRIED_CHAR);
    // 规则节标签行残段、场景节未选节、桥段节未选节同名行逐字节保留
    expect(previewDescription).toContain(RESIDUAL);
    expect(previewDescription).toContain(UNCARRIED);
    expect(previewDescription).toContain(BRIDGE_RESIDUAL);
    expect(previewDescription).toContain(CARRIED_TRAIT);
    // 标题行保留
    expect(previewDescription).toContain('1. 规则节');
    expect(previewDescription).toContain('2. 人物节');
  });

  it('同一归一化文本行同时出现于所选节与未选节 → 只删所选节段内出现，未选节保行（限段删除钉）', () => {
    const { rows } = computeFusionRows(makeInput());
    const stripped = applyStripping(DESCRIPTION, rows, ['2. 人物节']);
    const lines = stripped.split('\n');
    expect(lines).not.toContain(CARRIED_CHAR); // 所选节段内命中行删
    expect(lines.filter((l) => l === CARRIED_TRAIT)).toEqual([CARRIED_TRAIT]); // 未选节同文本保行
    expect(lines).toContain(BRIDGE_RESIDUAL);
  });

  it('description 行 0 出现在承载匹配中 → 仍保留且不入 strippableLines（N4）', () => {
    const echoInput = {
      description: [HEAD, '1. 人物节', HEAD, '其余叙述。'].join('\n'),
      sections: [{ heading: '1. 人物节', lines: [HEAD, '其余叙述。'] }],
      consumedHeadings: ['1. 人物节'],
      carriers: { ...makeCarriers(), charactersText: `${HEAD}｜其余叙述。`, outlineText: '' },
    };
    const { rows, previewDescription } = computeFusionRows(echoInput);
    const headRow = rowOf(rows, '1. 人物节');
    expect(headRow.strippableLines).not.toContain(HEAD);
    expect(previewDescription.split('\n')[0]).toBe(HEAD);
    expect(previewDescription).toContain(HEAD);
  });

  it('首节承载行落在前 90 字内 → headWindowWarn true；剥除不涉头窗 → false', () => {
    expect(computeFusionRows(makeInput()).headWindowWarn).toBe(true);
    const longDescription = DESCRIPTION.replace(
      '> 定位一句话：群像引擎的中性占位叙述。',
      `> 定位一句话：${'中性占位叙述'.repeat(30)}。`,
    );
    expect(computeFusionRows(makeInput(longDescription)).headWindowWarn).toBe(false);
  });

  it('同输入重跑两次 → rows / previewDescription 逐字节相等（N3）', () => {
    const a = computeFusionRows(makeInput());
    const b = computeFusionRows(makeInput());
    expect(a.rows).toEqual(b.rows);
    expect(a.previewDescription).toBe(b.previewDescription);
    expect(a.headWindowWarn).toBe(b.headWindowWarn);
  });

  it('consumedHeadings 未包含的节 → 不产行（载体驱动，无内容猜测）', () => {
    const input = makeInput();
    input.consumedHeadings = ['2. 人物节'];
    const { rows } = computeFusionRows(input);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.heading).toBe('2. 人物节');
  });
});
