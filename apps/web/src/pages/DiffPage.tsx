import { useMemo } from 'react';
import { useParams, Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { diffChars } from 'diff';
import { api } from '../api/client';
import type { VersionListItemDto } from '@inkforge/shared';

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
  const { data: versionsData } = useQuery({
    queryKey: ['versions', bookId, no],
    queryFn: () => api.listVersions(bookId, no),
    refetchInterval: 5000,
  });
  const list: VersionListItemDto[] = versionsData?.versions ?? [];
  const currentVersionId = versionsData?.currentVersionId ?? null;
  // B2 硬删后「列表相邻」不再等价于「父子相邻」：配对一律走 parentVersionId 链
  const newer = useMemo(() => list.find((v) => v.id === currentVersionId) ?? list[0], [list, currentVersionId]);
  const older = useMemo(
    () => (newer?.parentVersionId ? list.find((v) => v.id === newer.parentVersionId) : undefined),
    [list, newer],
  );
  // 列表已去 content：两版正文各走单取端点
  const { data: newerFull } = useQuery({
    queryKey: ['version', newer?.id],
    queryFn: () => api.getVersion(newer?.id ?? ''),
    enabled: !!newer,
  });
  const { data: olderFull } = useQuery({
    queryKey: ['version', older?.id],
    queryFn: () => api.getVersion(older?.id ?? ''),
    enabled: !!older,
  });
  const parts = useMemo(
    () => (olderFull && newerFull ? computeVersionDiff(olderFull.content, newerFull.content) : []),
    [olderFull, newerFull],
  );
  const addedCount = parts.filter((p) => p.added).length;
  const removedCount = parts.filter((p) => p.removed).length;

  return (
    <main className="mx-auto max-w-[42rem] px-6 py-8">
      <Link to={`/books/${bookId}/chapters/${no}`} className="text-sm text-muted hover:text-ink">
        ← 阅读器
      </Link>
      <h1 className="mt-3 font-display text-xl font-semibold">版本对比 · 第{no}章</h1>
      <p className="mt-1 text-sm text-muted tabular-nums">
        插入段 {addedCount} · 删除段 {removedCount}
      </p>
      {!older && !!newer && <p className="mt-1 text-sm text-muted">{list.length < 2 ? '不足两个版本，无法对比' : '上一版已删或不存在，无法对比'}</p>}
      {!older && !newer && <p className="mt-1 text-sm text-muted">尚无版本，无法对比</p>}
      <div className="mt-4 whitespace-pre-wrap rounded-card bg-surface px-8 py-8 font-display text-[15px] leading-7">
        {parts.map((p, i) => (
          <span
            key={i}
            className={
              p.added ? 'bg-ok-soft/60 border-l-2 border-ok' : p.removed ? 'bg-danger-soft/60 border-l-2 border-danger line-through' : ''
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
