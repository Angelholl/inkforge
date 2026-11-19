import { useState } from 'react';
import { api } from '../api/client';
import { FULL_TEXT_REWRITE_MAX_CHARS } from '@inkforge/shared';
import { Button } from '../components/ui';

interface Props {
  versionId: string;
  /** 当前所选版本字数（countChars 口径）；提供时显示在开关文案并做 8000 字预检（与服务端硬门同串） */
  fullTextChars?: number;
  onCreated?: () => void;
}

/** 段落四操作预设（DEC-2026-1115-04 三小件 C1，instruction 文案钉死）；fullInstruction=全文模式文案（DEC-2026-1120-01）。 */
export const SELECTION_PRESETS = [
  { label: '续写', instruction: '从选段结尾自然续写 2-3 句，保持人称与时态', fullInstruction: '从全文结尾自然续写 2-3 句，保持人称与时态' },
  { label: '润色', instruction: '优化选段表达，不改情节与信息量', fullInstruction: '优化全文表达与用词，不改情节与信息量' },
  { label: '扩写', instruction: '在选段基础上扩写细节与感官描写，篇幅约增加一倍', fullInstruction: '在全文基础上扩写细节与感官描写，篇幅约增加一半' },
  { label: '改对话', instruction: '将选段叙述改写为人物对话呈现', fullInstruction: '将全文中适合场景的叙述改写为人物对话呈现' },
] as const;

/** 选段重写/全文改写（DEC-2026-1120-01）：粘贴选段或勾选全文 + 指令（或预设一键填充）→ 单轮 targeted 重写（新版本 kind=revised，不动 current 指针）。 */
export function SelectionRewrite({ versionId, fullTextChars, onCreated }: Props) {
  const [full, setFull] = useState(false);
  const [selection, setSelection] = useState('');
  const [instruction, setInstruction] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (full) {
      if (!instruction.trim()) {
        setMsg('指令不能为空');
        return;
      }
      if (fullTextChars != null && fullTextChars > FULL_TEXT_REWRITE_MAX_CHARS) {
        setMsg(`全文 ${fullTextChars} 字超出单轮改写上限 ${FULL_TEXT_REWRITE_MAX_CHARS} 字，请改用选段重写（分段粘贴）或批量校对`);
        return;
      }
    } else if (!selection.trim() || !instruction.trim()) {
      setMsg('选段与指令均不能为空');
      return;
    }
    setBusy(true);
    try {
      const v = full ? await api.rewriteFull(versionId, instruction) : await api.rewriteSelection(versionId, selection, instruction);
      setMsg(
        full
          ? `已生成全文改写版本 ${v.id.slice(0, 8)}（未移动 current 指针，可在版本链中回滚采纳）`
          : `已生成重写版本 ${v.id.slice(0, 8)}（未移动 current 指针，可在版本链中回滚采纳）`,
      );
      onCreated?.();
    } catch (e) {
      setMsg(`失败：${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-4 rounded border p-4" data-testid="selection-rewrite">
      <h3 className="font-semibold">选段重写</h3>
      <label className="mt-2 flex items-center gap-2 text-sm">
        <input type="checkbox" aria-label="改写全文" checked={full} onChange={(e) => setFull(e.target.checked)} />
        改写全文（整章正文{fullTextChars != null ? `，约 ${fullTextChars} 字` : ''}）
      </label>
      {!full && (
        <textarea
          className="mt-2 h-24 w-full rounded border p-2 text-sm"
          placeholder="粘贴要改写的选段"
          value={selection}
          onChange={(e) => setSelection(e.target.value)}
        />
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        {SELECTION_PRESETS.map((p) => (
          <Button
            key={p.label}
            variant="quiet"
            size="sm"
            aria-label={`预设-${p.label}`}
            onClick={() => setInstruction(full ? p.fullInstruction : p.instruction)}
          >
            {p.label}
          </Button>
        ))}
      </div>
      <input
        className="mt-2 w-full rounded border p-2 text-sm"
        placeholder="改写指令，例如：压缩到三分之一并去掉套话"
        aria-label="改写指令"
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
      />
      <Button variant="primary" size="sm" className="mt-2" onClick={submit} loading={busy}>
        {full ? '提交全文改写' : '提交选段重写'}
      </Button>
      {msg && <p className="mt-2 text-sm text-muted">{msg}</p>}
    </section>
  );
}
