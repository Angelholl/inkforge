import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { BookMarked, BookOpen } from 'lucide-react';
import { api } from '../api/client';
import { Button, Card, Chip } from '../components/ui';
import { EmptyState } from '../components/EmptyState';
import type { BookDto } from '@inkforge/shared';

/** 书架（DEC-2026-1118-02 松烟）：3px 墨书脊卡 + 宋体书名 + pill 流程 chip；删除两步确认沿用。 */
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
    <main className="mx-auto max-w-5xl px-8 py-8">
      <h1 className="text-xl font-semibold">书架</h1>
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(books ?? []).map((b: BookDto) => (
          <Card key={b.id} className="flex flex-col gap-2 border-l-[3px] border-l-ink/70">
            <div className="flex items-start gap-2">
              <Link to={`/books/${b.id}`} className="font-display text-lg font-semibold leading-snug text-ink hover:text-primary-strong">
                {b.title}
              </Link>
              <span className="ml-auto text-xs text-faint tabular-nums">{b.createdAt.slice(0, 19).replace('T', ' ')}</span>
            </div>
            {b.description && <p className="line-clamp-2 text-xs leading-5 text-muted">{b.description}</p>}
            <div className="flex flex-wrap gap-1">
              <Chip active={Boolean(b.description)}>世界观</Chip>
              <Chip active={Boolean(b.outline)}>大纲</Chip>
              {typeof b.styleProfileId === 'string' && <Chip active>文风</Chip>}
              {typeof b.imitationProfileId === 'string' && <Chip active>仿写</Chip>}
            </div>
            {confirmId === b.id ? (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-danger">章节/人物/运行记录一并清除，不可恢复</span>
                <Button variant="danger" size="sm" solid onClick={() => void remove(b.id)}>
                  确认删除
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setConfirmId(null)}>
                  取消
                </Button>
              </div>
            ) : (
              <div className="mt-auto flex items-center gap-2">
                <Link
                  to={`/books/${b.id}`}
                  className="inline-flex h-8 items-center gap-1.5 rounded-ctl border border-line bg-surface px-3 text-xs text-ink transition-colors hover:bg-bg"
                >
                  <BookOpen size={14} strokeWidth={1.8} aria-hidden="true" />
                  打开
                </Link>
                <Button variant="quiet" tone="danger" size="sm" className="ml-auto" onClick={() => setConfirmId(b.id)}>
                  删除
                </Button>
              </div>
            )}
          </Card>
        ))}
      </div>
      {msg && <p className="mt-4 text-sm text-danger">{msg}</p>}
      {books && books.length === 0 && (
        <div className="mt-6">
          <EmptyState
            icon={<BookMarked aria-hidden="true" />}
            title="书架还空着"
            hint={
              <>
                还没有书。去 <Link to="/continue" className="text-primary-strong hover:underline">续写向导</Link> 建第一本。
              </>
            }
          />
        </div>
      )}
      {books && books.length > 0 && (
        <p className="mt-6 text-xs text-faint">共 {books.length} 本 · 流程：世界观 → 人物 → 蓝图 → 生成 → 校对</p>
      )}
    </main>
  );
}
