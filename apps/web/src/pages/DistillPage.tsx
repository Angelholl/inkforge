import { useEffect, useState } from 'react';
import { API_BASE } from '../api/client';
import StyleProfilesSection from './StyleProfilesSection';

export default function DistillPage() {
  const [distillTemplate, setDistillTemplate] = useState('');
  const [tplMsg, setTplMsg] = useState('');
  const [tplBusy, setTplBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // 蒸馏模板（空串=默认）
    fetch(`${API_BASE}/api/settings/distill-template`)
      .then(async (r) => (r.ok ? ((await r.json()) as { template: string }) : { template: '' }))
      .then((t) => {
        if (!cancelled) setDistillTemplate(t.template ?? '');
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const saveTemplate = async (template: string) => {
    setTplMsg('');
    setTplBusy(true);
    try {
      const r = await fetch(`${API_BASE}/api/settings/distill-template`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ template }),
      });
      if (!r.ok) throw new Error(`PUT → ${r.status}`);
      setDistillTemplate(template);
      setTplMsg(template.trim() === '' ? '已恢复默认模板' : '蒸馏模板已保存');
    } catch {
      setTplMsg('模板保存失败，请确认服务已连接后重试');
    } finally {
      setTplBusy(false);
    }
  };

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="text-2xl font-bold">蒸馏工作台</h1>

      <section className="mt-10">
        <h2 className="text-xl font-bold">蒸馏模板</h2>
        <p className="mt-1 text-xs text-faint">
          蒸馏分析指令（DIM/AXIS/RULES 行协议）；留空恢复默认模板。可按题材调整侧重点，如「优先量化句长分布与对话占比」。
        </p>
        <textarea
          className="mt-2 h-48 w-full rounded border p-3 font-mono text-xs"
          aria-label="蒸馏模板"
          placeholder="（空 = 使用默认模板）"
          value={distillTemplate}
          onChange={(e) => setDistillTemplate(e.target.value)}
        />
        <div className="mt-2 flex gap-2">
          <button className="rounded bg-primary px-4 py-1.5 text-sm text-white" disabled={tplBusy} onClick={() => void saveTemplate(distillTemplate)}>
            保存模板
          </button>
          <button className="rounded bg-bg px-4 py-1.5 text-sm" disabled={tplBusy} onClick={() => void saveTemplate('')}>
            恢复默认
          </button>
        </div>
        {tplMsg && <p className="mt-2 text-sm text-ink">{tplMsg}</p>}
      </section>

      <StyleProfilesSection />
    </main>
  );
}
