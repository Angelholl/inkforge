import fs from 'node:fs';
import path from 'node:path';
import type { Database } from './open';

let seq = 0;

/** 文件名时间戳：ms + 定宽 4 位序号（定宽 → 字典序即时间序，prune 删最旧才成立）。 */
function stamp(): string {
  seq = (seq + 1) % 10000;
  return `${Date.now()}-${String(seq).padStart(4, '0')}`;
}

function escapeForRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** VACUUM INTO 快照 + 按「家族」prune：familyRe 精确圈定本家族，绝不误伤同前缀的另一家族。 */
function vacuumSnapshot(db: Database, backupDir: string, prefix: string, familyRe: RegExp, retain: number): string {
  fs.mkdirSync(backupDir, { recursive: true });
  const target = path.join(backupDir, `${prefix}${stamp()}.db`);
  db.prepare('VACUUM INTO ?').run(target);
  const mine = fs
    .readdirSync(backupDir)
    .filter((f) => familyRe.test(f))
    .sort();
  for (const f of mine.slice(0, Math.max(0, mine.length - retain))) {
    try {
      fs.rmSync(path.join(backupDir, f), { force: true });
    } catch {
      /* Windows 锁瞬态 */
    }
  }
  return target;
}

// 两家族前缀互相包含（`${bookId}-` ⊂ `${bookId}-predelete-`），故用正则而非 startsWith 圈定
const plainRe = (bookId: string): RegExp => new RegExp(`^${escapeForRegExp(bookId)}-(?!predelete-)\\d+-\\d{4}\\.db$`);
const predeleteRe = (bookId: string): RegExp => new RegExp(`^${escapeForRegExp(bookId)}-predelete-\\d+-\\d{4}\\.db$`);

/** run 前 VACUUM INTO 快照：{backupDir}/{bookId}-{ts}-{seq}.db；同书保留最近 retain 份。返回备份路径。 */
export function backupBook(db: Database, bookId: string, backupDir: string, retain = 5): string {
  return vacuumSnapshot(db, backupDir, `${bookId}-`, plainRe(bookId), retain);
}

/** 硬删版本/删书前快照（DEC-2026-1116-01 ①）：{bookId}-predelete-{ts}-{seq}.db，与 backupBook 家族互不 prune。默认留 3 份。 */
export function backupBookPredelete(db: Database, bookId: string, backupDir: string, retain = 3): string {
  return vacuumSnapshot(db, backupDir, `${bookId}-predelete-`, predeleteRe(bookId), retain);
}
