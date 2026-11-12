import { describe, expect, it } from 'vitest';
import { DIMENSIONS, type ChapterBlueprint } from '@inkforge/shared';
import { renderDraft, renderHardRules, renderQcTask, renderRewrite, renderSummarize } from '../../src/prompts/render';

const BP: ChapterBlueprint = {
  goal: '主角进入书房取得密信',
  beats: ['夜探书房', '取得密信'],
  mustHaveBeats: [{ text: '密信到手', keywords: ['密信'] }],
  bannedTopics: ['朝堂党争'],
};
const DRAFT = '他推开门。雨停了。庭院里的积水映着月光。少年快步穿过回廊，来到书房门前。';

describe('prompt 渲染契约', () => {
  it('renderQcTask：四字段标记 + 七维度各一次 + 负约束 + 示例块', () => {
    const out = renderQcTask();
    for (const marker of ['SEVERITY:', 'QUOTE:', 'OVERALL', 'COMMENT:']) expect(out).toContain(marker);
    for (const d of DIMENSIONS) {
      expect(out.split(d).length - 1).toBe(1);
    }
    expect(out).toContain('不要输出 JSON');
    expect(out).toContain('示例维度');
  });

  it('renderQcTask 不嵌入正文', () => {
    const out = renderQcTask();
    expect(out).not.toContain(DRAFT);
  });

  it('renderDraft：含世界观前 20 字符与禁区文本', () => {
    const worldview = '九州修真界，灵气自东而来，宗门林立，凡人如草芥。';
    const out = renderDraft({ chapterNo: 3, targetChars: 3000, worldview, blueprint: BP });
    expect(out).toContain(worldview.slice(0, 20));
    expect(out).toContain('朝堂党争');
    expect(out).toContain('第 3 章');
    expect(out).toContain('密信');
  });

  it('renderRewrite：findings 清单与修订指令齐备', () => {
    const out = renderRewrite({
      findings: [{ severity: 'blocker', dimension: '设定一致', quote: '他拔出佩剑', comment: '佩剑已折断' }],
      taskInstruction: '仅修复所列问题，其余保持原样',
    });
    expect(out).toContain('blocker');
    expect(out).toContain('他拔出佩剑');
    expect(out).toContain('佩剑已折断');
    expect(out).toContain('仅修复所列问题');
  });

  it('renderHardRules：目标带 0.9-1.1 与自检指令、硬上限 1.2', () => {
    const out = renderHardRules(3000);
    expect(out).toContain('2700');
    expect(out).toContain('3300');
    expect(out).toContain('3600');
    expect(out).toContain('清点一遍字数');
    expect(out).not.toContain('必须写在');
  });

  it('renderSummarize：四个格式标记齐备', () => {
    const out = renderSummarize({ chapterNo: 5, content: DRAFT });
    for (const marker of ['SUMMARY:', 'BEATS:', 'THREADS:', 'STATE:']) expect(out).toContain(marker);
    expect(out).toContain(DRAFT.slice(0, 10));
  });
});
