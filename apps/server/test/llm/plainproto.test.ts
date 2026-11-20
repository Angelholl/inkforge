import { describe, expect, it } from 'vitest';
import { parseAnalysis, parseFindings, parseOutlineTree, parseSummary } from '../../src/llm/plainproto';

const SAMPLE = `OVERALL: 7
---
SEVERITY: blocker
DIMENSION: 设定一致
QUOTE: 他拔出佩剑向城东疾驰
COMMENT: 与连续性表冲突：上章末主角佩剑已折断
---
SEVERITY: major
DIMENSION: 节奏
QUOTE: 两人争执了许久
COMMENT: 冲突段铺陈过长，缺乏推进
---
SEVERITY: minor
DIMENSION: 结尾钩子
QUOTE: 夜色渐深
COMMENT: 收尾平缓，可加悬念`;

describe('parseFindings', () => {
  it('附录 D 文样 → 3 条 finding 全字段 + overall 7', () => {
    const r = parseFindings(SAMPLE);
    expect(r.overall).toBe(7);
    expect(r.errors).toEqual([]);
    expect(r.findings.length).toBe(3);
    expect(r.findings[0]).toEqual({
      severity: 'blocker',
      dimension: '设定一致',
      quote: '他拔出佩剑向城东疾驰',
      comment: '与连续性表冲突：上章末主角佩剑已折断',
    });
    expect(r.findings[1].severity).toBe('major');
    expect(r.findings[2].severity).toBe('minor');
  });

  it('缺 QUOTE 行 → 该块丢弃且 errors +1', () => {
    const r = parseFindings(`OVERALL: 8
---
SEVERITY: major
DIMENSION: 节奏
COMMENT: 缺引文`);
    expect(r.findings.length).toBe(0);
    expect(r.errors.length).toBe(1);
    expect(r.errors[0]).toContain('QUOTE');
  });

  it('OVERALL: abc → overall null 且 errors 含该行', () => {
    const r = parseFindings('OVERALL: abc');
    expect(r.overall).toBeNull();
    expect(r.errors.some((e) => e.includes('abc'))).toBe(true);
  });

  it('全角冒号字段行可解析', () => {
    const r = parseFindings(`OVERALL: 8
---
SEVERITY：blocker
DIMENSION：设定一致
QUOTE：他拔出佩剑向城东疾驰
COMMENT：与连续性表冲突`);
    expect(r.findings.length).toBe(1);
    expect(r.errors).toEqual([]);
    expect(r.findings[0]).toEqual({
      severity: 'blocker',
      dimension: '设定一致',
      quote: '他拔出佩剑向城东疾驰',
      comment: '与连续性表冲突',
    });
  });

  it('markdown 围栏包裹输出可解析', () => {
    const r = parseFindings('```\n' + SAMPLE + '\n```');
    expect(r.findings.length).toBe(3);
    expect(r.overall).toBe(7);
    expect(r.errors).toEqual([]);
  });

  it('OVERALL 值含杂质仍取整数', () => {
    expect(parseFindings('OVERALL: 7/10').overall).toBe(7);
    expect(parseFindings('OVERALL: 7分').overall).toBe(7);
    const bad = parseFindings('OVERALL: abc');
    expect(bad.overall).toBeNull();
    expect(bad.errors.some((e) => e.includes('abc'))).toBe(true);
  });

  it('CRLF 解析与 LF 一致', () => {
    expect(parseFindings(SAMPLE.replace(/\n/g, '\r\n'))).toEqual(parseFindings(SAMPLE));
  });
});

const SUMMARY_SAMPLE = `SUMMARY: 主角夜探书房，发现密信，决意提前南下。
BEATS:
- 夜探书房
- 获得密信
THREADS:
- [planted] 密信落款人身份
STATE:
张三={"位置":"书房","持有":["密信"]}`;

describe('parseSummary', () => {
  it('附录 D summary 文样往返', () => {
    const r = parseSummary(SUMMARY_SAMPLE);
    expect(r.errors).toEqual([]);
    expect(r.summary).toBe('主角夜探书房，发现密信，决意提前南下。');
    expect(r.beats).toEqual(['夜探书房', '获得密信']);
    expect(r.openThreads).toEqual(['[planted] 密信落款人身份']);
    expect(r.characterDeltas).toEqual([{ name: '张三', stateJson: '{"位置":"书房","持有":["密信"]}' }]);
  });

  it('缺 SUMMARY → error', () => {
    const r = parseSummary('BEATS:\n- x');
    expect(r.summary).toBe('');
    expect(r.errors.length).toBe(1);
  });
});

const TREE_SAMPLE = `VOLUME: 第一卷 草原崛起
BODY: 少年离开村落，奠定成长基调。
STAGE: 觉醒篇
BODY: 力量体系初现。
CARD: 第1-4章 出发与启蒙
BODY: 告别村落；初遇同伴。
CARD: 第5-8章 边城风波
BODY: 守卫盘查引入主线。
STAGE: 汇流篇
CARD: 第9-12章 北上商路
VOLUME: 第二卷 王城风云
STAGE: 入城篇
CARD: 第13-16章 身份成谜
BODY: 贵人相助，暗线铺开。`;

describe('parseOutlineTree', () => {
  it('正例：两级卷/阶段/卡挂靠正确，BODY 挂最近节点，seq 逐级归一', () => {
    const r = parseOutlineTree(TREE_SAMPLE);
    expect(r.errors).toEqual([]);
    expect(r.tree.volumes).toHaveLength(2);
    const v1 = r.tree.volumes[0];
    expect(v1.title).toBe('第一卷 草原崛起');
    expect(v1.seq).toBe(1);
    expect(v1.body).toBe('少年离开村落，奠定成长基调。');
    expect(v1.stages.map((s) => s.title)).toEqual(['觉醒篇', '汇流篇']);
    expect(v1.stages[0].seq).toBe(1);
    expect(v1.stages[1].seq).toBe(2); // 阶段 seq 在各自卷内归一
    const cards1 = v1.stages[0].cards;
    expect(cards1.map((c) => c.title)).toEqual(['出发与启蒙', '边城风波']);
    expect(cards1[0].chapterFrom).toBe(1);
    expect(cards1[0].chapterTo).toBe(4);
    expect(cards1[0].body).toBe('告别村落；初遇同伴。');
    expect(cards1[1].body).toBe('守卫盘查引入主线。');
    expect(v1.stages[1].cards[0]).toMatchObject({ title: '北上商路', chapterFrom: 9, chapterTo: 12, body: '' });
    // 无卡阶段与空 BODY 卷不受影响
    expect(v1.stages[1].cards[0].seq).toBe(1);
    expect(r.tree.volumes[1].stages[0].cards[0].body).toBe('贵人相助，暗线铺开。');
  });

  it('孤儿 STAGE/CARD、游离 BODY 与杂行记 error 不抛；缺 VOLUME 行补 error', () => {
    const r = parseOutlineTree(`STAGE: 无卷阶段
CARD: 第1-2章 无阶段卡
BODY: 游离正文
这是一句没有前缀的噪声
VOLUME: 唯一卷`);
    expect(r.errors.some((e) => e.startsWith('STAGE 缺少所属卷'))).toBe(true);
    expect(r.errors.some((e) => e.startsWith('CARD 缺少所属阶段'))).toBe(true);
    expect(r.errors.some((e) => e.startsWith('BODY 缺少所属节点'))).toBe(true);
    expect(r.errors.some((e) => e.includes('无法识别的行'))).toBe(true);
    // 孤儿行不入树，合法卷正常
    expect(r.tree.volumes).toHaveLength(1);
    expect(r.tree.volumes[0].stages).toHaveLength(0);
    const empty = parseOutlineTree('BODY: 只有正文');
    expect(empty.errors).toContain('BODY 缺少所属节点: BODY: 只有正文');
    expect(empty.tree.volumes).toHaveLength(0);
    expect(empty.errors).toContain('缺少 VOLUME 行');
  });

  it('区间变体（-—~至）与无区间卡（null）解析', () => {
    const r = parseOutlineTree(`VOLUME: 卷
STAGE: 阶段
CARD: 第1-3章 半角杠
CARD: 第4—6章 破折号
CARD: 第7~9章 波浪线
CARD: 第10至12章 汉字至
CARD: 未定章号的卡`);
    const cards = r.tree.volumes[0].stages[0].cards;
    expect(cards.map((c) => [c.chapterFrom, c.chapterTo])).toEqual([
      [1, 3],
      [4, 6],
      [7, 9],
      [10, 12],
      [null, null],
    ]);
    expect(cards[4].title).toBe('未定章号的卡');
    expect(cards.map((c) => c.seq)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('parseAnalysis FREQTERMS 行（DEC-2026-1120-06）', () => {
  it('解析 FREQTERMS: <词组>: <说明> → freqTerms（同 TERMS 形态）；缺行补 []', () => {
    const r = parseAnalysis(`DIM: 节奏: 短句。
FREQTERMS: 抬眸: 常用于人物对视前的停顿，多出现于对峙语境
FREQTERMS: 沉默: 高频收尾用语，承担留白功能
RULES: 平均句长 10-20 字。`);
    expect(r.freqTerms).toEqual([
      { term: '抬眸', note: '常用于人物对视前的停顿，多出现于对峙语境' },
      { term: '沉默', note: '高频收尾用语，承担留白功能' },
    ]);
    // 无 FREQTERMS 行 → []
    expect(parseAnalysis('RULES: x').freqTerms).toEqual([]);
    // 全角冒号兼容 + 空词组记 error 不抛
    const messy = parseAnalysis('FREQTERMS：落雪：冬日场景惯用意象');
    expect(messy.freqTerms).toEqual([{ term: '落雪', note: '冬日场景惯用意象' }]);
    expect(parseAnalysis('FREQTERMS: : 说明').freqTerms).toEqual([]);
    expect(parseAnalysis('FREQTERMS: : 说明').errors.some((e) => e.includes('高频词为空'))).toBe(true);
  });
});
