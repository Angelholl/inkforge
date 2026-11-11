import type { ChapterBlueprint } from '@inkforge/shared';

export const BP_EMPTY: ChapterBlueprint = { goal: '推进', beats: [], mustHaveBeats: [], bannedTopics: [] };

/** 120 字、无任何命中。 */
export const HAPPY_DRAFT =
  '山门在晨雾里显出轮廓，弟子们列队于石阶之上。钟声三响，长老执礼，宣布今岁试炼开始。' +
  '少年随队入林，沿途记下每一条岔道。溪水漫过脚背，寒意刺骨。他在一块青石旁驻足，' +
  '辨认前人留下的刻痕，然后取纸笔拓印。暮色四合时，他携拓片下山，交予执事登记。' +
  '执事审视良久，颔首放行。';

export const SHORT_DRAFT = '他走了。';

export const CLICHE_DRAFT = '战斗结束，这一刻，他明白了真正的强大。';

/** 两段共享 >35% 8-gram：draft 为 prev 的后半复制+少量改动。 */
export const REPLAY_PREV =
  '夜风穿过竹林，带来远处的钟声。他在灯下翻开旧卷，逐字校对批注，直至更深露重。窗外的竹影摇曳，烛火忽明忽暗，他终于合卷，吹灭了灯。';
export const REPLAY_DRAFT =
  '他翻开旧卷逐字校对批注，直至更深露重。窗外的竹影摇曳，烛火忽明忽暗。次日清晨，他背起行囊下山。';

/** ≥15 连续字与参考文本重合。 */
export const PLAGIARISM_REF = '他在九岁那年随师父登临绝顶，看云海翻涌如潮，从此立志剑道。';
export const PLAGIARISM_DRAFT = '多年以后他仍记得，他在九岁那年随师父登临绝顶，看云海翻涌如潮的那个清晨。';

export const BEAT_BP: ChapterBlueprint = {
  goal: '取得信物',
  beats: ['潜入阁楼'],
  mustHaveBeats: [{ text: '取得玉佩', keywords: ['玉佩'] }],
  bannedTopics: [],
};
export const BEAT_MISS_DRAFT = '他在阁楼里翻找整夜，天明时两手空空地离开。';

export const DECEASED_BP = BP_EMPTY;
export const DECEASED_APPEAR_DRAFT = '长谈之后，李慕白送他出门，临别赠言半句。';

export const SENTIMENT_DRAFT = '清点行装，把拓片夹进书册，他连夜返回山门。';
