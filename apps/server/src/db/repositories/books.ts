import { randomUUID } from 'node:crypto';
import { mapLegacyDimSource, type LandingMandate } from '@inkforge/shared';
import type { Database } from '../open';

export interface Book {
  id: string;
  title: string;
  description: string;
  outline: string;
  styleProfileId: string | null;
  /** persona 快照（bindStyle 时复制档案 rules/samples，后续改档案不影响已绑定书） */
  styleSnapshotJson: string | null;
  imitationProfileId: string | null;
  /** 剧情档案绑定（DEC-2026-1120-03）：blueprint-suggest planner 槽注入【剧情参考】 */
  plotProfileId: string | null;
  /** 人物光谱档案绑定（DEC-2026-1120-09）：blueprint-suggest planner 槽注入【人物光谱参考】 */
  spectrumProfileId: string | null;
  /** 书级落地策略（DEC-2026-1122-01）：原始 JSON 串（null=off）；客户端读走 parseLandingMandate 解析形态 */
  landingMandateJson: string | null;
  /** 生成前融合确认门状态（规格 §3.5）：原始 JSON 串（null=未记录）；解析走 parseGenGate */
  genGateJson: string | null;
  /** 文风示例注入开关（B4 裁决④）：仅控注入，抄用检测不受影响 */
  styleFewshotOn: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CharacterInput {
  name: string;
  baseSetting?: string;
}

interface BookRow {
  id: string;
  title: string;
  description: string;
  outline: string;
  style_profile_id: string | null;
  style_snapshot_json: string | null;
  imitation_profile_id: string | null;
  plot_profile_id: string | null;
  spectrum_profile_id: string | null;
  landing_mandate_json: string | null;
  gen_gate_json: string | null;
  style_fewshot_on: number;
  created_at: string;
  updated_at: string;
}

function toBook(r: BookRow): Book {
  return { id: r.id, title: r.title, description: r.description, outline: r.outline, styleProfileId: r.style_profile_id, styleSnapshotJson: r.style_snapshot_json, imitationProfileId: r.imitation_profile_id, plotProfileId: r.plot_profile_id, spectrumProfileId: r.spectrum_profile_id, landingMandateJson: r.landing_mandate_json ?? null, genGateJson: r.gen_gate_json ?? null, styleFewshotOn: r.style_fewshot_on === 1, createdAt: r.created_at, updatedAt: r.updated_at };
}

export function createBook(
  db: Database,
  input: { title: string; description?: string; outline?: string; characters?: CharacterInput[] },
): Book {
  const now = new Date().toISOString();
  const book: Book = {
    id: randomUUID(),
    title: input.title,
    description: input.description ?? '',
    outline: input.outline ?? '',
    styleProfileId: null,
    styleSnapshotJson: null,
    imitationProfileId: null,
    plotProfileId: null,
    spectrumProfileId: null,
    landingMandateJson: null,
    genGateJson: null,
    styleFewshotOn: false,
    createdAt: now,
    updatedAt: now,
  };
  const tx = db.transaction(() => {
    db.prepare('INSERT INTO books(id, title, description, outline, created_at, updated_at) VALUES(?,?,?,?,?,?)').run(
      book.id,
      book.title,
      book.description,
      book.outline,
      book.createdAt,
      book.updatedAt,
    );
    for (const c of input.characters ?? []) {
      db.prepare('INSERT INTO characters(id, book_id, name, base_setting, created_at) VALUES(?,?,?,?,?)').run(
        randomUUID(),
        book.id,
        c.name,
        c.baseSetting ?? '{}',
        now,
      );
    }
  });
  tx();
  return book;
}

export function getBook(db: Database, id: string): Book | undefined {
  const row = db.prepare('SELECT * FROM books WHERE id = ?').get(id) as BookRow | undefined;
  return row ? toBook(row) : undefined;
}

export function listBooks(db: Database): Book[] {
  return (db.prepare('SELECT * FROM books ORDER BY created_at DESC').all() as BookRow[]).map(toBook);
}

export function listCharacters(db: Database, bookId: string): CharacterCard[] {
  return (
    db.prepare(`SELECT ${CHARACTER_COLS} FROM characters WHERE book_id = ? ORDER BY created_at`).all(bookId) as Array<{
      id: string;
      name: string;
      base_setting: string;
      offline_from_chapter: number | null;
    }>
  ).map(toCharacterCard);
}

/** 遗留：仅写主镜像不写关联表（测试兜底路径用）；生产绑定走 setBookStyleBinding。绑定且传 snapshot 时同步写 persona 快照（DEC-2026-1115-04 批次三）；解绑/未传清快照。 */
export function setBookStyleProfile(
  db: Database,
  bookId: string,
  profileId: string | null,
  snapshot?: { profileId: string; version: number; rulesJson: string; samplesJson: string } | null,
): void {
  const snapshotJson = profileId && snapshot ? JSON.stringify({ ...snapshot, boundAt: new Date().toISOString() }) : null;
  const ts = new Date().toISOString();
  // DEC-2026-1122-03③：绑定/重绑置 1、解绑置 0（列 DEFAULT 0 不动，默认开由绑定路径写入）
  const fewshotOn = profileId === null ? 0 : 1;
  db.prepare('UPDATE books SET style_profile_id = ?, style_snapshot_json = ?, style_fewshot_on = ?, updated_at = ? WHERE id = ?').run(
    profileId,
    snapshotJson,
    fewshotOn,
    ts,
    bookId,
  );
}

/** 风格绑定（0010 关联表，引用真相）：books.style_profile_id 为主镜像。binding=null 解绑清三处；绑定/重绑置 1、解绑置 0（DEC-2026-1122-03③）。 */
export interface StyleBinding {
  primaryProfileId: string;
  auxProfileIds: string[];
  /** 七维→贡献档案 id；空对象=全归主（0010 存量行形态） */
  dimsSource: Record<string, string>;
  /** 融合比例（0011）：Record<profileId, 整数≥1> Σ=100；空对象=legacy 按贡献维数计权（DEC-2026-1117-05） */
  weights: Record<string, number>;
  /** 读时别名诊断：mapLegacyDimSource 的 splits（仅非空时由读出方携带）；不入库 */
  legacySplits?: Record<string, string>;
}

export function setBookStyleBinding(db: Database, bookId: string, binding: StyleBinding | null, snapshotJson: string | null): void {
  const ts = new Date().toISOString();
  // DEC-2026-1122-03③：绑定/重绑置 1、解绑置 0（列 DEFAULT 0 不动，默认开由绑定路径写入）
  const fewshotOn = binding ? 1 : 0;
  const tx = db.transaction(() => {
    db.prepare('UPDATE books SET style_profile_id = ?, style_snapshot_json = ?, style_fewshot_on = ?, updated_at = ? WHERE id = ?').run(
      binding?.primaryProfileId ?? null,
      binding ? snapshotJson : null,
      fewshotOn,
      ts,
      bookId,
    );
    db.prepare('DELETE FROM book_style_profiles WHERE book_id = ?').run(bookId);
    if (binding) {
      const dimsJson = JSON.stringify(binding.dimsSource);
      const weightsJson = JSON.stringify(binding.weights ?? {});
      db.prepare('INSERT INTO book_style_profiles(book_id, profile_id, is_primary, dims_json, weights_json, created_at) VALUES(?,?,?,?,?,?)').run(
        bookId,
        binding.primaryProfileId,
        1,
        dimsJson,
        weightsJson,
        ts,
      );
      for (const aux of binding.auxProfileIds) {
        db.prepare('INSERT INTO book_style_profiles(book_id, profile_id, is_primary, dims_json, weights_json, created_at) VALUES(?,?,?,?,?,?)').run(
          bookId,
          aux,
          0,
          dimsJson,
          weightsJson,
          ts,
        );
      }
    }
  });
  tx();
}

export function getBookStyleBinding(db: Database, bookId: string): StyleBinding | null {
  const rows = db
    .prepare('SELECT profile_id, is_primary, dims_json, weights_json FROM book_style_profiles WHERE book_id = ? ORDER BY is_primary DESC, rowid ASC')
    .all(bookId) as Array<{ profile_id: string; is_primary: number; dims_json: string; weights_json: string }>;
  if (rows.length === 0) return null;
  const primary = rows[0]!;
  const mapped = mapLegacyDimSource(JSON.parse(primary.dims_json) as Record<string, string>, primary.profile_id);
  return {
    primaryProfileId: primary.profile_id,
    auxProfileIds: rows.slice(1).map((r) => r.profile_id),
    dimsSource: mapped.dimsSource,
    weights: JSON.parse(primary.weights_json) as Record<string, number>,
    ...(Object.keys(mapped.splits).length > 0 ? { legacySplits: mapped.splits } : {}),
  };
}

/** 只读徽标反查：该档案当前绑在哪本书。style=0010 关联表引用真相（含辅档命中）；plot/spectrum=books 镜像列固定字面量映射（无用户输入拼接）。 */
export function listBooksBoundToProfile(
  db: Database,
  kind: 'style' | 'plot' | 'spectrum',
  profileId: string,
): Array<{ id: string; title: string }> {
  if (kind === 'style') {
    // 0010 关联表=引用真相（含辅档命中）
    return db
      .prepare(
        'SELECT DISTINCT b.id, b.title FROM books b JOIN book_style_profiles m ON m.book_id = b.id WHERE m.profile_id = ? ORDER BY b.created_at DESC',
      )
      .all(profileId) as Array<{ id: string; title: string }>;
  }
  // plot/spectrum=books 镜像列固定字面量映射（无用户输入拼接）
  const column = kind === 'plot' ? 'plot_profile_id' : 'spectrum_profile_id';
  return db.prepare(`SELECT id, title FROM books WHERE ${column} = ? ORDER BY created_at DESC`).all(profileId) as Array<{
    id: string;
    title: string;
  }>;
}

/** 仿写档案绑定/解绑（profileId=null 解绑；存在性守卫由路由层做 404）。 */
export function setBookImitation(db: Database, bookId: string, profileId: string | null): void {
  db.prepare('UPDATE books SET imitation_profile_id = ?, updated_at = ? WHERE id = ?').run(
    profileId,
    new Date().toISOString(),
    bookId,
  );
}

/** 剧情档案绑定（DEC-2026-1120-03）：沿 setBookImitation 同构。 */
export function setBookPlotProfile(db: Database, bookId: string, profileId: string | null): void {
  db.prepare('UPDATE books SET plot_profile_id = ?, updated_at = ? WHERE id = ?').run(
    profileId,
    new Date().toISOString(),
    bookId,
  );
}

/** 人物光谱档案绑定（DEC-2026-1120-09）：沿 setBookPlotProfile 同构。 */
export function setBookSpectrumProfile(db: Database, bookId: string, profileId: string | null): void {
  db.prepare('UPDATE books SET spectrum_profile_id = ?, updated_at = ? WHERE id = ?').run(
    profileId,
    new Date().toISOString(),
    bookId,
  );
}

/** 生成前融合确认门状态（规格 §3.5）。 */
export interface GenGateState {
  fingerprint: string;
  suppressed: boolean;
  updatedAt: string;
}

/** DB 容错读取：null/''/非法 JSON/缺 fingerprint 字符串键 → null */
export function parseGenGate(raw: string | null | undefined): GenGateState | null {
  if (raw === null || raw === undefined || raw === '') return null;
  try {
    const v = JSON.parse(raw) as unknown;
    if (typeof v !== 'object' || v === null) return null;
    const o = v as { fingerprint?: unknown };
    if (typeof o.fingerprint !== 'string') return null;
    const st = v as { fingerprint: string; suppressed?: unknown; updatedAt?: unknown };
    return { fingerprint: st.fingerprint, suppressed: st.suppressed === true, updatedAt: typeof st.updatedAt === 'string' ? st.updatedAt : '' };
  } catch {
    return null;
  }
}

export function updateGenGate(db: Database, bookId: string, state: GenGateState): void {
  db.prepare('UPDATE books SET gen_gate_json = ?, updated_at = ? WHERE id = ?').run(
    JSON.stringify(state),
    new Date().toISOString(),
    bookId,
  );
}

/** landingMandate 归一（DEC-2026-1122-01）：null=清空；off 只存 {"mode":"off"}；cadence 归一 heavyEveryN（正整数且 ≥2，缺省 2）。 */
function normalizeLandingMandateJson(m: LandingMandate): string {
  if (m.mode === 'off') return '{"mode":"off"}';
  const n = m.heavyEveryN;
  const heavyEveryN = typeof n === 'number' && Number.isInteger(n) && n >= 2 ? n : 2;
  return JSON.stringify({ mode: 'cadence', heavyEveryN });
}

export function updateBookMeta(
  db: Database,
  bookId: string,
  patch: { title?: string; description?: string; outline?: string; landingMandate?: LandingMandate | null },
): Book | undefined {
  const book = getBook(db, bookId);
  if (!book) return undefined;
  const next = {
    title: patch.title ?? book.title,
    description: patch.description ?? book.description,
    outline: patch.outline ?? book.outline,
    // 三态：undefined=不动；null=清空；对象=归一写入
    landingMandateJson: patch.landingMandate === undefined ? book.landingMandateJson : patch.landingMandate === null ? null : normalizeLandingMandateJson(patch.landingMandate),
  };
  db.prepare('UPDATE books SET title = ?, description = ?, outline = ?, landing_mandate_json = ?, updated_at = ? WHERE id = ?').run(
    next.title,
    next.description,
    next.outline,
    next.landingMandateJson,
    new Date().toISOString(),
    bookId,
  );
  return getBook(db, bookId);
}

/** 人物卡统一形态（0009）：offlineFromChapter=null 在场；N=第 N 章（含）起下线。 */
export interface CharacterCard {
  id: string;
  name: string;
  baseSetting: string;
  offlineFromChapter: number | null;
}

const CHARACTER_COLS = 'id, name, base_setting, offline_from_chapter';

function toCharacterCard(r: { id: string; name: string; base_setting: string; offline_from_chapter: number | null }): CharacterCard {
  return { id: r.id, name: r.name, baseSetting: r.base_setting, offlineFromChapter: r.offline_from_chapter ?? null };
}

export function getCharacter(db: Database, bookId: string, characterId: string): CharacterCard | undefined {
  const row = db
    .prepare(`SELECT ${CHARACTER_COLS} FROM characters WHERE book_id = ? AND id = ?`)
    .get(bookId, characterId) as { id: string; name: string; base_setting: string; offline_from_chapter: number | null } | undefined;
  return row ? toCharacterCard(row) : undefined;
}

export function getCharacterByName(db: Database, bookId: string, name: string): CharacterCard | undefined {
  const row = db
    .prepare(`SELECT ${CHARACTER_COLS} FROM characters WHERE book_id = ? AND name = ?`)
    .get(bookId, name) as { id: string; name: string; base_setting: string; offline_from_chapter: number | null } | undefined;
  return row ? toCharacterCard(row) : undefined;
}

/** 在场人物（写第 chapterNo 章时的口径）：下线章当章即不在场（offline_from_chapter > chapterNo 才保留）。 */
export function listActiveCharacters(db: Database, bookId: string, chapterNo: number): CharacterCard[] {
  return (
    db
      .prepare(`SELECT ${CHARACTER_COLS} FROM characters WHERE book_id = ? AND (offline_from_chapter IS NULL OR offline_from_chapter > ?) ORDER BY created_at`)
      .all(bookId, chapterNo) as Array<{ id: string; name: string; base_setting: string; offline_from_chapter: number | null }>
  ).map(toCharacterCard);
}

export function createCharacter(
  db: Database,
  bookId: string,
  input: { name: string; baseSetting?: string },
): CharacterCard {
  const id = randomUUID();
  db.prepare('INSERT INTO characters(id, book_id, name, base_setting, created_at) VALUES(?,?,?,?,?)').run(
    id,
    bookId,
    input.name,
    input.baseSetting ?? '{}',
    new Date().toISOString(),
  );
  return { id, name: input.name, baseSetting: input.baseSetting ?? '{}', offlineFromChapter: null };
}

/**
 * patch 三态（0009 下线控件）：offlineFromChapter=undefined 保留现值；null 恢复在场；数字=第 N 章起下线。
 * name/baseSetting 沿旧语义（undefined 保留）。
 */
export function updateCharacter(
  db: Database,
  bookId: string,
  characterId: string,
  patch: { name?: string; baseSetting?: string; offlineFromChapter?: number | null },
): CharacterCard | undefined {
  const cur = getCharacter(db, bookId, characterId);
  if (!cur) return undefined;
  const name = patch.name ?? cur.name;
  const baseSetting = patch.baseSetting ?? cur.baseSetting;
  const offlineFromChapter = patch.offlineFromChapter === undefined ? cur.offlineFromChapter : patch.offlineFromChapter;
  db.prepare('UPDATE characters SET name = ?, base_setting = ?, offline_from_chapter = ? WHERE book_id = ? AND id = ?').run(
    name,
    baseSetting,
    offlineFromChapter,
    bookId,
    characterId,
  );
  return getCharacter(db, bookId, characterId);
}

/** 删书：外键无级联（SQLite 默认 RESTRICT），按依赖序显式清空全部关联表，书不存在返回 false。 */
export function deleteBook(db: Database, id: string): boolean {
  if (!getBook(db, id)) return false;
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM partial_outputs WHERE run_step_id IN (SELECT rs.id FROM run_steps rs JOIN runs r ON r.id = rs.run_id WHERE r.book_id = ?)').run(id);
    db.prepare('DELETE FROM run_steps WHERE run_id IN (SELECT id FROM runs WHERE book_id = ?)').run(id);
    db.prepare('DELETE FROM runs WHERE book_id = ?').run(id);
    db.prepare('DELETE FROM chapter_fts WHERE chapter_id IN (SELECT id FROM chapters WHERE book_id = ?)').run(id);
    db.prepare('DELETE FROM chapter_versions WHERE chapter_id IN (SELECT id FROM chapters WHERE book_id = ?)').run(id);
    db.prepare('DELETE FROM chapter_version_tombstones WHERE chapter_id IN (SELECT id FROM chapters WHERE book_id = ?)').run(id);
    db.prepare('DELETE FROM chapters WHERE book_id = ?').run(id);
    db.prepare('DELETE FROM chapter_summaries WHERE book_id = ?').run(id);
    db.prepare('DELETE FROM character_states WHERE character_id IN (SELECT id FROM characters WHERE book_id = ?)').run(id);
    db.prepare('DELETE FROM characters WHERE book_id = ?').run(id);
    db.prepare('DELETE FROM foreshadowings WHERE book_id = ?').run(id);
    db.prepare('DELETE FROM book_style_profiles WHERE book_id = ?').run(id);
    db.prepare('DELETE FROM outline_nodes WHERE book_id = ?').run(id);
    db.prepare('DELETE FROM books WHERE id = ?').run(id);
  });
  tx();
  return true;
}

export function deleteCharacter(db: Database, bookId: string, characterId: string): boolean {
  if (!getCharacter(db, bookId, characterId)) return false;
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM character_states WHERE character_id = ?').run(characterId);
    db.prepare('DELETE FROM characters WHERE book_id = ? AND id = ?').run(bookId, characterId);
  });
  tx();
  return true;
}

/** 逐书文风示例开关（B4 裁决④）：只控注入，抄用检测恒取绑定样本。 */
export function setBookFewshot(db: Database, bookId: string, on: boolean): void {
  db.prepare('UPDATE books SET style_fewshot_on = ?, updated_at = ? WHERE id = ?').run(
    on ? 1 : 0,
    new Date().toISOString(),
    bookId,
  );
}
