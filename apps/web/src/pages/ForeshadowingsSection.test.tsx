import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ForeshadowingsSection from './ForeshadowingsSection';

const ROW = {
  id: 'f1',
  bookId: 'b1',
  description: '铜牌的来历',
  plantedCh: 2,
  advancedJson: '[]',
  status: 'open' as const,
};

function jsonResponse(data: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => data, text: async () => JSON.stringify(data) };
}

let rows: unknown[] = [ROW];
const calls: Array<{ url: string; init?: RequestInit }> = [];

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  rows = [ROW];
  calls.length = 0;
});

function renderSection() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ForeshadowingsSection bookId="b1" />
    </QueryClientProvider>,
  );
}

describe('ForeshadowingsSection（C2）', () => {
  it('列表渲染埋设/状态；登记走 POST；回收带章号走 PUT resolved；删除走 DELETE', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        const u = String(url);
        calls.push({ url: u, init });
        if (u.endsWith('/foreshadowings') && (!init?.method || init.method === 'GET')) return jsonResponse(rows);
        if (u.endsWith('/foreshadowings') && init?.method === 'POST') {
          rows = [...rows, { id: 'f2', bookId: 'b1', description: JSON.parse(String(init.body)).description, plantedCh: 3, advancedJson: '[]', status: 'open' }];
          return jsonResponse({ id: 'f2', status: 'open' }, 201);
        }
        if (u.includes('/foreshadowings/') && init?.method === 'PUT') {
          const body = JSON.parse(String(init.body));
          if (body.status === 'resolved' && !body.resolvedCh) return jsonResponse({ error: 'resolved 状态必须带 resolvedCh' }, 400);
          return jsonResponse({ ...ROW, status: 'resolved', resolvedCh: body.resolvedCh });
        }
        if (u.includes('/foreshadowings/') && init?.method === 'DELETE') return jsonResponse({ ok: true });
        return jsonResponse({});
      }),
    );
    renderSection();

    await waitFor(() => expect(screen.getByText('铜牌的来历')).toBeTruthy());
    expect(screen.getByText(/埋设于第2章/)).toBeTruthy();
    expect(screen.getByText('open')).toBeTruthy();

    // 登记
    fireEvent.change(screen.getByLabelText('伏笔描述'), { target: { value: '师父的临别赠语' } });
    fireEvent.click(screen.getByRole('button', { name: '登记伏笔' }));
    await waitFor(() => expect(calls.some((c) => c.url.endsWith('/foreshadowings') && c.init?.method === 'POST')).toBe(true));
    await waitFor(() => expect(screen.getByText('师父的临别赠语')).toBeTruthy());

    // 回收：先空章号 → 提示；再填 → PUT resolved+ch
    fireEvent.click(screen.getAllByRole('button', { name: '标记回收' })[0]);
    expect(screen.getByText('标记回收须填回收章号')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('回收章-铜牌的来历'), { target: { value: '7' } });
    fireEvent.click(screen.getAllByRole('button', { name: '标记回收' })[0]);
    await waitFor(() => {
      const put = calls.find((c) => c.init?.method === 'PUT');
      expect(put).toBeTruthy();
      expect(JSON.parse(String(put!.init!.body))).toEqual({ status: 'resolved', resolvedCh: 7 });
    });

    // 删除
    fireEvent.click(screen.getAllByRole('button', { name: '删除' })[1]);
    await waitFor(() => expect(calls.some((c) => c.init?.method === 'DELETE')).toBe(true));
  });
});
