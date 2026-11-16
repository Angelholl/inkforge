import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import NewBookPage, { splitChapters } from './NewBookPage';

const SAMPLE = `第一章 入山
他背起行囊走进山门。
第二章 旧庙
庙门半掩，尘灰满地。
第三章 夜谈
火光摇曳，老人开口。

第X章 不匹配行不算章题`;

function fetchFor(url: string): Response {
  if (url.endsWith('/api/books')) {
    return new Response(JSON.stringify({ id: 'b1', title: '试炼', chapters: [], runs: [] }), { status: 201 });
  }
  return new Response('[]', { status: 200 });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('NewBookPage', () => {
  it('拆章预览：粘贴 3 章渲染 3 条且可删一条', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => fetchFor(url)),
    );
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <NewBookPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // step1 → 建书
    fireEvent.change(screen.getByPlaceholderText('书名'), { target: { value: '试炼' } });
    const createBtn = screen.getByRole('button', { name: '建书并进入导入' }) as HTMLButtonElement;
    expect(createBtn.className).toContain('bg-primary');
    expect(createBtn.className).toContain('h-ctl');
    fireEvent.click(createBtn);
    await waitFor(() => screen.getByPlaceholderText(/粘贴全文/));

    // step2 → 粘贴 + 拆章预览
    fireEvent.change(screen.getByPlaceholderText(/粘贴全文/), { target: { value: SAMPLE } });
    const previewBtn = screen.getByRole('button', { name: '拆章预览' }) as HTMLButtonElement;
    expect(previewBtn.className).toContain('border-line');
    expect(previewBtn.className).toContain('h-ctl');
    const importBtn = screen.getByRole('button', { name: /导入 0 章/ }) as HTMLButtonElement;
    expect(importBtn.className).toContain('bg-primary');
    expect(importBtn.className).toContain('disabled:opacity-45');
    fireEvent.click(previewBtn);
    expect(screen.getAllByRole('listitem')).toHaveLength(3);

    // 删除一条 → 2 条
    const delBtn = screen.getAllByRole('button', { name: '删除' })[0] as HTMLButtonElement;
    expect(delBtn.className).toContain('text-danger');
    expect(delBtn.className).toContain('h-8');
    fireEvent.click(screen.getAllByRole('button', { name: '删除' })[1]);
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('质量轮数 select：发起续写时把 maxRounds 透传给 POST /api/runs', async () => {
    const calls: Array<{ url: string; method?: string; body?: string }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        const u = String(url);
        calls.push({ url: u, method: init?.method, body: init?.body ? String(init.body) : undefined });
        if (u.endsWith('/api/books')) {
          return new Response(JSON.stringify({ id: 'b1', title: '试炼', chapters: [], runs: [] }), { status: 201 });
        }
        if (u.endsWith('/import-original')) {
          return new Response(JSON.stringify({ lastChapterNo: 3, importedChapterNos: [1, 2, 3] }), { status: 200 });
        }
        if (u.endsWith('/api/runs')) return new Response(JSON.stringify({ runId: 'r1' }), { status: 200 });
        return new Response('{}', { status: 200 });
      }),
    );
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={['/books/new']}>
          <Routes>
            <Route path="*" element={<NewBookPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    fireEvent.change(screen.getByPlaceholderText('书名'), { target: { value: '试炼' } });
    fireEvent.click(screen.getByRole('button', { name: '建书并进入导入' }));
    await waitFor(() => screen.getByPlaceholderText(/粘贴全文/));
    fireEvent.change(screen.getByPlaceholderText(/粘贴全文/), { target: { value: SAMPLE } });
    fireEvent.click(screen.getByRole('button', { name: '拆章预览' }));
    fireEvent.click(await screen.findByRole('button', { name: /导入 3 章/ }));
    await waitFor(() => screen.getByRole('button', { name: /发起续写/ }));

    const sel = (await screen.findByLabelText('质量轮数')) as HTMLSelectElement;
    expect(sel.value).toBe('2');
    fireEvent.change(sel, { target: { value: '1' } });
    fireEvent.change(screen.getByPlaceholderText(/蓝图 JSON/), {
      target: { value: JSON.stringify({ goal: '入城遇阻', beats: ['守卫盘查'] }) },
    });
    fireEvent.click(screen.getByRole('button', { name: /发起续写/ }));

    await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.url.endsWith('/api/runs'))).toBe(true));
    const runCall = calls.find((c) => c.method === 'POST' && c.url.endsWith('/api/runs'));
    expect(JSON.parse(String(runCall?.body))).toMatchObject({ mode: 'continue', maxRounds: 1 });
  });

  it('splitChapters：零章题命中 → 整篇单章', () => {
    const out = splitChapters('只有一段没有章题的文字。');
    expect(out).toHaveLength(1);
    expect(out[0].content).toContain('没有章题');
  });
});
