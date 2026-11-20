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

export const DECEASED_APPEAR_DRAFT = '长谈之后，李慕白送他出门，临别赠言半句。';

/** 章尾 200 字复演：PREV 为前文（末句「步伐沉稳，眼神冷峻地走远。」），DRAFT 末 200 字复制 PREV 末段。 */
export const TAIL_REPLAY_PREV =
  '山道尽头的石台被岁月磨得光滑。他站在台上，回望来路，云雾在脚下翻涌聚散。这一夜的守御远比想象中凶险，傀儡阵的间隙一次比一次狭窄，他几次险些被绞入其中，全凭一线直觉避开。石台四周的火把尽数熄灭，唯余月光落在他染血的衣襟上。伤处隐隐作痛，他却无暇包扎，只将断刃插回鞘中，深吸一口气，整了整衣冠，步伐沉稳，眼神冷峻地走远。';
export const TAIL_REPLAY_DRAFT =
  '清晨的集市人声鼎沸，他买了一笼炊饼，又去驿馆打探北境的消息，问遍了几个南来北往的行商。' +
  TAIL_REPLAY_PREV.slice(TAIL_REPLAY_PREV.length - 200);

/** 004 第4层实证复文句（来源：data/exports/挂机-试炼之路-1112基线/004-第4层.md）。 */
const ECHO_SENTENCE =
  '第四层的试炼正在展开，而他已经带着第三层收束后的认知进入了这个新的领域。这里的混乱并非无序，而是另一种形式的秩序，需要更深层的理解才能破解。' +
  '林澈深吸一口气，调整状态，准备面对接下来可能出现的更直接的对抗或更隐蔽的陷阱。';

/** 去空白后按 n 字截断/补足（夹具确定性构造用）。 */
function clampClean(text: string, n: number): string {
  const clean = text.replace(/\s/g, '');
  if (clean.length >= n) return clean.slice(0, n);
  const filler = '风从窗缝里钻进来，吹得案上纸页轻轻翻动，他伸手压住，又继续往下写。';
  let out = clean;
  while (out.length < n) out += filler;
  return out.slice(0, n);
}

/** echo_20gram 坏样本前文：独立山道叙事（300+ 字）+ 实证复文句，与 draft 首段/章尾无 20-gram 共享。 */
export const ECHO_BAD_PREV =
  '暮色压在群峰之上，山道被昨夜的雨水浸得发亮。他牵着驮马走在队伍最前，腰间的铜铃随着步子轻响。' +
  '半山腰的驿站早已废弃，屋顶塌了一角，墙根生满青苔。随行的老向导说，再往前便进入旧矿脉的范围，那里风大，火把不容易点着。' +
  '众人于是停下，把松脂涂在布条上，又用油纸层层裹紧。补给清点完毕，干粮还够七日，饮水却只余两囊。' +
  '他让两名脚夫折返取水，自己带着余下的人继续上山。转过第三道弯时，雾气忽然浓了，前后只能看见三五步远，驮马的鼻息喷在冷空气里，凝成一小团白。' +
  '他摸了摸怀里的罗盘，指针在湿气中微微发颤，仍旧稳稳指向北面。队伍沿着废弃的铁轨缓慢前行，枕木早已腐烂，踩上去发出沉闷的声响。' +
  '有人低声唱起山歌，调子被风撕碎，断断续续地飘向谷底。' +
  ECHO_SENTENCE +
  '他当时只是把这些话记在心里，并没有停下来追问。后来队伍在破庙里歇脚，火光映着墙上的旧壁画，众人都沉默着，各自想着心事。';

const ECHO_BAD_HEAD_BASE =
  '天还没亮，他就把窗推开一条缝，让冷风灌进来。案上摊着昨夜的账册，墨迹尚未干透，边角压着一枚旧铜钱。' +
  '他逐行核对数目，把有疑问的地方圈出，再用小字写在旁边的空白处。院里的鸡叫了第二遍，隔壁传来磨刀的声音，一下一下，不紧不慢。' +
  '他起身添了半盏灯油，火苗窜高又落下，把影子投在墙上，忽长忽短。账册翻到最后一页，他停住笔，望着窗外出神。' +
  '远处河面上有船靠岸，船夫吆喝着卸货，木箱一只只码在石阶旁。伙计们抬着扁担来回奔走，脚步声混在潮气里，显得格外清楚。' +
  '他合上账册，取过外衣披上，打算去码头看看今早的行情。';

const ECHO_BAD_TAIL_BASE =
  '夜里他把油灯挪到桌角，摊开一张旧地图，指尖沿着河流慢慢移动。灯花爆了一下，他抬手剪去焦黑的灯芯，屋里重新亮起来。' +
  '窗外传来更夫的梆子声，三长两短，已是后半夜。他收好地图，把椅背上的披风盖到膝头，靠着墙闭目养神。' +
  '明天还要赶路，前面的山口据说积了雪，马车未必过得去，得另寻一条绕行的道。想到这里，他吹熄了灯，屋子里只剩下炭盆里一点暗红的光。' +
  '风雪敲着窗纸，细碎而绵密，像有人在门外一遍遍走过。他没有睁眼，只在心里把明日的行程又推演了一遍，才终于沉沉睡去。';

const ECHO_BAD_TAIL = clampClean(ECHO_BAD_TAIL_BASE, 240);
/** 首段定长使实证句起点落在去空白全文 ≈42.6% 处（004 形状）。 */
const ECHO_BAD_HEAD_LEN = Math.round((0.426 * (ECHO_SENTENCE.length + ECHO_BAD_TAIL.length)) / (1 - 0.426));

/** echo_20gram 坏样本：独立首段 + 实证复文句置于 ≈42.6% 位置 + 独立章尾。 */
export const ECHO_BAD_DRAFT = clampClean(ECHO_BAD_HEAD_BASE, ECHO_BAD_HEAD_LEN) + ECHO_SENTENCE + ECHO_BAD_TAIL;

/** echo_20gram 好样本前文：与 draft 仅共享 4-8 字短语（「把手靠在船舷上」「碎木」）。 */
export const ECHO_FREE_PREV =
  '清晨的渡口起了一层薄雾，艄公把缆绳绕在木桩上，等最后一名客人上船。他把手靠在船舷上，看水面上浮着的碎木与落叶，一直看到日头偏西才回舱。';

/** echo_20gram 好样本：prev 非空但零 20-gram 共享。 */
export const ECHO_FREE_DRAFT =
  '船到江心时雾散了，他也把手靠在船舷上，只是没有再数那些碎木。两岸的灯火次第亮起，他把外衣拢紧，听着桨声一下一下，觉得许多话其实不必说出口。';
