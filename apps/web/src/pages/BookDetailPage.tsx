import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { api } from '../api/client';
import type { ChapterBlueprint } from '@inkforge/shared';

export default function BookDetailPage() {
  const { bookId = '' } = useParams();
  const { data: book, refetch } = useQuery({ queryKey: ['book', bookId], queryFn: () => api.getBook(bookId), refetchInterval: 4000 });
  const [blueprintText, setBlueprintText] = useState('');
  const [chapterNo, setChapterNo] = useState(1);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (book && book.chapters.length > 0 && blueprintText === '') {
      const ch = book.chapters.find((c) => c.chapterNo === chapterNo) ?? book.chapters[0];
      if (ch.blueprint) setBlueprintText(JSON.stringify(ch.blueprint, null, 2));
    }
  }, [book, chapterNo, blueprintText]);

  const saveBlueprint = async () => {
    try {
      const blueprint = JSON.parse(blueprintText) as ChapterBlueprint;
      const ch = book?.chapters.find((c) => c.chapterNo === chapterNo);
      const r = await api.putBlueprint(bookId, chapterNo, {
        title: ch?.title || `第${chapterNo}章`,
        blueprint,
        targetChars: ch?.targetChars,
      });
      setMsg(`蓝图已保存：${r.title}`);
      void refetch();
    } catch (e) {
      setMsg(`保存失败：${(e as Error).message}`);
    }
  };

  const generate = async () => {
    const r = await api.generateChapter(bookId, chapterNo);
    setMsg(`已入队 run ${r.runId}`);
  };

  const generateAll = async () => {
    const r = await api.generateAll(bookId);
    setMsg(`整书已入队 run ${r.runId}`);
  };

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <Link to="/" className="text-sm text-gray-500">
        ← 书架
      </Link>
      <h1 className="mt-2 text-2xl font-bold">{book?.title ?? '…'}</h1>
      <div className="mt-4 flex gap-2">
        <button className="rounded bg-blue-600 px-4 py-2 text-white" onClick={generateAll}>
          整书生成
        </button>
        <button className="rounded bg-gray-200 px-4 py-2" onClick={() => void refetch()}>
          刷新
        </button>
      </div>

      <section className="mt-6">
        <h2 className="font-semibold">章节</h2>
        <ul className="mt-2 space-y-1">
          {(book?.chapters ?? []).map((c) => (
            <li key={c.id} className="flex items-center gap-3 rounded border px-3 py-2">
              <span>
                第{c.chapterNo}章 {c.title}
              </span>
              <span
                className={`rounded px-2 py-0.5 text-xs ${
                  c.status === 'done'
                    ? 'bg-green-100 text-green-700'
                    : c.status === 'needs_human'
                      ? 'bg-orange-100 text-orange-700'
                      : 'bg-gray-100 text-gray-600'
                }`}
              >
                {c.status}
              </span>
              <button className="ml-auto text-sm text-blue-600" onClick={() => void api.generateChapter(bookId, c.chapterNo).then(() => setMsg(`第${c.chapterNo}章已入队`))}>
                生成
              </button>
              <Link className="text-sm text-blue-600" to={`/books/${bookId}/chapters/${c.chapterNo}`}>
                阅读
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-6">
        <h2 className="font-semibold">蓝图编辑</h2>
        <div className="mt-2 flex items-center gap-2">
          <label className="text-sm">
            章号
            <input
              type="number"
              min={1}
              className="ml-2 w-20 rounded border px-2 py-1"
              value={chapterNo}
              onChange={(e) => setChapterNo(Number(e.target.value))}
            />
          </label>
          <button className="rounded bg-blue-600 px-4 py-1.5 text-white" onClick={saveBlueprint}>
            保存蓝图
          </button>
          <button className="rounded bg-gray-200 px-4 py-1.5" onClick={generate}>
            生成本章
          </button>
        </div>
        <textarea
          className="mt-2 h-72 w-full rounded border p-3 font-mono text-xs"
          value={blueprintText}
          onChange={(e) => setBlueprintText(e.target.value)}
        />
        {msg && <p className="mt-2 text-sm text-gray-600">{msg}</p>}
      </section>
    </main>
  );
}
