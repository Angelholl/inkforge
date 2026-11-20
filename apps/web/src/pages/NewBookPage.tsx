import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { api, apiErrorText } from '../api/client';
import SettingsImportPanel from '../components/SettingsImportPanel';
import { Button } from '../components/ui';
import { checkboxBase, inputBase, inputNarrow, textareaBase } from '../components/Field';
import { decodeTextFile } from '../components/textFile';
import { buildStyleBindBody } from './BookDetailPage';
import type { StyleProfileDto } from '@inkforge/shared';

// decodeTextFile 已抽出至 components/textFile（设定集导入面板复用）；re-export 保持既有测试导入兼容
export { decodeTextFile } from '../components/textFile';

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
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  // 建档直选蒸馏档案（DEC-2026-1120-07）：加载失败降级为不显示该区（console.warn），不阻断建档
  const [profiles, setProfiles] = useState<StyleProfileDto[] | null>(null);
  const [checkedProfiles, setCheckedProfiles] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    api
      .listStyleProfiles()
      .then((list) => {
        if (alive) setProfiles(list);
      })
      .catch((e) => {
        console.warn('风格档案列表加载失败，建档页隐藏档案选择区', e);
      });
    return () => {
      alive = false;
    };
  }, []);

  // 勾选上限逻辑照抄 BookDetailPage StyleBindPanel 的 toggle（满 4 禁勾）
  const toggleProfile = (id: string) => {
    setCheckedProfiles((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 4) return prev; // 上限 4（1 主 + 3 辅）
      return [...prev, id];
    });
  };

  const createBook = async () => {
    setError('');
    setMsg('');
    if (!title.trim()) return setError('书名不能为空');
    setBusy(true);
    try {
      const book = await api.createBook({ title: title.trim(), description: description.trim() || undefined });
      // 建档直选档案（DEC-2026-1120-07）：建书成功后紧接着绑定；绑定失败不回滚建书，仍走原跳转链路（步骤②→书详情）
      if (checkedProfiles.length > 0) {
        try {
          await api.bindStyle(book.id, buildStyleBindBody(checkedProfiles));
        } catch (be) {
          setMsg(`书已建，但风格绑定失败：${apiErrorText(be)}`);
        }
      }
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
    <main className="mx-auto max-w-3xl px-8 py-8">
      <h1 className="text-xl font-semibold">新建小说（续写）</h1>
      <p className="mt-1 text-sm text-muted">① 建书 → ② 导入原文 → ③ 到书详情页设定剧情/人物/字数并发起续写</p>
      {error && <pre className="mt-4 whitespace-pre-wrap rounded-card border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">{error}</pre>}
      {msg && <pre className="mt-4 whitespace-pre-wrap rounded-card border border-warn/30 bg-warn-soft px-3 py-2 text-sm text-warn">{msg}</pre>}

      {wiz.step === 1 && (
        <div className="mt-6 space-y-3">
          <input className={inputBase} placeholder="书名" value={title} onChange={(e) => setTitle(e.target.value)} />
          <textarea
            className={textareaBase}
            placeholder="简介 / 世界观（可选；导入后也可在书详情页编辑）"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <Button variant="primary" disabled={busy} onClick={createBook}>
            建书并进入导入
          </Button>
          {/* 建档直选蒸馏档案（DEC-2026-1120-07）：复用绑定语义（上限 4、首位=主档），body 构造走共享 buildStyleBindBody */}
          {profiles && profiles.length > 0 && (
            <div className="border-t border-line pt-4">
              <p className="text-sm font-medium">风格档案（可选，最多 4 个，第 1 个为主档）</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {profiles.map((p) => {
                  const isOn = checkedProfiles.includes(p.id);
                  const full = !isOn && checkedProfiles.length >= 4;
                  return (
                    <label key={p.id} className="flex items-center gap-1.5 text-sm" title={full ? '最多绑定 4 个（1 主 + 3 辅）' : undefined}>
                      <input
                        type="checkbox"
                        className={checkboxBase}
                        aria-label={`风格档案勾选-${p.name}`}
                        checked={isOn}
                        disabled={full}
                        onChange={() => toggleProfile(p.id)}
                      />
                      {p.name}（v{p.version}）
                    </label>
                  );
                })}
              </div>
            </div>
          )}
          {/* 设定集直接导入（DEC-2026-1120-04）：成功建书后流入步骤②导入原文，向导其余不变 */}
          <div className="border-t border-line pt-4">
            <p className="text-sm font-medium">或从设定集直接导入（自动建书 + 写入世界观 / 大纲 / 人物卡 / 伏笔；导入后仍可在下一步导原文）</p>
            <div className="mt-3">
              <SettingsImportPanel onApplied={({ result }) => setWiz({ step: 2, bookId: result.bookId })} />
            </div>
          </div>
        </div>
      )}

      {wiz.step === 2 && (
        <div className="mt-6 space-y-3">
          <textarea
            className={`${textareaBase} font-mono`}
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
              className="flex cursor-pointer flex-col items-center gap-1 rounded border border-dashed border-line px-3 py-6 text-sm text-muted transition-colors hover:border-line-strong hover:bg-primary-soft/40"
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
                <li key={i} className="rounded-card border border-line bg-surface px-3 py-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <input
                      className={`${inputNarrow} flex-1`}
                      value={c.title}
                      onChange={(e) => setParsed(parsed.map((p, k) => (k === i ? { ...p, title: e.target.value } : p)))}
                    />
                    <span className="text-faint tabular-nums">{c.content.length} 字</span>
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
