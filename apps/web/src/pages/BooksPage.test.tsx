import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import BooksPage from './BooksPage';

beforeEach(() => {
  // 全局 stub：所有 fetch 返回空列表（书架空态）；afterEach 会 unstub，逐用例重挂
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => [],
      text: async () => '[]',
    })),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderPage() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <BooksPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('BooksPage', () => {
  it('书架页不再渲染内联建书表单', () => {
    renderPage();

    expect(screen.queryByPlaceholderText('新书标题')).toBeNull();
    expect(screen.queryByRole('button', { name: '建书' })).toBeNull();
  });

  it('书架空态提供续写向导入口', async () => {
    renderPage();

    await waitFor(() => expect(screen.getByText(/还没有书/)).toBeTruthy());
    expect(screen.getByRole('link', { name: '续写向导' }).getAttribute('href')).toBe('/continue');
  });

  it('删书两步确认：删除 → 确认删除 → 发 DELETE 且行消失', async () => {
    let gets = 0;
    const stubResp = (body: unknown): { ok: boolean; status: number; json: () => Promise<unknown>; text: () => Promise<string> } => ({
      ok: true,
      status: 200,
      json: async () => body,
      text: async () => JSON.stringify(body),
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        const u = String(url);
        if (init?.method === 'DELETE' && u.includes('/api/books/b1')) return stubResp({ ok: true });
        gets += 1;
        return stubResp(gets === 1 ? [{ id: 'b1', title: '测试书', createdAt: '2026-11-15T10:00:00.000Z' }] : []);
      }),
    );
    renderPage();

    expect(await screen.findByText('测试书')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '删除' }));
    // 第一步只出确认条，尚未发请求
    expect(screen.getByText(/不可恢复/)).toBeTruthy();
    expect(fetch).not.toHaveBeenCalledWith(expect.stringContaining('/api/books/b1'), expect.objectContaining({ method: 'DELETE' }));
    fireEvent.click(screen.getByRole('button', { name: '确认删除' }));

    await waitFor(() =>
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        expect.stringContaining('/api/books/b1'),
        expect.objectContaining({ method: 'DELETE' }),
      ),
    );
    await waitFor(() => expect(screen.queryByText('测试书')).toBeNull());
  });
});
