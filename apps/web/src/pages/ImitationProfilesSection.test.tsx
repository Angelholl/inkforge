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
  boundBooks: [{ id: 'b1', title: '测试书' }],
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

  it('前置校验：空名点拆解 → 提示填名且不发 analyze 请求（回归 DEC-2026-1117-03）', async () => {
    vi.stubGlobal('fetch', stubFetch());
    renderSection();

    await waitFor(() => expect(screen.getByText('拆解档案甲')).toBeTruthy());
    fireEvent.change(screen.getByLabelText('仿写样本'), { target: { value: 'x'.repeat(200) } });
    fireEvent.click(screen.getByRole('button', { name: '拆解分析' }));
    expect(await screen.findByText('请先填写仿写档案名称')).toBeTruthy();
    expect(calls.some((c) => String(c.url).includes('/analyze'))).toBe(false);
  });

  it('前置校验：正文去空白不足 200 字 → 拦截提示且不发请求', async () => {
    vi.stubGlobal('fetch', stubFetch());
    renderSection();

    await waitFor(() => expect(screen.getByText('拆解档案甲')).toBeTruthy());
    fireEvent.change(screen.getByLabelText('仿写档案名称'), { target: { value: '新档案' } });
    fireEvent.change(screen.getByLabelText('仿写样本'), { target: { value: 'abc' } });
    fireEvent.click(screen.getByRole('button', { name: '拆解分析' }));
    expect(screen.getByText(/参考正文去空白后不足 200 字（当前 3 字）/)).toBeTruthy();
    expect(calls.some((c) => String(c.url).includes('/analyze'))).toBe(false);
  });

  it('章数钳制：输入非法值再拆解 → 提交时回退 12 章发送（string 态提交钳制）', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        const u = String(url);
        calls.push({ url: u, init });
        if (u.endsWith('/api/imitation-profiles/analyze'))
          return jsonResponse({ draft: { structure: [], style: { rulesText: '' }, blueprint: [] } });
        if (u.endsWith('/api/imitation-profiles') && (!init?.method || init.method === 'GET')) return jsonResponse(rows);
        if (u.endsWith('/api/books')) return jsonResponse([]);
        return jsonResponse({});
      }),
    );
    renderSection();

    await waitFor(() => expect(screen.getByText('拆解档案甲')).toBeTruthy());
    fireEvent.change(screen.getByLabelText('仿写档案名称'), { target: { value: '钳制测' } });
    fireEvent.change(screen.getByLabelText('仿写样本'), { target: { value: 'x'.repeat(200) } });
    fireEvent.change(screen.getByLabelText('仿写反推章数'), { target: { value: 'abc' } });
    fireEvent.click(screen.getByRole('button', { name: '拆解分析' }));
    await waitFor(() => expect(calls.some((c) => String(c.url).includes('/analyze'))).toBe(true));
    const analyzeCall = calls.find((c) => String(c.url).includes('/analyze'))!;
    const body = JSON.parse(String(analyzeCall.init?.body));
    expect(body.chapterCount).toBe(12);
    expect(body.name).toBe('钳制测');
  });

  it('文件选择：隐藏 input + 虚线 label，选 md 后 UTF-8 解码回填仿写样本', async () => {
    vi.stubGlobal('fetch', stubFetch());
    renderSection();

    await waitFor(() => expect(screen.getByText('拆解档案甲')).toBeTruthy());

    // ① input 存在且 accept 含 .md
    const input = document.querySelector('#imitation-sample-file') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.type).toBe('file');
    expect(input.accept).toContain('.md');

    // ② 注入 File（UTF-8，≥200 字中性内容）→ 回填 aria-label「仿写样本」textarea
    const sample = '中性参考正文用于验证文件导入回显，内容不涉及任何真实人物地点与事件，仅作结构拆解测试之用。'.repeat(6);
    expect(sample.length).toBeGreaterThanOrEqual(200);
    fireEvent.change(input, {
      target: { files: [new File([sample], '参考.md', { type: 'text/markdown' })] },
    });
    const sampleArea = () => screen.getByLabelText('仿写样本') as HTMLTextAreaElement;
    await waitFor(() => expect(sampleArea().value).toContain('结构拆解测试之用'));
    expect(sampleArea().value).toContain(sample.slice(0, 12));

    // ③ label 文案与 htmlFor
    const label = document.querySelector('label[for="imitation-sample-file"]') as HTMLLabelElement;
    expect(label).toBeTruthy();
    expect(label.textContent).toContain('点击选择本地 txt / md 文件');
    expect(label.htmlFor).toBe('imitation-sample-file');
  });

  it('BR：蒸馏页仿写卡无绑定控件，徽标只读显示已绑定书', async () => {
    vi.stubGlobal('fetch', stubFetch());
    renderSection();

    await waitFor(() => expect(screen.getByText('拆解档案甲')).toBeTruthy());
    expect(screen.queryByLabelText(/绑定书-/)).toBeNull();
    expect(screen.queryByRole('button', { name: '绑定' })).toBeNull();
    const badge = screen.getByText(/已绑定：《测试书》/);
    expect(badge.querySelector('select, button')).toBeNull();
    expect(badge.closest('select, button')).toBeNull();
  });
});
