import { describe, expect, it } from 'vitest';
import { buildTensionPrompt, parseTensionRows, type TensionRow } from '../../src/fusion/tension';

// 中性仿形夹具（canned 自造；《示例设定》系占位文本，全局内容无关律：禁引 v6 真实文本）
const TENSION_TEXT = [
  '这是一行非协议说明文本，应当被忽略。',
  'TENSION: 描写密度 | 设定集主张详尽铺陈 | 档案规则偏好留白 | 拉扯 | 偏向档案规则 | 维度=尺度',
  'TENSION: 场景推进 | 大纲卡要求强情节 | 档案规则要求慢节奏 | 冗余 | 保持现状 | 占比=仙家',
  'TENSION: 人物弧光 | 简介未交代动机 | 档案结构含弧光参考 | 缺口 | 绑定该档案',
].join('\n');

const EXPECTED: TensionRow[] = [
  {
    entry: '描写密度',
    mdSide: '设定集主张详尽铺陈',
    profileSide: '档案规则偏好留白',
    nature: '拉扯',
    suggestion: '偏向档案规则',
    lever: 'dim',
    dim: '尺度',
  },
  {
    entry: '场景推进',
    mdSide: '大纲卡要求强情节',
    profileSide: '档案规则要求慢节奏',
    nature: '冗余',
    suggestion: '保持现状',
    lever: 'weights',
    profileName: '仙家',
  },
  {
    entry: '人物弧光',
    mdSide: '简介未交代动机',
    profileSide: '档案结构含弧光参考',
    nature: '缺口',
    suggestion: '绑定该档案',
    lever: 'none',
  },
];

describe('fusion/tension 行协议（Task-03；规格 §3.5）', () => {
  it('三行合法协议 → rows 钉值五键逐项', () => {
    const { rows, invalid } = parseTensionRows(TENSION_TEXT);
    expect(invalid).toBe(0);
    expect(rows).toEqual(EXPECTED);
    expect(rows.map((r) => r.nature)).toEqual(['拉扯', '冗余', '缺口']);
    // 五键逐项（entry / mdSide / profileSide / nature / suggestion）
    expect(rows[0]!.entry).toBe('描写密度');
    expect(rows[0]!.mdSide).toBe('设定集主张详尽铺陈');
    expect(rows[0]!.profileSide).toBe('档案规则偏好留白');
    expect(rows[0]!.nature).toBe('拉扯');
    expect(rows[0]!.suggestion).toBe('偏向档案规则');
  });

  it('性质词非法行 → 丢弃且 invalid 恰 1', () => {
    const text = `${TENSION_TEXT}\nTENSION: 非法规格 | 甲侧 | 乙侧 | 冲突 | 丙建议`;
    const { rows, invalid } = parseTensionRows(text);
    expect(invalid).toBe(1);
    expect(rows).toHaveLength(3);
    expect(rows.some((r) => r.entry === '非法规格')).toBe(false);
  });

  it('维度=视角 → 折算 dim:\'叙述方式\'（旧例只翻转钉值；DM-3）', () => {
    const text = 'TENSION: 描写密度 | 甲侧 | 乙侧 | 拉扯 | 偏向档案 | 维度=视角';
    const { rows, invalid } = parseTensionRows(text);
    expect(invalid).toBe(0);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.lever).toBe('dim');
    expect(rows[0]!.dim).toBe('叙述方式');
  });

  it('旧八维名与视角词落点 → 折算为新六维 dim（DM-3）', () => {
    const foldCases: Array<[string, string | undefined]> = [
      ['写作特点', '叙述方式'],
      ['节奏', '结构与节奏'],
      ['对话', '语言与描写'],
      ['描写', '语言与描写'],
      ['章节结构', '结构与节奏'],
      ['视角', '叙述方式'],
      ['人称', '叙述方式'],
      ['POV', '叙述方式'],
      ['pov', '叙述方式'],
      ['视点', '叙述方式'],
      ['描写密度', undefined], // 旧名取消且不在折算表 → lever:none
      ['叙述视角', undefined], // 旧名取消且不在折算表 → lever:none
    ];
    const text = foldCases
      .map(([raw], i) => `TENSION: 条目${i} | 甲侧 | 乙侧 | 拉扯 | 偏向档案 | 维度=${raw}`)
      .join('\n');
    const { rows, invalid } = parseTensionRows(text);
    expect(invalid).toBe(0);
    expect(rows).toHaveLength(foldCases.length);
    foldCases.forEach(([, dim], i) => {
      const row = rows[i]!;
      if (dim) {
        expect(row.lever).toBe('dim');
        expect(row.dim).toBe(dim);
      } else {
        expect(row.lever).toBe('none');
        expect(row.dim).toBeUndefined();
      }
    });
  });

  it('落点段空串 / 未知前缀写法 → lever:none', () => {
    const text = [
      'TENSION: 空落点 | 甲侧 | 乙侧 | 拉扯 | 偏向档案 | ',
      'TENSION: 未知写法 | 甲侧 | 乙侧 | 冗余 | 保持现状 | 参考档案',
    ].join('\n');
    const { rows, invalid } = parseTensionRows(text);
    expect(invalid).toBe(0);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.lever)).toEqual(['none', 'none']);
  });

  it('六段 + 性质词非法 → 丢弃且 invalid 恰 1（nature 校验在 6 段下仍生效）', () => {
    const text = 'TENSION: 非法规格 | 甲侧 | 乙侧 | 冲突 | 丙建议 | 维度=尺度';
    const { rows, invalid } = parseTensionRows(text);
    expect(invalid).toBe(1);
    expect(rows).toHaveLength(0);
  });

  it('建议段含竖线致 7 段 → 丢行计 invalid', () => {
    const text = 'TENSION: 条目 | 甲侧 | 乙侧 | 拉扯 | 建议含|竖线 | 维度=尺度';
    const { rows, invalid } = parseTensionRows(text);
    expect(invalid).toBe(1);
    expect(rows).toHaveLength(0);
  });

  it('rows 超 20 → 截断 20', () => {
    const natures = ['拉扯', '冗余', '缺口'] as const;
    const many = Array.from(
      { length: 23 },
      (_, i) => `TENSION: 条目${i} | MD侧${i} | 档案侧${i} | ${natures[i % 3]} | 建议${i}`,
    ).join('\n');
    const { rows, invalid } = parseTensionRows(many);
    expect(invalid).toBe(0);
    expect(rows).toHaveLength(20);
    expect(rows[0]!.entry).toBe('条目0');
    expect(rows[19]!.entry).toBe('条目19');
  });

  it('prompt 含负约束行与描述/大纲/已绑/候选四段标记', () => {
    const prompt = buildTensionPrompt({
      description: '示例描述',
      outline: '示例大纲',
      boundStyles: [{ name: '已绑档案甲', rulesText: '已绑规则甲' }],
      boundPlanner: [{ kind: 'plot', name: '已绑剧情档案', structure: '已绑结构甲' }],
      candidateStyles: [{ name: '候选档案乙', rulesText: '候选规则乙' }],
      candidatePlanner: [{ kind: 'spectrum', name: '候选光谱档案', structure: '候选结构乙' }],
    });
    expect(prompt).toContain('TENSION:');
    expect(prompt).toContain('不要输出 JSON');
    expect(prompt).toContain('落点');
    expect(prompt).toContain('维度=');
    expect(prompt).toContain('占比=');
    expect(prompt).toContain('门外');
    expect(prompt).toContain('【描述】');
    expect(prompt).toContain('【大纲】');
    expect(prompt).toContain('【已绑');
    expect(prompt).toContain('【候选');
    expect(prompt).toContain('已绑规则甲');
    expect(prompt).toContain('已绑结构甲');
    expect(prompt).toContain('候选规则乙');
    expect(prompt).toContain('候选结构乙');
  });

  it('prompt 落点写法/负约束行含六维名与旧名+视角折算字样（DM-3）', () => {
    const prompt = buildTensionPrompt({
      description: '',
      outline: '',
      boundStyles: [],
      boundPlanner: [],
      candidateStyles: [],
      candidatePlanner: [],
    });
    expect(prompt).toContain('维度=<六维名');
    expect(prompt).toContain('视角/人称/POV');
  });

  it('超长 description → prompt 中被截至 2000 字+省略号', () => {
    const longDescription = '描'.repeat(2100);
    const prompt = buildTensionPrompt({
      description: longDescription,
      outline: '',
      boundStyles: [],
      boundPlanner: [],
      candidateStyles: [],
      candidatePlanner: [],
    });
    expect(prompt).toContain(`【描述】${'描'.repeat(2000)}…`);
    expect(prompt).not.toContain('描'.repeat(2001));
  });
});
