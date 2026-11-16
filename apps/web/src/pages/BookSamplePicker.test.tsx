import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import BookSamplePicker from './BookSamplePicker';

type StubResp = { ok: boolean; status: number; json: () => Promise<unknown>; text: () => Promise<string> };
const stubResp = (body: unknown): StubResp => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });

/** 列表项即便带 content 也不该被用：正文必须经 /api/versions/:id 单取。 */
function mockFetch() {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      // 顺序敏感：/api/versions/:id 也含 '/versions'，必须先判单取
      if (url.includes('/api/versions/'))
        return stubResp({
          id: 'v-cur',
          chapterId: 'c1',
          kind: 'original',
          content: '真实正文XYZ',
          wordCount: 10,
          params: {},
          styleSampleIds: [],
          createdAt: '2026-11-16T10:00:00.000Z',
        });
      if (url.includes('/versions'))
        return stubResp({
          currentVersionId: 'v-cur',
          versions: [
            {
              id: 'v-cur',
              chapterId: 'c1',
              kind: 'original',
              wordCount: 10,
              params: {},
              styleSampleIds: [],
              createdAt: '2026-11-16T10:00:00.000Z',
              content: '不该出现在列表的正文',
            },
          ],
        });
      if (url.includes('/api/books/b1'))
        return stubResp({
          id: 'b1',
          title: '书一',
          description: '',
          outline: '',
          createdAt: '2026-11-16T10:00:00.000Z',
          updatedAt: '2026-11-16T10:00:00.000Z',
          chapters: [
            {
              id: 'c1',
              bookId: 'b1',
              chapterNo: 1,
              title: '第一章',
              isOriginal: true,
              blueprint: null,
              targetChars: 3000,
              status: 'done',
              currentVersionId: 'v-cur',
              createdAt: '2026-11-16T10:00:00.000Z',
            },
          ],
        });
      return stubResp([{ id: 'b1', title: '书一', description: '', outline: '', createdAt: '2026-11-16T10:00:00.000Z', updatedAt: '2026-11-16T10:00:00.000Z' }]);
    }),
  );
  return calls;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('BookSamplePicker', () => {
  it('导入所选章：正文取自 getVersion 单取而非版本列表', async () => {
    const onImport = vi.fn();
    const calls = mockFetch();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <BookSamplePicker onImport={onImport} />
      </QueryClientProvider>,
    );
    fireEvent.click(await screen.findByRole('button', { name: '从书架选书' }));
    const select = (await screen.findByLabelText('选择书籍')) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'b1' } });
    const box = (await screen.findByLabelText('选择第1章 第一章')) as HTMLInputElement;
    fireEvent.click(box);
    fireEvent.click(await screen.findByRole('button', { name: /导入所选 1 章/ }));
    await waitFor(() => expect(onImport).toHaveBeenCalledWith('【第1章 第一章】\n真实正文XYZ'));
    expect(calls.some((u) => u.endsWith('/api/versions/v-cur'))).toBe(true);
  });
});
