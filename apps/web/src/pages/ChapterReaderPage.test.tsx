import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ChapterReaderPage from './ChapterReaderPage';

type StubResp = { ok: boolean; status: number; json: () => Promise<unknown>; text: () => Promise<string> };
const stubResp = (body: unknown): StubResp => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
const stubErr = (status: number, body: unknown): StubResp => ({
  ok: false,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
});

// 列表项一律不带 content 键（Task8A 起服务端列表瘦身）
const LIST_ITEMS = [
  { id: 'v-current', chapterId: 'c1', kind: 'draft', wordCount: 1000, params: { overall: 9 }, styleSampleIds: [], createdAt: '2026-11-16T10:00:00.000Z' },
  { id: 'v-old', chapterId: 'c1', kind: 'revised', parentVersionId: 'v-x', wordCount: 900, params: {}, styleSampleIds: [], createdAt: '2026-11-16T09:00:00.000Z' },
] as Array<{ id: string; chapterId: string; parentVersionId?: string; kind: string; wordCount: number; params: object; styleSampleIds: string[]; createdAt: string }>;

const FULL = (id: string) => ({
  id,
  chapterId: 'c1',
  kind: 'draft',
  content: `正文内容 ${id}`,
  wordCount: 1000,
  params: {},
  styleSampleIds: [],
  createdAt: '2026-11-16T10:00:00.000Z',
});

/** 按 URL 分路的 fetch 桩；DELETE 成功后从列表移除该版本（模拟服务端硬删）。 */
function mockFetch(opts: { deleteResp?: (id: string) => StubResp } = {}) {
  const items = [...LIST_ITEMS];
  const calls: Array<{ method: string; url: string }> = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    calls.push({ method, url });
    if (method === 'DELETE') {
      const id = url.split('/').pop() as string;
      const resp = opts.deleteResp ? opts.deleteResp(id) : stubResp({ ok: true });
      if (resp.ok) {
        const i = items.findIndex((v) => v.id === id);
        if (i >= 0) items.splice(i, 1);
      }
      return resp;
    }
    // 顺序敏感：/api/versions/:id/qc 同时含 '/qc'、'/api/versions/' 与 '/versions'，必须先判 /qc
    if (url.endsWith('/qc')) return stubResp({ attempts: [] });
    if (url.includes('/api/versions/')) return stubResp(FULL(url.split('/').pop() as string));
    if (url.includes('/versions')) return stubResp({ currentVersionId: 'v-current', versions: items });
    if (url.endsWith('/api/books/b1/export')) return stubResp({ files: ['001-第一章.md'], outDir: 'X:\\mock\\data\\exports\\测试书' });
    return stubResp({ ok: true });
  });
  vi.stubGlobal('fetch', fn);
  return calls;
}

beforeEach(() => {
  mockFetch();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderPage() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/books/b1/chapters/1']}>
        <Routes>
          <Route path="/books/:bookId/chapters/:chapterNo" element={<ChapterReaderPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ChapterReaderPage', () => {
  it('版本链 chip：选中项软底蓝字，未选中灰字，实底选中形态废止；正文经 getVersion 单取渲染', async () => {
    const calls = mockFetch();
    renderPage();
    const chips = (await screen.findAllByRole('button', { name: /字 ·/ })) as HTMLButtonElement[];
    expect(chips.length).toBe(2);
    const selected = chips.filter((b) => b.className.includes('bg-primary-soft'));
    const idle = chips.filter((b) => !b.className.includes('bg-primary-soft'));
    expect(selected).toHaveLength(1);
    expect(idle).toHaveLength(1);
    expect(selected[0].className).toContain('text-primary-strong');
    expect(selected[0].className).toContain('rounded-ctl');
    // 实底选中（bg-primary text-white 相邻出现）属废止形态
    expect(selected[0].className).not.toContain('bg-primary text-white');
    expect(idle[0].className).toContain('text-muted');
    // 列表已无 content：正文只能来自单取端点
    expect(await screen.findByText(/正文内容 v-current/)).toBeTruthy();
    expect(calls.some((c) => c.url.includes('/api/versions/v-current'))).toBe(true);
  });

  it('current 行删除钮 disabled，非 current 行删除钮可点', async () => {
    mockFetch();
    renderPage();
    const dels = (await screen.findAllByRole('button', { name: '删除' })) as HTMLButtonElement[];
    expect(dels.length).toBe(2);
    expect(dels[0].disabled).toBe(true); // 列表首项 = 信封 currentVersionId 对应版本
    expect(dels[1].disabled).toBe(false);
  });

  it('删除非 current 版本：确认簇 → 发 DELETE → 行消失且高亮回到 current 版本', async () => {
    const calls = mockFetch();
    renderPage();
    const dels = (await screen.findAllByRole('button', { name: '删除' })) as HTMLButtonElement[];
    fireEvent.click(dels[1]);
    const confirm = await screen.findByRole('button', { name: '确认删除' });
    expect(await screen.findByText(/永久移除该版本正文/)).toBeTruthy();
    fireEvent.click(confirm);
    await waitFor(() => expect(calls.some((c) => c.method === 'DELETE' && c.url.endsWith('/api/versions/v-old'))).toBe(true));
    const chips = (await screen.findAllByRole('button', { name: /字 ·/ })) as HTMLButtonElement[];
    expect(chips.length).toBe(1); // v-old 行已消失
    expect(chips[0].className).toContain('bg-primary-soft'); // 高亮回退到 current
    expect(chips[0].textContent).toContain('draft');
  });

  it('删除被 409 拒绝时展示服务端 error 文案（apiErrorText 还原）', async () => {
    mockFetch({ deleteResp: () => stubErr(409, { error: '当前版本不可删除（先回滚到其他版本）', reason: 'current' }) });
    renderPage();
    const dels = (await screen.findAllByRole('button', { name: '删除' })) as HTMLButtonElement[];
    fireEvent.click(dels[1]);
    fireEvent.click(await screen.findByRole('button', { name: '确认删除' }));
    expect(await screen.findByText(/当前版本不可删除/)).toBeTruthy();
  });

  it('导出澄清：按钮「导出全书正文（TXT）」+旁注；toast 报 outDir 绝对路径', async () => {
    mockFetch();
    renderPage();
    const btn = screen.getByRole('button', { name: '导出全书正文（TXT）' });
    expect(screen.getByText('保存到本机 data/exports/，不自动下载')).toBeTruthy();
    fireEvent.click(btn);
    expect(await screen.findByText(/已导出 1 个文件至 X:\\mock\\data\\exports\\测试书/)).toBeTruthy();
  });
});
