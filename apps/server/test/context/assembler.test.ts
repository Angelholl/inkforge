import { describe, expect, it } from 'vitest';
import { pickBudgetProfile } from '../../src/config';
import { assembleContext, draftSlots } from '../../src/context/assembler';

const BUDGETS = {
  hardRules: 500,
  worldview: 1000,
  characters: 800,
  styleRules: 1000,
  styleDims: 600,
  blueprint: 1000,
  continuity: 2500,
  prevTail: 1500,
  fewShot: 1500,
  task: 500,
};

const INPUT = {
  hardRules: '硬规则：不得使用套话。',
  worldview: '这是一个修真世界。',
  blueprint: '本章目标：主角进入书房。',
  continuity: '前情：主角昨夜抵达。',
  prevTail: '他推开门。雨停了。',
  task: '写出第 3 章。',
};

describe('assembleContext 稳定性', () => {
  it('相同输入两次 → system 逐字节相等；仅换 blueprint → system 不变 user 变', () => {
    const a = assembleContext(draftSlots(INPUT, BUDGETS), 100000);
    const b = assembleContext(draftSlots(INPUT, BUDGETS), 100000);
    expect(a.system).toBe(b.system);
    const changed = assembleContext(draftSlots({ ...INPUT, blueprint: '本章目标：主角进入庭院。' }, BUDGETS), 100000);
    expect(changed.system).toBe(a.system);
    expect(changed.user).not.toBe(a.user);
  });
});

describe('assembleContext 预算', () => {
  it('worldview 超预算 → 截断 1000 且 system 含前 1000 字符；prevTail tail 保留末尾', () => {
    const longWorldview = '界'.repeat(4000);
    // 5000 个互异字符（0x4e00..0x6187），保证头部子串不会在尾部重现
    const longPrev = Array.from({ length: 5000 }, (_, i) => String.fromCharCode(0x4e00 + i)).join('');
    const a = assembleContext(
      draftSlots({ ...INPUT, worldview: longWorldview, prevTail: longPrev }, BUDGETS),
      100000,
    );
    const wv = a.slotReport.find((s) => s.name === 'worldview')!;
    expect(wv.truncated).toBe(true);
    expect(wv.usedChars).toBe(1000);
    expect(a.system).toContain(longWorldview.slice(0, 1000));
    expect(a.system).not.toContain(longWorldview.slice(0, 1001));
    const pt = a.slotReport.find((s) => s.name === 'prevTail')!;
    expect(pt.truncated).toBe(true);
    expect(pt.usedChars).toBe(1500);
    // 计划原文"user 以 prevTail 末 20 字符结尾"与其钉死槽序矛盾（task 在 prevTail 后）——按 keep:tail 意图改为包含断言
    expect(a.user).toContain(longPrev.slice(-20));
    expect(a.user).not.toContain(longPrev.slice(0, 20));
  });

  it('sum(used) ≤ totalBudgetChars（硬预算收缩）', () => {
    const big = '文'.repeat(20000);
    const a = assembleContext(draftSlots({ ...INPUT, continuity: big, worldview: big }, BUDGETS), 9000);
    const sum = a.slotReport.reduce((acc, s) => acc + s.usedChars, 0);
    expect(sum).toBeLessThanOrEqual(9000);
  });
});

describe('槽序与 profile', () => {
  it('pickBudgetProfile 钉值', () => {
    expect(pickBudgetProfile(524288)).toBe('draft');
    expect(pickBudgetProfile(8192)).toBe('draft8k');
  });

  it('draftSlots 槽名顺序等于钉死序列；prevTail 空则跳过；styleRules/fewShot 可选', () => {
    const names = draftSlots(INPUT, BUDGETS).map((s) => s.name);
    expect(names).toEqual(['hardRules', 'worldview', 'blueprint', 'continuity', 'prevTail', 'task']);
    const full = draftSlots({ ...INPUT, styleRules: '风格规则', fewShot: '范例段落', prevTail: '' }, BUDGETS).map((s) => s.name);
    expect(full).toEqual(['hardRules', 'worldview', 'styleRules', 'blueprint', 'continuity', 'fewShot', 'task']);
  });

  it('draftSlots：characters 槽紧随 worldview（stable）且空串跳过', () => {
    const withChars = draftSlots({ ...INPUT, characters: '【人物卡】张三' }, BUDGETS).map((s) => s.name);
    expect(withChars).toEqual(['hardRules', 'worldview', 'characters', 'blueprint', 'continuity', 'prevTail', 'task']);
    const charSlot = draftSlots({ ...INPUT, characters: '【人物卡】张三' }, BUDGETS).find((s) => s.name === 'characters')!;
    expect(charSlot.stable).toBe(true);
    expect(charSlot.budgetChars).toBe(800);
    expect(draftSlots({ ...INPUT, characters: '' }, BUDGETS).map((s) => s.name)).toEqual([
      'hardRules',
      'worldview',
      'blueprint',
      'continuity',
      'prevTail',
      'task',
    ]);
  });

  it('styleDims 槽位于 characters 之后 styleRules 之前，stable 进 system 不进 user', () => {
    const dimsText = '【文风画像】\n· 节奏：节奏偏缓的画像描述';
    const slots = draftSlots(
      { ...INPUT, characters: '【人物卡】张三', styleDims: dimsText, styleRules: '风格规则文本' },
      BUDGETS,
    );
    expect(slots.map((s) => s.name)).toEqual([
      'hardRules',
      'worldview',
      'characters',
      'styleDims',
      'styleRules',
      'blueprint',
      'continuity',
      'prevTail',
      'task',
    ]);
    const st = slots.find((s) => s.name === 'styleDims')!;
    expect(st.stable).toBe(true);
    expect(st.keep).toBe('head');
    expect(st.budgetChars).toBe(600);
    const a = assembleContext(slots, 100000);
    expect(a.system).toContain(dimsText);
    expect(a.user).not.toContain(dimsText);
    expect(a.system.indexOf('【人物卡】张三')).toBeLessThan(a.system.indexOf(dimsText));
    expect(a.system.indexOf(dimsText)).toBeLessThan(a.system.indexOf('风格规则文本'));
  });
});
