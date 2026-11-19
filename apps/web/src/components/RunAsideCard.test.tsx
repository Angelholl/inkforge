import { describe, it, vi, afterEach, expect } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router';
import RunAsideCard from './RunAsideCard';
import type { RunDto } from '@inkforge/shared';

class FakeEventSource {
  addEventListener(): void {}
  close(): void {}
  onerror: ((ev: unknown) => void) | null = null;
}
vi.stubGlobal('EventSource', FakeEventSource);
// 注意：afterEach 的 unstubAllGlobals 会移除上面模块级 stub，故每测试仍需在 installFetchStub 里重挂

const base = { bookId: 'b9', mode: 'continue', skipFailures: true, salvagePartial: true, maxRounds: 2, createdAt: '2026-11-19T00:00:00Z' } as const;
const runs: RunDto[] = [
  { ...base, id: 'r-run-act1', status: 'running', chapterScope: { from: 2, to: 2 } },
  { ...base, id: 'r-run-pau1', status: 'paused', chapterScope: { from: 3, to: 3 } },
  { ...base, id: 'r-run-done1', status: 'done', chapterScope: { from: 1, to: 1 } },
  { ...base, id: 'r-run-can1', status: 'cancelled', chapterScope: { from: 4, to: 6 } },
];

type Call = { url: string; init?: RequestInit };
const calls: Call[] = [];
let pauseStatus = 200;
function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
    text: async () => JSON.stringify(data),
  };
}
function installFetchStub() {
  vi.stubGlobal('EventSource', FakeEventSource);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      calls.push({ url: u, init });
      if (u.endsWith('/pause') && pauseStatus !== 200) return jsonResponse({ error: 'run is done' }, pauseStatus);
      return jsonResponse({});
    }),
  );
}

function renderCard() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/books/b9']}>
        <Routes>
          <Route path="/books/:bookId" element={<RunAsideCard runs={runs} bookId="b9" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('RunAsideCard', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    calls.length = 0;
    pauseStatus = 200;
  });

  it('活动态行内联暂停/取消，paused 行出现继续', async () => {
    installFetchStub();
    renderCard();
    expect(screen.getAllByRole('button', { name: '暂停' }).length).toBe(1);
    expect(screen.getAllByRole('button', { name: '继续' }).length).toBe(1);
    expect(screen.getAllByRole('button', { name: '取消' }).length).toBe(2);
    expect(screen.getAllByRole('link', { name: '报表' }).length).toBe(4);
    fireEvent.click(screen.getAllByRole('button', { name: '暂停' })[0]);
    await waitFor(() =>
      expect(calls.some((c) => c.url.endsWith('/api/runs/r-run-act1/pause') && c.init?.method === 'POST' && c.init?.body === '{}')).toBe(true),
    );
  });

  it('完成态行「查看第N章→」链接指向章节阅读页', () => {
    installFetchStub();
    renderCard();
    expect(screen.getByRole('link', { name: '查看第1章→' }).getAttribute('href')).toBe('/books/b9/chapters/1');
    expect(screen.getByRole('link', { name: '查看第4-6章→' }).getAttribute('href')).toBe('/books/b9/chapters/4');
  });

  it('动作失败显示错误文案', async () => {
    installFetchStub();
    pauseStatus = 409;
    renderCard();
    fireEvent.click(screen.getAllByRole('button', { name: '暂停' })[0]);
    await screen.findByText('暂停失败：run is done');
  });
});
