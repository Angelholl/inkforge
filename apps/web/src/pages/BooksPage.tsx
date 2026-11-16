import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { api } from '../api/client';
import { Badge, Button, Card, Chip } from '../components/ui';
import type { BookDto } from '@inkforge/shared';

/** 书架（D1）：卡片网格 + 流程 chip 条（设定/大纲就绪态）；删除两步确认沿用。 */
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
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="text-2xl font-bold">书架</h1>
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(books ?? []).map((b: BookDto) => (
          <Card key={b.id} className="flex flex-col gap-2">
            <div className="flex items-start gap-2">
              <Link to={`/books/${b.id}`} className="font-semibold text-primary-strong hover:underline">
                {b.title}
              </Link>
              <span className="ml-auto text-xs text-faint">{b.createdAt.slice(0, 19).replace('T', ' ')}</span>
            </div>
            {b.description && <p className="line-clamp-2 text-xs text-muted">{b.description}</p>}
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
                <Link to={`/books/${b.id}`} className="text-xs text-primary-strong hover:underline">
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
        <p className="mt-6 text-sm text-muted">
          还没有书。去 <Link to="/continue" className="text-primary-strong">续写向导</Link> 建第一本。
        </p>
      )}
      {books && books.length > 0 && (
        <p className="mt-6 flex items-center gap-2 text-xs text-faint">
          共 {books.length} 本 · 流程 <Badge tone="muted">世界观 → 人物 → 蓝图 → 生成 → 校对</Badge>
        </p>
      )}
    </main>
  );
}
