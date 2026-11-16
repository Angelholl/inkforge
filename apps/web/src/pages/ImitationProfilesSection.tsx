import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { Button } from '../components/ui';
import type { ImitationDraftDto } from '@inkforge/shared';

/** 拆解仿写档案分区（Pagekin 式）：analyze→预览→确认入库→列表→绑定书。draft 不入库，确认才落档案。 */
export default function ImitationProfilesSection() {
  const { data: profilesData, refetch } = useQuery({ queryKey: ['imitation-profiles'], queryFn: api.listImitationProfiles, refetchInterval: 5000 });
  const { data: booksData } = useQuery({ queryKey: ['books'], queryFn: api.listBooks, refetchInterval: 5000 });
  const profiles = Array.isArray(profilesData) ? profilesData : [];
  const books = Array.isArray(booksData) ? booksData : [];
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  // 章数用 string 态（对齐 StyleProfilesSection 高级项模式）：输入过程不干预，提交时钳 [1,50]、非法回退 12
  const [chapterCount, setChapterCount] = useState('12');
  const [draft, setDraft] = useState<ImitationDraftDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [bindBook, setBindBook] = useState<Record<string, string>>({}); // profileId → bookId 选择
  // L2 两步确认：记录待确认删除的仿写档案；取消/成功后收簇
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

  const analyze = async () => {
    setMsg('');
    // 前置校验（owner 立项 DEC-2026-1117-03：对齐蒸馏表单口径，空名/短文不再直打服务端 400）
    if (name.trim() === '') {
      setMsg('请先填写仿写档案名称');
      return;
    }
    const stripped = text.replace(/\s/g, '').length;
    if (stripped < 200) {
      setMsg(`参考正文去空白后不足 200 字（当前 ${stripped} 字），请粘贴或导入更多正文`);
      return;
    }
    setBusy(true);
    try {
      const count = Math.min(50, Math.max(1, Math.round(Number(chapterCount)) || 12));
      const r = await api.analyzeImitation({ name: name.trim(), text, chapterCount: count });
      setDraft(r.draft);
      setMsg('拆解完成（草稿未入库），确认后点「确认入库」');
    } catch (e) {
      setMsg(`拆解失败：${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!draft) return;
    setBusy(true);
    try {
      const r = await api.saveImitationProfile(draft);
      setMsg(`仿写档案已入库：${draft.name} v${r.version}`);
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
      await api.deleteImitationProfile(id);
      setConfirmingDeleteId(null);
      setMsg(`仿写档案「${label}」已删除（相关书绑定已清空）`);
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
      await api.bindImitation(bookId, profileId);
      const bookTitle = books.find((b) => b.id === bookId)?.title ?? bookId;
      setMsg(`已绑定到《${bookTitle}》：blueprint-suggest 将注入该结构拆解`);
      void refetch();
    } catch (e) {
      setMsg(`绑定失败：${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-10">
      <h2 className="text-xl font-bold">仿写档案（拆解仿写）</h2>
      <p className="mt-1 text-xs text-faint">参考样本只用于结构拆解与蓝图反推；drafter 不注入参考正文（防抄用红线）。</p>

      <section className="mt-4">
        <h2 className="font-semibold">仿写档案列表</h2>
        <ul className="mt-2 space-y-2">
          {profiles.map((p) => (
            <li key={p.id} className="rounded border px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="font-medium">{p.name}</span>
                <span className="text-xs text-muted">v{p.version}</span>
                <span className="min-w-0 break-all text-xs text-faint">{p.sourcePath}</span>
                {confirmingDeleteId === p.id ? (
                  <>
                    <span className="text-danger text-xs">该拆解档案将删除，已绑定书将自动解绑，不可恢复。</span>
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
              <div className="mt-2 flex items-center gap-2 text-sm">
                <select
                  className="rounded border px-2 py-1"
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
          {profiles.length === 0 && <li className="text-sm text-muted">暂无仿写档案，先用下方表单拆解一个。</li>}
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="font-semibold">拆解新档案</h2>
        <div className="mt-2 space-y-2">
          <input className="w-full rounded border px-3 py-2" placeholder="仿写档案名称" aria-label="仿写档案名称" value={name} onChange={(e) => setName(e.target.value)} />
          <textarea
            className="w-full rounded border px-3 py-2 text-sm"
            placeholder="粘贴参考作品正文（去空白后需 ≥200 字；服务端按 8×2000 字抽样做结构拆解）"
            rows={10}
            aria-label="仿写样本"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <label className="block text-sm">
            反推章数
            <input
              type="number"
              min={1}
              max={50}
              aria-label="仿写反推章数"
              className="ml-2 w-20 rounded border px-2 py-1"
              value={chapterCount}
              onChange={(e) => setChapterCount(e.target.value)}
            />
          </label>
          <Button variant="primary" size="md" disabled={busy} onClick={() => void analyze()}>
            拆解分析
          </Button>
        </div>

        {draft && (
          <div className="mt-4 rounded border bg-bg p-3">
            <h3 className="text-sm font-semibold">草稿预览（未入库）</h3>
            <div className="mt-2 text-sm">
              <div className="font-medium">结构拆解（{draft.structure.length} 条）</div>
              <ul className="ml-4 list-disc text-xs text-ink">
                {draft.structure.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
              <div className="mt-2 font-medium">文风规则</div>
              <pre className="mt-1 whitespace-pre-wrap rounded p-2 text-xs text-ink" style={{ background: '#F3F4F6' }}>
                {draft.style.rulesText || '（无规则行）'}
              </pre>
              <div className="mt-2 font-medium">蓝图反推（{draft.blueprint.length} 章）</div>
              <ol className="ml-4 list-decimal text-xs text-ink">
                {draft.blueprint.slice(0, 5).map((b) => (
                  <li key={b.chapterNo}>
                    第{b.chapterNo}章 {b.blueprint.goal}
                  </li>
                ))}
              </ol>
              {draft.blueprint.length > 5 && <div className="text-xs text-faint">…其余 {draft.blueprint.length - 5} 章略</div>}
            </div>
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
