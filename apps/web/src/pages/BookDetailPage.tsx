import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { api, apiErrorText } from '../api/client';
import OutlineTreeSection from './OutlineTreeSection';
import ForeshadowingsSection from './ForeshadowingsSection';
import RunAsideCard from '../components/RunAsideCard';
import { Badge, Button, Chip } from '../components/ui';
import type { CharacterDto, ChapterBlueprint, ExportFormat, StyleProfileDto } from '@inkforge/shared';

function StyleBindSelect({ currentProfileId, onBind }: { currentProfileId: string | null; onBind: (profileId: string | null) => void }) {
  const { data: profiles } = useQuery({ queryKey: ['style-profiles'], queryFn: api.listStyleProfiles, refetchInterval: 5000 });
  const list = Array.isArray(profiles) ? profiles : [];
  return (
    <select
      aria-label="风格档案绑定"
      className="rounded border px-2 py-1"
      value={currentProfileId ?? ''}
      onChange={(e) => onBind(e.target.value === '' ? null : e.target.value)}
    >
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
  // B3：本页一枚 select 统管本页三个生成入口（单章/整书/行内），默认 2 = 服务端默认
  const [maxRounds, setMaxRounds] = useState(2);
  // 蓝图编辑区（owner 反馈②④）：章号默认接续末章；字数随章号同步（防 4s 轮询覆盖编辑，仅章号变化时重置）
  const [targetChars, setTargetChars] = useState(3000);
  const [suggesting, setSuggesting] = useState(false);
  const chapterNoInitRef = useRef(false);
  const targetCharsSyncRef = useRef(-1);
  // 人物下线（0009）：每卡行内章号草稿（默认下一章）
  const [offlineDraft, setOfflineDraft] = useState<Record<string, number>>({});
  const [msg, setMsg] = useState('');
  const [worldText, setWorldText] = useState('');
  const [outlineText, setOutlineText] = useState('');
  const [newCardName, setNewCardName] = useState('');
  const [newCardSetting, setNewCardSetting] = useState('');
  const [editingCard, setEditingCard] = useState<{ id: string; name: string; setting: string } | null>(null);
  // L2 两步确认：记录待确认删除的人物卡；取消/成功后收簇
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
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

  // 章号默认接续末章（只初始化一次，不覆盖用户手改）
  useEffect(() => {
    if (book && !chapterNoInitRef.current) {
      const maxNo = book.chapters.reduce((m, c) => Math.max(m, c.chapterNo), 0);
      setChapterNo(maxNo + 1);
      chapterNoInitRef.current = true;
    }
  }, [book]);

  // 字数随章号同步：章号没变就不重置（轮询 book 引用常变，防覆盖用户编辑中的字数）
  useEffect(() => {
    if (book && targetCharsSyncRef.current !== chapterNo) {
      const ch = book.chapters.find((c) => c.chapterNo === chapterNo);
      setTargetChars(ch?.targetChars ?? 3000);
      targetCharsSyncRef.current = chapterNo;
    }
  }, [book, chapterNo]);

  const nextChapterNo = book ? book.chapters.reduce((m, c) => Math.max(m, c.chapterNo), 0) + 1 : 1;

  const saveBlueprint = async () => {
    try {
      const blueprint = JSON.parse(blueprintText) as ChapterBlueprint;
      const ch = book?.chapters.find((c) => c.chapterNo === chapterNo);
      const r = await api.putBlueprint(bookId, chapterNo, {
        title: ch?.title || `第${chapterNo}章`,
        blueprint,
        targetChars,
      });
      setMsg(`蓝图已保存：${r.title}（目标 ${targetChars} 字）`);
      void refetch();
    } catch (e) {
      setMsg(`保存失败：${(e as Error).message}`);
    }
  };

  const suggest = async () => {
    setMsg('');
    setSuggesting(true);
    try {
      const r = await api.suggestBlueprint(bookId, { chapterNo });
      setBlueprintText(JSON.stringify(r.blueprint, null, 2));
      setMsg(`已填入第 ${chapterNo} 章蓝图建议，可编辑后点「保存蓝图」`);
    } catch (e) {
      setMsg(`AI 建议失败：${apiErrorText(e)}（可直接在下方手填蓝图 JSON）`);
    } finally {
      setSuggesting(false);
    }
  };

  const startContinue = async () => {
    setMsg('');
    const ch = book?.chapters.find((c) => c.chapterNo === chapterNo);
    if (!ch?.blueprint) {
      setMsg(`第 ${chapterNo} 章还没有蓝图：请先「保存蓝图」（或用 AI 建议生成）再发起续写`);
      return;
    }
    try {
      const r = await api.createRun({ bookId, fromChapter: chapterNo, toChapter: chapterNo, mode: 'continue', maxRounds });
      setMsg(`续写已入队 run ${r.runId.slice(0, 8)}，进度见右侧「运行」卡`);
    } catch (e) {
      setMsg(`发起续写失败：${apiErrorText(e)}`);
    }
  };

  const generate = async () => {
    const r = await api.generateChapter(bookId, chapterNo, maxRounds);
    setMsg(`已入队 run ${r.runId}`);
  };

  const generateAll = async () => {
    const r = await api.generateAll(bookId, maxRounds);
    setMsg(`整书已入队 run ${r.runId}`);
  };

  const bindStyle = async (profileId: string | null): Promise<void> => {
    try {
      await api.bindStyle(bookId, { profileId });
      // 解绑必须真发出去（缺陷⑦）：文案也分两条，别让人以为还是「绑定」
      setMsg(profileId === null ? '风格档案已解绑（persona 快照一并清除）' : '风格档案已绑定');
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
      setConfirmingDeleteId(null);
      setMsg(`人物卡「${card.name}」已删除`);
      void refetchCharacters();
    } catch (e) {
      setMsg(`删除失败：${(e as Error).message}`);
    }
  };

  // 人物下线（0009）：第 N 章起不再以在场身份注入写手；连续性快照带「已下线」防复活
  const offlineCard = async (card: CharacterDto) => {
    const ch = offlineDraft[card.id] ?? nextChapterNo;
    try {
      await api.updateCharacter(bookId, card.id, { offlineFromChapter: ch });
      setMsg(`人物「${card.name}」已设为第 ${ch} 章起下线`);
      void refetchCharacters();
    } catch (e) {
      setMsg(`下线失败：${apiErrorText(e)}`);
    }
  };

  const reviveCard = async (card: CharacterDto) => {
    try {
      await api.updateCharacter(bookId, card.id, { offlineFromChapter: null });
      setMsg(`人物「${card.name}」已恢复在场`);
      void refetchCharacters();
    } catch (e) {
      setMsg(`恢复失败：${apiErrorText(e)}`);
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

  const [exportFormat, setExportFormat] = useState<ExportFormat>('chapters-md');
  const exportNow = async () => {
    try {
      const r = await api.exportBook(bookId, exportFormat);
      setMsg(`已导出 ${r.files.length} 个文件（${exportFormat}）`);
    } catch (e) {
      setMsg(`导出失败：${(e as Error).message}`);
    }
  };

  const doneCount = (book?.chapters ?? []).filter((c) => c.status === 'done').length;
  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <Link to="/" className="text-sm text-muted">
        ← 书架
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-bold">{book?.title ?? '…'}</h1>
        {/* 详情 chip 条（D2） */}
        <Chip active>章节 {book?.chapters.length ?? 0}</Chip>
        <Chip active={doneCount > 0}>完成 {doneCount}</Chip>
        {book?.styleProfileId && <Chip active>文风已绑</Chip>}
        {book?.imitationProfileId && <Chip active>仿写已绑</Chip>}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="primary" onClick={generateAll}>
          整书生成
        </Button>
        <label className="flex items-center gap-1.5 text-sm text-muted">
          质量轮数
          <select
            aria-label="质量轮数"
            className="h-ctl rounded-ctl border border-line bg-surface px-2 text-sm"
            value={maxRounds}
            onChange={(e) => setMaxRounds(Number(e.target.value))}
          >
            <option value={1}>1 轮</option>
            <option value={2}>2 轮</option>
            <option value={3}>3 轮</option>
          </select>
        </label>
        <Button variant="secondary" onClick={() => void refetch()}>
          刷新
        </Button>
        <select
          aria-label="导出格式"
          className="h-ctl rounded-ctl border border-line bg-surface px-2 text-sm"
          value={exportFormat}
          onChange={(e) => setExportFormat(e.target.value as ExportFormat)}
        >
          <option value="chapters-md">分章 Markdown</option>
          <option value="combined-md">全书合并</option>
          <option value="txt">分章 TXT</option>
        </select>
        <Button variant="secondary" onClick={() => void exportNow()}>
          导出
        </Button>
      </div>
      <div className="mt-6 grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">

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
        <Button variant="primary" className="mt-2" onClick={() => void saveMeta()}>
          保存设定
        </Button>
      </section>

      {bookId && <OutlineTreeSection bookId={bookId} />}

      {bookId && <ForeshadowingsSection bookId={bookId} />}

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
                    <Button variant="primary" size="sm" onClick={() => void saveCard()}>
                      保存
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => setEditingCard(null)}>
                      取消
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2">
                  <span className="font-medium">{c.name}</span>
                  <span className="min-w-0 flex-1 text-muted">{settingPreview(c.baseSetting)}</span>
                  {c.offlineFromChapter != null && <Badge tone="muted">第{c.offlineFromChapter}章起下线</Badge>}
                  {confirmingDeleteId === c.id ? (
                    <>
                      <span className="text-danger text-xs">该人物卡及其历史状态将一并删除，不可恢复。</span>
                      <Button variant="danger" size="sm" solid onClick={() => void removeCard(c)}>
                        确认删除
                      </Button>
                      <Button variant="secondary" size="sm" onClick={() => setConfirmingDeleteId(null)}>
                        取消
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        variant="quiet"
                        tone="primary"
                        size="sm"
                        onClick={() =>
                          setEditingCard({ id: c.id, name: c.name, setting: settingRawText(c.baseSetting) })
                        }
                      >
                        编辑
                      </Button>
                      {c.offlineFromChapter == null ? (
                        <>
                          <input
                            type="number"
                            min={1}
                            aria-label={`下线章号-${c.name}`}
                            title="从第几章起该角色退场"
                            className="w-16 rounded border px-2 py-1 text-xs"
                            value={offlineDraft[c.id] ?? nextChapterNo}
                            onChange={(e) =>
                              setOfflineDraft({ ...offlineDraft, [c.id]: Number(e.target.value) || nextChapterNo })
                            }
                          />
                          <Button variant="quiet" tone="danger" size="sm" onClick={() => void offlineCard(c)}>
                            下线
                          </Button>
                        </>
                      ) : (
                        <Button variant="quiet" tone="primary" size="sm" onClick={() => void reviveCard(c)}>
                          恢复在场
                        </Button>
                      )}
                      <Button variant="quiet" tone="danger" size="sm" onClick={() => setConfirmingDeleteId(c.id)}>
                        删除
                      </Button>
                    </>
                  )}
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
          <Button variant="secondary" size="sm" onClick={() => void addCard()}>
            添加人物
          </Button>
        </div>
      </section>

      <section className="mt-6">
        <h2 className="font-semibold">风格档案</h2>
        <div className="mt-2 flex items-center gap-2 text-sm">
          <StyleBindSelect currentProfileId={book?.styleProfileId ?? null} onBind={bindStyle} />
          {book?.styleProfileId && (
            <span className="text-muted">
              已绑定：{(Array.isArray(profiles) ? profiles : []).find((p) => p.id === book.styleProfileId)?.name ?? book.styleProfileId}
            </span>
          )}
        </div>
        <p className="mt-1 text-xs text-faint">续写（continue）模式不注入风格，仅生成模式生效。</p>
        {book?.styleProfileId && (
          <div className="mt-2">
            <label htmlFor="book-style-fewshot" className="flex items-center gap-2 text-sm font-medium">
              <input
                id="book-style-fewshot"
                type="checkbox"
                checked={book.styleFewshotOn}
                onChange={(e) => {
                  const next = e.target.checked;
                  void api
                    .setBookFewshot(bookId, next)
                    .then((r) => {
                      setMsg(r.styleFewshotOn ? '文风示例注入已开启' : '文风示例注入已关闭');
                      void refetch();
                    })
                    .catch((err: unknown) => setMsg(apiErrorText(err)));
                }}
              />
              文风示例注入
            </label>
            <p className="mt-1 text-xs text-faint">
              关闭后不向写手注入范文片段；抄用检测仍以绑定样本为参考，不随开关关闭。新绑定默认关。
            </p>
          </div>
        )}
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
                    ? 'bg-ok-soft text-ok'
                    : c.status === 'needs_human'
                      ? 'bg-warn-soft text-warn'
                      : 'bg-bg text-muted'
                }`}
              >
                {c.status}
              </span>
              {c.isOriginal && (
                <Button variant="quiet" tone="primary" size="sm" onClick={() => void summarize(c.chapterNo)}>
                  补摘要
                </Button>
              )}
              <Button
                variant="quiet"
                tone="primary"
                size="sm"
                className="ml-auto"
                onClick={() => void api.generateChapter(bookId, c.chapterNo, maxRounds).then(() => setMsg(`第${c.chapterNo}章已入队`))}
              >
                生成
              </Button>
              <Link className="text-sm text-primary-strong" to={`/books/${bookId}/chapters/${c.chapterNo}`}>
                阅读
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-6">
        <h2 className="font-semibold">蓝图编辑</h2>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label className="text-sm">
            章号
            <input
              type="number"
              min={1}
              className="ml-2 w-20 rounded border px-2 py-1"
              value={chapterNo}
              onChange={(e) => setChapterNo(Number(e.target.value) || 1)}
            />
          </label>
          <label className="text-sm">
            字数
            <input
              type="number"
              min={500}
              step={100}
              aria-label="本章目标字数"
              className="ml-2 w-24 rounded border px-2 py-1"
              value={targetChars}
              onChange={(e) => setTargetChars(Number(e.target.value) || 3000)}
            />
          </label>
          <Button variant="secondary" loading={suggesting} onClick={() => void suggest()}>
            AI 建议蓝图
          </Button>
          <Button variant="primary" onClick={saveBlueprint}>
            保存蓝图
          </Button>
          <Button variant="secondary" onClick={generate}>
            生成本章
          </Button>
          <Button variant="primary" onClick={() => void startContinue()}>
            发起续写（第{chapterNo}章）
          </Button>
        </div>
        <p className="mt-1 text-xs text-faint">
          下一章续写：章号默认接续末章 → 「AI 建议蓝图」或手填 JSON → 「保存蓝图」→ 「发起续写」（取前文锚点声线；「生成本章」则按蓝图全新生成）。
          字数=本章目标字数，QC 按其 ±10% 校验。
        </p>
        <textarea
          className="mt-2 h-72 w-full rounded border p-3 font-mono text-xs"
          placeholder='蓝图 JSON，如 {"goal":"…","beats":["…"],"mustHaveBeats":[],"bannedTopics":[]}'
          value={blueprintText}
          onChange={(e) => setBlueprintText(e.target.value)}
        />
        {msg && <p className="mt-2 text-sm text-muted">{msg}</p>}
      </section>
        </div>
        <aside className="space-y-4">
          <RunAsideCard runs={book?.runs ?? []} />
        </aside>
      </div>
    </main>
  );
}
