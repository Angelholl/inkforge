import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Navigate, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderShell(initialPath: string) {
  // AppShell rail 挂 health 轮询（D1）：stub fetch 返回版本号
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ ok: true, version: '0.2.0' }) })),
  );
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route element={<App />}>
            <Route path="/" element={<div>书架占位</div>} />
            <Route path="/styles" element={<Navigate to="/settings" replace />} />
            <Route path="/settings" element={<div>设置页标记</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
      ,
    </QueryClientProvider>,
  );
}

describe('App 壳（D1 rail）', () => {
  it('rail 渲染四导航且激活态跟随当前路由', () => {
    renderShell('/');
    expect(screen.getByRole('link', { name: '书架' }).getAttribute('href')).toBe('/');
    expect(screen.getByRole('link', { name: '新书' }).getAttribute('href')).toBe('/new');
    expect(screen.getByRole('link', { name: '续写' }).getAttribute('href')).toBe('/continue');
    expect(screen.getByRole('link', { name: '设置' }).getAttribute('href')).toBe('/settings');

    const bookshelf = screen.getByRole('link', { name: '书架' });
    expect(bookshelf.className).toContain('bg-primary-soft'); // 激活态主色软底
    expect(screen.getByRole('link', { name: '设置' }).className).not.toContain('bg-primary-soft');
    expect(screen.getByText('inkforge')).toBeTruthy(); // 品牌块仅「inkforge」
  });

  it('/styles 重定向至 /settings', () => {
    renderShell('/styles');
    expect(screen.getByText('设置页标记')).toBeTruthy();
  });
});
