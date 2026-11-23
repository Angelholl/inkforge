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
    // FTS5 MATCH 语法错误（含引号）→ 空结果而非抛错裸 500（audit 2026-11-23 F-2）
    expect(ftsRepo.searchChapters(db, bookId, '不存在的"引号')).toEqual([]);
  });
});

describe('人物卡仓储 + 书籍 meta', () => {
  it('createCharacter/updateCharacter/deleteCharacter 往返，重名拒绝，删除级联清理 character_states', () => {
    const bid = booksRepo.createBook(db, { title: '卡测之书' }).id;
    const c = booksRepo.createCharacter(db, bid, { name: '李四', baseSetting: '{"身份":"反派"}' });
    expect(c.name).toBe('李四');
    expect(c.offlineFromChapter).toBeNull(); // 新建即在场（0009）
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

  it('人物下线三态（0009）：数字=第N章起下线、null=恢复在场、undefined=保留；listActiveCharacters 边界=下线当章即不在场', () => {
    const bid = booksRepo.createBook(db, { title: '下线之书' }).id;
    const a = booksRepo.createCharacter(db, bid, { name: '甲' });
    const b = booksRepo.createCharacter(db, bid, { name: '乙' });
    // 下线：甲第 5 章起
    expect(booksRepo.updateCharacter(db, bid, a.id, { offlineFromChapter: 5 })?.offlineFromChapter).toBe(5);
    // undefined 保留现值
    expect(booksRepo.updateCharacter(db, bid, a.id, { baseSetting: '{"设定":"改"}' })?.offlineFromChapter).toBe(5);
    // 边界：写第 5 章（下线当章）→ 甲不在场；写第 4 章 → 甲在场。
    // 同毫秒插入 created_at 相同 → ORDER BY 顺序无契约；且 JS sort 按码点（'乙'<'甲'），断言用集合比顺序无关。
    expect(booksRepo.listActiveCharacters(db, bid, 5).map((c) => c.name)).toEqual(['乙']);
    expect(new Set(booksRepo.listActiveCharacters(db, bid, 4).map((c) => c.name))).toEqual(new Set(['甲', '乙']));
    expect(new Set(booksRepo.listCharacters(db, bid).map((c) => c.name))).toEqual(new Set(['甲', '乙']));
    // 恢复在场：null
    expect(booksRepo.updateCharacter(db, bid, a.id, { offlineFromChapter: null })?.offlineFromChapter).toBeNull();
    expect(new Set(booksRepo.listActiveCharacters(db, bid, 9).map((c) => c.name))).toEqual(new Set(['甲', '乙']));
    // 不存在的卡 → undefined
    expect(booksRepo.updateCharacter(db, bid, 'missing', { offlineFromChapter: 1 })).toBeUndefined();
    void b;
  });

  it('快照 offlined（0009）：下线章起出 offlined 行，恢复在场后消失；renderSnapshotText 渲染防复活行', () => {
    const bid = booksRepo.createBook(db, { title: '快照下线之书' }).id;
    const a = booksRepo.createCharacter(db, bid, { name: '王五', baseSetting: '{"身份":"配角"}' });
    booksRepo.updateCharacter(db, bid, a.id, { offlineFromChapter: 3 });
    const snapAt4 = continuityRepo.getContinuitySnapshot(db, bid, 4);
    expect(snapAt4.offlined).toEqual([{ name: '王五', fromChapter: 3 }]);
    // 下线章当章即标注
    expect(continuityRepo.getContinuitySnapshot(db, bid, 3).offlined).toEqual([{ name: '王五', fromChapter: 3 }]);
    // 下线前不标注
    expect(continuityRepo.getContinuitySnapshot(db, bid, 2).offlined).toEqual([]);
    const text = continuityRepo.renderSnapshotText(snapAt4);
    expect(text).toContain('[已下线] 王五（第3章起退场，不得再登场）');
    // 恢复在场 → offlined 清空
    booksRepo.updateCharacter(db, bid, a.id, { offlineFromChapter: null });
    expect(continuityRepo.getContinuitySnapshot(db, bid, 4).offlined).toEqual([]);
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

describe('风格绑定关联表（0010）', () => {
  it('setBookStyleBinding/getBookStyleBinding 往返：主辅行+dims 映射+绑定默认开 fewshot', () => {
    const bid = booksRepo.createBook(db, { title: '绑定之书' }).id;
    booksRepo.setBookFewshot(db, bid, false); // 先手动关，证明绑定强制置 1（DEC-2026-1122-03③）
    booksRepo.setBookStyleBinding(db, bid, { primaryProfileId: 'pA', auxProfileIds: ['pB', 'pC'], dimsSource: { 对话: 'pB' }, weights: {} }, '{"v":2}');
    const b = booksRepo.getBook(db, bid)!;
    expect(b.styleProfileId).toBe('pA');
    expect(b.styleSnapshotJson).toBe('{"v":2}');
    expect(b.styleFewshotOn).toBe(true); // 绑定/重绑置 1（DEC-2026-1122-03③，翻转自 B4 裁决④）
    expect(booksRepo.getBookStyleBinding(db, bid)).toEqual({
      primaryProfileId: 'pA',
      auxProfileIds: ['pB', 'pC'],
      dimsSource: { 对话: 'pB' },
      weights: {},
    });
    booksRepo.deleteBook(db, bid);
  });

  it('setBookStyleBinding weights 往返：60/40 全行同值落库读回；weights={} 读回空对象（legacy 标记）', () => {
    const bid = booksRepo.createBook(db, { title: '比例之书' }).id;
    booksRepo.setBookStyleBinding(db, bid, { primaryProfileId: 'pA', auxProfileIds: ['pB'], dimsSource: {}, weights: { pA: 60, pB: 40 } }, '{"v":2}');
    expect(booksRepo.getBookStyleBinding(db, bid)).toEqual({
      primaryProfileId: 'pA',
      auxProfileIds: ['pB'],
      dimsSource: {},
      weights: { pA: 60, pB: 40 },
    });
    const rows = db.prepare('SELECT is_primary, weights_json FROM book_style_profiles WHERE book_id = ? ORDER BY is_primary DESC').all(bid) as Array<{
      is_primary: number;
      weights_json: string;
    }>;
    expect(rows.map((r) => r.weights_json)).toEqual(['{"pA":60,"pB":40}', '{"pA":60,"pB":40}']); // 全行同值（先例=dims_json）
    // 重绑空 weights → 读回空对象（legacy 标记）
    booksRepo.setBookStyleBinding(db, bid, { primaryProfileId: 'pA', auxProfileIds: [], dimsSource: {}, weights: {} }, '{"v":2}');
    expect(booksRepo.getBookStyleBinding(db, bid)?.weights).toEqual({});
    booksRepo.deleteBook(db, bid);
  });

  it('setBookStyleBinding(null) 解绑清三处；deleteBook 清关联表', () => {
    const bid = booksRepo.createBook(db, { title: '解绑之书' }).id;
    booksRepo.setBookStyleBinding(db, bid, { primaryProfileId: 'pA', auxProfileIds: ['pB'], dimsSource: {}, weights: {} }, '{"v":1}');
    booksRepo.setBookStyleBinding(db, bid, null, null);
    expect(booksRepo.getBookStyleBinding(db, bid)).toBeNull();
    const b = booksRepo.getBook(db, bid)!;
    expect(b.styleProfileId).toBeNull();
    expect(b.styleSnapshotJson).toBeNull();
    expect(b.styleFewshotOn).toBe(false);
    expect((db.prepare('SELECT COUNT(*) AS n FROM book_style_profiles WHERE book_id = ?').get(bid) as { n: number }).n).toBe(0);
    // 重绑后删书，关联表清理
    booksRepo.setBookStyleBinding(db, bid, { primaryProfileId: 'pA', auxProfileIds: [], dimsSource: {}, weights: {} }, null);
    expect((db.prepare('SELECT COUNT(*) AS n FROM book_style_profiles WHERE book_id = ?').get(bid) as { n: number }).n).toBe(1);
    expect(booksRepo.deleteBook(db, bid)).toBe(true);
    expect((db.prepare('SELECT COUNT(*) AS n FROM book_style_profiles').get() as { n: number }).n).toBe(0);
  });
});

describe('updateBookMeta landingMandate 三态往返（DEC-2026-1122-01）', () => {
  it('undefined 不动 / null 清空 / 对象归一（heavyEveryN 缺省 2；off 只存 {"mode":"off"}）', () => {
    const bid = booksRepo.createBook(db, { title: '落地策略之书' }).id;
    // 起点：null（新书默认 off）
    expect(booksRepo.getBook(db, bid)!.landingMandateJson).toBeNull();
    // undefined=不动
    booksRepo.updateBookMeta(db, bid, { title: '改名一' });
    expect(booksRepo.getBook(db, bid)!.landingMandateJson).toBeNull();
    // 对象=cadence，heavyEveryN 缺省归一 2
    booksRepo.updateBookMeta(db, bid, { landingMandate: { mode: 'cadence' } });
    expect(booksRepo.getBook(db, bid)!.landingMandateJson).toBe('{"mode":"cadence","heavyEveryN":2}');
    // 显式 N 透传
    booksRepo.updateBookMeta(db, bid, { landingMandate: { mode: 'cadence', heavyEveryN: 5 } });
    expect(booksRepo.getBook(db, bid)!.landingMandateJson).toBe('{"mode":"cadence","heavyEveryN":5}');
    // off=只存 {"mode":"off"}
    booksRepo.updateBookMeta(db, bid, { landingMandate: { mode: 'off' } });
    expect(booksRepo.getBook(db, bid)!.landingMandateJson).toBe('{"mode":"off"}');
    // null=清空
    booksRepo.updateBookMeta(db, bid, { landingMandate: null });
    expect(booksRepo.getBook(db, bid)!.landingMandateJson).toBeNull();
    booksRepo.deleteBook(db, bid);
  });
});

describe('融合门 gen_gate_json（规格 §3.5）', () => {
  it('updateGenGate 往返：parseGenGate 回读 fingerprint/suppressed/updatedAt 钉值', () => {
    const bid = booksRepo.createBook(db, { title: '融合门之书' }).id;
    expect(booksRepo.getBook(db, bid)!.genGateJson).toBeNull();
    expect(booksRepo.parseGenGate(booksRepo.getBook(db, bid)!.genGateJson)).toBeNull();
    const state = { fingerprint: 'fp-abc123', suppressed: true, updatedAt: '2026-11-24T00:00:00.000Z' };
    booksRepo.updateGenGate(db, bid, state);
    const book = booksRepo.getBook(db, bid)!;
    expect(book.genGateJson).toBe(JSON.stringify(state));
    expect(booksRepo.parseGenGate(book.genGateJson)).toEqual(state);
    // 覆写：不再提示关回
    booksRepo.updateGenGate(db, bid, { fingerprint: 'fp-next', suppressed: false, updatedAt: '2026-11-24T01:00:00.000Z' });
    expect(booksRepo.parseGenGate(booksRepo.getBook(db, bid)!.genGateJson)).toEqual({
      fingerprint: 'fp-next',
      suppressed: false,
      updatedAt: '2026-11-24T01:00:00.000Z',
    });
    booksRepo.deleteBook(db, bid);
  });

  it('gen_gate_json 空串/非法 JSON/缺 fingerprint 键 → parseGenGate null（咬人输入①）', () => {
    expect(booksRepo.parseGenGate('')).toBeNull();
    expect(booksRepo.parseGenGate(null)).toBeNull();
    expect(booksRepo.parseGenGate(undefined)).toBeNull();
    expect(booksRepo.parseGenGate('not-json{{')).toBeNull();
    expect(booksRepo.parseGenGate('{"suppressed":true}')).toBeNull(); // 缺 fingerprint
    expect(booksRepo.parseGenGate('{"fingerprint":42}')).toBeNull(); // fingerprint 非字符串
    expect(booksRepo.parseGenGate('42')).toBeNull(); // 非对象
  });
});
