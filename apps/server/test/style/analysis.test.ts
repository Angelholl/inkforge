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

const ANALYSIS_TEXT = `DIM: 结构与节奏: 短句为主，段落 3-6 行。
DIM: 语言与描写: 对话占比约三成，多短对答。
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
    expect(r.dims['结构与节奏']).toBe('短句为主，段落 3-6 行。');
    expect(r.dims['语言与描写']).toBe('对话占比约三成，多短对答。');
    // 缺行容错：未指定维缺省补 ''、四轴缺省补 0
    expect(Object.keys(r.dims)).toHaveLength(STYLE_DIMENSIONS.length);
    expect(r.dims['尺度']).toBe('');
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
    expect(garbage.dims['情感基调']).toBe('');
    expect(garbage.axes['叙述温度']).toBe(0);
    expect(garbage.rules).toEqual([]);
  });

  it('旧名 DIM 行不并入、缺维补空串；报错文案含「现行六维」（DM-2）', () => {
    const messy = parseAnalysis(`DIM：情感基调：压抑中带暖意
DIM: 描写: 厚`);
    expect(messy.dims['情感基调']).toBe('压抑中带暖意');
    expect(messy.dims['语言与描写']).toBe('');
    expect(messy.errors.some((e) => e.includes('现行六维'))).toBe(true);
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
    expect(analysis.dims['结构与节奏']).toBe('短句为主，段落 3-6 行。');
    expect(analysis.axes['叙述温度']).toBe(72);
    expect(analysis.axes['节奏']).toBe(100);
    expect(analysis.rules).toHaveLength(2);

    const s1 = saveStyleProfile(db, { name: '档案甲', source: '正文样本'.repeat(200), analysis, samples: [{ id: 's0', text: '样本一' }] });
    expect(s1.version).toBe(1);
    const row1 = db.prepare('SELECT * FROM style_profiles WHERE id = ?').get(s1.id) as { rules_json: string; source_path: string };
    const rules1 = JSON.parse(row1.rules_json) as { rulesText: string; dims: Record<string, string>; axes: Record<string, number> };
    expect(rules1.rulesText).toContain('平均句长');
    expect(rules1.dims['语言与描写']).toBe('对话占比约三成，多短对答。');
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
    // 首次蒸馏触发逐维缺口重试 → 第二次蒸馏首轮调用下标由 [1] 后移至 [2]（语义不变，仅随迁）
    expect(captured[2]).not.toContain('显式样本A');
    expect(captured[2].length).toBeGreaterThan(100);
    // 空源抛错
    await expect(distillStyleProfile({ db, provider: capturing }, { name: '空', sourceText: '  \n  ' })).rejects.toThrow(
      /样本为空，禁止蒸馏/,
    );
  });
});

describe('analyzeStyle 单维缺口反馈重试与 warning（DF-3）', () => {
  const OK_DIM = '字'.repeat(70);
  const SHORT_DIM = '语言描写短评'.repeat(7); // 42 字
  const sixDims = (shortFirst: boolean) =>
    [
      `DIM: 语言与描写: ${shortFirst ? SHORT_DIM : OK_DIM}`,
      ...['特色词汇', '结构与节奏', '情感基调', '尺度', '叙述方式'].map((d) => `DIM: ${d}: ${OK_DIM}`),
      'RULES: 平均句长 10-20 字。',
    ].join('\n');
  const ONE_SHORT = sixDims(true);
  const ALL_OK = sixDims(false);
  const providerFor = (texts: string[], seen: string[], steps: string[]): LlmProvider => ({
    complete: async (req) => {
      seen.push(req.user);
      steps.push(req.meta.step);
      const text = texts.length > 1 ? texts.shift()! : texts[0];
      return { text, usage: { promptTokens: 0, completionTokens: 0 }, finishReason: 'stop' };
    },
  });

  it('单维不足触发一次重试：解析类 complete 调用数=2、最终达标 warnings=[]', async () => {
    const seen: string[] = [];
    const steps: string[] = [];
    const { warnings } = await analyzeStyle(
      { provider: providerFor([ONE_SHORT, ALL_OK], seen, steps) },
      { sourceText: '正文样本'.repeat(200), samples: ['样本一'] },
    );
    expect(steps.filter((s) => s === 'summarize')).toHaveLength(2);
    expect(warnings).toEqual([]);
    // 反馈文案进第二次调用
    expect(seen[1]).toContain('【单维字数不足，需重写】');
    expect(seen[1]).toContain('维度语言与描写仅42字，低于下限70字，请重写该维');
  });

  it('重试后仍不足：不抛错、warnings 取最终解析缺口、调用数仍=2', async () => {
    const seen: string[] = [];
    const steps: string[] = [];
    const { warnings } = await analyzeStyle(
      { provider: providerFor([ONE_SHORT], seen, steps) },
      { sourceText: '正文样本'.repeat(200), samples: ['样本一'] },
    );
    expect(steps.filter((s) => s === 'summarize')).toHaveLength(2);
    expect(warnings).toEqual(['维度语言与描写仅42字，低于下限70字']);
  });
});

describe('术语表（B9）', () => {
  it('parseAnalysis TERMS 行 + saveStyleProfile 落 rules_json.terms + renderStyleBlock 注入术语段（预算截断）', async () => {
    const withTerms = parseAnalysis(`DIM: 结构与节奏: 短句。
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

  it('renderStyleBlock 注入术语段：位于范例片段之后，超预算先牺牲术语', () => {
    const terms = [{ term: '青云剑诀', note: '核心功法' }];
    const block = renderStyleBlock('规则行', [{ id: 's0', text: '样本正文'.repeat(50) }], 100000, terms);
    expect(block.indexOf('【术语表】')).toBeGreaterThan(block.indexOf('【范例片段】'));
    expect(block).toContain('青云剑诀：核心功法');
    const tight = renderStyleBlock('规则行', [{ id: 's0', text: '样本正文'.repeat(50) }], 30, terms);
    expect(tight.length).toBeLessThanOrEqual(30);
    expect(tight).not.toContain('【术语表】'); // 尾部术语先被 head 截断牺牲
  });
});

describe('高频词 FREQTERMS（DEC-2026-1120-06）', () => {
  it('分析输入带程序统计参考块；FREQTERMS 行落 rules_json.freqTerms 非空', async () => {
    const captured: string[] = [];
    const withFreq = `${ANALYSIS_TEXT}
TERMS: 青云剑诀: 核心功法
FREQTERMS: 抬眸: 人物对峙前的高频停顿动作
FREQTERMS: 沉默: 高频收尾用语，承担留白`;
    const capturing: LlmProvider = {
      complete: async (req) => {
        captured.push(req.user);
        return { text: withFreq, usage: { promptTokens: 0, completionTokens: 0 }, finishReason: 'stop' };
      },
    };
    const id = await distillStyleProfile({ db, provider: capturing }, { name: '高频档案', sourceText: '抬眸沉默'.repeat(200), samples: ['样本一', '样本一', '样本一'] });
    // 分析输入并入程序统计参考块（词组×次数）
    expect(captured[0]).toContain('样本高频词组统计');
    expect(captured[0]).toContain('×');
    // prompt 模板含 FREQTERMS 行协议与 NAMES 报备行、TERMS/FREQTERMS 禁人名口径（DEC-2026-1123-01）
    expect(captured[0]).toContain('FREQTERMS:');
    expect(captured[0]).toContain('抽取地名/专有词/称谓/器物/组织等世界观术语与用法偏好 3-10 条，严禁人物姓名');
    expect(captured[0]).toContain('与 TERMS 的世界观术语区分，同样严禁人物姓名');
    expect(captured[0]).toContain('NAMES: <原文人物姓名列表，顿号分隔，仅报备不入档案；无则省略本行>');
    // 落库 rules_json.freqTerms 非空
    const rules1 = JSON.parse((db.prepare('SELECT rules_json FROM style_profiles WHERE id = ?').get(id) as { rules_json: string }).rules_json) as {
      freqTerms: Array<{ term: string; note: string }>;
    };
    expect(rules1.freqTerms).toEqual([
      { term: '抬眸', note: '人物对峙前的高频停顿动作' },
      { term: '沉默', note: '高频收尾用语，承担留白' },
    ]);
  });

  it('高频词缺口带反馈重试一次并透传 warning（R-F1-2，DEC-2026-1125-03）', async () => {
    const text = `${ANALYSIS_TEXT}
FREQTERMS: 抬眸: 短说明`;
    const capturedReq: string[] = [];
    const capturing: LlmProvider = {
      complete: async (req) => {
        capturedReq.push(req.user);
        return { text, usage: { promptTokens: 0, completionTokens: 0 }, finishReason: 'stop' };
      },
    };
    const r = await analyzeStyle({ provider: capturing }, { sourceText: '抬眸沉默'.repeat(100), samples: ['样本一'] });
    expect(capturedReq.length).toBe(2); // 恰一次重试，第三次不被调用
    expect(capturedReq[1]).toContain('低于下限30字');
    expect(r.warnings.some((w) => w.includes('高频词'))).toBe(true);
  });
});
