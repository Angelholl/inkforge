import { Fragment, useState } from 'react';
import type { FusionAClassRowDto, FusionGateConfirmBody, FusionGateReportDto, FusionTensionDto } from '@inkforge/shared';
import { Button } from './ui';
import { checkboxBase, selectBase } from './Field';
import { STALE_GATE_MESSAGE } from '../fusionGate';

/**
 * 生成前融合确认门对话框（Task-05，规格 v3.1 §3.5）。
 *
 * MVP 简化钉死（前端零引擎）：剥后文本唯一来源 = report.previewDescription，仅由片段勾选触发；
 * 风格行三选（保持现状 / 调整各档案占比 / 逐维度选跟随哪本档案）；
 * 档案名 = profileNames 查名，缺失回落 id 前 8 位（title 保留完整 id）；
 * 409 stale 文案由 fusionGate 映射（STALE_GATE_MESSAGE 单一来源）。
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

type StyleChoice = 'keep' | 'weights' | 'dims';
type PlannerKey = 'plotProfileId' | 'spectrumProfileId' | 'imitationProfileId';

const VERDICT_LABELS: Record<FusionAClassRowDto['verdict'], string> = {
  'fully-carried': '档案里已有，移除不丢内容',
  'partially-carried': '档案只覆盖一部分，移除可能丢内容',
  'not-carried': '档案里没有，建议保留',
};

const PLANNER_ROWS: Array<{ key: PlannerKey; label: string }> = [
  { key: 'plotProfileId', label: '剧情档案' },
  { key: 'spectrumProfileId', label: '光谱档案' },
  { key: 'imitationProfileId', label: '仿写档案' },
];

export default function FusionGateDialog({ report, tension, analyzing, busy, error, onConfirm, onCancel }: FusionGateDialogProps) {
  const binding = report.binding;
  // 档案名查名；缺键回落 id 前 8 位（?. 保留：旧 stub/运行时缺键防御）
  const nameOf = (id: string): string => binding.profileNames?.[id] ?? id.slice(0, 8);
  // const 局部快照：JSX 三元里的类型收窄需要在闭包内保持（主审直修②配套）
  const styleBinding = binding.styleBinding;
  // 主审直修⑤：查名与回落态收在一处——title 恒带完整 id，查不到名即灰字（兼治 Standards 气味「双查 profileNames」）
  const muted = (id: string): string => (binding.profileNames?.[id] ? '' : 'text-muted');
  const nameEl = (id: string, extra = '') => (
    <span title={id} className={`${muted(id)}${extra ? ` ${extra}` : ''}`}>{`《${nameOf(id)}》`}</span>
  );
  // A 类逐行裁决草稿：preset='strip' 且可剥才预置勾选
  const [stripped, setStripped] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(report.aClass.filter((r) => r.preset === 'strip' && r.removable).map((r) => [r.heading, true])),
  );
  // style 快照行三选：保持现状（默认）/ 调整各档案占比 / 逐维度选跟随哪本档案
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
    // 剥后文本唯一来源 = report.previewDescription，仅由片段勾选触发
    if (Object.values(stripped).some(Boolean)) {
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
    body.fingerprint = report.fingerprint;
    return body;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="生成前融合确认">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-card border border-line bg-surface p-5 shadow-xl">
        <div className="sticky top-0 z-10 -mx-5 -mt-5 bg-surface px-5 pb-2 pt-5">
          <h2 className="font-display text-lg font-semibold">生成前融合确认</h2>
          <p className="mt-1 text-xs text-muted">下面列出这次生成会喂给 AI 的参考资料，以及可以调整的地方。点「确认并开始生成」会保存你的调整并开始生成；点「取消」不保存任何改动。</p>
        </div>

        {/* 可见降级钉：LLM 张力对照失败不得静默 */}
        {tension?.degraded === true && (
          <p className="mt-3 rounded-ctl border border-warn/40 bg-warn-soft px-3 py-2 text-sm text-warn" role="status">
            这次没有做正文与档案的冲突对照（不影响生成）
          </p>
        )}
        {analyzing && <p className="mt-3 text-sm text-muted">正在对照正文与档案…</p>}
        {headWindowWarnTip(report.headWindowWarn)}

        {/* 张力行（只读展示） */}
        {(tension?.rows.length ?? 0) > 0 && (
          <section className="mt-4">
            <h3 className="text-sm font-medium">正文与档案的冲突对照</h3>
            <ul className="mt-2 space-y-2">
              {tension!.rows.map((row, i) => (
                <li key={`${row.entry}-${i}`} className="rounded-ctl border border-line px-3 py-2 text-xs">
                  <span className="font-medium">{row.entry}</span>
                  <span className="text-muted"> · {row.nature}</span>
                  <p>正文里：{row.mdSide}</p>
                  <p>档案里：{row.profileSide}</p>
                  <p>建议：{row.suggestion}</p>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* 正文残留设定片段：逐行勾选决定是否随剥除稿移除 */}
        <section className="mt-4">
          <h3 className="text-sm font-medium">正文里残留的设定片段</h3>
          {report.aClass.length === 0 ? (
            <p className="mt-2 text-xs text-muted">这次没有需要从正文移除的片段。</p>
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
                        aria-label={`移除片段：${row.heading}`}
                        checked={checked}
                        disabled={!row.removable || busy}
                        onChange={(e) => setStripped((s) => ({ ...s, [row.heading]: e.target.checked }))}
                      />
                      <span>{row.heading}</span>
                      <span className="text-xs text-muted">{VERDICT_LABELS[row.verdict]}</span>
                      {!row.removable && <span className="text-xs text-muted">（这段动不了）</span>}
                    </label>
                    {checked && <p className="mt-1 text-xs text-muted">想逐段自由取舍，请到书详情页「设定」节的「世界观与剧情大纲」面板直接改正文。</p>}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* 文风配方：当前绑定快照 + 三选调整 */}
        <section className="mt-4">
          <h3 className="text-sm font-medium">文风配方（当前绑定）</h3>
          {styleBinding === null ? (
            <p className="mt-2 text-xs text-muted">这本书还没绑定文风档案，生成时不会参考文风档案。</p>
          ) : (
            <>
              <p className="mt-1 text-xs text-muted">
                主参考{nameEl(styleBinding.primaryProfileId)}
                {styleBinding.auxProfileIds.length > 0 && <>＋辅助{styleBinding.auxProfileIds.map((id) => <Fragment key={id}>{nameEl(id)}</Fragment>)}</>}
              </p>
              <p className="mt-1 text-xs text-muted">
                {Object.keys(styleBinding.weights).length > 0 ? (
                  <>
                    占比：{styleIds.map((id, i) => (
                      <Fragment key={id}>
                        {i > 0 ? '、' : ''}
                        {nameEl(id)} {styleChoice === 'weights' ? (weights[id] ?? 1) : (styleBinding.weights[id] ?? 1)}
                      </Fragment>
                    ))}
                  </>
                ) : (
                  '（旧绑定：按贡献维数计权）'
                )}
              </p>
              <div className="mt-2 flex flex-wrap gap-3 text-sm">
                {(
                  [
                    ['keep', '保持现状'],
                    ['weights', '调整各档案占比'],
                    ['dims', '逐维度选跟随哪本档案'],
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
                      aria-label={`文风调整：${label}`}
                    />
                    {label}
                  </label>
                ))}
              </div>
              {styleChoice === 'weights' && (
                <>
                  <p className="mt-2 text-xs text-muted">数字越大越像那本档案</p>
                  <div className="mt-2 space-y-1">
                    {styleIds.map((id) => (
                      <label key={id} className="flex items-center gap-2 text-xs">
                        <span className={`w-24 truncate ${muted(id)}`} title={id}>{nameOf(id)}</span>
                        <input
                          type="range"
                          min={1}
                          max={100}
                          value={weights[id] ?? 1}
                          aria-label={`占比：${nameOf(id)}`}
                          onChange={(e) => setWeights((w) => ({ ...w, [id]: Number(e.target.value) }))}
                        />
                        <span>{weights[id] ?? 1}</span>
                      </label>
                    ))}
                  </div>
                </>
              )}
              {styleChoice === 'dims' && (
                <>
                  <p className="mt-2 text-xs text-muted">为每个风格维度单独指定跟随哪本档案</p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {Object.keys(styleBinding.dimsSource).map((dim) => (
                      <label key={dim} className="flex items-center gap-2 text-xs">
                        <span className="w-20 truncate">{dim}</span>
                        <select
                          className={`${selectBase} w-full`}
                          value={dimsSource[dim] ?? ''}
                          aria-label={`跟随：${dim}`}
                          onChange={(e) => setDimsSource((d) => ({ ...d, [dim]: e.target.value }))}
                        >
                          {styleIds.map((id) => (
                            <option key={id} value={id} title={id}>
                              {nameOf(id)}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </section>

        {/* planner 参考类三行：作为参考/不作为参考 + 解绑永久生效说明 */}
        <section className="mt-4">
          <h3 className="text-sm font-medium">大纲阶段参考的档案</h3>
          <p className="mt-1 text-xs text-muted">这里只决定"写大纲"时参考什么；成文风格由上面的文风配方决定，正文写法仍以大纲卡为准。</p>
          <ul className="mt-2 space-y-2">
            {PLANNER_ROWS.map((row) => {
              const id = binding[row.key];
              const hasBinding = id !== null;
              return (
                <li key={row.key} className="flex items-center gap-4 text-sm">
                  <span className="w-20">{row.label}</span>
                  {hasBinding ? (
                    <span title={id}>{`《${nameOf(id)}》`}</span>
                  ) : (
                    <span className="text-xs text-muted">{`未绑定${row.label}`}</span>
                  )}
                  <label className="flex items-center gap-1.5">
                    <input
                      type="radio"
                      name={`planner-${row.key}`}
                      checked={plannerBound[row.key]}
                      disabled={busy || !hasBinding}
                      aria-label={`${row.label}：作为参考`}
                      onChange={() => setPlannerBound((p) => ({ ...p, [row.key]: true }))}
                    />
                    作为参考
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input
                      type="radio"
                      name={`planner-${row.key}`}
                      checked={!plannerBound[row.key]}
                      disabled={busy || !hasBinding}
                      aria-label={`${row.label}：不作为参考`}
                      onChange={() => setPlannerBound((p) => ({ ...p, [row.key]: false }))}
                    />
                    不作为参考
                  </label>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-xs text-muted">选「不作为参考」= 永久解除这本书与该档案的绑定，之后每次生成都不再参考它；要重新绑定，请到「蒸馏」页里对应档案的绑定框。</p>
        </section>

        {/* fewshot 只读展示，无控件 */}
        <p className="mt-4 text-xs text-muted">文风示例注入：{binding.styleFewshotOn ? '开' : '关'}（这里只能看，要开关请到书详情页「风格」节的「风格档案」面板）</p>

        {error ? (
          <p role="alert" className="mt-4 text-danger text-xs">
            {error === STALE_GATE_MESSAGE ? STALE_GATE_MESSAGE : `保存失败：${error}。这次什么都没改、也没开始生成，可以再试一次，或点取消离开。`}
          </p>
        ) : null}

        <footer className="mt-5 flex items-center gap-3 border-t border-line pt-4">
          <label className="flex items-center gap-1.5 text-xs text-muted">
            <input
              type="checkbox"
              className={checkboxBase}
              aria-label="以后生成前不再弹这个确认（参考资料一有变动还会再提醒）"
              checked={suppress}
              disabled={busy}
              onChange={(e) => setSuppress(e.target.checked)}
            />
            以后生成前不再弹这个确认（参考资料一有变动还会再提醒）
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
  return warn ? <p className="mt-3 text-xs text-warn">正文开头若干行受保护，勾选移除也不会动它们，请留意。</p> : null;
}
