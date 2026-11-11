import fs from 'node:fs';
import path from 'node:path';
import type { Database } from './open';

let seq = 0;

/** run 前 VACUUM INTO 快照：{backupDir}/{bookId}-{ts}.db；同书保留最近 retain 份。返回备份路径。 */
export function backupBook(db: Database, bookId: string, backupDir: string, retain = 5): string {
  fs.mkdirSync(backupDir, { recursive: true });
  let ts = Date.now();
  // 同毫秒唯一化（快速连跑场景）
  const stamp = () => {
    let s = `${ts}-${seq++}`;
    if (seq > 9999) {
      ts = Date.now();
      seq = 0;
      s = `${ts}-${seq++}`;
    }
    return s;
  };
  const target = path.join(backupDir, `${bookId}-${stamp()}.db`);
  db.prepare('VACUUM INTO ?').run(target);
  // 清理：仅删本书的旧备份，保留最近 retain 份
  const mine = fs
    .readdirSync(backupDir)
    .filter((f) => f.startsWith(`${bookId}-`) && f.endsWith('.db'))
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
