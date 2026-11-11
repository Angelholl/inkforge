import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config';
import { runL1Qc } from '../../src/quality/l1';
import { createMockProvider } from '../../src/llm/mock';

const config = loadConfig({
  STRATA_BASE_URL: 'http://127.0.0.1:47831/v1',
  STRATA_API_KEY: 'strata',
  STRATA_MODEL: 'iq3_xxs',
});

const DRAFT = '他推开门。雨停了。庭院里的积水映着月光。少年穿过回廊来到书房。';

const GOOD_QC = `OVERALL: 7
---
SEVERITY: blocker
DIMENSION: 设定一致
QUOTE: 他推开门
COMMENT: 与连续性表冲突：上章末门已被封死
---
SEVERITY: major
DIMENSION: 节奏
QUOTE: 雨停了
COMMENT: 开篇收束过快
---
SEVERITY: minor
DIMENSION: 结尾钩子
QUOTE: 来到书房
COMMENT: 收尾平缓`;

describe('runL1Qc', () => {
  it('附录 D 文样 → findings 3 条、overall 7、repaired false', async () => {
    const p = createMockProvider({ qc: { text: GOOD_QC } });
    const r = await runL1Qc({ provider: p, config }, { draft: DRAFT, blueprintText: '目标', continuityText: '前情', round: 0, chapterNo: 1 });
    expect(r.findings.length).toBe(3);
    expect(r.overall).toBe(7);
    expect(r.repaired).toBe(false);
    expect(r.invalidQuotes).toBe(0);
  });

  it('坏格式后修复重试一次 → repaired true 且 findings 正确', async () => {
    const p = createMockProvider({ qc: { sequence: [{ text: '坏格式输出' }, { repeat: { text: GOOD_QC } }] } });
    const r = await runL1Qc({ provider: p, config }, { draft: DRAFT, blueprintText: '目标', continuityText: '', round: 0 });
    expect(r.repaired).toBe(true);
    expect(r.findings.length).toBe(3);
    expect(r.overall).toBe(7);
  });

  it('quote 不在 draft 中 → 丢弃该条且 invalidQuotes===1', async () => {
    const badQuote = GOOD_QC.replace('QUOTE: 他推开门', 'QUOTE: 这句话不在正文里出现');
    const p = createMockProvider({ qc: { text: badQuote } });
    const r = await runL1Qc({ provider: p, config }, { draft: DRAFT, blueprintText: '目标', continuityText: '', round: 0 });
    expect(r.findings.length).toBe(2);
    expect(r.invalidQuotes).toBe(1);
  });
});
