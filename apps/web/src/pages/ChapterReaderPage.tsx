import { useState } from 'react';
import { useParams, Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api, apiErrorText } from '../api/client';
import { Button } from '../components/ui';
import { VersionQcPanel } from '../components/VersionQcPanel';
import { SelectionRewrite } from './SelectionRewrite';
import type { VersionListItemDto } from '@inkforge/shared';

export default function ChapterReaderPage() {
  const { bookId = '', chapterNo = '1' } = useParams();
  const no = Number(chapterNo);
  const { data: versionData, refetch } = useQuery({
    queryKey: ['versions', bookId, no],
    queryFn: () => api.listVersions(bookId, no),
    refetchInterval: 5000,
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const list: VersionListItemDto[] = versionData?.versions ?? [];
  const currentVersionId = versionData?.currentVersionId ?? null;
  // 回退锚 = 服务端 currentVersionId（B2 硬删后列表首项不再等价于 current）
  const current = list.find((v) => v.id === (selected ?? currentVersionId)) ?? null;
  const { data: currentFull } = useQuery({
    queryKey: ['version', current?.id],
    queryFn: () => api.getVersion(current?.id ?? ''),
    enabled: !!current,
  });

  const rollback = async () => {
    if (!current) return;
    const r = await api.rollback(current.id);
    setMsg(`已回滚到 ${r.currentVersionId.slice(0, 8)}`);
    setSelected(null);
    void refetch();
  };

  const remove = async (versionId: string): Promise<void> => {
    setDeleting(true);
    try {
      await api.deleteVersion(versionId);
      setMsg('已删除该版本（删前快照已留 -predelete-）');
      setSelected(null);
      setConfirmingDeleteId(null);
      void refetch();
    } catch (e) {
      setMsg(apiErrorText(e));
      setConfirmingDeleteId(null);
    } finally {
      setDeleting(false);
    }
  };

  const exportBook = async () => {
    const r = await api.exportBook(bookId);
    setMsg(`已导出 ${r.files.length} 个文件至 ${r.outDir}`);
  };

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <Link to={`/books/${bookId}`} className="text-sm text-muted">
        ← 返回书页
      </Link>
      <h1 className="mt-2 text-2xl font-bold">第{no}章 正文</h1>
      <div className="mt-4 flex items-center gap-2">
        <Button onClick={rollback}>
          回滚到当前所选
        </Button>
        <Button variant="primary" onClick={exportBook}>
          导出全书正文（TXT）
        </Button>
        <span className="text-xs text-muted">保存到本机 data/exports/，不自动下载</span>
      </div>
      {msg && <p className="mt-2 text-sm text-muted">{msg}</p>}

      <section className="mt-4">
        <h2 className="font-semibold">版本链（新 → 旧）</h2>
        <p className="mt-1 text-xs text-muted">
          {'图例：版本 chip 依次为 类型 · 字数 · 时间 · OVERALL 分；达标线默认 8.0 分（可在「设置 → 质量」调整）；同分即停——本轮较上一轮增益 <5% 视为无改善，停止重写并转人工。'}
        </p>
        <ul className="mt-2 flex flex-wrap items-center gap-2">
          {list.map((v) => {
            const isCurrent = v.id === currentVersionId;
            return (
              <li key={v.id} className="flex items-center gap-1">
                <Button variant="quiet" size="sm" active={current?.id === v.id} onClick={() => setSelected(v.id)}>
                  {v.kind} · {v.wordCount}字 · {v.createdAt.slice(11, 19)}
                  {v.params && (v.params as { overall?: number }).overall != null && (
                    <> · {((v.params as { overall?: number }).overall as number).toFixed(1)}分</>
                  )}
                </Button>
                {confirmingDeleteId === v.id ? (
                  <>
                    <span className="text-danger text-xs">
                      删除将从磁盘永久移除该版本正文，不可恢复（删前自动留 -predelete- 快照，同书保留最近 3 份）。
                    </span>
                    <Button variant="danger" size="sm" solid loading={deleting} onClick={() => void remove(v.id)}>
                      确认删除
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => setConfirmingDeleteId(null)}>
                      取消
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="quiet"
                    tone="danger"
                    size="sm"
                    disabled={isCurrent}
                    title={isCurrent ? '当前版本不可删除（先回滚到其他版本）' : undefined}
                    onClick={() => setConfirmingDeleteId(v.id)}
                  >
                    删除
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {current && <SelectionRewrite versionId={current.id} onCreated={() => void refetch()} />}
      <Link to={`/books/${bookId}/chapters/${no}/diff`} className="mt-4 inline-block text-sm text-primary-strong">
        查看相邻版本 diff →
      </Link>
      <article className="mt-2 whitespace-pre-wrap rounded border bg-white p-6 text-sm leading-7">
        {currentFull?.content ?? '（本章尚无版本）'}
      </article>
      {current && <VersionQcPanel versionId={current.id} />}
    </main>
  );
}
