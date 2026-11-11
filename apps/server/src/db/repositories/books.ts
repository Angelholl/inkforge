import { randomUUID } from 'node:crypto';
import type { Database } from '../open';

export interface Book {
  id: string;
  title: string;
  description: string;
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
  style_profile_id: string | null;
  created_at: string;
  updated_at: string;
}

function toBook(r: BookRow): Book {
  return { id: r.id, title: r.title, description: r.description, styleProfileId: r.style_profile_id, createdAt: r.created_at, updatedAt: r.updated_at };
}

export function createBook(
  db: Database,
  input: { title: string; description?: string; characters?: CharacterInput[] },
): Book {
  const now = new Date().toISOString();
  const book: Book = {
    id: randomUUID(),
    title: input.title,
    description: input.description ?? '',
    styleProfileId: null,
    createdAt: now,
    updatedAt: now,
  };
  const tx = db.transaction(() => {
    db.prepare('INSERT INTO books(id, title, description, created_at, updated_at) VALUES(?,?,?,?,?)').run(
      book.id,
      book.title,
      book.description,
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

export function setBookStyleProfile(db: Database, bookId: string, profileId: string | null): void {
  db.prepare('UPDATE books SET style_profile_id = ?, updated_at = ? WHERE id = ?').run(
    profileId,
    new Date().toISOString(),
    bookId,
  );
}
