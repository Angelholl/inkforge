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
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/api/settings-import/preview')) {
        return new Response(JSON.stringify(DRAFT), { status: 200 });
      }
      if (url.endsWith('/api/settings-import/apply')) {
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
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/api/settings-import/preview')) {
        return new Response(JSON.stringify(DRAFT), { status: 200 });
      }
      if (url.endsWith('/api/settings-import/apply')) {
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
});
