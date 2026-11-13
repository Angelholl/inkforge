import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import StyleProfilesPage from './StyleProfilesPage';

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

describe('StyleProfilesPage', () => {
  it('蒸馏表单：提交后列表新增一行', async () => {
    distilled = false;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => fetchFor(url, init));
    vi.stubGlobal('fetch', fetchMock);
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <StyleProfilesPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // 初始列表 1 行
    await waitFor(() => expect(screen.getByText('测试档案')).toBeTruthy());
    expect(screen.getAllByRole('listitem')).toHaveLength(1);

    // 蒸馏提交
    fireEvent.change(screen.getByPlaceholderText('档案名称'), { target: { value: '新档案' } });
    fireEvent.change(screen.getByPlaceholderText(/粘贴风格样本/), { target: { value: 'x'.repeat(200) } });
    fireEvent.click(screen.getByRole('button', { name: '蒸馏' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/style-profiles/distill', expect.anything()));
    await waitFor(() => expect(screen.getByText('新档案')).toBeTruthy());
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });
});
