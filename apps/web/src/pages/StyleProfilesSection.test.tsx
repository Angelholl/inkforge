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

const BOOK_B1 = { id: 'b1', title: '样本之书', description: '', outline: '', createdAt: '', updatedAt: '' };
const BOOK_B2 = { id: 'b2', title: '长篇之书', description: '', outline: '', createdAt: '', updatedAt: '' };
const B1_CHAPTERS = [
  { chapterNo: 1, title: '章标题1', currentVersionId: 'ver-old' },
  { chapterNo: 2, title: '章标题2' },
];
const B2_CHAPTERS = Array.from({ length: 21 }, (_, i) => ({ chapterNo: i + 1, title: `章标题${i + 1}` }));

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
  // DELETE 分支必须在其它 style-profiles 分支之前：只匹配「/api/style-profiles/<id>」这一形状
  const del = /^\/api\/style-profiles\/([^/]+)$/.exec(url);
  if (del && init?.method === 'DELETE') {
    if (deleteOverride) return new Response(JSON.stringify(deleteOverride.body), { status: deleteOverride.status });
    if (!deletedIds.includes(del[1])) deletedIds = [...deletedIds, del[1]];
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }
  if (url.endsWith('/api/style-profiles') && (!init?.method || init.method === 'GET')) {
    const all = distilled ? [PROFILE, PROFILE2] : [PROFILE];
    return new Response(JSON.stringify(all.filter((p) => !deletedIds.includes(p.id))), { status: 200 });
  }
  if (url.endsWith('/api/style-profiles/distill')) {
    distilled = true;
    // B5 后台化：POST 只领 jobId（202），进度走 GET job 轮询
    return new Response(JSON.stringify({ jobId: 'job-1' }), { status: 202 });
  }
  if (url.includes('/api/style-profiles/jobs/')) {
    jobPollCount += 1;
    const status = jobStub === 'failed' ? 'failed' : jobStub === 'running-then-done' && jobPollCount === 1 ? 'running' : 'done';
    const done = status === 'done';
    return new Response(
      JSON.stringify({
        id: 'job-1',
        status,
        progress: done ? 100 : 30,
        stage: done || status === 'failed' ? '' : 'analyzing',
        error: status === 'failed' ? JOB_ERROR : null,
        result: done ? { ...DRAFT, sourceText: 'x'.repeat(200) } : null,
      }),
      { status: 200 },
    );
  }
  if (/\/api\/style-profiles\/sp\d+\/redistill$/.test(url) && init?.method === 'POST') {
    return new Response(JSON.stringify({ jobId: 'job-1' }), { status: 202 });
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
  if (url.endsWith('/api/books') && (!init?.method || init.method === 'GET')) {
    return new Response(JSON.stringify([BOOK_B1, BOOK_B2]), { status: 200 });
  }
  if (url.endsWith('/api/books/b1')) {
    return new Response(JSON.stringify({ ...BOOK_B1, chapters: B1_CHAPTERS, runs: [] }), { status: 200 });
  }
  if (url.endsWith('/api/books/b2')) {
    return new Response(JSON.stringify({ ...BOOK_B2, chapters: B2_CHAPTERS, runs: [] }), { status: 200 });
  }
  if (url.includes('/api/books/b1/chapters/1/versions')) {
    // B2 列表瘦身：信封 + 列表项不带 content
    return new Response(
      JSON.stringify({
        currentVersionId: 'ver-old',
        versions: [
          { id: 'ver-new', kind: 'draft', wordCount: 5, params: {}, styleSampleIds: [], createdAt: '2026-11-16T10:00:00.000Z' },
          { id: 'ver-old', kind: 'original', wordCount: 5, params: {}, styleSampleIds: [], createdAt: '2026-11-16T09:00:00.000Z' },
        ],
      }),
      { status: 200 },
    );
  }
  if (url.includes('/api/books/b1/chapters/2/versions')) {
    return new Response(
      JSON.stringify({ currentVersionId: 'v2a', versions: [{ id: 'v2a', kind: 'original', wordCount: 5, params: {}, styleSampleIds: [], createdAt: '2026-11-16T10:00:00.000Z' }] }),
      { status: 200 },
    );
  }
  if (url.includes('/api/books/b2/chapters/') && url.includes('/versions')) {
    const no = Number(url.match(/chapters\/(\d+)\/versions/)![1]);
    return new Response(
      JSON.stringify({ currentVersionId: `v-${no}`, versions: [{ id: `v-${no}`, kind: 'original', wordCount: 5, params: {}, styleSampleIds: [], createdAt: '2026-11-16T10:00:00.000Z' }] }),
      { status: 200 },
    );
  }
  if (url.includes('/api/versions/')) {
    const id = url.split('/').pop() as string;
    const m = /^v-(\d+)$/.exec(id);
    const content = id === 'ver-new' ? '新版正文一' : id === 'ver-old' ? '旧版正文一' : id === 'v2a' ? '唯一正文二' : `正文${m ? m[1] : id}`;
    return new Response(JSON.stringify({ id, chapterId: 'c', kind: 'original', content, wordCount: 5, params: {}, styleSampleIds: [], createdAt: '2026-11-16T10:00:00.000Z' }), { status: 200 });
  }
  return new Response('[]', { status: 200 });
}

let distilled = false;
// 档案删除桩状态（各用例首行自行重置，沿 distilled 的既有习惯）
let deletedIds: string[] = [];
let deleteOverride: { status: number; body: unknown } | null = null;
// B5 蒸馏 job 轮询桩：'done'（首查即成，现有蒸馏路径用例的默认）| 'failed' | 'running-then-done'（首查 running、次查起 done）
let jobStub: 'done' | 'failed' | 'running-then-done' = 'done';
let jobPollCount = 0;
const JOB_ERROR = '文风分析失败：输出缺少 DIM/AXIS/RULES 行';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  jobStub = 'done';
  jobPollCount = 0;
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

  it('选书带章：current 版本判定、空章跳过与分隔行拼接', async () => {
    distilled = false;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => fetchFor(url, init));
    vi.stubGlobal('fetch', fetchMock);
    renderSection();

    await waitFor(() => expect(screen.getByText('测试档案')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '从书架选书' }));
    fireEvent.change(await waitFor(() => screen.getByLabelText('选择书籍')), { target: { value: 'b1' } });
    const ch1 = await waitFor(() => screen.getByLabelText('选择第1章 章标题1') as HTMLInputElement);
    fireEvent.click(ch1);
    fireEvent.click(screen.getByLabelText('选择第2章 章标题2'));
    fireEvent.click(screen.getByRole('button', { name: '导入所选 2 章' }));

    const area = screen.getByPlaceholderText(/粘贴风格样本/) as HTMLTextAreaElement;
    await waitFor(() =>
      expect(area.value).toBe('【第1章 章标题1】\n旧版正文一\n\n【第2章 章标题2】\n唯一正文二'),
    );
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/api/books/b1/chapters/1/versions'))).toBe(true);
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/api/books/b1/chapters/2/versions'))).toBe(true);
  });

  it('20 章上限：达 20 后禁选并提示', async () => {
    distilled = false;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => fetchFor(url, init)));
    renderSection();

    await waitFor(() => expect(screen.getByText('测试档案')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '从书架选书' }));
    fireEvent.change(await waitFor(() => screen.getByLabelText('选择书籍')), { target: { value: 'b2' } });
    for (let n = 1; n <= 20; n++) {
      fireEvent.click(await waitFor(() => screen.getByLabelText(`选择第${n}章 章标题${n}`)));
    }
    expect((screen.getByLabelText('选择第21章 章标题21') as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText('最多可选 20 章（对齐采样基准）')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '导入所选 20 章' }));

    const area = screen.getByPlaceholderText(/粘贴风格样本/) as HTMLTextAreaElement;
    await waitFor(() => expect((area.value.match(/【第\d+章 /g) ?? []).length).toBe(20));
    expect(area.value).not.toContain('第21章');
  });

  it('高级项随蒸馏提交、留空不传键', async () => {
    distilled = false;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => fetchFor(url, init));
    vi.stubGlobal('fetch', fetchMock);
    renderSection();

    await waitFor(() => expect(screen.getByText('测试档案')).toBeTruthy());
    fireEvent.change(screen.getByPlaceholderText('档案名称'), { target: { value: '高级测' } });
    fireEvent.change(screen.getByPlaceholderText(/粘贴风格样本/), { target: { value: 'x'.repeat(200) } });
    fireEvent.change(screen.getByLabelText('采样段数（4-20，留空默认）'), { target: { value: '7' } });
    fireEvent.change(screen.getByLabelText('采样温度（0-1，留空默认）'), { target: { value: '0.5' } });
    fireEvent.click(screen.getByRole('button', { name: '蒸馏' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/style-profiles/distill', expect.anything()));
    const distillCall = fetchMock.mock.calls.find((c) => String(c[0]).endsWith('/api/style-profiles/distill'))!;
    const body = JSON.parse(String((distillCall[1] as RequestInit).body));
    expect(body.maxSegments).toBe(7);
    expect(body.temperature).toBe(0.5);

    // 清空后重蒸：不传键
    distilled = false;
    fireEvent.click(screen.getByRole('button', { name: '放弃' }));
    fireEvent.change(screen.getByPlaceholderText('档案名称'), { target: { value: '高级测2' } });
    fireEvent.change(screen.getByLabelText('采样段数（4-20，留空默认）'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('采样温度（0-1，留空默认）'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: '蒸馏' }));
    await waitFor(() => expect(screen.getByText('蒸馏完成（草稿未入库），可编辑后点「确认入库」')).toBeTruthy());
    const calls = fetchMock.mock.calls.filter((c) => String(c[0]).endsWith('/api/style-profiles/distill'));
    const body2 = JSON.parse(String((calls[calls.length - 1][1] as RequestInit).body));
    expect(body2).not.toHaveProperty('maxSegments');
    expect(body2).not.toHaveProperty('temperature');
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

  it('蒸馏后台化：POST 得 jobId 轮询至 done（先 running 后终态），预览出现且进度可见', async () => {
    distilled = false;
    jobStub = 'running-then-done';
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => fetchFor(url, init));
    vi.stubGlobal('fetch', fetchMock);
    renderSection();

    await waitFor(() => expect(screen.getByText('测试档案')).toBeTruthy());
    fireEvent.change(screen.getByPlaceholderText('档案名称'), { target: { value: '后台测' } });
    fireEvent.change(screen.getByPlaceholderText(/粘贴风格样本/), { target: { value: 'x'.repeat(200) } });
    fireEvent.click(screen.getByRole('button', { name: '蒸馏' }));

    // POST 只领 jobId（202），不再直接回 draft
    await waitFor(() =>
      expect(fetchMock.mock.calls.some((c) => String(c[0]).endsWith('/api/style-profiles/distill'))).toBe(true),
    );
    // 首查立即执行：running 态展示里程碑进度
    expect(await screen.findByText(/蒸馏中（30%）· 分析中/)).toBeTruthy();
    // 第二次轮询（间隔 2s）转 done → 预览态
    expect(await screen.findByText('蒸馏完成（草稿未入库），可编辑后点「确认入库」', {}, { timeout: 4000 })).toBeTruthy();
    expect(screen.getByLabelText('维度-节奏')).toBeTruthy();
    expect(fetchMock.mock.calls.filter((c) => String(c[0]).includes('/api/style-profiles/jobs/')).length).toBeGreaterThanOrEqual(2);
  });

  it('蒸馏后台化：job failed → 显性暴露失败原因，停留表单态可重试', async () => {
    distilled = false;
    jobStub = 'failed';
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => fetchFor(url, init)));
    renderSection();

    fireEvent.change(screen.getByPlaceholderText('档案名称'), { target: { value: '败测' } });
    fireEvent.change(screen.getByPlaceholderText(/粘贴风格样本/), { target: { value: 'x'.repeat(200) } });
    fireEvent.click(screen.getByRole('button', { name: '蒸馏' }));

    expect(await screen.findByText(`蒸馏失败：${JOB_ERROR}`)).toBeTruthy();
    expect(screen.queryByLabelText('维度-节奏')).toBeNull();
    expect(screen.getByRole('button', { name: '蒸馏' })).toBeTruthy();
  });

  it('重新蒸馏：档案行点击发 POST redistill 且按钮进入 loading，done 后按档案名+回灌原文入库', async () => {
    distilled = false;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => fetchFor(url, init));
    vi.stubGlobal('fetch', fetchMock);
    renderSection();

    await waitFor(() => expect(screen.getByText('测试档案')).toBeTruthy());
    const row = screen.getByText('测试档案').closest('li')!;
    const btn = within(row).getByRole('button', { name: '重新蒸馏' });
    fireEvent.click(btn);
    // 点击同步置 busy：按钮进入 loading（aria-busy）且禁用
    expect(btn.getAttribute('aria-busy')).toBe('true');
    expect((btn as HTMLButtonElement).disabled).toBe(true);

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          (c) => String(c[0]).endsWith('/api/style-profiles/sp1/redistill') && (c[1] as RequestInit).method === 'POST',
        ),
      ).toBe(true),
    );
    // done 后直接进预览；入库 body 用档案名与 job result.sourceText 回灌的原文
    expect(await screen.findByText('蒸馏完成（草稿未入库），可编辑后点「确认入库」')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '确认入库' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/style-profiles', expect.anything()));
    const body = JSON.parse(
      String(
        (fetchMock.mock.calls.find((c) => String(c[0]).endsWith('/api/style-profiles') && (c[1] as RequestInit).method === 'POST')![1] as RequestInit)
          .body,
      ),
    );
    expect(body.name).toBe('测试档案');
    expect(body.text).toBe('x'.repeat(200));
  });

  it('档案行删除：L2 确认簇 → 发 DELETE → 该行消失', async () => {
    distilled = false;
    deletedIds = [];
    deleteOverride = null;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => fetchFor(url, init));
    vi.stubGlobal('fetch', fetchMock);
    renderSection();

    await waitFor(() => expect(screen.getByText('测试档案')).toBeTruthy());
    // 同页嵌了 ImitationProfilesSection，它也自带「删除/确认删除」→ 必须限定在本档案行作用域
    const row = screen.getByText('测试档案').closest('li')!;
    fireEvent.click(within(row).getByRole('button', { name: '删除' }));
    expect(within(row).getByText(/仍被书绑定的档案不可删/)).toBeTruthy();
    fireEvent.click(within(row).getByRole('button', { name: '确认删除' }));

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          (c) => (c[1] as RequestInit | undefined)?.method === 'DELETE' && String(c[0]).endsWith('/api/style-profiles/sp1'),
        ),
      ).toBe(true),
    );
    await waitFor(() => expect(screen.queryByText('测试档案')).toBeNull());
    expect(await screen.findByText('档案已删除')).toBeTruthy();
  });

  it('档案删除被 409 拒时展示绑定书列表文案，且行不消失（绝不静默解绑）', async () => {
    distilled = false;
    deletedIds = [];
    deleteOverride = {
      status: 409,
      body: { error: '该风格档案已被书绑定，请先解绑再删除', books: [{ id: 'b1', title: '样本之书' }] },
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => fetchFor(url, init)),
    );
    renderSection();

    await waitFor(() => expect(screen.getByText('测试档案')).toBeTruthy());
    const row = screen.getByText('测试档案').closest('li')!;
    fireEvent.click(within(row).getByRole('button', { name: '删除' }));
    fireEvent.click(within(row).getByRole('button', { name: '确认删除' }));

    expect(await screen.findByText('无法删除，已被绑定：样本之书')).toBeTruthy();
    expect(screen.getByText('测试档案')).toBeTruthy(); // 拒删：档案行仍在
    deleteOverride = null;
  });
});
