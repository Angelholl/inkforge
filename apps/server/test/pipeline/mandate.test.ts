import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { BeatRequirement, LandingMandate } from '@inkforge/shared';
import { MANDATE_TEXT_PREFIX, ensureMandateBeat, synthesizeMandateBeat } from '../../src/pipeline/mandate';
import { migrate } from '../../src/db/migrate';
import { openDb, type Database } from '../../src/db/open';
import { createBook, updateBookMeta } from '../../src/db/repositories/books';
import { getChapter, upsertBlueprint } from '../../src/db/repositories/chapters';

const cadence = (heavyEveryN: number): LandingMandate => ({ mode: 'cadence', heavyEveryN });

describe('synthesizeMandateBeat（DEC-2026-1122-01）', () => {
  it('MANDATE_TEXT_PREFIX 精确值', () => {
    expect(MANDATE_TEXT_PREFIX).toBe('〔书级落地策略〕');
  });

  it('N=2 → ch2/ch4 grade H、ch1/ch3 grade L；keywords 恒 []；source 恒 mandate；text 以前缀开头', () => {
    const m = cadence(2);
    for (const ch of [1, 3]) {
      const b = synthesizeMandateBeat(ch, m);
      expect(b.grade).toBe('L');
      expect(b.keywords).toEqual([]);
      expect(b.source).toBe('mandate');
      expect(b.text.startsWith(MANDATE_TEXT_PREFIX)).toBe(true);
    }
    for (const ch of [2, 4]) {
      const b = synthesizeMandateBeat(ch, m);
      expect(b.grade).toBe('H');
      expect(b.keywords).toEqual([]);
      expect(b.source).toBe('mandate');
      expect(b.text.startsWith(MANDATE_TEXT_PREFIX)).toBe(true);
    }
  });

  it('自定义 N=3 → ch3 H、ch1/ch2 L', () => {
    const m = cadence(3);
    expect(synthesizeMandateBeat(3, m).grade).toBe('H');
    expect(synthesizeMandateBeat(1, m).grade).toBe('L');
    expect(synthesizeMandateBeat(2, m).grade).toBe('L');
  });

  it('N=10**9 → ch1 L（超大模值外推）', () => {
    expect(synthesizeMandateBeat(1, cadence(10 ** 9)).grade).toBe('L');
  });

  it('两文案不含「连续」（critic 条件3）', () => {
    expect(synthesizeMandateBeat(2, cadence(2)).text).not.toContain('连续');
    expect(synthesizeMandateBeat(1, cadence(2)).text).not.toContain('连续');
  });
});

describe('ensureMandateBeat（DEC-2026-1122-01）', () => {
  let db: Database;
  let dir: string;

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkforge-mandate-'));
    db = openDb(path.join(dir, 'main.db'));
    migrate(db);
  });

  afterAll(() => {
    try {
      db.close();
    } catch {
      /* noop */
    }
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* noop */
    }
  });

  const rawJson = (bookId: string, ch: number): string =>
    (db.prepare('SELECT blueprint_json FROM chapters WHERE book_id=? AND chapter_no=?').get(bookId, ch) as { blueprint_json: string }).blueprint_json;

  const setMandate = (bookId: string, m: LandingMandate | string) => {
    if (typeof m === 'string') db.prepare('UPDATE books SET landing_mandate_json=? WHERE id=?').run(m, bookId);
    else updateBookMeta(db, bookId, { landingMandate: m });
  };

  const seed = (bookId: string, ch: number, mustHaveBeats: BeatRequirement[], targetChars = 3000) => {
    upsertBlueprint(db, { bookId, chapterNo: ch, title: `第${ch}章`, blueprint: { goal: 'g', beats: [], mustHaveBeats, bannedTopics: [] }, targetChars });
  };
  const beatsOf = (bookId: string, ch: number): BeatRequirement[] => getChapter(db, bookId, ch)!.blueprint!.mustHaveBeats;

  it('cadence 书 ch2 → 蓝图尾部恰一条 mandate 条目；重跑一次 → 仍 1（幂等）', () => {
    const id = createBook(db, { title: '幂等书' }).id;
    setMandate(id, cadence(2));
    seed(id, 2, []);
    ensureMandateBeat(db, id, 2);
    let beats = beatsOf(id, 2);
    expect(beats).toHaveLength(1);
    expect(beats[0].source).toBe('mandate');
    expect(beats[0].grade).toBe('H');
    expect(beats[0].text.startsWith(MANDATE_TEXT_PREFIX)).toBe(true);
    ensureMandateBeat(db, id, 2);
    beats = beatsOf(id, 2);
    expect(beats).toHaveLength(1);
  });

  it('已有卡 grade 条目（预填）→ 不追加 mandate 条目（有卡书零扰动）', () => {
    const id = createBook(db, { title: '卡优先书' }).id;
    setMandate(id, cadence(2));
    const card = { text: '密信到手', keywords: ['密信'], grade: 'H' as const, source: 'card' as const };
    seed(id, 2, [card]);
    ensureMandateBeat(db, id, 2);
    expect(beatsOf(id, 2)).toEqual([card]);
  });

  it('off 书残留 mandate 条目 → 剥离后无前缀条目；再跑一次零写库（蓝图 JSON 字节不变）', () => {
    const id = createBook(db, { title: 'off 残留书' }).id;
    seed(id, 2, [synthesizeMandateBeat(2, cadence(2))]);
    ensureMandateBeat(db, id, 2);
    expect(beatsOf(id, 2).some((b) => b.text.startsWith(MANDATE_TEXT_PREFIX))).toBe(false);
    const before = rawJson(id, 2);
    ensureMandateBeat(db, id, 2);
    expect(rawJson(id, 2)).toBe(before);
  });

  it('off→cadence→off→cadence 全序列 mandate 条目数恒 ≤1', () => {
    const id = createBook(db, { title: '切换书' }).id;
    const count = () =>
      beatsOf(id, 2).filter((b) => b.text.startsWith(MANDATE_TEXT_PREFIX)).length;
    seed(id, 2, []);
    setMandate(id, { mode: 'off' });
    ensureMandateBeat(db, id, 2);
    expect(count()).toBe(0);
    setMandate(id, cadence(3));
    ensureMandateBeat(db, id, 2);
    expect(count()).toBe(1);
    setMandate(id, { mode: 'off' });
    ensureMandateBeat(db, id, 2);
    expect(count()).toBe(0);
    setMandate(id, cadence(2));
    ensureMandateBeat(db, id, 2);
    expect(count()).toBe(1);
  });

  it('mandate json 空串 / 非法 JSON → 视同 off（剥离路径，不抛）', () => {
    for (const raw of ['', '{bad json']) {
      const id = createBook(db, { title: '坏 JSON 书' }).id;
      seed(id, 2, [synthesizeMandateBeat(2, cadence(2))]);
      setMandate(id, raw);
      expect(() => ensureMandateBeat(db, id, 2)).not.toThrow();
      expect(beatsOf(id, 2).some((b) => b.text.startsWith(MANDATE_TEXT_PREFIX))).toBe(false);
    }
  });

  it('chapter.targetChars 保持现值（预置 2500 → 跑完仍 2500）', () => {
    const id = createBook(db, { title: '字数书' }).id;
    setMandate(id, cadence(2));
    seed(id, 2, [], 2500);
    ensureMandateBeat(db, id, 2);
    expect(getChapter(db, id, 2)!.targetChars).toBe(2500);
  });
});
