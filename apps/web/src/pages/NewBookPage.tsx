import { useState } from 'react';
import { useNavigate } from 'react-router';
import { api } from '../api/client';
import type { ChapterBlueprint } from '@inkforge/shared';

// 章题行：第X章/节/回（汉字或数字），其后同行不带句号换行
const CHAPTER_LINE_RE = /^第[0-9一二三四五六七八九十百零两]+[章节回][^。\n]*$/m;

export interface ParsedChapter {
  title: string;
  content: string;
}

export function splitChapters(raw: string): ParsedChapter[] {
  const lines = raw.split('\n');
  const idx: number[] = [];
  lines.forEach((line, i) => {
    if (CHAPTER_LINE_RE.test(line.trim())) idx.push(i);
  });
  if (idx.length === 0) {
    const title = lines[0]?.trim().slice(0, 40) || '第1章';
    return [{ title, content: raw.trim() }];
  }
  const out: ParsedChapter[] = [];
  for (let k = 0; k < idx.length; k++) {
    const start = idx[k];
    const end = k + 1 < idx.length ? idx[k + 1] : lines.length;
    out.push({ title: lines[start].trim(), content: lines.slice(start + 1, end).join('\n').trim() });
  }
  return out;
}

type WizardState =
  | { step: 1 }
  | { step: 2; bookId: string }
  | { step: 3; bookId: string; nextChapterNo: number };

export default function NewBookPage() {
  const navigate = useNavigate();
  const [wiz, setWiz] = useState<WizardState>({ step: 1 });
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [rawText, setRawText] = useState('');
  const [parsed, setParsed] = useState<ParsedChapter[]>([]);
  const [blueprintJson, setBlueprintJson] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const createBook = async () => {
    setError('');
    if (!title.trim()) return setError('书名不能为空');
    setBusy(true);
    try {
      const book = await api.createBook({ title: title.trim(), description: description.trim() || undefined });
      setWiz({ step: 2, bookId: book.id });
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const preview = () => {
    setError('');
    setParsed(splitChapters(rawText));
  };

  const removeChapter = (i: number) => {
    setParsed(parsed.filter((_, k) => k !== i));
  };

  const importOriginal = async () => {
    setError('');
    if (parsed.length === 0) return setError('请先拆章预览');
    setBusy(true);
    try {
      const bookId = wiz.step === 2 ? wiz.bookId : '';
      const r = await api.importOriginal(bookId, { chapters: parsed });
      setWiz({ step: 3, bookId, nextChapterNo: r.lastChapterNo + 1 });
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const suggestBlueprint = async () => {
    setError('');
    const bookId = wiz.step === 3 ? wiz.bookId : '';
    const chapterNo = wiz.step === 3 ? wiz.nextChapterNo : 0;
    setBusy(true);
    try {
      const r = await api.suggestBlueprint(bookId, { chapterNo });
      setBlueprintJson(JSON.stringify(r.blueprint, null, 2));
    } catch (e) {
      setError(`${String(e)}\n（AI 建议失败，可直接在下方手填蓝图 JSON）`);
    } finally {
      setBusy(false);
    }
  };

  const summarize = async (chapterNo: number) => {
    setError('');
    const bookId = wiz.step === 3 ? wiz.bookId : '';
    setBusy(true);
    try {
      await api.summarizeChapter(bookId, chapterNo);
      setError(`第 ${chapterNo} 章摘要已生成`);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const startContinue = async () => {
    setError('');
    const bookId = wiz.step === 3 ? wiz.bookId : '';
    const chapterNo = wiz.step === 3 ? wiz.nextChapterNo : 0;
    let blueprint: ChapterBlueprint;
    try {
      blueprint = JSON.parse(blueprintJson) as ChapterBlueprint;
    } catch {
      return setError('蓝图 JSON 解析失败，请检查格式');
    }
    if (!blueprint.goal?.trim()) return setError('蓝图缺 goal');
    setBusy(true);
    try {
      await api.putBlueprint(bookId, chapterNo, { title: `第${chapterNo}章`, blueprint, targetChars: 3000 });
      const r = await api.createRun({ bookId, fromChapter: chapterNo, toChapter: chapterNo, mode: 'continue' });
      navigate(`/runs/${r.runId}`);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-bold">新建小说（续写）</h1>
      <p className="mt-1 text-sm text-gray-500">① 建书 → ② 导入原文 → ③ 发起续写</p>
      {error && <pre className="mt-4 whitespace-pre-wrap rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</pre>}

      {wiz.step === 1 && (
        <div className="mt-6 space-y-3">
          <input className="w-full rounded border px-3 py-2" placeholder="书名" value={title} onChange={(e) => setTitle(e.target.value)} />
          <textarea className="w-full rounded border px-3 py-2" placeholder="简介（可选）" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          <button className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50" disabled={busy} onClick={createBook}>
            建书并进入导入
          </button>
        </div>
      )}

      {wiz.step === 2 && (
        <div className="mt-6 space-y-3">
          <textarea
            className="w-full rounded border px-3 py-2 font-mono text-sm"
            placeholder="粘贴全文，或选择本地 txt/md 文件"
            rows={12}
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
          />
          <input
            type="file"
            accept=".txt,.md"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const reader = new FileReader();
              reader.onload = () => setRawText(String(reader.result ?? ''));
              reader.readAsText(f);
            }}
          />
          <div className="flex gap-2">
            <button className="rounded border px-4 py-2" onClick={preview}>
              拆章预览
            </button>
            <button className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50" disabled={busy || parsed.length === 0} onClick={importOriginal}>
              导入 {parsed.length} 章
            </button>
          </div>
          {parsed.length > 0 && (
            <ul className="space-y-2" aria-label="拆章预览">
              {parsed.map((c, i) => (
                <li key={i} className="rounded border px-3 py-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <input
                      className="flex-1 rounded border px-2 py-1"
                      value={c.title}
                      onChange={(e) => setParsed(parsed.map((p, k) => (k === i ? { ...p, title: e.target.value } : p)))}
                    />
                    <span className="text-gray-400">{c.content.length} 字</span>
                    <button className="text-red-600" onClick={() => removeChapter(i)}>
                      删除
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {wiz.step === 3 && (
        <div className="mt-6 space-y-3">
          <p className="text-sm">
            导入完成，下一章为 <strong>第 {wiz.step === 3 ? wiz.nextChapterNo : 0} 章</strong>。
          </p>
          <div>
            <p className="text-sm text-gray-600">补摘要（可选，逐章；导入章无摘要会影响续写连续性）：</p>
            <div className="mt-1 flex flex-wrap gap-2">
              {wiz.step === 3 &&
                Array.from({ length: wiz.nextChapterNo - 1 }, (_, k) => k + 1).map((n) => (
                  <button key={n} className="rounded border px-2 py-1 text-sm disabled:opacity-50" disabled={busy} onClick={() => summarize(n)}>
                    补摘要·第 {n} 章
                  </button>
                ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button className="rounded border px-4 py-2 disabled:opacity-50" disabled={busy} onClick={suggestBlueprint}>
              AI 建议蓝图
            </button>
          </div>
          <textarea
            className="w-full rounded border px-3 py-2 font-mono text-sm"
            placeholder='蓝图 JSON，如 {"goal":"…","beats":["…"],"mustHaveBeats":[],"bannedTopics":[]}'
            rows={10}
            value={blueprintJson}
            onChange={(e) => setBlueprintJson(e.target.value)}
          />
          <button className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50" disabled={busy} onClick={startContinue}>
            发起续写（第 {wiz.step === 3 ? wiz.nextChapterNo : 0} 章）
          </button>
        </div>
      )}
    </main>
  );
}
