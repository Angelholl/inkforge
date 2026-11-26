import { Fragment, useId, useState, type ReactNode } from 'react';
import { useQuery, type QueryKey } from '@tanstack/react-query';
import { countChars } from '@inkforge/shared';
import { Button } from './ui';
import { inputBase, textareaBase } from './Field';
import { EmptyState } from './EmptyState';
import { decodeTextFile } from './textFile';

/*
 * 三份蒸馏档案分区的公共骨架（纯重构，行为不变）。
 *
 * - ProfilesListShell：列表卡片布局 + 空态 + L2 两步删除确认（style/plot/spectrum 共用）；查询留在各分区，以便各自持有 refetch。
 * - DistillProfilesShell：在列表之上补齐「三函数骨架（analyze/save/remove）+
 *   蒸馏表单（来源文本+名称+前置校验）+ 可编辑草稿预览 + 只读绑定徽标」这一完整形状，plot/spectrum 直接作配置壳使用。
 *
 * style 特有的七维编辑表单 / 查看细节面板 / 版本·重蒸面板不进本文件，留在 StyleProfilesSection
 * 内以 render-prop 注入（它复用 ProfilesListShell，但蒸馏态有自己的三态机，不走 DistillProfilesShell）。
 */

export interface ListProfileBase {
  id: string;
  name: string;
}

/** renderCard 用来渲染删除确认簇的上下文；确认动作经 onDelete 回传，清簇由调用方在自己的删除函数里做（保持原交互序列）。 */
interface DeleteCardCtx {
  confirming: boolean;
  askDelete: () => void;
  cancelDelete: () => void;
  confirmDelete: () => void;
}

interface ProfilesListShellProps<P extends ListProfileBase> {
  profiles: P[];
  listTitle: string;
  empty: { title: string; hint: string };
  sectionClassName?: string;
  /** 第三个参数 clearConfirm：删除成功/需要处理时收簇；原各分区在各自 remove 里决定何时调它。 */
  onDelete: (id: string, label: string, clearConfirm: () => void) => Promise<void>;
  renderCard: (profile: P, ctx: DeleteCardCtx) => ReactNode;
}

/** 公共列表骨架：<ul> 卡片布局 + 空态 + 两步删除确认状态（查询由各分区持有）。 */
export function ProfilesListShell<P extends ListProfileBase>({
  profiles,
  listTitle,
  empty,
  sectionClassName = 'mt-4',
  onDelete,
  renderCard,
}: ProfilesListShellProps<P>) {
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

  return (
    <section className={sectionClassName}>
      <h2 className="text-base font-semibold">{listTitle}</h2>
      <ul className="mt-2 space-y-2">
        {profiles.map((p) => (
          <Fragment key={p.id}>
            {renderCard(p, {
              confirming: confirmingDeleteId === p.id,
              askDelete: () => setConfirmingDeleteId(p.id),
              cancelDelete: () => setConfirmingDeleteId(null),
              confirmDelete: () => {
                void onDelete(p.id, p.name, () => setConfirmingDeleteId(null));
              },
            })}
          </Fragment>
        ))}
        {profiles.length === 0 && (
          <li>
            <EmptyState title={empty.title} hint={empty.hint} />
          </li>
        )}
      </ul>
    </section>
  );
}

export interface DistillProfileBase extends ListProfileBase {
  sourcePath: string;
  structure: string[];
  boundBooks?: Array<{ id: string; title: string }>;
}

interface DistillApi<D> {
  analyze: (body: { name: string; text: string }) => Promise<{ draft: D }>;
  save: (draft: D) => Promise<unknown>;
  remove: (id: string) => Promise<unknown>;
}

interface DistillLabels {
  title: ReactNode;
  description?: ReactNode;
  testid?: string;
  listTitle: string;
  emptyTitle: string;
  emptyHint: string;
  formTitle: string;
  namePlaceholder: string;
  nameAriaLabel?: string;
  textPlaceholder: string;
  textAriaLabel?: string;
  analyzeButton: string;
  emptyNameMsg: string;
  shortTextMsg: (stripped: number) => string;
  draftReadyMsg: string;
  analyzeFailMsg: (message: string) => string;
  previewTitle: string;
  draftTextAriaLabel: string;
  emptyStructureMsg: string;
  savedMsg: (name: string) => string;
  saveFailMsg: (message: string) => string;
  discardMsg: string;
  removedMsg: (label: string) => string;
  removeFailMsg: (message: string) => string;
  deleteWarning: ReactNode;
  structureCount: (count: number) => string;
}

interface DistillProfilesShellProps<P extends DistillProfileBase, D> {
  queryKey: QueryKey;
  listApi: () => Promise<P[]>;
  api: DistillApi<D>;
  labels: DistillLabels;
}

/** 完整蒸馏分区骨架：列表 + 只读绑定徽标 + 蒸馏表单 + 可编辑草稿预览。plot/spectrum 仅传配置即可。 */
export function DistillProfilesShell<P extends DistillProfileBase, D>({
  queryKey,
  listApi,
  api,
  labels,
}: DistillProfilesShellProps<P, D>) {
  const inputId = useId();
  const { data: profilesData, refetch } = useQuery({ queryKey, queryFn: listApi, refetchInterval: 5000 });
  const profiles = Array.isArray(profilesData) ? profilesData : [];
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [fileInfo, setFileInfo] = useState('');
  const [draft, setDraft] = useState<D | null>(null);
  const [draftText, setDraftText] = useState('');
  const [busy, setBusy] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [msg, setMsg] = useState('');

  const analyze = async () => {
    setMsg('');
    if (name.trim() === '') {
      setMsg(labels.emptyNameMsg);
      return;
    }
    const stripped = countChars(text);
    if (stripped < 200) {
      setMsg(labels.shortTextMsg(stripped));
      return;
    }
    setBusy(true);
    setAnalyzing(true);
    try {
      const r = await api.analyze({ name: name.trim(), text });
      setDraft(r.draft);
      setDraftText(structureOf(r.draft).join('\n'));
      setMsg(labels.draftReadyMsg);
    } catch (e) {
      setMsg(labels.analyzeFailMsg((e as Error).message));
    } finally {
      setBusy(false);
      setAnalyzing(false);
    }
  };

  const save = async () => {
    if (!draft) return;
    const structure = draftText
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l !== '');
    if (structure.length === 0) {
      setMsg(labels.emptyStructureMsg);
      return;
    }
    setBusy(true);
    try {
      await api.save(withStructure(draft, structure));
      setMsg(labels.savedMsg(draftNameOf(draft)));
      setDraft(null);
      setName('');
      setText('');
      setFileInfo('');
      void refetch();
    } catch (e) {
      setMsg(labels.saveFailMsg((e as Error).message));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string, label: string, clearConfirm: () => void) => {
    setBusy(true);
    try {
      await api.remove(id);
      clearConfirm();
      setMsg(labels.removedMsg(label));
      void refetch();
    } catch (e) {
      setMsg(labels.removeFailMsg((e as Error).message));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-10" data-testid={labels.testid}>
      <h2 className="text-lg font-semibold">{labels.title}</h2>
      {labels.description && <p className="mt-1 text-xs text-faint">{labels.description}</p>}

      <ProfilesListShell
        profiles={profiles}
        listTitle={labels.listTitle}
        empty={{ title: labels.emptyTitle, hint: labels.emptyHint }}
        onDelete={remove}
        renderCard={(p, ctx) => (
          <li className="rounded-card border border-line bg-surface px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="font-medium">{p.name}</span>
              <span className="text-xs text-muted">{labels.structureCount(p.structure.length)}</span>
              <span className="min-w-0 break-all text-xs text-faint">{p.sourcePath}</span>
              {p.boundBooks && p.boundBooks.length > 0 && (
                <span className="text-xs text-primary-strong">
                  已绑定：{p.boundBooks.map((b) => `《${b.title}》`).join('')}
                </span>
              )}
              {ctx.confirming ? (
                <>
                  <span className="text-danger text-xs">{labels.deleteWarning}</span>
                  <Button variant="danger" solid size="sm" disabled={busy} onClick={ctx.confirmDelete}>
                    确认删除
                  </Button>
                  <Button variant="secondary" size="sm" onClick={ctx.cancelDelete}>
                    取消
                  </Button>
                </>
              ) : (
                <Button variant="quiet" tone="danger" size="sm" className="ml-auto" disabled={busy} onClick={ctx.askDelete}>
                  删除
                </Button>
              )}
            </div>
            <ul className="mt-2 ml-4 list-disc text-xs text-ink">
              {p.structure.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </li>
        )}
      />

      <section className="mt-8">
        <h2 className="text-base font-semibold">{labels.formTitle}</h2>
        <div className="mt-2 space-y-2">
          <input
            className={inputBase}
            placeholder={labels.namePlaceholder}
            aria-label={labels.nameAriaLabel}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <textarea
            className={textareaBase}
            placeholder={labels.textPlaceholder}
            rows={10}
            aria-label={labels.textAriaLabel}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setFileInfo('');
            }}
          />
          {/* 文件选择（owner 2026-11-21 反馈：剧情/光谱蒸馏无法选择上传）——沿 Style/SettingsImportPanel 同款：隐藏 input+虚线框+编码回显 */}
          <div>
            <input
              type="file"
              id={inputId}
              accept=".txt,.md"
              aria-label="导入样本文件"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const reader = new FileReader();
                reader.onload = () => {
                  const { text: decoded, encoding } = decodeTextFile(reader.result as ArrayBuffer);
                  setText(decoded);
                  setFileInfo(`${f.name} · 已按 ${encoding} 解码（${decoded.length} 字）`);
                };
                reader.readAsArrayBuffer(f);
              }}
            />
            <label
              htmlFor={inputId}
              className="flex cursor-pointer flex-col items-center gap-1 rounded border border-dashed border-line px-3 py-6 text-sm text-muted transition-colors hover:border-line-strong hover:bg-primary-soft/40"
            >
              <span>点击选择本地 txt / md 文件（自动识别 UTF-8 / GBK 编码）</span>
              {fileInfo && <span className="text-xs font-medium text-primary-strong">{fileInfo}</span>}
            </label>
          </div>
          {/* 蒸馏=分钟级 LLM 调用，在途须给进度文案防误判卡死（owner 2026-11-21 反馈，同导入确认按钮款） */}
          <Button
            variant="primary"
            size="md"
            loading={busy}
            disabled={busy}
            onClick={() => void analyze()}
          >
            {analyzing ? '正在蒸馏，约需数分钟…' : labels.analyzeButton}
          </Button>
        </div>

        {draft && (
          <div className="mt-4 rounded-card border border-line bg-bg p-3">
            <h3 className="text-sm font-semibold">{labels.previewTitle}</h3>
            <textarea
              className={`${textareaBase} mt-2 font-mono text-xs`}
              aria-label={labels.draftTextAriaLabel}
              rows={Math.max(5, draftText.split('\n').length + 1)}
              value={draftText}
              onChange={(e) => setDraftText(e.target.value)}
            />
            <div className="mt-3 flex gap-2">
              <Button variant="primary" size="sm" disabled={busy} onClick={() => void save()}>
                确认入库
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={busy}
                onClick={() => {
                  setDraft(null);
                  setMsg(labels.discardMsg);
                }}
              >
                放弃
              </Button>
            </div>
          </div>
        )}
        {msg && <p className="mt-2 text-sm text-ink">{msg}</p>}
      </section>
    </section>
  );
}

// draft 形状适配：plot/spectrum 的 draft 均为 { name; structure: string[] }，这里只取通用字段。
function structureOf<D>(draft: D): string[] {
  return (draft as { structure: string[] }).structure;
}
function withStructure<D>(draft: D, structure: string[]): D {
  return { ...(draft as object), structure } as D;
}
function draftNameOf<D>(draft: D): string {
  return (draft as { name: string }).name;
}
