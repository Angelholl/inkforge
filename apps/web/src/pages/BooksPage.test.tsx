import { render, screen, waitFor, cleanup } from '@testing-library/react';
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
});
