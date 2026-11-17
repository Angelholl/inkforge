import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { Button } from '../components/ui';
import { CardHeader } from '../components/Section';
import { inputNarrow } from '../components/Field';
import type { OutlineCardDto, OutlineStageDto, OutlineTreeDto, OutlineVolumeDto } from '@inkforge/shared';

const emptyCard = (seq: number): OutlineCardDto => ({ title: '新卡', body: '', seq, chapterFrom: null, chapterTo: null });
const emptyStage = (seq: number): OutlineStageDto => ({ title: '新阶段', body: '', seq, cards: [] });
const emptyVolume = (seq: number): OutlineVolumeDto => ({ title: '新卷', body: '', seq, stages: [] });

function cloneTree(tree: OutlineTreeDto): OutlineTreeDto {
  return JSON.parse(JSON.stringify(tree)) as OutlineTreeDto;
}

/** 三级大纲树分区：缩进展示 / AI 生成 draft（502 显性暴露）/ 手填兜底编辑 / 整树保存 / 偏离复核。 */
export default function OutlineTreeSection({ bookId }: { bookId: string }) {
  const { data, refetch } = useQuery({ queryKey: ['outline-tree', bookId], queryFn: () => api.getOutlineTree(bookId) });
  const saved = data?.tree ?? null;
  // 编辑态工作副本（draft）：AI 生成或「编辑」入态；保存/放弃出态，避免轮询覆盖未保存编辑
  const [draft, setDraft] = useState<OutlineTreeDto | null>(null);
  const [chapterCount, setChapterCount] = useState(12);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [report, setReport] = useState('');

  const tree = draft ?? saved;

  const suggest = async () => {
    setBusy(true);
    setMsg('');
    try {
      const r = await api.suggestOutlineTree(bookId, { chapterCount });
      setDraft(r.tree);
      setReport('');
      setMsg('AI 已生成大纲树草稿（未入库），确认后点「保存大纲树」');
    } catch (e) {
      // 502 解析失败等错误原文显性暴露，手填兜底仍可用
      setMsg(`AI 生成失败：${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!draft) return;
    setBusy(true);
    try {
      await api.putOutlineTree(bookId, draft);
      setDraft(null);
      setMsg('大纲树已保存');
      void refetch();
    } catch (e) {
      setMsg(`保存失败：${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const check = async () => {
    setBusy(true);
    setMsg('');
    setReport('');
    try {
      const r = await api.checkOutline(bookId);
      setReport(r.report);
    } catch (e) {
      setMsg(`复核失败：${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  // ── draft 树编辑操作（不可变更新）──
  const mutate = (fn: (t: OutlineTreeDto) => void): void => {
    if (!draft) return;
    const next = cloneTree(draft);
    fn(next);
    setDraft(next);
  };
  const addVolume = (): void => {
    // 手填兜底：空树态（无 draft 无 saved）也能从零建树；已存树态基于 saved 克隆进编辑态
    const base = draft ?? (saved ? cloneTree(saved) : { volumes: [] });
    setDraft({ volumes: [...base.volumes, emptyVolume(base.volumes.length + 1)] });
  };
  const addStage = (vi: number): void =>
    mutate((t) => t.volumes[vi].stages.push(emptyStage(t.volumes[vi].stages.length + 1)));
  const addCard = (vi: number, si: number): void =>
    mutate((t) => t.volumes[vi].stages[si].cards.push(emptyCard(t.volumes[vi].stages[si].cards.length + 1)));
  const removeVolume = (vi: number): void => mutate((t) => t.volumes.splice(vi, 1));
  const removeStage = (vi: number, si: number): void => mutate((t) => t.volumes[vi].stages.splice(si, 1));
  const removeCard = (vi: number, si: number, ci: number): void => mutate((t) => t.volumes[vi].stages[si].cards.splice(ci, 1));

  const inputCls = inputNarrow;

  return (
    <section className="rounded-card border border-line bg-surface">
      <CardHeader title="三级大纲树（卷 → 阶段 → 滚动卡）" />
      <div className="p-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label className="flex items-center gap-1.5 text-xs text-muted">
          总章数
          <input
            type="number"
            min={1}
            max={50}
            aria-label="大纲总章数"
            className={`${inputCls} w-20`}
            value={chapterCount}
            onChange={(e) => setChapterCount(Number(e.target.value))}
          />
        </label>
        <Button variant="primary" size="sm" disabled={busy} onClick={() => void suggest()}>
          AI 生成大纲树
        </Button>
        <Button variant="secondary" size="sm" disabled={busy} onClick={addVolume}>
          手动加卷
        </Button>
        <Button variant="secondary" size="sm" disabled={busy || !saved} onClick={() => setDraft(cloneTree(saved!))}>
          编辑已存树
        </Button>
        <Button variant="secondary" size="sm" disabled={busy || !saved} onClick={() => void check()}>
          偏离复核
        </Button>
      </div>

      {tree === null ? (
        <p className="mt-2 text-sm text-muted">尚未保存大纲树：AI 生成或手动加卷开始。</p>
      ) : (
        <div className="mt-2 space-y-1 text-sm">
          {tree.volumes.map((v, vi) => (
            <div key={vi} className="rounded-ctl border border-line px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="rounded bg-primary-soft px-1.5 text-xs text-primary-strong">卷{v.seq}</span>
                {draft ? (
                  <input aria-label="卷题" className={`flex-1 ${inputCls}`} value={v.title} onChange={(e) => mutate((t) => (t.volumes[vi].title = e.target.value))} />
                ) : (
                  <span className="font-medium">{v.title}</span>
                )}
                {draft && (
                  <>
                    <Button variant="quiet" tone="primary" size="sm" onClick={() => addStage(vi)}>
                      加阶段
                    </Button>
                    <Button variant="quiet" tone="danger" size="sm" onClick={() => removeVolume(vi)}>
                      删卷
                    </Button>
                  </>
                )}
              </div>
              {draft && (
                <textarea
                  aria-label="卷说明"
                  className={`mt-1 w-full ${inputCls}`}
                  rows={1}
                  value={v.body}
                  onChange={(e) => mutate((t) => (t.volumes[vi].body = e.target.value))}
                />
              )}
              <div className="ml-4 mt-1 space-y-1">
                {v.stages.map((s, si) => (
                  <div key={si} className="rounded border-l-2 border-line px-2 py-1">
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-bg px-1.5 text-xs text-muted">阶段{s.seq}</span>
                      {draft ? (
                        <input aria-label="阶段题" className={`flex-1 ${inputCls}`} value={s.title} onChange={(e) => mutate((t) => (t.volumes[vi].stages[si].title = e.target.value))} />
                      ) : (
                        <span>{s.title}</span>
                      )}
                      {draft && (
                        <>
                          <Button variant="quiet" tone="primary" size="sm" onClick={() => addCard(vi, si)}>
                            加卡
                          </Button>
                          <Button variant="quiet" tone="danger" size="sm" onClick={() => removeStage(vi, si)}>
                            删阶段
                          </Button>
                        </>
                      )}
                    </div>
                    {draft && (
                      <textarea
                        aria-label="阶段说明"
                        className={`mt-1 w-full ${inputCls}`}
                        rows={1}
                        value={s.body}
                        onChange={(e) => mutate((t) => (t.volumes[vi].stages[si].body = e.target.value))}
                      />
                    )}
                    <div className="ml-4 mt-1 space-y-1">
                      {s.cards.map((c, ci) => (
                        <div key={ci} className="flex flex-wrap items-center gap-2">
                          <span className="rounded bg-ok-soft px-1.5 text-xs text-ok">卡{c.seq}</span>
                          {draft ? (
                            <>
                              <input aria-label="卡题" className={`w-40 ${inputCls}`} value={c.title} onChange={(e) => mutate((t) => (t.volumes[vi].stages[si].cards[ci].title = e.target.value))} />
                              <label className="text-xs text-muted">
                                起
                                <input
                                  type="number"
                                  min={1}
                                  aria-label="卡起始章"
                                  className={`ml-1 w-14 ${inputCls}`}
                                  value={c.chapterFrom ?? ''}
                                  onChange={(e) => mutate((t) => (t.volumes[vi].stages[si].cards[ci].chapterFrom = e.target.value === '' ? null : Number(e.target.value)))}
                                />
                              </label>
                              <label className="text-xs text-muted">
                                止
                                <input
                                  type="number"
                                  min={1}
                                  aria-label="卡结束章"
                                  className={`ml-1 w-14 ${inputCls}`}
                                  value={c.chapterTo ?? ''}
                                  onChange={(e) => mutate((t) => (t.volumes[vi].stages[si].cards[ci].chapterTo = e.target.value === '' ? null : Number(e.target.value)))}
                                />
                              </label>
                              <input aria-label="卡要点" className={`flex-1 ${inputCls}`} value={c.body} onChange={(e) => mutate((t) => (t.volumes[vi].stages[si].cards[ci].body = e.target.value))} />
                              <Button variant="quiet" tone="danger" size="sm" onClick={() => removeCard(vi, si, ci)}>
                                删卡
                              </Button>
                            </>
                          ) : (
                            <span>
                              {c.chapterFrom !== null && c.chapterTo !== null ? `第${c.chapterFrom}-${c.chapterTo}章 ` : ''}
                              {c.title}
                              {c.body ? `：${c.body}` : ''}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {draft && (
        <div className="mt-2 flex gap-2">
          <Button variant="primary" size="sm" disabled={busy} onClick={() => void save()}>
            保存大纲树
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => {
              setDraft(null);
              setMsg('已放弃草稿编辑');
            }}
          >
            放弃草稿
          </Button>
        </div>
      )}

      {report && (
        <pre className="mt-2 max-h-64 overflow-auto rounded-ctl bg-console-bg p-2 text-xs text-console-1">
          {report}
        </pre>
      )}
      {msg && <p className="mt-2 text-sm text-muted">{msg}</p>}
      </div>
    </section>
  );
}
