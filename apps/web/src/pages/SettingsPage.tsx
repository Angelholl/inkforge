import { useEffect, useState } from 'react';
import { API_BASE } from '../api/client';
import StyleProfilesSection from './StyleProfilesSection';

type SettingsResponse = {
  strataBaseUrl?: string;
  strataModel?: string;
  hasApiKey?: boolean;
  mock?: boolean;
};

export default function SettingsPage() {
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [mock, setMock] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [connError, setConnError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [distillTemplate, setDistillTemplate] = useState('');
  const [tplMsg, setTplMsg] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/api/settings`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`GET /api/settings → ${r.status}`);
        return (await r.json()) as SettingsResponse;
      })
      .then((s) => {
        if (cancelled) return;
        setBaseUrl(s.strataBaseUrl ?? '');
        setModel(s.strataModel ?? '');
        setMock(Boolean(s.mock));
        setHasApiKey(Boolean(s.hasApiKey));
      })
      .catch(() => {
        if (!cancelled) setConnError(true);
      });
    // 蒸馏模板（空串=默认）
    fetch(`${API_BASE}/api/settings/distill-template`)
      .then(async (r) => (r.ok ? ((await r.json()) as { template: string }) : { template: '' }))
      .then((t) => {
        if (!cancelled) setDistillTemplate(t.template);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const saveTemplate = async (template: string) => {
    setTplMsg('');
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
    }
  };

  const save = async () => {
    setSaving(true);
    setMessage('');
    setError('');
    const body: Record<string, unknown> = {
      strataBaseUrl: baseUrl,
      strataModel: model,
      mock,
    };
    if (apiKey.trim()) body.strataApiKey = apiKey.trim();
    try {
      const r = await fetch(`${API_BASE}/api/settings`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(`PUT /api/settings → ${r.status}`);
      setMessage('已保存，重启应用后生效');
      setApiKey('');
    } catch {
      setError('保存失败，请确认服务已连接后重试');
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="text-2xl font-bold">设置</h1>
      {connError && (
        <p className="mt-4 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">服务未连接</p>
      )}
      <form
        className="mt-6 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div>
          <label htmlFor="settings-base-url" className="block text-sm font-medium">
            本地端点地址
          </label>
          <input
            id="settings-base-url"
            className="mt-1 w-full rounded border px-3 py-2"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://api.example.com/v1"
          />
        </div>
        <div>
          <label htmlFor="settings-api-key" className="block text-sm font-medium">
            API Key
          </label>
          <input
            id="settings-api-key"
            type="password"
            className="mt-1 w-full rounded border px-3 py-2"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={hasApiKey ? '已保存，留空保持不变' : '输入 API Key'}
          />
        </div>
        <div>
          <label htmlFor="settings-model" className="block text-sm font-medium">
            模型名
          </label>
          <input
            id="settings-model"
            className="mt-1 w-full rounded border px-3 py-2"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="模型名称"
          />
        </div>
        <label htmlFor="settings-mock" className="flex items-center gap-2 text-sm font-medium">
          <input id="settings-mock" type="checkbox" checked={mock} onChange={(e) => setMock(e.target.checked)} />
          启用 mock 模式
        </label>
        <button type="submit" disabled={saving} className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50">
          {saving ? '保存中…' : '保存'}
        </button>
      </form>
      {message && <p className="mt-4 text-sm text-green-700">{message}</p>}
      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <section className="mt-10">
        <h2 className="text-xl font-bold">蒸馏模板</h2>
        <p className="mt-1 text-xs text-gray-400">
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
          <button className="rounded bg-blue-600 px-4 py-1.5 text-sm text-white" disabled={saving} onClick={() => void saveTemplate(distillTemplate)}>
            保存模板
          </button>
          <button className="rounded bg-gray-200 px-4 py-1.5 text-sm" disabled={saving} onClick={() => void saveTemplate('')}>
            恢复默认
          </button>
        </div>
        {tplMsg && <p className="mt-2 text-sm text-gray-700">{tplMsg}</p>}
      </section>

      <StyleProfilesSection />
    </main>
  );
}
