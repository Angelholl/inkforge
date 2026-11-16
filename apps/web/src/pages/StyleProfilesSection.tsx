import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, apiErrorBody, apiErrorText } from '../api/client';
import { Button } from '../components/ui';
import { STYLE_AXES, STYLE_DIMENSIONS, type StyleAnalysisDto, type StyleProfileDto } from '@inkforge/shared';
import ImitationProfilesSection from './ImitationProfilesSection';
import BookSamplePicker from './BookSamplePicker';

type Phase = 'form' | 'preview';

/** 蒸馏后台轮询间隔（B5）：首查立即执行，之后按此间隔追进度。 */
const DISTILL_POLL_MS = 2000;
const STAGE_LABEL: Record<string, string> = { sampling: '采样中', analyzing: '分析中' };

/** 蒸馏三态流（确认门，DEC-2026-1115-04 #7）：表单 → 预览编辑（七维/六轴/规则可改）→ 确认入库 → 列表。 */
export default function StyleProfilesSection() {
  const { data: profiles, refetch } = useQuery({ queryKey: ['style-profiles'], queryFn: api.listStyleProfiles, refetchInterval: 5000 });
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [maxSegments, setMaxSegments] = useState('');
  const [temperature, setTemperature] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  // B5 重蒸进行中的档案 id（meta 行按钮 loading 用；busy 仍是全局互斥）
  const [redistillingId, setRedistillingId] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [phase, setPhase] = useState<Phase>('form');
  const [draft, setDraft] = useState<DistillDraftState | null>(null);
  const [openVersions, setOpenVersions] = useState<string | null>(null);
  const [versionMap, setVersionMap] = useState<Record<string, Array<{ id: string; version: number; createdAt: string; selfScore?: number }>>>({});
  // L2 两步确认：待确认删除的档案 id（B4 裁决②）
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    // 卸载清轮询定时器（B5），避免组件没了还在打 GET job
    return () => {
      if (pollRef.current !== null) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, []);

  // 轮询至终态；done 用 draftName+sourceText（result 未带则退回表单原文）组装草稿——重蒸场景表单为空，全靠回灌
  const pollJob = (jobId: string, draftName: string, fallbackText: string): Promise<void> =>
    new Promise((resolve) => {
      const stop = (): void => {
        if (pollRef.current !== null) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      };
      stop();
      let queryFails = 0;
      const tick = (): void => {
        void (async () => {
          try {
            const job = await api.getDistillJob(jobId);
            queryFails = 0;
            if (job.status === 'done' && job.result) {
              stop();
              setDraft({
                analysis: job.result.analysis,
                samples: job.result.samples,
                name: draftName,
                sourceText: job.result.sourceText ?? fallbackText,
              });
              setPhase('preview');
              setMsg('蒸馏完成（草稿未入库），可编辑后点「确认入库」');
              resolve();
            } else if (job.status === 'failed') {
              stop();
              setMsg(`蒸馏失败：${job.error ?? '未知原因'}`);
              resolve();
            } else {
              const label = STAGE_LABEL[job.stage] ?? '';
              setMsg(label !== '' ? `蒸馏中（${job.progress}%）· ${label}` : `蒸馏中（${job.progress}%）`);
            }
          } catch {
            // 单次查询失败容忍（网络抖动），连续 3 次判失败退出，避免无限轮询
            queryFails += 1;
            if (queryFails >= 3) {
              stop();
              setMsg('蒸馏失败：进度查询连续失败，请稍后重试');
              resolve();
            }
          }
        })();
      };
      tick();
      pollRef.current = setInterval(tick, DISTILL_POLL_MS);
    });

  const distill = async (): Promise<void> => {
    setMsg('');
    setBusy(true);
    try {
      const { jobId } = await api.distillStyle({
        name: name.trim(),
        text,
        ...(maxSegments.trim() !== '' ? { maxSegments: Number(maxSegments) } : {}),
        ...(temperature.trim() !== '' ? { temperature: Number(temperature) } : {}),
      });
      await pollJob(jobId, name.trim(), text);
    } catch (e) {
      setMsg(`蒸馏失败：${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  // 重新蒸馏（B5）：服务端用 style_sources 留存的原文，表单无需有东西；409（原文未留存）显服务端文案
  const redistill = async (p: StyleProfileDto): Promise<void> => {
    setMsg('');
    setBusy(true);
    setRedistillingId(p.id);
    try {
      const { jobId } = await api.redistillStyle(p.id);
      await pollJob(jobId, p.name, '');
    } catch (e) {
      setMsg(apiErrorText(e));
    } finally {
      setBusy(false);
      setRedistillingId(null);
    }
  };

  const create = async () => {
    if (!draft) return;
    setBusy(true);
    try {
      // 名称/原文一律取草稿自带：重蒸场景表单为空，原文靠 result.sourceText 回灌才保证同 hash version+1
      const r = await api.createStyleProfile({ name: draft.name, text: draft.sourceText, analysis: draft.analysis, samples: draft.samples });
      setMsg(`档案已入库：${draft.name} v${r.version}`);
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

  const removeProfile = async (profileId: string): Promise<void> => {
    setDeleting(true);
    try {
      await api.deleteStyleProfile(profileId);
      setMsg('档案已删除');
      setConfirmingDeleteId(null);
      void refetch();
    } catch (e) {
      // 409 附带绑定书列表：优先用它拼人话，其余走 error 字段
      let text = apiErrorText(e);
      try {
        const body = JSON.parse(apiErrorBody(e)) as { books?: Array<{ id: string; title?: string }> };
        if (Array.isArray(body.books) && body.books.length > 0) {
          text = `无法删除，已被绑定：${body.books.map((b) => b.title ?? b.id).join('、')}`;
        }
      } catch {
        /* 非 JSON 响应体：沿用 apiErrorText 的兜底 */
      }
      setMsg(text);
      setConfirmingDeleteId(null);
    } finally {
      setDeleting(false);
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
              <div className="mt-1 flex items-center gap-3 text-xs text-muted">
                <span className="min-w-0">
                  v{p.version} · {new Date(p.createdAt).toLocaleString()} · 句长中位数 {p.metrics.medianSentenceLen ?? '—'}
                  {typeof p.metrics.selfScore === 'number' ? ` · 自评 ${p.metrics.selfScore}/5` : ''}
                </span>
                <Button
                  variant="quiet"
                  tone="primary"
                  size="sm"
                  className="ml-auto"
                  disabled={busy}
                  loading={redistillingId === p.id}
                  onClick={() => void redistill(p)}
                >
                  重新蒸馏
                </Button>
                <Button variant="quiet" size="sm" onClick={() => void toggleVersions(p.id)}>
                  {openVersions === p.id ? '收起版本' : '版本'}
                </Button>
                {confirmingDeleteId === p.id ? (
                  <>
                    <span className="text-danger text-xs">删除该档案行不影响已绑定书的 persona 快照；仍被书绑定的档案不可删。</span>
                    <Button variant="danger" size="sm" solid loading={deleting} onClick={() => void removeProfile(p.id)}>
                      确认删除
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => setConfirmingDeleteId(null)}>
                      取消
                    </Button>
                  </>
                ) : (
                  <Button variant="quiet" tone="danger" size="sm" onClick={() => setConfirmingDeleteId(p.id)}>
                    删除
                  </Button>
                )}
              </div>
              {openVersions === p.id && (
                <ul className="mt-2 ml-4 space-y-1 border-l pl-3 text-xs text-muted">
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
          {(profiles ?? []).length === 0 && <li className="text-sm text-muted">暂无档案，先用下方表单蒸馏一个。</li>}
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
            <input
              type="file"
              accept=".txt,.md"
              aria-label="导入样本文件"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const reader = new FileReader();
                reader.onload = () => setText(String(reader.result ?? ''));
                reader.readAsText(f);
              }}
            />
            <BookSamplePicker onImport={setText} />
            <div className="flex gap-2">
              <input type="number" className="w-40 rounded border px-3 py-2" aria-label="采样段数（4-20，留空默认）"
                min={4} max={20} placeholder="采样段数（4-20）" value={maxSegments} onChange={(e) => setMaxSegments(e.target.value)} />
              <input type="number" className="w-40 rounded border px-3 py-2" aria-label="采样温度（0-1，留空默认）"
                min={0} max={1} step="0.1" placeholder="采样温度（0-1）" value={temperature} onChange={(e) => setTemperature(e.target.value)} />
            </div>
            <Button variant="primary" size="md" loading={busy} onClick={() => void distill()}>
              蒸馏
            </Button>
          </div>
        ) : (
          draft && (
            <div className="mt-2 space-y-3 rounded border bg-bg p-3">
              <h3 className="text-sm font-semibold">草稿预览编辑（未入库）</h3>
              <div>
                <div className="text-sm font-medium">七维</div>
                {STYLE_DIMENSIONS.map((dim) => (
                  <label key={dim} className="mt-1 flex items-center gap-2 text-xs">
                    <span className="w-16 shrink-0 text-muted">{dim}</span>
                    <input className="flex-1 rounded border px-2 py-1" aria-label={`维度-${dim}`} value={draft.analysis.dims[dim] ?? ''} onChange={(e) => setDim(dim, e.target.value)} />
                  </label>
                ))}
              </div>
              <div>
                <div className="text-sm font-medium">六轴（0-100）</div>
                <div className="mt-1 grid grid-cols-3 gap-2">
                  {STYLE_AXES.map((axis) => (
                    <label key={axis} className="flex items-center gap-1 text-xs">
                      <span className="w-16 shrink-0 text-muted">{axis}</span>
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
                <Button variant="primary" size="sm" disabled={busy} onClick={() => void create()}>
                  确认入库
                </Button>
                <Button variant="secondary" size="sm" disabled={busy} onClick={discard}>
                  放弃
                </Button>
              </div>
            </div>
          )
        )}
        {msg && <p className="mt-2 text-sm text-ink">{msg}</p>}
      </section>

      <ImitationProfilesSection />
    </section>
  );
}

interface DistillDraftState {
  analysis: StyleAnalysisDto;
  samples: string[];
  /** 确认入库用名称：新蒸=表单名，重蒸=档案名 */
  name: string;
  /** 确认入库用原文：重蒸靠 job result.sourceText 回灌（表单里没有），同 hash 才能算 version+1 */
  sourceText: string;
}
