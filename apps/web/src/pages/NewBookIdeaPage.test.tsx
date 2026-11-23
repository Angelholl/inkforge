import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';
import NewBookIdeaPage from './NewBookIdeaPage';
import type { OutlineItemDto } from '@inkforge/shared';

const OUTLINE_TWO: OutlineItemDto[] = [
  { chapterNo: 1, blueprint: { goal: '少年踏上旅途', beats: ['告别村落', '初遇同伴'], mustHaveBeats: [], bannedTopics: [] } },
  { chapterNo: 2, blueprint: { goal: '入城遇阻', beats: ['守卫盘查', '贵人相助'], mustHaveBeats: [], bannedTopics: [] } },
];

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
    text: async () => JSON.stringify(data),
  };
}

type Call = { url: string; init?: RequestInit };

function stubFetch(calls: Call[]) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    if (url.endsWith('/api/books') && init?.method === 'POST') return jsonResponse({ id: 'b1', title: 'x' }, 201);
    if (url.endsWith('/outline-suggest') && init?.method === 'POST') return jsonResponse({ outline: OUTLINE_TWO, source: 'llm' });
    if (/\/blueprint$/.test(url) && init?.method === 'PUT') return jsonResponse({ id: 'c1' });
    // Task-05 随迁同型 stub：门直通形态，既有 createRun 断言保持真实命中
    if (url.endsWith('/fusion-gate')) return jsonResponse({ action: 'pass', fingerprint: 'fp-test' });
    if (url.endsWith('/api/runs') && init?.method === 'POST') return jsonResponse({ runId: 'r1' }, 201);
    return jsonResponse({ error: 'unexpected' }, 404);
  });
}

function setInput(sel: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = sel instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(sel, value);
  sel.dispatchEvent(new Event('input', { bubbles: true }));
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/new']}>
      <Routes>
        <Route path="/new" element={<NewBookIdeaPage />} />
        <Route path="/runs/:runId" element={<div>运行页标记</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('NewBookIdeaPage 入口 B 向导', () => {
  it('新书向导：建书并生成全书蓝图后进入审阅', async () => {
    const calls: Call[] = [];
    vi.stubGlobal('fetch', stubFetch(calls));
    renderPage();

    fireEvent.change(screen.getByPlaceholderText('书名'), { target: { value: '入口B向导书' } });
    const worldview = screen.getByPlaceholderText(/世界观 \/ 规则/) as HTMLTextAreaElement;
    setInput(worldview, '修真大陆，少年逆天改命。');
    fireEvent.change(screen.getByLabelText('章节数'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: '建书并生成蓝图' }));

    await waitFor(() => expect(screen.getByText(/少年踏上旅途/)).toBeTruthy());
    expect(screen.getByText(/入城遇阻/)).toBeTruthy();
    expect(screen.getByText('第1章')).toBeTruthy();
    expect(screen.getByText('第2章')).toBeTruthy();

    const create = calls.find((c) => c.url.endsWith('/api/books'));
    expect(create).toBeTruthy();
    expect(JSON.parse(String((create!.init as RequestInit).body))).toEqual({
      title: '入口B向导书',
      description: '修真大陆，少年逆天改命。',
    });
    const suggest = calls.find((c) => c.url.endsWith('/outline-suggest'));
    expect(suggest).toBeTruthy();
    expect(JSON.parse(String((suggest!.init as RequestInit).body))).toEqual({ chapterCount: 2 });
  });

  it('新书向导：人物卡与大纲随建书提交', async () => {
    const calls: Call[] = [];
    vi.stubGlobal('fetch', stubFetch(calls));
    renderPage();

    fireEvent.change(screen.getByPlaceholderText('书名'), { target: { value: '设定功能测书' } });
    setInput(screen.getByPlaceholderText(/世界观 \/ 规则/) as HTMLTextAreaElement, '修真大陆，宗门林立。');
    setInput(
      screen.getByPlaceholderText(/全书剧情大纲/) as HTMLTextAreaElement,
      '第一卷：草原崛起；第二卷：夺回王城',
    );
    const addBtn = screen.getByRole('button', { name: '添加人物' }) as HTMLButtonElement;
    expect(addBtn.className).toContain('border-line');
    expect(addBtn.className).toContain('h-8');
    fireEvent.click(addBtn);
    const removeBtn = screen.getByRole('button', { name: '移除' }) as HTMLButtonElement;
    expect(removeBtn.className).toContain('text-danger');
    expect(removeBtn.className).toContain('h-8');
    setInput(screen.getByLabelText('人物卡姓名1') as HTMLInputElement, '张三');
    setInput(screen.getByLabelText('人物卡设定1') as HTMLTextAreaElement, '主角，坚韧');
    fireEvent.click(screen.getByRole('button', { name: '建书并生成蓝图' }));

    await waitFor(() => expect(screen.getByText(/少年踏上旅途/)).toBeTruthy());
    const create = calls.find((c) => c.url.endsWith('/api/books'));
    expect(create).toBeTruthy();
    expect(JSON.parse(String((create!.init as RequestInit).body))).toEqual({
      title: '设定功能测书',
      description: '修真大陆，宗门林立。',
      outline: '第一卷：草原崛起；第二卷：夺回王城',
      characters: [{ name: '张三', baseSetting: '{"设定":"主角，坚韧"}' }],
    });
  });

  it('新书向导：采用全部蓝图后 PUT 逐章落库并 generate 发起', async () => {
    const calls: Call[] = [];
    vi.stubGlobal('fetch', stubFetch(calls));
    renderPage();

    fireEvent.change(screen.getByPlaceholderText('书名'), { target: { value: '入口B向导书' } });
    fireEvent.click(screen.getByRole('button', { name: '建书并生成蓝图' }));
    await waitFor(() => expect(screen.getByText(/少年踏上旅途/)).toBeTruthy());

    const editBtn = screen.getAllByRole('button', { name: '编辑' })[0] as HTMLButtonElement;
    expect(editBtn.className).toContain('text-primary-strong');
    expect(editBtn.className).toContain('h-8');
    const saveBtn = screen.getByRole('button', { name: /保存蓝图并继续/ }) as HTMLButtonElement;
    expect(saveBtn.className).toContain('bg-primary');
    expect(saveBtn.className).toContain('h-ctl');
    fireEvent.click(editBtn);
    setInput(screen.getByLabelText('第1章标题') as HTMLInputElement, '启程');
    setInput(screen.getByLabelText('第1章目标字数') as HTMLInputElement, '2500');
    // step2 展开面板后全局不应存在任何 textarea（JSON 编辑已撤销，蓝图只读 pre 呈现）
    expect(screen.getAllByText(/少年踏上旅途/).some((el) => el.tagName === 'PRE')).toBe(true);
    expect(document.querySelectorAll('textarea').length).toBe(0);
    fireEvent.click(saveBtn);
    await waitFor(() => expect(screen.getByRole('button', { name: /发起生成/ })).toBeTruthy());
    const launchBtn = screen.getByRole('button', { name: /发起生成/ }) as HTMLButtonElement;
    expect(launchBtn.className).toContain('bg-primary');
    expect(launchBtn.className).toContain('h-ctl');

    const puts = calls.filter((c) => /\/blueprint$/.test(c.url));
    expect(puts).toHaveLength(2);
    expect(puts[0].url).toBe('/api/books/b1/chapters/1/blueprint');
    const put1 = JSON.parse(String((puts[0].init as RequestInit).body));
    expect(put1.title).toBe('启程');
    expect(put1.targetChars).toBe(2500);
    expect(put1.blueprint.goal).toBe('少年踏上旅途');
    const put2 = JSON.parse(String((puts[1].init as RequestInit).body));
    expect(put2.title).toBe('第2章');
    expect(put2.targetChars).toBe(3000);

    fireEvent.click(screen.getByRole('button', { name: /发起生成/ }));
    await waitFor(() => expect(screen.getByText('运行页标记')).toBeTruthy());

    const run = calls.find((c) => c.url.endsWith('/api/runs'));
    expect(run).toBeTruthy();
    expect(JSON.parse(String((run!.init as RequestInit).body))).toEqual({
      bookId: 'b1',
      mode: 'generate',
      fromChapter: 1,
      toChapter: 2,
    });
  });

  it('新书向导：逐章字数下限钳到 500', async () => {
    const calls: Call[] = [];
    vi.stubGlobal('fetch', stubFetch(calls));
    renderPage();

    fireEvent.change(screen.getByPlaceholderText('书名'), { target: { value: '下限钳制测书' } });
    fireEvent.click(screen.getByRole('button', { name: '建书并生成蓝图' }));
    await waitFor(() => expect(screen.getByText(/少年踏上旅途/)).toBeTruthy());

    fireEvent.click(screen.getAllByRole('button', { name: '编辑' })[0]);
    setInput(screen.getByLabelText('第1章目标字数') as HTMLInputElement, '100');
    fireEvent.click(screen.getByRole('button', { name: /保存蓝图并继续/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: /发起生成/ })).toBeTruthy());

    const puts = calls.filter((c) => /\/blueprint$/.test(c.url));
    expect(puts).toHaveLength(2);
    const put1 = JSON.parse(String((puts[0].init as RequestInit).body));
    expect(put1.targetChars).toBe(500);
  });

  it('设定集导入（含章级大纲）→ 跳过 LLM 直接进审阅（DEC-2026-1120-04 拍板③）', async () => {
    const IMPORT_DRAFT = {
      title: '导入示例书',
      description: '世界观文本',
      outline: '卷一 《起点》',
      characters: [{ name: '主角', baseSetting: '{"设定":"连锁业务员"}' }],
      outlineTree: { volumes: [] },
      foreshadowings: [{ description: '对窗的一双眼睛', plantedCh: 1 }],
      outlineItems: OUTLINE_TWO,
      chapterTitles: { '1': '启程', '2': '入城' },
      styleSection: '两种叙述声。',
      importStyle: true,
      warnings: [],
    };
    const calls: Call[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url: String(url), init });
        if (url.endsWith('/api/settings-import/preview')) return jsonResponse(IMPORT_DRAFT);
        if (url.endsWith('/api/settings-import/apply')) {
          return jsonResponse({ bookId: 'b9', sourcePath: '', styleProfileId: 'sp1', warnings: [], counts: { characters: 1, volumes: 0, stages: 0, cards: 0, foreshadowings: 1 } }, 201);
        }
        return jsonResponse({ error: 'unexpected' }, 404);
      }),
    );
    renderPage();

    expect(screen.getByText(/已有设定集？直接导入/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('设定集全文'), { target: { value: '# 《导入示例书》设定集' } });
    fireEvent.click(screen.getByRole('button', { name: '解析预览' }));
    await waitFor(() => screen.getByRole('button', { name: '确认导入建书' }));
    fireEvent.click(screen.getByRole('button', { name: '确认导入建书' }));

    // 直接进审阅：两条导入的蓝图渲染，无 outline-suggest 调用、无建书 POST（apply 端点自建书）
    await waitFor(() => expect(screen.getByText(/少年踏上旅途/)).toBeTruthy());
    expect(screen.getByText('第1章')).toBeTruthy();
    expect(screen.getByText('第2章')).toBeTruthy();
    expect(screen.queryByText(/蓝图勾画中/)).toBeNull();
    expect(calls.some((c) => c.url.endsWith('/outline-suggest'))).toBe(false);
    expect(calls.some((c) => c.url.endsWith('/api/books'))).toBe(false);
    const apply = calls.find((c) => c.url.endsWith('/api/settings-import/apply'));
    expect(apply).toBeTruthy();
    expect(JSON.parse(String((apply!.init as RequestInit).body)).draft.characters[0].name).toBe('主角');
  });

  it('设定集导入（无章级大纲）→ 按章节数走建议蓝图（设定已入库）', async () => {
    const IMPORT_DRAFT_EMPTY = {
      title: '导入示例书',
      description: '世界观文本',
      outline: '卷一',
      characters: [],
      outlineTree: { volumes: [] },
      foreshadowings: [],
      outlineItems: [],
      chapterTitles: {},
      styleSection: '',
      importStyle: false,
      warnings: [],
    };
    const calls: Call[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url: String(url), init });
        if (url.endsWith('/api/settings-import/preview')) return jsonResponse(IMPORT_DRAFT_EMPTY);
        if (url.endsWith('/api/settings-import/apply')) {
          return jsonResponse({ bookId: 'b9', sourcePath: '', styleProfileId: null, warnings: [], counts: { characters: 0, volumes: 0, stages: 0, cards: 0, foreshadowings: 0 } }, 201);
        }
        if (url.endsWith('/outline-suggest') && init?.method === 'POST') return jsonResponse({ outline: OUTLINE_TWO, source: 'llm' });
        return jsonResponse({ error: 'unexpected' }, 404);
      }),
    );
    renderPage();

    fireEvent.change(screen.getByLabelText('设定集全文'), { target: { value: '# 《导入示例书》设定集' } });
    fireEvent.click(screen.getByRole('button', { name: '解析预览' }));
    await waitFor(() => screen.getByRole('button', { name: '确认导入建书' }));
    fireEvent.click(screen.getByRole('button', { name: '确认导入建书' }));

    await waitFor(() => expect(screen.getByText(/少年踏上旅途/)).toBeTruthy());
    const suggest = calls.find((c) => c.url.endsWith('/outline-suggest'));
    expect(suggest).toBeTruthy();
    expect(suggest!.url).toContain('/books/b9/');
    expect(JSON.parse(String((suggest!.init as RequestInit).body))).toEqual({ chapterCount: 8 });
  });
});
