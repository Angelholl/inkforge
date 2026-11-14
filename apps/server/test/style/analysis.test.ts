import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseAnalysis } from '../../src/llm/plainproto';
import { pickFewShotAndHeldOut } from '../../src/style/sample';
import { renderStyleBlock } from '../../src/style/inject';
import { analyzeStyle, saveStyleProfile } from '../../src/style/analysis';
import { distillStyleProfile } from '../../src/style/distill';
import { migrate } from '../../src/db/migrate';
import { openDb, type Database } from '../../src/db/open';
import { createMockProvider } from '../../src/llm/mock';
import type { LlmProvider } from '../../src/llm/types';
import { STYLE_AXES, STYLE_DIMENSIONS } from '@inkforge/shared';

const ANALYSIS_TEXT = `DIM: 节奏: 短句为主，段落 3-6 行。
DIM: 对话: 对话占比约三成，多短对答。
AXIS: 叙述温度: 72
AXIS: 语言密度: 55
AXIS: 节奏: 150
RULES: 平均句长 10-20 字。
RULES: 对话占比 20%-40%。`;

let db: Database;
let dir: string;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkforge-analysis-'));
  db = openDb(path.join(dir, 't.db'));
  migrate(db);
});

afterAll(() => {
  try {
    db.close();
  } catch {
    /* ignore */
  }
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* Windows 锁瞬态 */
  }
});

describe('parseAnalysis', () => {
  it('正例+容错：缺行补默认（轴 0/维空串）、越界钳制 0-100、未知行记 error 不抛', () => {
    const r = parseAnalysis(ANALYSIS_TEXT);
    expect(r.errors.some((e) => e.includes('越界'))).toBe(false);
    expect(r.dims['节奏']).toBe('短句为主，段落 3-6 行。');
    expect(r.dims['对话']).toBe('对话占比约三成，多短对答。');
    // 缺行容错：五维缺省补 ''、四轴缺省补 0
    expect(Object.keys(r.dims)).toHaveLength(STYLE_DIMENSIONS.length);
    expect(r.dims['描写']).toBe('');
    expect(Object.keys(r.axes)).toHaveLength(STYLE_AXES.length);
    expect(r.axes['幽默']).toBe(0);
    // 越界钳制
    expect(r.axes['节奏']).toBe(100);
    expect(r.rules).toEqual(['平均句长 10-20 字。', '对话占比 20%-40%。']);
    // 全角冒号 + 非法轴值 + 未知维度/轴 + 噪声行
    const messy = parseAnalysis(`DIM：情感基调：压抑中带暖意
AXIS：幽默：abc
AXIS: 幽默感: 50
这条没有标记
RULES: 禁用「不是…而是…」句式`);
    expect(messy.dims['情感基调']).toBe('压抑中带暖意');
    expect(messy.axes['幽默']).toBe(0);
    expect(messy.errors.some((e) => e.includes('轴值非法'))).toBe(true);
    expect(messy.errors.some((e) => e.includes('未知轴'))).toBe(true);
    expect(messy.errors.some((e) => e.includes('无法识别的行'))).toBe(true);
    // 纯垃圾输入不抛
    const garbage = parseAnalysis('这是一段没有标记的文字');
    expect(garbage.dims['节奏']).toBe('');
    expect(garbage.axes['叙述温度']).toBe(0);
    expect(garbage.rules).toEqual([]);
  });
});

describe('pickFewShotAndHeldOut', () => {
  it('跨组零重合：heldOut 首段不在 fewShot 任何文本中出现；<200 字两者皆空', () => {
    // 每句带唯一序号，排除周期性文本天然互含的假阳性
    const text = Array.from({ length: 1000 }, (_, i) => `第${i}句独一无二的内容标记。`).join('');
    const { fewShot, heldOut } = pickFewShotAndHeldOut(text);
    expect(fewShot.length).toBeGreaterThan(0);
    expect(heldOut).toHaveLength(2);
    const fewJoined = fewShot.join('\n----\n');
    for (const h of heldOut) {
      expect(fewJoined.includes(h.slice(0, 100))).toBe(false);
    }
    // 确定性
    expect(pickFewShotAndHeldOut(text)).toEqual({ fewShot, heldOut });

    const short = pickFewShotAndHeldOut('太短');
    expect(short.fewShot).toEqual([]);
    expect(short.heldOut).toEqual([]);
  });
});

describe('analyzeStyle + saveStyleProfile', () => {
  it('mock 文样 → 七维六轴结构化档案落库：rules_json 含 rulesText/dims/axes；同源二存 version+1 旧行不变', async () => {
    const provider = createMockProvider({ summarize: { text: ANALYSIS_TEXT } });
    const { analysis } = await analyzeStyle({ provider }, { sourceText: '正文样本'.repeat(200), samples: ['样本一', '样本二'] });
    expect(analysis.dims['节奏']).toBe('短句为主，段落 3-6 行。');
    expect(analysis.axes['叙述温度']).toBe(72);
    expect(analysis.axes['节奏']).toBe(100);
    expect(analysis.rules).toHaveLength(2);

    const s1 = saveStyleProfile(db, { name: '档案甲', source: '正文样本'.repeat(200), analysis, samples: [{ id: 's0', text: '样本一' }] });
    expect(s1.version).toBe(1);
    const row1 = db.prepare('SELECT * FROM style_profiles WHERE id = ?').get(s1.id) as { rules_json: string; source_path: string };
    const rules1 = JSON.parse(row1.rules_json) as { rulesText: string; dims: Record<string, string>; axes: Record<string, number> };
    expect(rules1.rulesText).toContain('平均句长');
    expect(rules1.dims['对话']).toBe('对话占比约三成，多短对答。');
    expect(rules1.axes['语言密度']).toBe(55);
    expect(row1.source_path).toMatch(/^inline:[0-9a-f]{8}$/);

    const s2 = saveStyleProfile(db, { name: '档案甲', source: '正文样本'.repeat(200), analysis, samples: [{ id: 's0', text: '样本一' }] });
    expect(s2.version).toBe(2);
    const row1After = db.prepare('SELECT rules_json FROM style_profiles WHERE id = ?').get(s1.id) as { rules_json: string };
    expect(row1After.rules_json).toBe(row1.rules_json); // 旧行逐字节不变
  });

  it('distillStyleProfile 签名兼容：显式 samples 优先进 prompt；缺省走 pickFewShotAndHeldOut；空源抛错', async () => {
    const captured: string[] = [];
    const capturing: LlmProvider = {
      complete: async (req) => {
        captured.push(req.user);
        return { text: ANALYSIS_TEXT, usage: { promptTokens: 0, completionTokens: 0 }, finishReason: 'stop' };
      },
    };
    // 显式 samples 优先（CLI 形态）
    const id1 = await distillStyleProfile({ db, provider: capturing }, { name: '显式样', sourceText: '正文甲'.repeat(200), samples: ['显式样本A', '显式样本B'] });
    expect(id1).toBeTruthy();
    expect(captured[0]).toContain('显式样本A');
    expect(captured[0]).toContain('DIM:');
    // 缺省 → pickFewShotAndHeldOut few-shot（非空且非显式串）
    const id2 = await distillStyleProfile({ db, provider: capturing }, { name: '缺省样', sourceText: '正文乙'.repeat(300) });
    expect(id2).toBeTruthy();
    expect(captured[1]).not.toContain('显式样本A');
    expect(captured[1].length).toBeGreaterThan(100);
    // 空源抛错
    await expect(distillStyleProfile({ db, provider: capturing }, { name: '空', sourceText: '  \n  ' })).rejects.toThrow(
      /样本为空，禁止蒸馏/,
    );
  });
});

describe('术语表（B9）', () => {
  it('parseAnalysis TERMS 行 + saveStyleProfile 落 rules_json.terms + renderStyleBlock 注入术语段（预算截断）', async () => {
    const withTerms = parseAnalysis(`DIM: 节奏: 短句。
TERMS: 青云剑诀: 主角核心功法，首次出现需全称
TERMS: 临水城: 故事主城，禁用「临水市」
RULES: 平均句长 10-20 字。`);
    expect(withTerms.terms).toEqual([
      { term: '青云剑诀', note: '主角核心功法，首次出现需全称' },
      { term: '临水城', note: '故事主城，禁用「临水市」' },
    ]);
    // 无 TERMS 行 → []
    expect(parseAnalysis('RULES: x').terms).toEqual([]);

    const provider = createMockProvider({ summarize: { text: `${ANALYSIS_TEXT}\nTERMS: 青云剑诀: 核心功法` } });
    const { analysis } = await analyzeStyle({ provider }, { sourceText: '正文样本'.repeat(200), samples: ['样本一'] });
    expect(analysis.terms).toEqual([{ term: '青云剑诀', note: '核心功法' }]);
    const { id } = saveStyleProfile(db, { name: '术语档案', source: '正文样本'.repeat(200), analysis, samples: [{ id: 's0', text: '样本一' }] });
    const rules1 = JSON.parse((db.prepare('SELECT rules_json FROM style_profiles WHERE id = ?').get(id) as { rules_json: string }).rules_json) as {
      terms: Array<{ term: string; note: string }>;
    };
    expect(rules1.terms).toEqual([{ term: '青云剑诀', note: '核心功法' }]);
  });

  it('renderStyleBlock 注入术语段：位于范例片段之前，超预算整体截断', () => {
    const terms = [{ term: '青云剑诀', note: '核心功法' }];
    const block = renderStyleBlock('规则行', [{ id: 's0', text: '样本正文'.repeat(50) }], 100000, terms);
    expect(block.indexOf('【术语表】')).toBeGreaterThan(-1);
    expect(block.indexOf('【术语表】')).toBeLessThan(block.indexOf('【范例片段】'));
    expect(block).toContain('青云剑诀：核心功法');
    const tight = renderStyleBlock('规则行', [{ id: 's0', text: '样本正文'.repeat(50) }], 30, terms);
    expect(tight.length).toBeLessThanOrEqual(30);
  });
});
