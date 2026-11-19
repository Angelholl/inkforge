import { describe, expect, it } from 'vitest';
import { parseSettingsCompendium } from '../src/settings-import';

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

  it('超长 description/outline → 预算 warning（拍板①扩槽阈值 16000/8000）', () => {
    const longWorld = `# 《长文》设定集\n\n> 定位一句话。\n\n## 3. 世界观\n\n${'长'.repeat(17000)}\n\n## 6. 总大纲\n\n### 卷一 《题》（第 1–2 章）——${'纲'.repeat(9000)}\n`;
    const w = parseSettingsCompendium(longWorld);
    expect(w.warnings.some((x) => x.includes('16000'))).toBe(true);
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
});
