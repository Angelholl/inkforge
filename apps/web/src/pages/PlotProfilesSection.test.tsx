import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import PlotProfilesSection from './PlotProfilesSection';

// DEC-2026-1120-03：剧情蒸馏分区（analyze→预览可编辑→入库→列表→绑定/删除）
const PROFILE = {
  id: 'pp1',
  name: '剧情甲',
  structure: ['开篇以失踪信物立钩子。', '结局回收开篇信物完成闭环。'],
  sourcePath: 'inline:abcd1234',
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
      <PlotProfilesSection />
    </QueryClientProvider>,
  );
}

function stubFetch() {
  return vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url);
    calls.push({ url: u, init });
    if (u.endsWith('/api/plot-profiles/analyze')) {
      return jsonResponse({
        draft: { name: '剧情乙', sourcePath: 'inline:ef01', sourceHash: 'e'.repeat(64), structure: ['开篇钩子：失踪。', '收束：闭环。'] },
      });
    }
    if (u.endsWith('/api/plot-profiles') && init?.method === 'POST') return jsonResponse({ id: 'pp-new' }, 201);
    if (u.endsWith('/api/plot-profiles') && (!init?.method || init.method === 'GET')) return jsonResponse(rows);
    if (u.includes('/plot-profiles/') && init?.method === 'DELETE') {
      rows = rows.filter((r) => (r as typeof PROFILE).id !== 'pp1');
      return jsonResponse({ ok: true });
    }
    if (u.endsWith('/api/books')) return jsonResponse([]);
    return jsonResponse({});
  });
}

describe('PlotProfilesSection（DEC-2026-1120-03）', () => {
  it('列表渲染档案名/结构行/sourcePath；删除升 L2：取消收簇且未发 DELETE', async () => {
    vi.stubGlobal('fetch', stubFetch());
    renderSection();

    await waitFor(() => expect(screen.getByText('剧情甲')).toBeTruthy());
    expect(screen.getByText('开篇以失踪信物立钩子。')).toBeTruthy();
    expect(screen.getByText('inline:abcd1234')).toBeTruthy();
    expect(screen.queryByText(/该剧情档案将删除，已绑定书将自动解绑/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '删除' }));
    expect(screen.getByText(/该剧情档案将删除，已绑定书将自动解绑/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(screen.queryByText(/该剧情档案将删除，已绑定书将自动解绑/)).toBeNull();
    expect(calls.some((c) => c.init?.method === 'DELETE')).toBe(false);
  });

  it('删除升 L2：确认发 DELETE /api/plot-profiles/pp1 且行消失', async () => {
    vi.stubGlobal('fetch', stubFetch());
    renderSection();

    await waitFor(() => expect(screen.getByText('剧情甲')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '删除' }));
    fireEvent.click(screen.getByRole('button', { name: '确认删除' }));
    await waitFor(() => expect(calls.some((c) => c.init?.method === 'DELETE')).toBe(true));
    const del = calls.find((c) => c.init?.method === 'DELETE')!;
    expect(del.url.endsWith('/api/plot-profiles/pp1')).toBe(true);
    await waitFor(() => expect(screen.queryByText('剧情甲')).toBeNull());
  });

  it('前置校验：空名/去空白不足 200 字均拦截且不发 analyze', async () => {
    vi.stubGlobal('fetch', stubFetch());
    renderSection();

    await waitFor(() => expect(screen.getByText('剧情甲')).toBeTruthy());
    fireEvent.change(screen.getByLabelText('剧情蒸馏样本'), { target: { value: 'x'.repeat(200) } });
    fireEvent.click(screen.getByRole('button', { name: '剧情蒸馏' }));
    expect(await screen.findByText('请先填写剧情档案名称')).toBeTruthy();
    expect(calls.some((c) => String(c.url).includes('/analyze'))).toBe(false);

    fireEvent.change(screen.getByLabelText('剧情档案名称'), { target: { value: '新档案' } });
    fireEvent.change(screen.getByLabelText('剧情蒸馏样本'), { target: { value: 'abc' } });
    fireEvent.click(screen.getByRole('button', { name: '剧情蒸馏' }));
    expect(screen.getByText(/参考正文去空白后不足 200 字（当前 3 字）/)).toBeTruthy();
    expect(calls.some((c) => String(c.url).includes('/analyze'))).toBe(false);
  });

  it('样本文件选择：txt/md 导入回填正文并回显编码（owner 2026-11-21 反馈）', async () => {
    vi.stubGlobal('fetch', stubFetch());
    renderSection();

    await waitFor(() => expect(screen.getByText('剧情甲')).toBeTruthy());
    const input = screen.getByLabelText('导入样本文件') as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File(['# 《参考》长篇正文'.repeat(3)], '参考小说.txt', { type: 'text/plain' })] },
    });
    await waitFor(() =>
      expect((screen.getByLabelText('剧情蒸馏样本') as HTMLTextAreaElement).value).toContain('《参考》长篇正文'),
    );
    expect(screen.getByText(/已按 UTF-8 解码/)).toBeTruthy();
  });

  it('蒸馏在途 → 蒸馏按钮显示进度文案，草稿返回后复原（owner 2026-11-21 反馈）', async () => {
    let resolveAnalyze!: (r: unknown) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        const u = String(url);
        if (u.endsWith('/api/plot-profiles/analyze')) {
          return new Promise((res) => {
            resolveAnalyze = res;
          });
        }
        if (u.endsWith('/api/plot-profiles') && (!init?.method || init.method === 'GET')) return jsonResponse(rows);
        if (u.endsWith('/api/books')) return jsonResponse([]);
        return jsonResponse({});
      }),
    );
    renderSection();

    await waitFor(() => expect(screen.getByText('剧情甲')).toBeTruthy());
    fireEvent.change(screen.getByLabelText('剧情档案名称'), { target: { value: '剧情乙' } });
    fireEvent.change(screen.getByLabelText('剧情蒸馏样本'), { target: { value: 'x'.repeat(200) } });
    fireEvent.click(screen.getByRole('button', { name: '剧情蒸馏' }));
    const busyBtn = (await waitFor(() =>
      screen.getByRole('button', { name: '正在蒸馏，约需数分钟…' }),
    )) as HTMLButtonElement;
    expect(busyBtn.disabled).toBe(true);

    resolveAnalyze(
      jsonResponse({
        draft: { name: '剧情乙', sourcePath: 'inline:ef01', sourceHash: 'e'.repeat(64), structure: ['开篇钩子：失踪。', '收束：闭环。'] },
      }),
    );
    await waitFor(() => expect(screen.getByText(/草稿未入库/)).toBeTruthy());
    expect(screen.getByRole('button', { name: '剧情蒸馏' })).toBeTruthy();
  });

  it('analyze→预览结构行可编辑→确认入库：POST body 携带编辑后结构行', async () => {
    vi.stubGlobal('fetch', stubFetch());
    renderSection();

    fireEvent.change(screen.getByLabelText('剧情档案名称'), { target: { value: '剧情乙' } });
    fireEvent.change(screen.getByLabelText('剧情蒸馏样本'), { target: { value: 'x'.repeat(200) } });
    fireEvent.click(screen.getByRole('button', { name: '剧情蒸馏' }));
    expect(await screen.findByText(/草稿未入库/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText('剧情草稿结构行'), {
      target: { value: '开篇钩子：失踪。\n中段双线。\n收束：闭环。' },
    });
    fireEvent.click(screen.getByRole('button', { name: '确认入库' }));
    await waitFor(() => expect(calls.some((c) => c.url.endsWith('/api/plot-profiles') && c.init?.method === 'POST')).toBe(true));
    const save = calls.find((c) => c.url.endsWith('/api/plot-profiles') && c.init?.method === 'POST')!;
    const body = JSON.parse(String(save.init?.body)) as { draft: { name: string; structure: string[] } };
    expect(body.draft.name).toBe('剧情乙');
    expect(body.draft.structure).toEqual(['开篇钩子：失踪。', '中段双线。', '收束：闭环。']);
    expect(screen.getByText('剧情档案已入库：剧情乙')).toBeTruthy();
  });

  it('BR：蒸馏页剧情卡无绑定控件，徽标只读显示已绑定书', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        const u = String(url);
        calls.push({ url: u, init });
        if (u.endsWith('/api/plot-profiles') && (!init?.method || init.method === 'GET'))
          return jsonResponse([{ ...PROFILE, boundBooks: [{ id: 'b1', title: '测试书' }] }]);
        if (u.endsWith('/api/books')) return jsonResponse([{ id: 'b1', title: '测试书' }]);
        return jsonResponse({});
      }),
    );
    renderSection();

    await waitFor(() => expect(screen.getByText('剧情甲')).toBeTruthy());
    expect(screen.queryByLabelText(/绑定书-/)).toBeNull();
    expect(screen.queryByRole('button', { name: '绑定' })).toBeNull();
    const badge = screen.getByText(/已绑定：《测试书》/);
    expect(badge.querySelector('select, button')).toBeNull();
    expect(badge.closest('select, button')).toBeNull();
  });
});
