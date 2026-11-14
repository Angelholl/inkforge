import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { countChars } from '@inkforge/shared';
import { migrate } from '../../src/db/migrate';
import { openDb, type Database } from '../../src/db/open';
import * as booksRepo from '../../src/db/repositories/books';
import * as chaptersRepo from '../../src/db/repositories/chapters';
import * as continuityRepo from '../../src/db/repositories/continuity';
import * as ftsRepo from '../../src/db/repositories/fts';
import type { ChapterBlueprint } from '@inkforge/shared';

let db: Database;
let dir: string;
let bookId: string;

const BP: ChapterBlueprint = { goal: '推进主线', beats: ['进书房', '得密信'], mustHaveBeats: [], bannedTopics: [] };

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkforge-repo-'));
  db = openDb(path.join(dir, 't.db'));
  migrate(db);
  bookId = booksRepo.createBook(db, {
    title: '试炼之路',
    description: '测试用书',
    characters: [{ name: '张三', baseSetting: '{"位置":"书房"}' }],
  }).id;
});

afterAll(() => {
  try {
    db.close();
  } catch {
    /* ignore */
  }
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* Windows 锁瞬态 */
  }
});

describe('books + chapters 仓储（append-only）', () => {
  it('createBook → getBook 字段往返', () => {
    const b = booksRepo.getBook(db, bookId)!;
    expect(b.title).toBe('试炼之路');
    expect(b.description).toBe('测试用书');
    expect(b.styleProfileId).toBeNull();
    const chars = db.prepare('SELECT name, base_setting FROM characters WHERE book_id = ?').all(bookId) as Array<{ name: string; base_setting: string }>;
    expect(chars).toEqual([{ name: '张三', base_setting: '{"位置":"书房"}' }]);
  });

  it('upsertBlueprint 两次以最后一次为准', () => {
    const bp2: ChapterBlueprint = { goal: '改后目标', beats: [], mustHaveBeats: [], bannedTopics: [] };
    chaptersRepo.upsertBlueprint(db, { bookId, chapterNo: 1, title: '第一章', blueprint: BP, targetChars: 500 });
    const c1 = chaptersRepo.upsertBlueprint(db, { bookId, chapterNo: 1, title: '第一章改', blueprint: bp2, targetChars: 600 });
    expect(c1.title).toBe('第一章改');
    expect(c1.blueprint).toEqual(bp2);
    expect(c1.targetChars).toBe(600);
  });

  it('appendChapterVersion 字数与 append-only 静态断言', () => {
    const ch = chaptersRepo.getChapter(db, bookId, 1)!;
    const v = chaptersRepo.appendChapterVersion(db, { chapterId: ch.id, kind: 'draft', content: '他推开门。\n雨停了。' });
    expect(v.wordCount).toBe(countChars('他推开门。\n雨停了。'));
    expect(v.wordCount).toBe(9);
    // append-only 结构性保证：仓储不得暴露就地覆盖正文的键
    const keys = Object.keys(chaptersRepo);
    expect(keys.filter((k) => /update.*(Content|Version)/i.test(k))).toEqual([]);
  });

  it('current 指针与版本列表 DESC', () => {
    // 独立章号，避免与其他用例的版本互相污染
    chaptersRepo.upsertBlueprint(db, { bookId, chapterNo: 2, title: '第二章', blueprint: BP });
    const ch = chaptersRepo.getChapter(db, bookId, 2)!;
    expect(chaptersRepo.getCurrentVersion(db, ch.id)).toBeUndefined();
    const v1 = chaptersRepo.appendChapterVersion(db, { chapterId: ch.id, kind: 'draft', content: '第一版' });
    const v2 = chaptersRepo.appendChapterVersion(db, { chapterId: ch.id, kind: 'revised', content: '第二版', parentVersionId: v1.id });
    chaptersRepo.setCurrentVersion(db, ch.id, v2.id);
    const cur = chaptersRepo.getCurrentVersion(db, ch.id)!;
    expect(cur.id).toBe(v2.id);
    expect(cur.parentVersionId).toBe(v1.id);
    const list = chaptersRepo.listVersions(db, ch.id);
    expect(list.map((x) => x.id)).toEqual([v2.id, v1.id]);
    expect(chaptersRepo.getVersion(db, v1.id)!.content).toBe('第一版');
  });
});

describe('continuity 仓储', () => {
  it('summary 同章覆盖与 recent 取窗', () => {
    for (let i = 1; i <= 5; i++) {
      continuityRepo.upsertChapterSummary(db, { bookId, chapterNo: i, summary: `摘要${i}`, beats: [`b${i}`], openThreads: [] });
    }
    continuityRepo.upsertChapterSummary(db, { bookId, chapterNo: 5, summary: '摘要5改', beats: [], openThreads: [] });
    const recent = continuityRepo.getRecentSummaries(db, bookId, 5);
    expect(recent.map((s) => s.chapterNo)).toEqual([4, 3, 2]);
    const recent2 = continuityRepo.getRecentSummaries(db, bookId, 6, 3);
    expect(recent2.map((s) => s.chapterNo)).toEqual([5, 4, 3]);
    expect(recent2[0].summary).toBe('摘要5改');
  });

  it('character_state 同 (characterId, chapterNo) 覆盖', () => {
    const charId = (db.prepare('SELECT id FROM characters WHERE book_id = ?').get(bookId) as { id: string }).id;
    continuityRepo.upsertCharacterState(db, { characterId: charId, chapterNo: 1, state: { 位置: '书房' } });
    continuityRepo.upsertCharacterState(db, { characterId: charId, chapterNo: 1, state: { 位置: '庭院' } });
    const row = db.prepare('SELECT state_json FROM character_states WHERE character_id = ? AND chapter_no = 1').get(charId) as { state_json: string };
    expect(JSON.parse(row.state_json)).toEqual({ 位置: '庭院' });
    expect((db.prepare('SELECT COUNT(*) AS n FROM character_states WHERE character_id = ?').get(charId) as { n: number }).n).toBe(1);
  });

  it('snapshot：resolved 伏笔不在 open 列表、角色只取最新章状态', () => {
    const charId = (db.prepare('SELECT id FROM characters WHERE book_id = ?').get(bookId) as { id: string }).id;
    continuityRepo.upsertCharacterState(db, { characterId: charId, chapterNo: 2, state: { 位置: '城南' } });
    continuityRepo.upsertCharacterState(db, { characterId: charId, chapterNo: 3, state: { 位置: '城北', 受伤: true } });
    const fid = continuityRepo.upsertForeshadowing(db, { bookId, description: '密信落款人', plantedCh: 2 });
    continuityRepo.resolveForeshadowing(db, fid, 4, 'resolved');
    continuityRepo.upsertForeshadowing(db, { bookId, description: '师父下落', plantedCh: 3 });
    const snap = continuityRepo.getContinuitySnapshot(db, bookId, 6);
    expect(snap.characters).toEqual([{ name: '张三', state: { 位置: '城北', 受伤: true } }]);
    expect(snap.openForeshadowings.map((f) => f.description)).toEqual(['师父下落']);
    expect(snap.summaries.length).toBeGreaterThan(0);
  });
});

describe('fts 仓储', () => {
  it('syncFts 幂等、≥3 字命中、<3 字不查', () => {
    // 计划钉值修正：trigram 分词物理下限 3 字，2 字查询（原计划'雨停'命中）不可能成立——实测探针证实，改为 3 字命中
    chaptersRepo.upsertBlueprint(db, { bookId, chapterNo: 3, title: '第三章', blueprint: BP });
    const ch = chaptersRepo.getChapter(db, bookId, 3)!;
    const content = '夜色深沉，他推开门。雨停了，庭院安静。';
    ftsRepo.syncFts(db, ch.id, content);
    ftsRepo.syncFts(db, ch.id, content);
    const rows = db.prepare('SELECT COUNT(*) AS n FROM chapter_fts WHERE chapter_id = ?').get(ch.id) as { n: number };
    expect(rows.n).toBe(1);
    const hits = ftsRepo.searchChapters(db, bookId, '雨停了');
    expect(hits.length).toBe(1);
    expect(hits[0].chapterNo).toBe(3);
    expect(hits[0].chapterId).toBe(ch.id);
    expect(ftsRepo.searchChapters(db, bookId, '雨停')).toEqual([]);
    expect(ftsRepo.searchChapters(db, bookId, '雨')).toEqual([]);
  });
});

describe('人物卡仓储 + 书籍 meta', () => {
  it('createCharacter/updateCharacter/deleteCharacter 往返，重名拒绝，删除级联清理 character_states', () => {
    const bid = booksRepo.createBook(db, { title: '卡测之书' }).id;
    const c = booksRepo.createCharacter(db, bid, { name: '李四', baseSetting: '{"身份":"反派"}' });
    expect(c.name).toBe('李四');
    expect(booksRepo.getCharacter(db, bid, c.id)?.baseSetting).toBe('{"身份":"反派"}');
    expect(() => booksRepo.createCharacter(db, bid, { name: '李四' })).toThrow(/UNIQUE/);
    const u = booksRepo.updateCharacter(db, bid, c.id, { baseSetting: '{"身份":"盟友"}' });
    expect(u?.baseSetting).toBe('{"身份":"盟友"}');
    continuityRepo.upsertCharacterState(db, { characterId: c.id, chapterNo: 1, state: { 位置: '城北' } });
    expect(booksRepo.deleteCharacter(db, bid, c.id)).toBe(true);
    expect(booksRepo.getCharacter(db, bid, c.id)).toBeUndefined();
    expect(db.prepare('SELECT COUNT(*) AS n FROM character_states WHERE character_id = ?').get(c.id)).toEqual({ n: 0 });
    expect(booksRepo.deleteCharacter(db, bid, 'nonexistent')).toBe(false);
    // 删除后重名约束解除
    expect(booksRepo.createCharacter(db, bid, { name: '李四' }).name).toBe('李四');
  });

  it('updateBookMeta 持久化 outline 与 description；createBook 收 outline 往返', () => {
    const b = booksRepo.createBook(db, { title: '大纲之书', outline: '第一卷：崛起' });
    expect(booksRepo.getBook(db, b.id)?.outline).toBe('第一卷：崛起');
    const u = booksRepo.updateBookMeta(db, b.id, { description: '新世界观', outline: '第二卷：夺玺' });
    expect(u?.description).toBe('新世界观');
    expect(u?.outline).toBe('第二卷：夺玺');
    expect(booksRepo.updateBookMeta(db, 'missing', { title: 'x' })).toBeUndefined();
  });
});
