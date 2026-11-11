import { useState } from 'react';
import { useParams, Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { SelectionRewrite } from './SelectionRewrite';
import type { VersionDto } from '@inkforge/shared';

export default function ChapterReaderPage() {
  const { bookId = '', chapterNo = '1' } = useParams();
  const no = Number(chapterNo);
  const { data: versions, refetch } = useQuery({
    queryKey: ['versions', bookId, no],
    queryFn: () => api.listVersions(bookId, no),
    refetchInterval: 5000,
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [msg, setMsg] = useState('');

  const list: VersionDto[] = versions ?? [];
  const current = list.find((v) => v.id === selected) ?? list.find((v) => v.id === list[0]?.id);

  const rollback = async () => {
    if (!current) return;
    const r = await api.rollback(current.id);
    setMsg(`已回滚到 ${r.currentVersionId.slice(0, 8)}`);
    setSelected(null);
    void refetch();
  };

  const exportBook = async () => {
    const r = await api.exportBook(bookId);
    setMsg(`已导出 ${r.files.length} 个文件至 data/exports/`);
  };

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <Link to={`/books/${bookId}`} className="text-sm text-gray-500">
        ← 返回书页
      </Link>
      <h1 className="mt-2 text-2xl font-bold">第{no}章 正文</h1>
      <div className="mt-4 flex gap-2">
        <button className="rounded bg-gray-200 px-4 py-2" onClick={rollback}>
          回滚到当前所选
        </button>
        <button className="rounded bg-blue-600 px-4 py-2 text-white" onClick={exportBook}>
          导出 markdown
        </button>
      </div>
      {msg && <p className="mt-2 text-sm text-gray-600">{msg}</p>}

      <section className="mt-4">
        <h2 className="font-semibold">版本链（新 → 旧）</h2>
        <ul className="mt-2 flex flex-wrap gap-2">
          {list.map((v) => (
            <li key={v.id}>
              <button
                className={`rounded px-3 py-1.5 text-xs ${
                  current?.id === v.id ? 'bg-blue-600 text-white' : 'bg-gray-100'
                }`}
                onClick={() => setSelected(v.id)}
              >
                {v.kind} · {v.wordCount}字 · {v.createdAt.slice(11, 19)}
                {v.params && (v.params as { overall?: number }).overall != null && (
                  <> · {((v.params as { overall?: number }).overall as number).toFixed(1)}分</>
                )}
              </button>
            </li>
          ))}
        </ul>
      </section>

      {current && <SelectionRewrite versionId={current.id} onCreated={() => void refetch()} />}
      <Link to={`/books/${bookId}/chapters/${no}/diff`} className="mt-4 inline-block text-sm text-blue-600">
        查看相邻版本 diff →
      </Link>
      <article className="mt-2 whitespace-pre-wrap rounded border bg-white p-6 text-sm leading-7">
        {current?.content ?? '（本章尚无版本）'}
      </article>
    </main>
  );
}
