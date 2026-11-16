import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ImitationProfilesSection from './ImitationProfilesSection';

const PROFILE = {
  id: 'ip1',
  name: '拆解档案甲',
  version: 1,
  sourcePath: 'inline:abcd1234',
  createdAt: '2026-11-16T08:00:00.000Z',
};

function jsonResponse(data: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => data, text: async () => JSON.stringify(data) };
}

let rows: unknown[] = [PROFILE];
const calls: Array<{ url: string; init?: RequestInit }> = [];

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  rows = [PROFILE];
  calls.length = 0;
});

function renderSection() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ImitationProfilesSection />
    </QueryClientProvider>,
  );
}

function stubFetch() {
  return vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url);
    calls.push({ url: u, init });
    if (u.endsWith('/api/imitation-profiles') && (!init?.method || init.method === 'GET')) return jsonResponse(rows);
    if (u.includes('/imitation-profiles/') && init?.method === 'DELETE') {
      rows = rows.filter((r) => (r as typeof PROFILE).id !== 'ip1');
      return jsonResponse({ ok: true });
    }
    if (u.endsWith('/api/books')) return jsonResponse([]);
    return jsonResponse({});
  });
}

describe('ImitationProfilesSection（D4-T5）', () => {
  it('列表渲染档案与 sourcePath；删除升 L2：点取消收簇且未发 DELETE', async () => {
    vi.stubGlobal('fetch', stubFetch());
    renderSection();

    await waitFor(() => expect(screen.getByText('拆解档案甲')).toBeTruthy());
    expect(screen.getByText('inline:abcd1234')).toBeTruthy();
    expect(screen.queryByText('该拆解档案将删除，已绑定书将自动解绑，不可恢复。')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '删除' }));
    expect(screen.getByText('该拆解档案将删除，已绑定书将自动解绑，不可恢复。')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(screen.queryByText('该拆解档案将删除，已绑定书将自动解绑，不可恢复。')).toBeNull();
    expect(calls.some((c) => c.init?.method === 'DELETE')).toBe(false);
  });

  it('删除升 L2：点确认删除发出 DELETE /api/imitation-profiles/<id> 且行消失', async () => {
    vi.stubGlobal('fetch', stubFetch());
    renderSection();

    await waitFor(() => expect(screen.getByText('拆解档案甲')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '删除' }));
    fireEvent.click(screen.getByRole('button', { name: '确认删除' }));
    await waitFor(() => expect(calls.some((c) => c.init?.method === 'DELETE')).toBe(true));
    const del = calls.find((c) => c.init?.method === 'DELETE');
    expect(del!.url.endsWith('/api/imitation-profiles/ip1')).toBe(true);
    await waitFor(() => expect(screen.queryByText('拆解档案甲')).toBeNull());
  });
});
