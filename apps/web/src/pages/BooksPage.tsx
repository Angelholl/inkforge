import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { api } from '../api/client';
import type { BookDto } from '@inkforge/shared';

export default function BooksPage() {
  const { data: books } = useQuery({ queryKey: ['books'], queryFn: api.listBooks, refetchInterval: 5000 });

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-bold">墨炉 · 书架</h1>
      <ul className="mt-6 space-y-2">
        {(books ?? []).map((b: BookDto) => (
          <li key={b.id} className="rounded border px-4 py-3 hover:bg-gray-50">
            <Link to={`/books/${b.id}`} className="font-medium text-blue-700">
              {b.title}
            </Link>
            <span className="ml-2 text-xs text-gray-400">{b.createdAt.slice(0, 19).replace('T', ' ')}</span>
          </li>
        ))}
      </ul>
      {books && books.length === 0 && (
        <p className="mt-6 text-sm text-gray-500">
          还没有书。去 <Link to="/continue" className="text-blue-700">续写向导</Link> 建第一本。
        </p>
      )}
    </main>
  );
}
