import { describe, expect, it } from 'vitest';
import { parseLandingCell, parseSettingsCompendium, splitCompendiumSections } from '../src/settings-import';

// 中性仿形设定集夹具（DEC-2026-1120-04 全局约束：原始 MD 不进仓库，夹具内容全部中性占位）
const FIXTURE = `# 《示例之作》都市群像长篇 · 扩写设定集

> 定位一句话：一部以日常群像为引擎的都市连载——主角是恒定太阳，每卷转进来一颗新行星。
> 本设定集 = 原文解剖 + 世界观 + 规则体系 + 人物圣经 + 分卷大纲。

---

## 1. 原文六章解剖

### 1.1 结构与剧情

原文实为三个故事拼贴（中性占位叙述，供骨架识别用）。

### 1.5 悬置线清单（扩写的第一桶金）

1. 厨房对面的一双眼睛（原文明说"后话"）；2. 表叔拜访未完成；3. 远行的两人未归。

## 3. 世界观

### 3.1 时空统一 \`[补充]\`

虚构港市临海市，全篇统一南方地理，年代约 2003，通讯为市话与简讯。

### 3.2 世界内核命题

欲望在这个世界里是一种天赋，也是一种资本；群像剧不审判，只记账。

## 4. 规则体系

### 4.1 世界内规则

1. **借口律**：每场戏必须有社会可接受的借口。
2. **观众律**：每场戏至少一双眼睛。

## 5. 人物圣经

### 5.1 核心二人

**主角（沈真真，26）** \`[年龄补充]\`
连锁公司业务员；性格黏人爽利、记账精。弧光：藏→半摊→共谋。

**主角丈夫（王大磊，29）** \`[命名补充]\`
工程公司课员；温和精算、自嘲幽默。弧光：无知→知情→共谋。

### 5.2 常驻中圈（原文升格＋新增）

| 人物 | 档案 | 功能与弧光 |
|---|---|---|
| **老周**（周仲良，52，中介） | 占位档案：油腔谈判 | 网络节点：牵出真业主 |
| **郭珍**（38，真业主）\`[新]\` | 多栋物业女房东、离异 | 女性线教母 |

### 5.3 亲缘与外围轮换池 \`[新]\`

- **台中表姨家**：表姨（退休教师）、表妹**阿纯**（24，护士）。
- **邻居阿芳**（29，隔壁宝妈）。

**关系网一句话**：公司↔中介↔两家亲戚↔两个社区。

## 6. 总大纲（卷—篇—章；章数无上限）

### 卷一 《起点篇》（第 1–3 章）——原文正典化，嵌套框架

1. **第一夜**（开场：提前归家、悬念前置）
2. **坦白局**（框架确立；倒叙启动）

### 卷二 《租房记》（第 4–9 章）——房东线＋贼眼兑现

13-15 **年会篇**：13 备装（采购线启动）；14 圆桌（两线交汇）；15 KTV（全场装傻）
16-18 **外勤篇** \`[新]\`（出差组局：16 出差邀约；17 镜像诱惑；18 回航）
19. **虚惊**（验孕条虚惊章：近破裂一次）
20. **升职**（hook：海边别墅邀约）
21. **半角测试** (half-width parens test); 22. **Another chapter**

### 卷七起 · 开放循环（章数无上限）\`[新]\`

- **婚礼卷**：婚宴＋隔夜借宿＋闹房游戏。

## 9. 文风与语言规范

- **两种叙述声**：丈夫腔（自嘲、统计幽默）／主角腔（内窥、娇嗔）。
- **暖世界原则**：无人因欲望家破人亡；桥段以喜剧谈判收场。
`;

describe('parseSettingsCompendium', () => {
  const d = parseSettingsCompendium(FIXTURE);

  it('标题：取 H1《》内文', () => {
    expect(d.title).toBe('示例之作');
  });

  it('description：定位句+世界观节+规则体系节，按序聚合，标注 tag 剥除', () => {
    expect(d.description).toContain('定位一句话：一部以日常群像为引擎的都市连载');
    expect(d.description).toContain('虚构港市临海市');
    expect(d.description).toContain('借口律');
    const iQuote = d.description.indexOf('定位一句话');
    const iWorld = d.description.indexOf('虚构港市');
    const iRules = d.description.indexOf('借口律');
    expect(iQuote).toBeGreaterThanOrEqual(0);
    expect(iWorld).toBeGreaterThan(iQuote);
    expect(iRules).toBeGreaterThan(iWorld);
    expect(d.description).not.toContain('`[补充]`');
    expect(d.description).not.toContain('###');
  });

  it('人物卡：粗体段/表格/bullet 三形态共 6 张，{"设定": text} 包裹，标签段不入卡', () => {
    expect(d.characters.map((c) => c.name)).toEqual(['主角', '主角丈夫', '老周', '郭珍', '台中表姨家', '邻居阿芳']);
    expect(JSON.parse(d.characters[0].baseSetting)).toEqual({ 设定: '连锁公司业务员；性格黏人爽利、记账精。弧光：藏→半摊→共谋。' });
    expect(d.characters[2].baseSetting).toContain('周仲良，52，中介');
    expect(d.characters[2].baseSetting).toContain('网络节点：牵出真业主');
    expect(d.characters[3].baseSetting).toContain('（38，真业主）');
    expect(d.characters[4].baseSetting).toContain('表姨（退休教师）');
    expect(d.characters.some((c) => c.name === '关系网一句话')).toBe(false);
  });

  it('大纲树：3 卷 5 阶段 13 卡，卷题含卷号、区间篇行成阶段、章卡带章号', () => {
    expect(d.outlineTree.volumes).toHaveLength(3);
    expect(d.outlineTree.volumes[0].title).toBe('卷一 起点篇');
    expect(d.outlineTree.volumes[0].stages).toHaveLength(1);
    expect(d.outlineTree.volumes[0].stages[0].cards).toHaveLength(2);
    expect(d.outlineTree.volumes[1].title).toBe('卷二 租房记');
    expect(d.outlineTree.volumes[1].stages.map((s) => s.title)).toEqual(['年会篇', '外勤篇', '']);
    expect(d.outlineTree.volumes[1].stages[0].cards.map((c) => c.chapterFrom)).toEqual([13, 14, 15]);
    expect(d.outlineTree.volumes[1].stages[2].cards).toHaveLength(4);
    expect(d.outlineTree.volumes[2].stages[0].cards[0]).toMatchObject({ title: '婚礼卷', chapterFrom: null });
    const allCards = d.outlineTree.volumes.flatMap((v) => v.stages.flatMap((s) => s.cards));
    expect(allCards).toHaveLength(13);
    expect(allCards.find((c) => c.chapterFrom === 21)).toMatchObject({ title: '半角测试', body: 'half-width parens test' });
    expect(allCards.find((c) => c.chapterFrom === 1)).toMatchObject({ title: '第一夜', body: '开场：提前归家、悬念前置' });
  });

  it('伏笔：悬置线 H3 → 3 条 plantedCh=1', () => {
    expect(d.foreshadowings).toHaveLength(3);
    expect(d.foreshadowings.every((f) => f.plantedCh === 1)).toBe(true);
    expect(d.foreshadowings[0].description).toContain('厨房对面的一双眼睛');
    expect(d.foreshadowings[2].description).toContain('远行的两人未归');
  });

  it('outlineItems/chapterTitles：12 章预填，goal=梗概', () => {
    expect(d.outlineItems.map((i) => i.chapterNo)).toEqual([1, 2, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22]);
    expect(d.chapterTitles['13']).toBe('备装');
    expect(d.outlineItems[2].blueprint.goal).toBe('采购线启动');
    expect(d.outlineItems[0].blueprint).toEqual({ goal: '开场：提前归家、悬念前置', beats: [], mustHaveBeats: [], bannedTopics: [] });
  });

  it('styleSection：文风节原文提取', () => {
    expect(d.styleSection).toContain('两种叙述声');
    expect(d.styleSection).toContain('暖世界原则');
    expect(d.styleSection).not.toContain('## ');
    expect(d.importStyle).toBe(true);
  });

  it('正常夹具无 warning', () => {
    expect(d.warnings).toEqual([]);
  });

  it('超长 description/outline → 预算 warning（扩槽阈值 20000/8000，DEC-2026-1121-01）', () => {
    const longWorld = `# 《长文》设定集\n\n> 定位一句话。\n\n## 3. 世界观\n\n${'长'.repeat(21000)}\n\n## 6. 总大纲\n\n### 卷一 《题》（第 1–2 章）——${'纲'.repeat(9000)}\n`;
    const w = parseSettingsCompendium(longWorld);
    expect(w.warnings.some((x) => x.includes('20000'))).toBe(true);
    expect(w.warnings.some((x) => x.includes('8000'))).toBe(true);
  });

  it('边界：空串/无骨架文本不抛异常且给未识别 warning', () => {
    for (const bad of ['', '随便写的没有标题的文本']) {
      const w = parseSettingsCompendium(bad);
      expect(w.warnings.some((x) => x.includes('未识别'))).toBe(true);
      expect(w.characters).toEqual([]);
      expect(w.outlineTree.volumes).toEqual([]);
    }
  });

  it('边界：H1 无《》 → 剥设定集后缀取书名', () => {
    const t = parseSettingsCompendium('# 奇幻成长记·扩写设定集\n\n## 3. 世界观\n\n大陆。');
    expect(t.title).toBe('奇幻成长记');
  });

  it('边界：人物重名去重并 warning', () => {
    const dup = `# 《重名书》\n\n## 5. 人物圣经\n\n**张三**\n设定一。\n\n**张三**\n设定二。\n`;
    const w = parseSettingsCompendium(dup);
    expect(w.characters).toHaveLength(1);
    expect(w.warnings.some((x) => x.includes('重名'))).toBe(true);
  });

  it('边界：卡超 200 截断、伏笔超 50 截断', () => {
    const many = [
      '# 《多卡书》',
      '## 6. 总大纲',
      '### 卷一 《题》',
      ...Array.from({ length: 250 }, (_, i) => `${i + 1}. **第${i + 1}章**（梗概${i + 1}）`),
      '',
      '### 9.9 悬置线清单',
      Array.from({ length: 60 }, (_, i) => `${i + 1}. 线索${i + 1}`).join('；'),
    ].join('\n');
    const w = parseSettingsCompendium(many);
    const cards = w.outlineTree.volumes.flatMap((v) => v.stages.flatMap((s) => s.cards));
    expect(cards).toHaveLength(200);
    expect(w.warnings.some((x) => x.includes('200'))).toBe(true);
    expect(w.foreshadowings).toHaveLength(50);
    expect(w.warnings.some((x) => x.includes('50'))).toBe(true);
    expect(w.outlineItems).toHaveLength(200);
  });

  // ── v3 形态适配（DEC-2026-1120-04 追加裁决：结构重排/矩阵扩容/精炼前置）──
  const V3_FIXTURE = `# 《示例新作》长篇 · 扩写设定集（v3）

> 定位一句话：多线穿插的都市群像连载。

## 1. 原文解剖

### 1.5 悬置线清单

贼眼邻居／未完成的拜访／远行两人未归／怀上的孩子生父是谁

## 3. 世界观

虚构港市，年代约 2003。

## 4. 规则体系

1. **借口律**：每场戏必须有借口。

## 5. 人物圣经

### 5.2 常驻中圈

| 人物 | 档案 | 边与场次 |
| --- | --- | --- |
| 老王（王仲良，52，中介） | 占位档案 | ×主角 5 |
| 阿珍（38，业主） | 占位档案二 | ×主角 3 |

## 6. 大纲

### 6.1 结构总说

多线穿插，不切卷。

### 6.2 故事线池

| 线 | 内容 | 常驻拍点型 |
| --- | --- | --- |
| L1 蜜月线 | 林家、钓船 | 婚后回访 |

### 6.3 阶段总表

**阶段A 「结婚那年」**（2003）
| 章 | 标题 | 线 | 落地 |
| --- | --- | --- | --- |
| 1 | 第一夜 | L10 | H（开场钩子） |
| 2 | 坦白局 | L10 | L（框架确立） |

**阶段B 「新家第一年」**（2004）
| 章 | 标题 | 线 | 落地 |
| --- | --- | --- | --- |
| 3 | 借宿 | L4 | H（车站接人） |
| 4 | 客房事件 | L4 | L |

### 6.4 穿插示范（阶段A 章序全表）

| 章 | 标题 | 线 | 落地 |
| --- | --- | --- | --- |
| 1 | 第一夜 | L10 | H（开场钩子） |
| 2 | 坦白局 | L10 | L（框架确立） |
| 3 | 借宿 | L4 | H（车站接人） |
| 5 | 尾声 | L3 | L（收束） |

### 6.5 剧情引擎库

| 引擎 | 来源类型 | 用法 |
| --- | --- | --- |
| 婆媳同住季 | 家庭伦理剧 | 长辈线 |

## 8. 关系发生矩阵

| 边 | 场数 | 首场 | 后续分布 |
| --- | --- | --- | --- |
| 主角×老王 | 5 | A·4 | A·5/7/12 |
| 主角×阿珍 | 3 | B·2 | B·4/6 |
`;

  it('v3 description：全文精炼前置（定位句起头、文档序、表格压行、无 markdown 残留、<20000 零警示）', () => {
    const d = parseSettingsCompendium(V3_FIXTURE);
    expect(d.description).toContain('定位一句话：多线穿插的都市群像连载');
    expect(d.description).toContain('虚构港市');
    expect(d.description).toContain('借口律');
    expect(d.description).toContain('阶段A 「结婚那年」');
    expect(d.description).toContain('老王（王仲良，52，中介）');
    expect(d.description).toContain('主角×老王');
    expect(d.description.indexOf('定位一句话')).toBeLessThan(d.description.indexOf('虚构港市'));
    expect(d.description).not.toContain('#');
    expect(d.description).not.toContain('**');
    expect(d.description).not.toContain('`[前置注]`');
    expect(d.description.length).toBeLessThan(20000);
    expect(d.warnings).toEqual([]);
  });

  it('v3 人物卡：无粗体表格首格成卡（括号注记判定），边与场次并入设定', () => {
    const d = parseSettingsCompendium(V3_FIXTURE);
    expect(d.characters.map((c) => c.name)).toEqual(['老王', '阿珍']);
    expect(d.characters[0].baseSetting).toContain('×主角 5');
    expect(d.characters[1].baseSetting).toContain('（38，业主）');
  });

  it('v4 大纲树：粗体阶段行建卷、表格逐章行成卡、示范重复章跨树去重、子节新章挂子节题卷、线池/引擎表不成卡', () => {
    const d = parseSettingsCompendium(V3_FIXTURE);
    expect(d.outlineTree.volumes.map((v) => v.title)).toEqual(['阶段A 「结婚那年」', '阶段B 「新家第一年」', '穿插示范']);
    const volA = d.outlineTree.volumes[0];
    expect(volA.body).toBe('2003');
    expect(volA.stages[0].cards.map((c) => c.chapterFrom)).toEqual([1, 2]);
    expect(volA.stages[0].cards[0]).toMatchObject({ title: '第一夜', chapterFrom: 1, chapterTo: 1, body: 'H（开场钩子）' });
    expect(d.outlineTree.volumes[1].stages[0].cards.map((c) => c.chapterFrom)).toEqual([3, 4]);
    // 6.4 示范表：1/2/3 重复去重，新章 5 挂「穿插示范」子节题卷
    const demo = d.outlineTree.volumes[2];
    expect(demo.stages[0].cards.map((c) => c.chapterFrom)).toEqual([5]);
    const allCards = d.outlineTree.volumes.flatMap((v) => v.stages.flatMap((s) => s.cards));
    expect(allCards).toHaveLength(5);
  });

  it('v3 outline：阶段单元行+矩阵节精炼追加', () => {
    const d = parseSettingsCompendium(V3_FIXTURE);
    expect(d.outline).toContain('阶段A 「结婚那年」');
    expect(d.outline).toContain('主角×老王');
    expect(d.outline).toContain('主角×阿珍');
    expect(d.outline).not.toContain('|');
  });

  it('v3 伏笔：无编号 ／ 短语串回退逐条', () => {
    const d = parseSettingsCompendium(V3_FIXTURE);
    expect(d.foreshadowings.map((f) => f.description)).toEqual(['贼眼邻居', '未完成的拜访', '远行两人未归', '怀上的孩子生父是谁']);
    expect(d.foreshadowings.every((f) => f.plantedCh === 1)).toBe(true);
  });

  it('v3 outlineItems：表格章行逐章预填、goal=落地格、章号升序去重', () => {
    const d = parseSettingsCompendium(V3_FIXTURE);
    expect(d.outlineItems.map((i) => i.chapterNo)).toEqual([1, 2, 3, 4, 5]);
    expect(d.outlineItems[0].blueprint.goal).toBe('H（开场钩子）');
    expect(d.chapterTitles['1']).toBe('第一夜');
    expect(d.chapterTitles['3']).toBe('借宿');
  });

  it('v3 兼容：｜分隔章行仍成卡且线标签小体丢弃（旧穿插示范形态）', () => {
    const legacy = [
      '# 《旧排书》',
      '## 6. 总大纲',
      '### 卷一 《题》',
      '**阶段A 「开局」**（2003）',
      '25 车站接人(L4)｜26 饭桌试探(L4)｜27 同学会(L2)',
    ].join('\n');
    const d = parseSettingsCompendium(legacy);
    const cards = d.outlineTree.volumes.flatMap((v) => v.stages.flatMap((s) => s.cards));
    expect(cards.map((c) => c.title)).toEqual(['车站接人', '饭桌试探', '同学会']);
    expect(cards[0]).toMatchObject({ chapterFrom: 25, body: '' });
  });

  it('v4 元信息降噪：版本行/变更行/待确认节/决策记录剥除，正文保留', () => {
    const noisy = [
      '# 《降噪书》设定集（v4）',
      '> 定位一句话：降噪测试。',
      '> 版本：v4（2026-11-20，owner 修订四至七）',
      '## 3. 世界观',
      '虚构港市，年代约 2003。',
      '### 版本记录',
      'v3→v4 变更：新增女性线三章。',
      '### 3.1 待确认项',
      '- 女主线是否提前登场',
      '决策记录：原第 12 章并入第 9 章。',
      '## 6. 总大纲',
      '### 卷一 《题》（第 1–2 章）',
      '1. **第一夜**（开场）',
    ].join('\n');
    const d = parseSettingsCompendium(noisy);
    expect(d.description).toContain('定位一句话：降噪测试');
    expect(d.description).toContain('虚构港市');
    expect(d.description).toContain('第一夜');
    expect(d.description).not.toContain('版本：v4');
    expect(d.description).not.toContain('v3→v4');
    expect(d.description).not.toContain('新增女性线三章');
    expect(d.description).not.toContain('女主线是否提前登场');
    expect(d.description).not.toContain('决策记录');
    // '### 3.1 待确认项' 是低级噪声节标题：剥到下一个更高级标题（## 6）为止，节前正文存活
    expect(d.description.indexOf('虚构港市')).toBeGreaterThan(-1);
  });

  it('落地策略预览警示：全书 0 落地格 + description 含「分级制」→ warnings 含提示', () => {
    const fixture = `# 《示例》长篇 · 扩写设定集

## 3. 世界观

落地采用分级制，分级明确。`;
    const d = parseSettingsCompendium(fixture);
    expect(d.description).toContain('分级制');
    expect(d.warnings.some((w) => w.includes('全书大纲卡未解析出任何落地格'))).toBe(true);
  });

  it('落地策略预览警示：有落地格 → 无该警示（即便含「分级制」）', () => {
    const withCell = V3_FIXTURE.replace('虚构港市，年代约 2003。', '虚构港市，年代约 2003。落地采用分级制。');
    const d = parseSettingsCompendium(withCell);
    expect(d.description).toContain('分级制');
    expect(d.warnings.some((w) => w.includes('全书大纲卡未解析出任何落地格'))).toBe(false);
  });

  it('落地策略预览警示：无「分级制」→ 无该警示', () => {
    const d = parseSettingsCompendium(V3_FIXTURE);
    expect(d.warnings.some((w) => w.includes('全书大纲卡未解析出任何落地格'))).toBe(false);
  });

  it('consumedSections：中性夹具 → 命中节标题固定序钉值', () => {
    expect(parseSettingsCompendium(FIXTURE).consumedSections).toEqual([
      '5. 人物圣经',
      '6. 总大纲（卷—篇—章；章数无上限）',
      '9. 文风与语言规范',
      '1.5 悬置线清单（扩写的第一桶金）',
    ]);
  });

  it('consumedSections：无任何命中骨架（纯 H1+一段文字）→ []', () => {
    const d = parseSettingsCompendium('# 《示例之作》无命中骨架\n\n一段中性占位叙述，不含任何命中节标题。\n');
    expect(d.consumedSections).toEqual([]);
  });

  it('consumedSections：含悬置 H3 → 清单含该 H3 heading', () => {
    const raw = [
      '# 《示例之作》悬置样',
      '',
      '> 定位一句话：占位。',
      '',
      '## 5. 人物圣经',
      '',
      '主角占位。',
      '',
      '### 5.9 悬置线清单',
      '',
      '1. 占位伏笔（待回收）。',
      '',
    ].join('\n');
    expect(parseSettingsCompendium(raw).consumedSections).toContain('5.9 悬置线清单');
  });
});

describe('parseLandingCell（DEC-2026-1120-10 落地格解析）', () => {
  it('H 级带场景：分级+场景+人名辅助关键词', () => {
    expect(parseLandingCell('H（撞见场：房东×阿美）')).toEqual({
      grade: 'H', scene: '撞见场：房东×阿美', keywords: ['撞见场', '房东', '阿美'],
    });
  });
  it('L 级带场景', () => {
    expect(parseLandingCell('L（框架确立）')).toEqual({ grade: 'L', scene: '框架确立', keywords: ['框架确立'] });
  });
  it('分级无括号场景 → scene 空、keywords 空（fail-open 信号）', () => {
    expect(parseLandingCell('H')).toEqual({ grade: 'H', scene: '', keywords: [] });
    expect(parseLandingCell('L')).toEqual({ grade: 'L', scene: '', keywords: [] });
  });
  it('无括号但有场景文 → 场景取去首字符余文', () => {
    expect(parseLandingCell('H车站接人与还钥匙')).toEqual({ grade: 'H', scene: '车站接人与还钥匙', keywords: ['车站接人与还钥匙'] });
  });
  it('首字符非 H/L → null（无落地格，非失败）', () => {
    expect(parseLandingCell('开场悬念前置')).toBeNull();
    expect(parseLandingCell('')).toBeNull();
    expect(parseLandingCell('h（小写不认）')).toBeNull();
  });
  it('单词级（<2 字）关键词拒绝：全单字 → keywords 空', () => {
    expect(parseLandingCell('H（吻）')).toEqual({ grade: 'H', scene: '吻', keywords: [] });
  });
  it('重复 token 全等去重、线标签类非 CJK 短 token 拒绝', () => {
    expect(parseLandingCell('H（车站接人：房东×阿美×房东；L4）')).toEqual({
      grade: 'H', scene: '车站接人：房东×阿美×房东；L4', keywords: ['车站接人', '房东', '阿美'],
    });
  });
});

describe('纯文本降级分节', () => {
  const FS_PLAIN = `《伏笔示例》设定集

【伏笔】
1. 厨房对面的眼睛；2. 表叔拜访未完成
3. 远行的两人未归
`;

  it('Task-01 伏笔-only：行式标题合成节 → 三条伏笔+书名+consumedSections', () => {
    const d = parseSettingsCompendium(FS_PLAIN);
    expect(d.foreshadowings.map((f) => f.description)).toEqual([
      '厨房对面的眼睛',
      '表叔拜访未完成',
      '远行的两人未归',
    ]);
    expect(d.title).toBe('伏笔示例');
    expect(d.consumedSections).toEqual(['伏笔']);
    expect(d.warnings.some((w) => w.includes('未识别'))).toBe(false);
  });

  it('Task-01 同桶合并：两个【伏笔】节并一节 → 四条伏笔、consumedSections 不重复', () => {
    const d = parseSettingsCompendium(`${FS_PLAIN}\n【伏笔】\n4. 旧钥匙\n`);
    expect(d.foreshadowings.map((f) => f.description)).toEqual([
      '厨房对面的眼睛',
      '表叔拜访未完成',
      '远行的两人未归',
      '旧钥匙',
    ]);
    expect(d.consumedSections).toEqual(['伏笔']);
  });

  it('Task-01 节标题护栏：散文行/章行不成节，inline 长尾成节', () => {
    const prose = parseSettingsCompendium('人物是恒定太阳，每卷转进来一颗新行星。');
    expect(prose.consumedSections).toEqual([]);
    expect(prose.warnings.some((w) => w.includes('未识别'))).toBe(true);

    const chapter = parseSettingsCompendium('第一章 暗流');
    expect(chapter.consumedSections).toEqual([]);
    expect(chapter.warnings.some((w) => w.includes('未识别'))).toBe(true);

    const inline = parseSettingsCompendium('人物：主要角色包括老王与阿美，二者为邻里关系。');
    expect(inline.consumedSections).toEqual(['人物']);
    expect(inline.warnings.some((w) => w.includes('未识别'))).toBe(false);
  });

  const CHAR_PLAIN = `《人物示例》设定集

【人物】
阿美：连锁公司业务员。
性格黏人爽利、记账精。弧光：藏→半摊→共谋。
老王：中介。
阿珍：业主。
阿芳
隔壁宝妈，热心。
`;

  it('Task-02 人物-only：冒号行+裸名行+续行 → 四卡，尾文不成卡', () => {
    const d = parseSettingsCompendium(CHAR_PLAIN);
    expect(d.characters.map((c) => c.name)).toEqual(['阿美', '老王', '阿珍', '阿芳']);
    expect(d.characters.some((c) => c.name === '弧光')).toBe(false);
    expect(d.characters[0].baseSetting).toContain('连锁公司业务员');
    expect(d.characters[0].baseSetting).toContain('弧光：藏→半摊→共谋。');
    expect(d.characters[3].baseSetting).toContain('隔壁宝妈');
  });

  it('Task-02 人物护栏：无冒号短尾不成卡；重名去重 warning', () => {
    const noColon = parseSettingsCompendium('人物：阿美、老王与阿珍三人。');
    expect(noColon.characters).toEqual([]);

    const dup = parseSettingsCompendium('【人物】\n阿美：甲。\n阿美：乙。');
    expect(dup.characters.map((c) => c.name)).toEqual(['阿美']);
    expect(dup.warnings.some((w) => w.includes('重名'))).toBe(true);
  });

  it('Task-02 人物护栏：标签前缀与带标点短行不成卡（异议③）', () => {
    const d = parseSettingsCompendium('【人物】\n性格泼辣。\n背景介绍：略。\n老王：中介。');
    expect(d.characters.map((c) => c.name)).toEqual(['老王']);
  });

  it('Task-02 同桶合并：两个【人物】节跨节重名仅一条 warning', () => {
    const d = parseSettingsCompendium(
      '《合并示例》设定集\n\n【人物】\n阿美：甲。\n\n【人物】\n阿美：乙。\n老王：丙。\n',
    );
    expect(d.characters.map((c) => c.name)).toEqual(['阿美', '老王']);
    expect(d.warnings.filter((w) => w.includes('重名'))).toHaveLength(1);
  });

  const OL_PLAIN = `【大纲】
第一卷 崛起（第1-3章）
1. 初入校园：开场钩子
2. 暗流
第二卷 转折（第4-6章）
1. 摊牌（近破裂一次）
`;

  it('Task-03 大纲-only：卷行+编号行 → 两卷三卡，章号按卷区间偏移', () => {
    const d = parseSettingsCompendium(OL_PLAIN);
    const vols = d.outlineTree.volumes;
    expect(vols).toHaveLength(2);
    expect(vols.map((v) => v.title)).toEqual(['第1卷 崛起', '第2卷 转折']);
    expect(vols[0].body).toBe('第1-3章');
    expect(vols.map((v) => v.stages.flatMap((s) => s.cards).map((c) => c.chapterFrom))).toEqual([[1, 2], [4]]);
    expect(d.outlineItems.map((i) => i.chapterNo)).toEqual([1, 2, 4]);
    expect(d.outline).toContain('第1卷 崛起');
    expect(vols.every((v) => v.stages.length >= 1)).toBe(true);
  });

  it('Task-03 卷行护栏：散文行不建卷，「第三部分」倒装归一（异议①）', () => {
    const prose = parseSettingsCompendium('【大纲】\n一部讲述成长的小说。\n部分角色设定');
    expect(prose.outlineTree.volumes).toHaveLength(0);
    expect(prose.outlineTree.volumes.flatMap((v) => v.stages.flatMap((s) => s.cards))).toEqual([]);

    const part = parseSettingsCompendium('【大纲】\n第三部分 高潮');
    expect(part.outlineTree.volumes.map((v) => v.title)).toEqual(['第3部分 高潮']);
  });

  it('Task-03 中文数字章行：二十三/一百零五/两 经公开面钉值', () => {
    const d = parseSettingsCompendium(
      '【大纲】\n第一卷 引子\n第二十三章 桥段（伏笔回收）\n第一百零五章 终局\n第两章 补叙\n第abc章 不算数',
    );
    const cards = d.outlineTree.volumes.flatMap((v) => v.stages.flatMap((s) => s.cards));
    expect(cards.map((c) => c.chapterFrom)).toEqual([23, 105, 2, null]);
  });

  it('Task-03 阶段行：区间节名成阶段，段内编号成卡', () => {
    const d = parseSettingsCompendium('【大纲】\n13-15 年会篇：13 备装（采购线启动）；14 圆桌（两线交汇）');
    const vols = d.outlineTree.volumes;
    expect(vols).toHaveLength(1);
    expect(vols[0].stages.map((s) => s.title)).toEqual(['年会篇']);
    expect(vols[0].stages[0].cards.map((c) => c.chapterFrom)).toEqual([13, 14]);
  });

  it('Task-03 无区间卷：编号行取字面章号', () => {
    const d = parseSettingsCompendium('【大纲】\n第二卷 转折\n5. 摊牌');
    const cards = d.outlineTree.volumes.flatMap((v) => v.stages.flatMap((s) => s.cards));
    expect(cards.map((c) => c.chapterFrom)).toEqual([5]);
  });

  it('Task-03 偏移哨：越界回退字面+全卷一条 warning；连续编号仍正确', () => {
    const off = parseSettingsCompendium('【大纲】\n第二卷 转折（第4-6章）\n1. 甲\n4. 乙');
    const offCards = off.outlineTree.volumes.flatMap((v) => v.stages.flatMap((s) => s.cards));
    expect(offCards.map((c) => c.chapterFrom)).toEqual([4]);
    expect(off.warnings.filter((w) => w.includes('卷内编号与卷章区间不一致'))).toHaveLength(1);

    const continuous = parseSettingsCompendium('【大纲】\n第二卷 转折（第4-6章）\n4. 甲\n5. 乙\n6. 丙');
    const cards = continuous.outlineTree.volumes.flatMap((v) => v.stages.flatMap((s) => s.cards));
    expect(cards.map((c) => c.chapterFrom)).toEqual([4, 5, 6]);
  });

  const PLAIN_FIXTURE = `《长夜集》设定集

世界观：北方港城临海，年代约二〇〇三，通讯以市话与简讯为主；群像叙事不审判，只记账。

【人物】
阿美：连锁公司业务员。
性格黏人爽利、记账精。弧光：藏→半摊→共谋。
老王：中介。
阿珍：业主。
阿芳
隔壁宝妈，热心。

【剧情大纲】
第一卷 崛起（第1-2章）
1. 初入校园：开场钩子
2. 暗流
第二卷 转折（第4-5章）
1. 摊牌（近破裂一次）

【伏笔】
1. 厨房对面的眼睛；2. 表叔拜访未完成
3. 远行的两人未归

【文风】
两种叙述声：主角腔与旁观腔；暖世界原则：无人因欲望家破人亡。
`;

  it('Task-04 集成夹具：S1–S6 全要素一次解析', () => {
    const d = parseSettingsCompendium(PLAIN_FIXTURE);
    expect(d.title).toBe('长夜集');
    expect(d.characters.map((c) => c.name)).toEqual(['阿美', '老王', '阿珍', '阿芳']);
    const vols = d.outlineTree.volumes;
    expect(vols.map((v) => v.title)).toEqual(['第1卷 崛起', '第2卷 转折']);
    expect(vols.flatMap((v) => v.stages.flatMap((s) => s.cards)).map((c) => c.chapterFrom)).toEqual([1, 2, 4]);
    expect(d.foreshadowings).toHaveLength(3);
    expect(d.styleSection).toContain('两种叙述声');
    expect(d.consumedSections).toEqual(['人物', '大纲', '文风', '伏笔']);
    expect(d.warnings).toEqual([]);
  });

  it('Task-04 CRLF 免疫 + 融合门不受合成影响', () => {
    const crlf = parseSettingsCompendium(PLAIN_FIXTURE.replace(/\n/g, '\r\n'));
    expect(crlf).toEqual(parseSettingsCompendium(PLAIN_FIXTURE));
    expect(splitCompendiumSections(PLAIN_FIXTURE)).toEqual([]);
  });
});
