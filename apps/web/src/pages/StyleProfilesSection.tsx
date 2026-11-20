import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, apiErrorBody, apiErrorText } from '../api/client';
import { Button } from '../components/ui';
import { inputBase, inputNarrow, textareaBase } from '../components/Field';
import { ProfilesListShell } from '../components/DistillProfilesShell';
import { STYLE_AXES, STYLE_DIMENSIONS, type StyleAnalysisDto, type StyleProfileDetailDto, type StyleProfileDto } from '@inkforge/shared';
import ImitationProfilesSection from './ImitationProfilesSection';
import BookSamplePicker from './BookSamplePicker';
import { decodeTextFile } from './NewBookPage';

type Phase = 'form' | 'preview';

/** 蒸馏后台轮询间隔（B5）：首查立即执行，之后按此间隔追进度。 */
const DISTILL_POLL_MS = 2000;
const STAGE_LABEL: Record<string, string> = { sampling: '采样中', analyzing: '分析中' };

/** 蒸馏三态流（确认门，DEC-2026-1115-04 #7）：表单 → 预览编辑（七维/六轴/规则可改）→ 确认入库 → 列表。 */
export default function StyleProfilesSection() {
  const { data: profiles, refetch } = useQuery({ queryKey: ['style-profiles'], queryFn: api.listStyleProfiles, refetchInterval: 5000 });
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  // 文件选择回显（owner 复测反馈：蒸馏面板 file input 漏改，对齐 NewBookPage 虚线底框+编码探测）
  const [fileInfo, setFileInfo] = useState('');
  // 采样参数预填服务端默认（段数 20 = sample.ts；温度 0.3 = analysis.ts），不再裸露空框
  const [maxSegments, setMaxSegments] = useState('20');
  const [temperature, setTemperature] = useState('0.3');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  // B5 重蒸进行中的档案 id（meta 行按钮 loading 用；busy 仍是全局互斥）
  const [redistillingId, setRedistillingId] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [phase, setPhase] = useState<Phase>('form');
  const [draft, setDraft] = useState<DistillDraftState | null>(null);
  const [openVersions, setOpenVersions] = useState<string | null>(null);
  // 查看细节（DEC-2026-1120-08）：与 openVersions 同型互斥；详情懒加载，status=loading/error/ok
  const [openDetail, setOpenDetail] = useState<string | null>(null);
  const [detailMap, setDetailMap] = useState<Record<string, { status: 'loading' | 'error' | 'ok'; detail?: StyleProfileDetailDto }>>({});
  const [versionMap, setVersionMap] = useState<Record<string, Array<{ id: string; version: number; createdAt: string; selfScore?: number }>>>({});
  // L2 两步确认状态由 ProfilesListShell 持有；此处只留确认按钮的 loading 态
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
    // 前置校验（owner 反馈：空名直发 400 且报错不可读）
    if (name.trim() === '') {
      setMsg('请先填写档案名称');
      return;
    }
    if (text.replace(/\s/g, '').length < 200) {
      setMsg(`样本正文去空白后不足 200 字（当前 ${text.replace(/\s/g, '').length} 字），请粘贴或导入更多正文`);
      return;
    }
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

  // 查看细节：懒加载 getStyleProfile；失败保留 error 态，重试按钮重新拉取
  const toggleDetail = async (id: string): Promise<void> => {
    if (openDetail === id) {
      setOpenDetail(null);
      return;
    }
    setOpenDetail(id);
    setDetailMap((m) => ({ ...m, [id]: { status: 'loading' } }));
    try {
      const detail = await api.getStyleProfile(id);
      setDetailMap((m) => ({ ...m, [id]: { status: 'ok', detail } }));
    } catch (e) {
      setMsg(`详情加载失败：${apiErrorText(e)}`);
      setDetailMap((m) => ({ ...m, [id]: { status: 'error' } }));
    }
  };

  // 详情失败重试：保持面板展开原地重拉（不经 toggleDetail，避免再点一次被当成「收起」）
  const retryDetail = async (id: string): Promise<void> => {
    setDetailMap((m) => ({ ...m, [id]: { status: 'loading' } }));
    try {
      const detail = await api.getStyleProfile(id);
      setDetailMap((m) => ({ ...m, [id]: { status: 'ok', detail } }));
    } catch (e) {
      setMsg(`详情加载失败：${apiErrorText(e)}`);
      setDetailMap((m) => ({ ...m, [id]: { status: 'error' } }));
    }
  };

  const removeProfile = async (profileId: string, clearConfirm: () => void): Promise<void> => {
    setDeleting(true);
    try {
      await api.deleteStyleProfile(profileId);
      setMsg('档案已删除');
      clearConfirm();
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
      clearConfirm();
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
              terms: parseTermLines(v),
            },
          }
        : d,
    );
  // 高频词编辑（DEC-2026-1120-06）：每行「词组：说明」，仅展示编辑，不注入草稿/润色管线
  const setFreqTerms = (v: string): void =>
    setDraft((d) =>
      d
        ? {
            ...d,
            analysis: {
              ...d.analysis,
              freqTerms: parseTermLines(v),
            },
          }
        : d,
    );

  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold">风格档案</h2>

      <ProfilesListShell
        profiles={profiles ?? []}
        listTitle="档案列表"
        empty={{ title: '还没有风格档案', hint: '粘贴或导入 ≥200 字风格样本，从下方表单蒸馏第一个。' }}
        sectionClassName="mt-6"
        onDelete={(id, _label, clearConfirm) => removeProfile(id, clearConfirm)}
        renderCard={(p: StyleProfileDto, ctx) => (
          <li className="rounded-card border border-line bg-surface px-4 py-3">
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
              <Button variant="quiet" size="sm" onClick={() => void toggleDetail(p.id)}>
                {openDetail === p.id ? '收起' : '查看'}
              </Button>
              {ctx.confirming ? (
                <>
                  <span className="text-danger text-xs">删除该档案行不影响已绑定书的 persona 快照；仍被书绑定的档案不可删。</span>
                  <Button variant="danger" size="sm" solid loading={deleting} onClick={ctx.confirmDelete}>
                    确认删除
                  </Button>
                  <Button variant="secondary" size="sm" onClick={ctx.cancelDelete}>
                    取消
                  </Button>
                </>
              ) : (
                <Button variant="quiet" tone="danger" size="sm" onClick={ctx.askDelete}>
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
            {openDetail === p.id && (
              <div className="mt-2 rounded border border-line bg-bg p-3 text-xs">
                {(detailMap[p.id]?.status ?? 'loading') === 'loading' && <p className="text-muted">加载中…</p>}
                {detailMap[p.id]?.status === 'error' && (
                  <div className="flex items-center gap-2">
                    <span className="text-danger">详情加载失败</span>
                    <Button variant="secondary" size="sm" onClick={() => void retryDetail(p.id)}>
                      重试
                    </Button>
                  </div>
                )}
                {detailMap[p.id]?.status === 'ok' && detailMap[p.id].detail && (
                  <div className="space-y-3">
                    <div>
                      <div className="text-sm font-medium">七维</div>
                      {STYLE_DIMENSIONS.map((dim) => (
                        <p key={dim} className="mt-1 text-muted">
                          <span className="text-ink">{dim}</span>：{detailMap[p.id].detail!.analysis.dims[dim] || '—'}
                        </p>
                      ))}
                    </div>
                    <div>
                      <div className="text-sm font-medium">六轴（0-100）</div>
                      <p className="mt-1 text-muted">
                        {STYLE_AXES.map((axis) => `${axis} ${detailMap[p.id].detail!.analysis.axes[axis] ?? 0}`).join(' · ')}
                      </p>
                    </div>
                    <div>
                      <div className="text-sm font-medium">规则</div>
                      <ul className="mt-1 ml-4 list-disc text-muted">
                        {detailMap[p.id].detail!.analysis.rules.map((r, i) => (
                          <li key={i}>{r}</li>
                        ))}
                        {detailMap[p.id].detail!.analysis.rules.length === 0 && <li>（无）</li>}
                      </ul>
                    </div>
                    <div>
                      <div className="text-sm font-medium">术语表</div>
                      {(detailMap[p.id].detail!.analysis.terms ?? []).length === 0 ? (
                        <p className="mt-1 text-muted">（无）</p>
                      ) : (
                        (detailMap[p.id].detail!.analysis.terms ?? []).map((t, i) => (
                          <p key={i} className="mt-1 text-muted">
                            <span className="text-ink">{t.term}</span>：{t.note}
                          </p>
                        ))
                      )}
                    </div>
                    <div>
                      <div className="text-sm font-medium">高频词</div>
                      {(detailMap[p.id].detail!.analysis.freqTerms ?? []).length === 0 ? (
                        <p className="mt-1 text-muted">（无）</p>
                      ) : (
                        (detailMap[p.id].detail!.analysis.freqTerms ?? []).map((t, i) => (
                          <p key={i} className="mt-1 text-muted">
                            <span className="text-ink">{t.term}</span>：{t.note}
                          </p>
                        ))
                      )}
                    </div>
                    {detailMap[p.id].detail!.evaluation && detailMap[p.id].detail!.evaluation!.length > 0 && (
                      <div>
                        <div className="text-sm font-medium">自评</div>
                        {detailMap[p.id].detail!.evaluation!.map((e, i) => (
                          <p key={i} className="mt-1 text-muted">
                            SCORE {e.score}/5 · REASON：{e.reason}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </li>
        )}
      />

      <section className="mt-8">
        <h2 className="text-base font-semibold">蒸馏新档案（蒸馏 → 预览编辑 → 确认入库）</h2>
        {phase === 'form' ? (
          <div className="mt-2 space-y-2">
            <input className={inputBase} placeholder="档案名称" value={name} onChange={(e) => setName(e.target.value)} />
            <textarea
              className={textareaBase}
              placeholder="粘贴风格样本正文（去空白后需 ≥200 字）"
              rows={10}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            {/* 文件选择区（owner 复测反馈：原生 file input 裸奔漏改）——对齐 NewBookPage：虚线底框+文件名/编码回显 */}
            <div>
              <input
                type="file"
                id="import-sample-file"
                accept=".txt,.md"
                aria-label="导入样本文件"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const reader = new FileReader();
                  reader.onload = () => {
                    const { text: decoded, encoding } = decodeTextFile(reader.result as ArrayBuffer);
                    setText(decoded);
                    setFileInfo(`${f.name} · 已按 ${encoding} 解码（${decoded.length} 字）`);
                  };
                  reader.readAsArrayBuffer(f);
                }}
              />
              <label
                htmlFor="import-sample-file"
                className="flex cursor-pointer flex-col items-center gap-1 rounded border border-dashed border-line px-3 py-6 text-sm text-muted transition-colors hover:border-line-strong hover:bg-primary-soft/40"
              >
                <span>点击选择本地 txt / md 文件（自动识别 UTF-8 / GBK 编码）</span>
                {fileInfo && <span className="text-xs font-medium text-primary-strong">{fileInfo}</span>}
              </label>
            </div>
            <BookSamplePicker onImport={setText} />
            <p className="text-xs text-muted">采样参数（一般保持默认即可）：段数=从原文均匀抽取多少段送 AI 分析，越多越全面也越慢；温度=分析随机度，越低越稳定。</p>
            <div className="flex gap-2">
              <input type="number" className={`${inputNarrow} w-40`} aria-label="采样段数（4-20）"
                min={4} max={20} placeholder="采样段数（4-20）" value={maxSegments} onChange={(e) => setMaxSegments(e.target.value)} />
              <input type="number" className={`${inputNarrow} w-40`} aria-label="采样温度（0-1）"
                min={0} max={1} step="0.1" placeholder="采样温度（0-1）" value={temperature} onChange={(e) => setTemperature(e.target.value)} />
            </div>
            <Button variant="primary" size="md" loading={busy} onClick={() => void distill()}>
              蒸馏
            </Button>
          </div>
        ) : (
          draft && (
            <div className="mt-2 space-y-3 rounded-card border border-line bg-bg p-3">
              <h3 className="text-sm font-semibold">草稿预览编辑（未入库）</h3>
              <div>
                <div className="text-sm font-medium">七维</div>
                {STYLE_DIMENSIONS.map((dim) => (
                  <label key={dim} className="mt-1 flex items-center gap-2 text-xs">
                    <span className="w-16 shrink-0 text-muted">{dim}</span>
                    <input className={`${inputBase} flex-1`} aria-label={`维度-${dim}`} value={draft.analysis.dims[dim] ?? ''} onChange={(e) => setDim(dim, e.target.value)} />
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
                        className={`${inputNarrow} w-16`}
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
                  className={`${textareaBase} mt-1`}
                  rows={4}
                  aria-label="规则编辑"
                  value={draft.analysis.rules.join('\n')}
                  onChange={(e) => setRules(e.target.value)}
                />
              </div>
              <div>
                <div className="text-sm font-medium">术语表（每行「术语：说明」）</div>
                <textarea
                  className={`${textareaBase} mt-1`}
                  rows={3}
                  aria-label="术语编辑"
                  value={(draft.analysis.terms ?? []).map((t) => `${t.term}：${t.note}`).join('\n')}
                  onChange={(e) => setTerms(e.target.value)}
                />
              </div>
              <div>
                <div className="text-sm font-medium">高频词（每行「词组：说明」）</div>
                <textarea
                  className={`${textareaBase} mt-1`}
                  rows={3}
                  aria-label="高频词编辑"
                  value={(draft.analysis.freqTerms ?? []).map((t) => `${t.term}：${t.note}`).join('\n')}
                  onChange={(e) => setFreqTerms(e.target.value)}
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

/** 每行「词：说明」→ { term, note }（术语区/高频词区共用；无冒号整行作 term）。 */
function parseTermLines(v: string): Array<{ term: string; note: string }> {
  return v
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s !== '')
    .map((line) => {
      const i = line.search(/[：:]/);
      return i > 0 ? { term: line.slice(0, i).trim(), note: line.slice(i + 1).trim() } : { term: line, note: '' };
    });
}
