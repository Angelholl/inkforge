import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { computeVersionDiff } from '../src/pages/DiffPage';
import DiffPage from '../src/pages/DiffPage';
import DashboardPage from '../src/pages/DashboardPage';
import { SelectionRewrite } from '../src/pages/SelectionRewrite';

vi.mock('../src/api/client', () => ({
  api: {
    listVersions: vi.fn(async () => [
      { id: 'v2', kind: 'revised', content: '新版内容多了这句', wordCount: 9, params: {}, styleSampleIds: [], createdAt: '2026-11-12T00:00:00Z' },
      { id: 'v1', kind: 'draft', content: '旧版内容', wordCount: 4, params: {}, styleSampleIds: [], createdAt: '2026-11-12T00:00:01Z' },
    ]),
    getReport: vi.fn(async () => ({
      chapters: [{ chapterNo: 1, steps: [{ step: 'draft', attempt: 1, ms: 1234, usage: { promptTokens: 10, completionTokens: 500 } }] }],
      totals: { ms: 1234, promptTokens: 10, completionTokens: 500 },
    })),
    rewriteSelection: vi.fn(async () => ({ id: 'v3', kind: 'revised', content: '改写结果', wordCount: 4, params: { selectionRewrite: true }, styleSampleIds: [], createdAt: '2026-11-12T00:00:02Z' })),
  },
}));

const qc = new QueryClient();
const wrap = (ui: React.ReactElement, initialPath: string) => (
  <QueryClientProvider client={qc}>
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/books/:bookId/chapters/:chapterNo/diff" element={ui} />
        <Route path="/runs/:runId/dashboard" element={ui} />
        <Route path="*" element={ui} />
      </Routes>
    </MemoryRouter>
  </QueryClientProvider>
);

afterEach(() => cleanup());

describe('computeVersionDiff', () => {
  it('相邻版本字符 diff：插入/删除标记', () => {
    const parts = computeVersionDiff('旧版内容', '新版内容多了这句');
    expect(parts.some((p) => p.added)).toBe(true);
    expect(parts.some((p) => p.removed)).toBe(true);
  });
});

describe('DiffPage', () => {
  it('渲染插入与删除标记', async () => {
    render(wrap(<DiffPage />, '/books/b1/chapters/1/diff'));
    await waitFor(() => expect(screen.getAllByTestId('diff-added').length).toBeGreaterThan(0));
    expect(screen.getAllByTestId('diff-removed').length).toBeGreaterThan(0);
    expect(screen.getByText(/插入段/)).toBeTruthy();
  });
});

describe('DashboardPage', () => {
  it('渲染报表表格行', async () => {
    render(wrap(<DashboardPage />, '/runs/r1/dashboard'));
    await waitFor(() => expect(screen.getByText('draft')).toBeTruthy());
    expect(screen.getByTestId('report-table')).toBeTruthy();
    expect(screen.getByText(/总耗时/)).toBeTruthy();
  });
});

describe('SelectionRewrite', () => {
  it('提交调用 client 并提示新版本（不动 current）', async () => {
    const onCreated = vi.fn();
    render(<SelectionRewrite versionId="v1" onCreated={onCreated} />);
    fireEvent.change(screen.getByPlaceholderText('粘贴要改写的选段'), { target: { value: '选段文本' } });
    fireEvent.change(screen.getByPlaceholderText(/改写指令/), { target: { value: '压缩' } });
    fireEvent.click(screen.getByText('提交选段重写'));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(screen.getByText(/未移动 current 指针/)).toBeTruthy();
  });

  it('空选段/指令 → 校验提示', () => {
    render(<SelectionRewrite versionId="v1" />);
    fireEvent.click(screen.getByText('提交选段重写'));
    expect(screen.getByText('选段与指令均不能为空')).toBeTruthy();
  });
});
