import { useRef, useState } from 'react';
import type { SettingsImportApplyResult, SettingsImportDraftDto } from '@inkforge/shared';
import { api } from '../api/client';
import { Button } from './ui';
import { checkboxBase, inputBase, inputNarrow, textareaBase } from './Field';
import { decodeTextFile } from './textFile';

// 槽位预算（config BUDGETS_DRAFT.worldview / BUDGETS_OUTLINE.outline，DEC-2026-1120-04① 扩槽后）
const DESCRIPTION_BUDGET = 16000;
const OUTLINE_BUDGET = 8000;

export interface SettingsImportApplied {
  result: SettingsImportApplyResult;
  draft: SettingsImportDraftDto;
}

/** 人物卡 baseSetting 沿 {"设定": text} JSON 包裹约定；非 JSON/非法 JSON 显示原文。 */
function unwrapSetting(baseSetting: string): string {
  const raw = (baseSetting ?? '').trim();
  if (!raw || raw === '{}') return '';
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    if (obj && typeof obj === 'object' && !Array.isArray(obj) && typeof obj['设定'] === 'string') {
      return obj['设定'];
    }
  } catch {
    /* 非法 JSON 显示原文 */
  }
  return raw;
}

function wrapSetting(text: string): string {
  const t = text.trim();
  return t !== '' ? JSON.stringify({ 设定: t }) : '{}';
}

function charCount(n: number, budget: number): { text: string; over: boolean } {
  return n > budget
    ? { text: `${n} 字（超 ${budget}，超出部分生成时截断）`, over: true }
    : { text: `${n} 字`, over: false };
}

/**
 * 设定集导入面板（DEC-2026-1120-04）：选文件 → 解析预览（可编辑）→ 确认导入建书。
 * 新书/续写两入口共用；onApplied 回传建书结果与草稿，由入口各自接线（续写进导入原文步、新书进蓝图审阅）。
 */
export default function SettingsImportPanel({ onApplied }: { onApplied: (a: SettingsImportApplied) => void }) {
  const [rawText, setRawText] = useState('');
  const [fileInfo, setFileInfo] = useState('');
  const [draft, setDraft] = useState<SettingsImportDraftDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const preview = async () => {
    setError('');
    setBusy(true);
    try {
      setDraft(await api.importSettingsPreview({ content: rawText }));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    if (!draft) return;
    setError('');
    setBusy(true);
    try {
      const result = await api.importSettingsApply({ content: rawText, draft });
      onApplied({ result, draft });
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const descCount = charCount(draft?.description.length ?? 0, DESCRIPTION_BUDGET);
  const outlineCount = charCount(draft?.outline.length ?? 0, OUTLINE_BUDGET);

  return (
    <div className="space-y-3" data-testid="settings-import-panel">
      <textarea
        className={`${textareaBase} font-mono`}
        placeholder="粘贴设定集全文，或选择本地 md / txt 文件"
        aria-label="设定集全文"
        rows={6}
        value={rawText}
        onChange={(e) => {
          setRawText(e.target.value);
          setFileInfo('');
        }}
      />
      <input
        type="file"
        id="settings-import-file"
        accept=".md,.txt"
        className="hidden"
        ref={fileRef}
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
        htmlFor="settings-import-file"
        className="flex cursor-pointer flex-col items-center gap-1 rounded border border-dashed border-line px-3 py-5 text-sm text-muted transition-colors hover:border-line-strong hover:bg-primary-soft/40"
      >
        <span>点击选择设定集 md / txt 文件（自动识别 UTF-8 / GBK 编码）</span>
        {fileInfo && <span className="text-xs font-medium text-primary-strong">{fileInfo}</span>}
      </label>
      {error && (
        <pre className="whitespace-pre-wrap rounded-card border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">{error}</pre>
      )}
      <Button variant="secondary" disabled={busy || rawText.trim() === ''} onClick={() => void preview()}>
        解析预览
      </Button>

      {draft && (
        <div className="space-y-3 rounded-card border border-line bg-surface px-4 py-3">
          <div>
            <label htmlFor="settings-import-title" className="text-sm font-medium">
              书名
            </label>
            <input
              id="settings-import-title"
              className={`${inputBase} mt-1`}
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor="settings-import-description" className="text-sm font-medium">
              世界观（含规则）· <span className={descCount.over ? 'text-danger' : 'text-faint'}>{descCount.text}</span>
            </label>
            <textarea
              id="settings-import-description"
              className={`${textareaBase} mt-1`}
              rows={5}
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor="settings-import-outline" className="text-sm font-medium">
              剧情大纲（卷级梗概）· <span className={outlineCount.over ? 'text-danger' : 'text-faint'}>{outlineCount.text}</span>
            </label>
            <textarea
              id="settings-import-outline"
              className={`${textareaBase} mt-1`}
              rows={3}
              value={draft.outline}
              onChange={(e) => setDraft({ ...draft, outline: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">人物卡（{draft.characters.length}）</span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setDraft({ ...draft, characters: [...draft.characters, { name: '', baseSetting: '{}' }] })}
              >
                添加人物
              </Button>
            </div>
            {draft.characters.map((c, i) => (
              <div key={i} className="rounded-card border border-line bg-bg px-3 py-2">
                <div className="flex items-center gap-2">
                  <input
                    className={`${inputNarrow} w-40`}
                    placeholder="姓名"
                    aria-label={`设定集人物姓名${i + 1}`}
                    value={c.name}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        characters: draft.characters.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)),
                      })
                    }
                  />
                  <Button
                    variant="quiet"
                    tone="danger"
                    size="sm"
                    className="ml-auto"
                    onClick={() => setDraft({ ...draft, characters: draft.characters.filter((_, k) => k !== i) })}
                  >
                    移除
                  </Button>
                </div>
                <textarea
                  className={`${textareaBase} mt-1`}
                  rows={2}
                  placeholder="人物设定（身份 / 性格 / 目标…）"
                  aria-label={`设定集人物设定${i + 1}`}
                  value={unwrapSetting(c.baseSetting)}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      characters: draft.characters.map((x, k) => (k === i ? { ...x, baseSetting: wrapSetting(e.target.value) } : x)),
                    })
                  }
                />
              </div>
            ))}
          </div>
          <div className="text-sm text-muted">
            大纲树：{draft.outlineTree.volumes.length} 卷 ·{' '}
            {draft.outlineTree.volumes.reduce((n, v) => n + v.stages.length, 0)} 阶段 ·{' '}
            {draft.outlineTree.volumes.reduce((n, v) => n + v.stages.reduce((m, s) => m + s.cards.length, 0), 0)} 卡（导入后书详情页可编辑）
          </div>
          <div className="space-y-2">
            <span className="text-sm font-medium">伏笔（{draft.foreshadowings.length}）</span>
            {draft.foreshadowings.map((f, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  className={`${inputBase} flex-1`}
                  aria-label={`设定集伏笔${i + 1}`}
                  value={f.description}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      foreshadowings: draft.foreshadowings.map((x, k) => (k === i ? { ...x, description: e.target.value } : x)),
                    })
                  }
                />
                <input
                  className={`${inputNarrow} w-20`}
                  type="number"
                  min={1}
                  aria-label={`设定集伏笔埋设章${i + 1}`}
                  value={f.plantedCh}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      foreshadowings: draft.foreshadowings.map((x, k) =>
                        k === i ? { ...x, plantedCh: Math.max(1, Math.trunc(Number(e.target.value)) || 1) } : x,
                      ),
                    })
                  }
                />
                <Button
                  variant="quiet"
                  tone="danger"
                  size="sm"
                  onClick={() => setDraft({ ...draft, foreshadowings: draft.foreshadowings.filter((_, k) => k !== i) })}
                >
                  移除
                </Button>
              </div>
            ))}
          </div>
          {draft.styleSection.trim() !== '' && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className={checkboxBase}
                aria-label="导入文风节为风格档案并绑定本书"
                checked={draft.importStyle}
                onChange={(e) => setDraft({ ...draft, importStyle: e.target.checked })}
              />
              导入文风节为风格档案并绑定本书
            </label>
          )}
          {draft.warnings.length > 0 && (
            <ul className="list-disc space-y-1 pl-6 text-sm text-muted" aria-label="设定集解析警示">
              {draft.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}
          <Button variant="primary" disabled={busy || draft.title.trim() === ''} onClick={() => void apply()}>
            确认导入建书
          </Button>
        </div>
      )}
    </div>
  );
}
