import { useEffect, useState } from 'react';
import { Link } from 'react-router';
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
    return () => {
      cancelled = true;
    };
  }, []);

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
      <Link to="/" className="text-sm text-gray-500">
        ← 返回书架
      </Link>
      <h1 className="mt-2 text-2xl font-bold">设置</h1>
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

      <StyleProfilesSection />
    </main>
  );
}
