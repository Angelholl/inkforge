import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SettingsPage from './SettingsPage';

const settingsResponse = {
  strataBaseUrl: 'https://api.example.com/v1',
  strataModel: 'gpt-test',
  hasApiKey: true,
};

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
    text: async () => JSON.stringify(data),
  };
}

/** 桩按「URL + method」双条件分路：质量分区走 /api/settings/quality，词表分区走 /api/landing-words，provider 表单仍按原形状回。 */
function stubFetch() {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const quality = url.endsWith('/api/settings/quality');
    if (quality && init?.method === 'PUT') return jsonResponse({ saved: true, restartRequired: false });
    if (quality) return jsonResponse({ scoreThreshold: 8, isDefault: true });
    const lw = url.endsWith('/api/landing-words');
    if (lw && init?.method === 'PUT') return jsonResponse({ saved: true, counts: { h: 1, l: 1 }, sections: ['H', 'L'] });
    if (lw)
      return jsonResponse({ text: '[H]\n玉佩光\n[L]\n窗棂摇\n', counts: { h: 1, l: 1 }, sections: ['H', 'L'], path: 'C:/users/lw.txt' });
    if (init?.method === 'PUT') return jsonResponse({ saved: true, restartRequired: true });
    return jsonResponse(settingsResponse);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderPage() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('SettingsPage', () => {
  it('渲染三个输入框；mock 开关已彻底删除（回归 owner 拍板）', async () => {
    stubFetch();
    renderPage();

    await waitFor(() =>
      expect((screen.getByLabelText('本地端点地址') as HTMLInputElement).value).toBe('https://api.example.com/v1'),
    );
    expect(screen.getByLabelText('API Key')).toBeTruthy();
    expect(screen.getByLabelText('模型名')).toBeTruthy();
    expect(screen.getByPlaceholderText('已保存，留空保持不变')).toBeTruthy();
    expect(screen.queryByLabelText('启用 mock 模式')).toBeNull();
  });

  it('填写并提交后以 PUT 调用 /api/settings 且出现成功提示', async () => {
    const fetchMock = stubFetch();
    renderPage();

    await waitFor(() =>
      expect((screen.getByLabelText('本地端点地址') as HTMLInputElement).value).toBe('https://api.example.com/v1'),
    );

    fireEvent.change(screen.getByLabelText('本地端点地址'), { target: { value: 'http://127.0.0.1:9999' } });
    fireEvent.change(screen.getByLabelText('模型名'), { target: { value: 'my-model' } });
    fireEvent.change(screen.getByLabelText('API Key'), { target: { value: 'sk-test' } });
    fireEvent.click(screen.getByText('保存'));

    await waitFor(() => expect(screen.getByText('已保存，重启应用后生效')).toBeTruthy());

    const putCall = fetchMock.mock.calls.find((call) => call[1]?.method === 'PUT');
    expect(putCall).toBeTruthy();
    expect(putCall?.[0]).toBe('/api/settings');
    expect(JSON.parse(String(putCall?.[1]?.body))).toEqual({
      strataBaseUrl: 'http://127.0.0.1:9999',
      strataModel: 'my-model',
      strataApiKey: 'sk-test',
    });
  });

  it('设置页不再含蒸馏分区与风格档案表单', async () => {
    stubFetch();
    renderPage();

    await waitFor(() =>
      expect((screen.getByLabelText('本地端点地址') as HTMLInputElement).value).toBe('https://api.example.com/v1'),
    );
    expect(screen.queryByLabelText('蒸馏模板')).toBeNull();
    expect(screen.queryByText('风格档案')).toBeNull();
    expect(screen.queryByPlaceholderText('档案名称')).toBeNull();
  });

  it('saving 期间保存钮 aria-busy="true"、disabled，可见文本仍为「保存」', async () => {
    let resolvePut!: () => void;
    const putPromise = new Promise<void>((resolve) => {
      resolvePut = resolve;
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.endsWith('/api/settings/quality')) {
          return jsonResponse(
            init?.method === 'PUT' ? { saved: true, restartRequired: false } : { scoreThreshold: 8, isDefault: true },
          );
        }
        if (url.endsWith('/api/landing-words')) {
          return jsonResponse({ text: '', counts: { h: 0, l: 0 }, sections: ['H', 'L'], path: 'x' });
        }
        if (init?.method === 'PUT') {
          await putPromise;
          return jsonResponse({ saved: true, restartRequired: true });
        }
        return jsonResponse(settingsResponse);
      }),
    );
    renderPage();

    await waitFor(() =>
      expect((screen.getByLabelText('本地端点地址') as HTMLInputElement).value).toBe('https://api.example.com/v1'),
    );

    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    const btn = await waitFor(() => {
      const b = screen.getByRole('button', { name: '保存' }) as HTMLButtonElement;
      expect(b.getAttribute('aria-busy')).toBe('true');
      return b;
    });
    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toBe('保存');

    resolvePut();
    await waitFor(() => expect(screen.getByText('已保存，重启应用后生效')).toBeTruthy());
  });

  it('质量分区：读回阈值 8，改 9 保存即 PUT /api/settings/quality 且提示不含「重启」', async () => {
    const fetchMock = stubFetch();
    renderPage();

    const input = await waitFor(() => {
      const el = screen.getByLabelText('入库分阈值 OVERALL（1-10，默认 8.0）') as HTMLInputElement;
      expect(el.value).toBe('8');
      return el;
    });
    fireEvent.change(input, { target: { value: '9' } });
    fireEvent.click(screen.getByRole('button', { name: '保存质量设置' }));

    const okMsg = await waitFor(() => screen.getByText(/已保存：每个 run 的章节管线开始时读取新阈值/));
    expect(okMsg.textContent).not.toContain('重启');
    const putCall = fetchMock.mock.calls.find(
      (call) => call[1]?.method === 'PUT' && String(call[0]).endsWith('/api/settings/quality'),
    );
    expect(putCall).toBeTruthy();
    expect(JSON.parse(String(putCall?.[1]?.body))).toEqual({ scoreThreshold: 9 });
    expect(screen.queryByText(/重启/)).toBeNull();
  });

  it('落地分级词表分区：GET 渲染摘要与生效路径，编辑保存 PUT /api/landing-words', async () => {
    const fetchMock = stubFetch();
    renderPage();

    const ta = await waitFor(() => {
      const el = screen.getByLabelText('落地分级词表') as HTMLTextAreaElement;
      expect(el.value).toContain('玉佩光');
      return el;
    });
    expect(screen.getByText(/H 池 1 词 · L 池 1 词/)).toBeTruthy();
    expect(screen.getByText(/生效文件：C:\/users\/lw\.txt/)).toBeTruthy();

    fireEvent.change(ta, { target: { value: '[H]\n玉佩光\n铜镜光\n[L]\n窗棂摇\n' } });
    fireEvent.click(screen.getByRole('button', { name: '保存词表' }));

    await waitFor(() => expect(screen.getByText(/已保存：下一次生成/)).toBeTruthy());
    const putCall = fetchMock.mock.calls.find(
      (call) => call[1]?.method === 'PUT' && String(call[0]).endsWith('/api/landing-words'),
    );
    expect(putCall).toBeTruthy();
    expect(JSON.parse(String(putCall?.[1]?.body))).toEqual({ text: '[H]\n玉佩光\n铜镜光\n[L]\n窗棂摇\n' });
  });

  it('落地分级词表空池 → 「闸门不判定」提示；H 判=L∪H 说明常驻', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const lw = url.endsWith('/api/landing-words');
        if (lw && init?.method === 'PUT') return jsonResponse({ saved: true, counts: { h: 0, l: 0 }, sections: ['H', 'L'] });
        if (lw) return jsonResponse({ text: '# 空\n[H]\n[L]\n', counts: { h: 0, l: 0 }, sections: ['H', 'L'], path: 'x' });
        if (url.endsWith('/api/settings/quality')) {
          return jsonResponse(
            init?.method === 'PUT' ? { saved: true, restartRequired: false } : { scoreThreshold: 8, isDefault: true },
          );
        }
        if (init?.method === 'PUT') return jsonResponse({ saved: true, restartRequired: true });
        return jsonResponse(settingsResponse);
      }),
    );
    renderPage();

    await waitFor(() => expect(screen.getByText(/落地闸门不判定/)).toBeTruthy());
    expect(screen.getByText(/H 档命中=L 词∪H 词/)).toBeTruthy();
  });

  it('落地分级词表保存 400 → 服务端 error 文案进提示区', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const lw = url.endsWith('/api/landing-words');
        if (lw && init?.method === 'PUT') return jsonResponse({ error: '第 2 行节头格式非法（应为 [X] 形态，如 [H]/[L]/[调情]）' }, 400);
        if (lw) return jsonResponse({ text: '', counts: { h: 0, l: 0 }, sections: ['H', 'L'], path: 'x' });
        if (url.endsWith('/api/settings/quality')) {
          return jsonResponse(
            init?.method === 'PUT' ? { saved: true, restartRequired: false } : { scoreThreshold: 8, isDefault: true },
          );
        }
        if (init?.method === 'PUT') return jsonResponse({ saved: true, restartRequired: true });
        return jsonResponse(settingsResponse);
      }),
    );
    renderPage();

    const ta = await waitFor(() => screen.getByLabelText('落地分级词表') as HTMLTextAreaElement);
    fireEvent.change(ta, { target: { value: '# 注\n[H\n甲\n' } });
    fireEvent.click(screen.getByRole('button', { name: '保存词表' }));

    await waitFor(() => expect(screen.getByText(/节头格式非法/)).toBeTruthy());
  });
});
