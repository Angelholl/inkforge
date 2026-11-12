import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import BooksPage from './BooksPage';

// 回归：书架页（根路由）须有「设置」入口（0.1.1 修复：原 App 页头仅覆盖 fallback 路由）
vi.stubGlobal(
  'fetch',
  vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => [],
    text: async () => '[]',
  })),
);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('BooksPage', () => {
  it('书架页渲染「设置」入口并指向 /settings', () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <BooksPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const link = screen.getByRole('link', { name: '设置' });
    expect(link).toBeTruthy();
    expect(link.getAttribute('href')).toBe('/settings');
  });
});
