import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
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

  it('splitChapters：零章题命中 → 整篇单章', () => {
    const out = splitChapters('只有一段没有章题的文字。');
    expect(out).toHaveLength(1);
    expect(out[0].content).toContain('没有章题');
  });
});
