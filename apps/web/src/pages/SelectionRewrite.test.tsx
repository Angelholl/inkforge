import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SelectionRewrite } from './SelectionRewrite';

type StubResp = { ok: boolean; status: number; json: () => Promise<unknown>; text: () => Promise<string> };
const stubResp = (body: unknown): StubResp => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });

const rewritten = {
  id: 'v-new-12345678',
  chapterId: 'c1',
  kind: 'revised',
  content: '重写后的正文',
  wordCount: 900,
  params: {},
  styleSampleIds: [],
  createdAt: '2026-11-16T10:00:00.000Z',
};

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => stubResp(rewritten)));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('SelectionRewrite', () => {
  it('预设 chip 走 quiet·sm 形态且点击填充指令', async () => {
    render(<SelectionRewrite versionId="v1" />);
    const preset = screen.getByRole('button', { name: '预设-润色' }) as HTMLButtonElement;
    expect(preset.className).toContain('text-muted');
    expect(preset.className).toContain('h-8');
    fireEvent.click(preset);
    expect((screen.getByLabelText('改写指令') as HTMLInputElement).value).toContain('不改情节与信息量');
  });

  it('busy 期间提交钮 aria-busy=true、disabled，可见文本仍为「提交选段重写」', async () => {
    let resolvePost!: () => void;
    const hold = new Promise<void>((resolve) => {
      resolvePost = resolve;
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'POST') {
          await hold;
          return stubResp(rewritten);
        }
        return stubResp(rewritten);
      }),
    );
    render(<SelectionRewrite versionId="v1" />);
    fireEvent.change(screen.getByPlaceholderText('粘贴要改写的选段'), { target: { value: '待改写选段正文' } });
    fireEvent.change(screen.getByLabelText('改写指令'), { target: { value: '压缩到三分之一' } });
    fireEvent.click(screen.getByRole('button', { name: '提交选段重写' }));

    const btn = await waitFor(() => {
      const b = screen.getByRole('button', { name: '提交选段重写' }) as HTMLButtonElement;
      expect(b.getAttribute('aria-busy')).toBe('true');
      return b;
    });
    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toBe('提交选段重写');
    expect(btn.querySelector('.animate-spin')).toBeTruthy();

    resolvePost();
    await waitFor(() => expect(screen.getByText(/已生成重写版本/)).toBeTruthy());
    const done = screen.getByRole('button', { name: '提交选段重写' }) as HTMLButtonElement;
    expect(done.getAttribute('aria-busy')).toBeNull();
    expect(done.disabled).toBe(false);
  });
});
