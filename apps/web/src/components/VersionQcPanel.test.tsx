import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { VersionQcPanel } from './VersionQcPanel';

const stubResp = (body: unknown) => ({
  ok: true,
  status: 200,
  json: async () => body,
  text: async () => JSON.stringify(body),
});

const ATTEMPTS = [
  {
    attempt: 1,
    l0: { checks: [{ name: '字数', pass: false, details: '低于下限' }, { name: '复文', pass: true }] },
    l1: { overall: 7, findings: [{ severity: 'major', dimension: '节奏', quote: '他推开门', comment: '拖沓' }] },
    gate: { action: 'rewrite', reasons: ['overall 7 < 8'] },
  },
  {
    attempt: 2,
    l0: { checks: [{ name: '字数', pass: true }] },
    l1: { overall: 8.5, findings: [] },
    gate: { action: 'pass', reasons: ['全过且分达标'] },
  },
];

/** 桩：/api/versions/:id/qc 也含 '/api/versions/'，必须先判 endsWith('/qc')。 */
function stubQc(attempts: unknown[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/qc')) return stubResp({ attempts });
      return stubResp({});
    }),
  );
}

function renderPanel(versionId: string) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <VersionQcPanel versionId={versionId} />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('VersionQcPanel', () => {
  it('两轮明细齐备：gate 语义色、理由清单、L1 finding 与 L0 未过项', async () => {
    stubQc(ATTEMPTS);
    renderPanel('v1');

    expect(await screen.findByTestId('qc-panel')).toBeTruthy();
    const rewrite = screen.getByText('rewrite');
    const pass = screen.getByText('pass');
    expect(rewrite.className).toMatch(/(^|\s)bg-warn-soft(\s|$)/);
    expect(pass.className).toMatch(/(^|\s)bg-ok-soft(\s|$)/);
    expect(screen.getByText('overall 7 < 8')).toBeTruthy();
    expect(screen.getByText('拖沓')).toBeTruthy();
    expect(screen.getByText('L0 未过：字数')).toBeTruthy();
    expect(screen.getByText('第1轮')).toBeTruthy();
  });

  it('无 qc 记录 → 空态说明（旧版本无 outputJson 时不留空壳）', async () => {
    stubQc([]);
    renderPanel('v2');

    const empty = await screen.findByTestId('qc-panel-empty');
    expect(empty.textContent).toContain('仅新运行的版本携带质检明细');
  });
});
