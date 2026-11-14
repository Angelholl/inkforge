import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import type { ImitationDraftDto } from '@inkforge/shared';

/** 拆解仿写档案分区（Pagekin 式）：analyze→预览→确认入库→列表→绑定书。draft 不入库，确认才落档案。 */
export default function ImitationProfilesSection() {
  const { data: profilesData, refetch } = useQuery({ queryKey: ['imitation-profiles'], queryFn: api.listImitationProfiles, refetchInterval: 5000 });
  const { data: booksData } = useQuery({ queryKey: ['books'], queryFn: api.listBooks, refetchInterval: 5000 });
  const profiles = Array.isArray(profilesData) ? profilesData : [];
  const books = Array.isArray(booksData) ? booksData : [];
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [chapterCount, setChapterCount] = useState(12);
  const [draft, setDraft] = useState<ImitationDraftDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [bindBook, setBindBook] = useState<Record<string, string>>({}); // profileId → bookId 选择

  const analyze = async () => {
    setMsg('');
    setBusy(true);
    try {
      const r = await api.analyzeImitation({ name: name.trim(), text, chapterCount });
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
      <p className="mt-1 text-xs text-gray-400">参考样本只用于结构拆解与蓝图反推；drafter 不注入参考正文（防抄用红线）。</p>

      <section className="mt-4">
        <h2 className="font-semibold">仿写档案列表</h2>
        <ul className="mt-2 space-y-2">
          {profiles.map((p) => (
            <li key={p.id} className="rounded border px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="font-medium">{p.name}</span>
                <span className="text-xs text-gray-500">v{p.version}</span>
                <span className="text-xs text-gray-400">{p.sourcePath}</span>
                <button className="ml-auto text-sm text-red-600" disabled={busy} onClick={() => void remove(p.id, p.name)}>
                  删除
                </button>
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
                <button className="rounded bg-gray-200 px-3 py-1 text-sm" disabled={busy} onClick={() => void bind(p.id)}>
                  绑定
                </button>
              </div>
            </li>
          ))}
          {profiles.length === 0 && <li className="text-sm text-gray-500">暂无仿写档案，先用下方表单拆解一个。</li>}
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
              onChange={(e) => setChapterCount(Number(e.target.value))}
            />
          </label>
          <button className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50" disabled={busy} onClick={() => void analyze()}>
            拆解分析
          </button>
        </div>

        {draft && (
          <div className="mt-4 rounded border bg-gray-50 p-3">
            <h3 className="text-sm font-semibold">草稿预览（未入库）</h3>
            <div className="mt-2 text-sm">
              <div className="font-medium">结构拆解（{draft.structure.length} 条）</div>
              <ul className="ml-4 list-disc text-xs text-gray-700">
                {draft.structure.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
              <div className="mt-2 font-medium">文风规则</div>
              <pre className="mt-1 whitespace-pre-wrap rounded p-2 text-xs text-gray-700" style={{ background: '#F3F4F6' }}>
                {draft.style.rulesText || '（无规则行）'}
              </pre>
              <div className="mt-2 font-medium">蓝图反推（{draft.blueprint.length} 章）</div>
              <ol className="ml-4 list-decimal text-xs text-gray-700">
                {draft.blueprint.slice(0, 5).map((b) => (
                  <li key={b.chapterNo}>
                    第{b.chapterNo}章 {b.blueprint.goal}
                  </li>
                ))}
              </ol>
              {draft.blueprint.length > 5 && <div className="text-xs text-gray-400">…其余 {draft.blueprint.length - 5} 章略</div>}
            </div>
            <div className="mt-3 flex gap-2">
              <button className="rounded bg-blue-600 px-4 py-1.5 text-sm text-white disabled:opacity-50" disabled={busy} onClick={() => void save()}>
                确认入库
              </button>
              <button
                className="rounded bg-gray-200 px-4 py-1.5 text-sm"
                disabled={busy}
                onClick={() => {
                  setDraft(null);
                  setMsg('已放弃草稿');
                }}
              >
                放弃
              </button>
            </div>
          </div>
        )}
        {msg && <p className="mt-2 text-sm text-gray-700">{msg}</p>}
      </section>
    </section>
  );
}
