import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { Button } from '../components/ui';
import { inputBase, selectBase, textareaBase } from '../components/Field';
import { EmptyState } from '../components/EmptyState';
import type { SpectrumDraftDto } from '@inkforge/shared';

/** 人物光谱蒸馏分区（DEC-2026-1120-09）：analyze→预览（原型行可编辑）→确认入库→列表→绑定书。draft 不入库，确认才落档案。沿 plot 同构。 */
export default function SpectrumProfilesSection() {
  const { data: profilesData, refetch } = useQuery({ queryKey: ['spectrum-profiles'], queryFn: api.listSpectrumProfiles, refetchInterval: 5000 });
  const { data: booksData } = useQuery({ queryKey: ['books'], queryFn: api.listBooks, refetchInterval: 5000 });
  const profiles = Array.isArray(profilesData) ? profilesData : [];
  const books = Array.isArray(booksData) ? booksData : [];
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [draft, setDraft] = useState<SpectrumDraftDto | null>(null);
  const [draftText, setDraftText] = useState(''); // 预览态原型行可编辑（每行一条）
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [bindBook, setBindBook] = useState<Record<string, string>>({}); // profileId → bookId 选择
  // L2 两步确认：记录待确认删除的人物光谱档案；取消/成功后收簇
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

  const analyze = async () => {
    setMsg('');
    if (name.trim() === '') {
      setMsg('请先填写人物光谱档案名称');
      return;
    }
    const stripped = text.replace(/\s/g, '').length;
    if (stripped < 200) {
      setMsg(`参考正文去空白后不足 200 字（当前 ${stripped} 字），请粘贴或导入更多正文`);
      return;
    }
    setBusy(true);
    try {
      const r = await api.analyzeSpectrum({ name: name.trim(), text });
      setDraft(r.draft);
      setDraftText(r.draft.structure.join('\n'));
      setMsg('人物光谱蒸馏完成（草稿未入库），可逐行编辑后点「确认入库」');
    } catch (e) {
      setMsg(`人物光谱蒸馏失败：${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!draft) return;
    const structure = draftText
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l !== '');
    if (structure.length === 0) {
      setMsg('原型行不能全为空');
      return;
    }
    setBusy(true);
    try {
      await api.saveSpectrumProfile({ ...draft, structure });
      setMsg(`人物光谱档案已入库：${draft.name}`);
      setDraft(null);
      setName('');
      setText('');
      void refetch();
    } catch (e) {
      setMsg(`入库失败：${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string, label: string) => {
    setBusy(true);
    try {
      await api.deleteSpectrumProfile(id);
      setConfirmingDeleteId(null);
      setMsg(`人物光谱档案「${label}」已删除（相关书绑定已清空）`);
      void refetch();
    } catch (e) {
      setMsg(`删除失败：${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const bind = async (profileId: string) => {
    const bookId = bindBook[profileId];
    if (!bookId) {
      setMsg('请先选择要绑定的书');
      return;
    }
    setBusy(true);
    try {
      await api.bindSpectrum(bookId, profileId);
      const bookTitle = books.find((b) => b.id === bookId)?.title ?? bookId;
      setMsg(`已绑定到《${bookTitle}》：AI 建议蓝图时将注入该人物光谱参考`);
      void refetch();
    } catch (e) {
      setMsg(`绑定失败：${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-10" data-testid="spectrum-profiles">
      <h2 className="text-lg font-semibold">人物光谱蒸馏（人物光谱档案）</h2>
      <p className="mt-1 text-xs text-faint">
        从参考正文蒸馏匿名化人物原型（3-8 条，ROLE 行协议，自动防真名泄漏）；绑定书后 AI 建议蓝图时注入【人物光谱参考】。drafter 不注入参考正文（防抄用红线）。
      </p>

      <section className="mt-4">
        <h2 className="text-base font-semibold">人物光谱档案列表</h2>
        <ul className="mt-2 space-y-2">
          {profiles.map((p) => (
            <li key={p.id} className="rounded-card border border-line bg-surface px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="font-medium">{p.name}</span>
                <span className="text-xs text-muted">{p.structure.length} 条人物原型</span>
                <span className="min-w-0 break-all text-xs text-faint">{p.sourcePath}</span>
                {confirmingDeleteId === p.id ? (
                  <>
                    <span className="text-danger text-xs">该人物光谱档案将删除，已绑定书将自动解绑，不可恢复。</span>
                    <Button variant="danger" solid size="sm" disabled={busy} onClick={() => void remove(p.id, p.name)}>
                      确认删除
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => setConfirmingDeleteId(null)}>
                      取消
                    </Button>
                  </>
                ) : (
                  <Button variant="quiet" tone="danger" size="sm" className="ml-auto" disabled={busy} onClick={() => setConfirmingDeleteId(p.id)}>
                    删除
                  </Button>
                )}
              </div>
              <ul className="mt-2 ml-4 list-disc text-xs text-ink">
                {p.structure.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
              <div className="mt-2 flex items-center gap-2 text-sm">
                <select
                  className={selectBase}
                  aria-label={`绑定书-${p.name}`}
                  value={bindBook[p.id] ?? ''}
                  onChange={(e) => setBindBook({ ...bindBook, [p.id]: e.target.value })}
                >
                  <option value="">（选择要绑定的书）</option>
                  {books.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.title}
                    </option>
                  ))}
                </select>
                <Button variant="secondary" size="sm" disabled={busy} onClick={() => void bind(p.id)}>
                  绑定
                </Button>
              </div>
            </li>
          ))}
          {profiles.length === 0 && (
            <li>
              <EmptyState title="还没有人物光谱档案" hint="粘贴 ≥200 字参考正文，从下方表单蒸馏第一个。" />
            </li>
          )}
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-base font-semibold">蒸馏新档案</h2>
        <div className="mt-2 space-y-2">
          <input className={inputBase} placeholder="人物光谱档案名称" aria-label="人物光谱档案名称" value={name} onChange={(e) => setName(e.target.value)} />
          <textarea
            className={textareaBase}
            placeholder="粘贴参考作品正文（去空白后需 ≥200 字；服务端按 ROLE 行协议蒸馏匿名化人物原型 3-8 条）"
            rows={10}
            aria-label="人物光谱蒸馏样本"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <Button variant="primary" size="md" disabled={busy} onClick={() => void analyze()}>
            人物光谱蒸馏
          </Button>
        </div>

        {draft && (
          <div className="mt-4 rounded-card border border-line bg-bg p-3">
            <h3 className="text-sm font-semibold">草稿预览（未入库，每行一条人物原型，可编辑）</h3>
            <textarea
              className={`${textareaBase} mt-2 font-mono text-xs`}
              aria-label="人物光谱草稿原型行"
              rows={Math.max(5, draftText.split('\n').length + 1)}
              value={draftText}
              onChange={(e) => setDraftText(e.target.value)}
            />
            <div className="mt-3 flex gap-2">
              <Button variant="primary" size="sm" disabled={busy} onClick={() => void save()}>
                确认入库
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={busy}
                onClick={() => {
                  setDraft(null);
                  setMsg('已放弃草稿');
                }}
              >
                放弃
              </Button>
            </div>
          </div>
        )}
        {msg && <p className="mt-2 text-sm text-ink">{msg}</p>}
      </section>
    </section>
  );
}
