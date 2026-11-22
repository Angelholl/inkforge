import fs from 'node:fs/promises';
import path from 'node:path';
import { getCurrentVersion, listChapters } from '../db/repositories/chapters';
import type { Database } from '../db/open';

export type ExportFormat = 'chapters-md' | 'combined-md' | 'txt';

/** 文件系统段安全化：非法字符→'_'；纯点号段（'.'/'..'）→'_'（audit 2026-11-23 F-3：书名 '..' 曾把 outDir 解析到 dataDir 根）。 */
export function safeSegment(name: string): string {
  const s = name.replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 50);
  return s === '.' || s === '..' ? '_' : s;
}

function safeTitle(title: string): string {
  return safeSegment(title);
}

/**
 * 导出（C3 三格式）：
 * - txt（默认，DEC-2026-1118-01）：分章 .txt，无 '# ' 标题行（纯正文）
 * - chapters-md：{NNN}-{safeTitle}.md = '# 第N章 title\n\n' + current 全文
 * - combined-md：单个「全书.md」，章节间以 '\n\n---\n\n' 间隔
 * 无版本章跳过。
 */
export async function exportBook(
  db: Database,
  bookId: string,
  outDir: string,
  format: ExportFormat = 'txt',
): Promise<{ files: string[] }> {
  await fs.mkdir(outDir, { recursive: true });
  const files: string[] = [];
  const chapters = listChapters(db, bookId)
    .map((ch) => ({ ch, cur: ch.currentVersionId ? getCurrentVersion(db, ch.id) : undefined }))
    .filter((x): x is { ch: (typeof x)['ch']; cur: NonNullable<(typeof x)['cur']> } => x.cur !== undefined);

  if (format === 'combined-md') {
    const parts = chapters.map(({ ch, cur }) => `# 第${ch.chapterNo}章 ${ch.title}\n\n${cur.content}`);
    const fileName = '全书.md';
    await fs.writeFile(path.join(outDir, fileName), parts.join('\n\n---\n\n'), 'utf8');
    files.push(fileName);
    return { files };
  }

  const ext = format === 'txt' ? 'txt' : 'md';
  for (const { ch, cur } of chapters) {
    const fileName = `${String(ch.chapterNo).padStart(3, '0')}-${safeTitle(ch.title || `第${ch.chapterNo}章`)}.${ext}`;
    const content = format === 'txt' ? cur.content : `# 第${ch.chapterNo}章 ${ch.title}\n\n${cur.content}`;
    await fs.writeFile(path.join(outDir, fileName), content, 'utf8');
    files.push(fileName);
  }
  return { files };
}
