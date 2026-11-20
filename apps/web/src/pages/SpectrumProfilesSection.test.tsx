import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SpectrumProfilesSection from './SpectrumProfilesSection';

// DEC-2026-1120-09：人物光谱蒸馏分区（analyze→预览可编辑→入库→列表→绑定/删除），沿 plot 测试同构
const PROFILE = {
  id: 'sp1',
  name: '光谱甲',
  structure: ['隐忍的复仇者原型：以退为进。', '天真引导者原型：以信任破局。'],
  sourcePath: 'inline:abcd1234',
  sourceHash: 'a'.repeat(64),
  createdAt: '2026-11-20T08:00:00.000Z',
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
      <SpectrumProfilesSection />
    </QueryClientProvider>,
  );
}

function stubFetch() {
  return vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url);
    calls.push({ url: u, init });
    if (u.endsWith('/api/spectrum-profiles/analyze')) {
      return jsonResponse({
        draft: { name: '光谱乙', sourcePath: 'inline:ef01', sourceHash: 'e'.repeat(64), structure: ['孤勇者原型：独抗风暴。', '影子军师原型：幕后执子。'] },
      });
    }
    if (u.endsWith('/api/spectrum-profiles') && init?.method === 'POST') return jsonResponse({ id: 'sp-new' }, 201);
    if (u.endsWith('/api/spectrum-profiles') && (!init?.method || init.method === 'GET')) return jsonResponse(rows);
    if (u.includes('/spectrum-profiles/') && init?.method === 'DELETE') {
      rows = rows.filter((r) => (r as typeof PROFILE).id !== 'sp1');
      return jsonResponse({ ok: true });
    }
    if (u.endsWith('/api/books')) return jsonResponse([]);
    return jsonResponse({});
  });
}

describe('SpectrumProfilesSection（DEC-2026-1120-09）', () => {
  it('列表渲染档案名/原型行/sourcePath；删除升 L2：取消收簇且未发 DELETE', async () => {
    vi.stubGlobal('fetch', stubFetch());
    renderSection();

    await waitFor(() => expect(screen.getByText('光谱甲')).toBeTruthy());
    expect(screen.getByText('隐忍的复仇者原型：以退为进。')).toBeTruthy();
    expect(screen.getByText('inline:abcd1234')).toBeTruthy();
    expect(screen.queryByText(/该人物光谱档案将删除，已绑定书将自动解绑/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '删除' }));
    expect(screen.getByText(/该人物光谱档案将删除，已绑定书将自动解绑/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(screen.queryByText(/该人物光谱档案将删除，已绑定书将自动解绑/)).toBeNull();
    expect(calls.some((c) => c.init?.method === 'DELETE')).toBe(false);
  });

  it('删除升 L2：确认发 DELETE /api/spectrum-profiles/sp1 且行消失', async () => {
    vi.stubGlobal('fetch', stubFetch());
    renderSection();

    await waitFor(() => expect(screen.getByText('光谱甲')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '删除' }));
    fireEvent.click(screen.getByRole('button', { name: '确认删除' }));
    await waitFor(() => expect(calls.some((c) => c.init?.method === 'DELETE')).toBe(true));
    const del = calls.find((c) => c.init?.method === 'DELETE')!;
    expect(del.url.endsWith('/api/spectrum-profiles/sp1')).toBe(true);
    await waitFor(() => expect(screen.queryByText('光谱甲')).toBeNull());
  });

  it('前置校验：空名/去空白不足 200 字均拦截且不发 analyze', async () => {
    vi.stubGlobal('fetch', stubFetch());
    renderSection();

    await waitFor(() => expect(screen.getByText('光谱甲')).toBeTruthy());
    fireEvent.change(screen.getByLabelText('人物光谱蒸馏样本'), { target: { value: 'x'.repeat(200) } });
    fireEvent.click(screen.getByRole('button', { name: '人物光谱蒸馏' }));
    expect(await screen.findByText('请先填写人物光谱档案名称')).toBeTruthy();
    expect(calls.some((c) => String(c.url).includes('/analyze'))).toBe(false);

    fireEvent.change(screen.getByLabelText('人物光谱档案名称'), { target: { value: '新档案' } });
    fireEvent.change(screen.getByLabelText('人物光谱蒸馏样本'), { target: { value: 'abc' } });
    fireEvent.click(screen.getByRole('button', { name: '人物光谱蒸馏' }));
    expect(screen.getByText(/参考正文去空白后不足 200 字（当前 3 字）/)).toBeTruthy();
    expect(calls.some((c) => String(c.url).includes('/analyze'))).toBe(false);
  });

  it('analyze→预览原型行可编辑→确认入库：POST body 携带编辑后原型行', async () => {
    vi.stubGlobal('fetch', stubFetch());
    renderSection();

    fireEvent.change(screen.getByLabelText('人物光谱档案名称'), { target: { value: '光谱乙' } });
    fireEvent.change(screen.getByLabelText('人物光谱蒸馏样本'), { target: { value: 'x'.repeat(200) } });
    fireEvent.click(screen.getByRole('button', { name: '人物光谱蒸馏' }));
    expect(await screen.findByText(/草稿未入库/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText('人物光谱草稿原型行'), {
      target: { value: '孤勇者原型：独抗风暴。\n双面信使原型：传信亦传谎。\n影子军师原型：幕后执子。' },
    });
    fireEvent.click(screen.getByRole('button', { name: '确认入库' }));
    await waitFor(() => expect(calls.some((c) => c.url.endsWith('/api/spectrum-profiles') && c.init?.method === 'POST')).toBe(true));
    const save = calls.find((c) => c.url.endsWith('/api/spectrum-profiles') && c.init?.method === 'POST')!;
    const body = JSON.parse(String(save.init?.body)) as { draft: { name: string; structure: string[] } };
    expect(body.draft.name).toBe('光谱乙');
    expect(body.draft.structure).toEqual(['孤勇者原型：独抗风暴。', '双面信使原型：传信亦传谎。', '影子军师原型：幕后执子。']);
    expect(screen.getByText('人物光谱档案已入库：光谱乙')).toBeTruthy();
  });

  it('绑定书：选择书 → PUT /api/books/b1/spectrum 携带 profileId', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        const u = String(url);
        calls.push({ url: u, init });
        if (u.endsWith('/api/spectrum-profiles') && (!init?.method || init.method === 'GET')) return jsonResponse(rows);
        if (u.endsWith('/api/books')) return jsonResponse([{ id: 'b1', title: '测试书' }]);
        if (u.endsWith('/api/books/b1/spectrum') && init?.method === 'PUT') return jsonResponse({ ok: true, spectrumProfileId: 'sp1' });
        return jsonResponse({});
      }),
    );
    renderSection();

    await waitFor(() => expect(screen.getByText('光谱甲')).toBeTruthy());
    fireEvent.change(screen.getByLabelText('绑定书-光谱甲'), { target: { value: 'b1' } });
    fireEvent.click(screen.getByRole('button', { name: '绑定' }));
    await waitFor(() => expect(calls.some((c) => c.url.endsWith('/api/books/b1/spectrum') && c.init?.method === 'PUT')).toBe(true));
    const bind = calls.find((c) => c.url.endsWith('/api/books/b1/spectrum') && c.init?.method === 'PUT')!;
    expect(JSON.parse(String(bind.init?.body))).toEqual({ profileId: 'sp1' });
    expect(await screen.findByText(/已绑定到《测试书》/)).toBeTruthy();
  });
});
