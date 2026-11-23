import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import FusionGateDialog from './FusionGateDialog';
import type { FusionGateConfirmBody, FusionGateReportDto, FusionTensionDto } from '@inkforge/shared';

/** Task-05 钉值夹具：A 类两行（可剥 preset=strip / 不可剥 removable=false）+ 绑定快照 + 三 planner 行 + fewshot。 */
const report: FusionGateReportDto = {
  action: 'show',
  fingerprint: 'fp-test',
  aClass: [
    {
      heading: '文风节',
      verdict: 'fully-carried',
      preset: 'strip',
      removable: true,
      strippableLines: ['油腻台词'],
      residualLines: [],
    },
    {
      heading: '硬约束',
      verdict: 'not-carried',
      preset: 'keep',
      removable: false,
      strippableLines: [],
      residualLines: [],
    },
  ],
  previewDescription: '剥后世界观文本',
  headWindowWarn: false,
  hasArchive: true,
  binding: {
    styleBinding: { primaryProfileId: 'sp1', auxProfileIds: ['sp2'], dimsSource: {}, weights: { sp1: 60, sp2: 40 } },
    styleFewshotOn: true,
    snapshotPresent: true,
    plotProfileId: 'pp1',
    spectrumProfileId: null,
    imitationProfileId: 'ip1',
  },
};

const tension: FusionTensionDto = {
  degraded: false,
  rows: [{ entry: '文风节', mdSide: '去油腻', profileSide: '露骨密度', nature: '拉扯', suggestion: '偏向 MD' }],
};

function renderDialog(overrides: Partial<ComponentProps<typeof FusionGateDialog>> = {}) {
  const onConfirm = vi.fn<(body: FusionGateConfirmBody) => void>();
  const onCancel = vi.fn<() => void>();
  const result = render(
    <FusionGateDialog
      report={report}
      tension={tension}
      analyzing={false}
      busy={false}
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...overrides}
    />,
  );
  return { ...result, onConfirm, onCancel };
}

afterEach(() => {
  cleanup();
});

describe('FusionGateDialog（Task-05 门组件）', () => {
  it('show 报告 → 三段行渲染钉值（A 类预设勾选态/planner 附注文案/fewshot 只读无控件）', () => {
    const { container } = renderDialog();

    // A 类：preset=strip 且可剥 → 剥控件预置勾选
    expect((screen.getByLabelText('剥 MD 文本：文风节') as HTMLInputElement).checked).toBe(true);
    // planner 三行附注文案钉值
    expect(screen.getByText('大纲卡落地格恒优先，档案只作参考')).toBeTruthy();
    // planner 行只给绑/不绑（radio），无剥 MD 假选项
    expect(screen.getByLabelText('剧情档案：绑')).toBeTruthy();
    expect(screen.getByLabelText('剧情档案：不绑')).toBeTruthy();
    // fewshot 只读展示：文案在场且无对应输入控件
    expect(screen.getByText(/文风示例注入：开/)).toBeTruthy();
    expect(screen.queryByLabelText(/文风示例注入/)).toBeNull();
    // 剥 MD 的 MVP 简化说明在场
    expect(screen.getByText(/逐节剥除组合请用书籍设置世界观框手改/)).toBeTruthy();
    // 底部 checkbox aria-label 钉值
    expect(screen.getByLabelText('不再提示（当前注入面不变时）')).toBeTruthy();
    // 张力行只读展示
    expect(screen.getByText(/去油腻/)).toBeTruthy();
    expect(container.querySelector('[role="dialog"]')).toBeTruthy();
  });

  it('tension.degraded=true → 横幅「本次未做张力对照」；analyzing → 加载位', () => {
    renderDialog({ tension: { rows: [], degraded: true, degradeReason: 'timeout' }, analyzing: false });
    expect(screen.getByText('本次未做张力对照')).toBeTruthy();

    cleanup();
    renderDialog({ analyzing: true });
    expect(screen.getByText(/张力对照分析中/)).toBeTruthy();
  });

  it('error → 门内 role=alert 错误行渲染，确认按钮仍在（主审直修③：失败保持打开可重试）', () => {
    renderDialog({ error: 'profile not found: p-x' });
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText(/profile not found: p-x/)).toBeTruthy();
    expect(screen.getByRole('button', { name: '确认并开始生成' })).toBeTruthy();
  });

  it('勾「不再提示」+确认 → onConfirm body 钉 { suppress: true, ...裁决 }', () => {
    const { onConfirm } = renderDialog();
    fireEvent.click(screen.getByLabelText('不再提示（当前注入面不变时）'));
    fireEvent.click(screen.getByRole('button', { name: '确认并开始生成' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    const body = onConfirm.mock.calls[0][0];
    expect(body.suppress).toBe(true);
    // A 类可剥行预置 strip → description 唯一来源 = report.previewDescription
    expect(body.description).toBe('剥后世界观文本');
    // planner 三键 string|null 按快照落
    expect(body.plotProfileId).toBe('pp1');
    expect(body.spectrumProfileId).toBeNull();
    expect(body.imitationProfileId).toBe('ip1');
  });

  it('不可剥行（removable=false）→ 剥控件禁用', () => {
    renderDialog();
    const el = screen.getByLabelText('剥 MD 文本：硬约束') as HTMLInputElement;
    expect(el.disabled).toBe(true);
  });

  it('取消 → onConfirm 未调用（取消零写）', () => {
    const { onConfirm, onCancel } = renderDialog();
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('把可剥行改回「保持」→ 不传 description 键（不启剥）', () => {
    const { onConfirm } = renderDialog();
    fireEvent.click(screen.getByLabelText('剥 MD 文本：文风节'));
    fireEvent.click(screen.getByRole('button', { name: '确认并开始生成' }));
    const body = onConfirm.mock.calls[0][0];
    expect('description' in body).toBe(false);
  });
});
