import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ChapterReaderPage from './ChapterReaderPage';
import type { VersionDto } from '@inkforge/shared';

type StubResp = { ok: boolean; status: number; json: () => Promise<unknown>; text: () => Promise<string> };
const stubResp = (body: unknown): StubResp => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });

const mkVersion = (id: string, kind: VersionDto['kind']): VersionDto => ({
  id,
  chapterId: 'c1',
  kind,
  content: `正文内容 ${id}`,
  wordCount: 1000,
  params: {},
  styleSampleIds: [],
  createdAt: '2026-11-16T10:00:00.000Z',
});

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => stubResp([mkVersion('v-current', 'draft'), mkVersion('v-old', 'revised')])),
  );
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
  it('版本链 chip：选中项软底蓝字，未选中灰字，实底选中形态废止', async () => {
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
  });
});
