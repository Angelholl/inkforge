import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import type { ForeshadowingDto } from '@inkforge/shared';

/** 伏笔分区（三小件 C2）：列表（埋设章/状态/回收章）+ 新增 + 标记回收（须带回收章）+ 删除。 */
export default function ForeshadowingsSection({ bookId }: { bookId: string }) {
  const { data, refetch } = useQuery({ queryKey: ['foreshadowings', bookId], queryFn: () => api.listForeshadowings(bookId), refetchInterval: 5000 });
  const rows = Array.isArray(data) ? data : [];
  const [description, setDescription] = useState('');
  const [plantedCh, setPlantedCh] = useState(1);
  const [resolveCh, setResolveCh] = useState<Record<string, number>>({});
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const add = async (): Promise<void> => {
    if (!description.trim()) {
      setMsg('伏笔描述不能为空');
      return;
    }
    setBusy(true);
    try {
      await api.createForeshadowing(bookId, { description: description.trim(), plantedCh });
      setDescription('');
      setMsg('伏笔已登记');
      void refetch();
    } catch (e) {
      setMsg(`登记失败：${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const resolve = async (f: ForeshadowingDto): Promise<void> => {
    const ch = resolveCh[f.id];
    if (!ch) {
      setMsg('标记回收须填回收章号');
      return;
    }
    setBusy(true);
    try {
      await api.updateForeshadowing(bookId, f.id, { status: 'resolved', resolvedCh: ch });
      setMsg(`伏笔「${f.description}」已回收于第${ch}章`);
      void refetch();
    } catch (e) {
      setMsg(`回收失败：${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (f: ForeshadowingDto): Promise<void> => {
    setBusy(true);
    try {
      await api.deleteForeshadowing(bookId, f.id);
      setMsg(`伏笔「${f.description}」已删除`);
      void refetch();
    } catch (e) {
      setMsg(`删除失败：${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const statusChip = (s: ForeshadowingDto['status']): string =>
    s === 'resolved' ? 'bg-green-100 text-green-700' : s === 'advanced' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600';

  return (
    <section className="mt-6">
      <h2 className="font-semibold">伏笔</h2>
      <ul className="mt-2 space-y-1">
        {rows.map((f) => (
          <li key={f.id} className="flex flex-wrap items-center gap-2 rounded border px-3 py-2 text-sm">
            <span className={`rounded px-2 py-0.5 text-xs ${statusChip(f.status)}`}>{f.status}</span>
            <span className="font-medium">{f.description}</span>
            <span className="text-gray-500">
              埋设于第{f.plantedCh}章{f.resolvedCh ? ` · 回收于第${f.resolvedCh}章` : ''}
            </span>
            {f.status !== 'resolved' && (
              <>
                <input
                  type="number"
                  min={1}
                  aria-label={`回收章-${f.description}`}
                  placeholder="回收章"
                  className="w-16 rounded border px-1 py-0.5 text-xs"
                  value={resolveCh[f.id] ?? ''}
                  onChange={(e) => setResolveCh({ ...resolveCh, [f.id]: Number(e.target.value) })}
                />
                <button className="text-blue-600" disabled={busy} onClick={() => void resolve(f)}>
                  标记回收
                </button>
              </>
            )}
            <button className="ml-auto text-red-600" disabled={busy} onClick={() => void remove(f)}>
              删除
            </button>
          </li>
        ))}
        {rows.length === 0 && <li className="text-sm text-gray-500">暂无伏笔登记。</li>}
      </ul>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
        <input
          className="flex-1 rounded border px-2 py-1"
          placeholder="伏笔描述（如：师父留下的铜牌来历）"
          aria-label="伏笔描述"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <label className="text-xs text-gray-500">
          埋设章
          <input
            type="number"
            min={1}
            aria-label="埋设章号"
            className="ml-1 w-16 rounded border px-1 py-1"
            value={plantedCh}
            onChange={(e) => setPlantedCh(Number(e.target.value))}
          />
        </label>
        <button className="rounded bg-gray-200 px-3 py-1" disabled={busy} onClick={() => void add()}>
          登记伏笔
        </button>
      </div>
      {msg && <p className="mt-2 text-sm text-gray-600">{msg}</p>}
    </section>
  );
}
