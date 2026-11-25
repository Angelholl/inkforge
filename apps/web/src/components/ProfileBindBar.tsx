import { useEffect, useState } from 'react';
import { Button } from './ui';
import { selectBase } from './Field';

/** 书页单档案绑定条（BR-2）：select + 保存绑定/解绑 + 当前绑定回显；按钮形态逐字对齐 StyleBindPanel。 */
export default function ProfileBindBar({
  label,
  profiles,
  boundId,
  onBind,
}: {
  label: string;
  profiles: Array<{ id: string; name: string }>;
  boundId: string | null | undefined;
  onBind: (profileId: string | null) => void;
}) {
  const [sel, setSel] = useState(boundId ?? '');
  useEffect(() => {
    setSel(boundId ?? '');
  }, [boundId]);
  const boundName = profiles.find((p) => p.id === boundId)?.name;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-medium">{label}</span>
      <select className={selectBase} aria-label={`${label}绑定`} value={sel} onChange={(e) => setSel(e.target.value)}>
        <option value="">（未绑定）</option>
        {profiles.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <Button aria-label={`${label}保存绑定`} variant="primary" disabled={!sel || sel === boundId} onClick={() => onBind(sel)}>
        保存绑定
      </Button>
      <Button aria-label={`${label}解绑`} variant="secondary" disabled={!boundId} onClick={() => onBind(null)}>
        解绑
      </Button>
      <span className="text-xs text-faint">{boundId ? `当前绑定：${boundName ?? '（档案已删除）'}` : '未绑定'}</span>
    </div>
  );
}
