import { describe, expect, it } from 'vitest';
import { DIMENSIONS, type ChapterBlueprint } from '@inkforge/shared';
import { renderCharacterCards, renderDraft, renderHardRules, renderQcTask, renderRewrite, renderSummarize } from '../../src/prompts/render';
import { parseBlueprint, parseOutline } from '../../src/llm/plainproto';

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
    // 维度「各一次」的契约只管七维度清单行（B3 的 OVERALL 锚点行在散文里提到「节奏」，不计入清单）
    const checklist = out
      .split('\n')
      .filter((l) => l.startsWith('- '))
      .join('\n');
    for (const d of DIMENSIONS) {
      expect(checklist.split(d).length - 1).toBe(1);
    }
    expect(out).toContain('不要输出 JSON');
    expect(out).toContain('示例维度');
  });

  it('renderQcTask 含 OVERALL 四档锚点（B3 评分解释），且锚点行不会被 parseFindings 误取为 OVERALL 值', () => {
    const out = renderQcTask();
    expect(out).toContain('【OVERALL 锚点】1=废稿');
    expect(out).toContain('5=不合格');
    expect(out).toContain('8=可入库');
    expect(out).toContain('10=范文级');
    // parseFindings 只认「行首大写键 + 冒号」：锚点行行首是【，故全提示里以 OVERALL 开头的行只有示例行一条
    expect(out.split('\n').filter((l) => l.startsWith('OVERALL'))).toEqual(['OVERALL: 6']);
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

  it('parseBlueprint：合格文样往返', () => {
    const raw = 'GOAL: 主角踏入试炼第六层\nBEATS:\n- 发现入口\n- 首次交锋\nHOOK: 身后石门闭合';
    const { blueprint, errors } = parseBlueprint(raw);
    expect(errors).toEqual([]);
    expect(blueprint.goal).toBe('主角踏入试炼第六层');
    expect(blueprint.beats).toEqual(['发现入口', '首次交锋', '身后石门闭合']);
    expect(blueprint.mustHaveBeats).toEqual([]);
    expect(blueprint.bannedTopics).toEqual([]);
  });

  it('parseBlueprint：缺 GOAL → errors 含该行且 beats 仍收', () => {
    const { blueprint, errors } = parseBlueprint('BEATS:\n- 发现入口\nHOOK: 石门闭合');
    expect(errors.some((e) => e.includes('GOAL'))).toBe(true);
    expect(blueprint.beats).toEqual(['发现入口', '石门闭合']);
  });
});

describe('parseOutline 契约', () => {
  it('parseOutline：两块合格文样往返（块内 GOAL/BEATS/HOOK 逐条）', () => {
    const raw = [
      '# 1',
      'GOAL: 少年踏上旅途',
      'BEATS:',
      '- 告别村落',
      '- 初遇同伴',
      'HOOK: 身后炊烟散尽',
      '# 2',
      'GOAL: 入城遇阻',
      'BEATS:',
      '- 守卫盘查',
      '- 遇贵人相助',
      'HOOK: 贵人身份成谜',
    ].join('\n');
    const { outline, errors } = parseOutline(raw, 2);
    expect(errors).toEqual([]);
    expect(outline).toHaveLength(2);
    expect(outline[0].chapterNo).toBe(1);
    expect(outline[0].blueprint.goal).toBe('少年踏上旅途');
    expect(outline[0].blueprint.beats).toEqual(['告别村落', '初遇同伴', '身后炊烟散尽']);
    expect(outline[1].chapterNo).toBe(2);
    expect(outline[1].blueprint.goal).toBe('入城遇阻');
    expect(outline[1].blueprint.beats).toEqual(['守卫盘查', '遇贵人相助', '身份成谜'.replace('身份成谜', '贵人身份成谜')]);
  });

  it('parseOutline：缺第2章块 → errors 含「缺少第2章块」且首块蓝图仍收', () => {
    const raw = '# 1\nGOAL: 只有一章\nBEATS:\n- 孤章\nHOOK: 门关上了';
    const { outline, errors } = parseOutline(raw, 2);
    expect(errors.some((e) => e.includes('缺少第2章块'))).toBe(true);
    expect(outline).toHaveLength(1);
    expect(outline[0].blueprint.goal).toBe('只有一章');
  });
});

describe('renderCharacterCards 契约', () => {
  it('renderCharacterCards：多卡渲染含姓名与设定键值', () => {
    const out = renderCharacterCards([
      { name: '张三', baseSetting: '{"身份":"主角","性格":"坚韧"}' },
      { name: '李四', baseSetting: '{}' },
    ]);
    expect(out).toContain('【人物卡】张三');
    expect(out).toContain('身份: 主角');
    expect(out).toContain('性格: 坚韧');
    expect(out).toContain('【人物卡】李四');
    expect(out.indexOf('张三')).toBeLessThan(out.indexOf('李四'));
  });

  it('renderCharacterCards：空数组 → 空串；非法 JSON → 原文', () => {
    expect(renderCharacterCards([])).toBe('');
    const raw = renderCharacterCards([{ name: '王五', baseSetting: '不是JSON' }]);
    expect(raw).toContain('【人物卡】王五');
    expect(raw).toContain('不是JSON');
  });
});
