import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import DistillPage from './DistillPage';

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
    text: async () => JSON.stringify(data),
  };
}

function stubFetch() {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/api/settings/distill-template') && init?.method !== 'PUT') {
      return jsonResponse({ template: 'DIM 测试模板' });
    }
    if (url.endsWith('/api/style-profiles') && init?.method !== 'PUT') return jsonResponse([]);
    return jsonResponse([]);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderPage() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <DistillPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('DistillPage', () => {
  it('渲染蒸馏模板编辑与蒸馏表单', async () => {
    const fetchMock = stubFetch();
    renderPage();

    await waitFor(() => expect((screen.getByLabelText('蒸馏模板') as HTMLTextAreaElement).value).toBe('DIM 测试模板'));
    expect(screen.getByPlaceholderText('档案名称')).toBeTruthy();
    expect(screen.getByText('风格档案')).toBeTruthy();
    expect((screen.getByRole('button', { name: '保存模板' }) as HTMLButtonElement).className).toContain('bg-primary');
    expect((screen.getByRole('button', { name: '保存模板' }) as HTMLButtonElement).className).toContain('h-ctl');
    expect((screen.getByRole('button', { name: '恢复默认' }) as HTMLButtonElement).className).toContain('border-line');
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/imitation-profiles', expect.anything()));
  });

  it('保存模板 PUT 且提示', async () => {
    const fetchMock = stubFetch();
    renderPage();

    await waitFor(() => expect((screen.getByLabelText('蒸馏模板') as HTMLTextAreaElement).value).toBe('DIM 测试模板'));

    fireEvent.change(screen.getByLabelText('蒸馏模板'), { target: { value: '新模板' } });
    fireEvent.click(screen.getByText('保存模板'));

    await waitFor(() => {
      const putCall = fetchMock.mock.calls.find((call) => call[1]?.method === 'PUT');
      expect(putCall).toBeTruthy();
      expect(putCall?.[0]).toBe('/api/settings/distill-template');
      expect(JSON.parse(String(putCall?.[1]?.body))).toEqual({ template: '新模板' });
    });
    expect(screen.getByText('蒸馏模板已保存')).toBeTruthy();
  });
});
