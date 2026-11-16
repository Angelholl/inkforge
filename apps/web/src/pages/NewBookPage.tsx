import { useState } from 'react';
import { useNavigate } from 'react-router';
import { api } from '../api/client';
import { Button } from '../components/ui';

// 章题行三分支（owner 反馈：（一）/一、等形态拆章无法识别）：
// ① 第X章/节/回（容忍「第 1 章」空格排版）；② 数字顿号「一、雪夜」（排顿号复现，防「一、二、三」误切）；
// ③ 全/半角括号「（一）雪夜」。防误判约束沿旧例：章题行内不得含句号；「1.5 万」「（完）」天然不命中。
// 显式不支持半角点「1. 雪夜」（会误伤「1.5 万」类数字，样本再现再议）。
const CH_NUM = '[0-9〇零一二三四五六七八九十百千两]';
const CHAPTER_LINE_RE = new RegExp(
  `^(?:第\\s*${CH_NUM}+\\s*[章节回]\\s*[^。\\n]*|${CH_NUM}+\\s*、\\s*[^、。\\n]*|[（(]\\s*${CH_NUM}+\\s*[）)]\\s*[^。\\n]*)$`,
);

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

export interface DecodedText {
  text: string;
  encoding: string;
}

/**
 * 文本文件解码探测（owner 反馈③：GBK 文件按 UTF-8 直读全篇乱码）：
 * ① BOM 定码（UTF-16LE/BE、UTF-8）；② 无 BOM 先试 strict UTF-8；
 * ③ 解出含 C1 控制符（U+0080–U+009F，正常中文文本几乎不含）→ 判误判回退 GB18030（GBK/GB2312 超集）。
 */
export function decodeTextFile(buf: ArrayBuffer): DecodedText {
  const bytes = new Uint8Array(buf);
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { text: new TextDecoder('utf-16le').decode(buf), encoding: 'UTF-16LE' };
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return { text: new TextDecoder('utf-16be').decode(buf), encoding: 'UTF-16BE' };
  }
  const hasUtf8Bom = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  const body = hasUtf8Bom ? buf.slice(3) : buf;
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(body);
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i);
      if (c >= 0x80 && c <= 0x9f) return { text: new TextDecoder('gb18030').decode(body), encoding: 'GB18030' };
    }
    return { text, encoding: 'UTF-8' };
  } catch {
    /* 非 UTF-8：按中文 Windows 最常见编码回退 */
  }
  return { text: new TextDecoder('gb18030').decode(body), encoding: 'GB18030' };
}

type WizardState = { step: 1 } | { step: 2; bookId: string };

/**
 * 入口 A 续写向导（owner 四反馈②④拍板：设定统一落点=书详情页）：
 * ① 建书 → ② 导入原文 → 成功后直接进书详情页（世界观/大纲/人物卡/蓝图编辑/发起续写都在那一套面板，不再有第三步）。
 */
export default function NewBookPage() {
  const navigate = useNavigate();
  const [wiz, setWiz] = useState<WizardState>({ step: 1 });
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [rawText, setRawText] = useState('');
  const [parsed, setParsed] = useState<ParsedChapter[]>([]);
  const [fileInfo, setFileInfo] = useState('');
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
      await api.importOriginal(bookId, { chapters: parsed });
      // 统一落点（owner 拍板）：导入完成直接进书详情页，设定只有一套
      navigate(`/books/${bookId}`);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-bold">新建小说（续写）</h1>
      <p className="mt-1 text-sm text-muted">① 建书 → ② 导入原文 → ③ 到书详情页设定剧情/人物/字数并发起续写</p>
      {error && <pre className="mt-4 whitespace-pre-wrap rounded border border-danger bg-danger-soft px-3 py-2 text-sm text-danger">{error}</pre>}

      {wiz.step === 1 && (
        <div className="mt-6 space-y-3">
          <input className="w-full rounded border px-3 py-2" placeholder="书名" value={title} onChange={(e) => setTitle(e.target.value)} />
          <textarea
            className="w-full rounded border px-3 py-2"
            placeholder="简介 / 世界观（可选；导入后也可在书详情页编辑）"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <Button variant="primary" disabled={busy} onClick={createBook}>
            建书并进入导入
          </Button>
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
          {/* 文件选择区（owner 反馈①：原生 file input 裸奔无底框）——虚线框+文件名/编码回显 */}
          <div>
            <input
              type="file"
              id="import-original-file"
              accept=".txt,.md"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const reader = new FileReader();
                reader.onload = () => {
                  const { text, encoding } = decodeTextFile(reader.result as ArrayBuffer);
                  setRawText(text);
                  setFileInfo(`${f.name} · 已按 ${encoding} 解码（${text.length} 字）`);
                };
                reader.readAsArrayBuffer(f);
              }}
            />
            <label
              htmlFor="import-original-file"
              className="flex cursor-pointer flex-col items-center gap-1 rounded border border-dashed px-3 py-6 text-sm text-muted hover:border-primary hover:bg-primary-soft/40"
            >
              <span>点击选择本地 txt / md 文件（自动识别 UTF-8 / GBK 编码）</span>
              {fileInfo && <span className="text-xs font-medium text-primary-strong">{fileInfo}</span>}
            </label>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={preview}>
              拆章预览
            </Button>
            <Button variant="primary" disabled={busy || parsed.length === 0} onClick={importOriginal}>
              导入 {parsed.length} 章
            </Button>
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
                    <span className="text-faint">{c.content.length} 字</span>
                    <Button variant="quiet" tone="danger" size="sm" onClick={() => removeChapter(i)}>
                      删除
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </main>
  );
}
