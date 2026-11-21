import type { BeatRequirement, LandingMandate } from '@inkforge/shared';
import { parseLandingMandate } from '@inkforge/shared';
import type { Database } from '../db/open';
import { getBook } from '../db/repositories/books';
import { getChapter, upsertBlueprint } from '../db/repositories/chapters';

/** 书级落地策略合成节拍文本前缀（DEC-2026-1122-01，精确钉值）。 */
export const MANDATE_TEXT_PREFIX = '〔书级落地策略〕';

/** 确定性落地节拍：heavyEveryN 缺省 2；章号整除 N → H，否则 L。 */
export function synthesizeMandateBeat(chapterNo: number, mandate: LandingMandate): BeatRequirement {
  const heavyEveryN = mandate.heavyEveryN ?? 2;
  const grade: 'H' | 'L' = chapterNo % heavyEveryN === 0 ? 'H' : 'L';
  const text =
    grade === 'H'
      ? `${MANDATE_TEXT_PREFIX}本章须完成一次高强落地（H级）重场戏，落地分级词表须显性命中`
      : `${MANDATE_TEXT_PREFIX}本章须含一次轻量落地（L级）铺陈，落地分级词表须显性命中`;
  return { text, keywords: [], grade, source: 'mandate' };
}

/** 识别书级落地策略合成条目（前缀或 source 标志）。 */
const isMandateBeat = (m: BeatRequirement): boolean =>
  m.source === 'mandate' || m.text.startsWith(MANDATE_TEXT_PREFIX);

/**
 * queue 拾章后持久化注入：off/无 mandate/无书 → 仅剥离残留合成条目（无剥离则零写入）；
 * cadence → 剥离后，余下条目无任何 grade 时追加确定性节拍（卡源条目优先、零扰动）。
 * 显式回传 chapter.targetChars：upsertBlueprint 缺省 3000 会覆盖现值（chapters.ts 语义）。
 */
export function ensureMandateBeat(db: Database, bookId: string, chapterNo: number): void {
  const chapter = getChapter(db, bookId, chapterNo);
  if (!chapter || !chapter.blueprint) return;
  const book = getBook(db, bookId);
  const mandate = book ? parseLandingMandate(book.landingMandateJson) : null;
  const blueprint = chapter.blueprint;
  const original = blueprint.mustHaveBeats;
  const kept = original.filter((m) => !isMandateBeat(m));
  const stripped = kept.length !== original.length;
  const write = (mustHaveBeats: BeatRequirement[]) =>
    upsertBlueprint(db, {
      bookId,
      chapterNo,
      title: chapter.title,
      blueprint: { ...blueprint, mustHaveBeats },
      targetChars: chapter.targetChars,
    });

  if (mandate === null || mandate.mode !== 'cadence') {
    if (stripped) write(kept);
    return;
  }
  if (kept.some((m) => m.grade !== undefined)) {
    if (stripped) write(kept);
    return;
  }
  kept.push(synthesizeMandateBeat(chapterNo, mandate));
  write(kept);
}
