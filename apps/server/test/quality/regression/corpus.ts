import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { countChars, type ChapterBlueprint } from '@inkforge/shared';
import {
  BEAT_BP,
  BEAT_MISS_DRAFT,
  BP_EMPTY,
  CLICHE_DRAFT,
  DECEASED_APPEAR_DRAFT,
  ECHO_BAD_DRAFT,
  ECHO_BAD_PREV,
  ECHO_FREE_DRAFT,
  ECHO_FREE_PREV,
  HAPPY_DRAFT,
  PLAGIARISM_DRAFT,
  PLAGIARISM_REF,
  REPLAY_DRAFT,
  REPLAY_PREV,
  SHORT_DRAFT,
  TAIL_REPLAY_DRAFT,
  TAIL_REPLAY_PREV,
} from '../fixtures';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REAL_DIR = path.join(HERE, 'real');
/** L1 夹具对应的采章章号（T-C3 采集口径），供 quote⊆draft 校验。 */
export const CAPTURE_CHAPTERS = [5, 8, 12] as const;

export interface L0Sample {
  name: string;
  /** runL0Checks 输入（draft/targetChars/prevTexts/blueprint/continuity/referenceTexts）。 */
  input: {
    draft: string;
    targetChars: number;
    prevTexts: string[];
    blueprint: ChapterBlueprint;
    continuity: { characters: Array<{ name: string; state: object }> };
    referenceTexts?: string[];
  };
  /** bad 样本：期望失败并硬失败的检查名。 */
  expectFail?: string;
  /** 好样本可置 false 以关闭套话表（样本隔离用途）。 */
  cliches?: false;
}

/** band_edge 构造：确定性基句（无空白、无套话命中），按去空白口径裁到精确字数。 */
const BAND_EDGE_BASE = '他在灯下抄完最后一页书，把笔搁回砚边，吹熄了烛火。';
function fitChars(n: number): string {
  const reps = Math.ceil(n / BAND_EDGE_BASE.length);
  return BAND_EDGE_BASE.repeat(reps).slice(0, n);
}

/** soft_cliche_only：含建议级套话「宛如」，其余全净。 */
const SOFT_CLICHE_DRAFT =
  '湖面宛如一面旧镜，倒映着远山的轮廓。他沿着岸边慢慢走，数着水中的石头，直到暮色把小路吞没，才转身回房歇下。';

export const L0_BAD: L0Sample[] = [
  { name: 'length_short', input: { draft: SHORT_DRAFT, targetChars: 300, prevTexts: [], blueprint: BP_EMPTY, continuity: { characters: [] } }, expectFail: 'length' },
  { name: 'length_long', input: { draft: REPLAY_PREV, targetChars: 20, prevTexts: [], blueprint: BP_EMPTY, continuity: { characters: [] } }, expectFail: 'length' },
  { name: 'cliche_hard', input: { draft: CLICHE_DRAFT, targetChars: 100, prevTexts: [], blueprint: BP_EMPTY, continuity: { characters: [] } }, expectFail: 'cliche' },
  { name: 'replay', input: { draft: REPLAY_DRAFT, targetChars: 500, prevTexts: [REPLAY_PREV], blueprint: BP_EMPTY, continuity: { characters: [] } }, expectFail: 'replay_ngram' },
  { name: 'plagiarism', input: { draft: PLAGIARISM_DRAFT, targetChars: 500, prevTexts: [], blueprint: BP_EMPTY, continuity: { characters: [] }, referenceTexts: [PLAGIARISM_REF] }, expectFail: 'plagiarism_ngram' },
  { name: 'beat_missing', input: { draft: BEAT_MISS_DRAFT, targetChars: 100, prevTexts: [], blueprint: BEAT_BP, continuity: { characters: [] } }, expectFail: 'beat_coverage' },
  {
    name: 'continuity_ghost',
    input: { draft: DECEASED_APPEAR_DRAFT, targetChars: 100, prevTexts: [], blueprint: BP_EMPTY, continuity: { characters: [{ name: '李慕白', state: { deceased: true } }] } },
    expectFail: 'continuity_facts',
  },
  { name: 'tail_replay', input: { draft: TAIL_REPLAY_DRAFT, targetChars: 500, prevTexts: [TAIL_REPLAY_PREV], blueprint: BP_EMPTY, continuity: { characters: [] } }, expectFail: 'tail_replay' },
  {
    name: 'echo_20gram',
    input: { draft: ECHO_BAD_DRAFT, targetChars: countChars(ECHO_BAD_DRAFT), prevTexts: [ECHO_BAD_PREV], blueprint: BP_EMPTY, continuity: { characters: [] } },
    expectFail: 'echo_20gram',
  },
];

export const L0_GOOD: L0Sample[] = [
  { name: 'happy_120', input: { draft: HAPPY_DRAFT, targetChars: 120, prevTexts: [], blueprint: BP_EMPTY, continuity: { characters: [] } } },
  { name: 'soft_cliche_only', input: { draft: SOFT_CLICHE_DRAFT, targetChars: countChars(SOFT_CLICHE_DRAFT), prevTexts: [], blueprint: BP_EMPTY, continuity: { characters: [] } } },
  // band_edge：target=100，去空白 charCount=81，落在下边界 80 的 +1 字（±2 字容差内），|81-100|=19 ≤ band 20
  { name: 'band_edge', input: { draft: fitChars(81), targetChars: 100, prevTexts: [], blueprint: BP_EMPTY, continuity: { characters: [] } } },
  // no_prev_fresh：TAIL_REPLAY_DRAFT 无前文时 tail_replay 恒过；关闭套话表以隔离 tail_replay 单项（其尾段含实证套话句，属 T-D2 夹具本身属性）
  { name: 'no_prev_fresh', input: { draft: TAIL_REPLAY_DRAFT, targetChars: countChars(TAIL_REPLAY_DRAFT), prevTexts: [], blueprint: BP_EMPTY, continuity: { characters: [] } }, cliches: false },
  // echo_free：prev 非空、仅 4-8 字短语共享、零 20-gram 共享，各硬项全过
  { name: 'echo_free', input: { draft: ECHO_FREE_DRAFT, targetChars: countChars(ECHO_FREE_DRAFT), prevTexts: [ECHO_FREE_PREV], blueprint: BP_EMPTY, continuity: { characters: [] } } },
];

function readReal(name: string): string {
  return readFileSync(path.join(REAL_DIR, name), 'utf8');
}

/** L1 修后 raw（M4 判据语料）：解析干净 + quote 全部落在对应章 draft 内。 */
export const L1_GOOD_RAW: Array<{ chapterNo: number; raw: string }> = CAPTURE_CHAPTERS.map((chapterNo, i) => ({
  chapterNo,
  raw: readReal(`l1-good-00${i + 1}.txt`),
}));

/** L1 修前 raw（优雅降级证据语料）：解析不得抛异常。 */
export const L1_BAD_RAW: Array<{ chapterNo: number; raw: string }> = CAPTURE_CHAPTERS.map((chapterNo, i) => ({
  chapterNo,
  raw: readReal(`l1-bad-00${i + 1}.txt`),
}));
