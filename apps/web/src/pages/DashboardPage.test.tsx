import { describe, it, vi, afterEach, expect } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router';
import DashboardPage from './DashboardPage';

const calls: { url: string; init?: RequestInit }[] = [];
function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
    text: async () => JSON.stringify(data),
  };
}
function installFetchStub() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      calls.push({ url: u, init });
      if (u.endsWith('/api/runs/r1/report'))
        return jsonResponse({
          chapters: [
            { chapterNo: 1, steps: [
              { step: 'finalize', attempt: 1, ms: 10, usage: { promptTokens: 1, completionTokens: 2 }, versionId: 'v-1' },
              { step: 'draft', attempt: 1, ms: 5, usage: { promptTokens: 3, completionTokens: 4 }, versionDeleted: true, versionId: 'v-x' },
              { step: 'qc', attempt: 1, ms: 2, usage: { promptTokens: 0, completionTokens: 0 } },
            ] },
          ],
          totals: { ms: 17, promptTokens: 4, completionTokens: 6 },
        });
      if (u.endsWith('/api/runs/r1/versions'))
        return jsonResponse({
          runId: 'r1',
          versions: [
            { versionId: 'v-1', chapterId: 'c1', chapterNo: 1, kind: 'final', wordCount: 8, content: '这是最终版正文。', isCurrent: true, createdAt: '2026-11-19T00:00:02Z' },
          ],
        });
      return jsonResponse({});
    }),
  );
}

function renderPage() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/runs/r1/dashboard']}>
        <Routes>
          <Route path="/runs/:runId/dashboard" element={<DashboardPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('DashboardPage 产物列展开', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    calls.length = 0;
  });

  it('产物列「正文」可展开该步版本正文', async () => {
    installFetchStub();
    renderPage();
    await screen.findByText('finalize');
    expect(screen.getByText('版本已删')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '正文' }));
    await screen.findByText('这是最终版正文。');
    expect(calls.some((c) => c.url.endsWith('/api/runs/r1/versions'))).toBe(true);
  });

  it('再点「正文」收起', async () => {
    installFetchStub();
    renderPage();
    await screen.findByText('finalize');
    fireEvent.click(screen.getByRole('button', { name: '正文' }));
    await screen.findByText('这是最终版正文。');
    fireEvent.click(screen.getByRole('button', { name: '正文' }));
    expect(screen.queryByText('这是最终版正文。')).toBeNull();
  });

  it('步无 versionId（qc 老步）→ 产物列为空', async () => {
    installFetchStub();
    renderPage();
    await screen.findByText('finalize');
    expect(screen.getAllByRole('button', { name: '正文' }).length).toBe(1);
  });
});
