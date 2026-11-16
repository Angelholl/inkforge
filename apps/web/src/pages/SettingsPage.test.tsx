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

/** 桩按「URL + method」双条件分路：质量分区走 /api/settings/quality，provider 表单仍按原形状回。 */
function stubFetch() {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const quality = url.endsWith('/api/settings/quality');
    if (quality && init?.method === 'PUT') return jsonResponse({ saved: true, restartRequired: false });
    if (quality) return jsonResponse({ scoreThreshold: 8, isDefault: true });
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
});
