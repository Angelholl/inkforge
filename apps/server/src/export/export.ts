import fs from 'node:fs/promises';
import path from 'node:path';
import { getChapter, getCurrentVersion, listChapters } from '../db/repositories/chapters';
import type { Database } from '../db/open';

function safeTitle(title: string): string {
  return title.replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 50);
}

/** 导出 markdown：{NNN}-{safeTitle}.md = '# 第N章 title\n\n' + current 版本全文；无版本章跳过。 */
export async function exportBook(db: Database, bookId: string, outDir: string): Promise<{ files: string[] }> {
  await fs.mkdir(outDir, { recursive: true });
  const files: string[] = [];
  for (const ch of listChapters(db, bookId)) {
    const cur = ch.currentVersionId ? getCurrentVersion(db, ch.id) : undefined;
    if (!cur) continue;
    const fileName = `${String(ch.chapterNo).padStart(3, '0')}-${safeTitle(ch.title || `第${ch.chapterNo}章`)}.md`;
    const content = `# 第${ch.chapterNo}章 ${ch.title}\n\n${cur.content}`;
    await fs.writeFile(path.join(outDir, fileName), content, 'utf8');
    files.push(fileName);
  }
  return { files };
}

export function chapterHasVersion(db: Database, bookId: string, chapterNo: number): boolean {
  const ch = getChapter(db, bookId, chapterNo);
  return !!ch?.currentVersionId;
}
