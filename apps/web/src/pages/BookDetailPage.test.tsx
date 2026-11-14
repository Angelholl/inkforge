import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import BookDetailPage from './BookDetailPage';

// 回归：original 章须有「补摘要」按钮（手动触发，零自动模型调用——DEC-2026-1113-05 第 3 条）
const book = {
  id: 'b1',
  title: '测试书',
  description: '旧世界观',
  outline: '旧大纲',
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

type Call = { url: string; init?: RequestInit };
const calls: Call[] = [];

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
    text: async () => JSON.stringify(data),
  };
}

const CHARACTER_FIXTURE = [{ id: 'k1', name: '张三', baseSetting: '{"身份":"主角"}' }];

// 每测试自装 stub（afterEach unstubAllGlobals 会移除模块级 stub，第二个测试会裸奔）
function installFetchStub() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      calls.push({ url: u, init });
      if (u.endsWith('/api/books/b1/characters')) {
        if (init?.method === 'POST') return jsonResponse({ id: 'k2', name: '李四', baseSetting: '{"设定":"反派"}' }, 201);
        return jsonResponse(CHARACTER_FIXTURE);
      }
      if (u.includes('/api/books/b1/meta')) return jsonResponse({ ...book, description: '旧世界观', outline: '旧大纲' });
      if (u.includes('/api/books/b1')) {
        return { ok: true, status: 200, json: async () => book, text: async () => JSON.stringify(book) };
      }
      return { ok: true, status: 200, json: async () => ({}), text: async () => '{}' };
    }),
  );
}

installFetchStub();

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  calls.length = 0;
});

function setInput(sel: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = sel instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(sel, value);
  sel.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('BookDetailPage', () => {
  it('original 章渲染「补摘要」按钮且仅 original 章可见', async () => {
    installFetchStub();
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

  it('书详情：保存设定调用 PUT meta 且人物卡增删可见', async () => {
    installFetchStub();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={['/books/b1']}>
          <Routes>
            <Route path="/books/:bookId" element={<BookDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const worldArea = await waitFor(() => {
      const el = screen.getByLabelText('世界观') as HTMLTextAreaElement;
      expect(el.value).toBe('旧世界观');
      return el;
    });

    setInput(worldArea, '新世界观文本');
    setInput(screen.getByLabelText('剧情大纲') as HTMLTextAreaElement, '第一卷：崛起');
    fireEvent.click(screen.getByRole('button', { name: '保存设定' }));
    await waitFor(() => expect(calls.some((c) => c.url.endsWith('/api/books/b1/meta') && c.init?.method === 'PUT')).toBe(true));
    const metaPut = calls.find((c) => c.url.endsWith('/api/books/b1/meta'));
    expect(JSON.parse(String((metaPut!.init as RequestInit).body))).toEqual({
      description: '新世界观文本',
      outline: '第一卷：崛起',
    });

    await waitFor(() => expect(screen.getByText('张三')).toBeTruthy());
    setInput(screen.getByLabelText('新卡姓名') as HTMLInputElement, '李四');
    setInput(screen.getByLabelText('新卡设定') as HTMLTextAreaElement, '反派');
    fireEvent.click(screen.getByRole('button', { name: '添加人物' }));
    await waitFor(() => expect(calls.some((c) => c.url.endsWith('/api/books/b1/characters') && c.init?.method === 'POST')).toBe(true));
    const cardPost = calls.find((c) => c.url.endsWith('/api/books/b1/characters') && c.init?.method === 'POST');
    expect(JSON.parse(String((cardPost!.init as RequestInit).body))).toEqual({
      name: '李四',
      baseSetting: '{"设定":"反派"}',
    });

    fireEvent.click(screen.getAllByRole('button', { name: '删除' })[0]);
    await waitFor(() =>
      expect(calls.some((c) => /\/api\/books\/b1\/characters\/k1$/.test(c.url) && c.init?.method === 'DELETE')).toBe(true),
    );
  });
});
