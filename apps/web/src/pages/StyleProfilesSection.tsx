import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { STYLE_AXES, STYLE_DIMENSIONS, type StyleAnalysisDto, type StyleProfileDto } from '@inkforge/shared';
import ImitationProfilesSection from './ImitationProfilesSection';

type Phase = 'form' | 'preview';

/** 蒸馏三态流（确认门，DEC-2026-1115-04 #7）：表单 → 预览编辑（七维/六轴/规则可改）→ 确认入库 → 列表。 */
export default function StyleProfilesSection() {
  const { data: profiles, refetch } = useQuery({ queryKey: ['style-profiles'], queryFn: api.listStyleProfiles, refetchInterval: 5000 });
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<Phase>('form');
  const [draft, setDraft] = useState<DistillDraftState | null>(null);
  const [openVersions, setOpenVersions] = useState<string | null>(null);
  const [versionMap, setVersionMap] = useState<Record<string, Array<{ id: string; version: number; createdAt: string; selfScore?: number }>>>({});

  const distill = async () => {
    setMsg('');
    setBusy(true);
    try {
      const r = await api.distillStyle({ name: name.trim(), text });
      setDraft({ analysis: r.draft.analysis, samples: r.draft.samples });
      setPhase('preview');
      setMsg('蒸馏完成（草稿未入库），可编辑后点「确认入库」');
    } catch (e) {
      setMsg(`蒸馏失败：${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    if (!draft) return;
    setBusy(true);
    try {
      const r = await api.createStyleProfile({ name: name.trim(), text, analysis: draft.analysis, samples: draft.samples });
      setMsg(`档案已入库：${name.trim()} v${r.version}`);
      setDraft(null);
      setPhase('form');
      setName('');
      setText('');
      void refetch();
    } catch (e) {
      setMsg(`入库失败：${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const discard = (): void => {
    setDraft(null);
    setPhase('form');
    setMsg('已放弃草稿');
  };

  const toggleVersions = async (id: string): Promise<void> => {
    if (openVersions === id) {
      setOpenVersions(null);
      return;
    }
    setOpenVersions(id);
    try {
      const rows = await api.listStyleProfileVersions(id);
      setVersionMap((m) => ({ ...m, [id]: rows }));
    } catch (e) {
      setMsg(`版本加载失败：${(e as Error).message}`);
    }
  };

  // 不可变编辑
  const setDim = (dim: string, v: string): void =>
    setDraft((d) => (d ? { ...d, analysis: { ...d.analysis, dims: { ...d.analysis.dims, [dim]: v } } } : d));
  const setAxis = (axis: string, v: number): void =>
    setDraft((d) => (d ? { ...d, analysis: { ...d.analysis, axes: { ...d.analysis.axes, [axis]: v } } } : d));
  const setRules = (v: string): void =>
    setDraft((d) => (d ? { ...d, analysis: { ...d.analysis, rules: v.split('\n').map((s) => s.trim()).filter((s) => s !== '') } } : d));
  // 术语编辑：每行「术语：说明」
  const setTerms = (v: string): void =>
    setDraft((d) =>
      d
        ? {
            ...d,
            analysis: {
              ...d.analysis,
              terms: v
                .split('\n')
                .map((s) => s.trim())
                .filter((s) => s !== '')
                .map((line) => {
                  const i = line.search(/[：:]/);
                  return i > 0 ? { term: line.slice(0, i).trim(), note: line.slice(i + 1).trim() } : { term: line, note: '' };
                }),
            },
          }
        : d,
    );

  return (
    <section className="mt-10">
      <h2 className="text-xl font-bold">风格档案</h2>

      <section className="mt-6">
        <h2 className="font-semibold">档案列表</h2>
        <ul className="mt-2 space-y-2">
          {(profiles ?? []).map((p: StyleProfileDto) => (
            <li key={p.id} className="rounded border px-4 py-3">
              <div className="font-medium">{p.name}</div>
              <div className="mt-1 flex items-center gap-3 text-xs text-gray-500">
                <span>
                  v{p.version} · {new Date(p.createdAt).toLocaleString()} · 句长中位数 {p.metrics.medianSentenceLen ?? '—'}
                  {typeof p.metrics.selfScore === 'number' ? ` · 自评 ${p.metrics.selfScore}/5` : ''}
                </span>
                <button className="ml-auto text-blue-600" onClick={() => void toggleVersions(p.id)}>
                  {openVersions === p.id ? '收起版本' : '版本'}
                </button>
              </div>
              {openVersions === p.id && (
                <ul className="mt-2 ml-4 space-y-1 border-l pl-3 text-xs text-gray-600">
                  {(versionMap[p.id] ?? []).map((v) => (
                    <li key={v.id}>
                      v{v.version} · {new Date(v.createdAt).toLocaleString()}
                      {typeof v.selfScore === 'number' ? ` · 自评 ${v.selfScore}/5` : ''}
                    </li>
                  ))}
                  {(versionMap[p.id] ?? []).length === 0 && <li>加载中…</li>}
                </ul>
              )}
            </li>
          ))}
          {(profiles ?? []).length === 0 && <li className="text-sm text-gray-500">暂无档案，先用下方表单蒸馏一个。</li>}
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="font-semibold">蒸馏新档案（蒸馏 → 预览编辑 → 确认入库）</h2>
        {phase === 'form' ? (
          <div className="mt-2 space-y-2">
            <input className="w-full rounded border px-3 py-2" placeholder="档案名称" value={name} onChange={(e) => setName(e.target.value)} />
            <textarea
              className="w-full rounded border px-3 py-2 text-sm"
              placeholder="粘贴风格样本正文（去空白后需 ≥200 字）"
              rows={10}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <button className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50" disabled={busy} onClick={() => void distill()}>
              蒸馏
            </button>
          </div>
        ) : (
          draft && (
            <div className="mt-2 space-y-3 rounded border bg-gray-50 p-3">
              <h3 className="text-sm font-semibold">草稿预览编辑（未入库）</h3>
              <div>
                <div className="text-sm font-medium">七维</div>
                {STYLE_DIMENSIONS.map((dim) => (
                  <label key={dim} className="mt-1 flex items-center gap-2 text-xs">
                    <span className="w-16 shrink-0 text-gray-600">{dim}</span>
                    <input className="flex-1 rounded border px-2 py-1" aria-label={`维度-${dim}`} value={draft.analysis.dims[dim] ?? ''} onChange={(e) => setDim(dim, e.target.value)} />
                  </label>
                ))}
              </div>
              <div>
                <div className="text-sm font-medium">六轴（0-100）</div>
                <div className="mt-1 grid grid-cols-3 gap-2">
                  {STYLE_AXES.map((axis) => (
                    <label key={axis} className="flex items-center gap-1 text-xs">
                      <span className="w-16 shrink-0 text-gray-600">{axis}</span>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        aria-label={`轴-${axis}`}
                        className="w-16 rounded border px-1 py-1"
                        value={draft.analysis.axes[axis] ?? 0}
                        onChange={(e) => setAxis(axis, Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
                      />
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-sm font-medium">规则（每行一条）</div>
                <textarea
                  className="mt-1 w-full rounded border px-2 py-1 text-xs"
                  rows={4}
                  aria-label="规则编辑"
                  value={draft.analysis.rules.join('\n')}
                  onChange={(e) => setRules(e.target.value)}
                />
              </div>
              <div>
                <div className="text-sm font-medium">术语表（每行「术语：说明」）</div>
                <textarea
                  className="mt-1 w-full rounded border px-2 py-1 text-xs"
                  rows={3}
                  aria-label="术语编辑"
                  value={(draft.analysis.terms ?? []).map((t) => `${t.term}：${t.note}`).join('\n')}
                  onChange={(e) => setTerms(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <button className="rounded bg-blue-600 px-4 py-1.5 text-sm text-white disabled:opacity-50" disabled={busy} onClick={() => void create()}>
                  确认入库
                </button>
                <button className="rounded bg-gray-200 px-4 py-1.5 text-sm" disabled={busy} onClick={discard}>
                  放弃
                </button>
              </div>
            </div>
          )
        )}
        {msg && <p className="mt-2 text-sm text-gray-700">{msg}</p>}
      </section>

      <ImitationProfilesSection />
    </section>
  );
}

interface DistillDraftState {
  analysis: StyleAnalysisDto;
  samples: string[];
}
