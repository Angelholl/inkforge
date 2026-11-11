import { useState } from 'react';
import { api } from '../api/client';

interface Props {
  versionId: string;
  onCreated?: () => void;
}

/** 选段重写：粘贴选段 + 指令 → 单轮 targeted 重写（新版本 kind=revised，不动 current 指针）。 */
export function SelectionRewrite({ versionId, onCreated }: Props) {
  const [selection, setSelection] = useState('');
  const [instruction, setInstruction] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!selection.trim() || !instruction.trim()) {
      setMsg('选段与指令均不能为空');
      return;
    }
    setBusy(true);
    try {
      const v = await api.rewriteSelection(versionId, selection, instruction);
      setMsg(`已生成重写版本 ${v.id.slice(0, 8)}（未移动 current 指针，可在版本链中回滚采纳）`);
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
      <textarea
        className="mt-2 h-24 w-full rounded border p-2 text-sm"
        placeholder="粘贴要改写的选段"
        value={selection}
        onChange={(e) => setSelection(e.target.value)}
      />
      <input
        className="mt-2 w-full rounded border p-2 text-sm"
        placeholder="改写指令，例如：压缩到三分之一并去掉套话"
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
      />
      <button className="mt-2 rounded bg-blue-600 px-4 py-1.5 text-white disabled:opacity-50" onClick={submit} disabled={busy}>
        {busy ? '重写中…' : '提交选段重写'}
      </button>
      {msg && <p className="mt-2 text-sm text-gray-600">{msg}</p>}
    </section>
  );
}
