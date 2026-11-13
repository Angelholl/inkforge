import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';
import NewBookIdeaPage from './NewBookIdeaPage';
import type { OutlineItemDto } from '@inkforge/shared';

const OUTLINE_TWO: OutlineItemDto[] = [
  { chapterNo: 1, blueprint: { goal: '少年踏上旅途', beats: ['告别村落', '初遇同伴'], mustHaveBeats: [], bannedTopics: [] } },
  { chapterNo: 2, blueprint: { goal: '入城遇阻', beats: ['守卫盘查', '贵人相助'], mustHaveBeats: [], bannedTopics: [] } },
];

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
    text: async () => JSON.stringify(data),
  };
}

type Call = { url: string; init?: RequestInit };

function stubFetch(calls: Call[]) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    if (url.endsWith('/api/books') && init?.method === 'POST') return jsonResponse({ id: 'b1', title: 'x' }, 201);
    if (url.endsWith('/outline-suggest') && init?.method === 'POST') return jsonResponse({ outline: OUTLINE_TWO, source: 'llm' });
    if (/\/blueprint$/.test(url) && init?.method === 'PUT') return jsonResponse({ id: 'c1' });
    if (url.endsWith('/api/runs') && init?.method === 'POST') return jsonResponse({ runId: 'r1' }, 201);
    return jsonResponse({ error: 'unexpected' }, 404);
  });
}

function setInput(sel: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = sel instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')!.set.call(sel, value);
  sel.dispatchEvent(new Event('input', { bubbles: true }));
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/new']}>
      <Routes>
        <Route path="/new" element={<NewBookIdeaPage />} />
        <Route path="/runs/:runId" element={<div>运行页标记</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('NewBookIdeaPage 入口 B 向导', () => {
  it('新书向导：建书并生成全书蓝图后进入审阅', async () => {
    const calls: Call[] = [];
    vi.stubGlobal('fetch', stubFetch(calls));
    renderPage();

    fireEvent.change(screen.getByPlaceholderText('书名'), { target: { value: '入口B向导书' } });
    const worldview = screen.getByPlaceholderText(/世界观 \/ 角色卡 \/ 规则/) as HTMLTextAreaElement;
    setInput(worldview, '修真大陆，少年逆天改命。');
    fireEvent.change(screen.getByLabelText('章节数'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: '建书并生成蓝图' }));

    await waitFor(() => expect(screen.getByText(/少年踏上旅途/)).toBeTruthy());
    expect(screen.getByText(/入城遇阻/)).toBeTruthy();
    expect(screen.getByText('第1章')).toBeTruthy();
    expect(screen.getByText('第2章')).toBeTruthy();

    const create = calls.find((c) => c.url.endsWith('/api/books'));
    expect(create).toBeTruthy();
    expect(JSON.parse(String(create?.[1 as never]?.body ?? (create!.init as RequestInit).body))).toEqual({
      title: '入口B向导书',
      description: '修真大陆，少年逆天改命。',
    });
    const suggest = calls.find((c) => c.url.endsWith('/outline-suggest'));
    expect(suggest).toBeTruthy();
    expect(JSON.parse(String((suggest!.init as RequestInit).body))).toEqual({ chapterCount: 2 });
  });

  it('新书向导：采用全部蓝图后 PUT 逐章落库并 generate 发起', async () => {
    const calls: Call[] = [];
    vi.stubGlobal('fetch', stubFetch(calls));
    renderPage();

    fireEvent.change(screen.getByPlaceholderText('书名'), { target: { value: '入口B向导书' } });
    fireEvent.click(screen.getByRole('button', { name: '建书并生成蓝图' }));
    await waitFor(() => expect(screen.getByText(/少年踏上旅途/)).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: /保存蓝图并继续/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: /发起生成/ })).toBeTruthy());

    const puts = calls.filter((c) => /\/blueprint$/.test(c.url));
    expect(puts).toHaveLength(2);
    expect(puts[0].url).toBe('/api/books/b1/chapters/1/blueprint');
    const put1 = JSON.parse(String((puts[0].init as RequestInit).body));
    expect(put1.title).toBe('第1章');
    expect(put1.targetChars).toBe(3000);
    expect(put1.blueprint.goal).toBe('少年踏上旅途');

    fireEvent.click(screen.getByRole('button', { name: /发起生成/ }));
    await waitFor(() => expect(screen.getByText('运行页标记')).toBeTruthy());

    const run = calls.find((c) => c.url.endsWith('/api/runs'));
    expect(run).toBeTruthy();
    expect(JSON.parse(String((run!.init as RequestInit).body))).toEqual({
      bookId: 'b1',
      mode: 'generate',
      fromChapter: 1,
      toChapter: 2,
    });
  });
});
