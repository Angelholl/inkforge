import { randomUUID } from 'node:crypto';
import type { Database } from '../open';

export interface Book {
  id: string;
  title: string;
  description: string;
  outline: string;
  styleProfileId: string | null;
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
  created_at: string;
  updated_at: string;
}

function toBook(r: BookRow): Book {
  return { id: r.id, title: r.title, description: r.description, outline: r.outline, styleProfileId: r.style_profile_id, createdAt: r.created_at, updatedAt: r.updated_at };
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

export function setBookStyleProfile(db: Database, bookId: string, profileId: string | null): void {
  db.prepare('UPDATE books SET style_profile_id = ?, updated_at = ? WHERE id = ?').run(
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
    db.prepare('DELETE FROM chapters WHERE book_id = ?').run(id);
    db.prepare('DELETE FROM chapter_summaries WHERE book_id = ?').run(id);
    db.prepare('DELETE FROM character_states WHERE character_id IN (SELECT id FROM characters WHERE book_id = ?)').run(id);
    db.prepare('DELETE FROM characters WHERE book_id = ?').run(id);
    db.prepare('DELETE FROM foreshadowings WHERE book_id = ?').run(id);
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
