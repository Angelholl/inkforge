import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';

const MAX_CHAPTERS = 20;

/** 书架选书带章采样（规格钉 4/5/6）：命令式逐章取 current 版本拼接，经 onImport 灌入父级样本框。 */
export default function BookSamplePicker({ onImport }: { onImport: (text: string) => void }) {
  const [open, setOpen] = useState(false);
  const [bookId, setBookId] = useState('');
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [error, setError] = useState('');

  const { data: books } = useQuery({ queryKey: ['books'], queryFn: api.listBooks, enabled: open });
  const { data: book } = useQuery({
    queryKey: ['book', bookId],
    queryFn: () => api.getBook(bookId),
    enabled: open && bookId !== '',
  });

  const chapters = [...(book?.chapters ?? [])].sort((a, b) => a.chapterNo - b.chapterNo);
  const atLimit = checked.size >= MAX_CHAPTERS;

  const toggle = (no: number): void => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(no)) next.delete(no);
      else next.add(no);
      return next;
    });
  };

  const importChapters = async (): Promise<void> => {
    try {
      const blocks: string[] = [];
      for (const no of [...checked].sort((a, b) => a - b)) {
        const c = chapters.find((ch) => ch.chapterNo === no);
        if (!c) continue;
        const versions = await api.listVersions(bookId, no);
        if (versions.length === 0) continue;
        const current = versions.find((v) => v.id === c.currentVersionId) ?? versions[0];
        blocks.push(`【第${no}章 ${c.title}】\n${current.content}`);
      }
      onImport(blocks.join('\n\n'));
      setOpen(false);
      setChecked(new Set());
      setBookId('');
      setError('');
    } catch {
      setError('章节导入失败，请重试');
    }
  };

  if (!open) {
    return (
      <button className="rounded border px-4 py-2 text-sm" onClick={() => setOpen(true)}>
        从书架选书
      </button>
    );
  }

  return (
    <div className="mt-2 space-y-2 rounded border p-3">
      {(books ?? []).length === 0 ? (
        <p className="text-sm text-muted">书架暂无书籍</p>
      ) : (
        <select className="w-full rounded border px-3 py-2" aria-label="选择书籍" value={bookId} onChange={(e) => { setBookId(e.target.value); setChecked(new Set()); }}>
          <option value="">选择一本书…</option>
          {(books ?? []).map((b) => (
            <option key={b.id} value={b.id}>
              {b.title}
            </option>
          ))}
        </select>
      )}
      <ul className="max-h-64 space-y-1 overflow-auto">
        {chapters.map((c) => (
          <li key={c.chapterNo}>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                aria-label={`选择第${c.chapterNo}章 ${c.title}`}
                checked={checked.has(c.chapterNo)}
                disabled={atLimit && !checked.has(c.chapterNo)}
                onChange={() => toggle(c.chapterNo)}
              />
              第{c.chapterNo}章 {c.title}
            </label>
          </li>
        ))}
      </ul>
      {atLimit && <p className="text-sm text-muted">最多可选 20 章（对齐采样基准）</p>}
      <button className="rounded bg-primary px-4 py-2 text-sm text-white disabled:opacity-50" disabled={checked.size === 0} onClick={() => void importChapters()}>
        导入所选 {checked.size} 章
      </button>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
