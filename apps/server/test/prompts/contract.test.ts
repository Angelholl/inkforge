import { describe, expect, it } from 'vitest';
import { DIMENSIONS, type ChapterBlueprint } from '@inkforge/shared';
import { LANDING_POOL_BUDGET_CHARS, renderCharacterCards, renderDraft, renderHardRules, renderQcTask, renderRefineReduceTask, renderRewrite, renderSummarize, renderTaskSummaryBlock } from '../../src/prompts/render';
import { parseBlueprint, parseOutline } from '../../src/llm/plainproto';
import { MANDATE_TEXT_PREFIX } from '../../src/pipeline/mandate';

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

  it('renderQcTask：文风贴合评准线钉死方向（DEC-2026-1122-03①）', () => {
    const out = renderQcTask();
    expect(out).toContain('【文风贴合评准】');
    expect(out).toContain('露骨直白的表达即为贴合');
    expect(out).toContain('不得以「过于直白」');
  });

  it('renderDraft：含世界观前 20 字符与禁区文本', () => {
    const worldview = '九州修真界，灵气自东而来，宗门林立，凡人如草芥。';
    const out = renderDraft({ chapterNo: 3, targetChars: 3000, worldview, blueprint: BP });
    expect(out).toContain(worldview.slice(0, 20));
    expect(out).toContain('朝堂党争');
    expect(out).toContain('第 3 章');
    expect(out).toContain('密信');
  });

  it('renderDraft：带 grade 必含节拍显示落地分级提示', () => {
    const bp = { ...BP, mustHaveBeats: [{ text: '密信到手', keywords: ['密信'], grade: 'H' as const }] };
    const out = renderDraft({ chapterNo: 3, targetChars: 3000, worldview: '世界观占位', blueprint: bp });
    expect(out).toContain('【必含节拍】密信到手（落地·H级须显性词）（须出现关键词：密信）');
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
    const out = renderSummarize({
      chapterNo: 5,
      content: DRAFT,
      roster: [],
      rosterTruncated: false,
      foreshadowTitles: [],
      foreshadowTruncated: false,
    });
    for (const marker of ['SUMMARY:', 'BEATS:', 'THREADS:', 'STATE:']) expect(out).toContain(marker);
    expect(out).toContain(DRAFT.slice(0, 10));
    expect(out).not.toContain('【已知角色名册】');
  });

  it('renderSummarize 注入名册与伏笔标题行及截断注记', () => {
    const out = renderSummarize({
      chapterNo: 5,
      content: DRAFT,
      roster: ['张三', '李四'],
      rosterTruncated: true,
      foreshadowTitles: ['密信落款人身份'],
      foreshadowTruncated: false,
    });
    expect(out).toContain('- 张三');
    expect(out).toContain('- 李四');
    expect(out).toContain('（名册未列全，超出上限部分未列出）');
    expect(out).toContain('- 密信落款人身份');
    expect(out).not.toContain('（伏笔未列全，超出上限部分未列出）');
    expect(out).not.toContain('baseSetting');
    expect(out.split('\n').filter((l) => l.includes('张三'))).toEqual(['- 张三']);
  });

  it('renderSummarize 名册非排他文案（DEC-2026-1127-03）', () => {
    const out = renderSummarize({
      chapterNo: 5,
      content: DRAFT,
      roster: ['张三（别名：小三）'],
      rosterTruncated: false,
      foreshadowTitles: [],
      foreshadowTruncated: false,
    });
    expect(out).toContain('优先使用');
    expect(out).not.toContain('一律不写入');
    expect(out.split('\n').filter((l) => l.includes('张三'))).toEqual(['- 张三（别名：小三）']);
  });

  it('renderRefineReduceTask 含“合并”“预算 20000 字”关键词', () => {
    const out = renderRefineReduceTask(['甲', '乙'], 20000);
    expect(out).toContain('合并');
    expect(out).toContain('预算 20000 字');
    expect(out).toContain('甲');
    expect(out).toContain('乙');
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

  it('renderDraft/renderTaskSummaryBlock：keywords=[] 条目跳过关键词括注（DEC-2026-1122-01）', () => {
    const text = `${MANDATE_TEXT_PREFIX}本章须完成一次高强落地（H级）重场戏，落地分级词表须显性命中`;
    const beat = { text, keywords: [] as string[], grade: 'H' as const, source: 'mandate' as const };
    const blueprint = { goal: 'g', beats: [], mustHaveBeats: [beat], bannedTopics: [] };
    const draftOut = renderDraft({ chapterNo: 3, targetChars: 3000, worldview: '世界观占位', blueprint });
    expect(draftOut).toContain(`【必含节拍】${text}（落地·H级须显性词）`);
    expect(draftOut).not.toContain('须出现关键词：');
    const summary = renderTaskSummaryBlock({ mustHaveBeats: [beat] });
    expect(summary).toContain(`· ${text}（落地·H级须显性词）`);
    expect(summary).not.toContain('须出现关键词：');
  });

  describe('renderTaskSummaryBlock 显性词参考块（DEC-2026-1122-03②，夹具词全中性）', () => {
    const beatH = { text: '高强落地重场戏', keywords: ['密信'], grade: 'H' as const, source: 'mandate' as const };
    const beatL = { text: '轻度落地场景', keywords: [], grade: 'L' as const, source: 'mandate' as const };
    const pool = { h: ['玉佩光'], l: ['铜镜摇', '窗棂摇'] };

    it('① grade H → 词池 H∪L 全量+H 命中口径句', () => {
      const out = renderTaskSummaryBlock({ mustHaveBeats: [beatH], styleRulesText: '短句为主。', landingWords: pool });
      expect(out).toContain('【显性词参考】');
      expect(out).toContain('落地词池（H∪L）：玉佩光、铜镜摇、窗棂摇');
      expect(out).toContain('2 个不同 L 池词');
    });

    it('② 仅 grade L → 词池只用 L 池，不含 H 池词', () => {
      const out = renderTaskSummaryBlock({ mustHaveBeats: [beatL], landingWords: pool });
      expect(out).toContain('落地词池（L）：铜镜摇、窗棂摇');
      expect(out).not.toContain('玉佩光');
      expect(out).toContain('L级场景至少 1 个 L 池词');
    });

    it('③ 不传 landingWords → 不产出词池块（向后兼容回归钉）', () => {
      const out = renderTaskSummaryBlock({ mustHaveBeats: [beatH], styleRulesText: '短句为主。' });
      expect(out).not.toContain('【显性词参考】');
    });

    it('④ 贪心预算 300 字符截断：至少收 1 词且不超预算', () => {
      const out = renderTaskSummaryBlock({
        mustHaveBeats: [beatH],
        landingWords: { h: Array.from({ length: 120 }, (_, i) => `玉光甲${i}`), l: [] },
      });
      const poolLine = out.split('\n').find((l) => l.startsWith('落地词池'))!;
      const acc = poolLine.slice(poolLine.indexOf('：') + 1);
      expect(acc.length).toBeLessThanOrEqual(LANDING_POOL_BUDGET_CHARS);
      expect(acc.startsWith('玉光甲0')).toBe(true);
      expect(acc).toContain('、');
    });

    it('⑤ 词池全空 → 不产出词池块（fail-open 镜像 l0）', () => {
      const out = renderTaskSummaryBlock({ mustHaveBeats: [beatH], landingWords: { h: [], l: [] } });
      expect(out).not.toContain('【显性词参考】');
    });

    it('⑥ 次序钉（D-D）：词池块居末位，文风铁则先于显性词参考', () => {
      const out = renderTaskSummaryBlock({ mustHaveBeats: [beatH], styleRulesText: '短句为主。', landingWords: pool });
      expect(out.indexOf('【文风铁则】')).toBeLessThan(out.indexOf('【显性词参考】'));
    });
  });
});
