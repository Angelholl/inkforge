import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import BookDetailPage from './BookDetailPage';

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
      if (u.endsWith('/api/runs') && init?.method === 'POST') return jsonResponse({ runId: 'r1234567890' }, 202);
      if (u.includes('/api/books/b1/meta')) return jsonResponse({ ...bookState, description: '旧世界观', outline: '旧大纲' });
      if (u.includes('/api/books/b1')) {
        return { ok: true, status: 200, json: async () => bookState, text: async () => JSON.stringify(bookState) };
      }
      return { ok: true, status: 200, json: async () => ({}), text: async () => '{}' };
    }),
  );
}

/** 风格绑定/解绑/开关专用桩：bound 与 fewshot 可变，PUT 后 GET 回读新值（模拟服务端归零语义 + refetch）。 */
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
        bound = (JSON.parse(String(init.body)) as { profileId: string | null }).profileId;
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

  it('解绑不再被短路（回归缺陷⑦）：先绑 sp1 再选「（未绑定）」→ PUT /style body {profileId:null}', async () => {
    installStyleStub();
    stylePage();
    const sel = (await screen.findByLabelText('风格档案绑定')) as HTMLSelectElement;
    expect(sel.value).toBe('');
    // option 来自异步查询：过早 change 到不存在的 option 会被浏览器吞掉（value 回 ''，不发 onChange）
    await waitFor(() => expect(screen.getByRole('option', { name: /测试档案/ })).toBeTruthy());

    fireEvent.change(sel, { target: { value: 'sp1' } });
    await waitFor(() =>
      expect(
        calls.some(
          (c) =>
            c.url.endsWith('/api/books/b1/style') &&
            c.init?.method === 'PUT' &&
            JSON.parse(String(c.init?.body)).profileId === 'sp1',
        ),
      ).toBe(true),
    );
    // refetch 回读绑定态：不先绑就直接从 '' 选 '' 的话，React 的 value tracking 不会触发 onChange，用例会假绿
    await waitFor(() => expect((screen.getByLabelText('风格档案绑定') as HTMLSelectElement).value).toBe('sp1'));

    fireEvent.change(sel, { target: { value: '' } });
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
    const sel = await screen.findByLabelText('风格档案绑定');
    await waitFor(() => expect(screen.getByRole('option', { name: /测试档案/ })).toBeTruthy());
    fireEvent.change(sel, { target: { value: 'sp1' } });

    const cb = await waitFor(() => {
      const el = screen.queryByLabelText('文风示例注入');
      expect(el).toBeTruthy();
      return el as HTMLInputElement;
    });
    expect(cb.checked).toBe(false); // 绑定即归零（服务端语义），所以此刻未勾
    expect(await screen.findByText(/关闭后不向写手注入范文片段/)).toBeTruthy();

    fireEvent.click(cb);
    await waitFor(() =>
      expect(
        calls.some(
          (c) =>
            c.url.endsWith('/api/books/b1/style-fewshot') &&
            c.init?.method === 'PUT' &&
            JSON.parse(String(c.init?.body)).on === true,
        ),
      ).toBe(true),
    );
    await waitFor(() => expect((screen.getByLabelText('文风示例注入') as HTMLInputElement).checked).toBe(true));
    expect(await screen.findByText('文风示例注入已开启')).toBeTruthy();
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
    expect((screen.getByLabelText('本章目标字数') as HTMLInputElement).value).toBe('3000');

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
