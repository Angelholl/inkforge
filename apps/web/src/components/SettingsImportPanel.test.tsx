import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SettingsImportPanel, { type SettingsImportApplied } from './SettingsImportPanel';
import type { SettingsImportDraftDto } from '@inkforge/shared';

const DRAFT: SettingsImportDraftDto = {
  title: '导入示例书',
  description: '世界观文本',
  outline: '卷一 《起点》',
  characters: [{ name: '主角', baseSetting: '{"设定":"连锁业务员"}' }],
  outlineTree: {
    volumes: [
      {
        title: '卷一',
        body: '',
        seq: 0,
        stages: [{ title: '', body: '', seq: 0, cards: [{ title: '第一夜', body: '', seq: 0, chapterFrom: 1, chapterTo: 1 }] }],
      },
    ],
  },
  foreshadowings: [{ description: '对窗的一双眼睛', plantedCh: 1 }],
  outlineItems: [],
  chapterTitles: {},
  styleSection: '两种叙述声：丈夫腔与主角腔。',
  importStyle: true,
  warnings: [],
};

const APPLY_RESULT = {
  bookId: 'b9',
  sourcePath: 'data/imports/b9-settings.md',
  styleProfileId: 'sp1',
  warnings: [],
  counts: { characters: 1, volumes: 1, stages: 1, cards: 1, foreshadowings: 1 },
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('SettingsImportPanel', () => {
  it('选文件→解析→预览各区块→确认导入→onApplied 回传 bookId 与 counts', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/api/settings-import/preview') && init?.method === 'POST') {
        return new Response(JSON.stringify(DRAFT), { status: 200 });
      }
      if (url.endsWith('/api/settings-import/apply') && init?.method === 'POST') {
        return new Response(JSON.stringify(APPLY_RESULT), { status: 201 });
      }
      return new Response('[]', { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const onApplied = vi.fn<(a: SettingsImportApplied) => void>();
    render(<SettingsImportPanel onApplied={onApplied} />);

    // 选文件（FileReader 异步解码回显）
    const input = document.getElementById('settings-import-file') as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File(['# 《示例》设定集'], '设定集.md', { type: 'text/markdown' })] },
    });
    await waitFor(() => expect(screen.getByText(/已按 UTF-8 解码/)).toBeTruthy());

    // 解析预览
    fireEvent.click(screen.getByRole('button', { name: '解析预览' }));
    await waitFor(() => expect((screen.getByLabelText('书名') as HTMLInputElement).value).toBe('导入示例书'));
    expect(screen.getByText(/世界观（含规则）/)).toBeTruthy();
    expect((screen.getByLabelText('设定集人物姓名1') as HTMLInputElement).value).toBe('主角');
    expect((screen.getByLabelText('设定集人物设定1') as HTMLTextAreaElement).value).toBe('连锁业务员');
    expect(screen.getByText(/大纲树：1 卷/)).toBeTruthy();
    expect((screen.getByLabelText('设定集伏笔1') as HTMLInputElement).value).toBe('对窗的一双眼睛');
    const styleToggle = screen.getByLabelText('导入文风节为风格档案并绑定本书') as HTMLInputElement;
    expect(styleToggle.checked).toBe(true);

    // 确认导入建书
    fireEvent.click(screen.getByRole('button', { name: '确认导入建书' }));
    await waitFor(() => expect(onApplied).toHaveBeenCalledTimes(1));
    const applied = onApplied.mock.calls[0][0];
    expect(applied.result.bookId).toBe('b9');
    expect(applied.result.counts.foreshadowings).toBe(1);
    expect(applied.draft.title).toBe('导入示例书');
    const applyBody = JSON.parse(String(fetchMock.mock.calls[fetchMock.mock.calls.length - 1][1]?.body));
    expect(applyBody.draft.importStyle).toBe(true);
    expect(applyBody.draft.characters[0].baseSetting).toBe('{"设定":"连锁业务员"}');
  });

  it('取消文风勾选 → apply 入参 importStyle=false', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/api/settings-import/preview') && init?.method === 'POST') {
        return new Response(JSON.stringify(DRAFT), { status: 200 });
      }
      if (url.endsWith('/api/settings-import/apply') && init?.method === 'POST') {
        return new Response(JSON.stringify({ ...APPLY_RESULT, styleProfileId: null }), { status: 201 });
      }
      return new Response('[]', { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const onApplied = vi.fn<(a: SettingsImportApplied) => void>();
    render(<SettingsImportPanel onApplied={onApplied} />);

    fireEvent.change(screen.getByLabelText('设定集全文'), { target: { value: '# 《示例》设定集' } });
    fireEvent.click(screen.getByRole('button', { name: '解析预览' }));
    await waitFor(() => expect(screen.getByLabelText('导入文风节为风格档案并绑定本书')).toBeTruthy());
    fireEvent.click(screen.getByLabelText('导入文风节为风格档案并绑定本书'));
    expect((screen.getByLabelText('导入文风节为风格档案并绑定本书') as HTMLInputElement).checked).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: '确认导入建书' }));
    await waitFor(() => expect(onApplied).toHaveBeenCalledTimes(1));
    const applyBody = JSON.parse(String(fetchMock.mock.calls[fetchMock.mock.calls.length - 1][1]?.body));
    expect(applyBody.draft.importStyle).toBe(false);
  });

  it('文风步在途 → 确认按钮显示蒸馏进度文案，收口后复原（owner 2026-11-21 反馈）', async () => {
    let resolveApply!: (r: Response) => void;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/api/settings-import/preview') && init?.method === 'POST') {
        return new Response(JSON.stringify(DRAFT), { status: 200 });
      }
      if (url.endsWith('/api/settings-import/apply') && init?.method === 'POST') {
        return new Promise<Response>((res) => {
          resolveApply = res;
        });
      }
      return new Response('[]', { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const onApplied = vi.fn<(a: SettingsImportApplied) => void>();
    render(<SettingsImportPanel onApplied={onApplied} />);

    fireEvent.change(screen.getByLabelText('设定集全文'), { target: { value: '# 《示例》设定集' } });
    fireEvent.click(screen.getByRole('button', { name: '解析预览' }));
    await waitFor(() => expect(screen.getByLabelText('导入文风节为风格档案并绑定本书')).toBeTruthy());

    // importStyle=true + 文风节非空 → 慢路径：在途按钮=进度文案且禁用
    fireEvent.click(screen.getByRole('button', { name: '确认导入建书' }));
    const busyBtn = (await waitFor(() =>
      screen.getByRole('button', { name: '正在蒸馏文风档案…约需数分钟' }),
    )) as HTMLButtonElement;
    expect(busyBtn.disabled).toBe(true);

    // apply 返回 → 文案复原
    resolveApply(new Response(JSON.stringify(APPLY_RESULT), { status: 201 }));
    await waitFor(() => expect(onApplied).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: '确认导入建书' })).toBeTruthy();
  });

  it('preview 失败 → 错误文案呈现', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.endsWith('/api/settings-import/preview')) {
          return new Response('boom', { status: 500 });
        }
        return new Response('[]', { status: 200 });
      }),
    );
    render(<SettingsImportPanel onApplied={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('设定集全文'), { target: { value: '# 《示例》设定集' } });
    fireEvent.click(screen.getByRole('button', { name: '解析预览' }));
    await waitFor(() => expect(screen.getByText(/500/)).toBeTruthy());
    expect(screen.queryByLabelText('书名')).toBeNull();
  });

  it('勾选「启用书级落地策略」→ apply 请求体钉 landingMandate:{enabled:true,heavyEveryN:2}', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/api/settings-import/preview') && init?.method === 'POST') {
        return new Response(JSON.stringify(DRAFT), { status: 200 });
      }
      if (url.endsWith('/api/settings-import/apply') && init?.method === 'POST') {
        return new Response(JSON.stringify(APPLY_RESULT), { status: 201 });
      }
      return new Response('[]', { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<SettingsImportPanel onApplied={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('设定集全文'), { target: { value: '# 《示例》设定集' } });
    fireEvent.click(screen.getByRole('button', { name: '解析预览' }));
    const toggle = (await screen.findByLabelText('启用书级落地策略')) as HTMLInputElement;
    expect(toggle.checked).toBe(false);
    fireEvent.click(toggle);
    expect(toggle.checked).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: '确认导入建书' }));
    await waitFor(() =>
      expect(fetchMock.mock.calls.some((c) => String(c[0]).endsWith('/api/settings-import/apply'))).toBe(true),
    );
    const applyCall = fetchMock.mock.calls.find((c) => String(c[0]).endsWith('/api/settings-import/apply'))!;
    const applyBody = JSON.parse(String(applyCall[1]?.body));
    expect(applyBody.landingMandate).toEqual({ enabled: true, heavyEveryN: 2 });
  });

  it('默认不勾 → apply 请求体 landingMandate.enabled=false（N 固定 2）', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/api/settings-import/preview') && init?.method === 'POST') {
        return new Response(JSON.stringify(DRAFT), { status: 200 });
      }
      if (url.endsWith('/api/settings-import/apply') && init?.method === 'POST') {
        return new Response(JSON.stringify(APPLY_RESULT), { status: 201 });
      }
      return new Response('[]', { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<SettingsImportPanel onApplied={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('设定集全文'), { target: { value: '# 《示例》设定集' } });
    fireEvent.click(screen.getByRole('button', { name: '解析预览' }));
    const toggle = (await screen.findByLabelText('启用书级落地策略')) as HTMLInputElement;
    expect(toggle.checked).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: '确认导入建书' }));
    await waitFor(() =>
      expect(fetchMock.mock.calls.some((c) => String(c[0]).endsWith('/api/settings-import/apply'))).toBe(true),
    );
    const applyCall = fetchMock.mock.calls.find((c) => String(c[0]).endsWith('/api/settings-import/apply'))!;
    const applyBody = JSON.parse(String(applyCall[1]?.body));
    expect(applyBody.landingMandate).toEqual({ enabled: false, heavyEveryN: 2 });
  });

  it('preview 后点 AI 精炼 → description 被替换、title/characters/outlineTree 逐字不变', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/api/settings-import/preview') && init?.method === 'POST') {
        return new Response(JSON.stringify(DRAFT), { status: 200 });
      }
      if (url.endsWith('/api/settings-import/refine') && init?.method === 'POST') {
        return new Response(JSON.stringify({ description: '精炼正文', truncated: false }), { status: 200 });
      }
      if (url.endsWith('/api/settings-import/apply') && init?.method === 'POST') {
        return new Response(JSON.stringify(APPLY_RESULT), { status: 201 });
      }
      return new Response('[]', { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const onApplied = vi.fn<(a: SettingsImportApplied) => void>();
    render(<SettingsImportPanel onApplied={onApplied} />);

    fireEvent.change(screen.getByLabelText('设定集全文'), { target: { value: '# 《示例》设定集' } });
    fireEvent.click(screen.getByRole('button', { name: '解析预览' }));
    await waitFor(() =>
      expect((document.getElementById('settings-import-description') as HTMLTextAreaElement).value).toBe('世界观文本'),
    );

    fireEvent.click(screen.getByRole('button', { name: 'AI 精炼' }));
    await waitFor(() =>
      expect((document.getElementById('settings-import-description') as HTMLTextAreaElement).value).toBe('精炼正文'),
    );

    // 其余 draft 字段逐字不变
    expect((document.getElementById('settings-import-title') as HTMLInputElement).value).toBe('导入示例书');
    expect((document.getElementById('settings-import-outline') as HTMLTextAreaElement).value).toBe('卷一 《起点》');
    expect((screen.getByLabelText('设定集人物姓名1') as HTMLInputElement).value).toBe('主角');
    expect((screen.getByLabelText('设定集人物设定1') as HTMLTextAreaElement).value).toBe('连锁业务员');
    expect(screen.getByText(/大纲树：1 卷/)).toBeTruthy();

    const refineCall = fetchMock.mock.calls.find((c) => String(c[0]).endsWith('/api/settings-import/refine'))!;
    expect(JSON.parse(String(refineCall[1]?.body))).toEqual({ content: '世界观文本' });

    // apply 整包回传用户编辑后的 draft + 原始 content
    fireEvent.click(screen.getByRole('button', { name: '确认导入建书' }));
    await waitFor(() => expect(onApplied).toHaveBeenCalledTimes(1));
    const applyCall = fetchMock.mock.calls.find((c) => String(c[0]).endsWith('/api/settings-import/apply'))!;
    const applyBody = JSON.parse(String(applyCall[1]?.body));
    expect(applyBody.content).toBe('# 《示例》设定集');
    expect(applyBody.draft.description).toBe('精炼正文');
    expect(applyBody.draft.title).toBe('导入示例书');
    expect(applyBody.draft.outline).toBe('卷一 《起点》');
    expect(applyBody.draft.characters).toEqual(DRAFT.characters);
    expect(applyBody.draft.outlineTree).toEqual(DRAFT.outlineTree);
  });

  it('精炼在途按钮 aria-busy 不可点、失败文案呈现（延迟 mock）', async () => {
    // 分块 provider 场景钉值：40475 字输入 + 65536 窗（小窗走 map-reduce）→ 4 map + 1 reduce = 5 次调用，各带延迟
    const RAW_CHARS = 40475;
    const MAP_CHUNK_MAX_CHARS = 10666;
    const TOTAL_CALLS = Math.ceil(RAW_CHARS / MAP_CHUNK_MAX_CHARS) + 1;
    const RAW = 'x'.repeat(RAW_CHARS);
    let chunkCalls = 0;
    let seenContent = '';
    let resolveRefine!: (r: Response) => void;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/api/settings-import/preview') && init?.method === 'POST') {
        return new Response(JSON.stringify({ ...DRAFT, description: RAW }), { status: 200 });
      }
      if (url.endsWith('/api/settings-import/refine') && init?.method === 'POST') {
        seenContent = JSON.parse(String(init?.body)).content;
        for (let i = 0; i < TOTAL_CALLS; i++) {
          await new Promise((res) => setTimeout(res, 5));
          chunkCalls++;
        }
        return new Promise<Response>((res) => {
          resolveRefine = res;
        });
      }
      return new Response('[]', { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<SettingsImportPanel onApplied={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('设定集全文'), { target: { value: '# 《示例》设定集' } });
    fireEvent.click(screen.getByRole('button', { name: '解析预览' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'AI 精炼' })).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'AI 精炼' }));

    const busyBtn = (await waitFor(() => screen.getByRole('button', { name: '精炼中…' }))) as HTMLButtonElement;
    expect(busyBtn.getAttribute('aria-busy')).toBe('true');
    expect(busyBtn.disabled).toBe(true);
    await waitFor(() => expect(chunkCalls).toBe(TOTAL_CALLS));
    expect(seenContent).toBe(RAW);
    // 5 次调用逐段返回期间，整段在途文案恒定、按钮恒禁用
    for (let i = 0; i < TOTAL_CALLS; i++) {
      const b = screen.getByRole('button', { name: '精炼中…' }) as HTMLButtonElement;
      expect(b.getAttribute('aria-busy')).toBe('true');
      expect(b.disabled).toBe(true);
    }

    // 全部调用返回后才解除 → 失败文案落既有 error 状态
    resolveRefine(new Response('boom', { status: 500 }));
    await waitFor(() => expect(screen.getByText(/500/)).toBeTruthy());
    expect(screen.getByRole('button', { name: 'AI 精炼' })).toBeTruthy();
  });

  it('truncated=true → 提示文本出现且 apply 仍可用', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.endsWith('/api/settings-import/preview') && init?.method === 'POST') {
          return new Response(JSON.stringify(DRAFT), { status: 200 });
        }
        if (url.endsWith('/api/settings-import/refine') && init?.method === 'POST') {
          return new Response(JSON.stringify({ description: '精炼正文', truncated: true }), { status: 200 });
        }
        if (url.endsWith('/api/settings-import/apply') && init?.method === 'POST') {
          return new Response(JSON.stringify(APPLY_RESULT), { status: 201 });
        }
        return new Response('[]', { status: 200 });
      }),
    );
    const onApplied = vi.fn<(a: SettingsImportApplied) => void>();
    render(<SettingsImportPanel onApplied={onApplied} />);

    fireEvent.change(screen.getByLabelText('设定集全文'), { target: { value: '# 《示例》设定集' } });
    fireEvent.click(screen.getByRole('button', { name: '解析预览' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'AI 精炼' })).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'AI 精炼' }));
    await waitFor(() => expect(screen.getByText(/截断/)).toBeTruthy());
    expect((document.getElementById('settings-import-description') as HTMLTextAreaElement).value).toBe('精炼正文');

    // 提示不阻断导入
    const applyBtn = screen.getByRole('button', { name: '确认导入建书' }) as HTMLButtonElement;
    expect(applyBtn.disabled).toBe(false);
    fireEvent.click(applyBtn);
    await waitFor(() => expect(onApplied).toHaveBeenCalledTimes(1));
  });
});
