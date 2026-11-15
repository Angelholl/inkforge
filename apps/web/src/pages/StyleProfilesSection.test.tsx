import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import StyleProfilesSection from './StyleProfilesSection';

const PROFILE = {
  id: 'sp1',
  name: '测试档案',
  version: 1,
  createdAt: '2026-11-13T08:00:00.000Z',
  metrics: { medianSentenceLen: 24 },
  sourcePath: 'inline:abcd1234',
};

const PROFILE2 = { ...PROFILE, id: 'sp2', name: '新档案' };

const DRAFT = {
  analysis: {
    dims: { 节奏: '短句为主', 对话: '三成', 描写: '', 情感基调: '', 写作特点: '', 特色词汇: '', 章节结构: '' },
    axes: { 叙述温度: 72, 语言密度: 55, 叙述者姿态: 0, 节奏: 60, 幽默: 0, 情绪表达: 40 },
    rules: ['平均句长 10-20 字', '对话占比 20%-40%'],
    terms: [
      { term: '青云剑诀', note: '核心功法' },
      { term: '临水城', note: '主城' },
    ],
  },
  samples: ['样本一', '样本二'],
};

function fetchFor(url: string, init?: RequestInit): Response {
  if (url.endsWith('/api/style-profiles') && (!init?.method || init.method === 'GET')) {
    return new Response(JSON.stringify(distilled ? [PROFILE, PROFILE2] : [PROFILE]), { status: 200 });
  }
  if (url.endsWith('/api/style-profiles/distill')) {
    distilled = true;
    return new Response(JSON.stringify({ draft: DRAFT }), { status: 200 });
  }
  if (url.endsWith('/api/style-profiles') && init?.method === 'POST') {
    return new Response(JSON.stringify({ profileId: 'sp2', version: 2 }), { status: 201 });
  }
  if (url.includes('/api/style-profiles/sp1/versions')) {
    return new Response(
      JSON.stringify([
        { id: 'sp1', name: '测试档案', version: 1, createdAt: '2026-11-13T08:00:00.000Z' },
        { id: 'sp1b', name: '测试档案', version: 2, createdAt: '2026-11-14T08:00:00.000Z', selfScore: 4 },
      ]),
      { status: 200 },
    );
  }
  return new Response('[]', { status: 200 });
}

let distilled = false;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function setInput(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

function renderSection() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <StyleProfilesSection />
    </QueryClientProvider>,
  );
}

describe('StyleProfilesSection 三态确认门', () => {
  it('蒸馏 → 预览编辑态（七维/六轴/规则可编辑，六轴越界钳制）且列表未变', async () => {
    distilled = false;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => fetchFor(url, init));
    vi.stubGlobal('fetch', fetchMock);
    renderSection();

    await waitFor(() => expect(screen.getByText('测试档案')).toBeTruthy());
    const styleList = within(screen.getByText('测试档案').closest('ul')!);
    expect(styleList.getAllByRole('listitem')).toHaveLength(1);

    fireEvent.change(screen.getByPlaceholderText('档案名称'), { target: { value: '新档案' } });
    fireEvent.change(screen.getByPlaceholderText(/粘贴风格样本/), { target: { value: 'x'.repeat(200) } });
    fireEvent.click(screen.getByRole('button', { name: '蒸馏' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/style-profiles/distill', expect.anything()));
    // 预览态：七维/六轴输入框在场且回显草稿值
    const dimInput = await waitFor(() => screen.getByLabelText('维度-节奏') as HTMLInputElement);
    expect(dimInput.value).toBe('短句为主');
    expect((screen.getByLabelText('轴-叙述温度') as HTMLInputElement).value).toBe('72');
    expect((screen.getByLabelText('规则编辑') as HTMLTextAreaElement).value).toContain('平均句长');
    // 编辑 + 越界钳制
    setInput(dimInput, '长句铺陈');
    const axisInput = screen.getByLabelText('轴-叙述温度') as HTMLInputElement;
    setInput(axisInput, '150');
    expect(axisInput.value).toBe('100');
    // 蒸馏后未入库：列表仍 1 行
    expect(styleList.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByRole('button', { name: '确认入库' })).toBeTruthy();
  });

  it('确认入库 → POST /api/style-profiles 且列表新增；放弃 → 回表单', async () => {
    distilled = false;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => fetchFor(url, init));
    vi.stubGlobal('fetch', fetchMock);
    renderSection();

    await waitFor(() => expect(screen.getByText('测试档案')).toBeTruthy());
    fireEvent.change(screen.getByPlaceholderText('档案名称'), { target: { value: '新档案' } });
    fireEvent.change(screen.getByPlaceholderText(/粘贴风格样本/), { target: { value: 'x'.repeat(200) } });
    fireEvent.click(screen.getByRole('button', { name: '蒸馏' }));
    await waitFor(() => expect(screen.getByLabelText('维度-节奏')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: '确认入库' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/style-profiles', expect.anything()));
    const createCall = fetchMock.mock.calls.find((c) => String(c[0]).endsWith('/api/style-profiles') && (c[1] as RequestInit).method === 'POST');
    const body = JSON.parse(String((createCall![1] as RequestInit).body));
    expect(body.name).toBe('新档案');
    expect(body.analysis.axes['叙述温度']).toBe(72);
    expect(body.samples).toEqual(['样本一', '样本二']);
    await waitFor(() => expect(screen.getByText('新档案')).toBeTruthy());
    expect(screen.getByText('档案已入库：新档案 v2')).toBeTruthy();
    // 回表单态
    expect(screen.getByPlaceholderText('档案名称')).toBeTruthy();
    expect(screen.queryByLabelText('维度-节奏')).toBeNull();

    // 放弃路径：再次蒸馏 → 放弃 → 回表单 + 草稿清空
    fireEvent.change(screen.getByPlaceholderText('档案名称'), { target: { value: '再蒸' } });
    fireEvent.change(screen.getByPlaceholderText(/粘贴风格样本/), { target: { value: 'y'.repeat(200) } });
    fireEvent.click(screen.getByRole('button', { name: '蒸馏' }));
    await waitFor(() => expect(screen.getByLabelText('维度-节奏')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '放弃' }));
    expect(screen.getByText('已放弃草稿')).toBeTruthy();
    expect(screen.queryByLabelText('维度-节奏')).toBeNull();
  });

  it('档案列表渲染版本与句长中位数', async () => {
    distilled = false;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => fetchFor(url, init)));
    renderSection();

    await waitFor(() => expect(screen.getByText('测试档案')).toBeTruthy());
    expect(screen.getByText(/v1 ·/)).toBeTruthy();
    expect(screen.getByText(/句长中位数 24/)).toBeTruthy();
  });

  it('版本展开：点击拉取同源版本列表并显示自评分，可收起', async () => {
    distilled = false;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => fetchFor(url, init));
    vi.stubGlobal('fetch', fetchMock);
    renderSection();

    await waitFor(() => expect(screen.getByText('测试档案')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '版本' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/style-profiles/sp1/versions', expect.anything()));
    await waitFor(() => expect(screen.getByText(/v2 · .* 自评 4\/5/)).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '收起版本' }));
    expect(screen.queryByText(/自评 4\/5/)).toBeNull();
  });

  it('术语表预览编辑：逐行「术语：说明」改写随 create 提交', async () => {
    distilled = false;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => fetchFor(url, init));
    vi.stubGlobal('fetch', fetchMock);
    renderSection();

    fireEvent.change(screen.getByPlaceholderText('档案名称'), { target: { value: '术语测' } });
    fireEvent.change(screen.getByPlaceholderText(/粘贴风格样本/), { target: { value: 'x'.repeat(200) } });
    fireEvent.click(screen.getByRole('button', { name: '蒸馏' }));
    const termsArea = (await waitFor(() => screen.getByLabelText('术语编辑'))) as HTMLTextAreaElement;
    expect(termsArea.value).toContain('青云剑诀：核心功法');

    setInput(termsArea, '青云剑诀：主角核心功法，首现全称\n临水城：主城禁写「临水市」');
    fireEvent.click(screen.getByRole('button', { name: '确认入库' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/style-profiles', expect.anything()));
    const body = JSON.parse(String((fetchMock.mock.calls.find((c) => String(c[0]).endsWith('/api/style-profiles') && (c[1] as RequestInit).method === 'POST')![1] as RequestInit).body));
    expect(body.analysis.terms).toEqual([
      { term: '青云剑诀', note: '主角核心功法，首现全称' },
      { term: '临水城', note: '主城禁写「临水市」' },
    ]);
  });

  it('文件导入 txt 灌入样本框', async () => {
    distilled = false;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => fetchFor(url, init)));
    renderSection();

    await waitFor(() => expect(screen.getByText('测试档案')).toBeTruthy());
    fireEvent.change(screen.getByLabelText('导入样本文件'), {
      target: { files: [new File(['文件样本正文'], 's.txt', { type: 'text/plain' })] },
    });
    await waitFor(() =>
      expect((screen.getByPlaceholderText(/粘贴风格样本/) as HTMLTextAreaElement).value).toBe('文件样本正文'),
    );
  });

  it('蒸馏失败（502/解析失败）显性暴露到消息行', async () => {
    distilled = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.endsWith('/api/style-profiles/distill')) {
          return new Response(JSON.stringify({ error: '文风分析失败：输出缺少 DIM/AXIS/RULES 行' }), { status: 502 });
        }
        return fetchFor(url, init);
      }),
    );
    renderSection();

    fireEvent.change(screen.getByPlaceholderText('档案名称'), { target: { value: '失败测' } });
    fireEvent.change(screen.getByPlaceholderText(/粘贴风格样本/), { target: { value: 'x'.repeat(200) } });
    fireEvent.click(screen.getByRole('button', { name: '蒸馏' }));
    await waitFor(() => expect(screen.getByText(/蒸馏失败：.*502/)).toBeTruthy());
    // 仍停留表单态可重试
    expect(screen.getByRole('button', { name: '蒸馏' })).toBeTruthy();
  });
});
