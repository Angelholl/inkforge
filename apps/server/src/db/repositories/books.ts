import { randomUUID } from 'node:crypto';
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
  style_fewshot_on: number;
  created_at: string;
  updated_at: string;
}

function toBook(r: BookRow): Book {
  return { id: r.id, title: r.title, description: r.description, outline: r.outline, styleProfileId: r.style_profile_id, styleSnapshotJson: r.style_snapshot_json, imitationProfileId: r.imitation_profile_id, styleFewshotOn: r.style_fewshot_on === 1, createdAt: r.created_at, updatedAt: r.updated_at };
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

export function listCharacters(db: Database, bookId: string): Array<{ id: string; name: string; baseSetting: string }> {
  return (
    db.prepare('SELECT id, name, base_setting FROM characters WHERE book_id = ? ORDER BY created_at').all(bookId) as Array<{
      id: string;
      name: string;
      base_setting: string;
    }>
  ).map((r) => ({ id: r.id, name: r.name, baseSetting: r.base_setting }));
}

/** 风格绑定/解绑：绑定且传 snapshot 时同步写 persona 快照（DEC-2026-1115-04 批次三）；解绑/未传清快照。 */
export function setBookStyleProfile(
  db: Database,
  bookId: string,
  profileId: string | null,
  snapshot?: { profileId: string; version: number; rulesJson: string; samplesJson: string } | null,
): void {
  const snapshotJson = profileId && snapshot ? JSON.stringify({ ...snapshot, boundAt: new Date().toISOString() }) : null;
  // B4 裁决④：绑定与解绑都把文风示例开关归零（新绑定默认关）
  db.prepare('UPDATE books SET style_profile_id = ?, style_snapshot_json = ?, style_fewshot_on = 0, updated_at = ? WHERE id = ?').run(
    profileId,
    snapshotJson,
    new Date().toISOString(),
    bookId,
  );
}

/** 仿写档案绑定/解绑（profileId=null 解绑；存在性守卫由路由层做 404）。 */
export function setBookImitation(db: Database, bookId: string, profileId: string | null): void {
  db.prepare('UPDATE books SET imitation_profile_id = ?, updated_at = ? WHERE id = ?').run(
    profileId,
    new Date().toISOString(),
    bookId,
  );
}

export function updateBookMeta(
  db: Database,
  bookId: string,
  patch: { title?: string; description?: string; outline?: string },
): Book | undefined {
  const book = getBook(db, bookId);
  if (!book) return undefined;
  const next = {
    title: patch.title ?? book.title,
    description: patch.description ?? book.description,
    outline: patch.outline ?? book.outline,
  };
  db.prepare('UPDATE books SET title = ?, description = ?, outline = ?, updated_at = ? WHERE id = ?').run(
    next.title,
    next.description,
    next.outline,
    new Date().toISOString(),
    bookId,
  );
  return getBook(db, bookId);
}

export function getCharacter(
  db: Database,
  bookId: string,
  characterId: string,
): { id: string; name: string; baseSetting: string } | undefined {
  const row = db
    .prepare('SELECT id, name, base_setting FROM characters WHERE book_id = ? AND id = ?')
    .get(bookId, characterId) as { id: string; name: string; base_setting: string } | undefined;
  return row ? { id: row.id, name: row.name, baseSetting: row.base_setting } : undefined;
}

export function getCharacterByName(
  db: Database,
  bookId: string,
  name: string,
): { id: string; name: string; baseSetting: string } | undefined {
  const row = db
    .prepare('SELECT id, name, base_setting FROM characters WHERE book_id = ? AND name = ?')
    .get(bookId, name) as { id: string; name: string; base_setting: string } | undefined;
  return row ? { id: row.id, name: row.name, baseSetting: row.base_setting } : undefined;
}

export function createCharacter(
  db: Database,
  bookId: string,
  input: { name: string; baseSetting?: string },
): { id: string; name: string; baseSetting: string } {
  const id = randomUUID();
  db.prepare('INSERT INTO characters(id, book_id, name, base_setting, created_at) VALUES(?,?,?,?,?)').run(
    id,
    bookId,
    input.name,
    input.baseSetting ?? '{}',
    new Date().toISOString(),
  );
  return { id, name: input.name, baseSetting: input.baseSetting ?? '{}' };
}

export function updateCharacter(
  db: Database,
  bookId: string,
  characterId: string,
  patch: { name?: string; baseSetting?: string },
): { id: string; name: string; baseSetting: string } | undefined {
  const cur = getCharacter(db, bookId, characterId);
  if (!cur) return undefined;
  const name = patch.name ?? cur.name;
  const baseSetting = patch.baseSetting ?? cur.baseSetting;
  db.prepare('UPDATE characters SET name = ?, base_setting = ? WHERE book_id = ? AND id = ?').run(
    name,
    baseSetting,
    bookId,
    characterId,
  );
  return { id: characterId, name, baseSetting };
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
