import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import FusionGateDialog from './FusionGateDialog';
import { STALE_GATE_MESSAGE } from '../fusionGate';
import type { FusionGateConfirmBody, FusionGateReportDto, FusionTensionDto } from '@inkforge/shared';

/** Task-05 钉值夹具：A 类两行（可剥 strip / 不可剥）+ 绑定快照 + 三 planner 行 + fewshot + 档案名映射。 */
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
    styleBinding: { primaryProfileId: 'sp1', auxProfileIds: ['sp2'], dimsSource: { 节奏: 'sp1' }, weights: { sp1: 60, sp2: 40 } },
    styleFewshotOn: true,
    snapshotPresent: true,
    plotProfileId: 'pp1',
    spectrumProfileId: null,
    imitationProfileId: 'ip1',
    profileNames: { sp1: '示例主档案', sp2: '示例辅档案', pp1: '示例剧情档案', ip1: '示例仿写档案' },
  },
};

const tension: FusionTensionDto = {
  degraded: false,
  // 卡 TL-1 把 TensionRowDto.lever 设为必填；门组件尚未消费 lever（TL-4 才渲染三选），此处先钉 none 保 typecheck 绿
  rows: [{ entry: '文风节', mdSide: '去油腻', profileSide: '露骨密度', nature: '拉扯', suggestion: '偏向 MD', lever: 'none' }],
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

    // A 类：preset=strip 且可剥 → 移除片段控件预置勾选
    expect((screen.getByLabelText('移除片段：文风节') as HTMLInputElement).checked).toBe(true);
    // planner 三行附注文案钉值
    expect(screen.getByText('这里只决定"写大纲"时参考什么；成文风格由上面的文风配方决定，正文写法仍以大纲卡为准。')).toBeTruthy();
    // planner 行只给作为参考/不作为参考（radio），无剥 MD 假选项
    expect(screen.getByLabelText('剧情档案：作为参考')).toBeTruthy();
    expect(screen.getByLabelText('剧情档案：不作为参考')).toBeTruthy();
    // fewshot 只读展示：文案在场且无对应输入控件
    expect(screen.getByText(/文风示例注入：开（这里只能看/)).toBeTruthy();
    expect(screen.queryByLabelText(/文风示例注入/)).toBeNull();
    // 逐段自由取舍指引在场
    expect(screen.getByText(/世界观与剧情大纲/)).toBeTruthy();
    // 底部 checkbox aria-label 钉值
    expect(screen.getByLabelText('以后生成前不再弹这个确认（参考资料一有变动还会再提醒）')).toBeTruthy();
    // 张力行只读展示
    expect(screen.getByText(/去油腻/)).toBeTruthy();
    expect(container.querySelector('[role="dialog"]')).toBeTruthy();
  });

  it('tension.degraded=true → 横幅「这次没有做正文与档案的冲突对照（不影响生成）」；analyzing → 加载位', () => {
    renderDialog({ tension: { rows: [], degraded: true, degradeReason: 'timeout' }, analyzing: false });
    expect(screen.getByText('这次没有做正文与档案的冲突对照（不影响生成）')).toBeTruthy();

    cleanup();
    renderDialog({ analyzing: true });
    expect(screen.getByText(/正在对照正文与档案/)).toBeTruthy();
  });

  it('error → 门内 role=alert 错误行渲染，确认按钮仍在（主审直修③：失败保持打开可重试）', () => {
    renderDialog({ error: 'profile not found: p-x' });
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText(/保存失败：/)).toBeTruthy();
    expect(screen.getByText(/profile not found: p-x/)).toBeTruthy();
    expect(screen.getByRole('button', { name: '确认并开始生成' })).toBeTruthy();
  });

  it('勾「不再提示」+确认 → onConfirm body 钉 { suppress: true, ...裁决 }', () => {
    const { onConfirm } = renderDialog();
    fireEvent.click(screen.getByLabelText('以后生成前不再弹这个确认（参考资料一有变动还会再提醒）'));
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
    expect(body.fingerprint).toBe('fp-test');
  });

  it('不可剥行（removable=false）→ 移除片段控件禁用', () => {
    renderDialog();
    const el = screen.getByLabelText('移除片段：硬约束') as HTMLInputElement;
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
    fireEvent.click(screen.getByLabelText('移除片段：文风节'));
    fireEvent.click(screen.getByRole('button', { name: '确认并开始生成' }));
    const body = onConfirm.mock.calls[0][0];
    expect('description' in body).toBe(false);
  });

  it('档案名替代 UUID：主辅名行/占比滑条/维度 select 均显示档案名且 title=完整 id', () => {
    const { container } = renderDialog();
    expect(container.textContent).toContain('主参考《示例主档案》＋辅助《示例辅档案》');
    // 主审直修⑤（Spec 半做）：首行与占比行的《名》同样要 title=完整 id（卡 B Produces 钉死）
    expect(screen.getAllByTitle('sp1').length).toBeGreaterThanOrEqual(2);

    fireEvent.click(screen.getByLabelText('文风调整：调整各档案占比'));
    expect(screen.getByLabelText('占比：示例主档案')).toBeTruthy();
    expect(screen.getAllByTitle('sp1').map((el) => el.textContent)).toContain('示例主档案');

    fireEvent.click(screen.getByLabelText('文风调整：逐维度选跟随哪本档案'));
    expect(screen.getByLabelText('跟随：节奏')).toBeTruthy();
    const select = screen.getByLabelText('跟随：节奏') as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual(['示例主档案', '示例辅档案']);
  });

  it('profileNames 缺失 → 回落 id 前 8 位灰字', () => {
    const { container } = renderDialog({ report: { ...report, binding: { ...report.binding, profileNames: {} } } });
    expect(container.textContent).toContain('主参考《sp1》＋辅助《sp2》');
    fireEvent.click(screen.getByLabelText('文风调整：调整各档案占比'));
    const els = screen.getAllByTitle('sp1');
    expect(els.some((el) => el.textContent === 'sp1' && el.className.includes('text-muted'))).toBe(true);
  });

  it('未绑定行 radio 禁用', () => {
    renderDialog({ report: { ...report, binding: { ...report.binding, spectrumProfileId: null } } });
    expect(screen.getByText('未绑定光谱档案')).toBeTruthy();
    expect((screen.getByLabelText('光谱档案：作为参考') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText('光谱档案：不作为参考') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText('剧情档案：作为参考') as HTMLInputElement).disabled).toBe(false);
    expect((screen.getByLabelText('仿写档案：作为参考') as HTMLInputElement).disabled).toBe(false);
  });

  it('三选：无剥 MD 假选项', () => {
    const { onConfirm } = renderDialog({ report: { ...report, aClass: [] } });
    expect(screen.queryByText('剥 MD 文本')).toBeNull();
    expect(screen.getByLabelText('文风调整：保持现状')).toBeTruthy();
    expect(screen.getByLabelText('文风调整：调整各档案占比')).toBeTruthy();
    expect(screen.getByLabelText('文风调整：逐维度选跟随哪本档案')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('文风调整：调整各档案占比'));
    fireEvent.click(screen.getByRole('button', { name: '确认并开始生成' }));
    const body = onConfirm.mock.calls[0][0];
    expect('description' in body).toBe(false);
    expect(body.styleBinding?.weights).toEqual({ sp1: 60, sp2: 40 });
    expect(body.fingerprint).toBe('fp-test');
  });

  it('409 stale 文案整句替换，无前缀', () => {
    renderDialog({ error: STALE_GATE_MESSAGE });
    expect(screen.getByText('这本书的参考资料刚在别处被改动，本次确认的内容已经过期。请点取消，再重新点生成，门会刷新。')).toBeTruthy();
    expect(screen.queryByText(/保存失败：/)).toBeNull();
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByRole('button', { name: '确认并开始生成' })).toBeTruthy();
  });

  it('planner 行显示《名》', () => {
    renderDialog();
    expect(screen.getByText('《示例剧情档案》')).toBeTruthy();
    expect(screen.getByText('《示例仿写档案》')).toBeTruthy();
    expect(screen.getByText('未绑定光谱档案')).toBeTruthy();
  });

  // ===== 主审直修（卡 FG-B 验收期四处小缺陷，先红后绿）=====

  it('主审直修①：无辅档时不出现悬空的「＋辅助」', () => {
    const { container } = renderDialog({
      report: {
        ...report,
        binding: { ...report.binding, styleBinding: { primaryProfileId: 'sp1', auxProfileIds: [], dimsSource: {}, weights: { sp1: 100 } } },
      },
    });
    expect(container.textContent).toContain('主参考《示例主档案》');
    expect(container.textContent).not.toContain('＋辅助');
  });

  it('主审直修②：weights 缺 id 时占比行回落滑条默认值 1、不印 undefined', () => {
    const { container } = renderDialog({
      report: {
        ...report,
        binding: { ...report.binding, styleBinding: { primaryProfileId: 'sp1', auxProfileIds: ['sp2'], dimsSource: { 节奏: 'sp1' }, weights: { sp1: 60 } } },
      },
    });
    expect(container.textContent).not.toContain('undefined');
    expect(container.textContent).toContain('《示例辅档案》 1');
  });

  it('主审直修③：张力区块标题与行侧标签一并白话（原「张力对照/MD 侧/档案侧」）', () => {
    renderDialog();
    expect(screen.getByText('正文与档案的冲突对照')).toBeTruthy();
    expect(screen.getByText(/正文里：去油腻/)).toBeTruthy();
    expect(screen.getByText(/档案里：露骨密度/)).toBeTruthy();
    expect(screen.queryByText(/MD 侧/)).toBeNull();
    expect(screen.queryByText(/^张力对照$/)).toBeNull();
  });

  it('主审直修④：文首窗口提示白话（原「不参与剥节」）', () => {
    renderDialog({ report: { ...report, headWindowWarn: true } });
    expect(screen.getByText('正文开头若干行受保护，勾选移除也不会动它们，请留意。')).toBeTruthy();
    expect(screen.queryByText(/剥节/)).toBeNull();
  });
});
