import { useState } from 'react';
import type { FusionGateConfirmBody, FusionGateReportDto, FusionTensionDto } from '@inkforge/shared';
import { Button } from './ui';
import { checkboxBase, selectBase } from './Field';

/**
 * 生成前融合确认门对话框（Task-05，规格 v3.1 §3.5）。
 *
 * MVP 简化钉死（前端零引擎）：剥后文本**唯一来源 = 服务端 report.previewDescription**（= preset 集合的剥除稿）。
 * 用户在 preset='strip' 的 A 类行勾「剥 MD 文本」→ confirm body 传 description: report.previewDescription；
 * 用户把该行改回「保持」→ 不传 description 键（不启剥）。多节逐行混合勾选超出 MVP，
 * 界面在该行下注明「逐节剥除组合请用书籍设置世界观框手改」。
 *
 * planner 三行只给「绑/不绑」+ 附注「大纲卡落地格恒优先，档案只作参考」（不造「剥 MD 靠档案」假选项）；
 * fewshot 只读展示无控件；degraded → 顶部横幅「本次未做张力对照」；不可剥行控件禁用。
 */
export interface FusionGateDialogProps {
  report: FusionGateReportDto;
  tension?: FusionTensionDto;
  analyzing: boolean;
  busy: boolean;
  onConfirm(body: FusionGateConfirmBody): void;
  onCancel(): void;
  /** 门内失败回显（主审直修③）：confirm 失败时置入，重试成功或取消即消失。 */
  error?: string;
}

type StyleChoice = 'keep' | 'weights' | 'dims' | 'strip';
type PlannerKey = 'plotProfileId' | 'spectrumProfileId' | 'imitationProfileId';

const PLANNER_ROWS: Array<{ key: PlannerKey; label: string }> = [
  { key: 'plotProfileId', label: '剧情档案' },
  { key: 'spectrumProfileId', label: '光谱档案' },
  { key: 'imitationProfileId', label: '仿写档案' },
];

export default function FusionGateDialog({ report, tension, analyzing, busy, error, onConfirm, onCancel }: FusionGateDialogProps) {
  const binding = report.binding;
  // A 类逐行裁决草稿：preset='strip' 且可剥才预置勾选
  const [stripped, setStripped] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(report.aClass.filter((r) => r.preset === 'strip' && r.removable).map((r) => [r.heading, true])),
  );
  // style 快照行四选：保持（默认）/ 权重滑条 / 维归属 / 剥 MD 文本
  const [styleChoice, setStyleChoice] = useState<StyleChoice>('keep');
  const [weights, setWeights] = useState<Record<string, number>>(() => ({ ...(binding.styleBinding?.weights ?? {}) }));
  const [dimsSource, setDimsSource] = useState<Record<string, string>>(() => ({ ...(binding.styleBinding?.dimsSource ?? {}) }));
  // planner 三行绑/不绑（按快照现状预置）
  const [plannerBound, setPlannerBound] = useState<Record<PlannerKey, boolean>>(() => ({
    plotProfileId: binding.plotProfileId !== null,
    spectrumProfileId: binding.spectrumProfileId !== null,
    imitationProfileId: binding.imitationProfileId !== null,
  }));
  const [suppress, setSuppress] = useState(false);

  const styleIds = binding.styleBinding
    ? [binding.styleBinding.primaryProfileId, ...binding.styleBinding.auxProfileIds]
    : [];

  const buildBody = (): FusionGateConfirmBody => {
    const body: FusionGateConfirmBody = {};
    // 剥 MD 文本：唯一来源 = report.previewDescription，任何 strip 勾选都落到同一份剥除稿
    if (Object.values(stripped).some(Boolean) || styleChoice === 'strip') {
      body.description = report.previewDescription;
    }
    // 保持=不动 styleBinding；权重滑条/维归属=按快照现状主/辅 id 组 styleBinding 对象
    if ((styleChoice === 'weights' || styleChoice === 'dims') && binding.styleBinding) {
      body.styleBinding = {
        primaryProfileId: binding.styleBinding.primaryProfileId,
        auxProfileIds: binding.styleBinding.auxProfileIds,
        dimsSource: styleChoice === 'dims' ? dimsSource : binding.styleBinding.dimsSource,
        weights: styleChoice === 'weights' ? weights : binding.styleBinding.weights,
      };
    }
    // planner 三行：绑→当前 id（string|null）；不绑→null
    for (const row of PLANNER_ROWS) {
      body[row.key] = plannerBound[row.key] ? binding[row.key] : null;
    }
    if (suppress) body.suppress = true;
    return body;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="生成前融合确认">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-card border border-line bg-surface p-5 shadow-xl">
        <h2 className="font-display text-lg font-semibold">生成前融合确认</h2>
        <p className="mt-1 text-xs text-muted">逐项确认注入面偏向；确认后才开始生成，取消零写。</p>

        {/* 可见降级钉：LLM 张力对照失败不得静默 */}
        {tension?.degraded === true && (
          <p className="mt-3 rounded-ctl border border-warn/40 bg-warn-soft px-3 py-2 text-sm text-warn" role="status">
            本次未做张力对照
          </p>
        )}
        {analyzing && <p className="mt-3 text-sm text-muted">张力对照分析中…</p>}
        {headWindowWarnTip(report.headWindowWarn)}

        {/* 张力行（只读展示） */}
        {(tension?.rows.length ?? 0) > 0 && (
          <section className="mt-4">
            <h3 className="text-sm font-medium">张力对照</h3>
            <ul className="mt-2 space-y-2">
              {tension!.rows.map((row, i) => (
                <li key={`${row.entry}-${i}`} className="rounded-ctl border border-line px-3 py-2 text-xs">
                  <span className="font-medium">{row.entry}</span>
                  <span className="text-muted"> · {row.nature}</span>
                  <p>MD 侧：{row.mdSide}</p>
                  <p>档案侧：{row.profileSide}</p>
                  <p>建议：{row.suggestion}</p>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* A 类剥节候选行 */}
        <section className="mt-4">
          <h3 className="text-sm font-medium">A 类剥节候选</h3>
          {report.aClass.length === 0 ? (
            <p className="mt-2 text-xs text-muted">无 A 类剥节候选（非 MD 书或无需剥节）。</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {report.aClass.map((row) => {
                const checked = Boolean(stripped[row.heading]) && row.removable;
                return (
                  <li key={row.heading} className="rounded-ctl border border-line px-3 py-2">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className={checkboxBase}
                        aria-label={`剥 MD 文本：${row.heading}`}
                        checked={checked}
                        disabled={!row.removable || busy}
                        onChange={(e) => setStripped((s) => ({ ...s, [row.heading]: e.target.checked }))}
                      />
                      <span>{row.heading}</span>
                      <span className="text-xs text-muted">{row.verdict}</span>
                      {!row.removable && <span className="text-xs text-muted">（不可剥，控件已禁用）</span>}
                    </label>
                    {checked && <p className="mt-1 text-xs text-muted">逐节剥除组合请用书籍设置世界观框手改</p>}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* style 快照行：权重滑条 / 维归属 / 剥 MD 文本 / 保持 四选 */}
        <section className="mt-4">
          <h3 className="text-sm font-medium">风格绑定快照</h3>
          {binding.styleBinding === null ? (
            <p className="mt-2 text-xs text-muted">本书无风格绑定快照。</p>
          ) : (
            <>
              <p className="mt-1 text-xs text-muted">
                主档 {binding.styleBinding.primaryProfileId}
                {binding.styleBinding.auxProfileIds.length > 0 ? ` + 辅档 ${binding.styleBinding.auxProfileIds.join('、')}` : ''}
              </p>
              <div className="mt-2 flex flex-wrap gap-3 text-sm">
                {(
                  [
                    ['keep', '保持'],
                    ['weights', '权重滑条'],
                    ['dims', '维归属'],
                    ['strip', '剥 MD 文本'],
                  ] as Array<[StyleChoice, string]>
                ).map(([value, label]) => (
                  <label key={value} className="flex items-center gap-1.5">
                    <input
                      type="radio"
                      name="style-choice"
                      value={value}
                      checked={styleChoice === value}
                      disabled={busy}
                      onChange={() => setStyleChoice(value)}
                      aria-label={`风格偏向：${label}`}
                    />
                    {label}
                  </label>
                ))}
              </div>
              {styleChoice === 'weights' && (
                <div className="mt-2 space-y-1">
                  {styleIds.map((id) => (
                    <label key={id} className="flex items-center gap-2 text-xs">
                      <span className="w-24 truncate">{id}</span>
                      <input
                        type="range"
                        min={1}
                        max={100}
                        value={weights[id] ?? 1}
                        aria-label={`权重：${id}`}
                        onChange={(e) => setWeights((w) => ({ ...w, [id]: Number(e.target.value) }))}
                      />
                      <span>{weights[id] ?? 1}</span>
                    </label>
                  ))}
                </div>
              )}
              {styleChoice === 'dims' && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {Object.keys(binding.styleBinding.dimsSource).map((dim) => (
                    <label key={dim} className="flex items-center gap-2 text-xs">
                      <span className="w-20 truncate">{dim}</span>
                      <select
                        className={`${selectBase} w-full`}
                        value={dimsSource[dim] ?? ''}
                        aria-label={`维归属：${dim}`}
                        onChange={(e) => setDimsSource((d) => ({ ...d, [dim]: e.target.value }))}
                      >
                        {styleIds.map((id) => (
                          <option key={id} value={id}>
                            {id}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              )}
            </>
          )}
        </section>

        {/* planner 参考类三行：只给绑/不绑 + 优先权附注 */}
        <section className="mt-4">
          <h3 className="text-sm font-medium">档案参考（planner）</h3>
          <p className="mt-1 text-xs text-muted">大纲卡落地格恒优先，档案只作参考</p>
          <ul className="mt-2 space-y-2">
            {PLANNER_ROWS.map((row) => (
              <li key={row.key} className="flex items-center gap-4 text-sm">
                <span className="w-20">{row.label}</span>
                <label className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    name={`planner-${row.key}`}
                    checked={plannerBound[row.key]}
                    disabled={busy}
                    aria-label={`${row.label}：绑`}
                    onChange={() => setPlannerBound((p) => ({ ...p, [row.key]: true }))}
                  />
                  绑
                </label>
                <label className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    name={`planner-${row.key}`}
                    checked={!plannerBound[row.key]}
                    disabled={busy}
                    aria-label={`${row.label}：不绑`}
                    onChange={() => setPlannerBound((p) => ({ ...p, [row.key]: false }))}
                  />
                  不绑
                </label>
              </li>
            ))}
          </ul>
        </section>

        {/* fewshot 只读展示，无控件 */}
        <p className="mt-4 text-xs text-muted">文风示例注入：{binding.styleFewshotOn ? '开' : '关'}（门内只读，如需修改请回书籍设置面板）</p>

        {error ? (
          <p role="alert" className="mt-4 text-danger text-xs">
            确认失败（已整体回滚，未入队）：{error}——可调整后重试，或取消（取消零写）。
          </p>
        ) : null}

        <footer className="mt-5 flex items-center gap-3 border-t border-line pt-4">
          <label className="flex items-center gap-1.5 text-xs text-muted">
            <input
              type="checkbox"
              className={checkboxBase}
              aria-label="不再提示（当前注入面不变时）"
              checked={suppress}
              disabled={busy}
              onChange={(e) => setSuppress(e.target.checked)}
            />
            不再提示（当前注入面不变时）
          </label>
          <div className="ml-auto flex gap-2">
            <Button variant="secondary" disabled={busy} onClick={onCancel}>
              取消
            </Button>
            <Button variant="primary" disabled={busy} loading={busy} onClick={() => onConfirm(buildBody())}>
              确认并开始生成
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function headWindowWarnTip(warn: boolean) {
  return warn ? <p className="mt-3 text-xs text-warn">文首窗口保护：开头若干行不参与剥节，请留意。</p> : null;
}
