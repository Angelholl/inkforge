import { useEffect, useState } from 'react';
import { api, API_BASE, apiErrorText } from '../api/client';
import { Button } from '../components/ui';
import { fieldLabel, inputBase, numberBase, textareaBase } from '../components/Field';
import { SectionHeader } from '../components/Section';

type SettingsResponse = {
  strataBaseUrl?: string;
  strataModel?: string;
  hasApiKey?: boolean;
};

/** 设置页（DEC-2026-1118-02）：两栏式表单行（Windows 11 设置形态），label 左列 160px；行为零改动。 */
export default function SettingsPage() {
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [hasApiKey, setHasApiKey] = useState(false);
  const [connError, setConnError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [scoreThreshold, setScoreThreshold] = useState('8');
  const [qualityMsg, setQualityMsg] = useState('');
  const [lwText, setLwText] = useState('');
  const [lwCounts, setLwCounts] = useState({ h: 0, l: 0 });
  const [lwSections, setLwSections] = useState<string[]>([]);
  const [lwPath, setLwPath] = useState('');
  const [lwSaving, setLwSaving] = useState(false);
  const [lwMsg, setLwMsg] = useState('');

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
        setHasApiKey(Boolean(s.hasApiKey));
      })
      .catch(() => {
        if (!cancelled) setConnError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    api
      .getQuality()
      .then((q) => {
        if (!cancelled) setScoreThreshold(String(q.scoreThreshold));
      })
      .catch(() => {
        /* 服务未连：保持默认显示，保存时再报错 */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 落地分级词表（DEC-2026-1122-02）：GET 载入实际生效词表；保存写用户文件，下一次生成 run 生效
  useEffect(() => {
    let cancelled = false;
    api
      .getLandingWords()
      .then((lw) => {
        if (cancelled) return;
        setLwText(lw.text);
        setLwCounts(lw.counts);
        setLwSections(lw.sections);
        setLwPath(lw.path);
      })
      .catch(() => {
        /* 服务未连：保持空显示，保存时再报错 */
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

  const saveQuality = async (): Promise<void> => {
    setQualityMsg('');
    const v = Number(scoreThreshold);
    if (!Number.isFinite(v) || v < 1 || v > 10) {
      setQualityMsg('阈值须为 1-10 之间的数字');
      return;
    }
    try {
      await api.putQuality(v);
      setQualityMsg('已保存：每个 run 的章节管线开始时读取新阈值；进行中的 run 不受影响。');
    } catch (e) {
      setQualityMsg(apiErrorText(e));
    }
  };

  const saveLw = async (): Promise<void> => {
    setLwSaving(true);
    setLwMsg('');
    try {
      const r = await api.putLandingWords(lwText);
      setLwCounts(r.counts);
      setLwSections(r.sections);
      setLwMsg('已保存：下一次生成 run 生效；进行中 run 不受影响。');
    } catch (e) {
      setLwMsg(apiErrorText(e));
    } finally {
      setLwSaving(false);
    }
  };

  return (
    <main className="mx-auto max-w-2xl px-8 py-8">
      <h1 className="text-xl font-semibold">设置</h1>
      {connError && (
        <p className="mt-4 rounded-card border border-warn/30 bg-warn-soft px-3 py-2 text-sm text-warn">服务未连接</p>
      )}
      <form
        className="mt-6 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="grid grid-cols-[160px_minmax(0,1fr)] items-center gap-3">
          <label htmlFor="settings-base-url" className={fieldLabel}>
            本地端点地址
          </label>
          <input
            id="settings-base-url"
            className={inputBase}
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://api.example.com/v1"
          />
        </div>
        <div className="grid grid-cols-[160px_minmax(0,1fr)] items-center gap-3">
          <label htmlFor="settings-api-key" className={fieldLabel}>
            API Key
          </label>
          <input
            id="settings-api-key"
            type="password"
            className={inputBase}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={hasApiKey ? '已保存，留空保持不变' : '输入 API Key'}
          />
        </div>
        <div className="grid grid-cols-[160px_minmax(0,1fr)] items-center gap-3">
          <label htmlFor="settings-model" className={fieldLabel}>
            模型名
          </label>
          <input
            id="settings-model"
            className={inputBase}
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="模型名称"
          />
        </div>
        <Button type="submit" variant="primary" loading={saving}>
          保存
        </Button>
      </form>
      <section className="mt-8">
        <SectionHeader title="质量" size="lg" />
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-[160px_minmax(0,1fr)] items-center gap-3">
            <label htmlFor="settings-score-threshold" className={fieldLabel}>
              入库分阈值 OVERALL（1-10，默认 8.0）
            </label>
            <input
              id="settings-score-threshold"
              type="number"
              min={1}
              max={10}
              step={0.5}
              className={numberBase}
              value={scoreThreshold}
              onChange={(e) => setScoreThreshold(e.target.value)}
            />
          </div>
          <p className="text-xs text-muted">
            保存即时生效：每个 run 的章节管线开始时读取；进行中的 run 不受影响。低于阈值触发重写（轮数未满时）；上一轮增益
            &lt;5% 即停（同分即停）。
          </p>
          <Button type="button" variant="primary" onClick={() => void saveQuality()}>
            保存质量设置
          </Button>
        </div>
        {qualityMsg && <p className="mt-2 text-sm text-ok">{qualityMsg}</p>}
      </section>
      <section className="mt-8">
        <SectionHeader title="落地分级词表" size="lg" />
        <div className="mt-3 space-y-3">
          <label htmlFor="settings-landing-words" className={fieldLabel}>
            落地分级词表
          </label>
          <textarea
            id="settings-landing-words"
            rows={10}
            className={textareaBase}
            value={lwText}
            onChange={(e) => setLwText(e.target.value)}
          />
          <p className="text-xs text-muted">
            [H]/[L] 分节，每行一词；# 注释与空行跳过；其它 [X] 节=识别不入库。H 池 {lwCounts.h} 词 · L 池 {lwCounts.l} 词 · 其它节：
            {lwSections.filter((s) => s !== 'H' && s !== 'L').join('、') || '无'}
            {lwCounts.h === 0 && lwCounts.l === 0 && '　词表为空：落地闸门不判定（放行）'}
          </p>
          <p className="text-xs text-muted">
            判定时 H 档命中=L 词∪H 词；保存后下一次生成 run 生效，进行中 run 不受影响。生效文件：{lwPath || '…'}
          </p>
          <Button type="button" variant="primary" loading={lwSaving} onClick={() => void saveLw()}>
            保存词表
          </Button>
        </div>
        {lwMsg && <p className="mt-2 text-sm text-ok">{lwMsg}</p>}
      </section>
      {message && <p className="mt-4 text-sm text-ok">{message}</p>}
      {error && <p className="mt-4 text-sm text-danger">{error}</p>}
    </main>
  );
}
