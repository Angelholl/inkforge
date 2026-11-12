import { describe, expect, it } from 'vitest';
import { parseFindings, parseSummary } from '../../src/llm/plainproto';

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
