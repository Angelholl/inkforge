import { useEffect, useState } from 'react';
import type { SummaryCommitBody, SummaryGenerateResultDto } from '@inkforge/shared';
import { Button } from './ui';

type Unmatched = {
  characters: string[];
  threads: string[];
  cards: Array<{ id: string; name: string }>;
};
type CharAction = 'create' | 'link' | 'ignore';
type ThreadAction = 'write' | 'ignore';

/**
 * T5 补摘要确认弹窗（D1=B 加强版）。
 * 摘要可编辑、节拍只读折叠、THREADS/STATE 逐行勾选剔除且只读文本（禁自由文本编辑）；
 * 生效标注文案由页面算好经 annotations 传入，组件逐字展示不改写；
 * 勾选态→commit payload 映射是本组件唯一函数体逻辑，长度校验归服务端（T1 zod）。
 */
export interface SummaryConfirmDialogProps {
  open: boolean;
  chapterNo: number;
  result: SummaryGenerateResultDto;
  /** D1 道具：每行文本 → 生效标注文案（T6 算，组件不生成文案）。 */
  annotations: { threads: Record<string, string>; states: Record<string, string> };
  /** 在途（commit）态：按钮 aria-busy/disabled + 在途文案。 */
  busy?: boolean;
  /** 在途计时起点（T6 generate 起步时间）；缺省为挂载时刻。 */
  startedAt?: number;
  /** 失败回显，落 summary-dialog-error。 */
  error?: string;
  /** T4 钉死：调用方（T5）必传；无未匹配时传空三数组。 */
  unmatched: Unmatched;
  onCancel(): void;
  onConfirmed(body: SummaryCommitBody): Promise<void>;
}

const EMPTY_UNMATCHED: Unmatched = { characters: [], threads: [], cards: [] };

/** 契约层 unmatched 必填（T5 恒传）；页面接线（C5）落地前留空三数组缺省，保证全仓 typecheck 零错。 */
type DialogCallProps = Omit<SummaryConfirmDialogProps, 'unmatched'> & Partial<Pick<SummaryConfirmDialogProps, 'unmatched'>>;

export default function SummaryConfirmDialog({
  open,
  chapterNo,
  result,
  annotations,
  busy = false,
  startedAt,
  error,
  unmatched = EMPTY_UNMATCHED,
  onCancel,
  onConfirmed,
}: DialogCallProps) {
  const [summary, setSummary] = useState(result.summary);
  const [threadInclude, setThreadInclude] = useState<Record<string, boolean>>({});
  const [stateInclude, setStateInclude] = useState<Record<string, boolean>>({});
  const [charAction, setCharAction] = useState<Record<string, CharAction>>({});
  const [charTarget, setCharTarget] = useState<Record<string, string>>({});
  const [threadAction, setThreadAction] = useState<Record<string, ThreadAction>>({});
  const [precheckError, setPrecheckError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);

  // 每次打开/换稿重置草稿与勾选，默认逐行 checked；段五两 state map 复位为决策点③拍板值
  useEffect(() => {
    if (!open) return;
    setSummary(result.summary);
    setThreadInclude(Object.fromEntries(result.openThreads.map((t) => [t, true])));
    setStateInclude(Object.fromEntries(result.characterDeltas.map((d) => [d.name, true])));
    setCharAction(Object.fromEntries(unmatched.characters.map((name) => [name, 'create' as const])));
    setCharTarget(Object.fromEntries(unmatched.characters.map((name) => [name, unmatched.cards[0]?.id ?? ''])));
    setThreadAction(Object.fromEntries(unmatched.threads.map((text) => [text, 'write' as const])));
    setPrecheckError(null);
  }, [open, result]);

  // 在途秒数：setInterval 1000ms + cleanup
  useEffect(() => {
    if (!open) return;
    const base = startedAt ?? Date.now();
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - base) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [open, startedAt]);

  if (!open) return null;

  const buildBody = (): SummaryCommitBody => ({
    baseVersionId: result.baseVersionId,
    summary,
    beats: result.beats,
    threads: result.openThreads.map((text) => ({
      text,
      include: unmatched.threads.includes(text) ? false : threadInclude[text] !== false,
    })),
    states: result.characterDeltas.map((d) => ({
      name: d.name,
      stateJson: d.stateJson,
      include: unmatched.characters.includes(d.name) ? false : stateInclude[d.name] !== false,
    })),
    unmatchedThreads: unmatched.threads.map((text) => ({
      text,
      action: threadAction[text] === 'ignore' ? 'ignore' : 'write',
    })),
    unmatchedCharacters: unmatched.characters.map((name) => {
      const action = charAction[name] ?? 'create';
      if (action === 'link') {
        return { name, action, characterId: charTarget[name] ?? unmatched.cards[0]?.id ?? '' };
      }
      return { name, action: action === 'ignore' ? 'ignore' : 'create' };
    }),
  });

  // 重名预检（HIGH_RISK 采纳件）：create 行命中 cards 任一卡名 → 拦在既有 error 槽，不调 onConfirmed
  const confirm = () => {
    const body = buildBody();
    const dup = (body.unmatchedCharacters ?? []).find(
      (c) => c.action === 'create' && unmatched.cards.some((card) => card.name === c.name),
    );
    if (dup) {
      setPrecheckError(`人物「${dup.name}」已在档案中存在，请改选「关联已有卡」`);
      return;
    }
    setPrecheckError(null);
    void onConfirmed(body);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="补摘要确认">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-card border border-line bg-surface p-5 shadow-xl">
        <h2 className="font-display text-lg font-semibold">第{chapterNo}章 · 补摘要确认</h2>
        <p className="mt-1 text-xs text-muted">摘要可编辑；节拍仅供查看；下面逐行可勾选剔除，不写入的文本不会提交。</p>

        {busy && <p role="status" className="mt-3 text-sm text-muted">正在生成摘要… 已等待 {elapsed}s</p>}

        {/* 段一：SUMMARY 可编辑（前端即时计数，不阻断超长，校验归服务端 400） */}
        <section className="mt-4">
          <label htmlFor="summary-confirm-textarea" className="text-sm font-medium">摘要（可编辑）</label>
          <textarea
            id="summary-confirm-textarea"
            aria-label="摘要（可编辑）"
            className="mt-2 w-full rounded-ctl border border-line bg-bg p-2 text-sm"
            rows={5}
            value={summary}
            disabled={busy}
            onChange={(e) => setSummary(e.target.value)}
          />
          <p className="mt-1 text-xs text-faint">{summary.length} 字</p>
        </section>

        {/* 段二：BEATS 只读折叠 */}
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-medium">BEATS</summary>
          <ul className="mt-2 list-disc pl-5 text-sm text-muted">
            {result.beats.map((beat, i) => <li key={`${beat}-${i}`}>{beat}</li>)}
          </ul>
        </details>

        {/* 段三：THREADS 逐行勾选剔除 + 只读生效标注 */}
        <section className="mt-4">
          <h3 className="text-sm font-medium">THREADS</h3>
          <ul className="mt-2 space-y-2">
            {result.openThreads.map((text) => (
              <li key={text} className="rounded-ctl border border-line px-3 py-2">
                <label className="flex items-center gap-2 text-sm">
                  {unmatched.threads.includes(text) ? null : (
                    <input
                      type="checkbox"
                      aria-label={`THREADS：${text}`}
                      checked={threadInclude[text] !== false}
                      disabled={busy}
                      onChange={(e) => setThreadInclude((m) => ({ ...m, [text]: e.target.checked }))}
                    />
                  )}
                  <span>{text}</span>
                </label>
                <p className="mt-1 text-xs text-muted">{annotations.threads[text]}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* 段四：STATE 逐行勾选剔除 + 只读生效标注（禁自由文本编辑） */}
        <section className="mt-4">
          <h3 className="text-sm font-medium">STATE</h3>
          <ul className="mt-2 space-y-2">
            {result.characterDeltas.map((d) => (
              <li key={d.name} className="rounded-ctl border border-line px-3 py-2">
                <label className="flex items-center gap-2 text-sm">
                  {unmatched.characters.includes(d.name) ? null : (
                    <input
                      type="checkbox"
                      aria-label={`STATE：${d.name}`}
                      checked={stateInclude[d.name] !== false}
                      disabled={busy}
                      onChange={(e) => setStateInclude((m) => ({ ...m, [d.name]: e.target.checked }))}
                    />
                  )}
                  <span>{d.name}</span>
                </label>
                <p className="mt-1 text-xs text-muted">{annotations.states[d.name]}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* 段五：未匹配处理——逐条裁决，未匹配行的唯一处置入口 */}
        <section className="mt-4">
          <h3 className="text-sm font-medium">未匹配处理</h3>
          <ul className="mt-2 space-y-2">
            {unmatched.characters.map((name) => {
              const action = charAction[name] ?? 'create';
              return (
                <li key={`char-${name}`} className="rounded-ctl border border-line px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span>未匹配人物：{name}</span>
                    <select
                      aria-label={`未匹配人物：${name}`}
                      value={action}
                      disabled={busy}
                      onChange={(e) => setCharAction((m) => ({ ...m, [name]: e.target.value as CharAction }))}
                      className="rounded-ctl border border-line bg-bg p-1 text-sm"
                    >
                      <option value="create">新建卡</option>
                      <option value="link" disabled={unmatched.cards.length === 0}>关联已有卡</option>
                      <option value="ignore">忽略</option>
                    </select>
                  </div>
                  {action === 'link' ? (
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                      <span>关联目标：</span>
                      <select
                        aria-label={`关联目标：${name}`}
                        value={charTarget[name] ?? unmatched.cards[0]?.id ?? ''}
                        disabled={busy}
                        onChange={(e) => setCharTarget((m) => ({ ...m, [name]: e.target.value }))}
                        className="rounded-ctl border border-line bg-bg p-1 text-sm"
                      >
                        {unmatched.cards.map((card) => (
                          <option key={card.id} value={card.id}>{card.name}</option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                </li>
              );
            })}
            {unmatched.threads.map((text) => (
              <li key={`thread-${text}`} className="rounded-ctl border border-line px-3 py-2">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span>未匹配伏笔：{text}</span>
                  <select
                    aria-label={`未匹配伏笔：${text}`}
                    value={threadAction[text] ?? 'write'}
                    disabled={busy}
                    onChange={(e) => setThreadAction((m) => ({ ...m, [text]: e.target.value as ThreadAction }))}
                    className="rounded-ctl border border-line bg-bg p-1 text-sm"
                  >
                    <option value="write">写入（按新伏笔埋入）</option>
                    <option value="ignore">忽略</option>
                  </select>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {precheckError ?? error ? (
          <p data-testid="summary-dialog-error" role="alert" className="mt-4 text-danger text-xs">
            {precheckError ?? error}
          </p>
        ) : null}

        <footer className="mt-5 flex justify-end gap-2 border-t border-line pt-4">
          <Button variant="secondary" disabled={busy} onClick={onCancel}>取消</Button>
          <Button variant="primary" disabled={busy} loading={busy} onClick={confirm}>
            确认落库
          </Button>
        </footer>
      </div>
    </div>
  );
}
