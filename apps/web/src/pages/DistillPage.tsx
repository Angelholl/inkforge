import { useEffect, useState } from 'react';
import { API_BASE } from '../api/client';
import StyleProfilesSection from './StyleProfilesSection';
import PlotProfilesSection from './PlotProfilesSection';
import { Button } from '../components/ui';
import { textareaBase } from '../components/Field';

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
    <main className="mx-auto max-w-5xl px-8 py-8">
      <h1 className="text-xl font-semibold">蒸馏工作台</h1>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">蒸馏模板</h2>
        <p className="mt-1 text-xs text-faint">
          蒸馏分析指令（DIM/AXIS/RULES 行协议）；留空恢复默认模板。可按题材调整侧重点，如「优先量化句长分布与对话占比」。
        </p>
        <textarea
          className={`${textareaBase} mt-2 h-48 font-mono text-xs`}
          aria-label="蒸馏模板"
          placeholder="（空 = 使用默认模板）"
          value={distillTemplate}
          onChange={(e) => setDistillTemplate(e.target.value)}
        />
        <div className="mt-2 flex gap-2">
          <Button variant="primary" size="md" disabled={tplBusy} onClick={() => void saveTemplate(distillTemplate)}>
            保存模板
          </Button>
          <Button variant="secondary" size="md" disabled={tplBusy} onClick={() => void saveTemplate('')}>
            恢复默认
          </Button>
        </div>
        {tplMsg && <p className="mt-2 text-sm text-ink">{tplMsg}</p>}
      </section>

      <StyleProfilesSection />
      <PlotProfilesSection />
    </main>
  );
}
