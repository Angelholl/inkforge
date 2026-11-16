import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import DiffPage from './DiffPage';

type StubResp = { ok: boolean; status: number; json: () => Promise<unknown>; text: () => Promise<string> };
const stubResp = (body: unknown): StubResp => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });

type ListItem = { id: string; chapterId: string; parentVersionId?: string; kind: string; wordCount: number; params: object; styleSampleIds: string[]; createdAt: string };
const item = (id: string, parentVersionId?: string): ListItem => ({
  id,
  chapterId: 'c1',
  kind: 'revised',
  wordCount: 100,
  params: {},
  styleSampleIds: [],
  createdAt: '2026-11-16T10:00:00.000Z',
  ...(parentVersionId ? { parentVersionId } : {}),
});

const CONTENT: Record<string, string> = { v1: '旧正文ABC', v2: '新正文ABD', v3: '另一版' };

/** 按 URL 分路：列表回信封（无 content），单取回完整版。 */
function mockFetch(list: ListItem[], currentId: string) {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      // 顺序敏感：/api/versions/:id 也含 '/versions'，必须先判单取
      if (url.includes('/api/versions/')) {
        const id = url.split('/').pop() as string;
        return stubResp({ ...item(id), content: CONTENT[id] ?? '' });
      }
      if (url.includes('/versions')) return stubResp({ currentVersionId: currentId, versions: list });
      return stubResp({ ok: true });
    }),
  );
  return calls;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderPage() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/books/b1/chapters/1/diff']}>
        <Routes>
          <Route path="/books/:bookId/chapters/:chapterNo/diff" element={<DiffPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('DiffPage（按 parent 链配对）', () => {
  it('current 的 parent 在列表内：两版正文各走 getVersion，旧→新方向不变', async () => {
    mockFetch([item('v2', 'v1'), item('v1')], 'v2');
    renderPage();
    const removed = await screen.findAllByTestId('diff-removed');
    const added = await screen.findAllByTestId('diff-added');
    expect(removed.map((e) => e.textContent).join('')).toContain('C');
    expect(added.map((e) => e.textContent).join('')).toContain('D');
    expect(await screen.findByText(/插入段 \d+ · 删除段 \d+/)).toBeTruthy();
  });

  it('parent 已被硬删（不在列表）：显示「上一版已删或不存在，无法对比」且不为缺失版本发请求', async () => {
    const calls = mockFetch([item('v2', 'gone'), item('v1')], 'v2');
    renderPage();
    expect(await screen.findByText('上一版已删或不存在，无法对比')).toBeTruthy();
    expect(calls.some((u) => u.includes('/api/versions/gone'))).toBe(false);
  });
});
