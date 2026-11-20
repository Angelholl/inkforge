import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router';
import RunPage from './RunPage';

// jsdom 无 EventSource：RunAsideCard.test 同款最小假件（本卡不触发 onerror，走 GET 404 路径）
class FakeEventSource {
  addEventListener(): void {}
  close(): void {}
  onerror: ((ev: unknown) => void) | null = null;
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function renderRun(runId: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/runs/${runId}`]}>
        <Routes>
          <Route path="/runs/:runId" element={<RunPage />} />
          <Route path="/books" element={<div>BOOKS_SHELF</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('RunPage 404 优雅降级（删书级联清除）', () => {
  it('run GET 404 → 渲染「运行不存在」+ 返回书架链接，且 3s 后不再发起重连/轮询 fetch', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('EventSource', FakeEventSource);
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
      const u = String(url);
      if (u.endsWith('/api/runs/r404')) return new Response(JSON.stringify({ error: 'run not found' }), { status: 404 });
      return new Response('[]', { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    renderRun('r404');
    // 冲刷微任务 + 定时器（react-query 状态传播需一次事件循环）：query 以 404 reject → 降级渲染
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(screen.getByText('运行不存在（可能已被删书级联清除）')).toBeTruthy();
    expect(screen.queryByText(/未连接（3s 重连）/)).toBeNull();
    expect(screen.getByText('返回书架 →')).toBeTruthy();

    const callsAfterResolve = fetchMock.mock.calls.length;
    // 推进远超 3s 重连周期：降级后不得有任何后续 fetch（SSE 重连探测 + 回退轮询都已停机）
    await act(async () => {
      vi.advanceTimersByTime(10000);
    });
    expect(fetchMock.mock.calls.length).toBe(callsAfterResolve);
  });
});
