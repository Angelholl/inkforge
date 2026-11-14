import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import StyleProfilesSection from './StyleProfilesSection';

const PROFILE = {
  id: 'sp1',
  name: '测试档案',
  version: 1,
  createdAt: '2026-11-13T08:00:00.000Z',
  metrics: { medianSentenceLen: 24 },
  sourcePath: 'inline:abcd1234',
};

const PROFILE2 = { ...PROFILE, id: 'sp2', name: '新档案' };

function fetchFor(url: string, init?: RequestInit): Response {
  if (url.endsWith('/api/style-profiles') && (!init?.method || init.method === 'GET')) {
    return new Response(JSON.stringify(distilled ? [PROFILE, PROFILE2] : [PROFILE]), { status: 200 });
  }
  if (url.endsWith('/api/style-profiles/distill')) {
    distilled = true;
    return new Response(JSON.stringify({ profileId: 'sp2' }), { status: 201 });
  }
  return new Response('[]', { status: 200 });
}

let distilled = false;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('StyleProfilesSection', () => {
  it('蒸馏表单：提交后列表新增一行', async () => {
    distilled = false;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => fetchFor(url, init));
    vi.stubGlobal('fetch', fetchMock);
    render(
      <QueryClientProvider client={new QueryClient()}>
        <StyleProfilesSection />
      </QueryClientProvider>,
    );

    // 初始列表 1 行（限风格档案列表；仿写分区另有其列表）
    await waitFor(() => expect(screen.getByText('测试档案')).toBeTruthy());
    const styleList = within(screen.getByText('测试档案').closest('ul')!);
    expect(styleList.getAllByRole('listitem')).toHaveLength(1);

    // 蒸馏提交
    fireEvent.change(screen.getByPlaceholderText('档案名称'), { target: { value: '新档案' } });
    fireEvent.change(screen.getByPlaceholderText(/粘贴风格样本/), { target: { value: 'x'.repeat(200) } });
    fireEvent.click(screen.getByRole('button', { name: '蒸馏' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/style-profiles/distill', expect.anything()));
    await waitFor(() => expect(screen.getByText('新档案')).toBeTruthy());
    expect(within(screen.getByText('测试档案').closest('ul')!).getAllByRole('listitem')).toHaveLength(2);
  });

  it('档案列表渲染版本与句长中位数', async () => {
    distilled = false;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => fetchFor(url, init));
    vi.stubGlobal('fetch', fetchMock);
    render(
      <QueryClientProvider client={new QueryClient()}>
        <StyleProfilesSection />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.getByText('测试档案')).toBeTruthy());
    expect(screen.getByText(/v1 ·/)).toBeTruthy();
    expect(screen.getByText(/句长中位数 24/)).toBeTruthy();
  });
});
