import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { api } from '../api/client';
import type { BookDto } from '@inkforge/shared';

export default function BooksPage() {
  const { data: books, refetch } = useQuery({ queryKey: ['books'], queryFn: api.listBooks, refetchInterval: 5000 });
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [msg, setMsg] = useState('');

  const remove = async (id: string) => {
    setMsg('');
    try {
      await api.deleteBook(id);
      setConfirmId(null);
      void refetch();
    } catch (e) {
      setMsg(`删除失败：${(e as Error).message}`);
      setConfirmId(null);
    }
  };

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-bold">墨炉 · 书架</h1>
      <ul className="mt-6 space-y-2">
        {(books ?? []).map((b: BookDto) => (
          <li key={b.id} className="flex items-center rounded border px-4 py-3 hover:bg-gray-50">
            <Link to={`/books/${b.id}`} className="font-medium text-blue-700">
              {b.title}
            </Link>
            <span className="ml-2 text-xs text-gray-400">{b.createdAt.slice(0, 19).replace('T', ' ')}</span>
            {confirmId === b.id ? (
              <span className="ml-auto flex items-center gap-2 text-xs">
                <span className="text-red-600">章节/人物/运行记录一并清除，不可恢复</span>
                <button className="rounded bg-red-600 px-2 py-1 text-white" onClick={() => void remove(b.id)}>
                  确认删除
                </button>
                <button className="rounded border px-2 py-1" onClick={() => setConfirmId(null)}>
                  取消
                </button>
              </span>
            ) : (
              <button
                className="ml-auto rounded border border-red-300 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                onClick={() => setConfirmId(b.id)}
              >
                删除
              </button>
            )}
          </li>
        ))}
      </ul>
      {msg && <p className="mt-4 text-sm text-red-600">{msg}</p>}
      {books && books.length === 0 && (
        <p className="mt-6 text-sm text-gray-500">
          还没有书。去 <Link to="/continue" className="text-blue-700">续写向导</Link> 建第一本。
        </p>
      )}
    </main>
  );
}
