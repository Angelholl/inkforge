import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Navigate, Route, Routes } from 'react-router';
import App from './App';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('App 壳', () => {
  it('壳渲染四 TAB 且激活态跟随当前路由', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route element={<App />}>
            <Route path="/" element={<div>书架占位</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: '书架' }).getAttribute('href')).toBe('/');
    expect(screen.getByRole('link', { name: '新书' }).getAttribute('href')).toBe('/new');
    expect(screen.getByRole('link', { name: '续写' }).getAttribute('href')).toBe('/continue');
    expect(screen.getByRole('link', { name: '设置' }).getAttribute('href')).toBe('/settings');

    const bookshelf = screen.getByRole('link', { name: '书架' });
    expect(bookshelf.className).toContain('font-bold');
    expect(screen.getByRole('link', { name: '设置' }).className).not.toContain('font-bold');
  });

  it('/styles 重定向至 /settings', () => {
    render(
      <MemoryRouter initialEntries={['/styles']}>
        <Routes>
          <Route element={<App />}>
            <Route path="/styles" element={<Navigate to="/settings" replace />} />
            <Route path="/settings" element={<div>设置页标记</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('设置页标记')).toBeTruthy();
  });
});
