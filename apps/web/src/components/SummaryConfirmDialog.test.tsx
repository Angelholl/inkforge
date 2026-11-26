import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import SummaryConfirmDialog from './SummaryConfirmDialog';
import { api } from '../api/client';
import type { SummaryCommitBody, SummaryGenerateResultDto } from '@inkforge/shared';

/** T5 钉死夹具：2 THREADS + 2 STATE，六类生效标注文案按映射逐字喂入（D1=B 加强版）。 */
const TEXT_RECYCLED = '将回收：暗号（第3章埋）';
const TEXT_DUP = '已存在同名伏笔，不会重复埋';
const TEXT_NEW = '将新埋：密信';
const TEXT_IGNORED = '未匹配将被忽略';
const TEXT_STATE_UPDATE = '将更新人物「张三」状态（与前章浅合并）';
const TEXT_STATE_SKIP = '未匹配人物卡不会写入';

const ANNOTATION_TEXTS = [TEXT_RECYCLED, TEXT_DUP, TEXT_NEW, TEXT_IGNORED, TEXT_STATE_UPDATE, TEXT_STATE_SKIP];

const result: SummaryGenerateResultDto = {
  baseVersionId: 'v1',
  summary: '原始摘要',
  beats: ['节拍甲', '节拍乙'],
  openThreads: ['暗号', '密信'],
  characterDeltas: [
    { name: '张三', stateJson: '{"位置":"书房"}' },
    { name: '李四', stateJson: '{"位置":"客栈"}' },
  ],
};

const annotations = {
  threads: {
    暗号: `${TEXT_RECYCLED}；${TEXT_DUP}`,
    密信: `${TEXT_NEW}；${TEXT_IGNORED}`,
  },
  states: {
    张三: TEXT_STATE_UPDATE,
    李四: TEXT_STATE_SKIP,
  },
};

function renderDialog(overrides: Partial<ComponentProps<typeof SummaryConfirmDialog>> = {}) {
  const onConfirmed = vi.fn<(body: SummaryCommitBody) => Promise<void>>(async () => {});
  const onCancel = vi.fn<() => void>();
  const view = render(
    <SummaryConfirmDialog
      open
      chapterNo={3}
      result={result}
      annotations={annotations}
      onConfirmed={onConfirmed}
      onCancel={onCancel}
      {...overrides}
    />,
  );
  return { ...view, onConfirmed, onCancel };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('SummaryConfirmDialog（T5 补摘要确认弹窗）', () => {
  it('四段渲染断言', () => {
    renderDialog();

    // 摘要可编辑 textarea
    const textarea = screen.getByLabelText('摘要（可编辑）');
    expect(textarea.tagName).toBe('TEXTAREA');
    // BEATS 只读折叠在 <details> 内
    expect(screen.getByText('BEATS').closest('details')).toBeTruthy();
    // 四行 checkbox（2 THREADS + 2 STATE）默认全 checked
    const boxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    expect(boxes).toHaveLength(4);
    expect(boxes.every((b) => b.checked)).toBe(true);
    // 六类生效标注文案逐字出现（D1=B 加强版）
    for (const text of ANNOTATION_TEXTS) {
      expect(document.body.textContent).toContain(text);
    }
  });

  it('编辑后文本原样进 commit payload', async () => {
    const { onConfirmed } = renderDialog();

    fireEvent.change(screen.getByLabelText('摘要（可编辑）'), { target: { value: '编辑后的摘要' } });
    fireEvent.click(screen.getByLabelText('THREADS：暗号')); // 取消勾选第一行
    fireEvent.click(screen.getByRole('button', { name: '确认落库' }));

    await waitFor(() => expect(onConfirmed).toHaveBeenCalledTimes(1));
    const body = onConfirmed.mock.calls[0][0];
    expect(body.summary).toBe('编辑后的摘要');
    expect(body.baseVersionId).toBe('v1');
    expect(body.beats).toEqual(['节拍甲', '节拍乙']);
    expect(body.threads).toEqual([
      { text: '暗号', include: false },
      { text: '密信', include: true },
    ]);
    expect(body.states).toEqual([
      { name: '张三', stateJson: '{"位置":"书房"}', include: true },
      { name: '李四', stateJson: '{"位置":"客栈"}', include: true },
    ]);
  });

  it('取消不调 commit', () => {
    const commit = vi.spyOn(api, 'summarizeCommit').mockResolvedValue({ ok: true });
    const { onConfirmed, onCancel } = renderDialog();

    fireEvent.click(screen.getByRole('button', { name: '取消' }));

    expect(commit).not.toHaveBeenCalled();
    expect(onConfirmed).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('在途 aria-busy 不可点', () => {
    renderDialog({ busy: true });

    const confirm = screen.getByRole('button', { name: '确认落库' });
    expect(confirm.getAttribute('aria-busy')).toBe('true');
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: '取消' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/正在生成摘要… 已等待/)).toBeTruthy();
  });

  it('失败文案位置', () => {
    renderDialog({ error: '落库失败：400' });

    expect(screen.getByTestId('summary-dialog-error').textContent).toBe('落库失败：400');
  });

  it('摘要 >2000 字前端即时计数不阻断、由服务端 400 拒收', async () => {
    const { onConfirmed } = renderDialog();
    const long = '字'.repeat(2001);

    fireEvent.change(screen.getByLabelText('摘要（可编辑）'), { target: { value: long } });
    expect(screen.getByText('2001 字')).toBeTruthy();

    const confirm = screen.getByRole('button', { name: '确认落库' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(false); // 前端不重复实现长度规则
    fireEvent.click(confirm);

    await waitFor(() => expect(onConfirmed).toHaveBeenCalledTimes(1));
    expect(onConfirmed.mock.calls[0][0].summary).toBe(long);
  });
});
