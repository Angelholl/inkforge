import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

export type Database = Database.Database;

/** 打开 SQLite 库并应用 pragma（WAL / synchronous=NORMAL / busy_timeout=5000 / foreign_keys=ON）。 */
export function openDb(file: string): Database {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('foreign_keys = ON');
  return db;
}
