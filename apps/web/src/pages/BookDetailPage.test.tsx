import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import BookDetailPage from './BookDetailPage';

// 回归：original 章须有「补摘要」按钮（手动触发，零自动模型调用——DEC-2026-1113-05 第 3 条）
const book = {
  id: 'b1',
  title: '测试书',
  createdAt: '2026-11-13T00:00:00Z',
  updatedAt: '2026-11-13T00:00:00Z',
  chapters: [
    {
      id: 'c1',
      bookId: 'b1',
      chapterNo: 1,
      title: '第一章',
      isOriginal: true,
      blueprint: null,
      targetChars: 3000,
      status: 'done',
      createdAt: '2026-11-13T00:00:00Z',
    },
    {
      id: 'c2',
      bookId: 'b1',
      chapterNo: 2,
      title: '第二章',
      isOriginal: false,
      blueprint: null,
      targetChars: 3000,
      status: 'planned',
      createdAt: '2026-11-13T00:00:00Z',
    },
  ],
  runs: [],
};

vi.stubGlobal(
  'fetch',
  vi.fn(async (url: RequestInfo | URL) => {
    const u = String(url);
    if (u.includes('/api/books/b1')) {
      return { ok: true, status: 200, json: async () => book, text: async () => JSON.stringify(book) };
    }
    return { ok: true, status: 200, json: async () => ({}), text: async () => '{}' };
  }),
);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('BookDetailPage', () => {
  it('original 章渲染「补摘要」按钮且仅 original 章可见', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={['/books/b1']}>
          <Routes>
            <Route path="/books/:bookId" element={<BookDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getAllByRole('button', { name: '补摘要' }).length).toBe(1));
  });
});
