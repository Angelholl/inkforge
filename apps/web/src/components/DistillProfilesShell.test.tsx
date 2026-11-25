import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import PlotProfilesSection from '../pages/PlotProfilesSection';
import SpectrumProfilesSection from '../pages/SpectrumProfilesSection';

// DS-1：两个蒸馏壳同页挂载时，隐藏 file input 的静态 id 会碰撞；label 激活解析到 DOM 第一个（剧情区）。
const SAMPLE_TEXT =
  '少年阿磊在雨夜拾到一枚旧徽章，他沿着河岸追查失踪的伙伴，并在旧书店里发现一张被水浸过的地图。'.repeat(8);

function jsonResponse(data: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => data, text: async () => JSON.stringify(data) };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** 挂载顺序同 DistillPage：Plot 在前、Spectrum 在后（复现 id 碰撞的 DOM 顺序）。 */
function renderTwoShells() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith('/api/plot-profiles') && (!init?.method || init.method === 'GET')) return jsonResponse([]);
      if (u.endsWith('/api/spectrum-profiles') && (!init?.method || init.method === 'GET')) return jsonResponse([]);
      if (u.endsWith('/api/books')) return jsonResponse([]);
      return jsonResponse({});
    }),
  );
  render(
    <QueryClientProvider client={new QueryClient()}>
      <PlotProfilesSection />
      <SpectrumProfilesSection />
    </QueryClientProvider>,
  );
  const plot = screen.getByTestId('plot-profiles');
  const spectrum = screen.getByTestId('spectrum-profiles');
  const fileInput = (shell: HTMLElement) => shell.querySelector('input[type=file]') as HTMLInputElement;
  const label = (shell: HTMLElement) =>
    within(shell).getByText(/点击选择本地 txt \/ md 文件/).closest('label') as HTMLLabelElement;
  return { plot, spectrum, plotInput: fileInput(plot), spectrumInput: fileInput(spectrum), plotLabel: label(plot), spectrumLabel: label(spectrum) };
}

describe('DistillProfilesShell 文件选择 id 去重（DS-1）', () => {
  it('两个壳的 file input id 不相等', () => {
    const { plotInput, spectrumInput } = renderTwoShells();
    expect(plotInput.id).not.toBe(spectrumInput.id);
  });

  it('每个壳内 label 的 htmlFor 指向本壳 input（用 within 圈定）', () => {
    const { spectrum, plotInput, spectrumInput, plotLabel, spectrumLabel } = renderTwoShells();
    expect(plotLabel.htmlFor).toBe(plotInput.id);
    expect(document.getElementById(plotLabel.htmlFor)).toBe(plotInput);
    expect(spectrumLabel.htmlFor).toBe(spectrumInput.id);
    expect(document.getElementById(spectrumLabel.htmlFor)).toBe(spectrumInput);
    expect(within(spectrum).getByLabelText('导入样本文件')).toBe(spectrumInput);
  });

  it('对第二个壳按 label 的 htmlFor 解析出的 input 导入 → 回显只落在第二个壳', async () => {
    const { plot, spectrum, spectrumLabel } = renderTwoShells();
    // 模拟用户点第二个壳的 label：浏览器按 htmlFor 在 document 中取第一个同 id 元素，碰撞时命中剧情区。
    const target = document.getElementById(spectrumLabel.htmlFor) as HTMLInputElement;
    fireEvent.change(target, { target: { files: [new File([SAMPLE_TEXT], 'x.md', { type: 'text/markdown' })] } });
    expect(await within(spectrum).findByText(/已按 .* 解码/)).toBeTruthy();
    expect(within(plot).queryByText(/已按 .* 解码/)).toBeNull();
  });
});
