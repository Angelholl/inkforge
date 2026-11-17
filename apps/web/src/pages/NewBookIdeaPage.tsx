import { useState } from 'react';
import { useNavigate } from 'react-router';
import { api } from '../api/client';
import type { OutlineItemDto } from '@inkforge/shared';
import { Button } from '../components/ui';

type Step = 'setup' | 'review' | 'launch';

/**
 * 入口 B 生成模式三步向导（docs/plans/2026-11-14-entry-b-generate-mode.md）：
 * ①书名 + 世界观 + 剧情大纲 + 人物卡 + 章节数 → 建书并一次生成全书蓝图（行协议分块）；
 * ②蓝图审阅（逐章采用/编辑）→ 批量 PUT 蓝图；③发起 generate run（1..N）。
 */
export default function NewBookIdeaPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('setup');
  const [title, setTitle] = useState('');
  const [worldview, setWorldview] = useState('');
  const [outlineText, setOutlineText] = useState('');
  const [cards, setCards] = useState<Array<{ name: string; setting: string }>>([]);
  const [chapterCount, setChapterCount] = useState(8);
  const [bookId, setBookId] = useState('');
  const [items, setItems] = useState<OutlineItemDto[]>([]);
  const [adopted, setAdopted] = useState<Set<number>>(new Set());
  const [editing, setEditing] = useState<number | null>(null);
  const [titles, setTitles] = useState<Record<number, string>>({});
  const [chars, setChars] = useState<Record<number, number>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const start = async () => {
    setError('');
    if (!title.trim()) {
      setError('请填写书名');
      return;
    }
    setBusy(true);
    try {
      // 空可选字段不进 body（保持建书请求最小形）；人物卡设定文本按 {"设定": text} 包裹入库
      const characters = cards
        .filter((c) => c.name.trim())
        .map((c) => ({ name: c.name.trim(), baseSetting: c.setting.trim() ? JSON.stringify({ 设定: c.setting.trim() }) : '{}' }));
      const book = await api.createBook({
        title: title.trim(),
        description: worldview.trim(),
        ...(outlineText.trim() ? { outline: outlineText.trim() } : {}),
        ...(characters.length > 0 ? { characters } : {}),
      });
      setBookId(book.id);
      const r = await api.suggestOutline(book.id, { chapterCount });
      setItems(r.outline);
      setAdopted(new Set(r.outline.map((o) => o.chapterNo)));
      setStep('review');
    } catch (e) {
      setError(`蓝图生成失败：${(e as Error).message}\n可到书详情页手填蓝图后从书架发起生成。`);
    } finally {
      setBusy(false);
    }
  };

  const toggle = (n: number) => {
    setAdopted((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });
  };

  const saveAndContinue = async () => {
    setError('');
    setBusy(true);
    try {
      for (const it of items.filter((i) => adopted.has(i.chapterNo))) {
        await api.putBlueprint(bookId, it.chapterNo, {
          title: (titles[it.chapterNo] ?? '').trim() || `第${it.chapterNo}章`,
          blueprint: it.blueprint,
          targetChars: Math.max(500, Math.trunc(chars[it.chapterNo] ?? 3000) || 3000),
        });
      }
      setStep('launch');
    } catch (e) {
      setError(`蓝图保存失败：${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const launch = async () => {
    setError('');
    setBusy(true);
    try {
      const toChapter = items.length > 0 ? items[items.length - 1].chapterNo : chapterCount;
      const r = await api.createRun({ bookId, mode: 'generate', fromChapter: 1, toChapter });
      navigate(`/runs/${r.runId}`);
    } catch (e) {
      setError(`发起生成失败：${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-bold">新书</h1>
      <p className="mt-1 text-sm text-muted">① 设定 → ② 蓝图审阅 → ③ 发起生成（全新成书，生成模式注入风格档案）</p>
      {error && <p className="mt-4 whitespace-pre-line rounded border border-danger bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}

      {step === 'setup' && (
        <div className="mt-6 space-y-3">
          <input
            className="w-full rounded border px-3 py-2"
            placeholder="书名"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <textarea
            className="w-full rounded border px-3 py-2"
            rows={8}
            placeholder="世界观 / 规则（越具体越好）"
            value={worldview}
            onChange={(e) => setWorldview(e.target.value)}
          />
          <textarea
            className="w-full rounded border px-3 py-2"
            rows={4}
            placeholder="全书剧情大纲（可选）：分卷 / 关键转折 / 结局走向"
            value={outlineText}
            onChange={(e) => setOutlineText(e.target.value)}
          />
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">人物卡</span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setCards((prev) => [...prev, { name: '', setting: '' }])}
              >
                添加人物
              </Button>
            </div>
            {cards.map((c, i) => (
              <div key={i} className="rounded border px-3 py-2">
                <div className="flex items-center gap-2">
                  <input
                    className="w-40 rounded border px-2 py-1"
                    placeholder="姓名"
                    aria-label={`人物卡姓名${i + 1}`}
                    value={c.name}
                    onChange={(e) =>
                      setCards((prev) => prev.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)))
                    }
                  />
                  <Button
                    variant="quiet"
                    tone="danger"
                    size="sm"
                    className="ml-auto"
                    onClick={() => setCards((prev) => prev.filter((_, k) => k !== i))}
                  >
                    移除
                  </Button>
                </div>
                <textarea
                  className="mt-1 w-full rounded border px-2 py-1 text-sm"
                  rows={2}
                  placeholder="人物设定（身份 / 性格 / 目标…）"
                  aria-label={`人物卡设定${i + 1}`}
                  value={c.setting}
                  onChange={(e) =>
                    setCards((prev) => prev.map((x, k) => (k === i ? { ...x, setting: e.target.value } : x)))
                  }
                />
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="new-book-chapter-count" className="text-sm">
              章节数
            </label>
            <input
              id="new-book-chapter-count"
              className="w-24 rounded border px-3 py-2"
              type="number"
              min={1}
              max={50}
              value={chapterCount}
              onChange={(e) => setChapterCount(Number(e.target.value) || 1)}
            />
          </div>
          <Button
            variant="primary"
            disabled={busy}
            onClick={() => void start()}
          >
            建书并生成蓝图
          </Button>
          {busy && <p className="text-sm text-muted">蓝图勾画中…约需数分钟</p>}
        </div>
      )}

      {step === 'review' && (
        <div className="mt-6">
          <div className="space-y-3">
            {items.map((it) => (
              <div key={it.chapterNo} className="rounded border px-4 py-3">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    aria-label={`采用第${it.chapterNo}章`}
                    checked={adopted.has(it.chapterNo)}
                    onChange={() => toggle(it.chapterNo)}
                  />
                  <span className="font-medium">第{it.chapterNo}章</span>
                  <span className="min-w-0 truncate text-sm">{it.blueprint.goal}</span>
                  <Button
                    variant="quiet"
                    tone="primary"
                    size="sm"
                    className="ml-auto"
                    onClick={() => setEditing(editing === it.chapterNo ? null : it.chapterNo)}
                  >
                    {editing === it.chapterNo ? '收起' : '编辑'}
                  </Button>
                </div>
                <ul className="mt-1 list-disc pl-6 text-sm text-muted">
                  {it.blueprint.beats.map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                </ul>
                {editing === it.chapterNo && (
                  <div className="mt-2 space-y-2">
                    <input
                      className="w-full rounded border px-3 py-2"
                      aria-label={`第${it.chapterNo}章标题`}
                      placeholder={`第${it.chapterNo}章`}
                      onChange={(e) => setTitles((prev) => ({ ...prev, [it.chapterNo]: e.target.value }))}
                    />
                    <input
                      className="w-32 rounded border px-3 py-2"
                      type="number"
                      min={500}
                      step={100}
                      aria-label={`第${it.chapterNo}章目标字数`}
                      onChange={(e) => setChars((prev) => ({ ...prev, [it.chapterNo]: Number(e.target.value) }))}
                    />
                    <pre className="mt-2 rounded border bg-bg px-3 py-2 font-mono text-xs">
                      {JSON.stringify(it.blueprint, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            ))}
          </div>
          <Button
            variant="primary"
            className="mt-4"
            disabled={busy || adopted.size === 0}
            onClick={() => void saveAndContinue()}
          >
            保存蓝图并继续（{adopted.size}/{items.length} 章）
          </Button>
        </div>
      )}

      {step === 'launch' && (
        <div className="mt-6">
          <p className="text-sm text-ink">
            将从第 1 章生成到第 {items.length > 0 ? items[items.length - 1].chapterNo : chapterCount} 章。生成前可到书详情页绑定风格档案（生成模式注入）。
          </p>
          <Button
            variant="primary"
            className="mt-3"
            disabled={busy}
            onClick={() => void launch()}
          >
            发起生成（1..{items.length > 0 ? items[items.length - 1].chapterNo : chapterCount}）
          </Button>
        </div>
      )}
    </main>
  );
}
