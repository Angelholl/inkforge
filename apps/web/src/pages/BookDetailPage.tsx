import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { api } from '../api/client';
import OutlineTreeSection from './OutlineTreeSection';
import type { CharacterDto, ChapterBlueprint, StyleProfileDto } from '@inkforge/shared';

function StyleBindSelect({ currentProfileId, onBind }: { currentProfileId: string | null; onBind: (profileId: string) => void }) {
  const { data: profiles } = useQuery({ queryKey: ['style-profiles'], queryFn: api.listStyleProfiles, refetchInterval: 5000 });
  const list = Array.isArray(profiles) ? profiles : [];
  return (
    <select className="rounded border px-2 py-1" value={currentProfileId ?? ''} onChange={(e) => e.target.value && onBind(e.target.value)}>
      <option value="">（未绑定）</option>
      {list.map((p: StyleProfileDto) => (
        <option key={p.id} value={p.id}>
          {p.name}（v{p.version}）
        </option>
      ))}
    </select>
  );
}

/** 人物卡设定展示：baseSetting JSON 逐 entry 拼行，非法 JSON 显示原文，'{}' 显示占位。 */
function settingPreview(baseSetting: string): string {
  const raw = (baseSetting ?? '').trim();
  if (!raw || raw === '{}') return '（无设定）';
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      const flat = Object.entries(obj)
        .map(([k, v]) => `${k}: ${String(v)}`)
        .join('；');
      return flat || '（无设定）';
    }
  } catch {
    /* 原文展示 */
  }
  return raw;
}

/** 编辑态预填：与展示一致的展平文本（无设定 → 空串）；保存按 {"设定": text} 包裹约定回写。 */
function settingRawText(baseSetting: string): string {
  const p = settingPreview(baseSetting);
  return p === '（无设定）' ? '' : p;
}

export default function BookDetailPage() {
  const { bookId = '' } = useParams();
  const { data: book, refetch } = useQuery({ queryKey: ['book', bookId], queryFn: () => api.getBook(bookId), refetchInterval: 4000 });
  const { data: profiles } = useQuery({ queryKey: ['style-profiles'], queryFn: api.listStyleProfiles, refetchInterval: 5000 });
  const { data: characters, refetch: refetchCharacters } = useQuery({
    queryKey: ['characters', bookId],
    queryFn: () => api.listCharacters(bookId),
  });
  const [blueprintText, setBlueprintText] = useState('');
  const [chapterNo, setChapterNo] = useState(1);
  const [msg, setMsg] = useState('');
  const [worldText, setWorldText] = useState('');
  const [outlineText, setOutlineText] = useState('');
  const [newCardName, setNewCardName] = useState('');
  const [newCardSetting, setNewCardSetting] = useState('');
  const [editingCard, setEditingCard] = useState<{ id: string; name: string; setting: string } | null>(null);
  // book 每 4s 轮询；世界观/大纲编辑态只在首次加载同步一次，避免轮询覆盖未保存的编辑
  const metaSyncedRef = useRef(false);

  useEffect(() => {
    if (book && !metaSyncedRef.current) {
      setWorldText(book.description);
      setOutlineText(book.outline);
      metaSyncedRef.current = true;
    }
  }, [book]);

  useEffect(() => {
    if (book && book.chapters.length > 0 && blueprintText === '') {
      const ch = book.chapters.find((c) => c.chapterNo === chapterNo) ?? book.chapters[0];
      if (ch.blueprint) setBlueprintText(JSON.stringify(ch.blueprint, null, 2));
    }
  }, [book, chapterNo, blueprintText]);

  const saveBlueprint = async () => {
    try {
      const blueprint = JSON.parse(blueprintText) as ChapterBlueprint;
      const ch = book?.chapters.find((c) => c.chapterNo === chapterNo);
      const r = await api.putBlueprint(bookId, chapterNo, {
        title: ch?.title || `第${chapterNo}章`,
        blueprint,
        targetChars: ch?.targetChars,
      });
      setMsg(`蓝图已保存：${r.title}`);
      void refetch();
    } catch (e) {
      setMsg(`保存失败：${(e as Error).message}`);
    }
  };

  const generate = async () => {
    const r = await api.generateChapter(bookId, chapterNo);
    setMsg(`已入队 run ${r.runId}`);
  };

  const generateAll = async () => {
    const r = await api.generateAll(bookId);
    setMsg(`整书已入队 run ${r.runId}`);
  };

  const bindStyle = async (profileId: string) => {
    try {
      await api.bindStyle(bookId, { profileId });
      setMsg('风格档案已绑定');
      void refetch();
    } catch (e) {
      setMsg(`绑定失败：${(e as Error).message}`);
    }
  };

  const saveMeta = async () => {
    try {
      await api.putBookMeta(bookId, { description: worldText, outline: outlineText });
      setMsg('设定已保存');
      void refetch();
    } catch (e) {
      setMsg(`设定保存失败：${(e as Error).message}`);
    }
  };

  const addCard = async () => {
    if (!newCardName.trim()) {
      setMsg('人物卡姓名不能为空');
      return;
    }
    try {
      await api.createCharacter(bookId, {
        name: newCardName.trim(),
        baseSetting: newCardSetting.trim() ? JSON.stringify({ 设定: newCardSetting.trim() }) : '{}',
      });
      setNewCardName('');
      setNewCardSetting('');
      setMsg('人物卡已添加');
      void refetchCharacters();
    } catch (e) {
      setMsg(`添加失败：${(e as Error).message}`);
    }
  };

  const saveCard = async () => {
    if (!editingCard) return;
    try {
      await api.updateCharacter(bookId, editingCard.id, {
        name: editingCard.name.trim(),
        baseSetting: editingCard.setting.trim() ? JSON.stringify({ 设定: editingCard.setting.trim() }) : '{}',
      });
      setEditingCard(null);
      setMsg('人物卡已保存');
      void refetchCharacters();
    } catch (e) {
      setMsg(`保存失败：${(e as Error).message}`);
    }
  };

  const removeCard = async (card: CharacterDto) => {
    try {
      await api.deleteCharacter(bookId, card.id);
      setMsg(`人物卡「${card.name}」已删除`);
      void refetchCharacters();
    } catch (e) {
      setMsg(`删除失败：${(e as Error).message}`);
    }
  };

  const summarize = async (chapterNo: number) => {
    try {
      await api.summarizeChapter(bookId, chapterNo);
      setMsg(`第${chapterNo}章摘要已生成`);
      void refetch();
    } catch (e) {
      setMsg(`摘要失败：${(e as Error).message}`);
    }
  };

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <Link to="/" className="text-sm text-gray-500">
        ← 书架
      </Link>
      <h1 className="mt-2 text-2xl font-bold">{book?.title ?? '…'}</h1>
      <div className="mt-4 flex gap-2">
        <button className="rounded bg-blue-600 px-4 py-2 text-white" onClick={generateAll}>
          整书生成
        </button>
        <button className="rounded bg-gray-200 px-4 py-2" onClick={() => void refetch()}>
          刷新
        </button>
      </div>

      <section className="mt-6">
        <h2 className="font-semibold">世界观与剧情大纲</h2>
        <textarea
          className="mt-2 w-full rounded border px-3 py-2"
          rows={6}
          aria-label="世界观"
          placeholder="世界观 / 规则（越具体越好）"
          value={worldText}
          onChange={(e) => setWorldText(e.target.value)}
        />
        <textarea
          className="mt-2 w-full rounded border px-3 py-2"
          rows={4}
          aria-label="剧情大纲"
          placeholder="全书剧情大纲（可选）：分卷 / 关键转折 / 结局走向"
          value={outlineText}
          onChange={(e) => setOutlineText(e.target.value)}
        />
        <button className="mt-2 rounded bg-blue-600 px-4 py-1.5 text-white" onClick={() => void saveMeta()}>
          保存设定
        </button>
      </section>

      {bookId && <OutlineTreeSection bookId={bookId} />}

      <section className="mt-6">
        <h2 className="font-semibold">人物卡</h2>
        <ul className="mt-2 space-y-2">
          {(characters ?? []).map((c) => (
            <li key={c.id} className="rounded border px-3 py-2 text-sm">
              {editingCard?.id === c.id ? (
                <div className="space-y-1">
                  <input
                    className="w-40 rounded border px-2 py-1"
                    aria-label="编辑姓名"
                    value={editingCard.name}
                    onChange={(e) => setEditingCard({ ...editingCard, name: e.target.value })}
                  />
                  <textarea
                    className="w-full rounded border px-2 py-1"
                    rows={2}
                    aria-label="编辑设定"
                    value={editingCard.setting}
                    onChange={(e) => setEditingCard({ ...editingCard, setting: e.target.value })}
                  />
                  <div className="flex gap-2">
                    <button className="rounded bg-blue-600 px-3 py-1 text-white" onClick={() => void saveCard()}>
                      保存
                    </button>
                    <button className="rounded bg-gray-200 px-3 py-1" onClick={() => setEditingCard(null)}>
                      取消
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2">
                  <span className="font-medium">{c.name}</span>
                  <span className="flex-1 text-gray-600">{settingPreview(c.baseSetting)}</span>
                  <button
                    className="text-blue-600"
                    onClick={() =>
                      setEditingCard({ id: c.id, name: c.name, setting: settingRawText(c.baseSetting) })
                    }
                  >
                    编辑
                  </button>
                  <button className="text-red-600" onClick={() => void removeCard(c)}>
                    删除
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
        <div className="mt-2 space-y-1">
          <input
            className="w-40 rounded border px-2 py-1"
            placeholder="姓名"
            aria-label="新卡姓名"
            value={newCardName}
            onChange={(e) => setNewCardName(e.target.value)}
          />
          <textarea
            className="w-full rounded border px-2 py-1 text-sm"
            rows={2}
            placeholder="人物设定（身份 / 性格 / 目标…）"
            aria-label="新卡设定"
            value={newCardSetting}
            onChange={(e) => setNewCardSetting(e.target.value)}
          />
          <button className="rounded bg-gray-200 px-3 py-1 text-sm" onClick={() => void addCard()}>
            添加人物
          </button>
        </div>
      </section>

      <section className="mt-6">
        <h2 className="font-semibold">风格档案</h2>
        <div className="mt-2 flex items-center gap-2 text-sm">
          <StyleBindSelect currentProfileId={book?.styleProfileId ?? null} onBind={bindStyle} />
          {book?.styleProfileId && (
            <span className="text-gray-600">
              已绑定：{(Array.isArray(profiles) ? profiles : []).find((p) => p.id === book.styleProfileId)?.name ?? book.styleProfileId}
            </span>
          )}
        </div>
        <p className="mt-1 text-xs text-gray-400">续写（continue）模式不注入风格，仅生成模式生效。</p>
      </section>

      <section className="mt-6">
        <h2 className="font-semibold">章节</h2>
        <ul className="mt-2 space-y-1">
          {(book?.chapters ?? []).map((c) => (
            <li key={c.id} className="flex items-center gap-3 rounded border px-3 py-2">
              <span>
                第{c.chapterNo}章 {c.title}
              </span>
              <span
                className={`rounded px-2 py-0.5 text-xs ${
                  c.status === 'done'
                    ? 'bg-green-100 text-green-700'
                    : c.status === 'needs_human'
                      ? 'bg-orange-100 text-orange-700'
                      : 'bg-gray-100 text-gray-600'
                }`}
              >
                {c.status}
              </span>
              {c.isOriginal && (
                <button className="text-sm text-blue-600" onClick={() => void summarize(c.chapterNo)}>
                  补摘要
                </button>
              )}
              <button className="ml-auto text-sm text-blue-600" onClick={() => void api.generateChapter(bookId, c.chapterNo).then(() => setMsg(`第${c.chapterNo}章已入队`))}>
                生成
              </button>
              <Link className="text-sm text-blue-600" to={`/books/${bookId}/chapters/${c.chapterNo}`}>
                阅读
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-6">
        <h2 className="font-semibold">蓝图编辑</h2>
        <div className="mt-2 flex items-center gap-2">
          <label className="text-sm">
            章号
            <input
              type="number"
              min={1}
              className="ml-2 w-20 rounded border px-2 py-1"
              value={chapterNo}
              onChange={(e) => setChapterNo(Number(e.target.value))}
            />
          </label>
          <button className="rounded bg-blue-600 px-4 py-1.5 text-white" onClick={saveBlueprint}>
            保存蓝图
          </button>
          <button className="rounded bg-gray-200 px-4 py-1.5" onClick={generate}>
            生成本章
          </button>
        </div>
        <textarea
          className="mt-2 h-72 w-full rounded border p-3 font-mono text-xs"
          value={blueprintText}
          onChange={(e) => setBlueprintText(e.target.value)}
        />
        {msg && <p className="mt-2 text-sm text-gray-600">{msg}</p>}
      </section>
    </main>
  );
}
