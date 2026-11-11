import { useMemo } from 'react';
import { useParams, Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { diffChars } from 'diff';
import { api } from '../api/client';
import type { VersionDto } from '@inkforge/shared';

export interface DiffPart {
  value: string;
  added?: boolean;
  removed?: boolean;
}

/** 相邻版本字符级 diff（旧 → 新）。 */
export function computeVersionDiff(oldText: string, newText: string): DiffPart[] {
  return diffChars(oldText, newText) as DiffPart[];
}

export default function DiffPage() {
  const { bookId = '', chapterNo = '1' } = useParams();
  const no = Number(chapterNo);
  const { data: versions } = useQuery({ queryKey: ['versions', bookId, no], queryFn: () => api.listVersions(bookId, no), refetchInterval: 5000 });
  const [older, newer] = useMemo(() => {
    const list: VersionDto[] = versions ?? [];
    // 新→旧列表；相邻对取 list[1]→list[0]
    return [list[1], list[0]] as const;
  }, [versions]);
  const parts = useMemo(() => (older && newer ? computeVersionDiff(older.content, newer.content) : []), [older, newer]);
  const addedCount = parts.filter((p) => p.added).length;
  const removedCount = parts.filter((p) => p.removed).length;

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <Link to={`/books/${bookId}/chapters/${no}`} className="text-sm text-gray-500">
        ← 阅读器
      </Link>
      <h1 className="mt-2 text-2xl font-bold">版本对比 · 第{no}章</h1>
      <p className="mt-1 text-sm text-gray-500">
        插入段 {addedCount} · 删除段 {removedCount}
        {!older && ' （不足两个版本，无法对比）'}
      </p>
      <div className="mt-4 rounded border bg-white p-4 text-sm leading-7 whitespace-pre-wrap">
        {parts.map((p, i) => (
          <span
            key={i}
            className={
              p.added ? 'bg-green-100 text-green-800' : p.removed ? 'bg-red-100 text-red-700 line-through' : ''
            }
            data-testid={p.added ? 'diff-added' : p.removed ? 'diff-removed' : undefined}
          >
            {p.value}
          </span>
        ))}
      </div>
    </main>
  );
}
