import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import ImitationProfilesSection from './ImitationProfilesSection';
import type { StyleProfileDto } from '@inkforge/shared';

export default function StyleProfilesSection() {
  const { data: profiles, refetch } = useQuery({ queryKey: ['style-profiles'], queryFn: api.listStyleProfiles, refetchInterval: 5000 });
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const distill = async () => {
    setMsg('');
    setBusy(true);
    try {
      const r = await api.distillStyle({ name: name.trim(), text });
      setMsg(`蒸馏完成：档案 ${r.profileId}`);
      setName('');
      setText('');
      void refetch();
    } catch (e) {
      setMsg(`蒸馏失败：${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-10">
      <h2 className="text-xl font-bold">风格档案</h2>

      <section className="mt-6">
        <h2 className="font-semibold">档案列表</h2>
        <ul className="mt-2 space-y-2">
          {(profiles ?? []).map((p: StyleProfileDto) => (
            <li key={p.id} className="rounded border px-4 py-3">
              <div className="font-medium">{p.name}</div>
              <div className="mt-1 text-xs text-gray-500">
                v{p.version} · {new Date(p.createdAt).toLocaleString()} · 句长中位数 {p.metrics.medianSentenceLen ?? '—'}
              </div>
            </li>
          ))}
          {(profiles ?? []).length === 0 && <li className="text-sm text-gray-500">暂无档案，先用下方表单蒸馏一个。</li>}
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="font-semibold">蒸馏新档案</h2>
        <div className="mt-2 space-y-2">
          <input className="w-full rounded border px-3 py-2" placeholder="档案名称" value={name} onChange={(e) => setName(e.target.value)} />
          <textarea
            className="w-full rounded border px-3 py-2 text-sm"
            placeholder="粘贴风格样本正文（去空白后需 ≥200 字）"
            rows={10}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50" disabled={busy} onClick={distill}>
            蒸馏
          </button>
        </div>
        {msg && <p className="mt-2 text-sm text-gray-700">{msg}</p>}
      </section>

      <ImitationProfilesSection />
    </section>
  );
}
