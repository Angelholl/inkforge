import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import BookDetailPage, { normalizeWeights } from './BookDetailPage';

// 回归：original 章须有「补摘要」按钮（手动触发，零自动模型调用——DEC-2026-1113-05 第 3 条）
const book = {
  id: 'b1',
  title: '测试书',
  description: '旧世界观',
  outline: '旧大纲',
  createdAt: '2026-11-13T00:00:00Z',
  updatedAt: '2026-11-13T00:00:00Z',
  chapters: [
    {
      id: 'c1',
      bookId: 'b1',
      chapterNo: 1,
      title: '第一章',
      isOriginal: true,
      blueprint: null,
      targetChars: 2500,
      status: 'done',
      createdAt: '2026-11-13T00:00:00Z',
    },
    {
      id: 'c2',
      bookId: 'b1',
      chapterNo: 2,
      title: '第二章',
      isOriginal: false,
      blueprint: null,
      targetChars: 3000,
      status: 'planned',
      createdAt: '2026-11-13T00:00:00Z',
    },
  ],
  runs: [],
};

type Call = { url: string; init?: RequestInit };
const calls: Call[] = [];
// Task-05 随迁：默认直通（pass）；新增顺序断言例置 show 验证 confirm→run 顺序。
let gateMode: 'pass' | 'show' = 'pass';
let confirmFails = false; // 主审直修③：confirm 失败门保持打开用例
const GATE_SHOW_REPORT = {
  action: 'show',
  fingerprint: 'fp-test',
  aClass: [],
  previewDescription: '剥后世界观文本',
  headWindowWarn: false,
  hasArchive: true,
  binding: {
    styleBinding: null,
    styleFewshotOn: false,
    snapshotPresent: false,
    plotProfileId: null,
    spectrumProfileId: null,
    imitationProfileId: null,
    profileNames: {},
  },
};

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
    text: async () => JSON.stringify(data),
  };
}

const CHARACTER_FIXTURE = [{ id: 'k1', name: '张三', baseSetting: '{"身份":"主角"}', offlineFromChapter: null }];

// 每测试自装 stub（afterEach unstubAllGlobals 会移除模块级 stub，第二个测试会裸奔）
function installFetchStub() {
  let characters = [...CHARACTER_FIXTURE];
  // book 可变副本：PUT blueprint 后章行入列（发起续写预检章蓝图存在）
  let bookState = { ...book, chapters: book.chapters.map((c) => ({ ...c })) };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      calls.push({ url: u, init });
      if (u.endsWith('/api/books/b1/characters')) {
        if (init?.method === 'POST') return jsonResponse({ id: 'k2', name: '李四', baseSetting: '{"设定":"反派"}', offlineFromChapter: null }, 201);
        return jsonResponse(characters);
      }
      const del = u.match(/\/api\/books\/b1\/characters\/([^/]+)$/);
      if (del && init?.method === 'DELETE') {
        characters = characters.filter((c) => c.id !== del[1]);
        return jsonResponse({}, 204);
      }
      if (del && init?.method === 'PUT') {
        // 0009 下线/恢复：patch 合并回读
        const patch = JSON.parse(String(init.body)) as Record<string, unknown>;
        const idx = characters.findIndex((c) => c.id === del[1]);
        if (idx < 0) return jsonResponse({ error: 'not found' }, 404);
        characters[idx] = { ...characters[idx], ...patch } as (typeof characters)[number];
        return jsonResponse(characters[idx]);
      }
      if (u.includes('/blueprint-suggest')) {
        return jsonResponse({ blueprint: { goal: '建议目标：入城遇阻', beats: ['守卫盘查'], mustHaveBeats: [], bannedTopics: [] }, source: 'llm' });
      }
      const bpPut = u.match(/\/api\/books\/b1\/chapters\/(\d+)\/blueprint$/);
      if (bpPut && init?.method === 'PUT') {
        const body = JSON.parse(String(init.body)) as { title: string; blueprint: null; targetChars?: number };
        const no = Number(bpPut[1]);
        const ch = { id: `c-new-${no}`, bookId: 'b1', chapterNo: no, title: body.title, isOriginal: false, blueprint: body.blueprint, targetChars: body.targetChars ?? 3000, status: 'planned', createdAt: '2026-11-13T00:00:00Z' };
        bookState = { ...bookState, chapters: [...bookState.chapters.filter((c) => c.chapterNo !== no), ch].sort((a, b) => a.chapterNo - b.chapterNo) };
        return jsonResponse(ch, 201);
      }
      // 删章（DEC-2026-1120-02）：DELETE 后从 book 副本移除该章（模拟服务端硬删+refetch）
      const chDel = u.match(/\/api\/books\/b1\/chapters\/(\d+)$/);
      if (chDel && init?.method === 'DELETE') {
        const no = Number(chDel[1]);
        bookState = { ...bookState, chapters: bookState.chapters.filter((c) => c.chapterNo !== no) };
        return jsonResponse({ ok: true });
      }
      // Task-05 随迁：门端点 stub（直通形态保持既有 run 端点断言真实命中）
      if (u.endsWith('/fusion-gate/confirm') && init?.method === 'POST')
        return confirmFails ? jsonResponse({ error: 'profile not found: 不存在' }, 400) : jsonResponse({ results: {}, fingerprint: 'fp-test' });
      if (u.endsWith('/fusion-gate/analyze') && init?.method === 'POST') return jsonResponse({ rows: [], degraded: false });
      if (u.endsWith('/fusion-gate')) return jsonResponse(gateMode === 'pass' ? { action: 'pass', fingerprint: 'fp-test' } : GATE_SHOW_REPORT);
      if (u.endsWith('/api/runs') && init?.method === 'POST') return jsonResponse({ runId: 'r1234567890' }, 202);
      if (u.includes('/api/books/b1/meta')) return jsonResponse({ ...bookState, description: '旧世界观', outline: '旧大纲' });
      if (u.includes('/api/books/b1')) {
        return { ok: true, status: 200, json: async () => bookState, text: async () => JSON.stringify(bookState) };
      }
      return { ok: true, status: 200, json: async () => ({}), text: async () => '{}' };
    }),
  );
}

/** 风格绑定/解绑/开关专用桩：bound 与 fewshot 可变，PUT 后 GET 回读新值（模拟服务端绑定默认开语义 + refetch）。 */
function installStyleStub() {
  let bound: string | null = null;
  let fewshot = false;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      calls.push({ url: u, init });
      if (u.endsWith('/api/books/b1/style-fewshot') && init?.method === 'PUT') {
        fewshot = Boolean((JSON.parse(String(init.body)) as { on: boolean }).on);
        return jsonResponse({ ok: true, styleFewshotOn: fewshot });
      }
      if (u.endsWith('/api/books/b1/style') && init?.method === 'PUT') {
        // body 双形态：多选 {primaryProfileId} 与 legacy {profileId}
        const parsed = JSON.parse(String(init.body)) as { profileId?: string | null; primaryProfileId?: string };
        bound = parsed.profileId ?? parsed.primaryProfileId ?? null;
        fewshot = bound !== null; // 绑定/重绑置 1、解绑置 0（DEC-2026-1122-03③ 服务端语义）
        return jsonResponse({ ok: true, styleProfileId: bound });
      }
      if (u.endsWith('/api/style-profiles')) {
        return jsonResponse([{ id: 'sp1', name: '测试档案', version: 1, createdAt: '2026-11-13T08:00:00Z', metrics: {}, sourcePath: 'inline:x' }]);
      }
      // 分支顺序敏感：人物卡列表也在 /api/books/b1 前缀下，必须先回数组，否则 (characters ?? []).map 炸
      if (u.endsWith('/api/books/b1/characters')) return jsonResponse([]);
      if (u.includes('/api/books/b1')) return jsonResponse({ ...book, styleProfileId: bound, styleFewshotOn: fewshot });
      return jsonResponse({});
    }),
  );
}

installFetchStub();

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  calls.length = 0;
  gateMode = 'pass';
  confirmFails = false;
});

function setInput(sel: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = sel instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(sel, value);
  sel.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('BookDetailPage', () => {
  it('original 章渲染「补摘要」按钮且仅 original 章可见', async () => {
    installFetchStub();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={['/books/b1']}>
          <Routes>
            <Route path="/books/:bookId" element={<BookDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getAllByRole('button', { name: '补摘要' }).length).toBe(1));
  });

  it('导出区说明行：保存位置说明可见（D3 澄清）', async () => {
    installFetchStub();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={['/books/b1']}>
          <Routes>
            <Route path="/books/:bookId" element={<BookDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByText('导出文件保存到本机 data/exports/，不自动下载')).toBeTruthy());
  });

  it('书详情：保存设定调用 PUT meta 且人物卡增删可见', async () => {
    installFetchStub();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={['/books/b1']}>
          <Routes>
            <Route path="/books/:bookId" element={<BookDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const worldArea = await waitFor(() => {
      const el = screen.getByLabelText('世界观') as HTMLTextAreaElement;
      expect(el.value).toBe('旧世界观');
      return el;
    });

    setInput(worldArea, '新世界观文本');
    setInput(screen.getByLabelText('剧情大纲') as HTMLTextAreaElement, '第一卷：崛起');
    fireEvent.click(screen.getByRole('button', { name: '保存设定' }));
    await waitFor(() => expect(calls.some((c) => c.url.endsWith('/api/books/b1/meta') && c.init?.method === 'PUT')).toBe(true));
    const metaPut = calls.find((c) => c.url.endsWith('/api/books/b1/meta'));
    expect(JSON.parse(String((metaPut!.init as RequestInit).body))).toEqual({
      description: '新世界观文本',
      outline: '第一卷：崛起',
    });

    await waitFor(() => expect(screen.getByText('张三')).toBeTruthy());
    setInput(screen.getByLabelText('新卡姓名') as HTMLInputElement, '李四');
    setInput(screen.getByLabelText('新卡设定') as HTMLTextAreaElement, '反派');
    fireEvent.click(screen.getByRole('button', { name: '添加人物' }));
    await waitFor(() => expect(calls.some((c) => c.url.endsWith('/api/books/b1/characters') && c.init?.method === 'POST')).toBe(true));
    const cardPost = calls.find((c) => c.url.endsWith('/api/books/b1/characters') && c.init?.method === 'POST');
    expect(JSON.parse(String((cardPost!.init as RequestInit).body))).toEqual({
      name: '李四',
      baseSetting: '{"设定":"反派"}',
    });

    fireEvent.click(screen.getAllByRole('button', { name: '删除' })[0]);
    fireEvent.click(screen.getByRole('button', { name: '确认删除' }));
    await waitFor(() =>
      expect(calls.some((c) => /\/api\/books\/b1\/characters\/k1$/.test(c.url) && c.init?.method === 'DELETE')).toBe(true),
    );
  });

  it('人物卡删除：展开 L2 确认簇且取消不发 DELETE', async () => {
    installFetchStub();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={['/books/b1']}>
          <Routes>
            <Route path="/books/:bookId" element={<BookDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByText('张三')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: '删除' }));
    expect(screen.getByText('该人物卡及其历史状态将一并删除，不可恢复。')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    await waitFor(() =>
      expect(screen.queryByText('该人物卡及其历史状态将一并删除，不可恢复。')).toBeNull(),
    );
    expect(calls.some((c) => c.init?.method === 'DELETE')).toBe(false);
  });

  it('人物卡删除：确认后发出 DELETE 且该行消失', async () => {
    installFetchStub();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={['/books/b1']}>
          <Routes>
            <Route path="/books/:bookId" element={<BookDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByText('张三')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: '删除' }));
    fireEvent.click(screen.getByRole('button', { name: '确认删除' }));
    await waitFor(() =>
      expect(calls.some((c) => /\/api\/books\/b1\/characters\/k1$/.test(c.url) && c.init?.method === 'DELETE')).toBe(true),
    );
    await waitFor(() => expect(screen.queryByText('张三')).toBeNull());
  });

  it('质量轮数 select：默认 2；改 1 后整书生成 body 带 maxRounds:1，改 3 后行内生成带 maxRounds:3', async () => {
    installFetchStub();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={['/books/b1']}>
          <Routes>
            <Route path="/books/:bookId" element={<BookDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const sel = (await screen.findByLabelText('质量轮数')) as HTMLSelectElement;
    expect(sel.value).toBe('2');

    fireEvent.change(sel, { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: '整书生成' }));
    await waitFor(() =>
      expect(calls.some((c) => c.url.endsWith('/api/books/b1/generate-all') && c.init?.method === 'POST')).toBe(true),
    );
    const allCall = calls.find((c) => c.url.endsWith('/api/books/b1/generate-all'));
    expect(JSON.parse(String((allCall!.init as RequestInit).body))).toEqual({ maxRounds: 1 });

    fireEvent.change(sel, { target: { value: '3' } });
    fireEvent.click(screen.getAllByRole('button', { name: '生成' })[0]);
    await waitFor(() =>
      expect(calls.some((c) => c.url.endsWith('/api/books/b1/chapters/1/generate') && c.init?.method === 'POST')).toBe(true),
    );
    const oneCall = calls.find((c) => c.url.endsWith('/api/books/b1/chapters/1/generate'));
    expect(JSON.parse(String((oneCall!.init as RequestInit).body))).toEqual({ maxRounds: 3 });
  });

  it('融合门：show → confirm 200 后才发 run（fetch 调用顺序断言，非 200/取消不发 run）', async () => {
    gateMode = 'show';
    installFetchStub();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={['/books/b1']}>
          <Routes>
            <Route path="/books/:bookId" element={<BookDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // 点整书生成 → 门 show（直通不成立）→ 对话框出现，此时尚未发 run
    fireEvent.click(await screen.findByRole('button', { name: '整书生成' }));
    await screen.findByRole('button', { name: '确认并开始生成' });
    expect(calls.some((c) => c.url.endsWith('/generate-all'))).toBe(false);

    // 确认 → confirm 200 → 才发起 run
    fireEvent.click(screen.getByRole('button', { name: '确认并开始生成' }));
    await waitFor(() => expect(calls.some((c) => c.url.endsWith('/generate-all'))).toBe(true));
    const confirmIdx = calls.findIndex((c) => c.url.endsWith('/fusion-gate/confirm'));
    const runIdx = calls.findIndex((c) => c.url.endsWith('/generate-all'));
    expect(confirmIdx).toBeGreaterThanOrEqual(0);
    expect(runIdx).toBeGreaterThan(confirmIdx);
  });

  it('融合门：confirm 失败 → 门保持打开+门内 alert 回显、不发 run；重试成功才发（主审直修③）', async () => {
    gateMode = 'show';
    confirmFails = true;
    installFetchStub();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={['/books/b1']}>
          <Routes>
            <Route path="/books/:bookId" element={<BookDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: '整书生成' }));
    await screen.findByRole('button', { name: '确认并开始生成' });
    fireEvent.click(screen.getByRole('button', { name: '确认并开始生成' }));
    await screen.findByRole('alert');
    expect(screen.getByRole('button', { name: '确认并开始生成' })).toBeTruthy(); // 门仍开着，裁决不丢
    expect(calls.some((c) => c.url.endsWith('/generate-all'))).toBe(false);

    confirmFails = false; // 就地重试
    fireEvent.click(screen.getByRole('button', { name: '确认并开始生成' }));
    await waitFor(() => expect(calls.some((c) => c.url.endsWith('/generate-all'))).toBe(true));
  });

  it('落地策略下拉渲染当前值：book.landingMandate=cadence/N=2 → 值为 cadence-2', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        const u = String(url);
        calls.push({ url: u, init });
        if (u.endsWith('/api/books/b1/characters')) return jsonResponse([]);
        if (u.includes('/api/books/b1')) {
          return jsonResponse({ ...book, landingMandate: { mode: 'cadence', heavyEveryN: 2 } });
        }
        return jsonResponse({});
      }),
    );
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={['/books/b1']}>
          <Routes>
            <Route path="/books/:bookId" element={<BookDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const sel = (await screen.findByLabelText('落地策略')) as HTMLSelectElement;
    await waitFor(() => expect(sel.value).toBe('cadence-2'));
  });

  it('切到「分级制每2章重」→ PUT /meta body 钉 landingMandate:{mode:\'cadence\',heavyEveryN:2}', async () => {
    installFetchStub();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={['/books/b1']}>
          <Routes>
            <Route path="/books/:bookId" element={<BookDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    // 等 book 数据落定，避免 4s 轮询/初值同步与本次变更竞争
    await waitFor(() => expect((screen.getByLabelText('世界观') as HTMLTextAreaElement).value).toBe('旧世界观'));
    const sel = (await screen.findByLabelText('落地策略')) as HTMLSelectElement;
    fireEvent.change(sel, { target: { value: 'cadence-2' } });
    await waitFor(() =>
      expect(calls.some((c) => c.url.endsWith('/api/books/b1/meta') && c.init?.method === 'PUT')).toBe(true),
    );
    const metaPut = calls.find((c) => c.url.endsWith('/api/books/b1/meta') && c.init?.method === 'PUT')!;
    expect(JSON.parse(String((metaPut.init as RequestInit).body))).toEqual({
      landingMandate: { mode: 'cadence', heavyEveryN: 2 },
    });
  });

  it('删章：确认门文案 → 确认删发 DELETE /chapters/2 → 行消失（DEC-2026-1120-02）', async () => {
    installFetchStub();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={['/books/b1']}>
          <Routes>
            <Route path="/books/:bookId" element={<BookDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await screen.findByText('第2章 第二章'); // 行首 span 为碎文本节点：第/2/章 /第二章
    fireEvent.click(screen.getAllByRole('button', { name: '删除章节' })[1]);
    expect(screen.getByText(/永久移除该章全部版本、摘要与运行步/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '确认删除' }));
    await waitFor(() =>
      expect(calls.some((c) => c.url.endsWith('/api/books/b1/chapters/2') && c.init?.method === 'DELETE')).toBe(true),
    );
    await waitFor(() => expect(screen.queryByText('第2章 第二章')).toBeNull());
    expect(screen.getByText(/第2章已删除/)).toBeTruthy();
  });

  it('删章：取消回落不调用 DELETE', async () => {
    installFetchStub();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={['/books/b1']}>
          <Routes>
            <Route path="/books/:bookId" element={<BookDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await screen.findByText('第2章 第二章');
    fireEvent.click(screen.getAllByRole('button', { name: '删除章节' })[1]);
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(screen.queryByText(/永久移除该章全部版本/)).toBeNull();
    expect(calls.some((c) => /\/api\/books\/b1\/chapters\/\d+$/.test(c.url) && c.init?.method === 'DELETE')).toBe(false);
  });

  const stylePage = (): void => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={['/books/b1']}>
          <Routes>
            <Route path="/books/:bookId" element={<BookDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  };

  it('解绑不再被短路（回归缺陷⑦）：先绑 sp1 再点「解绑」→ PUT /style body {profileId:null}', async () => {
    installStyleStub();
    stylePage();
    const cb = (await screen.findByLabelText('风格档案勾选-测试档案')) as HTMLInputElement;
    expect(cb.checked).toBe(false);
    fireEvent.click(cb);
    fireEvent.click(screen.getByRole('button', { name: '保存绑定' }));
    await waitFor(() =>
      expect(
        calls.some(
          (c) =>
            c.url.endsWith('/api/books/b1/style') &&
            c.init?.method === 'PUT' &&
            JSON.parse(String(c.init?.body)).primaryProfileId === 'sp1',
        ),
      ).toBe(true),
    );
    // refetch 回读绑定态（styleProfileId=sp1）后仍可解绑：解绑必须真发出去（缺陷⑦）
    fireEvent.click(screen.getByRole('button', { name: '解绑' }));
    await waitFor(() =>
      expect(
        calls.some(
          (c) =>
            c.url.endsWith('/api/books/b1/style') &&
            c.init?.method === 'PUT' &&
            JSON.parse(String(c.init?.body)).profileId === null,
        ),
      ).toBe(true),
    );
    expect(await screen.findByText(/风格档案已解绑/)).toBeTruthy();
  });

  it('逐书文风示例开关：绑定后出现 checkbox，勾选发 PUT style-fewshot {on:true} 并回读 checked', async () => {
    installStyleStub();
    stylePage();
    fireEvent.click(await screen.findByLabelText('风格档案勾选-测试档案'));
    fireEvent.click(screen.getByRole('button', { name: '保存绑定' }));

    const cb = await waitFor(() => {
      const el = screen.queryByLabelText('文风示例注入');
      expect(el).toBeTruthy();
      return el as HTMLInputElement;
    });
    expect(cb.checked).toBe(true); // 绑定默认开（DEC-2026-1122-03③ 服务端语义）
    expect(await screen.findByText(/新绑定\/重绑默认开启/)).toBeTruthy();

    fireEvent.click(cb); // 初始已勾选 → 点击即关闭
    await waitFor(() =>
      expect(
        calls.some(
          (c) =>
            c.url.endsWith('/api/books/b1/style-fewshot') &&
            c.init?.method === 'PUT' &&
            JSON.parse(String(c.init?.body)).on === false,
        ),
      ).toBe(true),
    );
    await waitFor(() => expect((screen.getByLabelText('文风示例注入') as HTMLInputElement).checked).toBe(false));
    expect(await screen.findByText('文风示例注入已关闭')).toBeTruthy();
  });

  it('绑定成功 toast 显性化默认开启（DEC-2026-1122-03③）', async () => {
    installStyleStub();
    stylePage();
    fireEvent.click(await screen.findByLabelText('风格档案勾选-测试档案'));
    fireEvent.click(screen.getByRole('button', { name: '保存绑定' }));
    expect(await screen.findByText('风格档案已绑定；文风示例注入已默认开启（可手动关闭）')).toBeTruthy();
  });

  it('蓝图编辑区（owner 反馈②④）：章号默认接续末章；字数随章号同步；AI 建议蓝图回填；保存透传 targetChars', async () => {
    installFetchStub();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={['/books/b1']}>
          <Routes>
            <Route path="/books/:bookId" element={<BookDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // 章号默认 = 末章(2)+1 = 3；下一章无章行 → 字数默认 3000
    const chNoInput = (await screen.findByLabelText('章号')) as HTMLInputElement;
    await waitFor(() => expect(chNoInput.value).toBe('3'));
    // 字数随章号同步是 chNo 变更后的下一轮 effect（本用例章号切换段同型断言均已 waitFor）：同步断言会捕中间帧致偶发 flake
    await waitFor(() => expect((screen.getByLabelText('本章目标字数') as HTMLInputElement).value).toBe('3000'));

    // 切到第 1 章 → 字数同步该章 targetChars=2500
    fireEvent.change(chNoInput, { target: { value: '1' } });
    await waitFor(() => expect((screen.getByLabelText('本章目标字数') as HTMLInputElement).value).toBe('2500'));

    // AI 建议蓝图 → 回填 textarea
    fireEvent.change(chNoInput, { target: { value: '3' } });
    fireEvent.click(await screen.findByRole('button', { name: 'AI 建议蓝图' }));
    const bpArea = (await waitFor(() => {
      const el = screen.getByPlaceholderText(/蓝图 JSON/) as HTMLTextAreaElement;
      expect(el.value).toContain('建议目标');
      return el;
    })) as HTMLTextAreaElement;

    // 手改字数后保存 → PUT body 带 targetChars
    fireEvent.change(screen.getByLabelText('本章目标字数'), { target: { value: '2800' } });
    fireEvent.click(screen.getByRole('button', { name: '保存蓝图' }));
    const bpPut = await waitFor(() => {
      const c = calls.find((c) => /\/chapters\/3\/blueprint$/.test(c.url) && c.init?.method === 'PUT');
      expect(c).toBeTruthy();
      return c!;
    });
    const bpBody = JSON.parse(String(bpPut.init?.body));
    expect(bpBody.targetChars).toBe(2800);
    expect(bpBody.blueprint.goal).toContain('建议目标');
    void bpArea;
  });

  it('发起续写（owner 反馈②④）：未保存蓝图先拦截提示；保存后 mode=continue 透传 maxRounds', async () => {
    installFetchStub();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={['/books/b1']}>
          <Routes>
            <Route path="/books/:bookId" element={<BookDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: /发起续写/ }));
    await waitFor(() => expect(screen.getByText(/还没有蓝图/)).toBeTruthy());
    expect(calls.some((c) => c.url.endsWith('/api/runs'))).toBe(false);

    // 填蓝图 → 保存（stub 把章 3 入列）→ 发起续写
    const bpArea = screen.getByPlaceholderText(/蓝图 JSON/) as HTMLTextAreaElement;
    setInput(bpArea, JSON.stringify({ goal: '入城遇阻', beats: ['守卫盘查'], mustHaveBeats: [], bannedTopics: [] }));
    fireEvent.click(screen.getByRole('button', { name: '保存蓝图' }));
    fireEvent.click(await screen.findByRole('button', { name: /发起续写/ }));
    const runCall = await waitFor(() => {
      const c = calls.find((c) => c.url.endsWith('/api/runs') && c.init?.method === 'POST');
      expect(c).toBeTruthy();
      return c!;
    });
    expect(JSON.parse(String(runCall.init?.body))).toMatchObject({
      bookId: 'b1',
      fromChapter: 3,
      toChapter: 3,
      mode: 'continue',
      maxRounds: 2,
    });
  });

  it('发起续写成功提示含「查看运行面板→」链接，href 指向 /runs/:runId（C 方案①）', async () => {
    installFetchStub();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={['/books/b1']}>
          <Routes>
            <Route path="/books/:bookId" element={<BookDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const bpArea = (await screen.findByPlaceholderText(/蓝图 JSON/)) as HTMLTextAreaElement;
    // 等章号 effect（末章+1）生效，避免「保存蓝图」落到第 1 章（既有 :414-447 测试靠前置守卫等待躲过此时序）
    await screen.findByDisplayValue('3');
    setInput(bpArea, JSON.stringify({ goal: '入城遇阻', beats: ['守卫盘查'], mustHaveBeats: [], bannedTopics: [] }));
    fireEvent.click(screen.getByRole('button', { name: '保存蓝图' }));
    fireEvent.click(await screen.findByRole('button', { name: /发起续写/ }));
    const link = await screen.findByText('查看运行面板→');
    expect(link.closest('a')!.getAttribute('href')).toBe('/runs/r1234567890');
    expect(screen.getByText(/续写已入队 run r1234567/)).toBeTruthy();
    expect(screen.queryByText(/进度见右侧/)).toBeNull();
  });

  it('人物下线（0009 专用控件）：章号默认下一章，下线发 PUT offlineFromChapter；徽标回显+恢复在场发 null', async () => {
    installFetchStub();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={['/books/b1']}>
          <Routes>
            <Route path="/books/:bookId" element={<BookDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByText('张三')).toBeTruthy());

    const chInput = screen.getByLabelText('下线章号-张三') as HTMLInputElement;
    expect(chInput.value).toBe('3'); // 默认下一章
    fireEvent.change(chInput, { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: '下线' }));
    const put = await waitFor(() => {
      const c = calls.find((c) => /\/characters\/k1$/.test(c.url) && c.init?.method === 'PUT');
      expect(c).toBeTruthy();
      return c!;
    });
    expect(JSON.parse(String(put.init?.body))).toEqual({ offlineFromChapter: 5 });

    // stub 回读 → 徽标与恢复钮出现
    fireEvent.click(await screen.findByRole('button', { name: '恢复在场' }));
    const revivePut = await waitFor(() => {
      const list = calls.filter((c) => /\/characters\/k1$/.test(c.url) && c.init?.method === 'PUT');
      expect(list.length).toBeGreaterThanOrEqual(2);
      return list[list.length - 1]!;
    });
    expect(JSON.parse(String(revivePut.init?.body))).toEqual({ offlineFromChapter: null });
    await waitFor(() => expect(screen.getByLabelText('下线章号-张三')).toBeTruthy());
  });
});

describe('StyleBindPanel（风格多选绑定面板）', () => {
  const BIND_PROFILES = [
    { id: 'p1', name: '风格A', version: 1, createdAt: '2026-11-13T08:00:00Z', metrics: {}, sourcePath: 'inline:p1' },
    { id: 'p2', name: '风格B', version: 2, createdAt: '2026-11-13T08:00:00Z', metrics: {}, sourcePath: 'inline:p2' },
    { id: 'p3', name: '风格C', version: 1, createdAt: '2026-11-13T08:00:00Z', metrics: {}, sourcePath: 'inline:p3' },
    { id: 'p4', name: '风格D', version: 1, createdAt: '2026-11-13T08:00:00Z', metrics: {}, sourcePath: 'inline:p4' },
    { id: 'p5', name: '风格E', version: 1, createdAt: '2026-11-13T08:00:00Z', metrics: {}, sourcePath: 'inline:p5' },
  ];

  function installBindStub(opts: { bookOverride?: Record<string, unknown>; firstFrameUndefined?: boolean }) {
    let served = false;
    const base = { ...book, styleProfileId: null, styleFewshotOn: false, styleBinding: null };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        const u = String(url);
        calls.push({ url: u, init });
        if (u.endsWith('/api/books/b1/style') && init?.method === 'PUT') {
          return jsonResponse({ ok: true, styleProfileId: 'p1' });
        }
        if (u.endsWith('/api/style-profiles')) return jsonResponse(BIND_PROFILES);
        if (u.endsWith('/api/books/b1/characters')) return jsonResponse([]);
        if (u.includes('/api/books/b1')) {
          // 首帧 undefined 次帧真书：验「书加载完成才挂载面板」（critic 2.4）
          if (opts.firstFrameUndefined && !served) {
            served = true;
            return jsonResponse(undefined);
          }
          return jsonResponse({ ...base, ...opts.bookOverride });
        }
        return jsonResponse({});
      }),
    );
  }

  function renderPanel(): void {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={['/books/b1']}>
          <Routes>
            <Route path="/books/:bookId" element={<BookDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it('风格多选面板：勾 2 档案保存 → PUT body 为 1 主 1 辅 + 八键 dimsSource + weights 均分', async () => {
    installBindStub({});
    renderPanel();
    fireEvent.click(await screen.findByLabelText('风格档案勾选-风格A'));
    fireEvent.click(screen.getByLabelText('风格档案勾选-风格B'));
    expect((screen.getByLabelText('基准档案') as HTMLSelectElement).value).toBe('p1');
    // 比例区（≥2 勾选渲染）：默认均分余数归基准
    expect((screen.getByLabelText('比例-风格A') as HTMLInputElement).value).toBe('50');
    expect((screen.getByLabelText('比例-风格B') as HTMLInputElement).value).toBe('50');
    (screen.getByText('高级设置').closest('details') as HTMLDetailsElement).open = true;
    fireEvent.change(screen.getByLabelText('维度来源-对话'), { target: { value: 'p2' } });
    fireEvent.click(screen.getByRole('button', { name: '保存绑定' }));
    const put = await waitFor(() => {
      const c = calls.find((c) => c.url.endsWith('/api/books/b1/style') && c.init?.method === 'PUT');
      expect(c).toBeTruthy();
      return c!;
    });
    expect(JSON.parse(String(put.init?.body))).toEqual({
      primaryProfileId: 'p1',
      auxProfileIds: ['p2'],
      dimsSource: { 节奏: 'p1', 对话: 'p2', 描写: 'p1', 情感基调: 'p1', 尺度: 'p1', 写作特点: 'p1', 特色词汇: 'p1', 章节结构: 'p1' },
      weights: { p1: 50, p2: 50 },
    });
  });

  it('高级设置共存选项（DEC-2026-1118-03）：勾 2 档案时八维各追加「共存」，选共存保存 → 该维=__coexist__；单档案不出现', async () => {
    installBindStub({});
    renderPanel();
    // 单档案：无共存选项
    fireEvent.click(await screen.findByLabelText('风格档案勾选-风格A'));
    (screen.getByText('高级设置').closest('details') as HTMLDetailsElement).open = true;
    expect(screen.queryByRole('option', { name: /共存/ })).toBeNull();
    // 勾第 2 档案：八维各出现一个「共存」选项（DEC-2026-1122-03④ 七→八）
    fireEvent.click(screen.getByLabelText('风格档案勾选-风格B'));
    expect(screen.getAllByRole('option', { name: /共存/ })).toHaveLength(8);
    fireEvent.change(screen.getByLabelText('维度来源-特色词汇'), { target: { value: '__coexist__' } });
    expect((screen.getByLabelText('维度来源-特色词汇') as HTMLSelectElement).value).toBe('__coexist__');
    fireEvent.click(screen.getByRole('button', { name: '保存绑定' }));
    const put = await waitFor(() => {
      const c = calls.find((c) => c.url.endsWith('/api/books/b1/style') && c.init?.method === 'PUT');
      expect(c).toBeTruthy();
      return c!;
    });
    const body = JSON.parse(String(put.init?.body)) as { dimsSource: Record<string, string> };
    expect(body.dimsSource['特色词汇']).toBe('__coexist__');
    expect(body.dimsSource['对话']).toBe('p1'); // 其余维不受影响
  });

  it('高级设置「不采用档案风格」选项（DEC-2026-1124-04）：单档案也在（八维各一），选存 → 该维=__none__；其余维不受影响', async () => {
    installBindStub({});
    renderPanel();
    fireEvent.click(await screen.findByLabelText('风格档案勾选-风格A'));
    (screen.getByText('高级设置').closest('details') as HTMLDetailsElement).open = true;
    // 无条件渲染：单档案也在，八维各一个「不采用」选项
    expect(screen.getAllByRole('option', { name: /不采用档案风格/ })).toHaveLength(8);
    fireEvent.click(screen.getByLabelText('风格档案勾选-风格B'));
    fireEvent.change(screen.getByLabelText('维度来源-特色词汇'), { target: { value: '__none__' } });
    expect((screen.getByLabelText('维度来源-特色词汇') as HTMLSelectElement).value).toBe('__none__');
    fireEvent.click(screen.getByRole('button', { name: '保存绑定' }));
    const put = await waitFor(() => {
      const c = calls.find((c) => c.url.endsWith('/api/books/b1/style') && c.init?.method === 'PUT');
      expect(c).toBeTruthy();
      return c!;
    });
    const body = JSON.parse(String(put.init?.body)) as { dimsSource: Record<string, string> };
    expect(body.dimsSource['特色词汇']).toBe('__none__');
    expect(body.dimsSource['对话']).toBe('p1'); // 其余维不受影响
  });

  it('哨兵回填（DEC-2026-1124-04）：styleBinding.dimsSource 带 __none__ → 高级设置下拉显示该项（非主档/空白）', async () => {
    installBindStub({
      bookOverride: {
        styleProfileId: 'p1',
        styleFewshotOn: false,
        styleBinding: { primaryProfileId: 'p1', auxProfileIds: ['p2'], dimsSource: { 特色词汇: '__none__' } },
      },
    });
    renderPanel();
    await screen.findByLabelText('风格档案勾选-风格A');
    (screen.getByText('高级设置').closest('details') as HTMLDetailsElement).open = true;
    expect((screen.getByLabelText('维度来源-特色词汇') as HTMLSelectElement).value).toBe('__none__');
  });

  it('上限 4：第 5 个档案勾选框 disabled；解绑发 {profileId:null}', async () => {
    installBindStub({});
    renderPanel();
    for (const name of ['风格A', '风格B', '风格C', '风格D']) {
      fireEvent.click(await screen.findByLabelText(`风格档案勾选-${name}`));
    }
    const fifth = screen.getByLabelText('风格档案勾选-风格E') as HTMLInputElement;
    expect(fifth.disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '解绑' }));
    const put = await waitFor(() => {
      const c = calls.find((c) => c.url.endsWith('/api/books/b1/style') && c.init?.method === 'PUT');
      expect(c).toBeTruthy();
      return c!;
    });
    expect(JSON.parse(String(put.init?.body))).toEqual({ profileId: null });
  });

  it('已绑书初值渲染：binding 非空 → 勾选/基准档案/八维值全部落对（legacy 提示在场）', async () => {
    installBindStub({
      firstFrameUndefined: true,
      bookOverride: {
        styleProfileId: 'p1',
        styleFewshotOn: false,
        styleBinding: { primaryProfileId: 'p1', auxProfileIds: ['p2'], dimsSource: { 对话: 'p2' } },
      },
    });
    renderPanel();
    await waitFor(() => expect(calls.some((c) => c.url.includes('/api/books/b1') && !c.url.includes('characters'))).toBe(true));
    // 首帧 book undefined：面板不得挂载（critic 2.4 挂载时机）
    expect(screen.queryByLabelText('基准档案')).toBeNull();
    fireEvent.click(await screen.findByRole('button', { name: '刷新' }));
    await waitFor(() => expect((screen.getByLabelText('基准档案') as HTMLSelectElement).value).toBe('p1'));
    expect((screen.getByLabelText('风格档案勾选-风格A') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText('风格档案勾选-风格B') as HTMLInputElement).checked).toBe(true);
    // 旧绑定（无 weights）= legacy：提示在场、比例不预填
    expect(screen.getByText('旧绑定：按贡献维数计权（保持原行为）')).toBeTruthy();
    expect((screen.getByLabelText('比例-风格A') as HTMLInputElement).value).toBe('');
    (screen.getByText('高级设置').closest('details') as HTMLDetailsElement).open = true;
    expect((screen.getByLabelText('维度来源-对话') as HTMLSelectElement).value).toBe('p2');
    expect((screen.getByLabelText('维度来源-节奏') as HTMLSelectElement).value).toBe('p1');
    expect((screen.getByRole('button', { name: '保存绑定' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('三档默认均分平手余数归基准：勾 3 档比例显示 34/33/33，保存 weights {p1:34,p2:33,p3:33}', async () => {
    installBindStub({});
    renderPanel();
    for (const name of ['风格A', '风格B', '风格C']) {
      fireEvent.click(await screen.findByLabelText(`风格档案勾选-${name}`));
    }
    expect((screen.getByLabelText('比例-风格A') as HTMLInputElement).value).toBe('34');
    expect((screen.getByLabelText('比例-风格B') as HTMLInputElement).value).toBe('33');
    expect((screen.getByLabelText('比例-风格C') as HTMLInputElement).value).toBe('33');
    fireEvent.click(screen.getByRole('button', { name: '保存绑定' }));
    const put = await waitFor(() => {
      const c = calls.find((c) => c.url.endsWith('/api/books/b1/style') && c.init?.method === 'PUT');
      expect(c).toBeTruthy();
      return c!;
    });
    expect(JSON.parse(String(put.init?.body)).weights).toEqual({ p1: 34, p2: 33, p3: 33 });
  });

  it('比例输入 0 按 1 处理：回显 \'1\'，保存归一 {p1:2,p2:98}', async () => {
    installBindStub({});
    renderPanel();
    fireEvent.click(await screen.findByLabelText('风格档案勾选-风格A'));
    fireEvent.click(screen.getByLabelText('风格档案勾选-风格B'));
    fireEvent.change(screen.getByLabelText('比例-风格A'), { target: { value: '0' } });
    expect((screen.getByLabelText('比例-风格A') as HTMLInputElement).value).toBe('1');
    fireEvent.click(screen.getByRole('button', { name: '保存绑定' }));
    const put = await waitFor(() => {
      const c = calls.find((c) => c.url.endsWith('/api/books/b1/style') && c.init?.method === 'PUT');
      expect(c).toBeTruthy();
      return c!;
    });
    expect(JSON.parse(String(put.init?.body)).weights).toEqual({ p1: 2, p2: 98 });
  });

  it('legacy 行未触碰：提示在场、比例不预填、勾选变化后保存 body 无 weights 键', async () => {
    installBindStub({
      bookOverride: {
        styleProfileId: 'p1',
        styleFewshotOn: false,
        styleBinding: { primaryProfileId: 'p1', auxProfileIds: ['p2'], dimsSource: { 对话: 'p2' }, weights: {} },
      },
    });
    renderPanel();
    fireEvent.click(await screen.findByLabelText('风格档案勾选-风格C'));
    expect(screen.getByText('旧绑定：按贡献维数计权（保持原行为）')).toBeTruthy();
    expect((screen.getByLabelText('比例-风格A') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('比例-风格C') as HTMLInputElement).value).toBe('');
    fireEvent.click(screen.getByRole('button', { name: '保存绑定' }));
    const put = await waitFor(() => {
      const c = calls.find((c) => c.url.endsWith('/api/books/b1/style') && c.init?.method === 'PUT');
      expect(c).toBeTruthy();
      return c!;
    });
    // toEqual 三键精确形态即证无 weights 键
    expect(JSON.parse(String(put.init?.body))).toEqual({
      primaryProfileId: 'p1',
      auxProfileIds: ['p2', 'p3'],
      dimsSource: { 节奏: 'p1', 对话: 'p2', 描写: 'p1', 情感基调: 'p1', 尺度: 'p1', 写作特点: 'p1', 特色词汇: 'p1', 章节结构: 'p1' },
    });
  });

  it('legacy 行触碰比例后保存带 weights：70/30 原样归一 {p1:70,p2:30}', async () => {
    installBindStub({
      bookOverride: {
        styleProfileId: 'p1',
        styleFewshotOn: false,
        styleBinding: { primaryProfileId: 'p1', auxProfileIds: ['p2'], dimsSource: {}, weights: {} },
      },
    });
    renderPanel();
    fireEvent.change(await screen.findByLabelText('比例-风格A'), { target: { value: '70' } });
    fireEvent.change(screen.getByLabelText('比例-风格B'), { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: '保存绑定' }));
    const put = await waitFor(() => {
      const c = calls.find((c) => c.url.endsWith('/api/books/b1/style') && c.init?.method === 'PUT');
      expect(c).toBeTruthy();
      return c!;
    });
    expect(JSON.parse(String(put.init?.body)).weights).toEqual({ p1: 70, p2: 30 });
  });

  it('单档案保存 weights {p1:100}：无比例区渲染', async () => {
    installBindStub({});
    renderPanel();
    fireEvent.click(await screen.findByLabelText('风格档案勾选-风格A'));
    expect(screen.queryByLabelText('比例-风格A')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '保存绑定' }));
    const put = await waitFor(() => {
      const c = calls.find((c) => c.url.endsWith('/api/books/b1/style') && c.init?.method === 'PUT');
      expect(c).toBeTruthy();
      return c!;
    });
    expect(JSON.parse(String(put.init?.body)).weights).toEqual({ p1: 100 });
  });

  it('加权行回显：binding.weights {p1:60,p2:40} → 输入 60/40，未触碰保存原样带出', async () => {
    installBindStub({
      bookOverride: {
        styleProfileId: 'p1',
        styleFewshotOn: false,
        styleBinding: { primaryProfileId: 'p1', auxProfileIds: ['p2'], dimsSource: {}, weights: { p1: 60, p2: 40 } },
      },
    });
    renderPanel();
    expect(((await screen.findByLabelText('比例-风格A')) as HTMLInputElement).value).toBe('60');
    expect((screen.getByLabelText('比例-风格B') as HTMLInputElement).value).toBe('40');
    expect(screen.queryByText('旧绑定：按贡献维数计权（保持原行为）')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '保存绑定' }));
    const put = await waitFor(() => {
      const c = calls.find((c) => c.url.endsWith('/api/books/b1/style') && c.init?.method === 'PUT');
      expect(c).toBeTruthy();
      return c!;
    });
    expect(JSON.parse(String(put.init?.body)).weights).toEqual({ p1: 60, p2: 40 });
  });

  it('normalizeWeights 纯函数：悬殊输入钳底循环；已归一输入幂等', () => {
    expect(normalizeWeights({ a: 1000, b: 1, c: 1, d: 1 }, ['a', 'b', 'c', 'd'])).toEqual({ a: 97, b: 1, c: 1, d: 1 });
    expect(normalizeWeights({ x: 50, y: 50 }, ['x', 'y'])).toEqual({ x: 50, y: 50 });
  });
});
